const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');

function quotaError() {
  const error = new Error('quota');
  error.name = 'QuotaExceededError';
  return error;
}

function loadStorageFunctions(localStorage, messages = []) {
  const loaded = exposeClassicScriptFunctions('auth.js', [
    'isStorageQuotaError',
    'stripHeavyFieldsFromValue',
    'compactSerializedExhibitionsValue',
    'compactStoredExhibitions',
    'safeSetLocalStorageItem'
  ], {
    globals: {
      localStorage,
      console: {
        log() {},
        warn(...args) { messages.push(['warn', ...args]); },
        error(...args) { messages.push(['error', ...args]); }
      }
    }
  });
  return loaded.exposed;
}

test('safe storage characterizes exact writes, native serialization, and ordinary failures', () => {
  const values = new Map();
  const calls = [];
  const messages = [];
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      calls.push([key, value]);
      if (key === 'broken') throw new TypeError('blocked');
      values.set(key, String(value));
    }
  };
  const model = loadStorageFunctions(storage, messages);

  assert.equal(model.safeSetLocalStorageItem('ordinary', '{"unknown":1}'), true);
  assert.equal(values.get('ordinary'), '{"unknown":1}');
  assert.equal(model.safeSetLocalStorageItem('native-coercion', 42), true);
  assert.equal(values.get('native-coercion'), '42');
  assert.equal(model.safeSetLocalStorageItem('broken', 'value'), false);
  assert.deepEqual(calls, [
    ['ordinary', '{"unknown":1}'],
    ['native-coercion', 42],
    ['broken', 'value']
  ]);
  assert.equal(messages.filter(([type]) => type === 'error').length, 1);
});

test('safe storage characterizes exhibition compaction order and field preservation', () => {
  const attempts = [];
  const source = [{
    id: 1,
    unknownField: 'keep',
    works: [{
      photoDataUrl: 'full',
      imageDataUrl: 'image',
      photoPreviewDataUrl: 'photo-preview',
      fileDataUrl: 'file',
      previewDataUrl: 'preview',
      nested: { unknownNested: true }
    }]
  }];
  const storage = {
    getItem() { return null; },
    setItem(key, value) {
      attempts.push([key, value]);
      const parsed = JSON.parse(value);
      const work = parsed[0].works[0];
      if (work.photoDataUrl || work.fileDataUrl) throw quotaError();
    }
  };
  const model = loadStorageFunctions(storage);

  assert.equal(model.safeSetLocalStorageItem('exhibitions', JSON.stringify(source)), true);
  assert.equal(attempts.length, 3);
  const moderate = JSON.parse(attempts[1][1])[0].works[0];
  const aggressive = JSON.parse(attempts[2][1])[0].works[0];
  assert.equal(moderate.photoDataUrl, '');
  assert.equal(moderate.imageDataUrl, '');
  assert.equal(moderate.fileDataUrl, 'file');
  assert.equal(aggressive.fileDataUrl, '');
  assert.equal(aggressive.previewDataUrl, '');
  assert.equal(aggressive.photoPreviewDataUrl, 'photo-preview');
  assert.equal(aggressive.nested.unknownNested, true);
  assert.equal(JSON.parse(attempts[2][1])[0].unknownField, 'keep');
  assert.equal(source[0].works[0].photoDataUrl, 'full');
});

test('safe storage characterizes stored-exhibition recovery retry and terminal quota failure', () => {
  const initialExhibitions = JSON.stringify([{
    id: 1,
    works: [{ photoDataUrl: 'full', photoPreviewDataUrl: 'preview', unknownField: 'keep' }]
  }]);
  const values = new Map([['exhibitions', initialExhibitions]]);
  let targetAttempts = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === 'target') {
        targetAttempts += 1;
        if (targetAttempts === 1) throw quotaError();
      }
      values.set(key, String(value));
    }
  };
  const model = loadStorageFunctions(storage);

  assert.equal(model.safeSetLocalStorageItem('target', '{"value":1}'), true);
  assert.equal(targetAttempts, 2);
  assert.equal(values.get('target'), '{"value":1}');
  const compacted = JSON.parse(values.get('exhibitions'))[0].works[0];
  assert.equal(compacted.photoDataUrl, '');
  assert.equal(compacted.photoPreviewDataUrl, 'preview');
  assert.equal(compacted.unknownField, 'keep');

  const alwaysFull = {
    getItem() { return initialExhibitions; },
    setItem() { throw quotaError(); }
  };
  assert.equal(loadStorageFunctions(alwaysFull).safeSetLocalStorageItem('target', 'value'), false);
});

test('safe storage recognizes current browser quota error variants', () => {
  const model = loadStorageFunctions({ getItem() { return null; }, setItem() {} });
  assert.equal(model.isStorageQuotaError({ name: 'QuotaExceededError' }), true);
  assert.equal(model.isStorageQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(model.isStorageQuotaError({ code: 22 }), true);
  assert.equal(model.isStorageQuotaError({ code: 1014 }), true);
  assert.equal(model.isStorageQuotaError(new TypeError('other')), false);
});