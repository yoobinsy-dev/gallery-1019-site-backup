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

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    KEYS,
    createMasterCalendarRepository,
    repository: storage ? createMasterCalendarRepository(storage) : null
  });
  root.MasterCalendarRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);