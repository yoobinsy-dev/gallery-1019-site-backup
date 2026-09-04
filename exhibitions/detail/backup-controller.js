(function initializeExhibitionDetailBackupController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailBackupController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBackupControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const fetchImpl = options.fetchImpl;
    const snapshotClient = options.snapshotClient;
    const exhibitionsRepository = options.exhibitionsRepository;

    function getBackupExhibitionId() {
      const id = Number(state.exhibitionId || options.getCurrentExhibition()?.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      return id;
    }

    function formatBackupDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('ko-KR', { hour12: false });
    }

    async function fetchExhibitionBackupSnapshots() {
      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        state.backupError = '전시 ID를 찾을 수 없습니다.';
        return;
      }

      state.backupLoading = true;
      state.backupError = '';
      options.switchTab('exhibition-backup');

      try {
        const result = await snapshotClient.listSnapshots({
          fetchImpl,
          exhibitionId
        });
        state.backupError = result.error;
        state.backupSnapshots = result.snapshots;
        state.backupCanUndo = result.canUndo;
      } catch (error) {
        state.backupError = '네트워크 오류로 스냅샷 목록을 불러오지 못했습니다.';
        state.backupSnapshots = [];
        state.backupCanUndo = false;
      } finally {
        state.backupLoading = false;
        options.switchTab('exhibition-backup');
      }
    }

    function getBackupSnapshotRowsHtml() {
      const rows = state.backupSnapshots || [];
      if (rows.length === 0) {
        return '<tr><td colspan="6" class="no-users">저장된 전시 스냅샷이 없습니다.</td></tr>';
      }

      return rows.map((snapshot) => {
        const snapshotId = Number(snapshot.id);
        const restoredTag = snapshot.restored_at
          ? `<div style="font-size:12px;color:#2f6f3e;margin-top:4px;">복원됨: ${options.escapeHtml(formatBackupDate(snapshot.restored_at))}</div>`
          : '';

        return `
      <tr>
        <td>
          <strong>#${snapshotId}</strong>
          <div style="font-size:12px;color:#666;">${options.escapeHtml(snapshot.snapshot_type || '')}</div>
        </td>
        <td>${options.escapeHtml(String(snapshot.works_goods_count ?? 0))}</td>
        <td>${options.escapeHtml(String(snapshot.sold_items_count ?? 0))}</td>
        <td>${options.escapeHtml(formatBackupDate(snapshot.created_at))}${restoredTag}</td>
        <td>${options.escapeHtml(snapshot.note || '-')}</td>
        <td>
          <button type="button" class="action-btn approve-btn" onclick="restoreExhibitionSnapshot(${snapshotId})">restore</button>
        </td>
      </tr>
    `;
      }).join('');
    }

    function renderExhibitionBackup(container) {
      if (options.getExhibitionAccessRole() !== 'admin') {
        const fallbackTab = options.getFirstAllowedTab() || 'exhibition-info';
        options.switchTab(fallbackTab);
        return;
      }

      const loadingNotice = state.backupLoading
        ? '<p class="accounting-description">스냅샷 목록을 불러오는 중입니다...</p>'
        : '';
      const errorNotice = state.backupError
        ? `<p class="accounting-description" style="color:#b23b3b;">${options.escapeHtml(state.backupError)}</p>`
        : '';

      container.innerHTML = `
    <div class="works-sales-wrapper">
      <div class="works-sales-title">전시 백업</div>
      <p class="accounting-description">이 전시만 분리 저장된 스냅샷입니다. 잘못 복원했을 경우 되돌리기를 눌러 직전 상태로 복귀할 수 있습니다.</p>
      ${loadingNotice}
      ${errorNotice}
      <div class="works-actions" style="margin-bottom:12px;">
        <button type="button" class="works-action-btn" onclick="createManualExhibitionSnapshot()">스냅샷 생성</button>
        <button type="button" class="works-action-btn works-action-btn-secondary" onclick="fetchExhibitionBackupSnapshots()">새로고침</button>
        <button type="button" class="works-action-btn works-action-btn-secondary" onclick="undoExhibitionSnapshotRestore()" ${state.backupCanUndo ? '' : 'disabled'}>되돌리기</button>
      </div>
      <div class="works-table-wrapper expanded">
        <table class="works-table">
          <thead>
            <tr>
              <th>스냅샷</th>
              <th>목록 수 (작품+굿즈)</th>
              <th>판매 수량</th>
              <th>생성 시각</th>
              <th>메모</th>
              <th>복원</th>
            </tr>
          </thead>
          <tbody>
            ${getBackupSnapshotRowsHtml()}
          </tbody>
        </table>
      </div>
    </div>
  `;

      if (!state.backupLoading && state.backupSnapshots.length === 0 && !state.backupError) {
        fetchExhibitionBackupSnapshots();
      }
    }

    async function createManualExhibitionSnapshot() {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 스냅샷을 생성할 수 있습니다.');
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      const currentUser = options.getCurrentUser();
      const actorName = (currentUser?.name || '').toString().trim() || 'admin';
      const note = `manual backup by ${actorName}`;

      try {
        const result = await snapshotClient.captureSnapshot({
          fetchImpl,
          exhibitionId,
          note
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        options.alertImpl('스냅샷이 생성되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('스냅샷 생성 요청 중 오류가 발생했습니다.');
      }
    }

    async function refreshExhibitionStateFromServer(exhibitionId) {
      const targetId = Number(exhibitionId);
      if (!Number.isFinite(targetId) || targetId <= 0) return false;

      try {
        const result = await snapshotClient.fetchExhibitions({ fetchImpl });
        if (!result.ok) return false;
        const remoteExhibitions = result.exhibitions;
        exhibitionsRepository.saveExhibitionsSafely(remoteExhibitions);

        const index = remoteExhibitions.findIndex((item) => Number(item?.id) === targetId);
        if (index !== -1) {
          state.exhibition = remoteExhibitions[index];
        }

        return true;
      } catch (error) {
        return false;
      }
    }

    async function restoreExhibitionSnapshot(snapshotId) {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 복원할 수 있습니다.');
        return;
      }

      if (!options.confirmImpl('이 스냅샷으로 전시 데이터를 복원하시겠습니까?')) {
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      try {
        const result = await snapshotClient.restoreSnapshot({
          fetchImpl,
          exhibitionId,
          snapshotId
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        await refreshExhibitionStateFromServer(exhibitionId);

        options.alertImpl('복원이 완료되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('복원 요청 중 오류가 발생했습니다.');
      }
    }

    async function undoExhibitionSnapshotRestore() {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 되돌릴 수 있습니다.');
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      if (!options.confirmImpl('마지막 복원을 되돌리시겠습니까?')) {
        return;
      }

      try {
        const result = await snapshotClient.undoRestore({
          fetchImpl,
          exhibitionId
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        await refreshExhibitionStateFromServer(exhibitionId);

        options.alertImpl('되돌리기가 완료되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('되돌리기 요청 중 오류가 발생했습니다.');
      }
    }

    void document;

    return {
      getBackupExhibitionId,
      formatBackupDate,
      fetchExhibitionBackupSnapshots,
      getBackupSnapshotRowsHtml,
      renderExhibitionBackup,
      createManualExhibitionSnapshot,
      refreshExhibitionStateFromServer,
      restoreExhibitionSnapshot,
      undoExhibitionSnapshotRestore
    };
  }

  return { create };
});