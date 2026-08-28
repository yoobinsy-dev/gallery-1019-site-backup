(function initializeMasterCalendarDateTime(root) {
  'use strict';

  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;

  function getWeekStart(date) {
    const base = new Date(date);
    const day = base.getDay();
    const delta = day === 0 ? -6 : 1 - day;
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + delta);
    return base;
  }

  function getMonthStart(date) {
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    base.setDate(1);
    return base;
  }

  function addDays(date, diff) {
    const next = new Date(date);
    next.setDate(next.getDate() + diff);
    return next;
  }

  function addMonths(date, diff) {
    const current = new Date(date);
    const day = current.getDate();
    current.setDate(1);
    current.setMonth(current.getMonth() + diff);
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    current.setDate(Math.min(day, lastDay));
    return getMonthStart(current);
  }

  function slotToTime(slot) {
    const bounded = Math.max(0, Math.min(SLOTS_PER_DAY, slot));
    const hour = Math.floor((bounded * SLOT_MINUTES) / 60);
    const minute = (bounded * SLOT_MINUTES) % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function timeToSlot(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(SLOTS_PER_DAY, Math.floor((h * 60 + m) / SLOT_MINUTES)));
  }

  function formatDateInput(date) {
    const normalized = new Date(date);
    return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`;
  }

  function getDayIndexFromDateString(date) {
    const normalized = new Date(`${date}T00:00:00`);
    if (Number.isNaN(normalized.getTime())) return -1;
    const jsDay = normalized.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  const api = Object.freeze({
    addDays,
    addMonths,
    formatDateInput,
    getDayIndexFromDateString,
    getMonthStart,
    getWeekStart,
    slotToTime,
    timeToSlot
  });
  root.MasterCalendarDateTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);