const assert = require('node:assert/strict');
const { list } = require('@vercel/blob');
const { Client } = require('pg');

const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '');
  const imageToken = process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
  if (!databaseUrl || !imageToken) {
    throw new Error('DEV cleanup check refused: required development environment was not injected.');
  }
  const database = new URL(databaseUrl);
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    databaseEndpointId: database.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(database.username),
    archiveWriteEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const residue = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM app_state_write_audit
          WHERE request_id LIKE 'CHARACTERIZATION_TEST_%'
             OR client_id LIKE 'CHARACTERIZATION_TEST_%') AS audit_count,
        (SELECT COUNT(*)::int FROM app_state_snapshots
          WHERE note LIKE 'CHARACTERIZATION_TEST_%'
             OR snapshot_type LIKE 'CHARACTERIZATION_TEST_%') AS full_snapshot_count,
        (SELECT COUNT(*)::int FROM exhibition_state_snapshots
          WHERE note LIKE 'CHARACTERIZATION_TEST_%'
             OR snapshot_type LIKE 'CHARACTERIZATION_TEST_%') AS exhibition_snapshot_count,
        (SELECT COUNT(*)::int
          FROM jsonb_array_elements((SELECT state_value FROM app_state WHERE state_key = 'exhibitions')) item
          WHERE COALESCE(item->>'title', '') LIKE 'CHARACTERIZATION_TEST_%') AS exhibition_count
    `);
    const blobs = await list({ token: imageToken, prefix: 'exhibition-images/', limit: 1000 });
    const result = { ...residue.rows[0], image_blob_count: blobs.blobs.length };
    assert.deepEqual(result, {
      audit_count: 0,
      full_snapshot_count: 0,
      exhibition_snapshot_count: 0,
      exhibition_count: 0,
      image_blob_count: 0
    });
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});