const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');

function loadCalendar() {
  return exposeIifeFunctions('studio.js', [
    'slotToTime', 'timeToSlot', 'getWeekStart', 'getMonthStart', 'addDays', 'addMonths', 'formatDateInput'
  ]).exposed;
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