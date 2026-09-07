(function initializeArtworkWorkPickerController(root, factory) {
  'use strict';

  const api = factory();
  root.ArtworkWorkPickerController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkWorkPickerControllerModule() {
  'use strict';

  function normalize(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  function filterCandidates(candidates, query) {
    const needle = normalize(query);
    if (!needle) return candidates;
    return candidates.filter((candidate) => [candidate.title, candidate.artistName, candidate.year, candidate.medium]
      .some((value) => normalize(value).includes(needle)));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function create(options = {}) {
    const document = options.document;
    const dialog = document.createElement('dialog');
    dialog.className = 'work-picker-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="work-picker-form">
        <div class="work-picker-header">
          <h2></h2>
          <button type="button" class="work-picker-close" aria-label="닫기">×</button>
        </div>
        <div class="work-picker-tools">
          <input class="work-picker-search" type="search" placeholder="작품명, 작가, 연도, 재료 검색" aria-label="작품 검색">
          <label class="work-picker-select-all"><input type="checkbox"> 현재 목록 전체 선택</label>
        </div>
        <div class="work-picker-list"></div>
        <div class="work-picker-footer">
          <span class="work-picker-count" aria-live="polite">0개 선택</span>
          <div>
            <button type="button" class="work-picker-cancel">취소</button>
            <button type="submit" class="work-picker-confirm" disabled>선택 추가</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    const title = dialog.querySelector('h2');
    const search = dialog.querySelector('.work-picker-search');
    const selectAll = dialog.querySelector('.work-picker-select-all input');
    const list = dialog.querySelector('.work-picker-list');
    const count = dialog.querySelector('.work-picker-count');
    const confirm = dialog.querySelector('.work-picker-confirm');
    let candidates = [];
    let visible = [];
    let selected = new Set();
    let onConfirm = () => {};

    function imageRef(candidate) {
      return candidate.imageRef?.photoPreviewUrl || candidate.imageRef?.photoUrl || candidate.photoPreviewUrl || candidate.photoUrl || '';
    }

    function updateSelectionState() {
      const visibleIds = visible.map((candidate) => candidate.workId);
      const selectedVisible = visibleIds.filter((workId) => selected.has(workId)).length;
      selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
      count.textContent = `${selected.size}개 선택`;
      confirm.disabled = selected.size === 0;
    }

    function render() {
      visible = filterCandidates(candidates, search.value);
      if (!visible.length) {
        list.innerHTML = '<p class="work-picker-empty">선택할 수 있는 작품이 없습니다.</p>';
        updateSelectionState();
        return;
      }
      list.innerHTML = visible.map((candidate) => {
        const image = imageRef(candidate);
        const history = candidate.exhibitionHistorySummary || candidate.exhibitionHistory?.map((item) => item.name).filter(Boolean).join(' · ') || '';
        const detail = [candidate.artistName, candidate.year, candidate.medium, candidate.size].filter(Boolean).join(' · ');
        const price = candidate.currentPrice ?? candidate.latestPrice ?? '';
        return `<label class="work-picker-item">
          <input type="checkbox" value="${escapeHtml(candidate.workId)}" ${selected.has(candidate.workId) ? 'checked' : ''}>
          ${image ? `<img src="${escapeHtml(image)}" alt="">` : '<span class="work-picker-image-empty">사진 없음</span>'}
          <span class="work-picker-identity"><strong>${escapeHtml(candidate.title || '제목 없음')}</strong><span>${escapeHtml(detail)}</span>${history ? `<small>${escapeHtml(history)}</small>` : ''}</span>
          <span class="work-picker-price">${escapeHtml(price)}</span>
        </label>`;
      }).join('');
      updateSelectionState();
    }

    search.addEventListener('input', render);
    list.addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      if (checkbox.checked) selected.add(checkbox.value);
      else selected.delete(checkbox.value);
      updateSelectionState();
    });
    selectAll.addEventListener('change', () => {
      visible.forEach((candidate) => selectAll.checked ? selected.add(candidate.workId) : selected.delete(candidate.workId));
      render();
    });
    dialog.querySelector('.work-picker-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.work-picker-cancel').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const workIds = [...selected];
      if (!workIds.length) return;
      onConfirm(workIds);
    });

    return Object.freeze({
      open(config = {}) {
        candidates = Array.isArray(config.candidates) ? config.candidates : [];
        selected = new Set();
        onConfirm = typeof config.onConfirm === 'function' ? config.onConfirm : () => {};
        title.textContent = config.title || '기존 작품 선택';
        confirm.textContent = config.confirmLabel || '선택 추가';
        search.value = '';
        render();
        dialog.showModal();
        search.focus();
      },
      close() {
        dialog.close();
      }
    });
  }

  return Object.freeze({ create, filterCandidates, normalize });
  return Object.freeze({ create, filterCandidates, normalize });
});