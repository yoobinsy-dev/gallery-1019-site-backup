const { Client } = require('pg');

async function run() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();

  const simple = await c.query('SELECT version() AS v, current_database() AS db');
  console.log('BASIC', JSON.stringify(simple.rows));

  try {
    await c.query('CREATE EXTENSION IF NOT EXISTS pg_dirtyread');
    console.log('EXT pg_dirtyread OK');
  } catch (error) {
    console.log('EXT pg_dirtyread ERR', error.message);
  }

  try {
    const dirty = await c.query("SELECT state_key, updated_at FROM pg_dirtyread('app_state') ORDER BY updated_at DESC NULLS LAST LIMIT 50");
    console.log('DIRTY_ROWS', dirty.rowCount);
    console.log(JSON.stringify(dirty.rows));
  } catch (error) {
    console.log('DIRTY_QUERY ERR', error.message);
  }

  try {
    await c.query('CREATE EXTENSION IF NOT EXISTS pageinspect');
    console.log('EXT pageinspect OK');
  } catch (error) {
    console.log('EXT pageinspect ERR', error.message);
  }

  try {
    const rel = await c.query("SELECT relpages, reltuples FROM pg_class WHERE relname='app_state'");
    console.log('RELPAGES', JSON.stringify(rel.rows));
  } catch (error) {
    console.log('RELPAGES ERR', error.message);
  }

  await c.end();
}

run().catch((error) => {
  console.error('FATAL', error.message);
  process.exit(1);
});
