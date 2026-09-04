const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const dateTime = require('../../master-calendar/date-time');
const occurrences = require('../../master-calendar/occurrences');
const occupancy = require('../../master-calendar/occupancy');
const baseRules = require('../../master-calendar/base-rules');
const scheduleProjections = require('../../master-calendar/schedule-projections');
const commands = require('../../master-calendar/commands');
const pointerController = require('../../master-calendar/pointer-controller');
const modalController = require('../../master-calendar/modal-controller');
const eventModalController = require('../../master-calendar/event-modal-controller');
const recurringEventController = require('../../master-calendar/recurring-event-controller');
const bindingsController = require('../../master-calendar/bindings-controller');
const quickEditController = require('../../master-calendar/quick-edit-controller');
const baseEditController = require('../../master-calendar/base-edit-controller');
const baseEditorController = require('../../master-calendar/base-editor-controller');
const monthView = require('../../master-calendar/month-view');
const weekView = require('../../master-calendar/week-view');
const { createStorageAdapter } = require('../../storage/storage-adapter');
const masterCalendarRepository = require('../../storage/master-calendar-repository');

function loadCalendar(globals = {}) {
  return exposeIifeFunctions('pottery-master-calendar.js', [
    'slotToTime', 'timeToSlot', 'getWeekStart', 'getMonthStart', 'addDays', 'addMonths', 'formatDateInput',
    'getDayIndexFromDateString', 'getEventsForDate', 'state', 'isExhibitionKind',
    'loadStudioUsers', 'getStudentUsersForEvents', 'getPersonalUsersForEvents',
    'getActivePersonalWorkEntries', 'loadStudioInstructors', 'loadState', 'saveState',
    'findLane', 'canPlaceInLane', 'createEmptyDailyOccupancy', 'cloneDailyOccupancy',
    'markLaneOccupancy', 'buildDailyOccupancyMap', 'hasEnoughCapacityForRange',
    'isEventPlacementAllowed', 'saveEventFromModal', 'finalizeMasterCalendarEdit',
    'handleDeleteRecurringOne', 'handleDeleteRecurringFollowing',
    'handleMoveRecurringOne', 'handleMoveRecurringFollowing',
    'getTemplateRulesForWeek', 'setTemplateRulesForWeekFrom', 'normalizeTemplateTimeline',
    'applyMovedRuleOverride'
  ], { globals: {
    MasterCalendarDateTime: dateTime,
    MasterCalendarOccurrences: occurrences,
    MasterCalendarOccupancy: occupancy,
    MasterCalendarBaseRules: baseRules,
    MasterCalendarScheduleProjections: scheduleProjections,
    MasterCalendarCommands: commands,
    MasterCalendarPointerController: pointerController,
    MasterCalendarModalController: modalController,
    MasterCalendarEventModalController: eventModalController,
    MasterCalendarRecurringEventController: recurringEventController,
    MasterCalendarBindingsController: bindingsController,
    MasterCalendarQuickEditController: quickEditController,
    MasterCalendarBaseEditController: baseEditController,
    MasterCalendarBaseEditorController: baseEditorController,
    MasterCalendarMonthView: monthView,
    MasterCalendarWeekView: weekView,
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

test('calendar occupancy characterizes first-fit lanes, capacity, exclusion, and ignored kinds', () => {
  const calendar = loadCalendar();
  calendar.state.events = [
    { id: 'one', kind: '개인작업', date: '2026-08-03', start: '10:00', end: '11:00', capacity: 1 },
    { id: 'two', kind: '수강', date: '2026-08-03', start: '10:30', end: '11:30', capacity: 2 },
    { id: 'overflow', kind: '개인작업', date: '2026-08-03', start: '10:30', end: '11:00', capacity: 1 },
    { id: 'other', kind: '기타', date: '2026-08-03', start: '10:00', end: '11:00', capacity: 3 },
    { id: 'exhibition', kind: '전시', date: '2026-08-03', start: '00:00', end: '24:00', capacity: 3 },
    { id: 'clamped', kind: '개인작업', date: '2026-08-03', start: '12:00', end: '12:30', capacity: 99 }
  ];

  const occupancy = calendar.buildDailyOccupancyMap('2026-08-03');
  assert.deepEqual(JSON.parse(JSON.stringify(occupancy[20])), [true, false, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(occupancy[21])), [true, true, true]);
  assert.deepEqual(JSON.parse(JSON.stringify(occupancy[22])), [false, true, true]);
  assert.deepEqual(JSON.parse(JSON.stringify(occupancy[24])), [true, true, true]);
  assert.equal(calendar.hasEnoughCapacityForRange(occupancy, 20, 21, 2), true);
  assert.equal(calendar.hasEnoughCapacityForRange(occupancy, 21, 22, 1), false);

  const excluded = calendar.buildDailyOccupancyMap('2026-08-03', 'one');
  assert.deepEqual(JSON.parse(JSON.stringify(excluded[20])), [false, false, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(excluded[21])), [true, true, true]);
});

test('calendar occupancy characterizes strict lane inputs and cloned boolean shape', () => {
  const calendar = loadCalendar();
  const occupancy = calendar.createEmptyDailyOccupancy();
  assert.equal(calendar.findLane(occupancy, 1, 3, 2), 0);
  calendar.markLaneOccupancy(occupancy, 1, 3, 0, 2);
  assert.equal(calendar.findLane(occupancy, 1, 3, 1), 2);
  assert.equal(calendar.canPlaceInLane(occupancy, 1, 3, 1, 2), true);
  assert.equal(calendar.canPlaceInLane(occupancy, 1, 1, 1, 0), false);
  assert.equal(calendar.canPlaceInLane([], 1, 3, 1, 0), false);
  assert.equal(calendar.canPlaceInLane(occupancy, 1, 3, 4, 0), false);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.cloneDailyOccupancy([[1, 0, 'yes']])[0])), [true, false, true]);
});

test('calendar placement characterizes exact class blocks and kind-specific rule coverage', () => {
  const calendar = loadCalendar();
  calendar.state.weekStart = new Date('2026-08-03T00:00:00');
  calendar.state.baseRules = [
    { id: 'class', type: '수업시간', day: 0, startSlot: 20, endSlot: 24 },
    { id: 'personal', type: '개인작업 시간', day: 0, startSlot: 24, endSlot: 28 }
  ];

  assert.equal(calendar.isEventPlacementAllowed('수강', 0, 20, 24), true);
  assert.equal(calendar.isEventPlacementAllowed('수강', 0, 20, 23), false);
  assert.equal(calendar.isEventPlacementAllowed('개인작업', 0, 24, 28), true);
  assert.equal(calendar.isEventPlacementAllowed('개인작업', 0, 23, 25), false);
  assert.equal(calendar.isEventPlacementAllowed('강사 지도 하 개인작업', 0, 21, 23), true);
  assert.equal(calendar.isEventPlacementAllowed('강사 지도 하 개인작업', 0, 23, 25), false);
  assert.equal(calendar.isEventPlacementAllowed('기타', 6, 0, 48), true);
  assert.equal(calendar.isEventPlacementAllowed('전시', 6, 0, 48), true);
  assert.equal(calendar.isEventPlacementAllowed('개인작업', -1, 24, 28), false);
  assert.equal(calendar.isEventPlacementAllowed('개인작업', 0, 28, 28), false);
});

function createEventModalDocument(values) {
  return {
    addEventListener() {},
    getElementById(id) { return values[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
}

test('calendar modal creation characterizes ordinary and weekly event shapes', () => {
  const storageValues = new Map([
    ['currentUser', JSON.stringify({ id: 1, accountType: '어드민', studioRole: '어드민', siteAccess: 'pottery' })]
  ]);
  const writes = [];
  const fields = {
    'event-kind': { value: '기타' },
    'event-user': { value: '' },
    'event-title': { value: 'Other Event' },
    'event-kiln-category': { value: '' },
    'event-date': { value: '2026-08-03' },
    'event-range-start': { value: '' },
    'event-range-end': { value: '' },
    'event-start': { value: '10:00' },
    'event-end': { value: '11:00' },
    'event-weekly-repeat': { checked: false },
    'event-capacity': { value: '3' }
  };
  const calendar = loadCalendar({
    document: createEventModalDocument(fields),
    localStorage: {
      getItem(key) { return storageValues.get(key) ?? null; },
      setItem(key, value) { writes.push([key, value]); storageValues.set(key, value); }
    }
  });
  calendar.state.access = { userName: 'Admin', studioRole: '어드민' };
  assert.throws(() => calendar.saveEventFromModal(), /Cannot set properties of null/);
  assert.equal(calendar.state.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.events[0])), {
    id: calendar.state.events[0].id,
    kind: '기타', title: 'Other Event', date: '2026-08-03', endDate: '',
    start: '10:00', end: '11:00', classType: '', instructor: '', baseRuleId: '',
    kilnCategory: '', capacity: 3, repeatWeekly: false
  });
  assert.equal(writes.at(-1)[0], 'studio-calendar-state-v1');

  fields['event-title'].value = 'Weekly Other';
  fields['event-weekly-repeat'].checked = true;
  assert.throws(() => calendar.saveEventFromModal(), /Cannot set properties of null/);
  assert.equal(calendar.state.events[1].repeatWeekly, true);
});

test('calendar modal creation characterizes first validation failure without mutation', () => {
  const alerts = [];
  const fields = {
    'event-kind': { value: '기타' }, 'event-user': { value: '' }, 'event-title': { value: '' },
    'event-kiln-category': { value: '' }, 'event-date': { value: '' },
    'event-range-start': { value: '' }, 'event-range-end': { value: '' },
    'event-start': { value: '' }, 'event-end': { value: '' },
    'event-weekly-repeat': { checked: false }, 'event-capacity': { value: '1' }
  };
  const calendar = loadCalendar({
    alert(message) { alerts.push(message); },
    document: createEventModalDocument(fields),
    localStorage: { getItem() { return null; }, setItem() { throw new Error('must not save'); } }
  });
  calendar.saveEventFromModal();
  assert.deepEqual(alerts, ['제목을 입력해주세요.']);
  assert.equal(calendar.state.events.length, 0);
});

function createEventCommandPolicies(overrides = {}) {
  return {
    activeStudioUserName: 'Artist',
    buildKilnEventTitle: (category) => `Kiln ${category}`,
    canManagePlacement: () => true,
    createEventId: () => 'evt-fixed',
    getClassRule: () => null,
    getDayIndexFromDateString: () => 0,
    hasCapacity: () => true,
    isAllDayKind: (kind) => kind === '전시' || kind === '가마 소성',
    isBaseRangeRepeatingWeekly: () => true,
    isExhibitionKind: (kind) => kind === '전시',
    isKilnKind: (kind) => kind === '가마 소성',
    isPlacementAllowed: () => true,
    isStudioArtist: false,
    personalUsers: [],
    roleLockMessage: 'locked',
    timeToSlot: (time) => Number(time.slice(0, 2)) * 2 + Number(time.slice(3, 5)) / 30,
    ...overrides
  };
}

test('calendar event command characterizes capacity and recurring-base rejection', () => {
  const draft = {
    kind: '개인작업', user: 'Artist', date: '2026-08-03', start: '10:00', end: '11:00',
    capacity: 2, weeklyRepeat: false
  };
  const capacityResult = commands.planEventCreation(draft, createEventCommandPolicies({ hasCapacity: () => false }));
  assert.deepEqual(capacityResult, { ok: false, reason: '선택한 시간대의 남은 자리가 부족합니다.' });

  const recurringResult = commands.planEventCreation(
    { ...draft, weeklyRepeat: true },
    createEventCommandPolicies({ isBaseRangeRepeatingWeekly: () => false })
  );
  assert.deepEqual(recurringResult, { ok: false, reason: '선택한 베이스 블록은 매주 반복되지 않습니다. 매주 반복으로 등록할 수 없습니다.' });
});

test('calendar event command characterizes class metadata and exact event shape', () => {
  const result = commands.planEventCreation({
    kind: '수강', user: 'Student', date: '2026-08-03', start: '10:00', end: '12:00',
    capacity: 3, weeklyRepeat: true
  }, createEventCommandPolicies({
    getClassRule: () => ({ id: 'rule-1', className: 'Wheel', instructor: ' Teacher ' })
  }));
  assert.deepEqual(result, { ok: true, event: {
    id: 'evt-fixed', kind: '수강', title: 'Student', date: '2026-08-03', endDate: '',
    start: '10:00', end: '12:00', classType: 'Wheel', instructor: 'Teacher', baseRuleId: 'rule-1',
    kilnCategory: '', capacity: 3, repeatWeekly: true
  } });
});

function setMasterEdit(calendar, overrides = {}) {
  Object.assign(calendar.state.masterEdit, {
    active: true,
    eventId: 'event-1',
    occurrenceDate: '2026-08-03',
    mode: 'move',
    dayIndex: 0,
    startSlot: 20,
    endSlot: 22,
    kind: '기타',
    validPreview: true,
    targetDayIndex: 1,
    targetStartSlot: 22,
    targetEndSlot: 24,
    pointerMoved: true,
    ...overrides
  });
}

test('calendar pointer finalization characterizes ordinary update and persistence', () => {
  const writes = [];
  const calendar = loadCalendar({ localStorage: {
    getItem() { return null; },
    setItem(key, value) { writes.push([key, value]); }
  } });
  calendar.state.weekStart = new Date('2026-08-03T00:00:00');
  calendar.state.events = [{
    id: 'event-1', kind: '기타', title: 'Other', date: '2026-08-03',
    start: '10:00', end: '11:00', repeatWeekly: false
  }];
  setMasterEdit(calendar);

  assert.throws(() => calendar.finalizeMasterCalendarEdit(), /Cannot set properties of null/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(calendar.state.events[0])),
    { id: 'event-1', kind: '기타', title: 'Other', date: '2026-08-04', start: '11:00', end: '12:00', repeatWeekly: false }
  );
  assert.equal(writes.at(-1)[0], 'studio-calendar-state-v1');
});

test('calendar pointer finalization characterizes recurring prompt without mutation', () => {
  const calendar = loadCalendar();
  calendar.state.weekStart = new Date('2026-08-03T00:00:00');
  calendar.state.viewMode = 'week';
  calendar.state.events = [{
    id: 'event-1', kind: '기타', title: 'Weekly', date: '2026-08-03',
    start: '10:00', end: '11:00', repeatWeekly: true
  }];
  setMasterEdit(calendar);

  assert.throws(() => calendar.finalizeMasterCalendarEdit(), /Cannot set properties of null/);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.events[0])), {
    id: 'event-1', kind: '기타', title: 'Weekly', date: '2026-08-03',
    start: '10:00', end: '11:00', repeatWeekly: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.recurringMove)), {
    eventId: 'event-1', occurrenceDate: '2026-08-03', nextDate: '2026-08-04',
    nextStart: '11:00', nextEnd: '12:00', nextClassType: '', nextInstructor: '', nextBaseRuleId: ''
  });
});

test('calendar pointer finalization characterizes invalid preview cancellation', () => {
  const calendar = loadCalendar();
  calendar.state.weekStart = new Date('2026-08-03T00:00:00');
  calendar.state.events = [{ id: 'event-1', kind: '기타', date: '2026-08-03', start: '10:00', end: '11:00' }];
  setMasterEdit(calendar, { validPreview: false });

  assert.throws(() => calendar.finalizeMasterCalendarEdit(), /Cannot set properties of null/);
  assert.equal(calendar.state.events[0].date, '2026-08-03');
  assert.equal(calendar.state.masterEdit.active, false);
});

test('calendar pointer command preserves unchanged updates and recurring class metadata', () => {
  const edit = { validPreview: true, pointerMoved: true, occurrenceDate: '2026-08-03' };
  const event = {
    id: 'event-1', repeatWeekly: true, classType: 'Old Class', instructor: 'Old Teacher', baseRuleId: 'old-rule'
  };
  const target = {
    dayIndex: 0, startSlot: 20, endSlot: 22,
    date: '2026-08-03', start: '10:00', end: '11:00'
  };
  assert.deepEqual(commands.planPointerEdit({
    edit, event, target, viewMode: 'week',
    originalDate: target.date, originalStart: target.start, originalEnd: target.end
  }), { action: 'update', patch: { date: target.date, start: target.start, end: target.end } });

  assert.deepEqual(commands.planPointerEdit({
    edit, event, target: { ...target, date: '2026-08-10' }, viewMode: 'week',
    originalDate: target.date, originalStart: target.start, originalEnd: target.end,
    nextClassRule: { id: 'new-rule', className: 'New Class', instructor: ' New Teacher ' }
  }), {
    action: 'prompt-recurring',
    recurringMove: {
      eventId: 'event-1', occurrenceDate: '2026-08-03', nextDate: '2026-08-10',
      nextStart: '10:00', nextEnd: '11:00', nextClassType: 'New Class',
      nextInstructor: 'New Teacher', nextBaseRuleId: 'new-rule'
    }
  });
});

test('calendar base-rule domain characterizes timeline precedence, normalization, and overlap splitting', () => {
  const calendar = loadCalendar();
  const baseRule = { id: 'base', day: 1, startSlot: 10, endSlot: 20, type: '개인작업 시간' };
  const changedRule = { ...baseRule, id: 'changed', startSlot: 12, endSlot: 18 };
  calendar.state.weekStart = new Date('2026-08-03T00:00:00');
  calendar.state.baseRules = [baseRule];
  calendar.state.baseRuleTimeline = [
    { weekKey: '2026-08-10', rules: [{ ...baseRule }] },
    { weekKey: '2026-08-17', rules: [changedRule] }
  ];

  assert.equal(calendar.getTemplateRulesForWeek(new Date('2026-08-03T00:00:00'))[0].id, 'base');
  assert.equal(calendar.getTemplateRulesForWeek(new Date('2026-08-12T00:00:00'))[0].id, 'base');
  assert.equal(calendar.getTemplateRulesForWeek(new Date('2026-08-24T00:00:00'))[0].id, 'changed');

  calendar.setTemplateRulesForWeekFrom(new Date('2026-08-24T00:00:00'), [{ ...changedRule, id: 'latest' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.baseRuleTimeline.map((entry) => entry.weekKey))), [
    '2026-08-10', '2026-08-17', '2026-08-24'
  ]);
  calendar.normalizeTemplateTimeline();
  assert.deepEqual(JSON.parse(JSON.stringify(calendar.state.baseRuleTimeline.map((entry) => entry.weekKey))), ['2026-08-17']);

  const targetRules = [
    { id: 'wide', day: 2, startSlot: 8, endSlot: 20, type: '개인작업 시간' },
    { id: 'other-day', day: 3, startSlot: 8, endSlot: 20, type: '개인작업 시간' }
  ];
  calendar.applyMovedRuleOverride(targetRules, {
    id: 'moved', day: 2, startSlot: 12, endSlot: 16, type: '수업시간', className: 'Wheel'
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(targetRules.map((rule) => ({ day: rule.day, startSlot: rule.startSlot, endSlot: rule.endSlot, type: rule.type })))),
    [
      { day: 2, startSlot: 8, endSlot: 12, type: '개인작업 시간' },
      { day: 2, startSlot: 16, endSlot: 20, type: '개인작업 시간' },
      { day: 3, startSlot: 8, endSlot: 20, type: '개인작업 시간' },
      { day: 2, startSlot: 12, endSlot: 16, type: '수업시간' }
    ]
  );
});

function createRecurringCalendar(events) {
  const writes = [];
  const calendar = loadCalendar({ localStorage: {
    getItem() { return null; },
    setItem(key, value) { writes.push([key, value]); }
  } });
  calendar.state.events = JSON.parse(JSON.stringify(events));
  return { calendar, writes };
}

test('calendar recurring delete characterizes one, following, and whole-series boundaries', () => {
  const source = {
    id: 'series', kind: '개인작업', title: 'Artist', date: '2026-08-03',
    start: '10:00', end: '11:00', repeatWeekly: true, repeatEndDate: '2026-09-28',
    repeatSkipDates: ['2026-08-24', '2026-08-17']
  };
  const one = createRecurringCalendar([source]);
  Object.assign(one.calendar.state.recurringDelete, { eventId: 'series', occurrenceDate: '2026-08-10' });
  assert.throws(() => one.calendar.handleDeleteRecurringOne(), /Cannot set properties of null/);
  assert.deepEqual(JSON.parse(JSON.stringify(one.calendar.state.events[0].repeatSkipDates)), [
    '2026-08-10', '2026-08-17', '2026-08-24'
  ]);

  const following = createRecurringCalendar([source]);
  Object.assign(following.calendar.state.recurringDelete, { eventId: 'series', occurrenceDate: '2026-08-17' });
  assert.throws(() => following.calendar.handleDeleteRecurringFollowing(), /Cannot set properties of null/);
  assert.equal(following.calendar.state.events[0].repeatEndDate, '2026-08-10');
  assert.deepEqual(JSON.parse(JSON.stringify(following.calendar.state.events[0].repeatSkipDates)), []);

  const whole = createRecurringCalendar([source]);
  Object.assign(whole.calendar.state.recurringDelete, { eventId: 'series', occurrenceDate: '2026-08-03' });
  assert.throws(() => whole.calendar.handleDeleteRecurringFollowing(), /Cannot set properties of null/);
  assert.deepEqual(JSON.parse(JSON.stringify(whole.calendar.state.events)), []);
});

test('calendar recurring move characterizes one occurrence and following split', () => {
  const source = {
    id: 'series', kind: '개인작업', title: 'Artist', date: '2026-08-03',
    start: '10:00', end: '11:00', capacity: 9, repeatWeekly: true,
    repeatEndDate: '2026-09-28', repeatSkipDates: ['2026-08-24']
  };
  const one = createRecurringCalendar([source]);
  Object.assign(one.calendar.state.recurringMove, {
    eventId: 'series', occurrenceDate: '2026-08-10', nextDate: '2026-08-11',
    nextStart: '11:00', nextEnd: '12:00'
  });
  assert.throws(() => one.calendar.handleMoveRecurringOne(), /Cannot set properties of null/);
  assert.equal(one.calendar.state.events.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(one.calendar.state.events[0].repeatSkipDates)), ['2026-08-10', '2026-08-24']);
  assert.match(one.calendar.state.events[1].id, /^evt-/);
  assert.equal(one.calendar.state.events[1].repeatWeekly, false);
  assert.equal(one.calendar.state.events[1].capacity, 3);

  const following = createRecurringCalendar([source]);
  Object.assign(following.calendar.state.recurringMove, {
    eventId: 'series', occurrenceDate: '2026-08-17', nextDate: '2026-08-18',
    nextStart: '12:00', nextEnd: '13:00'
  });
  assert.throws(() => following.calendar.handleMoveRecurringFollowing(), /Cannot set properties of null/);
  assert.equal(following.calendar.state.events[0].repeatEndDate, '2026-08-10');
  assert.deepEqual(JSON.parse(JSON.stringify(following.calendar.state.events[0].repeatSkipDates)), []);
  assert.equal(following.calendar.state.events[1].date, '2026-08-18');
  assert.equal(following.calendar.state.events[1].repeatWeekly, true);
  assert.equal(following.calendar.state.events[1].repeatEndDate, '2026-09-28');
});

test('calendar recurring move characterizes whole-series update and invalid-date no-op', () => {
  const source = {
    id: 'series', kind: '개인작업', title: 'Artist', date: '2026-08-03',
    start: '10:00', end: '11:00', capacity: 1, repeatWeekly: true,
    repeatSkipDates: ['2026-08-03', '2026-08-10', '2026-08-24']
  };
  const whole = createRecurringCalendar([source]);
  Object.assign(whole.calendar.state.recurringMove, {
    eventId: 'series', occurrenceDate: '2026-08-03', nextDate: '2026-08-11',
    nextStart: '12:00', nextEnd: '13:00'
  });
  assert.throws(() => whole.calendar.handleMoveRecurringFollowing(), /Cannot set properties of null/);
  assert.equal(whole.calendar.state.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(whole.calendar.state.events[0].repeatSkipDates)), ['2026-08-24']);
  assert.equal(whole.calendar.state.events[0].date, '2026-08-11');

  const invalid = createRecurringCalendar([{ ...source, date: 'invalid' }]);
  Object.assign(invalid.calendar.state.recurringMove, {
    eventId: 'series', occurrenceDate: '2026-08-03', nextDate: '2026-08-11',
    nextStart: '12:00', nextEnd: '13:00'
  });
  assert.doesNotThrow(() => invalid.calendar.handleMoveRecurringFollowing());
  assert.equal(invalid.writes.length, 0);
  assert.equal(invalid.calendar.state.events[0].date, 'invalid');
});

test('calendar recurring commands preserve exact plans and lazy generated IDs', () => {
  const event = {
    id: 'series', kind: '수강', title: 'Student', date: '2026-08-03',
    start: '10:00', end: '11:00', capacity: 0, repeatWeekly: true,
    repeatEndDate: '2026-09-28', repeatSkipDates: ['2026-08-24']
  };
  const deletePlan = commands.planRecurringDelete({
    scope: 'following', event, occurrenceDate: '2026-08-17'
  });
  assert.deepEqual(deletePlan, {
    action: 'update',
    patch: { repeatEndDate: '2026-08-10', repeatSkipDates: [] }
  });

  let idCalls = 0;
  const invalidMove = commands.planRecurringMove({
    scope: 'following', event: { ...event, date: 'invalid' }, occurrenceDate: '2026-08-17',
    nextDate: '2026-08-18', nextStart: '12:00', nextEnd: '13:00',
    createEventId() { idCalls += 1; return 'generated'; }
  });
  assert.deepEqual(invalidMove, { action: 'none' });
  assert.equal(idCalls, 0);

  const split = commands.planRecurringMove({
    scope: 'following', event, occurrenceDate: '2026-08-17',
    nextDate: '2026-08-18', nextStart: '12:00', nextEnd: '13:00',
    nextClassType: 'Wheel', nextInstructor: ' Teacher ', nextBaseRuleId: 'rule-2',
    createEventId() { idCalls += 1; return 'generated'; }
  });
  assert.equal(idCalls, 1);
  assert.deepEqual(split, {
    action: 'split',
    patch: { repeatEndDate: '2026-08-10', repeatSkipDates: [] },
    event: {
      id: 'generated', kind: '수강', title: 'Student', date: '2026-08-18', endDate: '',
      start: '12:00', end: '13:00', classType: 'Wheel', instructor: 'Teacher',
      baseRuleId: 'rule-2', capacity: 1, repeatWeekly: true,
      repeatEndDate: '2026-09-28', repeatSkipDates: []
    }
  });
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
    MasterCalendarOccurrences: occurrences,
    MasterCalendarBaseRules: baseRules,
    MasterCalendarScheduleProjections: scheduleProjections,
    MasterCalendarModalController: modalController,
    MasterCalendarEventModalController: eventModalController,
    MasterCalendarRecurringEventController: recurringEventController,
    MasterCalendarBindingsController: bindingsController,
    MasterCalendarQuickEditController: quickEditController,
    MasterCalendarBaseEditController: baseEditController,
    MasterCalendarBaseEditorController: baseEditorController
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
    MasterCalendarOccurrences: occurrences,
    MasterCalendarBaseRules: baseRules,
    MasterCalendarScheduleProjections: scheduleProjections,
    MasterCalendarModalController: modalController,
    MasterCalendarEventModalController: eventModalController,
    MasterCalendarRecurringEventController: recurringEventController,
    MasterCalendarBindingsController: bindingsController,
    MasterCalendarQuickEditController: quickEditController,
    MasterCalendarBaseEditController: baseEditController,
    MasterCalendarBaseEditorController: baseEditorController
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