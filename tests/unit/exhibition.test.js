const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');
const salesModel = require('../../exhibitions/sales-model');
const accountingProjection = require('../../exhibitions/accounting-projection');
const exportModel = require('../../exhibitions/export-model');
const snapshotClient = require('../../exhibitions/snapshot-client');
const imageLifecycle = require('../../exhibitions/image-lifecycle');

function loadExhibition() {
  return exposeClassicScriptFunctions('exhibition-detail.js', [
    'exhibitionDetailState',
    'getPhotoPreviewDataUrl',
    'getPhotoDataUrl',
    'buildPhotoUploadFileName',
    'parseDataUrlMimeType',
    'snapshotWorkPhotoFields',
    'applyWorkPhotoFields',
    'clearPendingWorkPhotoFields',
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
      ExhibitionSalesModel: salesModel,
      ExhibitionAccountingProjection: accountingProjection,
      ExhibitionExportModel: exportModel,
      ExhibitionSnapshotClient: snapshotClient,
      ExhibitionImageLifecycle: imageLifecycle
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

test('exhibition images characterize filenames, snapshots, rollback, and transient cleanup', () => {
  const exhibition = loadExhibition();
  assert.equal(exhibition.buildPhotoUploadFileName('작품 A.jpeg', 'preview', 'image/webp'), '___A-preview.webp');
  assert.equal(exhibition.buildPhotoUploadFileName('', 'full', 'image/unknown'), 'work-image-full.bin');
  assert.equal(exhibition.parseDataUrlMimeType('data:image/png;base64,AAAA'), 'image/png');
  assert.equal(exhibition.parseDataUrlMimeType('https://example.test/image.png'), '');

  const work = {
    photoName: 'original.png',
    photoUrl: 'full-url',
    photoPreviewUrl: 'preview-url',
    photoPath: 'full-path',
    photoPreviewPath: 'preview-path',
    photoDataUrl: 'legacy-full',
    photoPreviewDataUrl: 'legacy-preview',
    photoMimeType: 'image/png',
    photoByteSize: 42,
    pendingPhotoDataUrl: 'pending-full',
    pendingPhotoPreviewDataUrl: 'pending-preview',
    unknownField: 'keep'
  };
  const snapshot = JSON.parse(JSON.stringify(exhibition.snapshotWorkPhotoFields(work)));
  assert.deepEqual(snapshot, {
    photoName: 'original.png',
    photoUrl: 'full-url',
    photoPreviewUrl: 'preview-url',
    photoPath: 'full-path',
    photoPreviewPath: 'preview-path',
    photoDataUrl: 'legacy-full',
    photoPreviewDataUrl: 'legacy-preview',
    photoMimeType: 'image/png',
    photoByteSize: 42,
    pendingPhotoDataUrl: 'pending-full',
    pendingPhotoPreviewDataUrl: 'pending-preview'
  });
  work.photoUrl = 'replacement';
  work.photoByteSize = Number.NaN;
  exhibition.applyWorkPhotoFields(work, snapshot);
  assert.equal(work.photoUrl, 'full-url');
  assert.equal(work.photoByteSize, 42);
  exhibition.clearPendingWorkPhotoFields(work);
  assert.equal(work.pendingPhotoDataUrl, '');
  assert.equal(work.pendingPhotoPreviewDataUrl, '');
  assert.equal(work.photoDataUrl, 'legacy-full');
  assert.equal(work.unknownField, 'keep');
});

test('exhibition image lifecycle preserves upload planning, application, retry, and verification', async () => {
  const existingWork = {
    photoName: '작품 A.jpeg',
    photoUrl: 'existing-full',
    photoPreviewUrl: 'existing-preview',
    photoDataUrl: 'data:image/png;base64,FULL',
    photoPreviewDataUrl: 'data:image/webp;base64,PREVIEW',
    pendingPhotoDataUrl: 'pending-full',
    pendingPhotoPreviewDataUrl: 'pending-preview',
    unknownField: 'keep'
  };
  const skippedPlan = imageLifecycle.buildUploadPlan(existingWork, {
    workId: 7,
    replaceExisting: false
  });
  assert.equal(skippedPlan.skipped, true);
  const replacePlan = imageLifecycle.buildUploadPlan(existingWork, { workId: 7 });
  assert.equal(replacePlan.shouldUploadPreview, true);
  assert.equal(replacePlan.shouldUploadFull, true);
  assert.equal(replacePlan.previewFileName, '___A-preview.webp');
  assert.equal(replacePlan.fullFileName, '___A-full.webp');

  assert.equal(imageLifecycle.applyUploadedPhotoFields(existingWork, {
    previewUpload: { url: 'new-preview', pathname: 'preview-path' },
    fullUpload: { url: 'new-full', pathname: 'full-path' }
  }), true);
  assert.equal(existingWork.photoPreviewUrl, 'new-preview');
  assert.equal(existingWork.photoUrl, 'new-full');
  assert.equal(existingWork.photoPreviewDataUrl, '');
  assert.equal(existingWork.photoDataUrl, '');
  assert.equal(existingWork.pendingPhotoPreviewDataUrl, '');
  assert.equal(existingWork.pendingPhotoDataUrl, '');
  assert.equal(existingWork.unknownField, 'keep');

  const calls = [];
  const uploaded = await imageLifecycle.uploadImageDataUrl({
    canUpload: true,
    dataUrl: 'data:image/png;base64,AAAA',
    fileName: 'work-full.png',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) throw new Error('retry');
      return { ok: true, json: async () => ({ ok: true, file: { url: 'uploaded-url' } }) };
    }
  });
  assert.equal(uploaded.url, 'uploaded-url');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/upload');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    dataUrl: 'data:image/png;base64,AAAA',
    filename: 'work-full.png'
  });
  assert.deepEqual(await imageLifecycle.verifyUploadedImage({
    uploadedFile: { url: 'uploaded-url' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'Image/PNG' }
    })
  }), { ok: true, status: 200, contentType: 'image/png', isImage: true });
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

test('exhibition exports preserve rows, formatting, escaping, totals, and filenames', () => {
  const soldWorks = [{
    manualNumber: 'A-1',
    title: 'A&B',
    buyerName: 'Buyer A',
    paymentMethod: '기타',
    paymentMethodEtc: '현금',
    photoPreviewUrl: 'preview-a',
    unknownField: 'keep'
  }];
  const sales = exportModel.buildSalesExport({
    title: 'Exhibition / One',
    soldWorks,
    getPhotoPreviewDataUrl: (sold) => sold.photoPreviewUrl
  });
  assert.equal(sales.filename, 'Exhibition___One-sales.xls');
  assert.equal(sales.mimeType, 'application/vnd.ms-excel;charset=utf-8;');
  assert.match(sales.content, /A&amp;B/);
  assert.match(sales.content, /src="preview-a"/);
  assert.match(sales.content, /기타 \(현금\)/);
  assert.ok(sales.content.indexOf('번호') < sales.content.indexOf('Buyer A'));

  const works = exportModel.buildWorksExport({
    title: 'Exhibition / One',
    works: [{ manualNumber: 'W-1', title: '<Work>', unknownField: 'keep' }]
  });
  assert.equal(works.filename, 'Exhibition___One-works.xls');
  assert.match(works.content, /&lt;Work&gt;/);
  assert.ok(works.content.indexOf('번호') < works.content.indexOf('W-1'));

  const revenues = [
    { id: 'art', division: '작품 판매', amount: 100000 },
    { id: 'goods', division: '굿즈 판매', amount: 10000 },
    { id: 'manual', division: '후원', amount: 5000 }
  ];
  const accounting = exportModel.buildAccountingExport({
    exhibition: { title: 'Exhibition / One', startDate: '2026-08-01', endDate: '2026-08-31' },
    expenseItems: [{ code: 'commission-art', division: '작가 지급' }],
    revenueItems: revenues,
    formatAmount: accountingProjection.formatAmount,
    getExpenseEffectiveAmount: accountingProjection.getExpenseEffectiveAmount,
    parseAmount: accountingProjection.parseAmount
  });
  assert.equal(accounting.filename, 'Exhibition___One-accounting.xls');
  assert.match(accounting.content, /2026-08-01 ~ 2026-08-31/);
  assert.match(accounting.content, /₩ 60,000/);
  assert.match(accounting.content, /₩ 115,000/);
  assert.match(accounting.content, /₩ 55,000/);
  assert.ok(accounting.content.indexOf('작품 판매') < accounting.content.indexOf('후원'));
  assert.equal(soldWorks[0].unknownField, 'keep');
});

test('exhibition snapshot client preserves request and response contracts', async () => {
  const calls = [];
  const responses = [
    { responseOk: true, payload: { ok: true, snapshots: null, canUndo: 1 } },
    { responseOk: false, payload: { error: 'server list error' } },
    { responseOk: true, payload: { ok: true } },
    { responseOk: true, payload: { ok: false, error: 'restore error' } },
    { responseOk: true, payload: { ok: true } },
    { responseOk: true, payload: { ok: true, data: { exhibitions: null } } }
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    return {
      ok: next.responseOk,
      json: async () => next.payload
    };
  };

  assert.deepEqual(await snapshotClient.listSnapshots({ fetchImpl, exhibitionId: 'A B' }), {
    ok: true, error: '', snapshots: [], canUndo: true
  });
  assert.equal(calls[0].url, '/api/exhibition-snapshots?exhibitionId=A%20B&limit=100');
  assert.deepEqual(await snapshotClient.listSnapshots({ fetchImpl, exhibitionId: 7, limit: 25 }), {
    ok: false, error: 'server list error', snapshots: [], canUndo: false
  });

  assert.deepEqual(await snapshotClient.captureSnapshot({
    fetchImpl, exhibitionId: 7, note: 'manual backup by Admin'
  }), { ok: true, error: '스냅샷 생성에 실패했습니다.' });
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    action: 'capture-now', exhibitionId: 7, note: 'manual backup by Admin'
  });
  assert.deepEqual(await snapshotClient.restoreSnapshot({
    fetchImpl, exhibitionId: 7, snapshotId: 8
  }), { ok: false, error: 'restore error' });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    action: 'restore', exhibitionId: 7, snapshotId: 8
  });
  assert.deepEqual(await snapshotClient.undoRestore({ fetchImpl, exhibitionId: 7 }), {
    ok: true, error: '되돌리기에 실패했습니다.'
  });
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    action: 'undo-restore', exhibitionId: 7
  });
  assert.deepEqual(await snapshotClient.fetchExhibitions({ fetchImpl }), {
    ok: true, exhibitions: []
  });
  await assert.rejects(
    snapshotClient.listSnapshots({
      exhibitionId: 7,
      fetchImpl: async () => { throw new Error('network'); }
    }),
    /network/
  );
});