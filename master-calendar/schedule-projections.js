(function initializeMasterCalendarScheduleProjections(root) {
  'use strict';

  const SLOT_MINUTES = 30;

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDaysStandard(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function timeToSlotStandard(value) {
    const parts = String(value || '').split(':').map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return 0;
    return Math.max(0, Math.min(48, Math.floor(((parts[0] * 60) + parts[1]) / SLOT_MINUTES)));
  }

  function addMonthKeepDay(date, diff) {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + diff);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate, deps = {}) {
    const formatDateInput = deps.formatDateInput || formatDate;
    const addMonth = deps.addMonthKeepDay || addMonthKeepDay;
    const anchor = new Date(`${String(startDateStr || '').trim()}T00:00:00`);
    const ref = referenceDate instanceof Date ? new Date(referenceDate) : new Date();

    if (Number.isNaN(anchor.getTime())) {
      const fallbackStart = new Date(ref);
      fallbackStart.setHours(0, 0, 0, 0);
      return {
        start: formatDateInput(fallbackStart),
        end: formatDateInput(addMonth(fallbackStart, 1))
      };
    }

    let cycleStart = new Date(anchor);
    let cycleEnd = addMonth(cycleStart, 1);
    while (ref >= cycleEnd) {
      cycleStart = cycleEnd;
      cycleEnd = addMonth(cycleStart, 1);
    }

    return {
      start: formatDateInput(cycleStart),
      end: formatDateInput(cycleEnd)
    };
  }

  function getPersonalWorkUsageHoursForCycle(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const now = options?.now instanceof Date ? new Date(options.now) : new Date();
    const formatDateInput = options?.formatDateInput || formatDate;
    const addDays = options?.addDays || addDaysStandard;
    const timeToSlot = options?.timeToSlot || timeToSlotStandard;
    const expandOccurrences = options?.expandOccurrences;
    const slotMinutes = Number(options?.slotMinutes ?? SLOT_MINUTES);
    const from = new Date(`${String(options?.cycleStart || '').trim()}T00:00:00`);
    const to = new Date(`${String(options?.cycleEnd || '').trim()}T00:00:00`);
    const todayKey = formatDateInput(now);
    const targetName = String(options?.userName || '').trim();
    const personalKinds = new Set(['개인작업', '강사 지도 하 개인작업']);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !targetName) return 0;

    let total = 0;
    const addOccurrence = (eventItem, dateKey) => {
      const startAt = new Date(`${dateKey}T${String(eventItem?.start || '00:00')}:00`);
      if (Number.isNaN(startAt.getTime())) return;

      const startSlot = timeToSlot(eventItem?.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem?.end));
      const endAt = new Date(new Date(`${dateKey}T00:00:00`).getTime() + (endSlot * slotMinutes * 60 * 1000));
      if (Number.isNaN(endAt.getTime())) return;
      const occurrenceKey = formatDateInput(new Date(`${dateKey}T00:00:00`));
      if (endAt > now && occurrenceKey !== todayKey) return;
      if (startAt < from || startAt >= to) return;

      total += ((endSlot - startSlot) * slotMinutes) / 60;
    };

    const personalEvents = events.filter((eventItem) => {
      const kind = String(eventItem?.kind || '').trim();
      return eventItem
        && personalKinds.has(kind)
        && String(eventItem.title || '').trim() === targetName;
    });
    expandOccurrences({
      events: personalEvents,
      rangeStart: formatDateInput(from),
      rangeEnd: formatDateInput(addDays(to, -1)),
      invalidRepeatEnd: 'ignore',
      maxWeeklyIterations: 520
    }).forEach((occurrence) => {
      const repeatEnd = occurrence.event.repeatEndDate
        ? new Date(`${occurrence.event.repeatEndDate}T00:00:00`)
        : null;
      if (occurrence.event.repeatWeekly && repeatEnd && !Number.isNaN(repeatEnd.getTime())) {
        const occurrenceDate = new Date(`${occurrence.date}T00:00:00`);
        if (occurrenceDate >= repeatEnd) return;
      }
      addOccurrence(occurrence.event, occurrence.date);
    });

    return Math.round(total * 10) / 10;
  }

  function buildClassTeachingLog(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const today = options?.now instanceof Date ? new Date(options.now) : new Date();
    const formatDateInput = options?.formatDateInput || formatDate;
    const addDays = options?.addDays || addDaysStandard;
    const expandOccurrences = options?.expandOccurrences;
    const getEventClassMetadataForDate = options?.getEventClassMetadataForDate;
    today.setHours(0, 0, 0, 0);
    const horizon = addDays(today, 365);

    const records = [];
    const seenKeys = new Set();

    const pushOccurrence = (eventItem, occurrenceDate) => {
      const meta = getEventClassMetadataForDate(eventItem, occurrenceDate);
      const key = `${String(eventItem.id || '')}|${occurrenceDate}|${String(eventItem.start || '')}|${String(eventItem.end || '')}|${String(eventItem.title || '')}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      records.push({
        key,
        eventId: String(eventItem.id || ''),
        date: occurrenceDate,
        start: String(eventItem.start || ''),
        end: String(eventItem.end || ''),
        studentName: String(eventItem.title || '').trim(),
        classType: meta.classType,
        instructor: meta.instructor,
        baseRuleId: meta.baseRuleId,
        repeatWeekly: Boolean(eventItem.repeatWeekly)
      });
    };

    const classEvents = events.filter((eventItem) => {
      return eventItem && String(eventItem.kind || '') === '수강';
    });
    const rangeStart = classEvents.reduce((earliest, eventItem) => {
      const startDate = new Date(`${String(eventItem.date || '')}T00:00:00`);
      if (Number.isNaN(startDate.getTime())) return earliest;
      return !earliest || startDate < earliest ? startDate : earliest;
    }, null);
    if (rangeStart) {
      expandOccurrences({
        events: classEvents,
        rangeStart: formatDateInput(rangeStart),
        rangeEnd: formatDateInput(horizon),
        invalidRepeatEnd: 'ignore',
        maxWeeklyIterations: 500
      }).forEach((occurrence) => pushOccurrence(occurrence.event, occurrence.date));
    }

    records.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      const startCompare = String(a.start || '').localeCompare(String(b.start || ''));
      if (startCompare !== 0) return startCompare;
      return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ko');
    });

    return records;
  }

  const api = Object.freeze({
    addMonthKeepDay,
    getPersonalWorkCycleRangeForDate,
    getPersonalWorkUsageHoursForCycle,
    buildClassTeachingLog
  });
  root.MasterCalendarScheduleProjections = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);