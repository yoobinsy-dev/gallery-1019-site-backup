(function initializeCollectionAddController(root, factory) {
  'use strict';

  const api = factory();
  root.ArtworkCollectionAddController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCollectionAddControllerModule() {
  'use strict';

  function buildCandidates(artworks, exhibitionRows) {
    const exhibitedIds = new Set((exhibitionRows || []).map((row) => row.workId));
    return (artworks || [])
      .filter((artwork) => exhibitedIds.has(artwork.workId) && artwork.collection?.owned !== true)
      .map((artwork) => ({ ...artwork, exhibitionHistory: exhibitionRows.find((row) => row.workId === artwork.workId)?.exhibitionHistory || [] }));
  }

  function nextCollectionNumbers(artworks, count, year) {
    const prefix = `COL-${year}-`;
    const used = new Set((artworks || []).map((artwork) => String(artwork.collection?.collectionNumber || '')).filter(Boolean));
    const numbers = [];
    let sequence = Math.max(0, ...[...used]
      .filter((number) => number.startsWith(prefix))
      .map((number) => Number(number.slice(prefix.length)))
      .filter(Number.isInteger)) + 1;
    while (numbers.length < count) {
      const number = `${prefix}${String(sequence).padStart(3, '0')}`;
      if (!used.has(number)) {
        used.add(number);
        numbers.push(number);
      }
      sequence += 1;
    }
    return numbers;
  }

  function localDate(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function addToCollection(artworks, workIds, confirmedAt) {
    const selected = new Set(workIds);
    const eligible = (artworks || []).filter((artwork) => selected.has(artwork.workId) && artwork.collection?.owned !== true);
    const dateAdded = localDate(confirmedAt);
    const numbers = nextCollectionNumbers(artworks, eligible.length, confirmedAt.getFullYear());
    let numberIndex = 0;
    const updatedAt = confirmedAt.toISOString();
    return {
      artworks: artworks.map((artwork) => eligible.some((item) => item.workId === artwork.workId)
        ? { ...artwork, collection: { ...artwork.collection, owned: true, collectionNumber: numbers[numberIndex++], dateAdded }, updatedAt }
        : artwork),
      addedCount: eligible.length,
      dateAdded
    };
  }

  function create(options = {}) {
    function open() {
      const artworks = options.getArtworks();
      const candidates = buildCandidates(artworks, options.getExhibitionRows());
      options.picker.open({
        title: '기존 작품에서 추가',
        confirmLabel: '소장품에 추가',
        candidates,
        onConfirm(workIds) {
          const result = addToCollection(options.getArtworks(), workIds, options.now());
          if (!result.addedCount) return;
          if (!options.saveArtworks(result.artworks)) return;
          options.onAdded(result.artworks, result.addedCount);
          options.picker.close();
        }
      });
    }

    return Object.freeze({ open });
  }

  return Object.freeze({ addToCollection, buildCandidates, create, localDate, nextCollectionNumbers });
});