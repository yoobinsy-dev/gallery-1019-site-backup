(function initializeStudentCreditLedgerV2Projection(root) {
  'use strict';

  const eventSources = root.StudentCreditLedgerV2EventSources
    || (typeof require === 'function' ? require('./event-sources') : null);
  const CUTOVER_DATE = eventSources.CUTOVER_DATE;
  const TYPE_ORDER = Object.freeze({ opening: 0, payment: 1, adjustment: 2, class: 3 });

  function isMonthlyStudent(student) {
    return String(student?.tuitionBasis || '').trim() === '월초';
  }

  function normalizeAdjustments(adjustments, openingDate) {
    const events = [];
    const issues = [];
    const seen = new Set();
    (Array.isArray(adjustments) ? adjustments : []).forEach((adjustment) => {
      const id = String(adjustment?.id || '').trim();
      const date = String(adjustment?.date || '').trim();
      const delta = Number(adjustment?.delta);
      if (!id || !date || date < openingDate || !Number.isInteger(delta) || delta === 0) {
        issues.push({ type: 'invalid-adjustment', sourceId: id || null, date: date || null });
        return;
      }
      const eventId = `adjustment:${encodeURIComponent(id)}`;
      if (seen.has(eventId)) return;
      seen.add(eventId);
      events.push({
        eventId,
        date,
        type: 'adjustment',
        delta,
        sourceId: id,
        label: String(adjustment?.reason || '').trim() || '수동 조정',
        createdAt: String(adjustment?.createdAt || '').trim()
      });
    });
    return { events, issues };
  }

  function sortEvents(events) {
    return events.sort((left, right) => (
      String(left.date).localeCompare(String(right.date))
      || TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
      || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      || String(left.eventId).localeCompare(String(right.eventId))
    ));
  }

  function projectStudentCreditLedgerV2({ student, paymentRecords, paymentDates, classRecords }) {
    if (isMonthlyStudent(student)) {
      return {
        isApplicable: false,
        isReady: false,
        openingBalance: null,
        currentBalance: null,
        events: [],
        issues: []
      };
    }

    const ledger = student?.creditLedgerV2;
    const openingDate = String(ledger?.openingDate || CUTOVER_DATE).trim();
    const openingBalance = Number(ledger?.openingBalance);
    const openingConfirmed = ledger?.version === 2
      && ledger?.openingConfirmed === true
      && openingDate === CUTOVER_DATE
      && Number.isInteger(openingBalance);
    if (!openingConfirmed) {
      return {
        isApplicable: true,
        isReady: false,
        openingBalance: null,
        currentBalance: null,
        events: [],
        issues: [{ type: 'opening-not-confirmed' }]
      };
    }

    const paymentResult = eventSources.buildPaymentEvents(paymentRecords, openingDate, paymentDates);
    const adjustmentResult = normalizeAdjustments(ledger.adjustments, openingDate);
    const events = sortEvents([{
      eventId: `opening:${openingDate}`,
      date: openingDate,
      type: 'opening',
      delta: openingBalance,
      sourceId: null,
      label: '기초 잔액'
    }, ...paymentResult.events, ...adjustmentResult.events, ...eventSources.buildClassEvents(classRecords, openingDate)]);
    let runningBalance = 0;
    const projectedEvents = events.map((event) => {
      runningBalance += event.delta;
      return Object.freeze({ ...event, runningBalance });
    });
    const issues = [...paymentResult.issues, ...adjustmentResult.issues];

    return {
      isApplicable: true,
      isReady: issues.length === 0,
      openingBalance,
      currentBalance: runningBalance,
      events: projectedEvents,
      issues
    };
  }

  const api = Object.freeze({ CUTOVER_DATE, isMonthlyStudent, projectStudentCreditLedgerV2 });
  root.StudentCreditLedgerV2 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);