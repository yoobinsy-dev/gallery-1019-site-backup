(function initializeStudentCreditLedgerV2Commands(root) {
  'use strict';

  const CUTOVER_DATE = '2026-07-26';

  function createActivation(activatedAt) {
    const boundary = String(activatedAt || new Date().toISOString()).trim();
    if (!Number.isFinite(new Date(boundary).getTime())) {
      throw new TypeError('Activation requires a valid timestamp.');
    }
    return {
      version: 2,
      activated: true,
      activatedAt: boundary,
      paymentAuthorityStartAt: boundary
    };
  }

  function initializeActivatedStudentLedger(activation, createdAt) {
    if (activation?.version !== 2 || activation?.activated !== true) {
      throw new TypeError('Student Credit Ledger V2 must be activated first.');
    }
    const timestamp = String(createdAt || new Date().toISOString()).trim();
    if (!Number.isFinite(new Date(timestamp).getTime()) || timestamp <= activation.paymentAuthorityStartAt) {
      throw new TypeError('New student initialization must occur after activation.');
    }
    return {
      version: 2,
      openingDate: timestamp.slice(0, 10),
      openingBalance: 0,
      openingConfirmed: true,
      openingConfirmedAt: timestamp,
      initializedAfterActivation: true,
      adjustments: [],
      legacyPaymentOverrides: []
    };
  }

  function confirmOpeningBalance(existing, openingBalance, confirmedAt) {
    const parsed = Number(openingBalance);
    if (!Number.isInteger(parsed)) throw new TypeError('Opening balance must be a signed integer.');
    return {
      version: 2,
      openingDate: CUTOVER_DATE,
      openingBalance: parsed,
      openingConfirmed: true,
      openingConfirmedAt: String(confirmedAt || new Date().toISOString()),
      adjustments: Array.isArray(existing?.adjustments) ? existing.adjustments.slice() : [],
      legacyPaymentOverrides: Array.isArray(existing?.legacyPaymentOverrides) ? existing.legacyPaymentOverrides.slice() : []
    };
  }

  function confirmLegacyPayment(existing, input) {
    const sourcePaymentRef = String(input?.sourcePaymentRef || '').trim();
    const ignored = input?.ignored === true;
    const credits = Number(input?.credits);
    const note = String(input?.note || '').trim();
    if (!sourcePaymentRef || (!ignored && (!Number.isInteger(credits) || credits < 0))) {
      throw new TypeError('Legacy payment requires a stable source reference and non-negative integer credits, or must be ignored.');
    }
    const legacyPaymentOverrides = (Array.isArray(existing?.legacyPaymentOverrides) ? existing.legacyPaymentOverrides : [])
      .filter((override) => String(override?.sourcePaymentRef || '') !== sourcePaymentRef);
    legacyPaymentOverrides.push({
      sourcePaymentRef,
      credits: ignored ? null : credits,
      confirmed: true,
      ignored,
      note,
      confirmedAt: String(input?.confirmedAt || new Date().toISOString())
    });
    return {
      ...(existing && typeof existing === 'object' ? existing : {}),
      version: 2,
      openingDate: CUTOVER_DATE,
      openingConfirmed: existing?.openingConfirmed === true,
      adjustments: Array.isArray(existing?.adjustments) ? existing.adjustments.slice() : [],
      legacyPaymentOverrides
    };
  }

  function addAdjustment(existing, input) {
    if (existing?.version !== 2 || existing?.openingConfirmed !== true) {
      throw new TypeError('Opening balance must be confirmed first.');
    }
    const id = String(input?.id || '').trim();
    const date = String(input?.date || '').trim();
    const delta = Number(input?.delta);
    const reason = String(input?.reason || '').trim();
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < CUTOVER_DATE || !Number.isInteger(delta) || delta === 0 || !reason) {
      throw new TypeError('Adjustment requires an ID, date, non-zero signed integer delta, and reason.');
    }
    const adjustments = Array.isArray(existing.adjustments) ? existing.adjustments.slice() : [];
    if (adjustments.some((adjustment) => String(adjustment?.id || '') === id)) {
      throw new TypeError('Adjustment ID must be unique.');
    }
    adjustments.push({
      id,
      date,
      delta,
      reason,
      createdAt: String(input?.createdAt || new Date().toISOString())
    });
    return { ...existing, adjustments };
  }

  const api = Object.freeze({
    CUTOVER_DATE,
    addAdjustment,
    confirmLegacyPayment,
    confirmOpeningBalance,
    createActivation,
    initializeActivatedStudentLedger
  });
  root.StudentCreditLedgerV2Commands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);