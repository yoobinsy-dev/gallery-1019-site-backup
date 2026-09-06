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

  function createDeferredExhibitionDetailRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Exhibition detail storage adapter is unavailable.');
      return createExhibitionDetailRepository(storage);
    }
    return Object.freeze({
      loadUsers: () => repository().loadUsers(),
      loadInventoryBackup: (key) => repository().loadInventoryBackup(key),
      saveInventoryBackupSafely: (key, backup) => repository().saveInventoryBackupSafely(key, backup),
      loadPreference: (key) => repository().loadPreference(key),
      savePreference: (key, value) => repository().savePreference(key, value)
    });
  }

  const api = Object.freeze({
    createExhibitionDetailRepository,
    createDeferredExhibitionDetailRepository,
    repository: createDeferredExhibitionDetailRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.ExhibitionDetailRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);