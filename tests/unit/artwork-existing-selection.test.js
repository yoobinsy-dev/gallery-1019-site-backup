const test = require('node:test');
const assert = require('node:assert/strict');

const collection = require('../../artwork-management/collection-add-controller');
const exhibition = require('../../exhibitions/detail/collection-picker-controller');
const picker = require('../../artworks/work-picker-controller');

function artwork(workId, overrides = {}) {
  return { workId, title: `Title ${workId}`, artistName: 'Kim', year: '2026', medium: 'Oil', size: '10x10', currentPrice: '₩100,000', imageRef: { photoUrl: `https://images/${workId}.jpg` }, collection: { owned: false }, ...overrides };
}

test('collection candidates include exhibited works and exclude already-owned works', () => {
  const artworks = [artwork('a'), artwork('b', { collection: { owned: true } }), artwork('c')];
  const rows = [{ workId: 'a', exhibitionHistory: [{ name: 'Show' }] }, { workId: 'b', exhibitionHistory: [{ name: 'Show' }] }];
  assert.deepEqual(collection.buildCandidates(artworks, rows).map((item) => item.workId), ['a']);
});

test('collection batch reuses canonical artworks with one confirmation date and unique sequential numbers', () => {
  const artworks = [
    artwork('owned', { collection: { owned: true, collectionNumber: 'COL-2026-002', dateAdded: '2026-01-01' } }),
    artwork('a'),
    artwork('b')
  ];
  const result = collection.addToCollection(artworks, ['a', 'b'], new Date('2026-09-08T00:30:00+09:00'));
  assert.equal(result.artworks.length, 3);
  assert.equal(result.addedCount, 2);
  assert.deepEqual(result.artworks.slice(1).map((item) => item.collection), [
    { owned: true, collectionNumber: 'COL-2026-003', dateAdded: '2026-09-08' },
    { owned: true, collectionNumber: 'COL-2026-004', dateAdded: '2026-09-08' }
  ]);
});

test('picker search covers title, artist, year, and medium with normalized substring matching', () => {
  const candidates = [artwork('a', { title: 'Blue Moon' }), artwork('b', { artistName: 'Park', year: '2024', medium: 'Ceramic' })];
  assert.deepEqual(picker.filterCandidates(candidates, ' blue ').map((item) => item.workId), ['a']);
  assert.deepEqual(picker.filterCandidates(candidates, 'PARK').map((item) => item.workId), ['b']);
  assert.deepEqual(picker.filterCandidates(candidates, '2024').map((item) => item.workId), ['b']);
  assert.deepEqual(picker.filterCandidates(candidates, 'ram').map((item) => item.workId), ['b']);
});

test('exhibition candidates are collection-only and exclude works already linked to the current exhibition', () => {
  const artworks = [artwork('a', { collection: { owned: true } }), artwork('b', { collection: { owned: true } }), artwork('c')];
  assert.deepEqual(exhibition.buildCandidates(artworks, { works: [{ id: 1, workId: 'a' }] }).map((item) => item.workId), ['b']);
});

test('multiple collection works create canonical-linked occurrences with default prices and reused image refs', () => {
  const artworks = [artwork('a', { collection: { owned: true } }), artwork('b', { collection: { owned: true }, currentPrice: 250 })];
  let id = 10;
  const occurrences = exhibition.createOccurrences(artworks, { works: [] }, ['a', 'b'], { createOccurrenceId: () => ++id, getCurrentUserId: () => 'user' });
  assert.equal(occurrences.length, 2);
  assert.deepEqual(occurrences.map((item) => item.workId), ['a', 'b']);
  assert.deepEqual(occurrences.map((item) => item.price), ['₩100,000', 250]);
  assert.equal(occurrences[0].photoUrl, artworks[0].imageRef.photoUrl);
  assert.equal(occurrences[0].photoDataUrl, '');
});

test('stale or repeated selection cannot add a duplicate workId to an exhibition', () => {
  const artworks = [artwork('a', { collection: { owned: true } }), artwork('b', { collection: { owned: true } })];
  const occurrences = exhibition.createOccurrences(artworks, { works: [{ id: 1, workId: 'a' }] }, ['a', 'a', 'b'], { createOccurrenceId: () => 2, getCurrentUserId: () => 'user' });
  assert.deepEqual(occurrences.map((item) => item.workId), ['b']);
});

test('existing works editor batch pathway saves once and rejects duplicate workIds again', () => {
  const worksEditor = require('../../exhibitions/detail/works-editor-controller');
  const exhibitionState = { works: [{ id: 1, workId: 'a' }] };
  const calls = { undo: 0, save: 0, render: 0, visibility: 0 };
  const controller = worksEditor.create({
    state: { exhibition: exhibitionState },
    document: {},
    window: {},
    getCurrentExhibition: () => exhibitionState,
    pushWorkUndoSnapshot: () => { calls.undo += 1; },
    saveExhibition: () => { calls.save += 1; },
    renderWorkRows: () => { calls.render += 1; },
    updateSaveAllButtonVisibility: () => { calls.visibility += 1; }
  });
  assert.equal(controller.addWorkOccurrences([{ id: 2, workId: 'a' }, { id: 3, workId: 'b' }, { id: 4, workId: 'b' }]), 1);
  assert.deepEqual(exhibitionState.works.map((item) => item.workId), ['a', 'b']);
  assert.deepEqual(calls, { undo: 1, save: 1, render: 1, visibility: 1 });
});