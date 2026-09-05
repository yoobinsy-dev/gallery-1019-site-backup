(function initializeExhibitionDetailInventoryStateController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailInventoryStateController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInventoryStateControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;

    function getDefaultInventoryUiState() {
      return {
        workSearch: '',
        workAdvanced: false,
        salesSearch: '',
        salesAdvanced: false,
        workListExpanded: true,
        selectedWorkIds: [],
        selectedSalesIds: [],
        salesUndoStack: [],
        workUndoStack: [],
        salesEditSnapshotIds: [],
        salesSearchQuery: '',
        salesSearchResults: [],
        salesAddBuffer: [],
        salesSearchHighlightIndex: -1,
        workSortField: null,
        workSortDirection: 'asc',
        salesSortField: null,
        salesSortDirection: 'asc',
        unsavedWorkCount: 0,
        workEditSnapshotIds: [],
        lastWorkCheckboxIndex: null,
        lastSalesCheckboxIndex: null,
        workFilters: {
          title: '',
          artist: '',
          price: '',
          materials: '',
          size: '',
          year: '',
          category: ''
        },
        salesFilters: {
          manualNumber: '',
          title: '',
          author: '',
          soldDateFrom: '',
          soldDateTo: '',
          buyerName: '',
          buyerPhone: '',
          paymentMethod: ''
        }
      };
    }

    function cloneInventoryUiState(uiState) {
      return JSON.parse(JSON.stringify(uiState));
    }

    function initializeInventoryData(exhibition) {
      if (!exhibition) return;
      exhibition.artWorks = Array.isArray(exhibition.artWorks)
        ? exhibition.artWorks
        : (Array.isArray(exhibition.works) ? exhibition.works : []);
      exhibition.artSoldWorks = Array.isArray(exhibition.artSoldWorks)
        ? exhibition.artSoldWorks
        : (Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : []);
      exhibition.goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
      exhibition.soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods : [];

      if (!state.inventoryUiStateByMode.art) {
        state.inventoryUiStateByMode.art = cloneInventoryUiState(getDefaultInventoryUiState());
      }
      if (!state.inventoryUiStateByMode.goods) {
        state.inventoryUiStateByMode.goods = cloneInventoryUiState(getDefaultInventoryUiState());
      }
    }

    function persistActiveInventoryUiState() {
      const mode = state.inventoryMode;
      if (!mode) return;
      const target = {
        workSearch: state.workSearch,
        workAdvanced: state.workAdvanced,
        salesSearch: state.salesSearch,
        salesAdvanced: state.salesAdvanced,
        workListExpanded: state.workListExpanded,
        selectedWorkIds: state.selectedWorkIds,
        selectedSalesIds: state.selectedSalesIds,
        salesUndoStack: state.salesUndoStack,
        workUndoStack: state.workUndoStack,
        salesEditSnapshotIds: state.salesEditSnapshotIds,
        salesSearchQuery: state.salesSearchQuery,
        salesSearchResults: state.salesSearchResults,
        salesAddBuffer: state.salesAddBuffer,
        salesSearchHighlightIndex: state.salesSearchHighlightIndex,
        workSortField: state.workSortField,
        workSortDirection: state.workSortDirection,
        salesSortField: state.salesSortField,
        salesSortDirection: state.salesSortDirection,
        unsavedWorkCount: state.unsavedWorkCount,
        workEditSnapshotIds: state.workEditSnapshotIds,
        lastWorkCheckboxIndex: state.lastWorkCheckboxIndex,
        lastSalesCheckboxIndex: state.lastSalesCheckboxIndex,
        workFilters: state.workFilters,
        salesFilters: state.salesFilters
      };
      state.inventoryUiStateByMode[mode] = cloneInventoryUiState(target);
    }

    function restoreInventoryUiState(mode) {
      const snapshot = state.inventoryUiStateByMode[mode]
        || cloneInventoryUiState(getDefaultInventoryUiState());
      state.workSearch = snapshot.workSearch;
      state.workAdvanced = snapshot.workAdvanced;
      state.salesSearch = snapshot.salesSearch;
      state.salesAdvanced = snapshot.salesAdvanced;
      state.workListExpanded = snapshot.workListExpanded;
      state.selectedWorkIds = snapshot.selectedWorkIds;
      state.selectedSalesIds = snapshot.selectedSalesIds;
      state.salesUndoStack = snapshot.salesUndoStack;
      state.workUndoStack = snapshot.workUndoStack;
      state.salesEditSnapshotIds = snapshot.salesEditSnapshotIds;
      state.salesSearchQuery = snapshot.salesSearchQuery;
      state.salesSearchResults = snapshot.salesSearchResults;
      state.salesAddBuffer = snapshot.salesAddBuffer;
      state.salesSearchHighlightIndex = snapshot.salesSearchHighlightIndex;
      state.workSortField = snapshot.workSortField;
      state.workSortDirection = snapshot.workSortDirection;
      state.salesSortField = snapshot.salesSortField;
      state.salesSortDirection = snapshot.salesSortDirection;
      state.unsavedWorkCount = snapshot.unsavedWorkCount;
      state.workEditSnapshotIds = snapshot.workEditSnapshotIds;
      state.lastWorkCheckboxIndex = snapshot.lastWorkCheckboxIndex;
      state.lastSalesCheckboxIndex = snapshot.lastSalesCheckboxIndex;
      state.workFilters = snapshot.workFilters;
      state.salesFilters = snapshot.salesFilters;
    }

    function syncInventoryMode(mode) {
      const exhibition = options.getCurrentExhibition();
      initializeInventoryData(exhibition);
      persistActiveInventoryUiState();

      if (state.inventoryMode === 'goods') {
        exhibition.goods = Array.isArray(exhibition.works) ? exhibition.works : exhibition.goods;
        exhibition.soldGoods = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.soldGoods;
      } else {
        exhibition.artWorks = Array.isArray(exhibition.works) ? exhibition.works : exhibition.artWorks;
        exhibition.artSoldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.artSoldWorks;
      }

      state.inventoryMode = mode;

      if (mode === 'goods') {
        exhibition.works = exhibition.goods;
        exhibition.soldWorks = exhibition.soldGoods;
      } else {
        exhibition.works = exhibition.artWorks;
        exhibition.soldWorks = exhibition.artSoldWorks;
      }

      restoreInventoryUiState(mode);
    }

    return Object.freeze({
      getDefaultInventoryUiState,
      cloneInventoryUiState,
      initializeInventoryData,
      persistActiveInventoryUiState,
      restoreInventoryUiState,
      syncInventoryMode
    });
  }

  return Object.freeze({ create });
});