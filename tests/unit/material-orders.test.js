const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const mergePlanning = require('../../material-orders/merge-planning');
const model = require('../../material-orders/model');
const rowProjection = require('../../material-orders/row-projection');
const tableView = require('../../material-orders/table-view');
const gridNavigation = require('../../material-orders/grid-navigation');
const { createStorageAdapter } = require('../../storage/storage-adapter');
const materialOrdersRepository = require('../../storage/material-orders-repository');

function loadOrders(globals = {}) {
  return exposeIifeFunctions('pottery-material-orders.js', [
    'state', 'normalizeOrder', 'normalizeItem', 'getLineTotal', 'getOrderTotal', 'getOrdersForMonth',
    'buildOrderNumberMap', 'compareOrders', 'inferOrderWideByPattern', 'normalizeDateISO',
    'getProductOptions', 'loadOrders', 'saveOrders'
  ], { globals: {
    PotteryMaterialOrdersMergePlanning: mergePlanning,
    PotteryMaterialOrdersModel: model,
    PotteryMaterialOrdersRowProjection: rowProjection,
    PotteryMaterialOrdersTableView: tableView,
    PotteryMaterialOrdersGridNavigation: gridNavigation,
    MaterialOrdersRepository: {
      repository: materialOrdersRepository.createMaterialOrdersRepository(
        createStorageAdapter({
          storage: globals.localStorage || {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
          }
        })
      )
    },
    ...globals
  } }).exposed;
}

test('material orders persistence characterizes product cache, normalized orders, and exact writes', () => {
  const values = new Map([
    ['pottery-material-product-options-v1', JSON.stringify([' Clay ', '', null, 'Glaze'])],
    ['pottery-material-orders-v1', JSON.stringify([{
      id: 'order-1', orderDate: '2026-08-01', unknownOrder: 'drop',
      items: [{ id: 'item-1', product: 'Clay', quantity: 2, unknownItem: 'drop' }]
    }])]
  ]);
  const writes = [];
  const orders = loadOrders({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { writes.push([key, value]); return undefined; }
    }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(orders.getProductOptions())), ['Clay', 'Glaze']);
  orders.loadOrders();
  assert.equal(orders.state.orders[0].unknownOrder, undefined);
  assert.equal(orders.state.orders[0].items[0].unknownItem, undefined);
  assert.equal(orders.saveOrders(), undefined);
  assert.deepEqual(writes, [['pottery-material-orders-v1', JSON.stringify(orders.state.orders)]]);

  values.set('pottery-material-orders-v1', '{malformed');
  values.set('pottery-material-product-options-v1', '{}');
  orders.loadOrders();
  assert.deepEqual(JSON.parse(JSON.stringify(orders.state.orders)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(orders.getProductOptions())), []);
});

test('material orders repository preserves raw arrays and exact order serialization', () => {
  const values = new Map([
    ['pottery-material-product-options-v1', '[{"unknown":"product"}]'],
    ['pottery-material-orders-v1', '[{"unknown":"order"}]']
  ]);
  const writes = [];
  const repository = materialOrdersRepository.createMaterialOrdersRepository({
    read(key) { return values.get(key) ?? null; },
    write(key, value) { writes.push([key, value]); return undefined; }
  });
  assert.equal(repository.loadProductOptions()[0].unknown, 'product');
  assert.equal(repository.loadOrders()[0].unknown, 'order');
  const orders = [{ id: 1, legacyField: 'keep' }];
  assert.equal(repository.saveOrders(orders), undefined);
  assert.deepEqual(writes, [['pottery-material-orders-v1', JSON.stringify(orders)]]);
});

test('material orders characterize totals, discounts, shipping, and inferred order-wide fields', () => {
  const orders = loadOrders();
  const normalized = orders.normalizeOrder({
    id: 'CHARACTERIZATION_TEST_ORDER',
    orderDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    items: [
      { id: 'a', category: '흙', site: '클레이어', product: 'Clay A', quantity: 2, price: 10000.9, discount: 1000, shippingFee: 500 },
      { id: 'b', category: '유약', site: 'unknown', product: 'Glaze B', quantity: 1, price: 20000, discount: null, shippingFee: null }
    ]
  });
  assert.equal(normalized.orderWideDiscount, true);
  assert.equal(normalized.orderWideShipping, true);
  assert.equal(normalized.items[1].site, '클레이어');
  assert.equal(orders.getOrderTotal(normalized), 29500);
  assert.equal(orders.getOrderTotal({ items: [{ price: 100, discount: 200 }] }), null);
});

test('material orders characterize month filtering, grouped order sequence, and stable numbering', () => {
  const orders = loadOrders();
  orders.state.orders = [
    { id: 'b', orderDate: '2026-08-02', createdAt: '2026-08-02T01:00:00Z', items: [{}] },
    { id: 'a', orderDate: '2026-08-02', createdAt: '2026-08-02T00:00:00Z', items: [{}] },
    { id: 'c', orderDate: '2026-07-31', createdAt: '2026-07-31T00:00:00Z', items: [{}] }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(orders.getOrdersForMonth('2026-08').map((order) => order.id))), ['b', 'a']);
  assert.deepEqual(Array.from(orders.buildOrderNumberMap().entries()), [['c', 1], ['a', 2], ['b', 3]]);
});

test('material order model characterizes strict normalization and preserves inputs', () => {
  const orders = loadOrders();
  const input = {
    id: 'order',
    orderDate: '2026-02-30',
    createdAt: 'created',
    orderWideDiscount: false,
    orderWideShipping: false,
    items: [
      { id: 'valid', category: '기타', site: '대원도재', product: ' Item ', quantity: 2.9, price: 100.9, discount: 10.9, shippingFee: 5.9, status: '' },
      { id: 'missing-product', quantity: 1 },
      { id: 'bad-quantity', product: 'Bad', quantity: 0 }
    ]
  };
  const original = JSON.parse(JSON.stringify(input));
  const normalized = orders.normalizeOrder(input);

  assert.deepEqual(input, original);
  assert.equal(normalized.orderDate, '2026-02-30');
  assert.equal(normalized.orderWideDiscount, false);
  assert.equal(normalized.orderWideShipping, false);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.items)), [{
    id: 'valid', category: '기타', site: '대원도재', product: 'Item', quantity: 2,
    price: 100, discount: 10, shippingFee: 5, status: '주문 완료'
  }]);
  assert.equal(orders.normalizeItem(null), null);
  assert.equal(orders.normalizeOrder({ id: 'empty', orderDate: '2026-08-01', items: [] }), null);
  assert.equal(orders.getLineTotal(100.9, 10.9, 5.9), 95);
  assert.equal(orders.getLineTotal(10, 20, 2), null);
  assert.equal(orders.normalizeDateISO('invalid'), '');
});

test('material order row projection preserves grouping, selection, editing, and totals', () => {
  const orders = [{
    id: 'order-2',
    orderWideDiscount: true,
    orderWideShipping: false,
    items: [
      { id: 'item-a', price: 100, discount: 10 },
      { id: 'item-b', price: 50, shippingFee: 5 }
    ]
  }, {
    id: 'order-1',
    items: [{ id: 'item-c', price: 25 }]
  }];
  const projection = rowProjection.buildRowProjection({
    orders,
    orderNumberMap: new Map([['order-1', 1], ['order-2', 2]]),
    selectedItemIds: ['item-a', 'item-b'],
    editingOrderId: 'order-2',
    getOrderTotal: model.getOrderTotal
  });

  assert.deepEqual(projection.visibleItemIds, ['item-a', 'item-b', 'item-c']);
  assert.equal(projection.grandTotal, 170);
  assert.deepEqual(projection.rows.map((row) => ({
    orderNo: row.orderNo,
    itemId: row.item.id,
    itemIndex: row.itemIndex,
    rowSpan: row.rowSpan,
    showGroupCell: row.showGroupCell,
    isEditing: row.isEditing,
    itemSelected: row.itemSelected,
    orderSelected: row.orderSelected,
    mergeMeta: row.mergeMeta
  })), [{
    orderNo: 2, itemId: 'item-a', itemIndex: 0, rowSpan: 2, showGroupCell: true,
    isEditing: true, itemSelected: true, orderSelected: true,
    mergeMeta: { mergeOrderCells: true, mergeDiscount: true, mergeShipping: false, mergeTotal: true, orderTotal: 145 }
  }, {
    orderNo: 2, itemId: 'item-b', itemIndex: 1, rowSpan: 2, showGroupCell: false,
    isEditing: true, itemSelected: true, orderSelected: true,
    mergeMeta: { mergeOrderCells: true, mergeDiscount: true, mergeShipping: false, mergeTotal: true, orderTotal: 145 }
  }, {
    orderNo: 1, itemId: 'item-c', itemIndex: 0, rowSpan: 1, showGroupCell: true,
    isEditing: false, itemSelected: false, orderSelected: false,
    mergeMeta: { mergeOrderCells: false, mergeDiscount: false, mergeShipping: false, mergeTotal: false, orderTotal: 25 }
  }]);
});

test('material order merge planning preserves contiguous ranges and replaces overlaps', () => {
  const orderedRowIds = ['a', 'b', 'c', 'd'];
  assert.deepEqual(mergePlanning.buildVerticalSelection({
    table: 'main', colKey: 'price', orderedRowIds, startRowId: 'd', endRowId: 'b'
  }), { table: 'main', colKey: 'price', rowIds: ['b', 'c', 'd'] });
  assert.equal(mergePlanning.buildVerticalSelection({
    table: 'main', colKey: 'price', orderedRowIds, startRowId: 'missing', endRowId: 'b'
  }), null);
  assert.deepEqual(mergePlanning.buildContiguousSelection({
    table: 'popup', colKey: 'shipping', orderedRowIds, selectedRowIds: ['b', 'c']
  }), { table: 'popup', colKey: 'shipping', rowIds: ['b', 'c'] });
  assert.equal(mergePlanning.buildContiguousSelection({
    table: 'popup', colKey: 'shipping', orderedRowIds, selectedRowIds: ['a', 'c']
  }), null);

  const existing = [
    { colKey: 'price', rowIds: ['a', 'b'] },
    { colKey: 'price', rowIds: ['c', 'd'] },
    { colKey: 'shipping', rowIds: ['b', 'c'] }
  ];
  assert.deepEqual(mergePlanning.applyMergePlan(existing, {
    colKey: 'price', rowIds: ['b', 'c']
  }), [
    { colKey: 'shipping', rowIds: ['b', 'c'] },
    { colKey: 'price', rowIds: ['b', 'c'] }
  ]);
  assert.deepEqual(existing, [
    { colKey: 'price', rowIds: ['a', 'b'] },
    { colKey: 'price', rowIds: ['c', 'd'] },
    { colKey: 'shipping', rowIds: ['b', 'c'] }
  ]);
  assert.deepEqual(mergePlanning.retainApplicablePlans(existing, ['a', 'b', 'c']), [
    { colKey: 'price', rowIds: ['a', 'b'] },
    { colKey: 'shipping', rowIds: ['b', 'c'] }
  ]);
});