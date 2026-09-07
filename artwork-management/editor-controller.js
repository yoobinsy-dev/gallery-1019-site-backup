(function initializeArtworkEditorController(root) {
  'use strict';

  function create(options = {}) {
    const document = options.document;
    const dialog = document.getElementById('artwork-editor');
    const form = document.getElementById('artwork-editor-form');
    const resolutionDialog = document.getElementById('artwork-resolution-dialog');
    const resolutionForm = document.getElementById('artwork-resolution-form');
    let unresolved = [];
    let active = null;
    let tab = 'collection';

    function field(name) {
      return form.elements.namedItem(name);
    }

    function populate(artwork, activeTab) {
      active = artwork || null;
      tab = activeTab;
      document.getElementById('artwork-editor-title').textContent = artwork ? '작품 수정' : '소장품 추가';
      field('title').value = artwork?.title || '';
      field('artistName').value = artwork?.artistName || '';
      field('currentPrice').value = activeTab === 'past' ? artwork?.latestPrice ?? '' : artwork?.currentPrice ?? '';
      field('size').value = artwork?.size || '';
      field('medium').value = artwork?.medium || '';
      field('year').value = artwork?.year || '';
      field('photoUrl').value = artwork?.imageRef?.photoUrl || '';
      field('collectionNumber').value = artwork?.collection?.collectionNumber || '';
      field('dateAdded').value = artwork?.collection?.dateAdded || '';
      field('owned').checked = artwork?.collection?.owned === true || !artwork;
      document.querySelectorAll('[data-collection-field]').forEach((element) => { element.hidden = activeTab === 'past'; });
      dialog.showModal();
    }

    function close() {
      dialog.close();
      form.reset();
      active = null;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        title: field('title').value.trim(),
        artistName: field('artistName').value.trim(),
        currentPrice: field('currentPrice').value.trim(),
        size: field('size').value.trim(),
        medium: field('medium').value.trim(),
        year: field('year').value.trim(),
        imageRef: { photoUrl: field('photoUrl').value.trim(), photoPreviewUrl: field('photoUrl').value.trim() }
      };
      if (tab === 'collection') {
        values.collection = {
          owned: field('owned').checked,
          collectionNumber: field('collectionNumber').value.trim(),
          dateAdded: field('dateAdded').value
        };
      }
      const accepted = active ? options.onUpdate(active, values, tab) : options.onCreate(values);
      if (accepted !== false) close();
    });
    document.getElementById('artwork-editor-cancel').addEventListener('click', close);

    resolutionForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const occurrenceIndex = Number(resolutionForm.elements.namedItem('occurrence').value);
      const selected = unresolved[occurrenceIndex];
      const workId = resolutionForm.elements.namedItem('workId').value;
      if (!selected || !workId) return;
      options.onResolve(selected, workId);
      resolutionDialog.close();
    });
    document.getElementById('artwork-resolution-create').addEventListener('click', () => {
      const occurrenceIndex = Number(resolutionForm.elements.namedItem('occurrence').value);
      const selected = unresolved[occurrenceIndex];
      if (!selected) return;
      options.onResolve(selected, null);
      resolutionDialog.close();
    });
    document.getElementById('artwork-resolution-cancel').addEventListener('click', () => resolutionDialog.close());

    return Object.freeze({
      openCreate: () => populate(null, 'collection'),
      openEdit: populate,
      openResolution(items, artworks) {
        unresolved = items;
        resolutionForm.elements.namedItem('occurrence').innerHTML = items.map((item, index) => `<option value="${index}">${item.work.title} · ${item.work.author} · ${item.exhibition.title || item.exhibition.name}</option>`).join('');
        resolutionForm.elements.namedItem('workId').innerHTML = '<option value="">기존 작품 선택</option>' + artworks.map((artwork) => `<option value="${artwork.workId}">${artwork.title} · ${artwork.artistName} · ${artwork.year || '-'}</option>`).join('');
        resolutionDialog.showModal();
      }
    });
  }

  root.ArtworkEditorController = Object.freeze({ create });
})(typeof globalThis !== 'undefined' ? globalThis : this);