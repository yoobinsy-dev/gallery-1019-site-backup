(function initializeArtworkSyncService(root, factory) {
  'use strict';

  const api = factory(
    root.ArtworkExhibitionIndex || (typeof require === 'function' ? require('./exhibition-index') : null),
    root.ArtworkIdentity || (typeof require === 'function' ? require('./identity') : null)
  );
  root.ArtworkSyncService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  })(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkSyncService(exhibitionIndex, identity) {
  'use strict';

  const IDENTITY_FIELDS = Object.freeze(['title', 'artistName', 'size', 'medium', 'year', 'imageRef']);

  function applyCanonicalFieldsToOccurrence(occurrence, artwork) {
    const imageRef = artwork.imageRef || {};
    return {
      ...occurrence,
      workId: artwork.workId,
      title: artwork.title,
      author: artwork.artistName,
      artistId: artwork.artistId ?? occurrence.artistId ?? null,
      size: artwork.size,
      materials: artwork.medium,
      year: artwork.year,
      photoUrl: imageRef.photoUrl || '',
      photoPreviewUrl: imageRef.photoPreviewUrl || imageRef.photoUrl || '',
      photoPath: imageRef.photoPath || '',
      photoPreviewPath: imageRef.photoPreviewPath || ''
    };
  }

  function updateOccurrenceCollections(exhibition, workId, updater) {
    let changed = false;
    const update = (items) => (Array.isArray(items) ? items.map((item) => {
      if (item.workId !== workId) return item;
      changed = true;
      return updater(item);
    }) : items);
    const works = update(exhibition.works);
    const artWorks = update(exhibition.artWorks);
    return changed ? { ...exhibition, works, artWorks, updatedAt: new Date().toISOString() } : exhibition;
  }

  function synchronizeCanonicalEdit({ artworks, exhibitions, workId, changes, now = new Date().toISOString() }) {
    const nextArtworks = artworks.map((artwork) => artwork.workId === workId
      ? { ...artwork, ...changes, workId, updatedAt: now }
      : artwork);
    const updatedArtwork = nextArtworks.find((artwork) => artwork.workId === workId);
    if (!updatedArtwork) return { artworks, exhibitions };
    const identityChanged = IDENTITY_FIELDS.some((field) => Object.hasOwn(changes, field));
    const nextExhibitions = identityChanged
      ? exhibitions.map((exhibition) => updateOccurrenceCollections(exhibition, workId, (occurrence) => applyCanonicalFieldsToOccurrence(occurrence, updatedArtwork)))
      : exhibitions;
    return { artworks: nextArtworks, exhibitions: nextExhibitions };
  }

  function synchronizeOccurrenceEdit({ artworks, exhibitions, exhibitionId, occurrenceId, changes, now = new Date().toISOString() }) {
    let editedWork = null;
    const nextExhibitions = exhibitions.map((exhibition) => {
      if (String(exhibition.id) !== String(exhibitionId)) return exhibition;
      const update = (items) => (Array.isArray(items) ? items.map((item) => {
        if (String(item.id) !== String(occurrenceId)) return item;
        editedWork = { ...item, ...changes };
        return editedWork;
      }) : items);
      return { ...exhibition, works: update(exhibition.works), artWorks: update(exhibition.artWorks), updatedAt: now };
    });
    if (!editedWork?.workId) return { artworks, exhibitions: nextExhibitions };

    const identityChanges = {};
    if (Object.hasOwn(changes, 'title')) identityChanges.title = changes.title;
    if (Object.hasOwn(changes, 'author')) identityChanges.artistName = changes.author;
    if (Object.hasOwn(changes, 'artistId')) identityChanges.artistId = changes.artistId;
    if (Object.hasOwn(changes, 'size')) identityChanges.size = changes.size;
    if (Object.hasOwn(changes, 'materials')) identityChanges.medium = changes.materials;
    if (Object.hasOwn(changes, 'year')) identityChanges.year = changes.year;
    if (['photoUrl', 'photoPreviewUrl', 'photoPath', 'photoPreviewPath'].some((field) => Object.hasOwn(changes, field))) {
      const artwork = artworks.find((candidate) => candidate.workId === editedWork.workId);
      identityChanges.imageRef = {
        ...(artwork?.imageRef || {}),
        photoUrl: editedWork.photoUrl || '',
        photoPreviewUrl: editedWork.photoPreviewUrl || editedWork.photoUrl || '',
        photoPath: editedWork.photoPath || '',
        photoPreviewPath: editedWork.photoPreviewPath || ''
      };
    }

    const index = exhibitionIndex.buildExhibitionIndex(nextExhibitions, artworks);
    const row = index.rows.find((candidate) => candidate.workId === editedWork.workId);
    if (Object.hasOwn(changes, 'price') && String(row?.latestExhibitionId) === String(exhibitionId)) {
      identityChanges.currentPrice = changes.price;
    }
    const nextArtworks = artworks.map((artwork) => artwork.workId === editedWork.workId
      ? { ...artwork, ...identityChanges, updatedAt: now }
      : artwork);
    return { artworks: nextArtworks, exhibitions: nextExhibitions };
  }

  function updateLatestOccurrence({ artworks, exhibitions, workId, changes, now }) {
    const row = exhibitionIndex.buildExhibitionIndex(exhibitions, artworks).rows.find((candidate) => candidate.workId === workId);
    if (!row) return { artworks, exhibitions };
    return synchronizeOccurrenceEdit({ artworks, exhibitions, exhibitionId: row.latestExhibitionId, occurrenceId: row.latestOccurrenceId, changes, now });
  }

  function synchronizeSavedOccurrence({ artworks, exhibitions, exhibition, occurrence, now = new Date().toISOString(), randomUUID }) {
    const currentArtworks = Array.isArray(artworks) ? artworks.slice() : [];
    let match = identity.findArtworkMatch(occurrence, currentArtworks);
    if (match.status === 'ambiguous') return { artworks, status: 'ambiguous', candidates: match.candidates };
    if (match.status === 'unmatched' && occurrence.workId) return { artworks, status: 'unknown-workId' };
    if (match.status === 'unmatched') {
      const created = identity.createArtworkFromOccurrence(occurrence, { now, randomUUID });
      currentArtworks.push(created);
      match = { status: 'matched', artwork: created };
    }

    occurrence.workId = match.artwork.workId;
    const mergedExhibitions = (Array.isArray(exhibitions) ? exhibitions : []).map((item) => (
      String(item.id) === String(exhibition.id) ? exhibition : item
    ));
    if (!mergedExhibitions.some((item) => String(item.id) === String(exhibition.id))) mergedExhibitions.push(exhibition);
    const indexed = exhibitionIndex.buildExhibitionIndex(mergedExhibitions, currentArtworks);
    const latest = indexed.rows.find((row) => row.workId === occurrence.workId);
    const changes = {
      title: occurrence.title || '',
      artistName: occurrence.author || '',
      artistId: occurrence.artistId ?? match.artwork.artistId ?? null,
      size: occurrence.size || '',
      medium: occurrence.materials || '',
      year: occurrence.year || '',
      imageRef: identity.getImageRef(occurrence)
    };
    if (String(latest?.latestExhibitionId) === String(exhibition.id)
      && String(latest?.latestOccurrenceId) === String(occurrence.id)) {
      changes.currentPrice = occurrence.price ?? '';
    }
    return {
      artworks: currentArtworks.map((artwork) => artwork.workId === occurrence.workId ? { ...artwork, ...changes, updatedAt: now } : artwork),
      status: match.reason === 'artist-title' || match.reason === 'artist-title-signals' ? 'linked' : 'synchronized',
      workId: occurrence.workId
    };
  }

  function resolveOccurrence({ artworks, exhibitions, exhibitionId, occurrenceId, workId, now = new Date().toISOString(), randomUUID }) {
    const exhibition = exhibitions.find((item) => String(item.id) === String(exhibitionId));
    const occurrence = exhibitionIndex.getExhibitionWorks(exhibition).find((item) => String(item.id) === String(occurrenceId));
    if (!exhibition || !occurrence) return { artworks, exhibitions, status: 'not-found' };
    let targetWorkId = workId;
    let nextArtworks = artworks.slice();
    if (!targetWorkId) {
      const created = identity.createArtworkFromOccurrence(occurrence, { now, randomUUID });
      targetWorkId = created.workId;
      nextArtworks.push(created);
    }
    if (!nextArtworks.some((artwork) => artwork.workId === targetWorkId)) return { artworks, exhibitions, status: 'unknown-workId' };
    const nextExhibitions = exhibitions.map((item) => {
      if (String(item.id) !== String(exhibitionId)) return item;
      return updateOccurrenceCollections({ ...item, works: item.works || item.artWorks }, occurrence.workId, (value) => value);
    });
    const linkedExhibitions = nextExhibitions.map((item) => {
      if (String(item.id) !== String(exhibitionId)) return item;
      const update = (items) => (Array.isArray(items) ? items.map((entry) => String(entry.id) === String(occurrenceId) ? { ...entry, workId: targetWorkId } : entry) : items);
      return { ...item, works: update(item.works), artWorks: update(item.artWorks), updatedAt: now };
    });
    const linkedExhibition = linkedExhibitions.find((item) => String(item.id) === String(exhibitionId));
    const linkedOccurrence = exhibitionIndex.getExhibitionWorks(linkedExhibition).find((item) => String(item.id) === String(occurrenceId));
    const synchronized = synchronizeSavedOccurrence({ artworks: nextArtworks, exhibitions: linkedExhibitions, exhibition: linkedExhibition, occurrence: linkedOccurrence, now, randomUUID });
    return { artworks: synchronized.artworks, exhibitions: linkedExhibitions, status: 'resolved', workId: targetWorkId };
  }

  return Object.freeze({ IDENTITY_FIELDS, applyCanonicalFieldsToOccurrence, resolveOccurrence, synchronizeCanonicalEdit, synchronizeOccurrenceEdit, synchronizeSavedOccurrence, updateLatestOccurrence });
});