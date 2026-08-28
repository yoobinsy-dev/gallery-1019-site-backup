const test = require('node:test');
const assert = require('node:assert/strict');

const { createRequest, createResponse } = require('../helpers/http');
const { loadCommonJsWithMocks } = require('../helpers/load-source');

async function invoke(handler, method, options = {}) {
  const response = createResponse();
  await handler(createRequest(method, options), response);
  return response;
}

test('exhibition snapshots characterize list/read, ETag, capture, restore, undo, and validation', async () => {
  const calls = [];
  const store = {
    async listExhibitionSnapshots(id, limit) { calls.push(['list', id, limit]); return [{ id: 7, exhibition_id: id }]; },
    async getLatestUndoPoint(id) { return { id: 8, created_at: '2026-08-28T00:00:00Z', note: `undo-${id}` }; },
    async createExhibitionSnapshotNow(id, note) { calls.push(['capture', id, note]); return { created: true, snapshot: { id: 9 } }; },
    async restoreExhibitionSnapshot(id, actor) { calls.push(['restore', id, actor]); return { id }; },
    async undoLastExhibitionRestore(id, actor) { calls.push(['undo', id, actor]); return { id }; }
  };
  const handler = loadCommonJsWithMocks('api/exhibition-snapshots.js', {
    './_lib/exhibition-snapshot-store': store
  });

  const listed = await invoke(handler, 'GET', { query: { exhibitionId: '900001', limit: '5' } });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().canUndo, true);
  assert.deepEqual(calls[0], ['list', 900001, 5]);
  const cached = await invoke(handler, 'GET', {
    query: { exhibitionId: '900001', limit: '5' }, headers: { 'if-none-match': listed.headers.etag }
  });
  assert.equal(cached.statusCode, 304);
  assert.equal((await invoke(handler, 'GET', { query: {} })).statusCode, 400);

  assert.equal((await invoke(handler, 'POST', {
    body: { action: 'capture-now', exhibitionId: 900001, note: 'CHARACTERIZATION_TEST_snapshot' }
  })).json().snapshot.id, 9);
  assert.equal((await invoke(handler, 'POST', {
    body: { action: 'restore', exhibitionId: 900001, snapshotId: 9 }
  })).json().restored.id, 9);
  assert.equal((await invoke(handler, 'POST', {
    body: { action: 'undo-restore', exhibitionId: 900001 }
  })).json().restored.id, 900001);
  assert.equal((await invoke(handler, 'POST', { body: { action: 'unknown', exhibitionId: 900001 } })).statusCode, 400);
});

test('snapshot cron characterizes authorization, result shape, no-store, and failure', async () => {
  const originalSecret = process.env.SNAPSHOT_CRON_SECRET;
  process.env.SNAPSHOT_CRON_SECRET = 'CHARACTERIZATION_TEST_secret';
  try {
    const success = loadCommonJsWithMocks('api/snapshots-cron.js', {
      './_lib/exhibition-snapshot-store': {
        async createDailyExhibitionSnapshots() { return { exhibitionCount: 3, createdCount: 2, existingCount: 1 }; }
      }
    });
    const forbidden = await invoke(success, 'GET');
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.headers['cache-control'], 'no-store');

    const allowed = await invoke(success, 'GET', { headers: { authorization: 'Bearer CHARACTERIZATION_TEST_secret' } });
    assert.deepEqual(allowed.json(), {
      ok: true, exhibitionCount: 3, createdCount: 2, existingCount: 1,
      timezone: 'Asia/Seoul', schedule: 'daily 07:00 and 19:00 KST'
    });

    const failure = loadCommonJsWithMocks('api/snapshots-cron.js', {
      './_lib/exhibition-snapshot-store': {
        async createDailyExhibitionSnapshots() { throw new Error('CHARACTERIZATION_TEST_failure'); }
      }
    });
    const failed = await invoke(failure, 'GET', { headers: { 'x-vercel-cron': '1' } });
    assert.equal(failed.statusCode, 500);
    assert.equal(failed.json().error, 'CHARACTERIZATION_TEST_failure');
  } finally {
    if (originalSecret === undefined) delete process.env.SNAPSHOT_CRON_SECRET;
    else process.env.SNAPSHOT_CRON_SECRET = originalSecret;
  }
});