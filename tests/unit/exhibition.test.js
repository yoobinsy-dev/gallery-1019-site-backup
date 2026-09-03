const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');
const salesModel = require('../../exhibitions/sales-model');

function loadExhibition() {
  return exposeClassicScriptFunctions('exhibition-detail.js', [
    'exhibitionDetailState',
    'getPhotoPreviewDataUrl',
    'getPhotoDataUrl',
    'getCertificateImageDataUrl',
    'hasGeneratedCertificate',
    'normalizeCertificateDateText',
    'safeCertificateFileName',
    'normalizeSoldItemType',
    'parseSoldQuantity',
    'parseStockQuantity',
    'getSoldQuantityForItemType',
    'getGoodsSoldQuantity',
    'getSalesSearchResults',
    'filterSoldWorks',
    'getSortedSoldWorks',
    'getArtistSalesSummary',
    'getSoldStatsForWorksTicker',
    'getSoldStatsForSalesTicker'
    ,'parseAccountingAmount'
    ,'formatAccountingAmount'
    ,'getExhibitionRevenueItems'
    ,'getExpenseEffectiveAmount'
  ], {
    globals: {
      atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
      CustomEvent: class CustomEvent {},
      FileReader: class FileReader {},
      Image: class Image {},
      DOMParser: class DOMParser {},
      ExhibitionSalesModel: salesModel
    }
  }).exposed;
}

test('exhibition images characterize pending, URL, and legacy preview precedence', () => {
  const exhibition = loadExhibition();
  const item = {
    pendingPhotoPreviewDataUrl: 'pending-preview',
    pendingPhotoDataUrl: 'pending-full',
    photoPreviewUrl: 'preview-url',
    photoUrl: 'full-url',
    photoPreviewDataUrl: 'legacy-preview',
    photoDataUrl: 'legacy-full'
  };
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'pending-preview');
  assert.equal(exhibition.getPhotoDataUrl(item), 'pending-full');
  delete item.pendingPhotoPreviewDataUrl;
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'pending-full');
  delete item.pendingPhotoDataUrl;
  assert.equal(exhibition.getPhotoPreviewDataUrl(item), 'preview-url');
  assert.equal(exhibition.getPhotoDataUrl(item), 'full-url');
  assert.equal(exhibition.getPhotoPreviewDataUrl({ photoDataUrl: 'legacy-full' }), 'legacy-full');
});

test('certificate inputs characterize artwork fallback, ready version, date, and safe filename', () => {
  const exhibition = loadExhibition();
  assert.equal(
    exhibition.getCertificateImageDataUrl(
      { photoPreviewUrl: 'sold-preview' },
      { photoUrl: 'work-full' }
    ),
    'work-full'
  );
  assert.equal(exhibition.hasGeneratedCertificate({ certificateReady: true, certificateVersion: 2 }), true);
  assert.equal(exhibition.hasGeneratedCertificate({ certificateReady: true, certificateVersion: 1 }), false);
  assert.equal(exhibition.normalizeCertificateDateText('2026-08-28 12:34:56'), '2026.08.28');
  assert.equal(exhibition.safeCertificateFileName('A/B:*?'), 'A_B___-보증서.xlsx');
});

test('exhibition sales characterize source compatibility, quantity, filtering, sorting, and summaries', () => {
  const exhibition = loadExhibition();
  const state = exhibition.exhibitionDetailState;
  const soldRecords = [{
    id: 1,
    workId: 101,
    itemType: '작품',
    manualNumber: 'B-2',
    title: 'Alpha',
    author: 'Kim',
    price: '₩10,500',
    soldQuantity: 9,
    soldAtKst: '2026-08-05 12:00:00',
    buyerName: 'Buyer A',
    buyerPhone: '010-1111-2222',
    paymentMethod: '카드결제',
    unknownField: 'preserved'
  }, {
    id: 2,
    workId: 201,
    itemType: '굿즈',
    manualNumber: 'A-10',
    title: 'Beta',
    author: 'Lee',
    price: '5,000원',
    soldQuantity: '2.9',
    soldAtKst: '2026-08-10 12:00:00',
    buyerName: 'Buyer B',
    paymentMethod: '기타',
    paymentMethodEtc: '현금'
  }, {
    id: 3,
    workId: 202,
    itemType: '굿즈',
    manualNumber: 'A-2',
    title: 'Gamma',
    author: '',
    price: '미판매',
    soldQuantity: 0,
    soldAtKst: '2026-09-01 12:00:00',
    buyerName: 'Buyer C',
    paymentMethod: '계좌이체'
  }];
  state.exhibition = {
    artWorks: [{ id: 101, manualNumber: 'W-1', title: 'Alpha source', unknownField: 'art' }],
    goods: [{ id: 201, manualNumber: 'G-1', title: 'Beta source', unknownField: 'goods' }],
    soldWorks: soldRecords
  };
  state.salesAdvanced = false;
  state.salesSearch = '';
  state.salesSortField = null;
  state.salesSortDirection = 'asc';
  state.selectedWorkIds = [];
  state.selectedSalesIds = [];

  assert.equal(exhibition.normalizeSoldItemType(null), '작품');
  assert.equal(salesModel.normalizeSoldItemType(null), '작품');
  assert.equal(exhibition.normalizeSoldItemType({ itemType: 'unknown' }), '작품');
  assert.equal(exhibition.parseSoldQuantity('2.9'), 2);
  assert.equal(exhibition.parseSoldQuantity(0), 1);
  assert.equal(exhibition.parseStockQuantity('-1'), 0);
  assert.equal(exhibition.getSoldQuantityForItemType('작품', 9), 1);
  assert.equal(exhibition.getGoodsSoldQuantity(201), 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(exhibition.getSalesSearchResults('__all__'))),
    [{ id: 101, manualNumber: 'W-1', title: 'Alpha source', unknownField: 'art', itemType: '작품' },
      { id: 201, manualNumber: 'G-1', title: 'Beta source', unknownField: 'goods', itemType: '굿즈' }]
  );
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getSalesSearchResults('g-1').map((item) => item.id))), [201]);

  state.salesSearch = '기타 현금';
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.filterSoldWorks(soldRecords).map((item) => item.id))), [2]);
  state.salesAdvanced = true;
  state.salesFilters = {
    manualNumber: '', title: '', author: 'kim', soldDateFrom: '2026-08-01', soldDateTo: '2026-08-31',
    buyerName: '', buyerPhone: '', paymentMethod: '카드'
  };
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.filterSoldWorks(soldRecords).map((item) => item.id))), [1]);

  state.salesAdvanced = false;
  state.salesSearch = '';
  state.salesSortField = 'manualNumber';
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getSortedSoldWorks().map((item) => item.id))), [3, 2, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getArtistSalesSummary())), [
    { author: 'Kim', soldCount: 1, totalRevenue: 10500 },
    { author: 'Lee', soldCount: 2, totalRevenue: 10000 },
    { author: '작가 미지정', soldCount: 1, totalRevenue: 0 }
  ]);
  state.selectedWorkIds = [201];
  state.selectedSalesIds = [2];
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getSoldStatsForWorksTicker())), {
    basisLabel: '선택된 작품 1개 기준 판매 통계', soldCount: 1, totalAmount: 5000
  });
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getSoldStatsForSalesTicker())), {
    basisLabel: '선택된 판매 1개 기준 판매 통계', soldCount: 1, totalAmount: 5000
  });
  assert.equal(soldRecords[0].unknownField, 'preserved');
});

test('exhibition accounting characterizes revenue, commission, ordering, and totals', () => {
  const exhibition = loadExhibition();
  exhibition.exhibitionDetailState.exhibition = {
    soldWorks: [{ itemType: '작품', price: '₩100,001', soldQuantity: 7 },
      { itemType: '굿즈', price: '2,500원', soldQuantity: '3.9' },
      { itemType: '굿즈', price: 'invalid', soldQuantity: 2 }],
    manualRevenueItems: [{ id: 'manual-1', division: '후원', amount: '₩ 4,000', unknownField: 'keep' }]
  };
  assert.equal(exhibition.parseAccountingAmount('₩ -1,234.5'), -1234.5);
  assert.equal(exhibition.parseAccountingAmount('invalid'), 0);
  assert.equal(exhibition.formatAccountingAmount('₩ 4,000'), '₩ 4,000');
  const revenues = JSON.parse(JSON.stringify(exhibition.getExhibitionRevenueItems()));
  assert.deepEqual(revenues, [
    { id: 'art', division: '작품 판매', amount: 100001, source: 'auto' },
    { id: 'goods', division: '굿즈 판매', amount: 7500, source: 'auto' },
    { id: 'manual-1', division: '후원', amount: '₩ 4,000', source: 'manual' }
  ]);
  const revenueTotals = { art: revenues[0].amount, goods: revenues[1].amount };
  assert.equal(exhibition.getExpenseEffectiveAmount({ code: 'commission-art', amount: 1 }, revenueTotals), 60000.6);
  assert.equal(exhibition.getExpenseEffectiveAmount({ code: 'commission-goods', amount: 1 }, revenueTotals), 6000);
  assert.equal(exhibition.getExpenseEffectiveAmount({ code: 'custom', amount: '₩ 1,250' }, revenueTotals), 1250);
  assert.equal(exhibition.exhibitionDetailState.exhibition.manualRevenueItems[0].unknownField, 'keep');
});