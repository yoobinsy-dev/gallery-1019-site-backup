(function initializeArtworkToolbarController(root) {
  'use strict';

  function create(options = {}) {
    const addButton = options.document.getElementById('artwork-add-btn');
      const addExistingButton = options.document.getElementById('artwork-add-existing-btn');
    const editButton = options.document.getElementById('artwork-edit-btn');
    const removeButton = options.document.getElementById('artwork-remove-btn');
    const exhibitionButton = options.document.getElementById('artwork-exhibition-btn');
    const exportButton = options.document.getElementById('artwork-export-btn');

    addButton.addEventListener('click', () => options.onAdd());
      addExistingButton.addEventListener('click', () => options.onAddExisting());
    editButton.addEventListener('click', () => options.onEdit());
    removeButton.addEventListener('click', () => options.onRemove());
    exhibitionButton.addEventListener('click', () => { root.location.href = 'exhibitions.html'; });
    exportButton.addEventListener('click', () => options.onExport());

    return Object.freeze({
      update({ tab, selectedCount }) {
        addButton.hidden = tab !== 'collection';
          addExistingButton.hidden = tab !== 'collection';
        exhibitionButton.hidden = tab !== 'past';
        editButton.disabled = selectedCount !== 1;
        removeButton.hidden = tab !== 'collection';
        removeButton.disabled = selectedCount === 0;
      }
    });
  }

  root.ArtworkToolbarController = Object.freeze({ create });
})(typeof globalThis !== 'undefined' ? globalThis : this);