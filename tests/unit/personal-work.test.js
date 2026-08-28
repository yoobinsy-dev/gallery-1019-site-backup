const test = require('node:test');
const assert = require('node:assert/strict');

const { cloneCalendarEvents } = require('../fixtures/calendar');
const { exposeIifeFunctions } = require('../helpers/load-source');

function loadPersonalWork() {
  return exposeIifeFunctions('pottery-personal-work.js', [
    'state',
    'collectPersonalWorkUsageRows',
    'getCycleUsageHours',
    'getCurrentCycleRange',
    'getElapsedCycleCount',
    'getEffectivePaymentDates'
  ]).exposed;
}

test('personal work characterizes month-end cycles, invalid legacy anchors, and payment history', () => {
  const personal = loadPersonalWork();
  assert.deepEqual(JSON.parse(JSON.stringify(personal.getCurrentCycleRange('2026-01-31', '2026-03-15'))), {
    start: '2026-02-28', end: '2026-03-28'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(personal.getCurrentCycleRange('legacy-invalid', '2026-08-28'))), {
    start: '2026-08-28', end: '2026-09-28'
  });
  assert.equal(personal.getElapsedCycleCount('2026-06-30', '2026-08-01'), 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(personal.getEffectivePaymentDates({
      paymentHistory: ['2026-07-01', 'invalid', '2026-07-01'], lastPaymentDate: '2026-08-01'
    }))),
    ['2026-08-01', '2026-07-01']
  );
});

test('personal work characterizes calendar-derived usage, cancelled weekly occurrence, and overnight minimum slot', () => {
  const personal = loadPersonalWork();
  personal.state.calendarEvents = cloneCalendarEvents();
  const rows = personal.collectPersonalWorkUsageRows('CHARACTERIZATION_TEST_ARTIST', {
    pastOnly: true, from: '2026-07-01', to: '2026-09-01'
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.map((row) => [row.date, row.durationHours]))),
    [['2026-08-17', 1.5], ['2026-08-03', 1.5], ['2026-07-31', 0.5]]
  );
  assert.equal(personal.getCycleUsageHours('CHARACTERIZATION_TEST_ARTIST', '2026-07-01', '2026-09-01'), 3.5);
});