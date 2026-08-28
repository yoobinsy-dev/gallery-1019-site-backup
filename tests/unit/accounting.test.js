const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const autoEntries = require('../../accounting/auto-entries');
const exportFormatter = require('../../accounting/export-formatter');
const financeProjection = require('../../accounting/finance-projection');
const calendarOccurrences = require('../../master-calendar/occurrences');
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
    'normalizeNameKey',
    'collectClassOccurrencesByStudentInMonth',
    'buildManualEntries',
    'isFixedEntryActiveInMonth',
    'buildExportRows',
    'csvEscape'
  ], { globals: {
    getMonthStart,
    MasterCalendarOccurrences: calendarOccurrences,
    PotteryAccountingAutoEntries: autoEntries,
    PotteryAccountingExportFormatter: exportFormatter,
    PotteryAccountingFinanceProjection: financeProjection
  } }).exposed;
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

test('accounting characterizes finance category order, fixed cutoffs, replacement, and totals', () => {
  const accounting = loadAccounting();
  accounting.state.monthStart = new Date('2026-08-01T00:00:00');
  accounting.state.entries = [
    { id: 'fixed-old', tab: 'pottery', side: 'expense', category: '관리비', date: '2026-06-01', title: 'Rent', amount: 100, fixed: true },
    { id: 'fixed-new', tab: 'pottery', side: 'expense', category: '관리비', date: '2026-07-01', title: 'Rent', amount: 200, fixed: true },
    { id: 'exact', tab: 'pottery', side: 'expense', category: '관리비', date: '2026-08-01', title: ' rent ', amount: 300, fixed: false },
    { id: 'cutoff', tab: 'pottery', side: 'expense', category: '관리비', date: '2026-07-02', title: 'Internet', amount: 50, fixed: true, fixedThroughMonth: '2026-08' },
    { id: 'expired', tab: 'pottery', side: 'expense', category: '관리비', date: '2026-07-03', title: 'Expired', amount: 75, fixed: true, fixedThroughMonth: '2026-07' },
    { id: 'revenue', tab: 'pottery', side: 'revenue', category: '기타', date: '2026-08-04', title: 'Other income', amount: 1000, fixed: false }
  ];
  accounting.state.materialOrders = [{
    id: 'order', orderDate: '2026-08-02', items: [{ price: 100, discount: 10, shippingFee: 5 }]
  }];

  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildManualEntries('pottery', 'expense', '관리비', '2026-08'))), [
    { id: 'cutoff', source: 'manual', side: 'expense', category: '관리비', date: '2026-07-02', title: 'Internet', amount: 50, fixed: false, fixedThroughMonth: '2026-08', tab: 'pottery' },
    { id: 'exact', source: 'manual', side: 'expense', category: '관리비', date: '2026-08-01', title: ' rent ', amount: 300, fixed: false, tab: 'pottery' }
  ]);
  assert.equal(accounting.isFixedEntryActiveInMonth({ fixedThroughMonth: '2026-08' }, '2026-08'), true);
  assert.equal(accounting.isFixedEntryActiveInMonth({ fixedThroughMonth: '2026-08' }, '2026-09'), false);

  const finance = accounting.buildFinanceForTab('pottery', '2026-08');
  assert.deepEqual(JSON.parse(JSON.stringify(finance.revenueCategories.map((category) => category.category))), ['수강료', '작품 판매', '가마 소성비', '개인작업 이용료', '기타']);
  assert.deepEqual(JSON.parse(JSON.stringify(finance.expenseCategories.map((category) => category.category))), ['수강료 강사 커미션', '재료비', '홍보비', '관리비', '청소, 공사 및 기타 작업비', 'ADT 이용료', '인터넷 + 통신료', '직원/스태프 식비', '기타']);
  assert.deepEqual({ revenueTotal: finance.revenueTotal, expenseTotal: finance.expenseTotal, profit: finance.profit }, {
    revenueTotal: 1000,
    expenseTotal: 445,
    profit: 555
  });
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

test('accounting characterizes monthly class occurrence grouping and dedupe', () => {
  const RealDate = Date;
  const fixedTime = new RealDate('2026-08-15T12:00:00').getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }
  }
  const accounting = exposeIifeFunctions('pottery-accounting.js', [
    'state', 'collectClassOccurrencesByStudentInMonth'
  ], { globals: {
    Date: FixedDate,
    getMonthStart,
    MasterCalendarOccurrences: calendarOccurrences,
    PotteryAccountingAutoEntries: autoEntries,
    PotteryAccountingExportFormatter: exportFormatter,
    PotteryAccountingFinanceProjection: financeProjection
  } }).exposed;
  accounting.state.calendarEvents = [
    { kind: '수강', title: 'A', date: '2026-07-27', start: '10:00', end: '11:00', repeatWeekly: true, repeatEndDate: '2026-08-31', repeatSkipDates: ['2026-08-10'] },
    { kind: '수강', title: 'A', date: '2026-08-03', start: '10:00', end: '11:00' },
    { kind: '수강', title: 'B', date: '2026-08-15', start: '13:00', end: '14:00' },
    { kind: '수강', title: 'B', date: '2026-08-15', start: '09:00', end: '10:00' },
    { kind: '수강', title: 'C', date: '2026-08-04', start: '10:00', end: '11:00', repeatWeekly: true, repeatEndDate: 'invalid' },
    { kind: '개인작업', title: 'ignored', date: '2026-08-01', start: '10:00', end: '11:00' },
    { kind: '수강', title: 'next', date: '2026-09-01', start: '10:00', end: '11:00' }
  ];
  const grouped = accounting.collectClassOccurrencesByStudentInMonth('2026-08');
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(grouped.entries()))), [
    ['A', [{ date: '2026-08-03', start: '10:00' }]],
    ['B', [{ date: '2026-08-15', start: '09:00' }]],
    ['C', [{ date: '2026-08-04', start: '10:00' }, { date: '2026-08-11', start: '10:00' }]]
  ]);
});

test('accounting characterizes pottery automatic entries and commission rounding', () => {
  const RealDate = Date;
  const fixedTime = new RealDate('2026-08-15T12:00:00').getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }
  }
  const accounting = exposeIifeFunctions('pottery-accounting.js', [
    'state', 'buildAutoEntries', 'buildPotteryClassRevenueEntries',
    'buildPotteryPersonalWorkRevenueEntries', 'buildPotteryMaterialExpenseEntries'
  ], { globals: {
    Date: FixedDate,
    getMonthStart,
    MasterCalendarOccurrences: calendarOccurrences,
    PotteryAccountingAutoEntries: autoEntries,
    PotteryAccountingExportFormatter: exportFormatter,
    PotteryAccountingFinanceProjection: financeProjection
  } }).exposed;
  accounting.state.students = [
    { name: 'A', tuition: 100, tuitionBasis: '4회' },
    { name: 'B', tuition: 101, tuitionBasis: '월초' }
  ];
  accounting.state.calendarEvents = [
    { kind: '수강', title: 'A', date: '2026-08-03', start: '10:00', end: '11:00', repeatWeekly: true, repeatEndDate: '2026-08-10' },
    { kind: '수강', title: 'B', date: '2026-08-04', start: '09:00', end: '10:00' }
  ];
  accounting.state.personalWorkEntries = [{
    userName: 'Artist', monthlyFee: 100, paymentHistory: ['2026-08-01', '2026-08-01'], lastPaymentDate: '2026-08-15'
  }];
  accounting.state.materialOrders = [{
    id: 'order-1', orderDate: '2026-08-02', items: [{ price: 100, discount: 10, shippingFee: 5 }]
  }];

  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildPotteryClassRevenueEntries('2026-08'))), [
    { id: 'auto-pottery-class-a-2026-08-03-10:00-0', source: 'auto', side: 'revenue', category: '수강료', date: '2026-08-03', title: 'A 수강 10:00', amount: 25, fixed: false, tab: 'pottery' },
    { id: 'auto-pottery-class-b-2026-08-04-09:00-1', source: 'auto', side: 'revenue', category: '수강료', date: '2026-08-04', title: 'B 수강 09:00', amount: 101, fixed: false, tab: 'pottery' },
    { id: 'auto-pottery-class-a-2026-08-10-10:00-0', source: 'auto', side: 'revenue', category: '수강료', date: '2026-08-10', title: 'A 수강 10:00', amount: 25, fixed: false, tab: 'pottery' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildPotteryPersonalWorkRevenueEntries('2026-08'))), [
    { id: 'auto-pottery-personal-artist-2026-08-0-0', source: 'auto', side: 'revenue', category: '개인작업 이용료', date: '2026-08-01', title: 'Artist 개인작업 이용료', amount: 100, fixed: false, tab: 'pottery' },
    { id: 'auto-pottery-personal-artist-2026-08-0-1', source: 'auto', side: 'revenue', category: '개인작업 이용료', date: '2026-08-15', title: 'Artist 개인작업 이용료', amount: 100, fixed: false, tab: 'pottery' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildPotteryMaterialExpenseEntries('2026-08'))), [
    { id: 'auto-pottery-material-order-1-2026-08-02', source: 'auto', side: 'expense', category: '재료비', date: '2026-08-02', title: '재료 주문 2026-08-02', amount: 95, fixed: false, tab: 'pottery' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(accounting.buildAutoEntries('pottery', 'expense', '수강료 강사 커미션', '2026-08'))).map((entry) => entry.amount), [15, 61, 15]);
});

test('accounting characterizes export rows, entry types, totals, and CSV escaping', () => {
  const accounting = loadAccounting();
  const rows = accounting.buildExportRows({
    revenueCategories: [{
      category: 'Income',
      entries: [
        { date: '2026-08-01', title: 'Auto', amount: 100, source: 'auto', fixed: true },
        { date: '2026-08-02', title: 'Fixed', amount: 0, source: 'manual', fixed: true }
      ]
    }],
    expenseCategories: [{
      category: 'Expense',
      entries: [{ date: '2026-08-03', title: 'Manual', amount: -5, source: 'manual', fixed: false }]
    }],
    revenueTotal: 100,
    expenseTotal: -5,
    profit: 105
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    ['구분', '카테고리', '날짜', '항목명', '금액', '유형'],
    ['수입', 'Income', '2026-08-01', 'Auto', '100', '자동'],
    ['수입', 'Income', '2026-08-02', 'Fixed', '0', '고정'],
    ['지출', 'Expense', '2026-08-03', 'Manual', '-5', '수동'],
    ['', '', '', '총 수입', '100', ''],
    ['', '', '', '총 지출', '-5', ''],
    ['', '', '', '월 손익', '105', '']
  ]);
  assert.equal(accounting.csvEscape('plain'), 'plain');
  assert.equal(accounting.csvEscape('a,b'), '"a,b"');
  assert.equal(accounting.csvEscape('a"b\nc'), '"a""b\nc"');
  assert.equal(accounting.csvEscape(null), '');
});