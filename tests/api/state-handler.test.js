const test = require('node:test');
const assert = require('node:assert/strict');

const { createRequest, createResponse } = require('../helpers/http');
const { loadCommonJsWithMocks } = require('../helpers/load-source');

function createHarness(initial = {}) {
  const values = structuredClone(initial.values || {});
  const meta = structuredClone(initial.meta || {});
  const audit = [];
  const alerts = [];
  const deleted = [];
  const reads = { values: 0, meta: 0 };
  const operations = [];
  const getStateMap = async (keys) => {
    reads.values += 1;
    operations.push(`read:${keys.join(',')}`);
    return Object.fromEntries(keys.map((key) => [key, values[key]]));
  };
  const getStateMetaMap = async (keys) => {
    reads.meta += 1;
    return Object.fromEntries(keys.map((key) => [key, meta[key]]));
  };
  const stateStore = {
    getStateMap,
    getStateMetaMap,
    async getStateMapWithMeta(keys) {
      operations.push(`read-meta:${keys.join(',')}`);
      return { data: Object.fromEntries(keys.map((key) => [key, values[key]])), meta: await getStateMetaMap(keys) };
    },
    async setStateValue(key, value) {
      operations.push(`write:${key}`);
      values[key] = structuredClone(value);
      const updatedAt = '2026-08-28T12:00:00.000Z';
      meta[key] = { updatedAt };
      return updatedAt;
    },
    async deleteStateValue(key) { deleted.push(key); delete values[key]; }
  };
  const handler = loadCommonJsWithMocks('api/state.js', {
    './_lib/state-store': stateStore,
    './_lib/audit-store': {
      async logStateWriteAttempt(entry) { operations.push(`audit:${entry.reason}`); audit.push(entry); },
      async recordAlert(entry) { alerts.push(entry); },
      async maybeTriggerConflictSpikeAlert() {}
    },
    './_lib/exhibition-image-refs': {
      buildTransferSafeExhibitions(exhibitions) {
        return { exhibitions: exhibitions.map(({ photoDataUrl, ...item }) => item), stats: { stripped: 1 } };
      },
      async migrateExhibitionImageReferences(exhibitions) { return { exhibitions, stats: { uploaded: 0 } }; }
    }
  });
  return { handler, values, meta, audit, alerts, deleted, reads, operations };
}

async function invoke(harness, method, options = {}) {
  const response = createResponse();
  await harness.handler(createRequest(method, options), response);
  return response;
}

test('GET /api/state characterizes allowed keys, response structure, ETag, and 304', async () => {
  const harness = createHarness({
    values: { users: [{ id: 1 }], exhibitions: [{ id: 2, photoDataUrl: 'data:image/png;base64,AA==' }] },
    meta: { users: { updatedAt: '2026-08-28T00:00:00.000Z' }, exhibitions: { updatedAt: null } }
  });
  const first = await invoke(harness, 'GET', { query: { keys: 'users,exhibitions' } });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json().data, { users: [{ id: 1 }], exhibitions: [{ id: 2 }] });
  assert.equal(first.json().ok, true);
  assert.match(first.headers.etag, /^W\/"state-/);
  assert.equal(first.headers['cache-control'], 'private, max-age=0, must-revalidate');
  assert.equal(first.headers['x-state-response-bytes'], String(Buffer.byteLength(first.body, 'utf8')));
  assert.deepEqual(harness.reads, { values: 1, meta: 1 });

  harness.reads.values = 0;
  harness.reads.meta = 0;
  const cached = await invoke(harness, 'GET', {
    query: { keys: 'users,exhibitions' }, headers: { 'if-none-match': first.headers.etag }
  });
  assert.equal(cached.statusCode, 304);
  assert.equal(cached.body, undefined);
  assert.deepEqual(harness.reads, { values: 0, meta: 1 });

  const summary = await invoke(harness, 'GET', { query: { keys: 'exhibitions', view: 'summary' } });
  assert.deepEqual(summary.json().data.exhibitions, [{
    id: 2,
    participants: [],
    staff: { planners: [], artists: [], staffs: [] },
    active: false,
    createdAt: null,
    updatedAt: null
  }]);
});

test('state handler characterizes rejected keys, malformed body, methods, and strict conflicts', async () => {
  const harness = createHarness({ meta: { users: { updatedAt: '2026-08-28T10:00:00.000Z' } } });
  const invalidGet = await invoke(harness, 'GET', { query: { keys: 'invalid' } });
  assert.equal(invalidGet.statusCode, 200);
  assert.deepEqual(Object.keys(invalidGet.json().meta), [
    'users', 'exhibitions', 'pottery-students-v1', 'pottery-personal-work-v1',
    'studio-calendar-state-v1', 'pottery-material-orders-v1', 'pottery-accounting-v1'
  ]);
  assert.equal((await invoke(harness, 'PUT', { body: { key: 'invalid', value: [] } })).statusCode, 400);
  assert.equal((await invoke(harness, 'POST')).statusCode, 405);

  const conflict = await invoke(harness, 'PUT', { body: { key: 'users', value: [] } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().conflict.key, 'users');
  assert.equal(harness.audit[0].reason, 'missing-client-base-version');
});

test('PUT /api/state characterizes successful writes, safeguards, audit, and response shape', async () => {
  const admin = { id: 1, username: 'admin', password: 'secret', accountType: '어드민' };
  const harness = createHarness({ values: { users: [admin] }, meta: { users: { updatedAt: null } } });
  const response = await invoke(harness, 'PUT', {
    body: { key: 'users', value: [{ ...admin, password: '', displayName: 'changed' }], syncMode: 'delta' },
    headers: { 'x-request-id': 'CHARACTERIZATION_TEST_request', 'x-cloud-client-id': 'CHARACTERIZATION_TEST_client' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().meta.key, 'users');
  assert.equal(harness.values.users[0].password, 'secret');
  assert.equal(harness.audit.at(-1).decision, 'accepted');
  assert.equal(harness.audit.at(-1).reason, 'users-delta-merged');
  assert.deepEqual(harness.operations, [
    'read-meta:users',
    'read:users',
    'write:users',
    'audit:users-delta-merged'
  ]);

  const rejected = createHarness({ values: { users: [admin] }, meta: { users: { updatedAt: null } } });
  const noAdmin = await invoke(rejected, 'PUT', {
    body: { key: 'users', value: [{ id: 1, username: 'member', password: 'secret' }], removedIds: [] }
  });
  assert.equal(noAdmin.statusCode, 422);
  assert.equal(rejected.alerts[0].alertType, 'users-admin-invariant-rejected');
});

test('DELETE /api/state characterizes blocked users deletion and accepted disposable-key deletion', async () => {
  const harness = createHarness({ values: { users: [], 'pottery-accounting-v1': [] } });
  const blocked = await invoke(harness, 'DELETE', { query: { key: 'users' } });
  assert.equal(blocked.statusCode, 403);
  assert.equal(harness.deleted.length, 0);

  const accepted = await invoke(harness, 'DELETE', { query: { key: 'pottery-accounting-v1' } });
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual(harness.deleted, ['pottery-accounting-v1']);
  assert.equal(harness.audit.at(-1).reason, 'explicit-delete');
});