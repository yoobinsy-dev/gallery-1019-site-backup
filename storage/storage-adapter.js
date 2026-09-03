(function initializeBrowserStorageAdapter(root) {
  'use strict';

  function createStorageAdapter(options = {}) {
    const storage = options.storage || root.localStorage;
    const safeWrite = options.safeWrite || root.safeSetLocalStorageItem;

    return Object.freeze({
      read(key) {
        return storage.getItem(key);
      },
      write(key, serializedValue) {
        return storage.setItem(key, serializedValue);
      },
      writeSafely(key, serializedValue) {
        if (typeof safeWrite === 'function') {
          return safeWrite(key, serializedValue);
        }
        try {
          storage.setItem(key, serializedValue);
          return true;
        } catch (error) {
          return false;
        }
      },
      remove(key) {
        return storage.removeItem(key);
      }
    });
  }

  const api = Object.freeze({
    createStorageAdapter,
    storage: createStorageAdapter()
  });
  root.BrowserStorageAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);