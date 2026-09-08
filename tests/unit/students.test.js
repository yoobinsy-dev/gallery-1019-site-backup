const test = require('node:test');
const assert = require('node:assert/strict');

const { cloneCalendarEvents } = require('../fixtures/calendar');
const { exposeIifeFunctions } = require('../helpers/load-source');
const paymentCredits = require('../../students/payment-credits');
const calendarOccurrences = require('../../master-calendar/occurrences');
const { createStorageAdapter } = require('../../storage/storage-adapter');
const studentsRepository = require('../../storage/students-repository');
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

function loadStudents(globals = {}) {
  return exposeIifeFunctions('pottery-students.js', [
    'state',
    'loadStudents',
    'saveStudents',
    'loadCalendarState',
    'saveCalendarState',
    'getStudentClassStats',
    'getCompletedClassCountSince',
    'getRemainingClassCount',
    'computeCarryOverForNewPaymentCycle',
    'buildPaymentClassGroups',
    'getStudentPaymentProjection',
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
    StudentPaymentCredits: paymentCredits,
    StudentsRepository: {
      repository: studentsRepository.createStudentsRepository(
        createStorageAdapter({
          storage: globals.localStorage || {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
          }
        })
      )
    },
    ...globals
  } }).exposed;
}

test('students persistence characterizes student and calendar serialization', () => {
  const values = new Map([
    ['pottery-students-v1', JSON.stringify([{
      id: 1,
      name: 'Student',
      studentGroup: 'legacy-group',
      paymentHistory: ['2026-08-01', ''],
      unknownStudentField: 'keep'
    }])],
    ['studio-calendar-state-v1', JSON.stringify({
      events: [{ id: 'event', unknownEventField: 'keep' }],
      baseRules: [{ id: 'rule' }],
      baseRuleTimeline: [{ weekKey: '2026-08-03', rules: [{ id: 'timeline-rule' }], unknownTimelineField: 'drop' }],
      baseWeekOverrides: { '2026-08-03': [{ id: 'override' }] },
      studioUsers: [{ id: 'user' }],
      classTeachingLog: [{ id: 'log' }],
      unknownCalendarRoot: 'keep'
    })]
  ]);
  const writes = [];
  const localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      writes.push([key, value]);
      values.set(key, String(value));
      return undefined;
    }
  };
  const students = loadStudents({ localStorage });
  students.loadStudents();
  students.loadCalendarState();

  assert.equal(students.state.students[0].studentGroup, '정규반');
  assert.equal(students.state.students[0].unknownStudentField, 'keep');
  assert.deepEqual(JSON.parse(JSON.stringify(students.state.students[0].paymentHistory)), ['2026-08-01']);
  assert.equal(students.state.calendar.events[0].unknownEventField, 'keep');
  assert.equal(students.state.calendar.baseRuleTimeline[0].unknownTimelineField, undefined);

  assert.equal(students.saveStudents(), undefined);
  assert.equal(students.saveCalendarState(), undefined);
  assert.deepEqual(writes.map(([key]) => key), ['pottery-students-v1', 'studio-calendar-state-v1']);
  assert.equal(JSON.parse(writes[0][1])[0].unknownStudentField, 'keep');
  const savedCalendar = JSON.parse(writes[1][1]);
  assert.equal(savedCalendar.unknownCalendarRoot, 'keep');
  assert.equal(savedCalendar.events[0].unknownEventField, 'keep');
});

test('students persistence characterizes malformed defaults and calendar fallback writes', () => {
  const writes = [];
  const students = loadStudents({
    localStorage: {
      getItem() { return '{malformed'; },
      setItem(key, value) {
        writes.push([key, value]);
        return undefined;
      }
    }
  });
  students.loadStudents();
  students.loadCalendarState();
  assert.deepEqual(JSON.parse(JSON.stringify(students.state.students)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(students.state.calendar.events)), []);
  students.saveCalendarState();
  assert.deepEqual(Object.keys(JSON.parse(writes[0][1])), [
    'events',
    'baseRules',
    'baseRuleTimeline',
    'baseWeekOverrides',
    'studioUsers',
    'classTeachingLog'
  ]);
});

test('students repository preserves unknown calendar roots, fallback shape, and write order', () => {
  const values = new Map([
    ['pottery-students-v1', '[{"id":1,"unknown":"student"}]'],
    ['studio-calendar-state-v1', '{"events":[],"unknownRoot":"keep"}']
  ]);
  const writes = [];
  const repository = studentsRepository.createStudentsRepository({
    read(key) { return values.get(key) ?? null; },
    write(key, value) {
      writes.push([key, value]);
      values.set(key, value);
      return undefined;
    }
  });
  assert.equal(repository.loadStudents()[0].unknown, 'student');
  assert.equal(repository.loadCalendarState().unknownRoot, 'keep');
  const calendar = {
    events: [{ id: 2, unknown: 'event' }],
    baseRules: [],
    baseRuleTimeline: [],
    baseWeekOverrides: {},
    studioUsers: [],
    classTeachingLog: []
  };
  repository.saveStudents([{ id: 1, unknown: 'student' }]);
  repository.saveCalendarState(calendar);
  assert.deepEqual(writes.map(([key]) => key), ['pottery-students-v1', 'studio-calendar-state-v1']);
  assert.equal(JSON.parse(writes[1][1]).unknownRoot, 'keep');
  assert.equal(JSON.parse(writes[1][1]).events[0].unknown, 'event');
});

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
  assert.equal(students.getStudentPaymentCycleSize({ tuitionBasis: '4회', paymentCycleCredits: 2 }), 2);
});

test('student payment cycles assign late-entered payment overflow and preserve reduced starting credits', () => {
  const students = loadStudents();
  const student = {
    tuitionBasis: '4회',
    paymentCycleCredits: 4,
    mostRecentPaymentDate: '2026-09-02',
    paymentHistory: ['2026-08-04', '2026-09-02'],
    paymentRecords: [
      { id: 'august', date: '2026-08-04', basis: '4회', credits: 4 },
      { id: 'september', date: '2026-09-02', basis: '4회', credits: 4 }
    ]
  };
  const classRecords = [
    { id: 'aug-04', date: '2026-08-04', start: '10:00' },
    { id: 'aug-11', date: '2026-08-11', start: '10:00' },
    { id: 'aug-25', date: '2026-08-25', start: '10:00' },
    { id: 'aug-28', date: '2026-08-28', start: '10:00' },
    { id: 'sep-01', date: '2026-09-01', start: '10:00' },
    { id: 'sep-08', date: '2026-09-08', start: '10:00' }
  ];

  const grouped = students.buildPaymentClassGroups(
    student,
    student.paymentHistory,
    classRecords
  );

  assert.deepEqual(grouped.groups.map((group) => [
    group.paymentDate,
    group.classRecords.map((record) => record.id)
  ]), [
    ['2026-09-02', ['sep-08', 'sep-01']],
    ['2026-08-04', ['aug-28', 'aug-25', 'aug-11', 'aug-04']]
  ]);
  assert.equal(grouped.remainingCount, 2);
  assert.deepEqual(grouped.unassigned, []);

  const projected = students.getStudentPaymentProjection(student, classRecords);
  assert.deepEqual(projected.groups, grouped.groups);
  assert.equal(projected.remainingCount, grouped.remainingCount);

  const reducedStudent = {
    tuitionBasis: '4회',
    paymentCycleCredits: 2,
    mostRecentPaymentDate: '2026-08-04',
    paymentHistory: ['2026-08-04']
  };
  const reduced = students.buildPaymentClassGroups(reducedStudent, ['2026-08-04'], [classRecords[0]]);
  assert.equal(reduced.remainingCount, 1);
});

test('exhausted reduced legacy cycle leaves later class pending until the next payment', () => {
  const students = loadStudents();
  const classRecords = [
    { id: 'class-a', date: '2026-08-11', start: '10:00', end: '11:00' },
    { id: 'class-b', date: '2026-08-28', start: '10:00', end: '11:00' },
    { id: 'class-c', date: '2026-09-04', start: '10:00', end: '11:00' }
  ];
  const legacyStudent = {
    tuitionBasis: '4회',
    paymentCycleCredits: 2,
    mostRecentPaymentDate: '2026-08-04',
    paymentHistory: ['2026-08-04']
  };

  const exhausted = students.buildPaymentClassGroups(legacyStudent, ['2026-08-04'], classRecords);
  assert.deepEqual(exhausted.groups[0].classRecords.map((record) => record.id), ['class-b', 'class-a']);
  assert.deepEqual(exhausted.unassigned.map((record) => record.id), ['class-c']);
  assert.equal(exhausted.remainingCount, 0);

  const pendingRows = paymentCredits.buildPaymentClassDetailRows({
    ...exhausted,
    dayNames: [],
    getDayIndex: () => -1
  });
  assert.equal(pendingRows.at(-1).cells[0].text, '다음 결제 대기');
  assert.match(pendingRows.at(-1).cells.at(-1).text, /^2026-09-04/);

  const renewedStudent = {
    ...legacyStudent,
    paymentCycleCredits: 4,
    mostRecentPaymentDate: '2026-09-05',
    paymentHistory: ['2026-08-04', '2026-09-05'],
    paymentRecords: [
      { id: 'legacy', date: '2026-08-04', basis: '4회', credits: 2 },
      { id: 'renewal', date: '2026-09-05', basis: '4회', credits: 4 }
    ]
  };
  const renewed = students.buildPaymentClassGroups(
    renewedStudent,
    renewedStudent.paymentHistory,
    classRecords
  );
  assert.deepEqual(renewed.groups.map((group) => [
    group.paymentDate,
    group.classRecords.map((record) => record.id)
  ]), [
    ['2026-09-05', ['class-c']],
    ['2026-08-04', ['class-b', 'class-a']]
  ]);
  assert.equal(renewed.remainingCount, 3);
  assert.deepEqual(renewed.unassigned, []);
});

test('student payment detail rows retain canonical newest-first cycle ordering', () => {
  const rows = paymentCredits.buildPaymentClassDetailRows({
    groups: [{
      paymentDate: '2026-09-02',
      paymentRecord: { basis: '4회', tuition: 250000, credits: 4 },
      classRecords: [
        { date: '2026-09-08', start: '10:00', end: '11:00' },
        { date: '2026-09-01', start: '10:00', end: '11:00' }
      ]
    }],
    dayNames: ['일', '월', '화', '수', '목', '금', '토'],
    getDayIndex: () => 2,
    formatTuition: String,
    isMonthlyBasis: () => false
  });
  assert.match(rows[0].cells.at(-1).text, /^2026-09-08/);
  assert.match(rows[1].cells.at(-1).text, /^2026-09-01/);
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
      { paymentDate: '2026-08-01', paymentRecordId: 'august', classIds: ['excess', 'after'] },
      { paymentDate: '2026-07-01', paymentRecordId: 'july', classIds: ['boundary-b', 'middle'] }
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(grouped.unassigned.map((record) => record.id))),
    ['boundary-a', 'first', 'before']
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

test('unchanged student payment helpers match the retained legacy implementation', () => {
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