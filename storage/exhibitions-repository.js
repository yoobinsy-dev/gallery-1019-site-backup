(function initializeExhibitionsRepository(root) {
  'use strict';

  const KEY = 'exhibitions';

  function createExhibitionsRepository(storage) {
    return Object.freeze({
      loadExhibitions() {
        return JSON.parse(storage.read(KEY) || 'null') || [];
      },
      saveExhibitionsSafely(exhibitions) {
        return storage.writeSafely(KEY, JSON.stringify(exhibitions));
      }
    });
  }

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    KEY,
    createExhibitionsRepository,
    repository: storage ? createExhibitionsRepository(storage) : null
  });
  root.ExhibitionsRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);