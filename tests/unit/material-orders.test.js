const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');

function loadOrders() {
  return exposeIifeFunctions('pottery-material-orders.js', [
    'state', 'normalizeOrder', 'getOrderTotal', 'getOrdersForMonth', 'buildOrderNumberMap', 'inferOrderWideByPattern'
  ]).exposed;
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