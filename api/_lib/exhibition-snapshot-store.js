const { query } = require('./db');
const { getStateMap, setStateValue } = require('./state-store');
const { getKstDateString } = require('./snapshot-store');
const { put } = require('@vercel/blob');

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS exhibition_state_snapshots (
    id BIGSERIAL PRIMARY KEY,
    exhibition_id BIGINT NOT NULL,
    snapshot_date_kst DATE NOT NULL,
    snapshot_type TEXT NOT NULL DEFAULT 'daily-19-kst',
    snapshot_payload JSONB NOT NULL,
    works_goods_count INTEGER NOT NULL DEFAULT 0,
    sold_items_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    archive_url TEXT,
    archive_path TEXT,
    archive_stored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    restored_at TIMESTAMPTZ,
    restored_by TEXT,
    undo_consumed_at TIMESTAMPTZ,
    UNIQUE (exhibition_id, snapshot_date_kst, snapshot_type)
  );
`;

const SNAPSHOT_RETENTION_DAYS = 7;
const SNAPSHOT_ARCHIVE_STRICT = String(process.env.SNAPSHOT_ARCHIVE_STRICT || 'false').toLowerCase() === 'true';

let initialized = false;

function isConcurrentCreateRace(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (code === '23505' && message.includes('pg_type_typname_nsp_index')) {
    return true;
  }

  return message.includes('pg_type_typname_nsp_index');
}

function getKstHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((part) => part.type === 'hour');
  const hour = Number(hourPart?.value || 0);
  return Number.isFinite(hour) ? hour : 0;
}

function getAutoSnapshotSlot(date = new Date()) {
  const hour = getKstHour(date);
  if (hour < 12) {
    return {
      snapshotType: 'auto-07-kst',
      note: 'Automated exhibition snapshot at 07:00 KST.'
    };
  }

  return {
    snapshotType: 'auto-19-kst',
    note: 'Automated exhibition snapshot at 19:00 KST.'
  };
}

async function purgeExpiredExhibitionSnapshots() {
  await ensureExhibitionSnapshotTable();

  const result = await query(
    `
      DELETE FROM exhibition_state_snapshots
      WHERE created_at < NOW() - ($1::text || ' days')::interval
      RETURNING id
    `,
    [String(SNAPSHOT_RETENTION_DAYS)]
  );

  return result.rowCount || 0;
}

async function ensureExhibitionSnapshotTable() {
  if (initialized) return;
  try {
    await query(TABLE_SQL);
  } catch (error) {
    if (!isConcurrentCreateRace(error)) {
      throw error;
    }
    // Ignore cross-instance first-run CREATE TABLE races in serverless environments.
  }

  await query('ALTER TABLE exhibition_state_snapshots ADD COLUMN IF NOT EXISTS archive_url TEXT');
  await query('ALTER TABLE exhibition_state_snapshots ADD COLUMN IF NOT EXISTS archive_path TEXT');
  await query('ALTER TABLE exhibition_state_snapshots ADD COLUMN IF NOT EXISTS archive_stored_at TIMESTAMPTZ');

  // Keep daily slot dedupe for automatic snapshots, but allow multiple manual snapshots per day.
  await query(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'exhibition_state_snapshots'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%(exhibition_id, snapshot_date_kst, snapshot_type)%'
      LOOP
        EXECUTE format('ALTER TABLE exhibition_state_snapshots DROP CONSTRAINT IF EXISTS %I', constraint_name);
      END LOOP;
    END $$;
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS exhibition_state_snapshots_auto_slot_unique_idx
      ON exhibition_state_snapshots (exhibition_id, snapshot_date_kst, snapshot_type)
      WHERE snapshot_type IN ('auto-07-kst', 'auto-19-kst', 'daily-19-kst');
  `);

  await query('SELECT 1 FROM exhibition_state_snapshots LIMIT 1');
  initialized = true;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getWorksCount(exhibition) {
  const artWorks = Array.isArray(exhibition?.artWorks)
    ? exhibition.artWorks.length
    : (Array.isArray(exhibition?.works) ? exhibition.works.length : 0);
  const goods = Array.isArray(exhibition?.goods) ? exhibition.goods.length : 0;
  return artWorks + goods;
}

function getSoldItemsCount(exhibition) {
  const soldArt = Array.isArray(exhibition?.artSoldWorks)
    ? exhibition.artSoldWorks
    : (Array.isArray(exhibition?.soldWorks) ? exhibition.soldWorks : []);
  const soldGoods = Array.isArray(exhibition?.soldGoods) ? exhibition.soldGoods : [];

  const quantitySum = [...soldArt, ...soldGoods].reduce((sum, item) => {
    const quantity = Number(item?.soldQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum + 1;
    return sum + Math.floor(quantity);
  }, 0);

  return quantitySum;
}

function buildSnapshotPayload(exhibition) {
  return {
    exhibition,
    capturedAt: new Date().toISOString()
  };
}

function getSafeArchiveToken(value, fallback) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.replace(/[^a-z0-9_-]/g, '-');
}

function buildArchivePath({ exhibitionId, snapshotType }) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const ms = String(now.getUTCMilliseconds()).padStart(3, '0');
  const random = Math.random().toString(36).slice(2, 8);
  const safeType = getSafeArchiveToken(snapshotType, 'snapshot');

  return `snapshot-archive/exhibitions/${exhibitionId}/${yyyy}${mm}${dd}-${hh}${mi}${ss}${ms}-${safeType}-${random}.json`;
}

async function archiveSnapshotPayloadOrThrow({ exhibitionId, snapshotType, payload }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN: independent snapshot archive storage is unavailable.');
  }

  const path = buildArchivePath({ exhibitionId, snapshotType });
  const payloadText = JSON.stringify(payload);

  let uploaded;
  try {
    uploaded = await put(path, payloadText, {
      access: 'public',
      contentType: 'application/json; charset=utf-8'
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('cannot use public access on a private store')) {
      throw error;
    }

    uploaded = await put(path, payloadText, {
      contentType: 'application/json; charset=utf-8'
    });
  }

  return {
    archiveUrl: uploaded.url,
    archivePath: uploaded.pathname || path,
    archiveStoredAt: new Date().toISOString()
  };
}

async function archiveSnapshotPayload({ exhibitionId, snapshotType, payload }) {
  try {
    const archive = await archiveSnapshotPayloadOrThrow({ exhibitionId, snapshotType, payload });
    return {
      ok: true,
      archive,
      error: null
    };
  } catch (error) {
    if (SNAPSHOT_ARCHIVE_STRICT) {
      throw error;
    }

    return {
      ok: false,
      archive: {
        archiveUrl: null,
        archivePath: null,
        archiveStoredAt: null
      },
      error: String(error?.message || 'archive write failed')
    };
  }
}

async function insertSnapshotRow({ exhibition, snapshotType, source, note, dedupeByDate }) {
  await ensureExhibitionSnapshotTable();

  const exhibitionId = Number(exhibition?.id);
  if (!Number.isFinite(exhibitionId) || exhibitionId <= 0) return null;

  const snapshotDateKst = getKstDateString();
  const payload = buildSnapshotPayload(exhibition);
  const worksGoodsCount = getWorksCount(exhibition);
  const soldItemsCount = getSoldItemsCount(exhibition);
  const archiveResult = await archiveSnapshotPayload({ exhibitionId, snapshotType, payload });
  const archive = archiveResult.archive;
  const noteWithArchive = archiveResult.ok
    ? note
    : `${note ? `${note} | ` : ''}archive-fallback:${archiveResult.error}`;

  if (dedupeByDate) {
    const result = await query(
      `
        INSERT INTO exhibition_state_snapshots (
          exhibition_id,
          snapshot_date_kst,
          snapshot_type,
          snapshot_payload,
          works_goods_count,
          sold_items_count,
          source,
          note,
          archive_url,
          archive_path,
          archive_stored_at
        )
        VALUES ($1, $2::date, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11::timestamptz)
        ON CONFLICT (exhibition_id, snapshot_date_kst, snapshot_type)
          WHERE snapshot_type IN ('auto-07-kst', 'auto-19-kst', 'daily-19-kst')
        DO NOTHING
        RETURNING id, exhibition_id, snapshot_date_kst, snapshot_type,
                  works_goods_count, sold_items_count, source, note,
                  archive_url, archive_path, archive_stored_at,
                  created_at, restored_at, restored_by
      `,
      [
        exhibitionId,
        snapshotDateKst,
        snapshotType,
        JSON.stringify(payload),
        worksGoodsCount,
        soldItemsCount,
        source,
        noteWithArchive,
        archive.archiveUrl,
        archive.archivePath,
        archive.archiveStoredAt
      ]
    );

    if (result.rows[0]) {
      return {
        created: true,
        snapshot: result.rows[0]
      };
    }

    const existing = await query(
      `
        SELECT id, exhibition_id, snapshot_date_kst, snapshot_type,
           works_goods_count, sold_items_count, source, note,
           archive_url, archive_path, archive_stored_at,
               created_at, restored_at, restored_by
        FROM exhibition_state_snapshots
        WHERE exhibition_id = $1
          AND snapshot_date_kst = $2::date
          AND snapshot_type = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [exhibitionId, snapshotDateKst, snapshotType]
    );

    return {
      created: false,
      snapshot: existing.rows[0] || null
    };
  }

  const result = await query(
    `
      INSERT INTO exhibition_state_snapshots (
        exhibition_id,
        snapshot_date_kst,
        snapshot_type,
        snapshot_payload,
        works_goods_count,
        sold_items_count,
        source,
        note,
        archive_url,
        archive_path,
        archive_stored_at
      )
      VALUES ($1, $2::date, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11::timestamptz)
      RETURNING id, exhibition_id, snapshot_date_kst, snapshot_type,
                works_goods_count, sold_items_count, source, note,
                archive_url, archive_path, archive_stored_at,
                created_at, restored_at, restored_by
    `,
    [
      exhibitionId,
      snapshotDateKst,
      snapshotType,
      JSON.stringify(payload),
      worksGoodsCount,
      soldItemsCount,
      source,
      noteWithArchive,
      archive.archiveUrl,
      archive.archivePath,
      archive.archiveStoredAt
    ]
  );

  return {
    created: true,
    snapshot: result.rows[0] || null
  };
}

async function createDailyExhibitionSnapshots() {
  await purgeExpiredExhibitionSnapshots();

  const map = await getStateMap(['exhibitions']);
  const exhibitions = toArray(map.exhibitions);
  const slot = getAutoSnapshotSlot();

  let createdCount = 0;
  let existingCount = 0;
  const snapshots = [];

  for (const exhibition of exhibitions) {
    const result = await insertSnapshotRow({
      exhibition,
      snapshotType: slot.snapshotType,
      source: 'vercel-cron',
      note: slot.note,
      dedupeByDate: true
    });

    if (!result || !result.snapshot) continue;
    snapshots.push(result.snapshot);
    if (result.created) createdCount += 1;
    else existingCount += 1;
  }

  return {
    exhibitionCount: exhibitions.length,
    createdCount,
    existingCount,
    snapshots
  };
}

async function createExhibitionSnapshotNow(exhibitionId, note = null) {
  await purgeExpiredExhibitionSnapshots();

  const map = await getStateMap(['exhibitions']);
  const exhibitions = toArray(map.exhibitions);
  const targetId = Number(exhibitionId);

  const target = exhibitions.find((item) => Number(item?.id) === targetId);
  if (!target) {
    throw new Error('Exhibition not found.');
  }

  return insertSnapshotRow({
    exhibition: target,
    snapshotType: 'manual',
    source: 'manual-api',
    note,
    dedupeByDate: false
  });
}

async function listExhibitionSnapshots(exhibitionId, limit = 40) {
  await purgeExpiredExhibitionSnapshots();
  await ensureExhibitionSnapshotTable();

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 40));
  const targetId = Number(exhibitionId);

  const result = await query(
    `
      SELECT id, exhibition_id, snapshot_date_kst, snapshot_type,
             works_goods_count, sold_items_count,
              source, note, archive_url, archive_path, archive_stored_at,
              created_at, restored_at, restored_by,
             undo_consumed_at
      FROM exhibition_state_snapshots
      WHERE exhibition_id = $1
        AND snapshot_type <> 'restore-undo-point'
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [targetId, safeLimit]
  );

  return result.rows;
}

async function getExhibitionSnapshotById(snapshotId) {
  await purgeExpiredExhibitionSnapshots();
  await ensureExhibitionSnapshotTable();

  const result = await query(
    `
      SELECT id, exhibition_id, snapshot_date_kst, snapshot_type,
             snapshot_payload, works_goods_count, sold_items_count,
              source, note, archive_url, archive_path, archive_stored_at,
              created_at, restored_at, restored_by,
             undo_consumed_at
      FROM exhibition_state_snapshots
      WHERE id = $1
      LIMIT 1
    `,
    [snapshotId]
  );

  return result.rows[0] || null;
}

async function markSnapshotRestored(snapshotId, restoredBy) {
  await query(
    `
      UPDATE exhibition_state_snapshots
      SET restored_at = NOW(), restored_by = $2
      WHERE id = $1
    `,
    [snapshotId, restoredBy]
  );
}

async function getLatestUndoPoint(exhibitionId) {
  await purgeExpiredExhibitionSnapshots();
  await ensureExhibitionSnapshotTable();

  const result = await query(
    `
      SELECT id, exhibition_id, snapshot_date_kst, snapshot_type,
             snapshot_payload, works_goods_count, sold_items_count,
              source, note, archive_url, archive_path, archive_stored_at,
              created_at, restored_at, restored_by,
             undo_consumed_at
      FROM exhibition_state_snapshots
      WHERE exhibition_id = $1
        AND snapshot_type = 'restore-undo-point'
        AND undo_consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [Number(exhibitionId)]
  );

  return result.rows[0] || null;
}

async function markUndoPointConsumed(snapshotId) {
  await query(
    `
      UPDATE exhibition_state_snapshots
      SET undo_consumed_at = NOW()
      WHERE id = $1
    `,
    [snapshotId]
  );
}

function extractExhibitionFromSnapshot(row) {
  if (typeof row?.archive_url === 'string' && row.archive_url.trim()) {
    return null;
  }

  const payload = row?.snapshot_payload;
  const exhibition = payload && typeof payload === 'object' ? payload.exhibition : null;
  if (!exhibition || typeof exhibition !== 'object') {
    throw new Error('Snapshot payload is invalid.');
  }
  return exhibition;
}

async function extractExhibitionFromArchive(row) {
  const url = typeof row?.archive_url === 'string' ? row.archive_url.trim() : '';
  if (!url) return null;

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return null;
    const payload = await response.json();
    const exhibition = payload && typeof payload === 'object' ? payload.exhibition : null;
    if (!exhibition || typeof exhibition !== 'object') return null;
    return exhibition;
  } catch (error) {
    return null;
  }
}

async function applyExhibitionSnapshotRow(row, restoredBy, options = {}) {
  const { createUndoPoint = true } = options;
  const targetExhibitionId = Number(row?.exhibition_id);
  if (!Number.isFinite(targetExhibitionId) || targetExhibitionId <= 0) {
    throw new Error('Invalid snapshot exhibition id.');
  }

  const map = await getStateMap(['exhibitions']);
  const exhibitions = toArray(map.exhibitions);

  const index = exhibitions.findIndex((item) => Number(item?.id) === targetExhibitionId);
  const archiveExhibition = await extractExhibitionFromArchive(row);
  const snapshotExhibition = archiveExhibition || extractExhibitionFromSnapshot(row);

  let undoPoint = null;
  if (createUndoPoint && index !== -1) {
    undoPoint = await insertSnapshotRow({
      exhibition: exhibitions[index],
      snapshotType: 'restore-undo-point',
      source: 'auto-undo',
      note: `Undo point before restoring snapshot #${row.id}`,
      dedupeByDate: false
    });
  }

  if (index === -1) {
    exhibitions.push(snapshotExhibition);
  } else {
    exhibitions[index] = snapshotExhibition;
  }

  await setStateValue('exhibitions', exhibitions);
  await markSnapshotRestored(row.id, restoredBy);

  return {
    exhibitionId: targetExhibitionId,
    restoredSnapshotId: row.id,
    undoSnapshotId: undoPoint?.snapshot?.id || null
  };
}

async function restoreExhibitionSnapshot(snapshotId, restoredBy = 'manual-api') {
  const row = await getExhibitionSnapshotById(snapshotId);
  if (!row) throw new Error('Snapshot not found.');

  return applyExhibitionSnapshotRow(row, restoredBy, { createUndoPoint: true });
}

async function undoLastExhibitionRestore(exhibitionId, restoredBy = 'manual-api') {
  const undoRow = await getLatestUndoPoint(exhibitionId);
  if (!undoRow) {
    throw new Error('No undo point available.');
  }

  const result = await applyExhibitionSnapshotRow(undoRow, restoredBy, { createUndoPoint: false });
  await markUndoPointConsumed(undoRow.id);

  return {
    ...result,
    undoSnapshotId: undoRow.id
  };
}

module.exports = {
  ensureExhibitionSnapshotTable,
  purgeExpiredExhibitionSnapshots,
  createDailyExhibitionSnapshots,
  createExhibitionSnapshotNow,
  listExhibitionSnapshots,
  getExhibitionSnapshotById,
  restoreExhibitionSnapshot,
  undoLastExhibitionRestore,
  getLatestUndoPoint
};
