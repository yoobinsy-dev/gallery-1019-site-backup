const test = require('node:test');
const assert = require('node:assert/strict');

const { cloneCalendarEvents } = require('../fixtures/calendar');
const { exposeIifeFunctions } = require('../helpers/load-source');
const personalWorkCycles = require('../../personal-work/cycles');
const legacyCycles = require('../fixtures/personal-work-cycles-legacy');

function loadPersonalWork() {
  return exposeIifeFunctions('pottery-personal-work.js', [
    'state',
    'collectPersonalWorkUsageRows',
    'getCycleUsageHours',
    'getCurrentCycleRange',
    'getElapsedCycleCount',
    'getEffectivePaymentDates',
    'isPaymentRequired',
    'normalizePaymentHistory',
    'roundHour'
  ], { globals: { PersonalWorkCycles: personalWorkCycles } }).exposed;
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

test('personal work characterizes cycle boundaries before, on, and after renewal', () => {
  const personal = loadPersonalWork();
  assert.deepEqual(JSON.parse(JSON.stringify(personal.getCurrentCycleRange('2026-08-31', '2026-08-01'))), {
    start: '2026-08-31', end: '2026-09-30'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(personal.getCurrentCycleRange('2026-01-31', '2026-02-28'))), {
    start: '2026-02-28', end: '2026-03-28'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(personal.getCurrentCycleRange('', '2026-08-15'))), {
    start: '2026-08-15', end: '2026-09-15'
  });
  assert.equal(personal.getElapsedCycleCount('2026-08-31', '2026-08-30'), 0);
  assert.equal(personal.getElapsedCycleCount('2026-08-31', '2026-08-31'), 1);
  assert.equal(personal.getElapsedCycleCount('2026-01-31', '2026-03-28'), 3);
  assert.equal(personal.getElapsedCycleCount('', '2026-08-15'), 0);
});

test('personal work characterizes free, current, overdue, legacy, and malformed payment status', () => {
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-08-15T12:00:00']));
    }

    static now() {
      return new Date('2026-08-15T12:00:00').getTime();
    }
  }

  const personal = exposeIifeFunctions('pottery-personal-work.js', [
    'isPaymentRequired',
    'getEffectivePaymentDates',
    'normalizePaymentHistory'
  ], { globals: { Date: FixedDate, PersonalWorkCycles: personalWorkCycles } }).exposed;

  assert.equal(personal.isPaymentRequired({ startDate: '2026-06-15', monthlyFee: 0 }), false);
  assert.equal(personal.isPaymentRequired({
    startDate: '2026-07-15', monthlyFee: 100000,
    paymentHistory: ['2026-07-15', '2026-08-15']
  }), false);
  assert.equal(personal.isPaymentRequired({
    startDate: '2026-06-15', monthlyFee: 100000,
    paymentHistory: ['2026-06-15', '2026-07-15']
  }), true);
  assert.equal(personal.isPaymentRequired({
    startDate: '2026-09-01', monthlyFee: 100000,
    paymentHistory: []
  }), false);
  assert.equal(personal.isPaymentRequired({
    startDate: 'legacy-invalid', monthlyFee: 100000,
    paymentHistory: ['2026-08-01']
  }), false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(personal.normalizePaymentHistory([
      '2026-07-01', 'invalid', null, '2026-07-01', ' 2026-08-01 '
    ]))),
    ['2026-08-01', '2026-07-01']
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(personal.getEffectivePaymentDates({
      paymentHistory: 'legacy-not-array',
      lastPaymentDate: '2026-08-02'
    }))),
    ['2026-08-02']
  );
});

test('personal work characterizes exact and exceeded usage allowance arithmetic', () => {
  const personal = loadPersonalWork();
  personal.state.calendarEvents = [
    { kind: '개인작업', title: 'Usage Artist', date: '2026-08-01', start: '10:00', end: '12:00' },
    { kind: '강사 지도 하 개인작업', title: 'Usage Artist', date: '2026-08-02', start: '10:00', end: '13:00' }
  ];
  const exactUsage = personal.getCycleUsageHours('Usage Artist', '2026-08-01', '2026-08-02');
  const exceededUsage = personal.getCycleUsageHours('Usage Artist', '2026-08-01', '2026-09-01');
  assert.equal(exactUsage, 2);
  assert.equal(Math.max(0, personal.roundHour(2 - exactUsage)), 0);
  assert.equal(exceededUsage, 5);
  assert.equal(Math.max(0, personal.roundHour(4.5 - exceededUsage)), 0);
});

test('extracted personal work cycles match the retained legacy calculations exactly', () => {
  const asOfDates = ['2026-01-01', '2026-02-28', '2026-03-28', '2026-08-15'];
  const anchors = ['', 'legacy-invalid', '2026-01-31', '2026-08-15', '2026-09-01'];
  for (const asOfDate of asOfDates) {
    for (const anchor of anchors) {
      assert.deepEqual(
        personalWorkCycles.getCurrentCycleRange(anchor, asOfDate),
        legacyCycles.getCurrentCycleRange(anchor, asOfDate)
      );
      assert.equal(
        personalWorkCycles.getElapsedCycleCount(anchor, asOfDate),
        legacyCycles.getElapsedCycleCount(anchor, asOfDate)
      );
    }
  }

  const entries = [
    { startDate: '2026-06-15', monthlyFee: 0, paymentHistory: [] },
    { startDate: '2026-07-15', monthlyFee: 100000, paymentHistory: ['2026-07-15', '2026-08-15'] },
    { startDate: '2026-06-15', monthlyFee: 100000, paymentHistory: ['invalid', '2026-06-15'], lastPaymentDate: '2026-07-15' },
    { startDate: 'legacy-invalid', monthlyFee: 'malformed', paymentHistory: 'legacy-not-array', lastPaymentDate: '2026-08-01' },
    {}
  ];
  for (const entry of entries) {
    assert.deepEqual(
      personalWorkCycles.getEffectivePaymentDates(entry),
      legacyCycles.getEffectivePaymentDates(entry)
    );
    assert.equal(
      personalWorkCycles.isPaymentRequired({ entry, asOfDate: '2026-08-15' }),
      legacyCycles.isPaymentRequired({ entry, asOfDate: '2026-08-15' })
    );
  }

  const usageCases = [
    { usageRows: [], maxHours: 100 },
    { usageRows: [{ durationHours: 1.25 }, { durationHours: 2.26 }], maxHours: 3.5 },
    { usageRows: [{ durationHours: 'invalid' }, {}, { durationHours: -1 }], maxHours: 'malformed' },
    { usageRows: null, maxHours: undefined }
  ];
  for (const usageCase of usageCases) {
    assert.deepEqual(
      personalWorkCycles.calculateUsageSummary(usageCase),
      legacyCycles.calculateUsageSummary(usageCase)
    );
  }
});

test('personal work row projection preserves active and dormant display decisions', () => {
  const active = personalWorkCycles.buildRowProjection({
    entry: {
      startDate: '2026-07-15', maxHours: 3, monthlyFee: 100000,
      lastPaymentDate: '2026-07-15', paymentHistory: ['2026-07-15']
    },
    isDormant: false,
    usageRows: [{ durationHours: 2 }],
    asOfDate: '2026-08-15',
    formatFee: (value) => `${Number(value).toLocaleString('en-US')}원`,
    formatHours: String
  });
  assert.deepEqual(active, {
    cycle: { start: '2026-08-15', end: '2026-09-15' },
    usageHours: 2,
    remainingHours: 1,
    needsPayment: true,
    periodText: '2026-08-15 ~ 2026-09-15',
    feeText: '100,000원',
    paymentText: '2026-07-15',
    usageText: '2시간',
    remainingText: '1시간',
    remainingIsLow: true
  });

  const dormant = personalWorkCycles.buildRowProjection({
    entry: {
      dormantCycleStart: '2026-07-01', dormantCycleEnd: '2026-08-01',
      maxHours: 20, monthlyFee: 0, lastPaymentDate: '2026-07-01'
    },
    isDormant: true,
    usageRows: [{ durationHours: 3 }],
    asOfDate: '2026-08-15',
    formatFee: () => '',
    formatHours: String
  });
  assert.deepEqual(dormant, {
    cycle: { start: '2026-07-01', end: '2026-08-01' },
    usageHours: 3,
    remainingHours: 17,
    needsPayment: false,
    periodText: '2026-07-01 ~ 2026-08-01',
    feeText: '-',
    paymentText: '',
    usageText: '3시간',
    remainingText: '17시간',
    remainingIsLow: false
  });
});