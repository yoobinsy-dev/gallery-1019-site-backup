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

  function createDeferredStudentsRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Students storage adapter is unavailable.');
      return createStudentsRepository(storage);
    }
    return Object.freeze({
      loadStudents: () => repository().loadStudents(),
      loadCalendarState: () => repository().loadCalendarState(),
      saveStudents: (students) => repository().saveStudents(students),
      saveCalendarState: (calendar) => repository().saveCalendarState(calendar)
    });
  }

  const api = Object.freeze({
    CALENDAR_KEY,
    STUDENTS_KEY,
    createStudentsRepository,
    createDeferredStudentsRepository,
    repository: createDeferredStudentsRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.StudentsRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);