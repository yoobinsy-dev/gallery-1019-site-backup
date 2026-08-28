const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const dateTime = require('../../master-calendar/date-time');
const occurrences = require('../../master-calendar/occurrences');

function loadCalendar() {
  return exposeIifeFunctions('pottery-master-calendar.js', [
    'slotToTime', 'timeToSlot', 'getWeekStart', 'getMonthStart', 'addDays', 'addMonths', 'formatDateInput',
    'getDayIndexFromDateString', 'getEventsForDate', 'state', 'isExhibitionKind'
  ], { globals: {
    MasterCalendarDateTime: dateTime,
    MasterCalendarOccurrences: occurrences
  } }).exposed;
}

test('calendar characterizes slot conversion and clamping', () => {
  const calendar = loadCalendar();
  assert.equal(calendar.slotToTime(0), '00:00');
  assert.equal(calendar.slotToTime(21), '10:30');
  assert.equal(calendar.slotToTime(48), '24:00');
  assert.equal(calendar.slotToTime(99), '24:00');
  assert.equal(calendar.timeToSlot('10:45'), 21);
  assert.equal(calendar.timeToSlot('invalid'), 0);
  assert.equal(calendar.timeToSlot('25:00'), 48);
});

test('calendar characterizes Monday week boundaries and month-end addition', () => {
  const calendar = loadCalendar();
  assert.equal(calendar.formatDateInput(calendar.getWeekStart(new Date('2026-08-30T12:00:00'))), '2026-08-24');
  assert.equal(calendar.formatDateInput(calendar.getWeekStart(new Date('2026-08-31T12:00:00'))), '2026-08-31');
  assert.equal(calendar.formatDateInput(calendar.addMonths(new Date('2024-01-31T12:00:00'), 1)), '2024-02-01');
});

test('calendar characterizes date and slot malformed and boundary behavior', () => {
  const calendar = loadCalendar();
  assert.equal(calendar.slotToTime(-1), '00:00');
  assert.equal(calendar.slotToTime(1.5), '00:45');
  assert.equal(calendar.slotToTime('bad'), 'NaN:NaN');
  assert.equal(calendar.timeToSlot('00:29'), 0);
  assert.equal(calendar.timeToSlot('24:00'), 48);
  assert.equal(calendar.timeToSlot('-01:00'), 0);
  assert.equal(calendar.timeToSlot('10:xx'), 0);

  assert.equal(calendar.formatDateInput(calendar.getMonthStart(new Date('2026-12-31T23:59:59'))), '2026-12-01');
  assert.equal(calendar.formatDateInput(calendar.addDays(new Date('2026-12-31T12:00:00'), 1)), '2027-01-01');
  assert.equal(calendar.formatDateInput(calendar.addMonths(new Date('2024-12-31T12:00:00'), 2)), '2025-02-01');
  assert.equal(calendar.getDayIndexFromDateString('2026-08-31'), 0);
  assert.equal(calendar.getDayIndexFromDateString('2026-08-30'), 6);
  assert.equal(calendar.getDayIndexFromDateString('invalid'), -1);
});

test('canonical calendar occurrences preserve weekly boundaries, skips, ranges, ordering, and inputs', () => {
  const events = [{
    id: 'weekly', date: '2026-07-27', start: '10:00', repeatWeekly: true,
    repeatEndDate: '2026-08-31', repeatSkipDates: ['2026-08-10']
  }, {
    id: 'single', date: '2026-08-15', start: '09:00'
  }, {
    id: 'range', kind: '전시', date: '2026-08-30', endDate: '2026-09-02'
  }, {
    id: 'malformed-end', date: '2026-08-03', repeatWeekly: true, repeatEndDate: 'invalid'
  }, null];
  const original = JSON.parse(JSON.stringify(events));
  const expanded = occurrences.expandOccurrences({
    events,
    rangeStart: '2026-08-01',
    rangeEnd: '2026-08-31',
    includeRangeEvents: true,
    isRangeEvent: (event) => event.kind === '전시'
  });
  assert.deepEqual(expanded.map(({ event, date }) => [event.id, date]), [
    ['weekly', '2026-08-03'], ['weekly', '2026-08-17'], ['weekly', '2026-08-24'], ['weekly', '2026-08-31'],
    ['single', '2026-08-15'], ['range', '2026-08-30'], ['range', '2026-08-31'],
    ['malformed-end', '2026-08-03'], ['malformed-end', '2026-08-10'], ['malformed-end', '2026-08-17'],
    ['malformed-end', '2026-08-24'], ['malformed-end', '2026-08-31']
  ]);
  assert.deepEqual(events, original);
  assert.deepEqual(occurrences.getEventsForDate({
    events,
    date: '2026-08-10',
    invalidRepeatEnd: 'exclude'
  }).map((event) => event.id), []);
  assert.deepEqual(occurrences.expandOccurrences({ events, rangeStart: 'invalid', rangeEnd: '2026-08-01' }), []);
});

test('canonical date query matches the retained Master Calendar recurrence implementation', () => {
  const calendar = loadCalendar();
  calendar.state.events = [{
    id: 'weekly', kind: '수강', date: '2026-08-03', repeatWeekly: true,
    repeatEndDate: '2026-08-31', repeatSkipDates: ['2026-08-10']
  }, {
    id: 'malformed-end', kind: '개인작업', date: '2026-08-04', repeatWeekly: true,
    repeatEndDate: 'invalid'
  }, {
    id: 'single', kind: '기타', date: '2026-08-15'
  }, {
    id: 'exhibition', kind: '전시', date: '2026-08-20', endDate: '2026-08-22'
  }];

  ['2026-08-02', '2026-08-03', '2026-08-10', '2026-08-15', '2026-08-20', '2026-08-22', '2026-08-31', '2026-09-01']
    .forEach((date) => {
      const legacyIds = calendar.getEventsForDate(date).map((event) => event.id);
      const canonicalIds = occurrences.getEventsForDate({
        events: calendar.state.events,
        date,
        includeRangeEvents: true,
        isRangeEvent: (event) => calendar.isExhibitionKind(event.kind)
      }).map((event) => event.id);
      assert.deepEqual(canonicalIds, legacyIds, date);
    });
});