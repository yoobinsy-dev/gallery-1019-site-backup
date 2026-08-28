const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const model = require('../../material-orders/model');

function loadOrders() {
  return exposeIifeFunctions('pottery-material-orders.js', [
    'state', 'normalizeOrder', 'normalizeItem', 'getLineTotal', 'getOrderTotal', 'getOrdersForMonth',
    'buildOrderNumberMap', 'compareOrders', 'inferOrderWideByPattern', 'normalizeDateISO'
  ], { globals: { PotteryMaterialOrdersModel: model } }).exposed;
}

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