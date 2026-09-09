const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');
const salesModel = require('../../exhibitions/sales-model');
const accountingProjection = require('../../exhibitions/accounting-projection');
const exportModel = require('../../exhibitions/export-model');
const snapshotClient = require('../../exhibitions/snapshot-client');
const backupController = require('../../exhibitions/detail/backup-controller');
const imageLifecycle = require('../../exhibitions/image-lifecycle');
const certificateModel = require('../../exhibitions/certificate-model');
const certificateController = require('../../exhibitions/detail/certificate-controller');
const inventoryModel = require('../../exhibitions/inventory-model');
const worksEditorController = require('../../exhibitions/detail/works-editor-controller');
const inventoryRenderer = require('../../exhibitions/inventory-renderer');
const inventoryBackupModel = require('../../exhibitions/inventory-backup-model');
const infoController = require('../../exhibitions/detail/info-controller');
const staffController = require('../../exhibitions/detail/staff-controller');
const filesController = require('../../exhibitions/detail/files-controller');
const inventoryStateController = require('../../exhibitions/detail/inventory-state-controller');
const salesAddController = require('../../exhibitions/detail/sales-add-controller');
const gridNavigation = require('../../exhibitions/detail/grid-navigation');
const worksView = require('../../exhibitions/detail/works-view');
const salesViewController = require('../../exhibitions/detail/sales-view-controller');
const accountingViewController = require('../../exhibitions/detail/accounting-view-controller');
const tabsController = require('../../exhibitions/detail/tabs-controller');
const { createStorageAdapter } = require('../../storage/storage-adapter');
const exhibitionsRepository = require('../../storage/exhibitions-repository');
const exhibitionDetailRepository = require('../../storage/exhibition-detail-repository');

function loadExhibition(overrides = {}) {
  const storage = overrides.localStorage || {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  const adapter = createStorageAdapter({ storage, safeWrite: overrides.safeSetLocalStorageItem });
  const loaded = exposeClassicScriptFunctions('exhibition-detail.js', [
    'initializeExhibitionDetailControllers',
    'exhibitionDetailState',
    'getPhotoPreviewDataUrl',
    'getPhotoDataUrl',
    'buildPhotoUploadFileName',
    'parseDataUrlMimeType',
    'snapshotWorkPhotoFields',
    'applyWorkPhotoFields',
    'clearPendingWorkPhotoFields',
    'getCertificateImageDataUrl',
    'getSourceArtworkForSold',
    'hasGeneratedCertificate',
    'normalizeCertificateDateText',
    'safeCertificateFileName',
    'getArtistInstagramForCertificate',
    'buildAllCertificatesDownloadFileName',
    'computeContainedImageAnchor',
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
    ,'filterWorks'
    ,'getWorkSortValue'
    ,'parseSizeParts'
    ,'normalizeManualNumber'
    ,'normalizeTitle'
    ,'shouldValidateManualNumberUniqueness'
    ,'shouldValidateTitleUniqueness'
    ,'findSavedManualNumberConflict'
    ,'findSavedTitleConflict'
    ,'getBulkManualNumberConflicts'
    ,'getBulkTitleConflicts'
    ,'getMissingRequiredWorkFields'
    ,'getInventoryBackupStorageKey'
    ,'getInventoryListCounts'
    ,'normalizeInventoryBackupSnapshot'
    ,'isLargeUnexpectedInventoryDrop'
    ,'saveExhibition'
    ,'loadInventoryBackup'
    ,'persistInventoryBackup'
    ,'loadLastViewedExhibitionTab'
    ,'saveLastViewedExhibitionTab'
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
      ExhibitionDetailBackupController: backupController,
      ExhibitionImageLifecycle: imageLifecycle,
      ExhibitionCertificateModel: certificateModel,
      ExhibitionDetailCertificateController: certificateController,
      ExhibitionInventoryModel: inventoryModel,
      ExhibitionDetailWorksEditorController: worksEditorController,
      ExhibitionInventoryRenderer: inventoryRenderer,
      ExhibitionInventoryBackupModel: inventoryBackupModel,
      ExhibitionDetailInfoController: infoController,
      ExhibitionDetailStaffController: staffController,
      ExhibitionDetailFilesController: filesController,
      ExhibitionDetailInventoryStateController: inventoryStateController,
      ExhibitionDetailSalesAddController: salesAddController,
      ExhibitionDetailGridNavigation: gridNavigation,
      ExhibitionDetailWorksView: worksView,
      ExhibitionDetailSalesViewController: salesViewController,
      ExhibitionDetailAccountingViewController: accountingViewController,
      ExhibitionDetailTabsController: tabsController,
      ExhibitionsRepository: { repository: exhibitionsRepository.createExhibitionsRepository(adapter) },
      ExhibitionDetailRepository: { repository: exhibitionDetailRepository.createExhibitionDetailRepository(adapter) },
      ...overrides
    }
  });
  loaded.exposed.initializeExhibitionDetailControllers();
  return loaded.exposed;
}

test('exhibition detail persistence characterizes main-save shaping and backup order', () => {
  const baseline = [{ id: 1, works: [{ id: 'old' }], artWorks: [{ id: 'old' }], unknownRoot: 'baseline' }];
  const values = new Map([['exhibitions', JSON.stringify(baseline)]]);
  const writes = [];
  const exhibition = loadExhibition({
    localStorage: { getItem(key) { return values.get(key) ?? null; }, setItem() {} },
    safeSetLocalStorageItem(key, value) { writes.push([key, value]); values.set(key, value); return true; }
  });
  exhibition.exhibitionDetailState.exhibitionId = 1;
  exhibition.exhibitionDetailState.inventoryMode = 'art';
  exhibition.exhibitionDetailState.exhibition = {
    id: 1,
    unknownRoot: 'keep',
    works: [{ id: 'work', unknownWork: 'keep', pendingPhotoDataUrl: 'drop' }],
    soldWorks: [],
    goods: [],
    soldGoods: []
  };
  assert.equal(exhibition.saveExhibition(), true);
  assert.equal(writes.length, 2);
  assert.equal(writes[0][0], 'exhibitions');
  assert.equal(writes[1][0], 'exhibition-inventory-backup:1');
  const saved = JSON.parse(writes[0][1])[0];
  assert.equal(saved.unknownRoot, 'keep');
  assert.equal(saved.works[0].unknownWork, 'keep');
  assert.equal(saved.works[0].pendingPhotoDataUrl, undefined);
  assert.deepEqual(saved.works, saved.artWorks);
  assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const backup = JSON.parse(writes[1][1]);
  assert.equal(backup.snapshot.artWorks[0].unknownWork, 'keep');
});

test('exhibition detail persistence skips backup after failed main safe write', () => {
  const exhibition = loadExhibition({
    localStorage: { getItem(key) { return key === 'exhibitions' ? '[]' : null; }, setItem() {} },
    safeSetLocalStorageItem() { return false; }
  });
  exhibition.exhibitionDetailState.exhibitionId = 2;
  exhibition.exhibitionDetailState.exhibition = { id: 2, works: [], soldWorks: [] };
  assert.equal(exhibition.saveExhibition(), false);
  assert.equal(exhibition.loadInventoryBackup(2), null);
});

test('exhibition detail repository preserves backup, preference, and user contracts', () => {
  const values = new Map([
    ['users', '[{"unknown":"user"}]'],
    ['backup:1', '{"snapshot":{"unknown":"backup"}}'],
    ['preference', 'works']
  ]);
  const safeWrites = [];
  const writes = [];
  const repository = exhibitionDetailRepository.createExhibitionDetailRepository({
    read(key) { return values.get(key) ?? null; },
    write(key, value) { writes.push([key, value]); },
    writeSafely(key, value) { safeWrites.push([key, value]); return true; }
  });
  assert.equal(repository.loadUsers()[0].unknown, 'user');
  assert.equal(repository.loadInventoryBackup('backup:1').snapshot.unknown, 'backup');
  assert.equal(repository.loadPreference('preference'), 'works');
  assert.equal(repository.saveInventoryBackupSafely('backup:2', { snapshot: {} }), true);
  repository.savePreference('preference', 'inventory-list');
  assert.deepEqual(safeWrites, [['backup:2', '{"snapshot":{}}']]);
  assert.deepEqual(writes, [['preference', 'inventory-list']]);

  values.set('backup:1', '{malformed');
  assert.equal(repository.loadInventoryBackup('backup:1'), null);
});

test('certificate controller resolves required model after controller construction', () => {
  let model = null;
  const controller = certificateController.create({
    getExhibitionCertificateModel: () => model
  });

  assert.throws(() => controller.hasGeneratedCertificate({}), /ExhibitionCertificateModel is unavailable/);

  model = { hasGeneratedCertificate(sold) { return sold.ready === true; } };
  assert.equal(controller.hasGeneratedCertificate({ ready: true }), true);
});

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

test('certificate model characterizes artwork source, Instagram, batch filename, and geometry', () => {
  const exhibition = loadExhibition();
  const state = exhibition.exhibitionDetailState;
  state.exhibition = {
    title: 'Exhibition / One',
    artWorks: [{ id: 1, title: 'current', author: 'Artist A' }],
    works: [{ id: 1, title: 'legacy', author: 'Artist A' }],
    artistInstagramMap: { 'artist a': '@artist' }
  };
  assert.equal(exhibition.getSourceArtworkForSold({ workId: 1 }).title, 'current');
  assert.equal(
    exhibition.getArtistInstagramForCertificate({ author: 'fallback' }, { author: 'Artist A' }),
    '@artist'
  );
  assert.equal(exhibition.buildAllCertificatesDownloadFileName(), 'Exhibition _ One-모든보증서.xlsx');
  delete state.exhibition.artWorks;
  assert.equal(exhibition.getSourceArtworkForSold({ workId: 1 }).title, 'legacy');

  const metrics = {
    getColumnWidthPx: () => 10,
    getRowHeightPx: () => 10
  };
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.computeContainedImageAnchor(metrics, 100, 100, 44))), {
    fromCol: 2,
    fromColOff: 0,
    toCol: 7,
    toColOff: 0,
    fromRow: 54,
    fromRowOff: 47625,
    toRow: 59,
    toRowOff: 47625
  });
});

test('certificate model projects workbook fields and worksheet dimensions', () => {
  assert.deepEqual(certificateModel.buildCertificateFields(
    { author: 'Sold Artist', title: 'Sold Title', soldAtKst: '2026-08-15 12:00:00', photoName: 'sold.png' },
    { author: 'Work Artist', title: 'Work Title', materials: 'Clay', size: '10 x 20', year: 2026, photoName: 'work.png' },
    ' @artist '
  ), {
    artist: 'Work Artist',
    title: 'Work Title',
    materials: 'Clay',
    size: '10 x 20',
    year: '2026',
    edition: '',
    soldDate: '2026.08.15',
    photoText: 'work.png',
    artistInstagram: '@artist'
  });
  const metrics = certificateModel.parseWorksheetMetrics(
    '<worksheet><sheetFormatPr defaultColWidth="8" defaultRowHeight="15"/>'
      + '<cols><col min="3" max="3" width="10"/></cols>'
      + '<sheetData><row r="5" ht="30"></row></sheetData></worksheet>'
  );
  assert.equal(metrics.getColumnWidthPx(2), 70);
  assert.equal(metrics.getColumnWidthPx(3), 56);
  assert.equal(metrics.getRowHeightPx(4), 40);
  assert.equal(metrics.getRowHeightPx(5), 20);
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

test('exhibition inventory characterizes filtering, size parsing, sort values, and constraints', () => {
  const exhibition = loadExhibition();
  const state = exhibition.exhibitionDetailState;
  const works = [{ id: 1, manualNumber: ' A-1 ', title: 'Alpha', author: 'Kim', price: '100', materials: 'Clay', size: '10 cm x 20 cm', year: '2026', category: 'Cup', saved: true },
    { id: 2, manualNumber: 'B-2', title: 'Beta', author: 'Lee', price: '', materials: 'Wood', size: 'x 30 cm', year: '2025', category: 'Object', saved: true }];
  state.exhibition = { works, soldWorks: [{ itemType: '작품', workId: 1 }] };
  state.workAdvanced = false;
  state.workSearch = 'kim 100 clay';
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.filterWorks(works).map((work) => work.id))), [1]);
  state.workAdvanced = true;
  state.workFilters = { title: '', author: 'lee', price: '', materials: 'wood', size: '', year: '', category: '' };
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.filterWorks(works).map((work) => work.id))), [2]);
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.parseSizeParts('10 cm × 20 cm'))), { width: '10', height: '20' });
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.parseSizeParts('x 30 cm'))), { width: '', height: '30' });
  assert.equal(exhibition.getWorkSortValue(works[0], 'status'), 'sold');
  assert.equal(exhibition.normalizeManualNumber(' A-1 '), 'a-1');
  assert.equal(exhibition.normalizeTitle(' Alpha '), 'alpha');
  assert.deepEqual(JSON.parse(JSON.stringify(exhibition.getMissingRequiredWorkFields(works[1]))), ['price']);

  const saved = { id: 10, manualNumber: 'A-1', title: 'Alpha', saved: true };
  const pendingA = { id: 11, manualNumber: ' a-1 ', title: ' alpha ', saved: false, wasSaved: false };
  const pendingB = { id: 12, manualNumber: 'B-2', title: 'Beta', saved: false, wasSaved: false };
  const pendingC = { id: 13, manualNumber: 'b-2', title: ' beta ', saved: false, wasSaved: false };
  assert.equal(exhibition.shouldValidateManualNumberUniqueness(pendingA), true);
  assert.equal(exhibition.shouldValidateTitleUniqueness({ title: '', wasSaved: false }), false);
  assert.equal(exhibition.findSavedManualNumberConflict(pendingA, [saved])?.id, 10);
  assert.equal(exhibition.findSavedTitleConflict(pendingA, [saved])?.id, 10);
  assert.deepEqual([...exhibition.getBulkManualNumberConflicts([saved, pendingA, pendingB, pendingC], [pendingA, pendingB, pendingC])].sort(), [11, 12, 13]);
  assert.deepEqual([...exhibition.getBulkTitleConflicts([saved, pendingA, pendingB, pendingC], [pendingA, pendingB, pendingC])].sort(), [11, 12, 13]);
  assert.equal(saved.manualNumber, 'A-1');
});

test('exhibition inventory model preserves sorting, goods quantities, and inputs', () => {
  const works = [
    { id: 1, manualNumber: 'B-2', title: 'Beta', quantity: '5', unknownField: 'keep-a' },
    { id: 2, manualNumber: 'A-1', title: 'Alpha', quantity: '2', unknownField: 'keep-b' }
  ];
  const options = {
    works,
    advanced: false,
    search: '',
    sortField: 'manualNumber',
    sortDirection: 'asc',
    compareValues: (left, right) => String(left).localeCompare(String(right), 'en', { numeric: true }),
    parseStockQuantity: salesModel.parseStockQuantity,
    getGoodsSoldQuantity: (id) => id === 1 ? 3 : 4,
    soldWorkIdSet: new Set([2])
  };
  assert.deepEqual(inventoryModel.getSortedWorks(options).map((work) => work.id), [2, 1]);
  assert.equal(inventoryModel.getWorkSortValue(works[0], 'soldQuantity', options), '3');
  assert.equal(inventoryModel.getWorkSortValue(works[0], 'remainingQuantity', options), '2');
  assert.equal(inventoryModel.getWorkSortValue(works[1], 'remainingQuantity', options), '0');
  assert.equal(inventoryModel.getWorkSortValue(works[1], 'status', options), 'sold');
  assert.equal(works[0].unknownField, 'keep-a');
  assert.equal(works[0].manualNumber, 'B-2');
});

test('exhibition inventory renderer builds saved, editable, and goods rows', () => {
  const saved = inventoryRenderer.buildWorkRow({
    work: { id: 7, manualNumber: 'W-7', title: 'Saved', price: '100', saved: true },
    index: 1,
    isGoodsMode: false,
    isSelected: true,
    canModifyWork: true,
    previewDataUrl: 'data:image/png;base64,AAAA',
    isUnsold: false,
    isSold: true,
    isSoloExhibition: false
  });
  assert.equal(saved.className, 'work-saved-row');
  assert.match(saved.html, /class="work-checkbox" checked/);
  assert.match(saved.html, /toggleWorkEdit\(7\)/);
  assert.match(saved.html, /class="work-status-badge sold"/);

  const editable = inventoryRenderer.buildWorkRow({
    work: { id: 8, title: 'Draft', author: 'Artist', price: '미판매', size: '21 × 29.7 cm', saved: false },
    index: 2,
    isGoodsMode: false,
    isSelected: false,
    canModifyWork: true,
    previewDataUrl: '',
    isUnsold: true,
    isSold: false,
    isSoloExhibition: true
  });
  assert.equal(editable.className, '');
  assert.match(editable.html, /data-field="author" value="Artist" disabled/);
  assert.match(editable.html, /data-field="price" value="미판매"/);
  assert.match(editable.html, /data-field="size" value="21 × 29\.7 cm"/);
  assert.doesNotMatch(editable.html, /sizeWidth|sizeHeight|size-unit|placeholder="가로"|placeholder="세로"/);

  const goods = inventoryRenderer.buildWorkRow({
    work: { id: 9, title: 'Goods', saved: true },
    index: 0,
    isGoodsMode: true,
    isSelected: false,
    canModifyWork: false,
    previewDataUrl: '',
    isUnsold: false,
    isSold: false,
    soldQuantity: 2,
    stockQuantity: 5,
    remainingQuantity: 3,
    isSoloExhibition: false
  });
  assert.match(goods.html, /<td>5<\/td>\s*<td>2<\/td>\s*<td>3<\/td>/);
  assert.doesNotMatch(goods.html, /openDeleteWorkModal/);
});

test('exhibition work size accepts and persists arbitrary free text', () => {
  const work = { id: 8, size: '21 × 29.7 cm' };
  const state = { exhibition: { works: [work] } };
  const controller = worksEditorController.create({
    state,
    document: {},
    window: {},
    inventoryModel,
    getCurrentExhibition: () => state.exhibition,
    canCurrentUserModifyOwnedRow: () => true,
    ensureWorkEditUndoSnapshot() {},
    saveExhibition() {}
  });

  for (const size of ['30 × 20 × 15 cm', '가변크기', '', 'Ø 40']) {
    controller.handleWorkSizeChange(work.id, size);
    assert.equal(work.size, size);
  }

  const sizeInput = { value: 'Dimensions variable' };
  controller.syncWorkFromRow(work, {
    querySelector(selector) {
      return selector === 'input[data-field="size"]' ? sizeInput : null;
    }
  });
  assert.equal(work.size, 'Dimensions variable');
});

test('exhibition sales add controller closes an empty confirmation without saving', () => {
  const calls = [];
  const modal = { style: { display: 'flex' } };
  const state = {
    salesAddBuffer: [],
    salesSearchQuery: 'query',
    salesSearchResults: [{ id: 1 }],
    salesAddApplyCommonBuyer: true,
    salesAddCommonBuyerName: 'Buyer',
    salesAddCommonBuyerPhone: '010-1234-5678',
    salesAddCommonPaymentMethod: '카드'
  };
  const controller = salesAddController.create({
    state,
    document: { getElementById: (id) => id === 'sales-add-modal' ? modal : null },
    setTimeout,
    saveExhibition: () => calls.push('save'),
    switchTab: () => calls.push('switch'),
    renderSoldWorkRows: () => calls.push('render')
  });

  controller.confirmSalesAddModal();

  assert.equal(modal.style.display, 'none');
  assert.deepEqual(calls, []);
  assert.deepEqual(state.salesAddBuffer, []);
  assert.equal(state.salesSearchQuery, '');
  assert.deepEqual(state.salesSearchResults, []);
  assert.equal(state.salesAddApplyCommonBuyer, false);
  assert.equal(state.salesAddCommonBuyerName, '');
  assert.equal(state.salesAddCommonBuyerPhone, '');
  assert.equal(state.salesAddCommonPaymentMethod, '');
});

test('exhibition sales add controller saves populated confirmation with shared metadata and ordered accounting rerender', () => {
  const calls = [];
  const modalStyle = {};
  Object.defineProperty(modalStyle, 'display', {
    set(value) {
      calls.push(`close:${value}`);
    }
  });
  const soldWorks = [{ id: 'existing' }];
  const exhibition = { soldWorks: [{ id: 'stale' }] };
  const state = {
    currentTab: 'exhibition-accounting',
    exhibition,
    salesAddApplyCommonBuyer: true,
    salesAddCommonBuyerName: '  Buyer Name  ',
    salesAddCommonBuyerPhone: ' 01012345678 ',
    salesAddCommonPaymentMethod: '  카드  ',
    salesAddBuffer: [{
      workId: 11,
      manualNumber: 'A-11',
      photoName: 'art.jpg',
      photoDataUrl: 'legacy-art',
      title: 'Artwork',
      author: 'Artist',
      price: '100000',
      soldQuantity: '9',
      madeToOrder: 0
    }, {
      workId: 22,
      itemType: '굿즈',
      manualNumber: 'G-22',
      category: 'Edition',
      photoName: 'goods.jpg',
      photoUrl: 'full-url',
      photoPreviewUrl: 'preview-url',
      photoDataUrl: 'legacy-goods',
      photoPreviewDataUrl: 'legacy-preview',
      title: 'Goods',
      author: 'Maker',
      price: '2500',
      soldQuantity: '3.9',
      madeToOrder: 1
    }]
  };
  const nowValues = [1000, 2000];
  const randomValues = [0.12345, 0.99999];
  const controller = salesAddController.create({
    state,
    document: { getElementById: (id) => id === 'sales-add-modal' ? { style: modalStyle } : null },
    setTimeout,
    formatKoreanPhone(value) { calls.push(`phone:${value}`); return '010-1234-5678'; },
    getCurrentExhibition() { calls.push('exhibition'); return exhibition; },
    ensureSoldWorksArray() { calls.push('soldWorks'); return soldWorks; },
    pushSalesUndoSnapshot() { calls.push('undo'); },
    getCurrentKstDateTimeString() { calls.push('timestamp'); return '2026-09-05 12:34:56'; },
    now: () => nowValues.shift(),
    random: () => randomValues.shift(),
    getCurrentUserId() { calls.push('user'); return 77; },
    getPhotoPreviewDataUrl(item) { calls.push(`preview:${item.workId}`); return `fallback-${item.workId}`; },
    parseSoldQuantity(value) { calls.push(`quantity:${value}`); return Math.max(1, Math.floor(Number(value) || 1)); },
    saveExhibition() { calls.push('save'); },
    getCurrentTab: () => state.currentTab,
    switchTab(tab) {
      calls.push(`switch:${tab}:${state.salesAddBuffer.length}:${state.salesAddApplyCommonBuyer}`);
    },
    renderSoldWorkRows() { calls.push('render'); }
  });

  controller.confirmSalesAddModal();

  assert.deepEqual(calls, [
    'phone:01012345678',
    'exhibition',
    'soldWorks',
    'undo',
    'timestamp',
    'user',
    'preview:11',
    'quantity:9',
    'user',
    'quantity:3.9',
    'save',
    'close:none',
    'switch:exhibition-accounting:0:false'
  ]);
  assert.equal(exhibition.soldWorks, soldWorks);
  assert.deepEqual(soldWorks, [{ id: 'existing' }, {
    id: 13345,
    createdByUserId: 77,
    workId: 11,
    itemType: '작품',
    manualNumber: 'A-11',
    category: '',
    photoName: 'art.jpg',
    photoUrl: '',
    photoPreviewUrl: '',
    photoDataUrl: 'legacy-art',
    photoPreviewDataUrl: 'fallback-11',
    title: 'Artwork',
    author: 'Artist',
    price: '100000',
    soldQuantity: 9,
    soldAtKst: '2026-09-05 12:34:56',
    buyerName: 'Buyer Name',
    buyerPhone: '010-1234-5678',
    paymentMethod: '카드',
    paymentMethodEtc: '',
    madeToOrder: false,
    note: '',
    saved: false
  }, {
    id: 101999,
    createdByUserId: 77,
    workId: 22,
    itemType: '굿즈',
    manualNumber: 'G-22',
    category: 'Edition',
    photoName: 'goods.jpg',
    photoUrl: 'full-url',
    photoPreviewUrl: 'preview-url',
    photoDataUrl: 'legacy-goods',
    photoPreviewDataUrl: 'legacy-preview',
    title: 'Goods',
    author: 'Maker',
    price: '2500',
    soldQuantity: 3,
    soldAtKst: '2026-09-05 12:34:56',
    buyerName: 'Buyer Name',
    buyerPhone: '010-1234-5678',
    paymentMethod: '카드',
    paymentMethodEtc: '',
    madeToOrder: true,
    note: '',
    saved: false
  }]);
});

test('exhibition sales add controller closes before row rendering outside accounting', () => {
  const calls = [];
  const modalStyle = {};
  Object.defineProperty(modalStyle, 'display', {
    set(value) {
      calls.push(`close:${value}`);
    }
  });
  const soldWorks = [];
  const state = {
    currentTab: 'inventory-sales',
    exhibition: {},
    salesAddApplyCommonBuyer: false,
    salesAddBuffer: [{ workId: 1, soldQuantity: 1 }]
  };
  const controller = salesAddController.create({
    state,
    document: { getElementById: (id) => id === 'sales-add-modal' ? { style: modalStyle } : null },
    setTimeout,
    formatKoreanPhone: (value) => value,
    getCurrentExhibition: () => state.exhibition,
    ensureSoldWorksArray: () => soldWorks,
    pushSalesUndoSnapshot: () => calls.push('undo'),
    getCurrentKstDateTimeString: () => '2026-09-05 12:34:56',
    now: () => 100,
    random: () => 0,
    getCurrentUserId: () => 77,
    getPhotoPreviewDataUrl: () => '',
    parseSoldQuantity: Number,
    saveExhibition: () => calls.push('save'),
    getCurrentTab: () => state.currentTab,
    switchTab: () => calls.push('switch'),
    renderSoldWorkRows: () => calls.push(`render:${state.salesAddBuffer.length}`)
  });

  controller.confirmSalesAddModal();

  assert.deepEqual(calls, ['undo', 'save', 'close:none', 'render:0']);
  assert.equal(soldWorks.length, 1);
});

test('exhibition inventory backup characterizes precedence, stripping, and drop guards', () => {
  const exhibition = loadExhibition();
  const source = {
    id: 12,
    works: [{ id: 'legacy', unknownField: 'keep-legacy' }],
    artWorks: [{ id: 'art', photoDataUrl: 'large', nested: { previewDataUrl: 'nested-large', keep: 1 } }],
    goods: [{ id: 'goods', imageDataUrl: 'large', unknownField: 'keep-goods' }],
    soldWorks: [{ id: 'legacy-sale' }],
    artSoldWorks: [{ id: 'art-sale', fileDataUrl: 'large' }],
    soldGoods: [{ id: 'goods-sale', previewDataUrl: 'large' }]
  };
  assert.equal(exhibition.getInventoryBackupStorageKey(12), 'exhibition-inventory-backup:12');
  assert.equal(exhibition.getInventoryBackupStorageKey('invalid'), '');
  assert.deepEqual(
    JSON.parse(JSON.stringify(exhibition.getInventoryListCounts(source))),
    { art: 1, goods: 1, total: 2 }
  );

  const snapshot = JSON.parse(JSON.stringify(exhibition.normalizeInventoryBackupSnapshot(source)));
  assert.deepEqual(snapshot.artWorks.map((item) => item.id), ['art']);
  assert.deepEqual(snapshot.artSoldWorks.map((item) => item.id), ['art-sale']);
  assert.equal(snapshot.artWorks[0].photoDataUrl, '');
  assert.equal(snapshot.artWorks[0].nested.previewDataUrl, '');
  assert.equal(snapshot.artWorks[0].nested.keep, 1);
  assert.equal(snapshot.goods[0].unknownField, 'keep-goods');
  assert.equal(source.artWorks[0].photoDataUrl, 'large');

  assert.equal(exhibition.isLargeUnexpectedInventoryDrop(
    { artWorks: Array.from({ length: 20 }, (_, id) => ({ id })) },
    { artWorks: [] }
  ), true);
  assert.equal(exhibition.isLargeUnexpectedInventoryDrop(
    { artWorks: Array.from({ length: 19 }, (_, id) => ({ id })) },
    { artWorks: [] }
  ), false);
  assert.equal(exhibition.isLargeUnexpectedInventoryDrop(
    { artWorks: Array.from({ length: 20 }, (_, id) => ({ id })) },
    { artWorks: Array.from({ length: 6 }, (_, id) => ({ id })) }
  ), false);
});