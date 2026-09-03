(function initializeExhibitionInventoryRenderer(root) {
  'use strict';

  function buildActionButtons(work, canModifyWork) {
    const actionButton = !canModifyWork
      ? ''
      : (work.saved
        ? `<button class="action-btn edit-btn" onclick="toggleWorkEdit(${work.id})">수정</button>`
        : `<button class="action-btn approve-btn" onclick="saveWork(${work.id}, this)">저장</button>`);
    const duplicateButton = canModifyWork
      ? `<button class="action-btn approve-btn" onclick="duplicateWorkRow(${work.id})">복사</button>`
      : '';
    const deleteButton = canModifyWork
      ? `<button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>`
      : '';
    return { actionButton, duplicateButton, deleteButton };
  }

  function buildPhotoCells(work, previewDataUrl) {
    const savedPhotoCell = previewDataUrl
      ? `<img src="${previewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `<span class="saved-photo">${work.photoName || '사진 없음'}</span>`;
    const editPhotoPreview = previewDataUrl
      ? `<img src="${previewDataUrl}" alt="미리보기" class="photo-preview-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `${work.photoName || '사진 없음'}`;
    return { savedPhotoCell, editPhotoPreview };
  }

  function buildWorkRow(options) {
    const {
      work,
      index,
      isGoodsMode,
      isSelected,
      canModifyWork,
      previewDataUrl,
      isUnsold,
      isSold,
      soldQuantity,
      stockQuantity,
      remainingQuantity,
      isSoloExhibition,
      sizeParts = { width: '', height: '' }
    } = options;
    const { actionButton, duplicateButton, deleteButton } = buildActionButtons(work, canModifyWork);
    const { savedPhotoCell, editPhotoPreview } = buildPhotoCells(work, previewDataUrl);
    const authorText = work.author || '';
    const authorInput = isSoloExhibition
      ? `<input type="text" data-field="author" value="${authorText}" disabled>`
      : `<input type="text" data-field="author" value="${authorText}" onchange="handleWorkChange(${work.id}, 'author', this.value)">`;
    const savedPriceCell = isUnsold
      ? `<span class="price-not-for-sale">미판매</span>`
      : `${work.price || ''}`;
    const statusCell = isSold
      ? `<button type="button" class="work-status-badge sold" onclick="jumpToSoldWork(${work.id})">SOLD</button>`
      : '';
    const checkboxCell = `<td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>`;

    if (isGoodsMode) {
      if (work.saved || !canModifyWork) {
        return {
          className: 'work-saved-row',
          html: `
          ${checkboxCell}
          <td>${work.manualNumber || ''}</td>
          <td>${savedPhotoCell}</td>
          <td>${work.title || ''}</td>
          <td>${savedPriceCell}</td>
          <td>${stockQuantity}</td>
          <td>${soldQuantity}</td>
          <td>${remainingQuantity}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            ${deleteButton}
          </td>
        `
        };
      }
      return {
        className: '',
        html: `
          ${checkboxCell}
          <td><input type="text" data-field="manualNumber" value="${work.manualNumber || ''}" onchange="handleWorkChange(${work.id}, 'manualNumber', this.value)"></td>
          <td>
            <input type="file" accept="image/*" onchange="handleWorkPhotoChange(${work.id}, event)" class="photo-input">
            <div class="photo-preview">${editPhotoPreview}</div>
          </td>
          <td><input type="text" data-field="title" value="${work.title || ''}" onchange="handleWorkChange(${work.id}, 'title', this.value)"></td>
          <td>
            <div class="price-input-group">
              <input type="text" data-field="price" value="${isUnsold ? '미판매' : (work.price || '')}" oninput="handlePriceInput(${work.id}, event)" onchange="handleWorkChange(${work.id}, 'price', this.value)">
              <button type="button" class="price-cancel-btn" data-tooltip="미판매" title="미판매" aria-label="미판매" onclick="setWorkNotForSale(${work.id}, this)">✕</button>
            </div>
          </td>
          <td><input data-field="quantity" type="number" min="0" value="${stockQuantity}" onchange="handleWorkChange(${work.id}, 'quantity', this.value)"></td>
          <td>${soldQuantity}</td>
          <td>${remainingQuantity}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
          </td>
        `
      };
    }

    if (work.saved || !canModifyWork) {
      return {
        className: 'work-saved-row',
        html: `
        ${checkboxCell}
        <td>${work.manualNumber || ''}</td>
        <td>${work.category || ''}</td>
        <td>${savedPhotoCell}</td>
        <td>${work.title || ''}</td>
        <td>${authorText || ''}</td>
        <td>${savedPriceCell}</td>
        <td>${work.materials || ''}</td>
        <td>${work.size || ''}</td>
        <td>${work.year || ''}</td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          ${duplicateButton}
          ${deleteButton}
        </td>
      `
      };
    }

    return {
      className: '',
      html: `
        ${checkboxCell}
        <td><input type="text" data-field="manualNumber" value="${work.manualNumber || ''}" onchange="handleWorkChange(${work.id}, 'manualNumber', this.value)"></td>
        <td><input type="text" data-field="category" value="${work.category || ''}" onchange="handleWorkChange(${work.id}, 'category', this.value)"></td>
        <td>
          <input type="file" accept="image/*" onchange="handleWorkPhotoChange(${work.id}, event)" class="photo-input">
          <div class="photo-preview">${editPhotoPreview}</div>
        </td>
        <td><input type="text" data-field="title" value="${work.title || ''}" onchange="handleWorkChange(${work.id}, 'title', this.value)"></td>
        <td>${authorInput}</td>
        <td>
          <div class="price-input-group">
            <input type="text" data-field="price" value="${isUnsold ? '미판매' : (work.price || '')}" oninput="handlePriceInput(${work.id}, event)" onchange="handleWorkChange(${work.id}, 'price', this.value)">
            <button type="button" class="price-cancel-btn" data-tooltip="미판매" title="미판매" aria-label="미판매" onclick="setWorkNotForSale(${work.id}, this)">✕</button>
          </div>
        </td>
        <td><input type="text" data-field="materials" value="${work.materials || ''}" onchange="handleWorkChange(${work.id}, 'materials', this.value)"></td>
        <td>
          <div class="size-input-group">
            <input type="text" data-field="sizeWidth" value="${sizeParts.width}" class="size-dimension-input" placeholder="가로" oninput="handleWorkSizeChange(${work.id}, 'width', this.value)">
            <span class="size-unit">cm x</span>
            <input type="text" data-field="sizeHeight" value="${sizeParts.height}" class="size-dimension-input" placeholder="세로" oninput="handleWorkSizeChange(${work.id}, 'height', this.value)">
            <span class="size-unit">cm</span>
          </div>
        </td>
        <td><input type="text" data-field="year" value="${work.year || ''}" onchange="handleWorkChange(${work.id}, 'year', this.value)"></td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          ${duplicateButton}
          <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
        </td>
      `
    };
  }

  const api = Object.freeze({ buildWorkRow });
  root.ExhibitionInventoryRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
