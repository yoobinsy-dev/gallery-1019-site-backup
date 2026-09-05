const test = require('node:test');
const assert = require('node:assert/strict');

const inventoryStateController = require('../../exhibitions/detail/inventory-state-controller');

function createState() {
  return {
    inventoryMode: 'art',
    inventoryUiStateByMode: { art: null, goods: null },
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
      title: '', artist: '', price: '', materials: '', size: '', year: '', category: ''
    },
    salesFilters: {
      manualNumber: '', title: '', author: '', soldDateFrom: '', soldDateTo: '',
      buyerName: '', buyerPhone: '', paymentMethod: ''
    }
  };
}

function createController(state, exhibition) {
  return inventoryStateController.create({
    state,
    getCurrentExhibition: () => exhibition
  });
}

test('inventory UI defaults preserve the exact shape and isolate nested values', () => {
  const state = createState();
  const controller = createController(state, {});
  const first = controller.getDefaultInventoryUiState();
  const second = controller.getDefaultInventoryUiState();

  assert.deepEqual(first, createStateWithoutModeFields());
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.selectedWorkIds, second.selectedWorkIds);
  assert.notStrictEqual(first.workFilters, second.workFilters);
  assert.notStrictEqual(first.salesFilters, second.salesFilters);

  first.selectedWorkIds.push('changed');
  first.workFilters.title = 'changed';
  assert.deepEqual(second.selectedWorkIds, []);
  assert.equal(second.workFilters.title, '');
});

test('inventory mode preserves independent art and goods UI state across a round trip', () => {
  const state = createState();
  const exhibition = {
    artWorks: [{ id: 'art' }],
    artSoldWorks: [{ id: 'art-sale' }],
    goods: [{ id: 'goods' }],
    soldGoods: [{ id: 'goods-sale' }],
    works: [{ id: 'art' }],
    soldWorks: [{ id: 'art-sale' }]
  };
  exhibition.works = exhibition.artWorks;
  exhibition.soldWorks = exhibition.artSoldWorks;
  const controller = createController(state, exhibition);

  controller.initializeInventoryData(exhibition);
  state.workSearch = 'art search';
  state.selectedWorkIds = ['art-selected'];
  state.workFilters = { ...state.workFilters, artist: 'art artist' };
  controller.syncInventoryMode('goods');

  assert.equal(state.workSearch, '');
  assert.deepEqual(state.selectedWorkIds, []);
  state.workSearch = 'goods search';
  state.selectedWorkIds = ['goods-selected'];
  state.workFilters = { ...state.workFilters, category: 'goods category' };

  controller.syncInventoryMode('art');
  assert.equal(state.workSearch, 'art search');
  assert.deepEqual(state.selectedWorkIds, ['art-selected']);
  assert.equal(state.workFilters.artist, 'art artist');
  assert.strictEqual(exhibition.works, exhibition.artWorks);
  assert.strictEqual(exhibition.soldWorks, exhibition.artSoldWorks);

  controller.syncInventoryMode('goods');
  assert.equal(state.workSearch, 'goods search');
  assert.deepEqual(state.selectedWorkIds, ['goods-selected']);
  assert.equal(state.workFilters.category, 'goods category');
  assert.strictEqual(exhibition.works, exhibition.goods);
  assert.strictEqual(exhibition.soldWorks, exhibition.soldGoods);
});

test('inventory data uses legacy art fallbacks and keeps strict alias pointer identity', () => {
  const state = createState();
  const legacyWorks = [{ id: 'legacy-art' }];
  const legacySoldWorks = [{ id: 'legacy-sale' }];
  const exhibition = { works: legacyWorks, soldWorks: legacySoldWorks };
  const controller = createController(state, exhibition);

  controller.initializeInventoryData(exhibition);
  assert.strictEqual(exhibition.artWorks, legacyWorks);
  assert.strictEqual(exhibition.artSoldWorks, legacySoldWorks);
  assert.deepEqual(exhibition.goods, []);
  assert.deepEqual(exhibition.soldGoods, []);
  assert.notStrictEqual(exhibition.goods, exhibition.soldGoods);
  assert.notStrictEqual(state.inventoryUiStateByMode.art, state.inventoryUiStateByMode.goods);
  assert.notStrictEqual(
    state.inventoryUiStateByMode.art.workFilters,
    state.inventoryUiStateByMode.goods.workFilters
  );

  controller.syncInventoryMode('goods');
  assert.strictEqual(exhibition.works, exhibition.goods);
  assert.strictEqual(exhibition.soldWorks, exhibition.soldGoods);
  controller.syncInventoryMode('art');
  assert.strictEqual(exhibition.works, legacyWorks);
  assert.strictEqual(exhibition.soldWorks, legacySoldWorks);
});

function createStateWithoutModeFields() {
  const state = createState();
  delete state.inventoryMode;
  delete state.inventoryUiStateByMode;
  return state;
}