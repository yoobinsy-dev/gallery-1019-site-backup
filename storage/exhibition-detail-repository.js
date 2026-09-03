(function initializeExhibitionDetailRepository(root) {
  'use strict';

  function createExhibitionDetailRepository(storage) {
    return Object.freeze({
      loadUsers() {
        return JSON.parse(storage.read('users') || 'null') || [];
      },
      loadInventoryBackup(key) {
        try {
          const parsed = JSON.parse(storage.read(key) || 'null');
          if (!parsed || typeof parsed !== 'object') return null;
          if (!parsed.snapshot || typeof parsed.snapshot !== 'object') return null;
          return parsed;
        } catch (error) {
          return null;
        }
      },
      saveInventoryBackupSafely(key, backup) {
        return storage.writeSafely(key, JSON.stringify(backup));
      },
      loadPreference(key) {
        try {
          return storage.read(key) || '';
        } catch (error) {
          return '';
        }
      },
      savePreference(key, value) {
        try {
          storage.write(key, value);
        } catch (error) {
          // Preferences are non-critical and retain best-effort storage semantics.
        }
      }
    });
  }

  const storage = root.BrowserStorageAdapter?.storage;
  const api = Object.freeze({
    createExhibitionDetailRepository,
    repository: storage ? createExhibitionDetailRepository(storage) : null
  });
  root.ExhibitionDetailRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);