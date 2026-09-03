(function initializeExhibitionDetailFilesController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailFilesController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFilesControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const URL = options.URL;
    const Date = options.Date;
    const Math = options.Math;

    function ensureExhibitionFilesData() {
      const exhibition = options.getCurrentExhibition();
      if (!Array.isArray(exhibition.filesDocs)) exhibition.filesDocs = [];
      if (!Array.isArray(exhibition.filesPromo)) exhibition.filesPromo = [];
      return exhibition;
    }

    function getFilesForView(view) {
      const exhibition = ensureExhibitionFilesData();
      return view === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
    }

    function getFilesViewLabel(view) {
      return view === 'promo' ? '홍보물' : '서류';
    }

    function switchFilesView(view) {
      state.filesView = view === 'promo' ? 'promo' : 'docs';
      options.switchTab('exhibition-files');
    }

    function renderExhibitionFiles(container) {
      const view = state.filesView === 'promo' ? 'promo' : 'docs';
      const activeFiles = getFilesForView(view);

      const cardsHtml = activeFiles.map((fileItem) => {
        const isPdf = isPdfLikeFile(fileItem.mimeType || '', fileItem.fileName || '', fileItem.fileDataUrl || fileItem.previewDataUrl || '') || fileItem.previewKind === 'pdf';
        const pdfSource = fileItem.fileDataUrl || fileItem.previewDataUrl || '';
        const canDeleteFile = options.canCurrentUserModifyOwnedRow(fileItem);
        const previewHtml = isPdf && pdfSource
          ? `<embed src="${pdfSource}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="exhibition-file-preview-pdf" />`
          : `<img src="${fileItem.previewDataUrl}" alt="${options.escapeAccountingHtml(fileItem.title || fileItem.fileName || '파일 미리보기')}" class="exhibition-file-preview-image">`;

        return `
    <article class="exhibition-file-card" title="${options.escapeAccountingHtml(fileItem.fileName || '')}">
      <div class="exhibition-file-preview-wrap">
        ${previewHtml}
      </div>
      <p class="exhibition-file-name">${options.escapeAccountingHtml(fileItem.title || fileItem.fileName || '제목 없음')}</p>
      <div class="exhibition-file-actions">
        <button type="button" class="action-btn edit-btn" onclick="downloadExhibitionFile('${view}', '${String(fileItem.id).replace(/'/g, "\\'")}')">다운로드</button>
        ${canDeleteFile ? `<button type="button" class="action-btn delete-btn" onclick="deleteExhibitionFile('${view}', '${String(fileItem.id).replace(/'/g, "\\'")}')">삭제</button>` : ''}
      </div>
    </article>
  `;
      }).join('');

      container.innerHTML = `
    <div class="works-sales-wrapper exhibition-files-wrapper">
      <div class="works-sales-title">전시 파일</div>
      <div class="works-sales-toggle-bar">
        <button type="button" class="works-sales-toggle-btn${view === 'docs' ? ' active' : ''}" onclick="switchFilesView('docs')">서류</button>
        <button type="button" class="works-sales-toggle-btn${view === 'promo' ? ' active' : ''}" onclick="switchFilesView('promo')">홍보물</button>
      </div>
      <p class="accounting-description">카드를 클릭하거나 파일을 드래그 앤 드롭해 업로드하세요.</p>
      <div class="exhibition-files-dropzone" ondragover="handleFilesDragOver(event)" ondragleave="handleFilesDragLeave(event)" ondrop="handleFilesDrop(event)">
        <div class="exhibition-files-grid" id="exhibition-files-grid">
          ${cardsHtml}
          <button type="button" class="exhibition-file-card exhibition-file-upload-card" onclick="openFileUploadModal('${view}')">
            <span class="exhibition-file-upload-plus">+</span>
            <span class="exhibition-file-upload-text">클릭하여 파일 업로드</span>
          </button>
        </div>
      </div>
    </div>
  `;
    }

    function isPdfLikeFile(mimeType, fileName, dataUrl) {
      const mime = String(mimeType || '').toLowerCase();
      const name = String(fileName || '').toLowerCase();
      const data = String(dataUrl || '').toLowerCase();
      return mime.includes('pdf') || name.endsWith('.pdf') || data.startsWith('data:application/pdf');
    }

    function triggerFileDownload(dataUrl, fileName) {
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function getFileDownloadName(fileItem, fallbackIndex) {
      const sourceName = (fileItem.fileName || '').trim();
      const title = (fileItem.title || '').trim();
      const extMatch = sourceName.match(/\.([a-zA-Z0-9]{1,8})$/);
      const ext = extMatch ? `.${extMatch[1]}` : '';
      const base = title || sourceName || `file-${fallbackIndex + 1}`;
      return ext && !base.toLowerCase().endsWith(ext.toLowerCase()) ? `${base}${ext}` : base;
    }

    function deleteExhibitionFile(view, fileId) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const targetList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      const target = targetList.find((item) => item.id === fileId);
      if (!target) return;
      if (!options.canCurrentUserModifyOwnedRow(target)) {
        options.alert('다른 사용자가 추가한 파일은 삭제할 수 없습니다.');
        return;
      }
      const next = targetList.filter((item) => item.id !== fileId);
      if (targetView === 'promo') exhibition.filesPromo = next;
      else exhibition.filesDocs = next;

      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }

      options.saveExhibition();
      options.switchTab('exhibition-files');
    }

    function deleteAllExhibitionFiles(view) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const currentList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      if (currentList.length === 0) return;

      let nextList = [];
      if (options.isArtistScopedUser()) {
        nextList = currentList.filter((item) => !options.canCurrentUserModifyOwnedRow(item));
        if (nextList.length === currentList.length) {
          options.alert('삭제할 수 있는 파일이 없습니다.');
          return;
        }
      }

      if (targetView === 'promo') exhibition.filesPromo = options.isArtistScopedUser() ? nextList : [];
      else exhibition.filesDocs = options.isArtistScopedUser() ? nextList : [];

      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }

      options.saveExhibition();
      options.switchTab('exhibition-files');
    }

    function downloadExhibitionFile(view, fileId) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const targetList = getFilesForView(targetView);
      const target = targetList.find((item) => item.id === fileId);
      if (!target) return;
      const dataUrl = target.fileDataUrl || target.previewDataUrl;
      triggerFileDownload(dataUrl, getFileDownloadName(target, 0));
    }

    function downloadAllExhibitionFiles(view) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const targetList = getFilesForView(targetView);
      if (!targetList.length) return;
      targetList.forEach((item, index) => {
        const dataUrl = item.fileDataUrl || item.previewDataUrl;
        triggerFileDownload(dataUrl, getFileDownloadName(item, index));
      });
    }

    function openFileUploadModal(targetView, droppedFiles) {
      state.fileUploadTarget = targetView === 'promo' ? 'promo' : 'docs';
      setPendingUploadEntries(Array.isArray(droppedFiles) ? droppedFiles : []);
      const modal = document.getElementById('file-upload-modal');
      const modalTitle = document.getElementById('file-upload-modal-title');
      const modalDesc = document.getElementById('file-upload-modal-description');
      const input = document.getElementById('file-upload-input');
      if (modalTitle) modalTitle.textContent = `${getFilesViewLabel(state.fileUploadTarget)} 업로드`;
      if (modalDesc) modalDesc.textContent = `${getFilesViewLabel(state.fileUploadTarget)} 탭에 저장됩니다.`;
      if (input) input.value = '';
      updateFileUploadSelectedInfo();
      if (modal) modal.style.display = 'flex';
    }

    function closeFileUploadModal() {
      const modal = document.getElementById('file-upload-modal');
      const input = document.getElementById('file-upload-input');
      if (input) input.value = '';
      clearPendingUploadEntries();
      if (modal) modal.style.display = 'none';
    }

    function handleFileUploadInputChange(event) {
      const files = Array.from(event?.target?.files || []);
      setPendingUploadEntries(files);
      updateFileUploadSelectedInfo();
    }

    function updateFileUploadSelectedInfo() {
      const info = document.getElementById('file-upload-selected-info');
      if (!info) return;
      const count = state.pendingUploadEntries.length;
      if (count === 0) {
        info.textContent = '선택된 파일이 없습니다.';
        renderFileUploadPreviewList();
        return;
      }
      info.textContent = `${count}개 파일 선택됨`;
      renderFileUploadPreviewList();
    }

    function clearPendingUploadEntries() {
      (state.pendingUploadEntries || []).forEach((entry) => {
        if (entry && entry.objectUrl) {
          try {
            URL.revokeObjectURL(entry.objectUrl);
          } catch (error) {
            // Ignore revoke errors for stale object URLs.
          }
        }
      });
      state.pendingUploadEntries = [];
      state.pendingUploadFiles = [];
    }

    function getFileNameWithoutExtension(fileName) {
      const name = String(fileName || '').trim();
      if (!name) return '';
      const idx = name.lastIndexOf('.');
      return idx > 0 ? name.slice(0, idx) : name;
    }

    function createPendingUploadEntry(file, index) {
      const mime = (file.type || '').toLowerCase();
      const isImage = mime.startsWith('image/');
      const isPdf = isPdfLikeFile(mime, file.name || '', '');
      const needsObjectUrl = isImage || isPdf;
      const objectUrl = needsObjectUrl ? URL.createObjectURL(file) : '';
      return {
        id: `${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}`,
        file,
        title: '',
        previewKind: isPdf ? 'pdf' : (isImage ? 'image' : 'generic'),
        previewDataUrl: isPdf || isImage ? objectUrl : buildGenericFilePreviewDataUrl(file.name || ''),
        objectUrl
      };
    }

    function setPendingUploadEntries(files) {
      clearPendingUploadEntries();
      state.pendingUploadFiles = files;
      state.pendingUploadEntries = files.map((file, index) => createPendingUploadEntry(file, index));
    }

    function updatePendingUploadTitle(index, value) {
      const entry = state.pendingUploadEntries[index];
      if (!entry) return;
      entry.title = value;
    }

    function renderFileUploadPreviewList() {
      const list = document.getElementById('file-upload-preview-list');
      if (!list) return;
      const entries = state.pendingUploadEntries || [];
      if (entries.length === 0) {
        list.innerHTML = '';
        return;
      }
      list.innerHTML = entries.map((entry, index) => {
        const previewHtml = entry.previewKind === 'pdf'
          ? `<embed src="${entry.previewDataUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="file-upload-preview-thumb-pdf" />`
          : entry.previewKind === 'image'
            ? `<img src="${entry.previewDataUrl}" alt="파일 미리보기" class="file-upload-preview-thumb-image">`
            : `<img src="${entry.previewDataUrl}" alt="문서 미리보기" class="file-upload-preview-thumb-image">`;
        return `
      <div class="file-upload-preview-item">
        <div class="file-upload-preview-thumb-wrap">${previewHtml}</div>
        <div class="file-upload-preview-meta">
          <p class="file-upload-field-label">파일 제목 입력</p>
          <input type="text" class="auth-input file-upload-title-input" value="${options.escapeAccountingHtml(entry.title || '')}" placeholder="제목 입력" oninput="updatePendingUploadTitle(${index}, this.value)">
          <p class="file-upload-preview-filename">원본 파일명: ${options.escapeAccountingHtml(entry.file.name || '파일')}</p>
        </div>
      </div>
    `;
      }).join('');
    }

    function handleFilesDragOver(event) {
      event.preventDefault();
      const zone = event.currentTarget;
      if (zone) zone.classList.add('drag-over');
    }

    function handleFilesDragLeave(event) {
      const zone = event.currentTarget;
      if (zone) zone.classList.remove('drag-over');
    }

    function handleFilesDrop(event) {
      event.preventDefault();
      const zone = event.currentTarget;
      if (zone) zone.classList.remove('drag-over');
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length === 0) return;
      openFileUploadModal(state.filesView, files);
    }

    function buildGenericFilePreviewDataUrl(fileName) {
      const extension = (fileName.split('.').pop() || 'FILE').toUpperCase().slice(0, 5);
      const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="#f8fafc"/>
      <rect x="56" y="56" width="688" height="888" rx="34" fill="#ffffff" stroke="#d1d5db" stroke-width="8"/>
      <rect x="112" y="142" width="576" height="210" rx="26" fill="#e0e7ff"/>
      <text x="400" y="274" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="88" font-weight="700" fill="#3730a3">${extension}</text>
      <rect x="112" y="410" width="488" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="464" width="560" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="518" width="452" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="572" width="536" height="28" rx="14" fill="#e5e7eb"/>
    </svg>
  `;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    async function buildFileCardPreview(file) {
      const mimeType = (file.type || '').toLowerCase();
      const isPdf = isPdfLikeFile(mimeType, file.name || '', '');
      if (mimeType.startsWith('image/')) {
        const compact = await options.buildCompactPhotoPreview(file);
        return { previewDataUrl: compact.dataUrl, fileDataUrl: compact.dataUrl, previewKind: 'image', mimeType: compact.mimeType || file.type || '', byteSize: compact.byteSize || file.size || 0 };
      }
      if (isPdf) {
        const fileDataUrl = await options.readFileAsDataUrl(file);
        return { previewDataUrl: fileDataUrl, fileDataUrl, previewKind: 'pdf', mimeType: file.type || '', byteSize: Number.isFinite(file.size) ? file.size : 0 };
      }
      const fileDataUrl = await options.readFileAsDataUrl(file);
      return { previewDataUrl: buildGenericFilePreviewDataUrl(file.name || ''), fileDataUrl, previewKind: 'generic', mimeType: file.type || '', byteSize: Number.isFinite(file.size) ? file.size : 0 };
    }

    async function confirmFileUploadModal() {
      const entries = state.pendingUploadEntries || [];
      if (entries.length === 0) {
        options.alert('업로드할 파일을 먼저 선택해주세요.');
        return;
      }
      const targetView = state.fileUploadTarget === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const targetList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const file = entry.file;
        const preview = await buildFileCardPreview(file);
        const generatedTitle = (entry.title || '').trim() || file.name || '제목 없음';
        targetList.push({
          id: `${Date.now()}-${Math.floor(Math.random() * 100000)}-${i}`,
          title: generatedTitle,
          fileName: file.name || '',
          previewDataUrl: preview.previewDataUrl,
          fileDataUrl: preview.fileDataUrl,
          previewKind: preview.previewKind,
          mimeType: preview.mimeType,
          byteSize: preview.byteSize,
          createdByUserId: options.getCurrentUserId(),
          createdAt: new Date().toISOString()
        });
      }
      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }
      options.saveExhibition();
      clearPendingUploadEntries();
      closeFileUploadModal();
      options.switchTab('exhibition-files');
    }

    return Object.freeze({
      ensureExhibitionFilesData, getFilesForView, getFilesViewLabel, switchFilesView,
      renderExhibitionFiles, isPdfLikeFile, triggerFileDownload, getFileDownloadName,
      deleteExhibitionFile, deleteAllExhibitionFiles, downloadExhibitionFile,
      downloadAllExhibitionFiles, openFileUploadModal, closeFileUploadModal,
      handleFileUploadInputChange, updateFileUploadSelectedInfo, clearPendingUploadEntries,
      getFileNameWithoutExtension, createPendingUploadEntry, setPendingUploadEntries,
      updatePendingUploadTitle, renderFileUploadPreviewList, handleFilesDragOver,
      handleFilesDragLeave, handleFilesDrop, buildGenericFilePreviewDataUrl,
      buildFileCardPreview, confirmFileUploadModal
    });
  }

  return Object.freeze({ create });
});