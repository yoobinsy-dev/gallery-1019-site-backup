(function initializeStudentCreditLedgerV2Commands(root) {
  'use strict';

  const CUTOVER_DATE = '2026-07-26';

  function confirmOpeningBalance(existing, openingBalance, confirmedAt) {
    const parsed = Number(openingBalance);
    if (!Number.isInteger(parsed)) throw new TypeError('Opening balance must be a signed integer.');
    return {
      version: 2,
      openingDate: CUTOVER_DATE,
      openingBalance: parsed,
      openingConfirmed: true,
      openingConfirmedAt: String(confirmedAt || new Date().toISOString()),
      adjustments: Array.isArray(existing?.adjustments) ? existing.adjustments.slice() : []
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

  const api = Object.freeze({ CUTOVER_DATE, addAdjustment, confirmOpeningBalance });
  root.StudentCreditLedgerV2Commands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);