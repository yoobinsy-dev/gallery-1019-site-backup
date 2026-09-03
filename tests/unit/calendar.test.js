const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const dateTime = require('../../master-calendar/date-time');
const occurrences = require('../../master-calendar/occurrences');
const { createStorageAdapter } = require('../../storage/storage-adapter');
const masterCalendarRepository = require('../../storage/master-calendar-repository');

function loadCalendar(globals = {}) {
  return exposeIifeFunctions('pottery-master-calendar.js', [
    'slotToTime', 'timeToSlot', 'getWeekStart', 'getMonthStart', 'addDays', 'addMonths', 'formatDateInput',
    'getDayIndexFromDateString', 'getEventsForDate', 'state', 'isExhibitionKind',
    'loadStudioUsers', 'getStudentUsersForEvents', 'getPersonalUsersForEvents',
    'getActivePersonalWorkEntries', 'loadStudioInstructors', 'loadState', 'saveState'
  ], { globals: {
    MasterCalendarDateTime: dateTime,
    MasterCalendarOccurrences: occurrences,
    MasterCalendarRepository: {
      repository: masterCalendarRepository.createMasterCalendarRepository(
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

test('calendar persistence characterizes dependencies, fixed state schema, and exact writes', () => {
  const values = new Map([
    ['pottery-students-v1', '[{"name":" Student "}]'],
    ['pottery-personal-work-v1', '[{"userName":"Artist","startDate":"2026-08-01","maxHours":10,"isDormant":false},{"userName":"Dormant","isDormant":true}]'],
    ['users', '[{"name":"Teacher","accountType":"강사","siteAccess":"pottery"}]'],
    ['studio-calendar-state-v1', JSON.stringify({
      events: [{ id: 'event', kind: '개인작업', title: 'Work', date: '2026-08-01', unknownEvent: 'drop' }],
      baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {}, studioUsers: ['Stored'],
      instructors: ['Stored Teacher'], classTeachingLog: [], unknownRoot: 'drop'
    })]
  ]);
  const writes = [];
  const calendar = loadCalendar({ localStorage: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); return undefined; }
  } });
  calendar.loadStudioUsers();
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.studioUsers)), ['Artist', 'Student']);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.getStudentUsersForEvents())), ['Student']);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.getPersonalUsersForEvents())), ['Artist']);
  assert.equal(calendar.getActivePersonalWorkEntries()[0].maxHours, 10);
  calendar.loadState();
  assert.equal(calendar.state.events[0].unknownEvent, undefined);
  assert.equal(calendar.saveState(), undefined);
  const saved = JSON.parse(writes[0][1]);
  assert.equal(writes[0][0], 'studio-calendar-state-v1');
  assert.deepEqual(Object.keys(saved), [
    'events', 'baseRules', 'baseRuleTimeline', 'baseWeekOverrides',
    'studioUsers', 'instructors', 'classTeachingLog'
  ]);

  values.set('pottery-students-v1', '{malformed');
  calendar.loadStudioUsers();
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.studioUsers)), []);
});

test('master calendar repository preserves raw fields, exact writes, and malformed errors', () => {
  const values = new Map([
    ['studio-calendar-state-v1', '{"events":[],"unknownRoot":"keep"}'],
    ['pottery-students-v1', '[{"unknown":"student"}]'],
    ['pottery-personal-work-v1', '[{"unknown":"personal"}]'],
    ['users', '[{"unknown":"user"}]']
  ]);
  const writes = [];
  const repository = masterCalendarRepository.createMasterCalendarRepository({
    read(key) { return values.get(key) ?? null; },
    write(key, value) { writes.push([key, value]); return undefined; }
  });
  assert.equal(repository.loadCalendarState().unknownRoot, 'keep');
  assert.equal(repository.loadStudents()[0].unknown, 'student');
  assert.equal(repository.loadPersonalWorkEntries()[0].unknown, 'personal');
  assert.equal(repository.loadUsers()[0].unknown, 'user');
  const stateDocument = { events: [], legacyRoot: 'keep' };
  assert.equal(repository.saveCalendarState(stateDocument), undefined);
  assert.deepEqual(writes, [['studio-calendar-state-v1', JSON.stringify(stateDocument)]]);
  values.set('pottery-students-v1', '{malformed');
  assert.throws(() => repository.loadStudents(), SyntaxError);
});

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
  assert.deepEqual(occurrences.expandOccurrences({
    events: [{ id: 'limited', date: '2026-01-01', repeatWeekly: true }],
    rangeStart: '2026-01-15',
    rangeEnd: '2026-02-28',
    maxWeeklyIterations: 3
  }).map(({ date }) => date), ['2026-01-15']);
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

test('master calendar characterizes workshop usage recurrence and exclusive boundaries', () => {
  const RealDate = Date;
  const fixedTime = new RealDate('2026-08-15T12:00:00').getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }
  }
  const calendar = exposeIifeFunctions('pottery-master-calendar.js', [
    'state', 'getPersonalWorkUsageHoursForCycle'
  ], { globals: {
    Date: FixedDate,
    MasterCalendarDateTime: dateTime,
    MasterCalendarOccurrences: occurrences
  } }).exposed;
  calendar.state.events = [
    { kind: '개인작업', title: 'A', date: '2026-08-01', start: '10:00', end: '11:00', repeatWeekly: true, repeatEndDate: '2026-08-15', repeatSkipDates: ['2026-08-08'] },
    { kind: '강사 지도 하 개인작업', title: 'A', date: '2026-08-04', start: '10:00', end: '11:30', repeatWeekly: true, repeatEndDate: 'invalid' },
    { kind: '개인작업', title: 'A', date: '2026-08-15', start: '18:00', end: '19:00' },
    { kind: '개인작업', title: 'A', date: '2026-08-16', start: '10:00', end: '11:00' },
    { kind: '개인작업', title: 'B', date: '2026-08-01', start: '10:00', end: '11:00' }
  ];
  assert.equal(calendar.getPersonalWorkUsageHoursForCycle('A', '2026-08-01', '2026-08-16'), 5);
  assert.equal(calendar.getPersonalWorkUsageHoursForCycle('A', '2026-08-01', '2026-08-15'), 4);
});

test('master calendar characterizes teaching log recurrence and inclusive horizon', () => {
  const RealDate = Date;
  const fixedTime = new RealDate('2026-08-15T12:00:00').getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }
  }
  const calendar = exposeIifeFunctions('pottery-master-calendar.js', [
    'state', 'rebuildClassTeachingLog'
  ], { globals: {
    Date: FixedDate,
    MasterCalendarDateTime: dateTime,
    MasterCalendarOccurrences: occurrences
  } }).exposed;
  const duplicate = { id: 'repeat', kind: '수강', title: 'A', date: '2027-08-01', start: '11:00', end: '12:00', repeatWeekly: true, repeatEndDate: '2027-08-15', repeatSkipDates: ['2027-08-08'], classType: '정규', instructor: 'I' };
  calendar.state.events = [
    duplicate,
    { ...duplicate },
    { id: 'invalid-end', kind: '수강', title: 'B', date: '2027-08-02', start: '09:00', end: '10:00', repeatWeekly: true, repeatEndDate: 'invalid' },
    { id: 'past', kind: '수강', title: 'C', date: '2026-01-01', start: '08:00', end: '09:00' },
    { id: 'horizon', kind: '수강', title: 'D', date: '2027-08-15', start: '07:00', end: '08:00' },
    { id: 'after', kind: '수강', title: 'E', date: '2027-08-16', start: '06:00', end: '07:00' },
    { id: 'other', kind: '개인작업', title: 'F', date: '2027-08-01', start: '05:00', end: '06:00' }
  ];
  calendar.state.baseRules = [];
  calendar.state.baseRuleTimeline = [];
  calendar.state.baseWeekOverrides = {};
  calendar.rebuildClassTeachingLog();

  const log = JSON.parse(JSON.stringify(calendar.state.classTeachingLog));
  assert.deepEqual(log.map((record) => [record.eventId, record.date]), [
    ['past', '2026-01-01'],
    ['repeat', '2027-08-01'],
    ['invalid-end', '2027-08-02'],
    ['invalid-end', '2027-08-09'],
    ['horizon', '2027-08-15'],
    ['repeat', '2027-08-15']
  ]);
  assert.deepEqual(log.at(-1), {
    key: 'repeat|2027-08-15|11:00|12:00|A',
    eventId: 'repeat',
    date: '2027-08-15',
    start: '11:00',
    end: '12:00',
    studentName: 'A',
    classType: '정규',
    instructor: 'I',
    baseRuleId: '',
    repeatWeekly: true
  });
});