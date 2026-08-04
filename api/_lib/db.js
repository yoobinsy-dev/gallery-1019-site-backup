const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL environment variable.');
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=disable')
      ? undefined
      : { rejectUnauthorized: false }
  });

  return pool;
}

async function query(text, params = []) {
  const activePool = getPool();
  return activePool.query(text, params);
}

module.exports = {
  query
};
