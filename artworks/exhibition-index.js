(function initializeArtworkExhibitionIndex(root, factory) {
  'use strict';

  const api = factory(root.ArtworkIdentity || (typeof require === 'function' ? require('./identity') : null));
  root.ArtworkExhibitionIndex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkExhibitionIndex(identity) {
  'use strict';

  function getExhibitionWorks(exhibition) {
    if (Array.isArray(exhibition?.works)) return exhibition.works;
    return Array.isArray(exhibition?.artWorks) ? exhibition.artWorks : [];
  }

  function getExhibitionDate(exhibition) {
    return String(exhibition?.endDate || exhibition?.startDate || '');
  }

  function compareOccurrences(left, right) {
    const dateResult = getExhibitionDate(left.exhibition).localeCompare(getExhibitionDate(right.exhibition));
    if (dateResult !== 0) return dateResult;
    return String(left.exhibition?.id || '').localeCompare(String(right.exhibition?.id || ''), 'en', { numeric: true });
  }

  function isOccurrenceSold(exhibition, work) {
    const soldRecords = [exhibition?.soldWorks, exhibition?.artSoldWorks]
      .filter(Array.isArray)
      .flat();
    return soldRecords.some((sold) => {
      const itemType = String(sold?.itemType || '작품').trim();
      if (itemType && itemType !== '작품') return false;
      return String(sold?.workId ?? '') === String(work?.id ?? '')
        || (work?.workId && String(sold?.workId ?? '') === String(work.workId));
    });
  }

  function buildExhibitionIndex(exhibitions, artworks) {
    const canonical = Array.isArray(artworks) ? artworks : [];
    const groups = new Map();
    const unresolved = [];

    (Array.isArray(exhibitions) ? exhibitions : []).forEach((exhibition) => {
      getExhibitionWorks(exhibition).forEach((work) => {
        const match = identity.findArtworkMatch(work, canonical);
        if (match.status !== 'matched') {
          unresolved.push({ exhibition, work, resolution: match });
          return;
        }
        const workId = match.artwork.workId;
        if (!groups.has(workId)) groups.set(workId, []);
        groups.get(workId).push({ exhibition, work });
      });
    });

    const rows = [];
    groups.forEach((occurrences, workId) => {
      occurrences.sort(compareOccurrences);
      const artwork = canonical.find((candidate) => candidate.workId === workId);
      const latest = occurrences[occurrences.length - 1];
      rows.push({
        ...artwork,
        workId,
        ownershipSaleStatus: artwork?.collection?.owned === true
          ? 'collection'
          : (occurrences.some(({ exhibition, work }) => isOccurrenceSold(exhibition, work)) ? 'sold' : ''),
        latestPrice: latest.work.price ?? '',
        latestExhibitionDate: getExhibitionDate(latest.exhibition),
        latestExhibitionName: latest.exhibition.title || latest.exhibition.name || '',
        latestExhibitionId: latest.exhibition.id,
        latestOccurrenceId: latest.work.id,
        exhibitionHistory: occurrences.map(({ exhibition }) => ({
          exhibitionId: exhibition.id,
          name: exhibition.title || exhibition.name || '',
          startDate: exhibition.startDate || '',
          endDate: exhibition.endDate || ''
        })),
        occurrences
      });
    });

    return { rows, unresolved };
  }

  function buildCollectionRows(artworks, exhibitions) {
    const index = buildExhibitionIndex(exhibitions, artworks);
    const historyById = new Map(index.rows.map((row) => [row.workId, row.exhibitionHistory]));
    return (Array.isArray(artworks) ? artworks : [])
      .filter((artwork) => artwork.collection?.owned === true)
      .map((artwork) => ({ ...artwork, exhibitionHistory: historyById.get(artwork.workId) || [] }));
  }

  return Object.freeze({ buildCollectionRows, buildExhibitionIndex, compareOccurrences, getExhibitionDate, getExhibitionWorks, isOccurrenceSold });
});