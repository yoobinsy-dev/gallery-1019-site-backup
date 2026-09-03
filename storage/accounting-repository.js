(function initializeAccountingRepository(root) {
  'use strict';

  const KEYS = Object.freeze({
    entries: 'pottery-accounting-v1',
    exhibitions: 'exhibitions',
    students: 'pottery-students-v1',
    personalWork: 'pottery-personal-work-v1',
    materialOrders: 'pottery-material-orders-v1',
    calendar: 'studio-calendar-state-v1'
  });

  function createAccountingRepository(storage) {
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
      loadEntries() {
        return readArray(KEYS.entries);
      },
      loadExhibitions() {
        return readArray(KEYS.exhibitions);
      },
      loadStudents() {
        return readArray(KEYS.students);
      },
      loadPersonalWorkEntries() {
        return readArray(KEYS.personalWork);
      },
      loadMaterialOrders() {
        return readArray(KEYS.materialOrders);
      },
      loadCalendarEvents() {
        const state = readJson(KEYS.calendar, {});
        return Array.isArray(state?.events) ? state.events : [];
      },
      saveEntries(entries) {
        return storage.write(KEYS.entries, JSON.stringify(entries));
      }
    });
  }

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    KEYS,
    createAccountingRepository,
    repository: storage ? createAccountingRepository(storage) : null
  });
  root.AccountingRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);