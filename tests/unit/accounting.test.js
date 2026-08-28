const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function loadAccounting() {
  return exposeIifeFunctions('pottery-accounting.js', [
    'state',
    'buildGallerySalesAutoEntries',
    'buildFinanceForTab',
    'mergeCategoryEntries',
    'getMaterialOrderTotal'
  ], { globals: { getMonthStart } }).exposed;
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