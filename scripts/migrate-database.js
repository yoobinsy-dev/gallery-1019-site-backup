const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { resolve } = require('path');

const schemaPath = resolve(__dirname, '../sql/schema.sql');
const migrationSql = readFileSync(schemaPath, 'utf8');
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
  console.error('Missing DATABASE_MIGRATION_URL. Migrations require a direct administrative database connection.');
  process.exit(1);
}

const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: migrationUrl,
    ssl: migrationUrl.includes('sslmode=disable')
      ? undefined
      : { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  const digest = createHash('sha256').update(migrationSql).digest('hex');
  console.log(`Applied ${schemaPath} (sha256:${digest}).`);
}

migrate().catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  process.exit(1);
});