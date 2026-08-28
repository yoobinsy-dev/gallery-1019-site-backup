const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { del, list } = require('@vercel/blob');
const { Client } = require('pg');

const {
  DEVELOPMENT_IDENTITIES,
  assertMutableTestTarget,
  assertSyntheticIdentifier
} = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const REQUEST_ID = `CHARACTERIZATION_TEST_image_${Date.now()}`;
const EXHIBITION_ID = Date.now();
const TITLE = `CHARACTERIZATION_TEST_EXHIBITION_${EXHIBITION_ID}`;
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nVQAAAAASUVORK5CYII=';

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '');
  const imageToken = process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
  if (!databaseUrl || !imageToken) {
    throw new Error('Mutable DEV test refused: required development environment was not injected.');
  }
  const database = new URL(databaseUrl);
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    databaseEndpointId: database.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(database.username),
    archiveWriteEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });
  assertSyntheticIdentifier(TITLE);

  const requests = [];
  const safeFetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'gallery-1019-site.vercel.app') {
      throw new Error(`Production request blocked: ${url.href}`);
    }
    requests.push({ method: String(init?.method || 'GET').toUpperCase(), host: url.hostname, path: url.pathname });
    return fetch(input, init);
  };

  const client = new Client({ connectionString: databaseUrl });
  let originalRow;
  let uploadUrl = '';
  let uploadPath = '';
  await client.connect();
  try {
    const captured = await client.query(
      'SELECT state_value, updated_at FROM app_state WHERE state_key = $1',
      ['exhibitions']
    );
    assert.equal(captured.rowCount, 1, 'DEV exhibitions state must exist before the test.');
    originalRow = structuredClone(captured.rows[0]);
    const originalHash = hashJson(originalRow.state_value);

    const uploadResponse = await safeFetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': REQUEST_ID },
      body: JSON.stringify({
        filename: `${TITLE}.png`,
        dataUrl: PNG_DATA_URL
      })
    });
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadResponse.status, 200, JSON.stringify(uploadBody));
    assert.equal(uploadBody.ok, true);
    uploadUrl = String(uploadBody.file?.url || '');
    uploadPath = String(uploadBody.file?.pathname || '');
    assert.match(uploadUrl, /\.public\.blob\.vercel-storage\.com\//);
    assert.equal(uploadBody.verification?.isImage, true);

    const synthetic = {
      id: EXHIBITION_ID,
      title: TITLE,
      name: TITLE,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      works: [],
      artWorks: [{
        id: 1,
        title: 'CHARACTERIZATION_TEST_WORK',
        author: 'CHARACTERIZATION_TEST_ARTIST',
        photoUrl: uploadUrl,
        photoPreviewUrl: uploadUrl,
        photoDataUrl: '',
        photoPreviewDataUrl: ''
      }],
      goods: [], soldWorks: [], artSoldWorks: [], soldGoods: []
    };
    const stateResponse = await safeFetch(`${BASE_URL}/api/state`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-request-id': REQUEST_ID,
        'x-cloud-client-id': REQUEST_ID
      },
      body: JSON.stringify({ key: 'exhibitions', value: [synthetic], syncMode: 'delta' })
    });
    const stateBody = await stateResponse.json();
    assert.equal(stateResponse.status, 200, JSON.stringify(stateBody));

    const reloadResponse = await safeFetch(`${BASE_URL}/api/state?keys=exhibitions`, { method: 'GET' });
    const reloadBody = await reloadResponse.json();
    assert.equal(reloadResponse.status, 200);
    const persisted = reloadBody.data.exhibitions.find((item) => Number(item.id) === EXHIBITION_ID);
    assert.ok(persisted, 'Synthetic exhibition must persist through DEV state reload.');
    assert.equal(persisted.artWorks[0].photoUrl, uploadUrl);
    assert.equal(persisted.artWorks[0].photoPreviewUrl, uploadUrl);
    assert.equal(String(persisted.artWorks[0].photoDataUrl || ''), '');
    assert.equal(String(persisted.artWorks[0].photoPreviewDataUrl || ''), '');

    const imageResponse = await safeFetch(uploadUrl, { method: 'GET' });
    assert.equal(imageResponse.ok, true);
    assert.match(String(imageResponse.headers.get('content-type') || ''), /^image\//);

    console.log(JSON.stringify({
      ok: true,
      originalStateHash: originalHash,
      uploadedToDevelopmentPublicBlob: true,
      persistedAndReloaded: true,
      productionRequests: requests.filter((request) => request.host === 'gallery-1019-site.vercel.app').length
    }));
  } finally {
    if (originalRow) {
      await client.query(
        'UPDATE app_state SET state_value = $2::jsonb, updated_at = $3 WHERE state_key = $1',
        ['exhibitions', JSON.stringify(originalRow.state_value), originalRow.updated_at]
      );
      await client.query(
        'DELETE FROM app_state_write_audit WHERE request_id = $1 OR client_id = $1',
        [REQUEST_ID]
      );
    }
    if (uploadUrl) {
      await del(uploadUrl, { token: imageToken });
    }

    if (originalRow) {
      const restored = await client.query(
        'SELECT state_value, updated_at FROM app_state WHERE state_key = $1',
        ['exhibitions']
      );
      assert.equal(hashJson(restored.rows[0].state_value), hashJson(originalRow.state_value));
      assert.equal(new Date(restored.rows[0].updated_at).toISOString(), new Date(originalRow.updated_at).toISOString());
    }
    if (uploadPath) {
      const remaining = await list({ token: imageToken, prefix: uploadPath, limit: 10 });
      assert.equal(remaining.blobs.some((blob) => blob.pathname === uploadPath), false);
    }
    await client.end();
  }

  assert.equal(requests.some((request) => request.host === 'gallery-1019-site.vercel.app'), false);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});