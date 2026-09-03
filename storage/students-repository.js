(function initializeStudentsRepository(root) {
  'use strict';

  const STUDENTS_KEY = 'pottery-students-v1';
  const CALENDAR_KEY = 'studio-calendar-state-v1';

  function createStudentsRepository(storage) {
    function loadCalendarState() {
      try {
        const parsed = JSON.parse(storage.read(CALENDAR_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function getCalendarFields(calendar) {
      return {
        events: calendar.events,
        baseRules: calendar.baseRules,
        baseRuleTimeline: calendar.baseRuleTimeline,
        baseWeekOverrides: calendar.baseWeekOverrides,
        studioUsers: calendar.studioUsers,
        classTeachingLog: calendar.classTeachingLog
      };
    }

    return Object.freeze({
      loadStudents() {
        try {
          const parsed = JSON.parse(storage.read(STUDENTS_KEY) || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          return [];
        }
      },
      loadCalendarState,
      saveStudents(students) {
        return storage.write(STUDENTS_KEY, JSON.stringify(students));
      },
      saveCalendarState(calendar) {
        const fields = getCalendarFields(calendar);
        try {
          const current = JSON.parse(storage.read(CALENDAR_KEY) || '{}');
          return storage.write(CALENDAR_KEY, JSON.stringify({ ...current, ...fields }));
        } catch (error) {
          return storage.write(CALENDAR_KEY, JSON.stringify(fields));
        }
      }
    });
  }

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    CALENDAR_KEY,
    STUDENTS_KEY,
    createStudentsRepository,
    repository: storage ? createStudentsRepository(storage) : null
  });
  root.StudentsRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);