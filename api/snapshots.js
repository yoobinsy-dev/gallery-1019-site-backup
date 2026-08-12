const { createWeakEtag, sendCachedJson, sendJson, methodNotAllowed, readJsonBody, writeCacheHeaders } = require('./_lib/http');
const {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  getSnapshotById
} = require('./_lib/snapshot-store');

const PRIVATE_REVALIDATE_CACHE_CONTROL = 'private, max-age=0, must-revalidate';

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const limit = req.query && req.query.limit ? Number(req.query.limit) : 30;
      const snapshots = await listSnapshots(limit);
      const payload = { ok: true, snapshots };
      const etag = createWeakEtag(payload, `snapshots-${limit}`);
      sendCachedJson(req, res, 200, payload, {
        cacheControl: PRIVATE_REVALIDATE_CACHE_CONTROL,
        etag
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = typeof body.action === 'string' ? body.action.trim() : '';

      if (action === 'capture-now') {
        const note = typeof body.note === 'string' ? body.note.trim() : null;
        const result = await createSnapshot({
          snapshotType: 'manual',
          source: 'manual-api',
          note,
          dedupeByKstDate: false
        });

        sendJson(res, 200, {
          ok: true,
          created: result.created,
          snapshot: result.snapshot
        });
        return;
      }

      if (action === 'restore') {
        const snapshotId = Number(body.snapshotId);
        if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
          sendJson(res, 400, { ok: false, error: 'snapshotId is required and must be a positive number.' });
          return;
        }

        const existing = await getSnapshotById(snapshotId);
        if (!existing) {
          sendJson(res, 404, { ok: false, error: 'Snapshot not found.' });
          return;
        }

        await restoreSnapshot(snapshotId, 'manual-api');
        sendJson(res, 200, {
          ok: true,
          restoredSnapshotId: snapshotId,
          restoredFrom: {
            snapshotDateKst: existing.snapshot_date_kst,
            snapshotType: existing.snapshot_type,
            createdAt: existing.created_at
          }
        });
        return;
      }

      sendJson(res, 400, {
        ok: false,
        error: 'Invalid action. Supported actions: capture-now, restore.'
      });
      return;
    }

    methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    writeCacheHeaders(res, 'no-store');
    sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
  }
};
