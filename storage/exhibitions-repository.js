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

  function createDeferredExhibitionsRepository(getStorage) {
    function requireStorage() {
      const storage = getStorage();
      if (!storage) {
        throw new Error('Exhibitions storage adapter is unavailable.');
      }
      return storage;
    }

    return Object.freeze({
      loadExhibitions() {
        return createExhibitionsRepository(requireStorage()).loadExhibitions();
      },
      saveExhibitionsSafely(exhibitions) {
        return createExhibitionsRepository(requireStorage()).saveExhibitionsSafely(exhibitions);
      }
    });
  }

  const api = Object.freeze({
    KEY,
    createExhibitionsRepository,
    createDeferredExhibitionsRepository,
    repository: createDeferredExhibitionsRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.ExhibitionsRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);