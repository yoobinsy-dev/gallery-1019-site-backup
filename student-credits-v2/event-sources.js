(function initializeStudentCreditLedgerV2EventSources(root) {
  'use strict';

  const CUTOVER_DATE = '2026-07-26';

  function stablePart(value) {
    return encodeURIComponent(String(value ?? '').trim());
  }

  function getStableSourceId(prefix, source, fallbackParts) {
    const nativeId = String(source?.sourceId || source?.id || '').trim();
    if (nativeId) return `${prefix}:${stablePart(nativeId)}`;
    return `${prefix}:${fallbackParts.map(stablePart).join(':')}`;
  }

  function getPaymentSourceRef(record) {
    return getStableSourceId('payment', record, [record?.date, record?.basis, record?.tuition, record?.credits]);
  }

  function isTrustedPayment(record, paymentAuthorityStartAt) {
    const authorityStart = String(paymentAuthorityStartAt || '').trim();
    const createdAt = String(record?.createdAt || '').trim();
    return Boolean(authorityStart && createdAt && createdAt > authorityStart);
  }

  function getLegacyPaymentSetups(paymentRecords, openingDate = CUTOVER_DATE, options = {}) {
    const overrides = new Map();
    (Array.isArray(options.legacyPaymentOverrides) ? options.legacyPaymentOverrides : []).forEach((override) => {
      const sourcePaymentRef = String(override?.sourcePaymentRef || '').trim();
      if (sourcePaymentRef && !overrides.has(sourcePaymentRef)) overrides.set(sourcePaymentRef, override);
    });
    const seen = new Set();
    const setups = [];
    (Array.isArray(paymentRecords) ? paymentRecords : []).forEach((record) => {
      const date = String(record?.date || '').trim();
      if (!date || date < openingDate || isTrustedPayment(record, options.paymentAuthorityStartAt)) return;
      const sourcePaymentRef = getPaymentSourceRef(record);
      if (seen.has(sourcePaymentRef)) return;
      seen.add(sourcePaymentRef);
      const override = overrides.get(sourcePaymentRef);
      setups.push({
        sourcePaymentRef,
        date,
        existingCredits: Number.isInteger(Number(record?.credits)) ? Number(record.credits) : null,
        confirmed: override?.confirmed === true,
        ignored: override?.confirmed === true && override?.ignored === true,
        credits: override?.confirmed === true && override?.ignored !== true && Number.isInteger(Number(override?.credits))
          ? Number(override.credits)
          : null,
        note: String(override?.note || '').trim()
      });
    });
    return setups;
  }

  function buildPaymentEvents(paymentRecords, openingDate = CUTOVER_DATE, paymentDates = [], options = {}) {
    const events = [];
    const issues = [];
    const seen = new Set();
    const legacySetups = new Map(getLegacyPaymentSetups(paymentRecords, openingDate, options)
      .map((setup) => [setup.sourcePaymentRef, setup]));

    (Array.isArray(paymentRecords) ? paymentRecords : []).forEach((record) => {
      const date = String(record?.date || '').trim();
      if (!date || date < openingDate) return;
      const eventId = getPaymentSourceRef(record);
      if (seen.has(eventId)) return;
      seen.add(eventId);
      const legacySetup = legacySetups.get(eventId);
      if (legacySetup) {
        if (!legacySetup.confirmed) {
          issues.push({ type: 'legacy-payment-unconfirmed', sourceId: eventId, date, existingCredits: legacySetup.existingCredits });
          return;
        }
        if (legacySetup.ignored) return;
        if (!Number.isInteger(legacySetup.credits) || legacySetup.credits < 0) {
          issues.push({ type: 'invalid-legacy-payment-override', sourceId: eventId, date });
          return;
        }
        events.push({
          eventId,
          date,
          type: 'payment',
          delta: legacySetup.credits,
          sourceId: String(record?.id || '').trim() || null,
          label: `결제 ${legacySetup.credits}회`
        });
        return;
      }
      const credits = Number(record?.credits);
      if (!Number.isInteger(credits) || credits < 0) {
        issues.push({ type: 'payment-credits-missing', sourceId: eventId, date });
        return;
      }
      events.push({
        eventId,
        date,
        type: 'payment',
        delta: credits,
        sourceId: String(record?.id || '').trim() || null,
        label: `결제 ${credits}회`
      });
    });

    const recordedDates = new Set((Array.isArray(paymentRecords) ? paymentRecords : []).map((record) => String(record?.date || '').trim()));
    (Array.isArray(paymentDates) ? paymentDates : []).forEach((value) => {
      const date = String(value || '').trim();
      if (date >= openingDate && !recordedDates.has(date)) {
        issues.push({ type: 'payment-record-missing', sourceId: null, date });
      }
    });

    return { events, issues };
  }

  function buildClassEvents(classRecords, openingDate = CUTOVER_DATE) {
    const events = [];
    const seen = new Set();

    (Array.isArray(classRecords) ? classRecords : []).forEach((record) => {
      const date = String(record?.date || '').trim();
      if (!date || date < openingDate) return;
      const eventId = getStableSourceId('class', record, [date, record?.start, record?.end, record?.kind, record?.classType]);
      if (seen.has(eventId)) return;
      seen.add(eventId);
      events.push({
        eventId,
        date,
        type: 'class',
        delta: -1,
        sourceId: String(record?.id || record?.sourceId || '').trim() || null,
        label: '수업'
      });
    });

    return events;
  }

  const api = Object.freeze({
    CUTOVER_DATE,
    buildClassEvents,
    buildPaymentEvents,
    getLegacyPaymentSetups,
    getPaymentSourceRef,
    getStableSourceId
  });
  root.StudentCreditLedgerV2EventSources = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);