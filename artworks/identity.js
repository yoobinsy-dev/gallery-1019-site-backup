(function initializeArtworkIdentity(root, factory) {
  'use strict';

  const api = factory();
  root.ArtworkIdentity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkIdentity() {
  'use strict';

  function normalizeText(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function getArtist(value) {
    return value?.artistName ?? value?.author ?? '';
  }

  function getMedium(value) {
    return value?.medium ?? value?.materials ?? '';
  }

  function getImageRef(value) {
    if (value?.imageRef && typeof value.imageRef === 'object') return { ...value.imageRef };
    return {
      photoUrl: value?.photoUrl || '',
      photoPreviewUrl: value?.photoPreviewUrl || value?.photoUrl || '',
      photoPath: value?.photoPath || '',
      photoPreviewPath: value?.photoPreviewPath || ''
    };
  }

  function findArtworkMatch(occurrence, artworks) {
    const candidates = Array.isArray(artworks) ? artworks : [];
    if (occurrence?.workId) {
      const exact = candidates.find((artwork) => artwork.workId === occurrence.workId);
      return exact
        ? { status: 'matched', artwork: exact, reason: 'workId' }
        : { status: 'unmatched', artwork: null, reason: 'unknown-workId' };
    }

    const title = normalizeText(occurrence?.title);
    const artist = normalizeText(getArtist(occurrence));
    if (!title || !artist) return { status: 'unmatched', artwork: null, reason: 'missing-identity' };

    const identityMatches = candidates.filter((artwork) => (
      normalizeText(artwork.title) === title && normalizeText(getArtist(artwork)) === artist
    ));
    if (identityMatches.length === 0) return { status: 'unmatched', artwork: null, reason: 'no-match' };
    if (identityMatches.length === 1) return { status: 'matched', artwork: identityMatches[0], reason: 'artist-title' };

    const year = normalizeText(occurrence?.year);
    const size = normalizeText(occurrence?.size);
    const narrowed = identityMatches.filter((artwork) => (
      (!year || normalizeText(artwork.year) === year)
      && (!size || normalizeText(artwork.size) === size)
    ));
    if ((year || size) && narrowed.length === 1) {
      return { status: 'matched', artwork: narrowed[0], reason: 'artist-title-signals' };
    }
    return { status: 'ambiguous', artwork: null, candidates: narrowed.length > 1 ? narrowed : identityMatches, reason: 'multiple-matches' };
  }

  function createWorkId(randomUUID) {
    const createUuid = randomUUID || globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
    if (typeof createUuid !== 'function') throw new Error('A UUID generator is required.');
    return `work_${createUuid()}`;
  }

  function createArtworkFromOccurrence(occurrence, options = {}) {
    const timestamp = options.now || new Date().toISOString();
    return {
      workId: occurrence.workId || createWorkId(options.randomUUID),
      title: String(occurrence.title || '').trim(),
      artistName: String(getArtist(occurrence) || '').trim(),
      artistId: occurrence.artistId ?? null,
      size: String(occurrence.size || '').trim(),
      medium: String(getMedium(occurrence) || '').trim(),
      year: String(occurrence.year || '').trim(),
      imageRef: getImageRef(occurrence),
      currentPrice: occurrence.price ?? '',
      collection: { owned: false, collectionNumber: '', dateAdded: '' },
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  return Object.freeze({ createArtworkFromOccurrence, createWorkId, findArtworkMatch, getArtist, getImageRef, getMedium, normalizeText });
});