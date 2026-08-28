const test = require('node:test');
const assert = require('node:assert/strict');

const { cloneCalendarEvents } = require('../fixtures/calendar');
const { exposeIifeFunctions } = require('../helpers/load-source');

function loadStudents() {
  return exposeIifeFunctions('pottery-students.js', [
    'state',
    'getStudentClassStats',
    'getCompletedClassCountSince',
    'getRemainingClassCount',
    'computeCarryOverForNewPaymentCycle',
    'buildPaymentClassGroups'
  ]).exposed;
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