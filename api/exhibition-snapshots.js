const { createWeakEtag, sendCachedJson, sendJson, methodNotAllowed, readJsonBody, writeCacheHeaders } = require('./_lib/http');
const {
  createExhibitionSnapshotNow,
  listExhibitionSnapshots,
  restoreExhibitionSnapshot,
  undoLastExhibitionRestore,
  getLatestUndoPoint
} = require('./_lib/exhibition-snapshot-store');

const PRIVATE_REVALIDATE_CACHE_CONTROL = 'private, max-age=0, must-revalidate';

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const exhibitionId = Number(req.query?.exhibitionId);
      const limit = Number(req.query?.limit || 40);

      if (!Number.isFinite(exhibitionId) || exhibitionId <= 0) {
        sendJson(res, 400, { ok: false, error: 'exhibitionId is required and must be a positive number.' });
        return;
      }

      const [snapshots, latestUndoPoint] = await Promise.all([
        listExhibitionSnapshots(exhibitionId, limit),
        getLatestUndoPoint(exhibitionId)
      ]);

      const payload = {
        ok: true,
        snapshots,
        canUndo: Boolean(latestUndoPoint),
        latestUndoPoint: latestUndoPoint
          ? {
            id: latestUndoPoint.id,
            createdAt: latestUndoPoint.created_at,
            note: latestUndoPoint.note
          }
          : null
      };

      const etag = createWeakEtag(payload, `exhibition-snapshots-${exhibitionId}-${limit}`);
      sendCachedJson(req, res, 200, payload, {
        cacheControl: PRIVATE_REVALIDATE_CACHE_CONTROL,
        etag
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = typeof body.action === 'string' ? body.action.trim() : '';
      const exhibitionId = Number(body.exhibitionId);

      if (!Number.isFinite(exhibitionId) || exhibitionId <= 0) {
        sendJson(res, 400, { ok: false, error: 'exhibitionId is required and must be a positive number.' });
        return;
      }

      if (action === 'capture-now') {
        const note = typeof body.note === 'string' ? body.note.trim() : null;
        const result = await createExhibitionSnapshotNow(exhibitionId, note);
        sendJson(res, 200, {
          ok: true,
          created: result?.created || false,
          snapshot: result?.snapshot || null
        });
        return;
      }

      if (action === 'restore') {
        const snapshotId = Number(body.snapshotId);
        if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
          sendJson(res, 400, { ok: false, error: 'snapshotId is required and must be a positive number.' });
          return;
        }

        const restored = await restoreExhibitionSnapshot(snapshotId, 'manual-admin');
        sendJson(res, 200, {
          ok: true,
          restored
        });
        return;
      }

      if (action === 'undo-restore') {
        const restored = await undoLastExhibitionRestore(exhibitionId, 'manual-admin-undo');
        sendJson(res, 200, {
          ok: true,
          restored
        });
        return;
      }

      sendJson(res, 400, {
        ok: false,
        error: 'Invalid action. Supported actions: capture-now, restore, undo-restore.'
      });
      return;
    }

    methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    writeCacheHeaders(res, 'no-store');
    sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
  }
};
