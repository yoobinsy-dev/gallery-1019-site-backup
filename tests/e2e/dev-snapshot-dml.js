const assert = require('node:assert/strict');
const { Client } = require('pg');

const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const MARKER = `CHARACTERIZATION_TEST_SNAPSHOT_${Date.now()}`;
const EXHIBITION_ID = Date.now();

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '');
  if (!databaseUrl) throw new Error('Mutable DEV test refused: DATABASE_URL was not injected.');
  const database = new URL(databaseUrl);
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    databaseEndpointId: database.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(database.username),
    archiveWriteEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });

  const cronResponse = await fetch(`${BASE_URL}/api/snapshots-cron`, { method: 'GET' });
  assert.equal(cronResponse.status, 403, 'Unauthenticated DEV cron request must be rejected without mutation.');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const privileges = await client.query(`
      SELECT current_user AS role,
        has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
        has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create
    `);
    assert.equal(privileges.rows[0].role, DEVELOPMENT_IDENTITIES.databaseRole);
    assert.equal(privileges.rows[0].database_create, false);
    assert.equal(privileges.rows[0].schema_create, false);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_state_snapshots
        (snapshot_date_kst, snapshot_type, state_payload, source, note)
       VALUES ($1::date, $2, $3::jsonb, $4, $5)`,
      ['2099-12-31', MARKER, JSON.stringify({ marker: MARKER }), 'test', MARKER]
    );
    await client.query(
      `INSERT INTO exhibition_state_snapshots
        (exhibition_id, snapshot_date_kst, snapshot_type, snapshot_payload, works_goods_count, sold_items_count, source, note)
       VALUES ($1, $2::date, $3, $4::jsonb, 0, 0, $5, $6)`,
      [EXHIBITION_ID, '2099-12-31', MARKER, JSON.stringify({ id: EXHIBITION_ID, title: MARKER }), 'test', MARKER]
    );
    const inside = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM app_state_snapshots WHERE note = $1) AS full_count,
        (SELECT COUNT(*)::int FROM exhibition_state_snapshots WHERE note = $1) AS exhibition_count`,
      [MARKER]
    );
    assert.deepEqual(inside.rows[0], { full_count: 1, exhibition_count: 1 });
    await client.query('ROLLBACK');

    const after = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM app_state_snapshots WHERE note = $1) AS full_count,
        (SELECT COUNT(*)::int FROM exhibition_state_snapshots WHERE note = $1) AS exhibition_count`,
      [MARKER]
    );
    assert.deepEqual(after.rows[0], { full_count: 0, exhibition_count: 0 });
    console.log(JSON.stringify({
      ok: true,
      role: privileges.rows[0].role,
      schemaCreate: privileges.rows[0].schema_create,
      snapshotDmlRolledBack: true,
      unauthorizedCronStatus: cronResponse.status
    }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});