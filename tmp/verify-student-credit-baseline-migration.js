const fs = require('fs');
const crypto = require('crypto');

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) {
  throw new Error('Usage: node verify-student-credit-baseline-migration.js <before.json> <after.json>');
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8')).data || {};
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8')).data || {};

function removeBaseline(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const copy = { ...item };
    delete copy.creditTrackingStartDate;
    return copy;
  });
}

function serialize(value) {
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(serialize(value)).digest('hex');
}

const beforeStudents = removeBaseline(before['pottery-students-v1']);
const afterStudents = removeBaseline(after['pottery-students-v1']);
const beforeCalendar = before['studio-calendar-state-v1'] || {};
const afterCalendar = after['studio-calendar-state-v1'] || {};
const studentsSame = serialize(beforeStudents) === serialize(afterStudents);
const calendarSame = serialize(beforeCalendar) === serialize(afterCalendar);
const baselines = (after['pottery-students-v1'] || []).map((student) => ({
  name: student.name,
  baseline: student.creditTrackingStartDate
}));

const report = {
  studentsSameExceptBaseline: studentsSame,
  calendarUnchanged: calendarSame,
  beforeStudentsHash: hash(beforeStudents),
  afterStudentsHash: hash(afterStudents),
  beforeCalendarHash: hash(beforeCalendar),
  afterCalendarHash: hash(afterCalendar),
  baselines
};

console.log(JSON.stringify(report, null, 2));
if (!studentsSame || !calendarSame) {
  throw new Error('Unexpected non-baseline data change');
}
console.log('PASS migration integrity');
