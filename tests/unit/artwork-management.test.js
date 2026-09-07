const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const identity = require('../../artworks/identity');
const index = require('../../artworks/exhibition-index');
const sync = require('../../artworks/sync-service');
const rowEditorModule = require('../../artwork-management/row-editor-controller');
const excelExport = require('../../artwork-management/excel-export');

function artwork(workId, overrides = {}) {
  return { workId, title: 'Blue', artistName: 'Kim', size: '10x10', medium: 'Oil', year: '2025', imageRef: {}, currentPrice: 100, collection: { owned: false }, ...overrides };
}

function occurrence(id, workId, overrides = {}) {
  return { id, workId, title: 'Blue', author: 'Kim', size: '10x10', materials: 'Oil', year: '2025', price: 100, ...overrides };
}

test('same workId across exhibitions produces one row with complete ordered history and latest values', () => {
  const artworks = [artwork('work_a')];
  const exhibitions = [
    { id: 1, title: 'Earlier', endDate: '2025-01-10', works: [occurrence(11, 'work_a', { price: 100 })] },
    { id: 2, title: 'Latest', endDate: '2026-03-10', works: [occurrence(12, 'work_a', { price: 250 })] }
  ];
  const result = index.buildExhibitionIndex(exhibitions, artworks);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].exhibitionHistory.map((entry) => entry.name), ['Earlier', 'Latest']);
  assert.equal(result.rows[0].latestExhibitionName, 'Latest');
  assert.equal(result.rows[0].latestExhibitionDate, '2026-03-10');
  assert.equal(result.rows[0].latestPrice, 250);
});

test('collection-only is excluded while exhibited non-collection is included', () => {
  const artworks = [artwork('work_collection', { collection: { owned: true } }), artwork('work_exhibited')];
  const result = index.buildExhibitionIndex([{ id: 1, title: 'Show', endDate: '2026-01-01', works: [occurrence(1, 'work_exhibited')] }], artworks);
  assert.deepEqual(result.rows.map((row) => row.workId), ['work_exhibited']);
  assert.deepEqual(index.buildCollectionRows(artworks, []).map((row) => row.workId), ['work_collection']);
});

test('past exhibition status prefers collection and derives sold from occurrence sales', () => {
  const artworks = [
    artwork('work_owned', { collection: { owned: true } }),
    artwork('work_sold'),
    artwork('work_blank')
  ];
  const exhibitions = [{
    id: 1,
    title: 'Show',
    endDate: '2026-01-01',
    works: [occurrence(11, 'work_owned'), occurrence(12, 'work_sold'), occurrence(13, 'work_blank')],
    soldWorks: [{ workId: 11, itemType: '작품' }, { workId: 'work_sold', itemType: '작품' }]
  }];
  const statuses = Object.fromEntries(index.buildExhibitionIndex(exhibitions, artworks).rows.map((row) => [row.workId, row.ownershipSaleStatus]));
  assert.deepEqual(statuses, { work_owned: 'collection', work_sold: 'sold', work_blank: '' });
});

test('identity matching never merges title-only and reports ambiguous artist-title candidates', () => {
  const artworks = [
    artwork('work_kim_1'),
    artwork('work_kim_2', { size: '20x20', year: '2024' }),
    artwork('work_lee', { artistName: 'Lee' })
  ];
  assert.equal(identity.findArtworkMatch({ title: ' Blue ', author: 'Lee' }, artworks).artwork.workId, 'work_lee');
  assert.equal(identity.findArtworkMatch({ title: 'Blue', author: 'Park' }, artworks).status, 'unmatched');
  assert.equal(identity.findArtworkMatch({ title: 'blue', author: 'kim' }, artworks).status, 'ambiguous');
  assert.equal(identity.findArtworkMatch({ title: 'Blue', author: 'Kim', size: '20x20', year: '2024' }, artworks).artwork.workId, 'work_kim_2');
});

test('canonical identity edits propagate while currentPrice preserves historical prices', () => {
  const artworks = [artwork('work_a')];
  const exhibitions = [{ id: 1, endDate: '2026-01-01', works: [occurrence(1, 'work_a')], artWorks: [occurrence(1, 'work_a')] }];
  const result = sync.synchronizeCanonicalEdit({ artworks, exhibitions, workId: 'work_a', changes: { title: 'Green', artistName: 'Lee', currentPrice: 999 } });
  assert.equal(result.exhibitions[0].works[0].title, 'Green');
  assert.equal(result.exhibitions[0].works[0].author, 'Lee');
  assert.equal(result.exhibitions[0].works[0].price, 100);
  assert.equal(result.artworks[0].currentPrice, 999);
});

test('occurrence identity edits update canonical and latest occurrence price updates currentPrice', () => {
  const artworks = [artwork('work_a')];
  const exhibitions = [
    { id: 1, endDate: '2025-01-01', works: [occurrence(1, 'work_a', { price: 80 })] },
    { id: 2, endDate: '2026-01-01', works: [occurrence(2, 'work_a', { price: 100 })] }
  ];
  const older = sync.synchronizeOccurrenceEdit({ artworks, exhibitions, exhibitionId: 1, occurrenceId: 1, changes: { title: 'Green', price: 90 } });
  assert.equal(older.artworks[0].title, 'Green');
  assert.equal(older.artworks[0].currentPrice, 100);
  const latest = sync.synchronizeOccurrenceEdit({ artworks: older.artworks, exhibitions: older.exhibitions, exhibitionId: 2, occurrenceId: 2, changes: { price: 300 } });
  assert.equal(latest.artworks[0].currentPrice, 300);
  assert.equal(latest.exhibitions[0].works[0].price, 90);
});

test('saved Exhibition Detail occurrence links uniquely, creates when unmatched, and refuses ambiguity', () => {
  const artworks = [artwork('work_a'), artwork('work_b', { size: '20x20' })];
  const exhibition = { id: 1, endDate: '2026-01-01', works: [] };
  const linked = occurrence(1, null, { title: 'Blue', author: 'Kim', size: '10x10', price: 450 });
  exhibition.works = [linked];
  const linkedResult = sync.synchronizeSavedOccurrence({ artworks, exhibitions: [exhibition], exhibition, occurrence: linked });
  assert.equal(linkedResult.status, 'linked');
  assert.equal(linked.workId, 'work_a');
  assert.equal(linkedResult.artworks[0].currentPrice, 450);

  const ambiguous = occurrence(2, null, { title: 'Blue', author: 'Kim', size: '' });
  exhibition.works.push(ambiguous);
  assert.equal(sync.synchronizeSavedOccurrence({ artworks, exhibitions: [exhibition], exhibition, occurrence: ambiguous }).status, 'ambiguous');
  assert.equal(ambiguous.workId, null);

  const created = occurrence(3, null, { title: 'New', author: 'Park' });
  exhibition.works.push(created);
  const createdResult = sync.synchronizeSavedOccurrence({ artworks, exhibitions: [exhibition], exhibition, occurrence: created, randomUUID: () => '00000000-0000-4000-8000-000000000001' });
  assert.equal(createdResult.workId, 'work_00000000-0000-4000-8000-000000000001');
  assert.equal(createdResult.artworks.length, 3);
});

test('ambiguous occurrence can be explicitly linked or created without guessing', () => {
  const artworks = [artwork('work_a'), artwork('work_b', { size: '20x20' })];
  const exhibitions = [{ id: 1, title: 'Show', endDate: '2026-01-01', works: [occurrence(1, null, { size: '' })] }];
  const linked = sync.resolveOccurrence({ artworks, exhibitions, exhibitionId: 1, occurrenceId: 1, workId: 'work_b' });
  assert.equal(linked.exhibitions[0].works[0].workId, 'work_b');
  assert.equal(linked.artworks.length, 2);
  const created = sync.resolveOccurrence({ artworks, exhibitions, exhibitionId: 1, occurrenceId: 1, workId: null, randomUUID: () => '00000000-0000-4000-8000-000000000002' });
  assert.equal(created.exhibitions[0].works[0].workId, 'work_00000000-0000-4000-8000-000000000002');
  assert.equal(created.artworks.length, 3);
});

test('vendored Tabulator 6.5.0 assets are deployable', () => {
  const root = path.join(__dirname, '..', '..');
  ['tabulator.min.js', 'tabulator.min.css', 'LICENSE'].forEach((name) => {
    assert.ok(fs.statSync(path.join(root, 'vendor', 'tabulator-6.5.0', name)).size > 0, name);
  });
  assert.equal(require('../../node_modules/tabulator-tables/package.json').version, '6.5.0');
});

test('row editor adds consecutive drafts and never persists empty rows', async () => {
  const rows = [];
  let creates = 0;
  const table = {
    async addRow(data) {
      const row = { getData: () => data, getCell: () => ({ edit() {} }), update: async (changes) => Object.assign(data, changes) };
      rows.push(row);
      return row;
    }
  };
  const controller = rowEditorModule.create({ onCreate: () => { creates += 1; } });
  await controller.addDraft(table);
  await controller.addDraft(table);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].getData().workId, rows[1].getData().workId);
  assert.equal((await controller.commitRow(rows[0], 'collection')).status, 'draft');
  assert.equal(creates, 0);
});

test('valid draft persists once and adopts its permanent workId', async () => {
  const data = { workId: 'draft_1', _draft: true, title: 'New Work', artistName: 'Artist', collection: { owned: true } };
  const row = { getData: () => data, update: async (changes) => Object.assign(data, changes) };
  const controller = rowEditorModule.create({ onCreate: (values) => ({ workId: 'work_stable', ...values }) });
  const result = await controller.commitRow(row, 'collection');
  assert.equal(result.status, 'created');
  assert.equal(data.workId, 'work_stable');
  assert.equal(data._draft, false);
});

test('photo upload persists Blob references without base64 and failed replacement keeps old reference', async () => {
  class FileReaderStub {
    readAsDataURL() {
      this.result = 'data:image/png;base64,AAAA';
      this.onload();
    }
  }
  const original = { photoUrl: 'https://blob.example/old.png', photoPath: 'old.png' };
  const data = { workId: 'work_a', title: 'Blue', artistName: 'Kim', imageRef: original, _pendingPhotoFile: { name: 'new.png', type: 'image/png' } };
  const row = { getData: () => data, update: async (changes) => Object.assign(data, changes) };
  let receivedValues;
  const lifecycle = {
    buildPhotoUploadFileName: () => 'new-full.png',
    uploadImageDataUrl: async () => ({ url: 'https://blob.example/new.png', pathname: 'new.png' })
  };
  const success = rowEditorModule.create({ FileReaderImpl: FileReaderStub, imageLifecycle: lifecycle, onUpdate: (_row, values) => { receivedValues = values; return { ...data, ...values }; } });
  assert.equal((await success.commitRow(row, 'collection')).status, 'updated');
  assert.equal(receivedValues.imageRef.photoUrl, 'https://blob.example/new.png');
  assert.equal(JSON.stringify(receivedValues).includes('base64'), false);

  data.imageRef = original;
  data._pendingPhotoFile = { name: 'new.png', type: 'image/png' };
  const failed = rowEditorModule.create({ FileReaderImpl: FileReaderStub, imageLifecycle: lifecycle, onUpdate: () => false });
  assert.equal((await failed.commitRow(row, 'collection')).status, 'save-failed');
  assert.deepEqual(data.imageRef, original);
});

test('Excel export uses Tabulator XLSX for the active filtered and sorted rows', () => {
  const calls = [];
  const table = { download: (...args) => calls.push(args) };
  assert.equal(excelExport.download(table, 'collection'), true);
  assert.deepEqual(calls[0], ['xlsx', '소장품.xlsx', { sheetName: '소장품' }, 'active']);
});

test('vendored SheetJS 0.20.3 browser asset is deployable', () => {
  const root = path.join(__dirname, '..', '..');
  ['xlsx.full.min.js', 'LICENSE'].forEach((name) => assert.ok(fs.statSync(path.join(root, 'vendor', 'sheetjs-0.20.3', name)).size > 0, name));
  assert.equal(require('../../node_modules/xlsx/package.json').version, '0.20.3');
});