(function initializeMasterCalendarRepository(root) {
  'use strict';

  const KEYS = Object.freeze({
    calendar: 'studio-calendar-state-v1',
    students: 'pottery-students-v1',
    personalWork: 'pottery-personal-work-v1',
    users: 'users'
  });

  function createMasterCalendarRepository(storage) {
    function readJson(key, fallbackText) {
      return JSON.parse(storage.read(key) || fallbackText);
    }

    function readArray(key) {
      const value = readJson(key, '[]');
      return Array.isArray(value) ? value : [];
    }

    return Object.freeze({
      loadCalendarState() {
        const value = readJson(KEYS.calendar, '{}');
        return value && typeof value === 'object' ? value : {};
      },
      loadStudents() {
        return readArray(KEYS.students);
      },
      loadPersonalWorkEntries() {
        return readArray(KEYS.personalWork);
      },
      loadUsers() {
        return readArray(KEYS.users);
      },
      saveCalendarState(state) {
        return storage.write(KEYS.calendar, JSON.stringify(state));
      }
    });
  }

  function createDeferredMasterCalendarRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Master calendar storage adapter is unavailable.');
      return createMasterCalendarRepository(storage);
    }
    return Object.freeze({
      loadCalendarState: () => repository().loadCalendarState(),
      loadStudents: () => repository().loadStudents(),
      loadPersonalWorkEntries: () => repository().loadPersonalWorkEntries(),
      loadUsers: () => repository().loadUsers(),
      saveCalendarState: (state) => repository().saveCalendarState(state)
    });
  }

  const api = Object.freeze({
    KEYS,
    createMasterCalendarRepository,
    createDeferredMasterCalendarRepository,
    repository: createDeferredMasterCalendarRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.MasterCalendarRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);