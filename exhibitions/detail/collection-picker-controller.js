(function initializeExhibitionCollectionPickerController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailCollectionPickerController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExhibitionCollectionPickerControllerModule() {
  'use strict';

  function linkedWorkIds(exhibition) {
    return new Set((exhibition?.works || []).map((work) => work.workId).filter(Boolean));
  }

  function buildCandidates(artworks, exhibition) {
    const linked = linkedWorkIds(exhibition);
    return (artworks || []).filter((artwork) => artwork.collection?.owned === true && !linked.has(artwork.workId));
  }

  function createOccurrence(artwork, options) {
    const imageRef = artwork.imageRef || {};
    return {
      id: options.createOccurrenceId(),
      workId: artwork.workId,
      createdByUserId: options.getCurrentUserId(),
      manualNumber: '',
      photoName: '',
      photoUrl: imageRef.photoUrl || '',
      photoPreviewUrl: imageRef.photoPreviewUrl || '',
      photoPath: imageRef.photoPath || '',
      photoPreviewPath: imageRef.photoPreviewPath || '',
      photoDataUrl: '',
      photoPreviewDataUrl: '',
      photoMimeType: '',
      photoByteSize: 0,
      title: artwork.title || '',
      author: artwork.artistName || '',
      price: artwork.currentPrice ?? '',
      materials: artwork.medium || '',
      size: artwork.size || '',
      year: artwork.year || '',
      category: '',
      quantity: '',
      wasSaved: false,
      saved: false
    };
  }

  function createOccurrences(artworks, exhibition, workIds, options) {
    const selected = new Set(workIds);
    const linked = linkedWorkIds(exhibition);
    return (artworks || [])
      .filter((artwork) => selected.has(artwork.workId) && artwork.collection?.owned === true && !linked.has(artwork.workId))
      .map((artwork) => {
        linked.add(artwork.workId);
        return createOccurrence(artwork, options);
      });
  }

  function create(options = {}) {
    function open() {
      const candidates = buildCandidates(options.getArtworks(), options.getCurrentExhibition());
      options.picker.open({
        title: '소장품에서 추가',
        confirmLabel: '전시에 추가',
        candidates,
        onConfirm(workIds) {
          const occurrences = createOccurrences(options.getArtworks(), options.getCurrentExhibition(), workIds, options);
          if (!occurrences.length) return;
          options.addOccurrences(occurrences);
          options.picker.close();
        }
      });
    }

    return Object.freeze({ open });
  }

  return Object.freeze({ buildCandidates, create, createOccurrence, createOccurrences, linkedWorkIds });
});