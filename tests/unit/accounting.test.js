const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const autoEntries = require('../../accounting/auto-entries');
const { buildGallerySalesAutoEntriesLegacy } = require('../fixtures/accounting-gallery-sales-legacy');

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function loadAccounting() {
  return exposeIifeFunctions('pottery-accounting.js', [
    'state',
    'buildGallerySalesAutoEntries',
    'buildFinanceForTab',
    'mergeCategoryEntries',
    'getMaterialOrderTotal',
    'normalizeSoldItemType',
    'parseSoldQuantity',
    'parsePriceToNumber',
    'roundWon',
    'normalizeDateInput',
    'normalizeNameKey'
  ], { globals: { getMonthStart, PotteryAccountingAutoEntries: autoEntries } }).exposed;
}

function getGallerySalesHelpers(accounting) {
  return {
    normalizeSoldItemType: accounting.normalizeSoldItemType,
    parseSoldQuantity: accounting.parseSoldQuantity,
    parsePriceToNumber: accounting.parsePriceToNumber,
    roundWon: accounting.roundWon,
    normalizeDateInput: accounting.normalizeDateInput,
    normalizeNameKey: accounting.normalizeNameKey
  };
}

test('accounting characterizes gallery entries, IDs, quantities, ordering, and rounding', () => {
  const accounting = loadAccounting();
  accounting.state.exhibitions = [
    {
      id: 20,
      title: 'Later',
      endDate: '2026-08-20',
      soldWorks: [{ itemType: '굿즈', price: '1,001', soldQuantity: 3 }]
    },
    {
      id: 10,
      title: 'Earlier',
      endDate: '2026-08-10',
      artSoldWorks: [{ id: 1, price: 250001 }],
      soldGoods: [{ id: 2, price: 5000, soldQuantity: 2 }]
    },
    { id: 30, title: 'Other month', endDate: '2026-09-01', soldWorks: [{ itemType: '작품', price: 9 }] }
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('작품', '2026-08'))), [{
    id: 'auto-sales-작품-10-2026-08-10', source: 'auto', side: 'revenue', category: '작품 판매',
    date: '2026-08-10', title: 'Earlier', amount: 250001, fixed: false, tab: 'gallery'
  }]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('굿즈', '2026-08').map((entry) => [entry.id, entry.amount]))),
    [['auto-sales-굿즈-10-2026-08-10', 10000], ['auto-sales-굿즈-20-2026-08-20', 3003]]
  );
});

test('gallery sales characterize legacy records, dedupe, precedence, fallbacks, and month edges', () => {
  const accounting = loadAccounting();
  accounting.state.exhibitions = [
    null,
    'malformed',
    {
      id: 'later',
      title: 'Later',
      endDate: '2026-08-31',
      soldWorks: [
        { id: 'duplicate', itemType: '굿즈', price: '1,000.4원', soldQuantity: '2.9개' },
        { id: 'duplicate', itemType: '굿즈', price: 999999, soldQuantity: 10 },
        { itemType: '굿즈', title: 'Anonymous', soldDate: '2026-08-20', price: 10.2, soldQuantity: 0 },
        { itemType: '굿즈', title: 'Anonymous', soldDate: '2026-08-20', price: 10.2, soldQuantity: 0 }
      ],
      artSoldWorks: [{ price: 500000 }],
      soldGoods: [{ price: 500000, soldQuantity: 2 }]
    },
    {
      id: 0,
      name: 'Legacy',
      date: '2026-08-01',
      artSoldWorks: [{ id: 'legacy-art', price: 100.6, soldQuantity: 99 }],
      soldGoods: [{ id: 'legacy-goods', price: 7, soldQuantity: 3.8 }]
    },
    {
      id: 'ignored-legacy',
      endDate: '2026-08-15',
      soldWorks: [{ itemType: '작품', price: '판매불가' }],
      artSoldWorks: [{ price: 123456 }]
    },
    { id: 'next-month', endDate: '2026-09-01', soldWorks: [{ price: 999 }] },
    { id: 'missing-date', soldWorks: [{ price: 999 }] }
  ];
  const original = JSON.parse(JSON.stringify(accounting.state.exhibitions));

  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('작품', '2026-08'))), [{
    id: 'auto-sales-작품-Legacy-2026-08-01', source: 'auto', side: 'revenue', category: '작품 판매',
    date: '2026-08-01', title: 'Legacy', amount: 101, fixed: false, tab: 'gallery'
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('굿즈', '2026-08'))), [
    {
      id: 'auto-sales-굿즈-Legacy-2026-08-01', source: 'auto', side: 'revenue', category: '굿즈 판매',
      date: '2026-08-01', title: 'Legacy', amount: 21, fixed: false, tab: 'gallery'
    },
    {
      id: 'auto-sales-굿즈-later-2026-08-31', source: 'auto', side: 'revenue', category: '굿즈 판매',
      date: '2026-08-31', title: 'Later', amount: 2011, fixed: false, tab: 'gallery'
    }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.state.exhibitions)), original);
});

test('gallery sales characterize empty and currently tolerated malformed inputs', () => {
  const accounting = loadAccounting();
  accounting.state.exhibitions = [];
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('작품', '2026-08'))), []);

  accounting.state.exhibitions = [{
    id: 1,
    title: 'No positive total',
    endDate: '2026-08-10',
    soldWorks: [null, 'bad', { price: '-' }, { price: -10 }, { price: 'not-a-number' }]
  }];
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('작품', '2026-08'))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildGallerySalesAutoEntries('굿즈', 'invalid-month'))), []);
});

test('extracted gallery sales match the retained legacy implementation exactly', () => {
  const accounting = loadAccounting();
  const exhibitions = [
    {
      id: 20,
      title: 'Current records',
      endDate: '2026-08-20',
      soldWorks: [
        { id: 1, itemType: '작품', price: '250,000.5' },
        { id: 2, itemType: '굿즈', price: '1,001', soldQuantity: '3개' },
        { id: 2, itemType: '굿즈', price: 999999, soldQuantity: 10 }
      ]
    },
    {
      id: 10,
      name: 'Legacy records',
      date: '2026-08-01',
      artSoldWorks: [{ workId: 1, title: 'A', soldDate: '2026-07-31', price: 100.4 }],
      soldGoods: [{ workId: 2, title: 'B', soldDateTime: 'legacy', price: 5.5, soldQuantity: 2.9 }]
    },
    { id: 30, endDate: '2026-09-01', soldWorks: [{ price: 999 }] },
    null,
    'malformed'
  ];
  const helpers = getGallerySalesHelpers(accounting);

  ['작품', '굿즈'].forEach((itemType) => {
    const input = { exhibitions, itemType, monthKey: '2026-08', helpers };
    const legacy = buildGallerySalesAutoEntriesLegacy(input);
    const extracted = autoEntries.buildGallerySalesAutoEntries(input);
    assert.deepEqual(JSON.parse(JSON.stringify(extracted)), JSON.parse(JSON.stringify(legacy)));
  });
});

test('accounting characterizes material totals and manual/automatic override precedence', () => {
  const accounting = loadAccounting();
  assert.equal(accounting.getMaterialOrderTotal({
    orderWideDiscount: true,
    orderWideShipping: true,
    items: [
      { price: 10000.9, discount: 1000.8, shippingFee: 500.9 },
      { price: 20000.2, discount: 1000, shippingFee: 500 }
    ]
  }), 29500);

  const auto = [{ id: 'auto-1', overrideKey: 'sale-1', amount: 100, source: 'auto' }];
  const manual = [
    { id: 'manual-1', overrideKey: 'sale-1', amount: 90, source: 'manual' },
    { id: 'manual-2', amount: 5, source: 'manual' }
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(accounting.mergeCategoryEntries(auto, manual))),
    [manual[0], manual[1]]
  );
});

test('extracted material order totals preserve strict numeric and order-wide behavior', () => {
  const accounting = loadAccounting();
  const orders = [
    null,
    {},
    { items: [] },
    { items: [{ price: '1,000원', discount: 1, shippingFee: 1 }] },
    { items: [{ price: 10.9, discount: 20.1, shippingFee: 2.9 }] },
    {
      items: [
        { price: 10000.9, discount: 1000.8, shippingFee: 500.9 },
        { price: 20000.2, discount: 1000, shippingFee: 500 }
      ]
    },
    {
      orderWideDiscount: true,
      orderWideShipping: true,
      items: [
        { price: 10000.9, discount: 1000.8, shippingFee: 500.9 },
        { price: 20000.2, discount: 9999, shippingFee: 9999 }
      ]
    },
    { items: [{ price: -1, discount: -2, shippingFee: -3 }, null, 'bad'] }
  ];

  orders.forEach((order) => {
    assert.equal(
      autoEntries.getMaterialOrderTotal(order),
      accounting.getMaterialOrderTotal(order)
    );
  });
  assert.equal(autoEntries.getMaterialOrderTotal(orders[3]), 0);
  assert.equal(autoEntries.getMaterialOrderTotal(orders[4]), 0);
  assert.equal(autoEntries.getMaterialOrderTotal(orders[5]), 29000);
  assert.equal(autoEntries.getMaterialOrderTotal(orders[6]), 29500);
});