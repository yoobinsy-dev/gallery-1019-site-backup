(function initializeArtworkSelectionController(root) {
  'use strict';

  function create(options = {}) {
    let table = null;
    let selected = [];

    function handleSelection(data) {
      selected = data.slice();
      options.onChange?.(selected);
    }

    return Object.freeze({
      bind(nextTable) {
        if (table) table.off('rowSelectionChanged', handleSelection);
        table = nextTable;
        selected = [];
        table?.on('rowSelectionChanged', handleSelection);
        options.onChange?.(selected);
      },
      clear() {
        table?.deselectRow();
      },
      getSelected() {
        return selected.slice();
      }
    });
  }

  root.ArtworkSelectionController = Object.freeze({ create });
})(typeof globalThis !== 'undefined' ? globalThis : this);