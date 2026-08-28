(function initializeMasterCalendarOccurrences(root) {
  'use strict';

  function expandOccurrences(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const rangeStart = parseDate(options?.rangeStart);
    const rangeEnd = parseDate(options?.rangeEnd);
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return [];

    const occurrences = [];
    events.forEach((event) => {
      if (!event || typeof event !== 'object' || !event.date) return;
      if (options?.includeRangeEvents && typeof options?.isRangeEvent === 'function' && options.isRangeEvent(event)) {
        const eventStart = parseDate(event.date);
        const eventEnd = parseDate(event.endDate || event.date);
        if (!eventStart || !eventEnd) return;
        let cursor = new Date(eventStart > rangeStart ? eventStart : rangeStart);
        const last = eventEnd < rangeEnd ? eventEnd : rangeEnd;
        while (cursor <= last) {
          occurrences.push({ event, date: formatDate(cursor) });
          cursor = addDays(cursor, 1);
        }
        return;
      }

      const baseDate = parseDate(event.date);
      if (!baseDate) return;
      if (!event.repeatWeekly) {
        if (baseDate >= rangeStart && baseDate <= rangeEnd) {
          occurrences.push({ event, date: formatDate(baseDate) });
        }
        return;
      }

      let repeatEnd = null;
      if (event.repeatEndDate) {
        repeatEnd = parseDate(event.repeatEndDate);
        if (!repeatEnd && options?.invalidRepeatEnd === 'exclude') return;
      }
      const last = repeatEnd && repeatEnd < rangeEnd ? repeatEnd : rangeEnd;
      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      let cursor = new Date(baseDate);
      while (cursor < rangeStart) cursor = addDays(cursor, 7);
      while (cursor <= last) {
        const date = formatDate(cursor);
        if (!skipDates.includes(date)) occurrences.push({ event, date });
        cursor = addDays(cursor, 7);
      }
    });
    return occurrences;
  }

  function getEventsForDate(options) {
    return expandOccurrences({
      ...options,
      rangeStart: options?.date,
      rangeEnd: options?.date
    }).map((occurrence) => occurrence.event);
  }

  function parseDate(value) {
    const date = new Date(`${String(value || '').trim()}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = Object.freeze({ expandOccurrences, getEventsForDate });
  root.MasterCalendarOccurrences = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);