const { query } = require('./db');

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_state (
    state_key TEXT PRIMARY KEY,
    state_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let initialized = false;

async function ensureTable() {
  if (initialized) return;
  await query(TABLE_SQL);
  initialized = true;
}

async function getStateMap(keys) {
  await ensureTable();
  if (!Array.isArray(keys) || keys.length === 0) {
    return {};
  }

  const result = await query(
    'SELECT state_key, state_value FROM app_state WHERE state_key = ANY($1::text[])',
    [keys]
  );

  const map = {};
  result.rows.forEach((row) => {
    map[row.state_key] = row.state_value;
  });
  return map;
}

async function getStateMapWithMeta(keys) {
  await ensureTable();
  if (!Array.isArray(keys) || keys.length === 0) {
    return { data: {}, meta: {} };
  }

  const result = await query(
    'SELECT state_key, state_value, updated_at FROM app_state WHERE state_key = ANY($1::text[])',
    [keys]
  );

  const data = {};
  const meta = {};
  result.rows.forEach((row) => {
    data[row.state_key] = row.state_value;
    meta[row.state_key] = {
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
  });

  return { data, meta };
}

async function getStateMetaMap(keys) {
  await ensureTable();
  if (!Array.isArray(keys) || keys.length === 0) {
    return {};
  }

  const result = await query(
    'SELECT state_key, updated_at FROM app_state WHERE state_key = ANY($1::text[])',
    [keys]
  );

  const meta = {};
  result.rows.forEach((row) => {
    meta[row.state_key] = {
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
  });

  return meta;
}

async function setStateValue(key, value) {
  await ensureTable();
  const result = await query(
    `
      INSERT INTO app_state (state_key, state_value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()
      RETURNING updated_at
    `,
    [key, JSON.stringify(value)]
  );

  const updatedAt = result.rows[0]?.updated_at;
  return updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();
}

async function deleteStateValue(key) {
  await ensureTable();
  await query('DELETE FROM app_state WHERE state_key = $1', [key]);
}

module.exports = {
  getStateMap,
  getStateMetaMap,
  getStateMapWithMeta,
  setStateValue,
  deleteStateValue
};
