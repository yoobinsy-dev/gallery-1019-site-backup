const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTransferSafeExhibitions } = require('../../api/_lib/exhibition-image-refs');

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const PUBLIC_URL = 'https://example.public.blob.vercel-storage.com/exhibition-images/test.png';

test('transfer-safe images strip embedded payloads only for Blob-backed records', () => {
  const input = [{
    id: 1,
    artWorks: [{ id: 1, photoUrl: PUBLIC_URL, photoPreviewUrl: PUBLIC_URL, photoDataUrl: DATA_URL, photoPreviewDataUrl: DATA_URL }],
    goods: [{ id: 2, photoDataUrl: DATA_URL, photoPreviewDataUrl: DATA_URL }]
  }];
  const result = buildTransferSafeExhibitions(input);

  assert.equal(result.exhibitions[0].artWorks[0].photoUrl, PUBLIC_URL);
  assert.equal(result.exhibitions[0].artWorks[0].photoDataUrl, '');
  assert.equal(result.exhibitions[0].artWorks[0].photoPreviewDataUrl, '');
  assert.equal(result.exhibitions[0].goods[0].photoDataUrl, DATA_URL);
  assert.equal(result.exhibitions[0].goods[0].photoPreviewDataUrl, DATA_URL);
  assert.deepEqual(result.stats, {
    scannedItemCount: 2,
    normalizedUrlFieldCount: 0,
    strippedFullDataUrlCount: 1,
    strippedPreviewDataUrlCount: 1
  });
  assert.equal(input[0].artWorks[0].photoDataUrl, DATA_URL);
});

test('transfer-safe images normalize legacy HTTP references and preserve non-public compatibility data', () => {
  const result = buildTransferSafeExhibitions([{
    id: 2,
    works: [{ id: 2, photoDataUrl: 'https://legacy.example/full.jpg', photoPreviewDataUrl: 'https://legacy.example/preview.jpg' }]
  }]);
  assert.equal(result.exhibitions[0].works[0].photoUrl, 'https://legacy.example/full.jpg');
  assert.equal(result.exhibitions[0].works[0].photoPreviewUrl, 'https://legacy.example/preview.jpg');
  assert.equal(result.stats.normalizedUrlFieldCount, 2);
});