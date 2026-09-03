const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');

function createDocument(elements) {
  return {
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.participant-input') return [];
      if (selector === '.add-exhibition-btn') return [];
      return [];
    },
    querySelector() { return null; },
    createElement() { return { innerHTML: '' }; },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
}

test('exhibition list persistence characterizes quota-safe exact creation writes', () => {
  const values = new Map([
    ['currentUser', JSON.stringify({ id: 1, accountType: '어드민', siteAccess: 'gallery' })],
    ['exhibitions', '[]']
  ]);
  const writes = [];
  const elements = {
    'exhibition-title': { value: 'New Exhibition' },
    'exhibition-start': { value: '2026-08-01' },
    'exhibition-end': { value: '2026-08-31' },
    'exhibition-type': { value: '단체전' },
    'form-message': { textContent: '' },
    'add-modal': { style: {} },
    'exhibitions-tbody': { innerHTML: '', appendChild() {} }
  };
  const page = exposeClassicScriptFunctions('exhibitions.js', ['addExhibition'], { globals: {
    document: createDocument(elements),
    localStorage: { getItem(key) { return values.get(key) ?? null; }, setItem() {} },
    safeSetLocalStorageItem(key, value) { writes.push([key, value]); values.set(key, value); return true; }
  } }).exposed;
  page.addExhibition();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'exhibitions');
  const saved = JSON.parse(writes[0][1]);
  assert.equal(saved[0].title, 'New Exhibition');
  assert.deepEqual(saved[0].works, []);
  assert.deepEqual(saved[0].staff, { planners: [], artists: [], staffs: [] });
});

test('inventory persistence characterizes failed remote summary local fallback', async () => {
  const values = new Map([
    ['currentUser', JSON.stringify({ id: 1, accountType: '어드민', siteAccess: 'gallery' })],
    ['exhibitions', JSON.stringify([{ id: 7, title: 'Local', startDate: '2026-08-01', endDate: '2026-08-31', type: '단체전', active: true }])]
  ]);
  const rows = [];
  const elements = { 'inventory-tbody': { innerHTML: '', appendChild(row) { rows.push(row); } } };
  const page = exposeClassicScriptFunctions('inventory.js', ['loadInventoryExhibitions'], { globals: {
    document: createDocument(elements),
    localStorage: { getItem(key) { return values.get(key) ?? null; } },
    fetch() { throw new Error('offline'); }
  } }).exposed;
  await page.loadInventoryExhibitions();
  assert.equal(rows.length, 1);
  assert.match(rows[0].innerHTML, /Local/);
});