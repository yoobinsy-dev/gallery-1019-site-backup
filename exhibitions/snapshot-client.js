(function initializeExhibitionSnapshotClient(root) {
  'use strict';

  async function requestJson(fetchImpl, url, options) {
    const response = await fetchImpl(url, options);
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  async function listSnapshots(options) {
    const exhibitionId = options.exhibitionId;
    const limit = options.limit || 100;
    const result = await requestJson(
      options.fetchImpl,
      `/api/exhibition-snapshots?exhibitionId=${encodeURIComponent(exhibitionId)}&limit=${encodeURIComponent(limit)}`
    );
    if (!result.response.ok || !result.payload?.ok) {
      return {
        ok: false,
        error: result.payload?.error || '스냅샷 목록을 불러오지 못했습니다.',
        snapshots: [],
        canUndo: false
      };
    }
    return {
      ok: true,
      error: '',
      snapshots: Array.isArray(result.payload.snapshots) ? result.payload.snapshots : [],
      canUndo: Boolean(result.payload.canUndo)
    };
  }

  async function postSnapshotAction(options) {
    const body = {
      action: options.action,
      exhibitionId: options.exhibitionId
    };
    if (options.snapshotId !== undefined) body.snapshotId = options.snapshotId;
    if (options.note !== undefined) body.note = options.note;
    const result = await requestJson(options.fetchImpl, '/api/exhibition-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return {
      ok: Boolean(result.response.ok && result.payload?.ok),
      error: result.payload?.error || options.defaultError
    };
  }

  function captureSnapshot(options) {
    return postSnapshotAction({
      ...options,
      action: 'capture-now',
      defaultError: '스냅샷 생성에 실패했습니다.'
    });
  }

  function restoreSnapshot(options) {
    return postSnapshotAction({
      ...options,
      action: 'restore',
      defaultError: '복원에 실패했습니다.'
    });
  }

  function undoRestore(options) {
    return postSnapshotAction({
      ...options,
      action: 'undo-restore',
      defaultError: '되돌리기에 실패했습니다.'
    });
  }

  async function fetchExhibitions(options) {
    const result = await requestJson(options.fetchImpl, '/api/state?keys=exhibitions');
    if (!result.response.ok || !result.payload?.ok || !result.payload?.data) {
      return { ok: false, exhibitions: [] };
    }
    return {
      ok: true,
      exhibitions: Array.isArray(result.payload.data.exhibitions)
        ? result.payload.data.exhibitions
        : []
    };
  }

  const api = Object.freeze({
    captureSnapshot,
    fetchExhibitions,
    listSnapshots,
    restoreSnapshot,
    undoRestore
  });
  root.ExhibitionSnapshotClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
