(function initializeArtworkFiltersController(root) {
  'use strict';

  function create(options = {}) {
    const input = options.input;
    let table = null;

    function apply() {
      if (!table) return;
      const query = String(input.value || '').trim().toLocaleLowerCase();
      if (!query) {
        table.clearFilter();
        return;
      }
      table.setFilter((row) => [row.title, row.artistName, row.medium, row.size, row.year, row.latestExhibitionName, row.collection?.collectionNumber]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query)));
    }

    input.addEventListener('input', apply);
    return Object.freeze({
      bind(nextTable) {
        table = nextTable;
        apply();
      },
      reset() {
        input.value = '';
        apply();
      }
    });
  }

  root.ArtworkFiltersController = Object.freeze({ create });
})(typeof globalThis !== 'undefined' ? globalThis : this);