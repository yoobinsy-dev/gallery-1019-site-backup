const { query } = require('./db');
const { getStateMapWithMeta, setStateValue } = require('./state-store');

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_state_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_date_kst DATE NOT NULL,
    snapshot_type TEXT NOT NULL DEFAULT 'daily-19-kst',
    state_payload JSONB NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    restored_at TIMESTAMPTZ,
    restored_by TEXT,
    UNIQUE (snapshot_date_kst, snapshot_type)
  );
`;

let initialized = false;

function getKstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(date);
}

async function ensureSnapshotTable() {
  if (initialized) return;
  await query(TABLE_SQL);
  initialized = true;
}

async function buildSnapshotPayload() {
  const keys = ['users', 'exhibitions'];
  const { data, meta } = await getStateMapWithMeta(keys);

  return {
    keys,
    data,
    meta,
    capturedAt: new Date().toISOString()
  };
}

async function getSnapshotById(id) {
  await ensureSnapshotTable();

  const result = await query(
    `
      SELECT id, snapshot_date_kst, snapshot_type, state_payload, source, note, created_at, restored_at, restored_by
      FROM app_state_snapshots
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function createSnapshot({
  snapshotType = 'daily-19-kst',
  source = 'system',
  note = null,
  dedupeByKstDate = true
} = {}) {
  await ensureSnapshotTable();

  const snapshotDateKst = getKstDateString();
  const payload = await buildSnapshotPayload();

  if (dedupeByKstDate) {
    const insertResult = await query(
      `
        INSERT INTO app_state_snapshots (snapshot_date_kst, snapshot_type, state_payload, source, note)
        VALUES ($1::date, $2, $3::jsonb, $4, $5)
        ON CONFLICT (snapshot_date_kst, snapshot_type)
        DO NOTHING
        RETURNING id, snapshot_date_kst, snapshot_type, source, note, created_at
      `,
      [snapshotDateKst, snapshotType, JSON.stringify(payload), source, note]
    );

    if (insertResult.rows[0]) {
      return {
        created: true,
        snapshot: insertResult.rows[0]
      };
    }

    const existingResult = await query(
      `
        SELECT id, snapshot_date_kst, snapshot_type, source, note, created_at
        FROM app_state_snapshots
        WHERE snapshot_date_kst = $1::date AND snapshot_type = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [snapshotDateKst, snapshotType]
    );

    return {
      created: false,
      snapshot: existingResult.rows[0] || null
    };
  }

  const insertResult = await query(
    `
      INSERT INTO app_state_snapshots (snapshot_date_kst, snapshot_type, state_payload, source, note)
      VALUES ($1::date, $2, $3::jsonb, $4, $5)
      RETURNING id, snapshot_date_kst, snapshot_type, source, note, created_at
    `,
    [snapshotDateKst, snapshotType, JSON.stringify(payload), source, note]
  );

  return {
    created: true,
    snapshot: insertResult.rows[0] || null
  };
}

async function listSnapshots(limit = 30) {
  await ensureSnapshotTable();

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  const result = await query(
    `
      SELECT id, snapshot_date_kst, snapshot_type, source, note, created_at, restored_at, restored_by
      FROM app_state_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

async function restoreSnapshot(snapshotId, restoredBy = 'manual') {
  await ensureSnapshotTable();

  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) {
    throw new Error('Snapshot not found.');
  }

  const payload = snapshot.state_payload || {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};

  if (Object.prototype.hasOwnProperty.call(data, 'users')) {
    await setStateValue('users', data.users);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'exhibitions')) {
    await setStateValue('exhibitions', data.exhibitions);
  }

  await query(
    `
      UPDATE app_state_snapshots
      SET restored_at = NOW(),
          restored_by = $2
      WHERE id = $1
    `,
    [snapshotId, restoredBy]
  );

  return snapshot;
}

module.exports = {
  ensureSnapshotTable,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  getSnapshotById,
  getKstDateString
};
