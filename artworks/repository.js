(function initializeGalleryArtworksRepository(root) {
  'use strict';

  const KEY = 'gallery-artworks-v1';

  function createRepository(storage) {
    return Object.freeze({
      loadArtworks() {
        const value = JSON.parse(storage.read(KEY) || 'null');
        return Array.isArray(value) ? value : [];
      },
      saveArtworksSafely(artworks) {
        if (!Array.isArray(artworks)) return false;
        return storage.writeSafely(KEY, JSON.stringify(artworks));
      }
    });
  }

  function createDeferredRepository(getStorage) {
    function requireStorage() {
      const storage = getStorage();
      if (!storage) throw new Error('Gallery artworks storage adapter is unavailable.');
      return storage;
    }

    return Object.freeze({
      loadArtworks() {
        return createRepository(requireStorage()).loadArtworks();
      },
      saveArtworksSafely(artworks) {
        return createRepository(requireStorage()).saveArtworksSafely(artworks);
      }
    });
  }

  const api = Object.freeze({
    KEY,
    createRepository,
    createDeferredRepository,
    repository: createDeferredRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.GalleryArtworksRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);