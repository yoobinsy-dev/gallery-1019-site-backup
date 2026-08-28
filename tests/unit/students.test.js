const test = require('node:test');
const assert = require('node:assert/strict');

const { cloneCalendarEvents } = require('../fixtures/calendar');
const { exposeIifeFunctions } = require('../helpers/load-source');
const paymentCredits = require('../../students/payment-credits');
const calendarOccurrences = require('../../master-calendar/occurrences');
const {
  buildPaymentClassGroupsLegacy,
  computeCarryOverForNewPaymentCycleLegacy,
  getRemainingClassCountLegacy,
  normalizePaymentRecordsLegacy
} = require('../fixtures/student-payment-credits-legacy');

const RealDate = Date;
const FIXED_NOW = new RealDate('2026-08-15T12:00:00').getTime();

class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length > 0 ? args : [FIXED_NOW]));
  }

  static now() {
    return FIXED_NOW;
  }
}

function loadStudents() {
  return exposeIifeFunctions('pottery-students.js', [
    'state',
    'getStudentClassStats',
    'getCompletedClassCountSince',
    'getRemainingClassCount',
    'computeCarryOverForNewPaymentCycle',
    'buildPaymentClassGroups',
    'normalizePaymentRecords',
    'getStudentPaymentHistory',
    'getStudentPaymentCycleSize',
    'getManualUsedAdjustment',
    'isValidDateString',
    'basisToCount',
    'isMonthlyStartBasis',
    'getVisibleStudents',
    'canManageStudent'
  ], { globals: {
    Date: FixedDate,
    MasterCalendarOccurrences: calendarOccurrences,
    StudentPaymentCredits: paymentCredits
  } }).exposed;
}

test('students characterize single/weekly attendance, cancellation, ordering, and boundary dates', () => {
  const students = loadStudents();
  students.state.calendar.events = cloneCalendarEvents();
  assert.deepEqual(JSON.parse(JSON.stringify(students.getStudentClassStats('CHARACTERIZATION_TEST_STUDENT'))), {
    completedCount: 5,
    mostRecentClassDate: '2026-08-03'
  });
  assert.equal(students.getCompletedClassCountSince('CHARACTERIZATION_TEST_STUDENT', '2026-07-20'), 2);
  assert.deepEqual(JSON.parse(JSON.stringify(students.getStudentClassStats('missing'))), {
    completedCount: 0,
    mostRecentClassDate: ''
  });
});

test('students characterize carry-over, manual adjustments, payment cycles, and no-history shape', () => {
  const students = loadStudents();
  students.state.calendar.events = cloneCalendarEvents();
  assert.equal(students.getRemainingClassCount({ paymentCycleCredits: 4, carryOverBeforePayment: 1 }, 2), 3);
  assert.equal(students.getRemainingClassCount({ tuitionBasis: '4회', manualUsedAdjustment: 2 }, 1), 1);
  assert.equal(
    students.computeCarryOverForNewPaymentCycle(
      { name: 'CHARACTERIZATION_TEST_STUDENT' }, '2026-06-01', '2026-07-01', -1
    ),
    0
  );

  const grouped = students.buildPaymentClassGroups(
    { tuitionBasis: '2회', paymentHistory: [] },
    ['2026-07-01', '2026-08-01'],
    [
      { date: '2026-07-01', start: '10:00' },
      { date: '2026-07-06', start: '14:00' },
      { date: '2026-08-03', start: '14:00' }
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(grouped.groups.map((group) => [group.paymentDate, group.classRecords.length]))),
    [['2026-08-01', 1], ['2026-07-01', 2]]
  );
  assert.deepEqual(JSON.parse(JSON.stringify(grouped.unassigned)), []);
});

test('student credits characterize empty, fallback, excess, and manual adjustment semantics', () => {
  const students = loadStudents();
  assert.equal(students.getRemainingClassCount({}, 0), 0);
  assert.equal(students.getRemainingClassCount({ tuitionBasis: '4회' }, 0), 4);
  assert.equal(students.getRemainingClassCount({ tuitionBasis: '4회' }, 6), -2);
  assert.equal(students.getRemainingClassCount({ paymentCycleCredits: 4, carryOverBeforePayment: 2 }, 3), 3);
  assert.equal(students.getRemainingClassCount({ paymentCycleCredits: 4, manualUsedAdjustment: 2.9 }, 1), 1);
  assert.equal(students.getRemainingClassCount({ paymentCycleCredits: 4, manualUsedAdjustment: -2.9 }, 1), 6);
  assert.equal(students.getRemainingClassCount({
    tuitionBasis: '8회', paymentCycleCredits: 'bad', carryOverBeforePayment: 'bad', manualUsedAdjustment: 'bad'
  }, 'bad'), 0);
  assert.equal(students.getStudentPaymentCycleSize({}), 1);
  assert.equal(students.getStudentPaymentCycleSize({ tuitionBasis: '4회', paymentCycleCredits: 7.9 }), 7);
});

test('student payment records characterize legacy merge, precedence, sorting, and malformed values', () => {
  const students = loadStudents();
  const student = {
    tuition: 120000,
    tuitionBasis: '4회',
    paymentCycleCredits: 4,
    mostRecentPaymentDate: '2026-08-01',
    paymentHistory: ['2026-07-01', '', 'invalid', '2026-08-01'],
    paymentRecords: [
      { id: 'current', date: '2026-08-01', tuition: '130000', basis: '5회', credits: 5.9 },
      { date: '2026-06-01', tuition: 'bad', basis: null, credits: -3 },
      { id: 'invalid', date: 'not-a-date', tuition: 1, basis: '1회', credits: 1 }
    ]
  };
  const original = JSON.parse(JSON.stringify(student));

  assert.deepEqual(JSON.parse(JSON.stringify(students.getStudentPaymentHistory(student))), [
    'invalid', '2026-08-01', '2026-07-01'
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(students.normalizePaymentRecords(student))), [
    { id: 'legacy-payment-invalid', date: 'invalid', tuition: 0, basis: '', credits: 0 },
    { id: 'current', date: '2026-08-01', tuition: 130000, basis: '5회', credits: 5 },
    { id: 'legacy-payment-2026-07-01', date: '2026-07-01', tuition: 0, basis: '', credits: 0 },
    { id: 'legacy-payment-2026-06-01', date: '2026-06-01', tuition: 0, basis: '', credits: 0 }
  ]);
  assert.deepEqual(student, original);
});

test('student payment grouping characterizes cycle boundaries, excess, carry, and negative adjustment', () => {
  const students = loadStudents();
  const classRecords = [
    { id: 'before', date: '2026-06-30', start: '10:00' },
    { id: 'first', date: '2026-07-01', start: '10:00' },
    { id: 'middle', date: '2026-07-15', start: '10:00' },
    { id: 'boundary-a', date: '2026-08-01', start: '09:00' },
    { id: 'boundary-b', date: '2026-08-01', start: '11:00' },
    { id: 'after', date: '2026-08-02', start: '10:00' },
    { id: 'excess', date: '2026-08-03', start: '10:00' }
  ];
  const original = JSON.parse(JSON.stringify(classRecords));
  const grouped = students.buildPaymentClassGroups({
    tuitionBasis: '2회',
    paymentCycleCredits: 2,
    carryOverBeforePayment: 1,
    manualUsedAdjustment: -1,
    paymentHistory: ['2026-07-01', '2026-08-01'],
    paymentRecords: [
      { id: 'july', date: '2026-07-01', basis: '2회', credits: 2 },
      { id: 'august', date: '2026-08-01', basis: '2회', credits: 2 }
    ]
  }, ['2026-07-01', '2026-08-01'], classRecords);

  assert.deepEqual(
    JSON.parse(JSON.stringify(grouped.groups.map((group) => ({
      paymentDate: group.paymentDate,
      paymentRecordId: group.paymentRecord?.id || '',
      classIds: group.classRecords.map((record) => record.id)
    })))),
    [
      { paymentDate: '2026-08-01', paymentRecordId: 'august', classIds: ['after', 'excess'] },
      { paymentDate: '2026-07-01', paymentRecordId: 'july', classIds: ['middle', 'boundary-b'] }
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(grouped.unassigned.map((record) => record.id))),
    ['before', 'first', 'boundary-a']
  );
  assert.deepEqual(classRecords, original);
});

test('student monthly payment grouping characterizes early payment and missing-month classes', () => {
  const students = loadStudents();
  const grouped = students.buildPaymentClassGroups({
    tuitionBasis: '월초',
    paymentHistory: ['2026-07-01', '2026-07-24']
  }, ['2026-07-01', '2026-07-24'], [
    { id: 'july', date: '2026-07-31', start: '10:00' },
    { id: 'august', date: '2026-08-01', start: '10:00' },
    { id: 'september', date: '2026-09-01', start: '10:00' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(grouped.groups.map((group) => [
    group.paymentDate,
    group.classRecords.map((record) => record.id)
  ]))), [
    ['2026-07-24', ['august']],
    ['2026-07-01', ['july']]
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(grouped.unassigned.map((record) => record.id))), ['september']);
});

test('student carry-over characterizes same-day class boundaries without changing calendar semantics', () => {
  const students = loadStudents();
  students.state.calendar.events = [
    { kind: '수강', title: 'Boundary Student', date: '2026-08-01', start: '09:00', end: '10:00' },
    { kind: '수강', title: 'Boundary Student', date: '2026-08-01', start: '11:00', end: '12:00' },
    { kind: '수강', title: 'Boundary Student', date: '2026-08-02', start: '09:00', end: '10:00' }
  ];
  const student = { name: 'Boundary Student' };
  assert.equal(students.computeCarryOverForNewPaymentCycle(student, '2026-07-01', '2026-08-01', 1), 2);
  assert.equal(students.computeCarryOverForNewPaymentCycle(student, '2026-07-01', '2026-08-01', -2), 0);
  assert.equal(students.computeCarryOverForNewPaymentCycle(student, '2026-07-01', '2026-08-01', -3), -1);
  assert.equal(students.computeCarryOverForNewPaymentCycle(student, '2026-07-01', '', 99), 0);
});

test('extracted student payment credits match the retained legacy implementation exactly', () => {
  const students = loadStudents();
  const student = {
    tuition: 120000,
    tuitionBasis: '2회',
    paymentCycleCredits: 2,
    carryOverBeforePayment: 1,
    manualUsedAdjustment: -1,
    mostRecentPaymentDate: '2026-08-01',
    paymentHistory: ['2026-07-01', '2026-08-01', 'invalid'],
    paymentRecords: [
      { id: 'july', date: '2026-07-01', tuition: 100000, basis: '2회', credits: 2 },
      { id: 'august', date: '2026-08-01', tuition: 120000, basis: '2회', credits: 2 }
    ]
  };
  const paymentCycleSize = students.getStudentPaymentCycleSize(student);
  const normalizationInput = {
    student,
    isValidDateString: students.isValidDateString,
    paymentCycleSize
  };
  const legacyRecords = normalizePaymentRecordsLegacy(normalizationInput);
  const extractedRecords = paymentCredits.normalizePaymentRecords(normalizationInput);
  assert.deepEqual(extractedRecords, legacyRecords);

  const balanceInput = {
    student,
    completedSincePayment: 3,
    basisCount: students.basisToCount(student.tuitionBasis)
  };
  assert.equal(
    paymentCredits.getRemainingClassCount(balanceInput),
    getRemainingClassCountLegacy(balanceInput)
  );

  const carryInput = { nextPaymentDate: '2026-08-01', previousRemaining: -1, sameDayCompleted: 2 };
  assert.equal(
    paymentCredits.computeCarryOverForNewPaymentCycle(carryInput),
    computeCarryOverForNewPaymentCycleLegacy(carryInput)
  );

  const classRecords = [
    { id: 'before', date: '2026-06-30', start: '10:00' },
    { id: 'first', date: '2026-07-01', start: '10:00' },
    { id: 'middle', date: '2026-07-15', start: '10:00' },
    { id: 'boundary-a', date: '2026-08-01', start: '09:00' },
    { id: 'boundary-b', date: '2026-08-01', start: '11:00' },
    { id: 'after', date: '2026-08-02', start: '10:00' }
  ];
  const groupingInput = {
    student,
    paymentDates: ['2026-07-01', '2026-08-01'],
    classRecords,
    paymentRecords: extractedRecords,
    isMonthlyStart: false,
    paymentCycleSize,
    manualUsedAdjustment: students.getManualUsedAdjustment(student)
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(paymentCredits.buildPaymentClassGroups(groupingInput))),
    JSON.parse(JSON.stringify(buildPaymentClassGroupsLegacy(groupingInput)))
  );

  const monthlyInput = {
    student: { tuitionBasis: '월초' },
    paymentDates: ['2026-07-01', '2026-07-24'],
    classRecords: [
      { id: 'july', date: '2026-07-31', start: '10:00' },
      { id: 'august', date: '2026-08-01', start: '10:00' }
    ],
    paymentRecords: [],
    isMonthlyStart: true,
    paymentCycleSize: 1,
    manualUsedAdjustment: 0
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(paymentCredits.buildPaymentClassGroups(monthlyInput))),
    JSON.parse(JSON.stringify(buildPaymentClassGroupsLegacy(monthlyInput)))
  );
});

test('student instructor visibility remains scoped to assigned students', () => {
  const students = loadStudents();
  students.state.access = { userName: 'Assigned Instructor', studioRole: '강사' };
  students.state.students = [
    { id: 'own', name: 'Own Student', studentGroup: '정규반', instructor: 'Assigned Instructor' },
    { id: 'other', name: 'Other Student', studentGroup: '정규반', instructor: 'Other Instructor' }
  ];
  students.state.calendar.events = [];
  assert.deepEqual(
    JSON.parse(JSON.stringify(students.getVisibleStudents().map((student) => student.id))),
    ['own']
  );
  assert.equal(students.canManageStudent(students.state.students[0]), true);
  assert.equal(students.canManageStudent(students.state.students[1]), false);
});

test('student detail projection preserves payment rowspans, labels, and prior-cycle rows', () => {
  const rows = paymentCredits.buildPaymentClassDetailRows({
    groups: [{
      paymentDate: '2026-08-01',
      paymentRecord: { basis: '2회', tuition: 120000, credits: 2 },
      classRecords: [
        { date: '2026-08-01', start: '10:00', end: '11:00', classType: '정규 수강' },
        { date: '2026-08-08', start: '10:00', end: '11:00' }
      ]
    }, {
      paymentDate: '2026-07-01', paymentRecord: null, classRecords: []
    }],
    unassigned: [{ date: '2026-06-30', start: '09:00', end: '10:00', classType: '보강' }],
    dayNames: ['일', '월', '화', '수', '목', '금', '토'],
    getDayIndex: (date) => new Date(`${date}T00:00:00`).getDay(),
    formatTuition: (value) => `${Number(value).toLocaleString('en-US')}원`,
    isMonthlyBasis: (basis) => basis === '월초'
  });
  assert.deepEqual(rows, [
    { cells: [
      { text: '2026-08-01', rowSpan: 2 }, { text: '2회', rowSpan: 2 },
      { text: '120,000원', rowSpan: 2 }, { text: '2', rowSpan: 2 },
      { text: '2026-08-01 (토) 10:00~11:00 · 정규 수강' }
    ] },
    { cells: [{ text: '2026-08-08 (토) 10:00~11:00 · 수강' }] },
    { cells: [
      { text: '2026-07-01', rowSpan: 1 }, { text: '-', rowSpan: 1 },
      { text: '-', rowSpan: 1 }, { text: '-', rowSpan: 1 }, { text: '-' }
    ] },
    { cells: [
      { text: '이전 결제 사이클', rowSpan: 1, colSpan: 4 },
      { text: '2026-06-30 (화) 09:00~10:00 · 보강' }
    ] }
  ]);
});