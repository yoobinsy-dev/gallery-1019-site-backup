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

  function buildPaymentEvents(paymentRecords, openingDate = CUTOVER_DATE, paymentDates = []) {
    const events = [];
    const issues = [];
    const seen = new Set();

    (Array.isArray(paymentRecords) ? paymentRecords : []).forEach((record) => {
      const date = String(record?.date || '').trim();
      if (!date || date < openingDate) return;
      const credits = Number(record?.credits);
      const eventId = getStableSourceId('payment', record, [date, record?.basis, record?.tuition, record?.credits]);
      if (seen.has(eventId)) return;
      seen.add(eventId);
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
    getStableSourceId
  });
  root.StudentCreditLedgerV2EventSources = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);