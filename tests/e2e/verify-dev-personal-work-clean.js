const assert = require('node:assert/strict');
const { Client } = require('pg');

const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '');
  if (!databaseUrl) throw new Error('DEV personal-work cleanup check refused: DATABASE_URL was not injected.');
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
        (SELECT COUNT(*)::int
          FROM jsonb_array_elements((SELECT state_value FROM app_state WHERE state_key = 'pottery-personal-work-v1')) entry
          WHERE COALESCE(entry->>'userName', '') LIKE 'CHARACTERIZATION_TEST_%'
             OR COALESCE(entry->>'id', '') LIKE 'CHARACTERIZATION_TEST_%') AS personal_work_count,
        (SELECT COUNT(*)::int
          FROM jsonb_array_elements(COALESCE(
            (SELECT state_value->'events' FROM app_state WHERE state_key = 'studio-calendar-state-v1'),
            '[]'::jsonb
          )) event
          WHERE COALESCE(event->>'title', '') LIKE 'CHARACTERIZATION_TEST_%'
             OR COALESCE(event->>'id', '') LIKE 'CHARACTERIZATION_TEST_%') AS calendar_event_count
    `);
    assert.deepEqual(residue.rows[0], { personal_work_count: 0, calendar_event_count: 0 });
    console.log(JSON.stringify({ ok: true, ...residue.rows[0] }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});