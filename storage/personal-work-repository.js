(function initializePersonalWorkRepository(root) {
  'use strict';

  const KEYS = Object.freeze({
    entries: 'pottery-personal-work-v1',
    users: 'users',
    calendar: 'studio-calendar-state-v1'
  });

  function createPersonalWorkRepository(storage) {
    function readJson(key, fallback) {
      try {
        return JSON.parse(storage.read(key) || JSON.stringify(fallback));
      } catch (error) {
        return fallback;
      }
    }

    function readArray(key) {
      const value = readJson(key, []);
      return Array.isArray(value) ? value : [];
    }

    return Object.freeze({
      loadUsers() {
        return readArray(KEYS.users);
      },
      loadCalendarEvents() {
        const calendar = readJson(KEYS.calendar, {});
        return Array.isArray(calendar?.events) ? calendar.events : [];
      },
      loadEntries() {
        return readArray(KEYS.entries);
      },
      saveEntries(entries) {
        return storage.write(KEYS.entries, JSON.stringify(entries));
      }
    });
  }

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    KEYS,
    createPersonalWorkRepository,
    repository: storage ? createPersonalWorkRepository(storage) : null
  });
  root.PersonalWorkRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);