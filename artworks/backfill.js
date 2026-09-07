(function initializeArtworkBackfill(root, factory) {
  'use strict';

  const api = factory(
    root.ArtworkIdentity || (typeof require === 'function' ? require('./identity') : null),
    root.ArtworkExhibitionIndex || (typeof require === 'function' ? require('./exhibition-index') : null)
  );
  root.ArtworkBackfill = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkBackfill(identity, exhibitionIndex) {
  'use strict';

  function signalCompatible(occurrence, artwork) {
    const occurrenceYear = identity.normalizeText(occurrence?.year);
    const artworkYear = identity.normalizeText(artwork?.year);
    const occurrenceSize = identity.normalizeText(occurrence?.size);
    const artworkSize = identity.normalizeText(artwork?.size);
    return !(occurrenceYear && artworkYear && occurrenceYear !== artworkYear)
      && !(occurrenceSize && artworkSize && occurrenceSize !== artworkSize);
  }

  function identityKey(value) {
    const title = identity.normalizeText(value?.title);
    const artist = identity.normalizeText(identity.getArtist(value));
    return title && artist ? `${artist}\u0000${title}` : '';
  }

  function listLegacyOccurrences(exhibitions) {
    const records = [];
    (Array.isArray(exhibitions) ? exhibitions : []).forEach((exhibition, exhibitionIndexValue) => {
      const sourceField = Array.isArray(exhibition?.works) ? 'works' : 'artWorks';
      const works = Array.isArray(exhibition?.[sourceField]) ? exhibition[sourceField] : [];
      works.forEach((work, occurrenceIndex) => {
        if (work?.workId) return;
        records.push({ exhibition, exhibitionIndex: exhibitionIndexValue, sourceField, occurrenceIndex, work });
      });
    });
    return records;
  }

  function canonicalCandidates(occurrence, artworks) {
    const key = identityKey(occurrence);
    if (!key) return [];
    return (Array.isArray(artworks) ? artworks : []).filter((artwork) => identityKey(artwork) === key && signalCompatible(occurrence, artwork));
  }

  function legacyGroupIsCompatible(records) {
    return records.every((left, leftIndex) => records.slice(leftIndex + 1).every((right) => (
      signalCompatible(left.work, right.work)
    )));
  }

  function summarize(classifications) {
    const counts = { UNIQUE: 0, CLEAR_MATCH: 0, AMBIGUOUS: 0 };
    classifications.forEach((item) => { counts[item.classification] += 1; });
    return {
      legacyOccurrences: classifications.length,
      ...counts,
      canonicalArtworksToCreate: new Set(classifications.filter((item) => item.classification === 'UNIQUE').map((item) => item.groupKey)).size,
      occurrencesToLink: counts.UNIQUE + counts.CLEAR_MATCH,
      existingArtworksToReuse: new Set(classifications.filter((item) => item.classification === 'CLEAR_MATCH').map((item) => item.workId)).size
    };
  }

  function analyzeBackfill({ artworks = [], exhibitions = [] } = {}) {
    const legacy = listLegacyOccurrences(exhibitions);
    const classifications = [];
    const unmatchedGroups = new Map();

    legacy.forEach((record) => {
      const key = identityKey(record.work);
      if (!key) {
        classifications.push({ ...record, classification: 'AMBIGUOUS', reason: 'missing-identity', candidates: [] });
        return;
      }
      const candidates = canonicalCandidates(record.work, artworks);
      if (candidates.length === 1) {
        classifications.push({ ...record, classification: 'CLEAR_MATCH', reason: 'artist-title-signals', workId: candidates[0].workId, candidates });
        return;
      }
      if (candidates.length > 1) {
        classifications.push({ ...record, classification: 'AMBIGUOUS', reason: 'multiple-compatible-artworks', candidates });
        return;
      }
      if (!unmatchedGroups.has(key)) unmatchedGroups.set(key, []);
      unmatchedGroups.get(key).push(record);
    });

    unmatchedGroups.forEach((records, key) => {
      const compatible = legacyGroupIsCompatible(records);
      records.forEach((record) => classifications.push({
        ...record,
        classification: compatible ? 'UNIQUE' : 'AMBIGUOUS',
        reason: compatible ? 'no-plausible-canonical' : 'conflicting-legacy-signals',
        groupKey: compatible ? key : '',
        candidates: []
      }));
    });

    classifications.sort((left, right) => left.exhibitionIndex - right.exhibitionIndex || left.occurrenceIndex - right.occurrenceIndex);
    return { classifications, summary: summarize(classifications) };
  }

  function occurrenceKey(exhibitionIndexValue, occurrenceId) {
    return `${exhibitionIndexValue}\u0000${String(occurrenceId)}`;
  }

  function latestRecord(records) {
    return records.slice().sort(exhibitionIndex.compareOccurrences).at(-1);
  }

  function hasImage(imageRef) {
    return Boolean(imageRef?.photoUrl || imageRef?.photoPreviewUrl || imageRef?.photoPath || imageRef?.photoPreviewPath);
  }

  function applyBackfill({ artworks = [], exhibitions = [], now = new Date().toISOString(), randomUUID } = {}) {
    const analysis = analyzeBackfill({ artworks, exhibitions });
    const nextArtworks = artworks.map((artwork) => ({ ...artwork }));
    const targets = new Map();
    const createdByGroup = new Map();

    analysis.classifications.forEach((item) => {
      if (item.classification === 'AMBIGUOUS') return;
      let workId = item.workId;
      if (item.classification === 'UNIQUE') {
        if (!createdByGroup.has(item.groupKey)) {
          const group = analysis.classifications.filter((candidate) => candidate.classification === 'UNIQUE' && candidate.groupKey === item.groupKey);
          const latest = latestRecord(group.map((candidate) => ({ exhibition: candidate.exhibition, work: candidate.work })));
          const created = identity.createArtworkFromOccurrence(latest.work, { now, randomUUID });
          createdByGroup.set(item.groupKey, created.workId);
          nextArtworks.push(created);
        }
        workId = createdByGroup.get(item.groupKey);
      }
      const key = occurrenceKey(item.exhibitionIndex, item.work.id);
      if (targets.has(key)) throw new Error(`Duplicate legacy occurrence id ${item.work.id} in exhibition ${item.exhibition.id}.`);
      targets.set(key, workId);
    });
    if (targets.size !== analysis.summary.occurrencesToLink) throw new Error('Backfill linkage plan is internally inconsistent.');

    const nextExhibitions = exhibitions.map((exhibition, exhibitionIndexValue) => {
      let changed = false;
      const update = (items) => (Array.isArray(items) ? items.map((work) => {
        const workId = targets.get(occurrenceKey(exhibitionIndexValue, work?.id));
        if (!workId || work.workId === workId) return work;
        changed = true;
        return { ...work, workId };
      }) : items);
      const works = update(exhibition.works);
      const artWorks = update(exhibition.artWorks);
      return changed ? { ...exhibition, works, artWorks } : exhibition;
    });

    const affectedWorkIds = new Set(targets.values());
    const index = exhibitionIndex.buildExhibitionIndex(nextExhibitions, nextArtworks);
    const rowsById = new Map(index.rows.map((row) => [row.workId, row]));
    const synchronizedArtworks = nextArtworks.map((artwork) => {
      if (!affectedWorkIds.has(artwork.workId)) return artwork;
      const row = rowsById.get(artwork.workId);
      const latest = row?.occurrences?.at(-1)?.work;
      if (!latest) return artwork;
      const imageRef = identity.getImageRef(latest);
      return {
        ...artwork,
        title: String(latest.title || artwork.title || '').trim(),
        artistName: String(identity.getArtist(latest) || artwork.artistName || '').trim(),
        artistId: latest.artistId ?? artwork.artistId ?? null,
        size: String(latest.size || artwork.size || '').trim(),
        medium: String(identity.getMedium(latest) || artwork.medium || '').trim(),
        year: String(latest.year || artwork.year || '').trim(),
        imageRef: hasImage(imageRef) ? imageRef : artwork.imageRef,
        currentPrice: latest.price ?? artwork.currentPrice ?? '',
        updatedAt: now
      };
    });

    return {
      artworks: synchronizedArtworks,
      exhibitions: nextExhibitions,
      analysis,
      result: {
        occurrencesLinked: targets.size,
        canonicalArtworksCreated: createdByGroup.size,
        existingArtworksReused: new Set(analysis.classifications.filter((item) => item.classification === 'CLEAR_MATCH').map((item) => item.workId)).size,
        ambiguousRemaining: analysis.summary.AMBIGUOUS
      }
    };
  }

  return Object.freeze({ analyzeBackfill, applyBackfill, identityKey, listLegacyOccurrences, signalCompatible });
});
