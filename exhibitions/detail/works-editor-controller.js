(function initializeExhibitionDetailWorksEditorController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailWorksEditorController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorksEditorControllerModule() {
  'use strict';

  const MAX_PHOTO_PREVIEW_DATA_URL_LENGTH = 360000;
  const PHOTO_PREVIEW_MAX_DIMENSION = 1280;
  const TRANSIENT_WORK_PHOTO_FIELDS = ['pendingPhotoDataUrl', 'pendingPhotoPreviewDataUrl'];

  function create(options) {
    const state = options.state;
    const document = options.document;
    const window = options.window;
    const fetchImpl = options.fetchImpl;
    const FileReaderImpl = options.FileReaderImpl;
    const ImageImpl = options.ImageImpl;
    const inventoryModel = options.inventoryModel;
    const imageLifecycle = options.imageLifecycle;
    const pendingPhotoUploadTokens = new Map();
    let imagePreviewOutsideClickHandler = null;

    function addWorkRow() {
      const exhibition = options.getCurrentExhibition();
      exhibition.works = exhibition.works || [];
      options.pushWorkUndoSnapshot();
      const author = exhibition.type === '개인전' ? (exhibition.participants?.[0] || '') : '';
      exhibition.works.push({
        id: options.nowImpl(),
        createdByUserId: options.getCurrentUserId(),
        manualNumber: '',
        photoName: '',
        photoUrl: '',
        photoPreviewUrl: '',
        photoPath: '',
        photoPreviewPath: '',
        photoDataUrl: '',
        photoPreviewDataUrl: '',
        photoMimeType: '',
        photoByteSize: 0,
        title: '',
        author,
        price: '',
        materials: '',
        size: '',
        year: '',
        category: '',
        quantity: state.inventoryMode === 'goods' ? '0' : '',
        wasSaved: false,
        saved: false
      });
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.updateSaveAllButtonVisibility();

      options.requestAnimationFrameImpl(() => {
        const tbody = document.getElementById('works-tbody');
        const lastRow = tbody?.lastElementChild;
        if (lastRow) {
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusTarget = lastRow.querySelector('input, textarea, select');
          if (focusTarget) {
            focusTarget.focus();
          }
        }
      });
    }

    function duplicateWorkRow(workId) {
      const exhibition = options.getCurrentExhibition();
      exhibition.works = exhibition.works || [];
      const source = exhibition.works.find((work) => work.id === workId);
      if (!source) return;
      if (!options.canCurrentUserModifyOwnedRow(source)) {
        options.alertImpl('다른 사용자가 추가한 항목은 복사할 수 없습니다.');
        return;
      }

      options.pushWorkUndoSnapshot();

      const duplicated = {
        id: options.nowImpl() + Math.floor(options.randomImpl() * 100000),
        createdByUserId: options.getCurrentUserId(),
        manualNumber: source.manualNumber || '',
        photoName: source.photoName || '',
        photoUrl: source.photoUrl || '',
        photoPreviewUrl: source.photoPreviewUrl || '',
        photoPath: source.photoPath || '',
        photoPreviewPath: source.photoPreviewPath || '',
        photoDataUrl: source.photoDataUrl || '',
        photoPreviewDataUrl: source.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(source),
        photoMimeType: source.photoMimeType || '',
        photoByteSize: Number(source.photoByteSize) || 0,
        title: source.title || '',
        author: source.author || '',
        price: source.price || '',
        materials: source.materials || '',
        size: source.size || '',
        year: source.year || '',
        category: source.category || '',
        quantity: source.quantity ?? (state.inventoryMode === 'goods' ? '0' : ''),
        wasSaved: false,
        saved: false
      };

      exhibition.works.push(duplicated);
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.updateSaveAllButtonVisibility();

      options.requestAnimationFrameImpl(() => {
        const row = document.querySelector(`tr[data-work-id="${duplicated.id}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusTarget = row.querySelector('input[data-field="manualNumber"]') || row.querySelector('input, textarea, select');
        if (focusTarget) {
          focusTarget.focus();
        }
      });
    }

    function saveWork(workId, triggerButton) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
        return;
      }

      const row = triggerButton && typeof triggerButton.closest === 'function'
        ? triggerButton.closest('tr')
        : document.querySelector(`tr[data-work-id="${workId}"]`);
      syncWorkFromRow(work, row);

      const missing = getMissingRequiredWorkFields(work);
      if (missing.length > 0) {
        markMissingRequiredFields(row, missing);
        return;
      }

      const allWorks = getAllInventoryWorks(exhibition);
      const shouldValidateNumber = shouldValidateManualNumberUniqueness(work);
      const manualNumberConflict = shouldValidateNumber ? findSavedManualNumberConflict(work, allWorks) : null;
      if (manualNumberConflict) {
        markMissingRequiredFields(row, ['manualNumber']);
        options.alertImpl('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
        return;
      }

      markMissingRequiredFields(row, []);

      if (work.price) {
        work.price = options.formatPriceForSave(work.price);
      }

      work.saved = true;
      work.wasSaved = true;
      delete work.editOriginalManualNumber;
      delete work.editOriginalTitle;
      state.workEditSnapshotIds = state.workEditSnapshotIds.filter((id) => id !== workId);
      options.synchronizeArtwork?.(work);
      syncWorkToSalesRecords(work);
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
    }

    function saveAllWorks() {
      const exhibition = options.getCurrentExhibition();
      const works = exhibition.works || [];
      let saveCount = 0;
      const pendingWorks = [];

      for (const work of works) {
        if (work.saved) continue;
        if (!options.canCurrentUserModifyOwnedRow(work)) continue;
        const row = document.querySelector(`tr[data-work-id="${work.id}"]`);
        syncWorkFromRow(work, row);
        const missing = getMissingRequiredWorkFields(work);
        if (missing.length > 0) {
          markMissingRequiredFields(row, missing);
          return;
        }
        markMissingRequiredFields(row, []);
        pendingWorks.push(work);
      }

      const allWorks = getAllInventoryWorks(exhibition);
      const numberConflictIds = getBulkManualNumberConflicts(allWorks, pendingWorks);
      if (numberConflictIds.size > 0) {
        pendingWorks.forEach((work) => {
          const row = document.querySelector(`tr[data-work-id="${work.id}"]`);
          if (!row) return;
          const missingFields = [];
          if (numberConflictIds.has(work.id)) {
            missingFields.push('manualNumber');
          }
          if (missingFields.length > 0) {
            markMissingRequiredFields(row, missingFields);
          }
        });
        options.alertImpl('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
        return;
      }

      works.forEach((work) => {
        if (!work.saved) {
          if (!options.canCurrentUserModifyOwnedRow(work)) return;
          if (work.price) {
            work.price = options.formatPriceForSave(work.price);
          }
          work.saved = true;
          work.wasSaved = true;
          delete work.editOriginalManualNumber;
          delete work.editOriginalTitle;
          state.workEditSnapshotIds = state.workEditSnapshotIds.filter((id) => id !== work.id);
          options.synchronizeArtwork?.(work);
          syncWorkToSalesRecords(work);
          saveCount++;
        }
      });
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
    }

    function syncWorkToSalesRecords(work) {
      const exhibition = options.getCurrentExhibition();
      const soldWorks = exhibition.soldWorks;
      if (!soldWorks || soldWorks.length === 0) return;
      const expectedType = state.inventoryMode === 'goods' ? '굿즈' : '작품';
      let changed = false;
      soldWorks.forEach((sold) => {
        if (sold.workId !== work.id) return;
        if (options.normalizeSoldItemType(sold) !== expectedType) return;
        sold.manualNumber = work.manualNumber || sold.manualNumber;
        sold.category = work.category || sold.category;
        sold.title = work.title || sold.title;
        sold.author = work.author || sold.author;
        sold.price = work.price || sold.price;
        sold.photoName = work.photoName || sold.photoName;
        sold.photoUrl = work.photoUrl || sold.photoUrl;
        sold.photoPreviewUrl = work.photoPreviewUrl || work.photoUrl || sold.photoPreviewUrl;
        sold.photoDataUrl = work.photoDataUrl || sold.photoDataUrl;
        sold.photoPreviewDataUrl = work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work) || sold.photoPreviewDataUrl;
        changed = true;
      });
      if (changed && state.exhibition) {
        state.exhibition.soldWorks = soldWorks;
      }
    }

    function syncWorkFromRow(work, row) {
      if (!row || !work) return;
      const manualNumberInput = row.querySelector('input[data-field="manualNumber"]');
      const categoryInput = row.querySelector('input[data-field="category"]');
      const titleInput = row.querySelector('input[data-field="title"]');
      const authorInput = row.querySelector('input[data-field="author"]');
      const priceInput = row.querySelector('input[data-field="price"]');
      const materialsInput = row.querySelector('input[data-field="materials"]');
      const yearInput = row.querySelector('input[data-field="year"]');
      const sizeWidthInput = row.querySelector('input[data-field="sizeWidth"]');
      const sizeHeightInput = row.querySelector('input[data-field="sizeHeight"]');
      const quantityInput = row.querySelector('input[data-field="quantity"]');

      if (manualNumberInput) work.manualNumber = manualNumberInput.value.trim();
      if (categoryInput) work.category = categoryInput.value.trim();
      if (titleInput) work.title = titleInput.value.trim();
      if (authorInput) work.author = authorInput.value.trim();
      if (priceInput) work.price = priceInput.value.trim();
      if (materialsInput) work.materials = materialsInput.value.trim();
      if (yearInput) work.year = yearInput.value.trim();
      if (sizeWidthInput || sizeHeightInput) {
        const width = (sizeWidthInput?.value || '').replace(/[^\d.]/g, '').trim();
        const height = (sizeHeightInput?.value || '').replace(/[^\d.]/g, '').trim();
        if (!width && !height) {
          work.size = '';
        } else if (width && height) {
          work.size = `${width} cm x ${height} cm`;
        } else {
          work.size = width ? `${width} cm x ` : ` x ${height} cm`;
        }
      }
      if (quantityInput) work.quantity = quantityInput.value.trim();
    }

    function normalizeManualNumber(value) {
      return inventoryModel.normalizeManualNumber(value);
    }

    function normalizeTitle(value) {
      return inventoryModel.normalizeTitle(value);
    }

    function shouldValidateManualNumberUniqueness(work) {
      return inventoryModel.shouldValidateManualNumberUniqueness(work);
    }

    function shouldValidateTitleUniqueness(work) {
      return inventoryModel.shouldValidateTitleUniqueness(work);
    }

    function getAllInventoryWorks(exhibition) {
      if (!exhibition) return [];
      options.initializeInventoryData(exhibition);
      const artWorks = Array.isArray(exhibition.artWorks) ? exhibition.artWorks : [];
      const goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
      return [...artWorks, ...goods];
    }

    function findSavedManualNumberConflict(work, allWorks) {
      return inventoryModel.findSavedManualNumberConflict(work, allWorks);
    }

    function findSavedTitleConflict(work, allWorks) {
      return inventoryModel.findSavedTitleConflict(work, allWorks);
    }

    function getBulkManualNumberConflicts(allWorks, pendingWorks) {
      return inventoryModel.getBulkManualNumberConflicts(allWorks, pendingWorks);
    }

    function getBulkTitleConflicts(allWorks, pendingWorks) {
      return inventoryModel.getBulkTitleConflicts(allWorks, pendingWorks);
    }

    function getMissingRequiredWorkFields(work) {
      return inventoryModel.getMissingRequiredWorkFields(work);
    }

    function markMissingRequiredFields(row, missingFields) {
      if (!row) return;
      const fields = ['manualNumber', 'title', 'price'];
      fields.forEach((field) => {
        const input = row.querySelector(`input[data-field="${field}"]`);
        if (!input) return;
        input.classList.toggle('required-missing', missingFields.includes(field));
      });
    }

    function toggleWorkEdit(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
        return;
      }
      if (work.saved) {
        options.ensureWorkEditUndoSnapshot(workId);
        work.wasSaved = true;
        work.editOriginalManualNumber = work.manualNumber || '';
        work.editOriginalTitle = work.title || '';
      }
      work.saved = false;
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.scrollRowToViewportCenter(`tr[data-work-id="${workId}"]`);
    }

    function openDeleteWorkModal(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
        return;
      }
      state.pendingDeleteWorkId = workId;
      document.getElementById('delete-modal').style.display = 'flex';
    }

    function closeDeleteWorkModal() {
      state.pendingDeleteWorkId = null;
      document.getElementById('delete-modal').style.display = 'none';
    }

    function confirmDeleteWork() {
      const workId = state.pendingDeleteWorkId;
      if (workId === null) return;
      deleteWork(workId);
      closeDeleteWorkModal();
    }

    function handleWorkChange(workId, field, value) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;
      if (field === 'author' && exhibition.type === '개인전') return;
      options.ensureWorkEditUndoSnapshot(workId);
      work[field] = value;
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
    }

    function canUseRemoteUploadApi() {
      return typeof window !== 'undefined'
        && window.location
        && !String(window.location.protocol || '').startsWith('file');
    }

    function buildPhotoUploadFileName(baseName, suffix, mimeType) {
      return imageLifecycle.buildPhotoUploadFileName(baseName, suffix, mimeType);
    }

    function parseDataUrlMimeType(dataUrl) {
      return imageLifecycle.parseDataUrlMimeType(dataUrl);
    }

    function snapshotWorkPhotoFields(work) {
      return imageLifecycle.snapshotPhotoFields(work);
    }

    function applyWorkPhotoFields(work, snapshot) {
      imageLifecycle.applyPhotoFields(work, snapshot);
    }

    function clearPendingWorkPhotoFields(work) {
      imageLifecycle.clearPendingPhotoFields(work);
    }

    async function verifyUploadedImageFile(uploadedFile) {
      return imageLifecycle.verifyUploadedImage({ fetchImpl, uploadedFile });
    }

    async function uploadImageDataUrl(dataUrl, fileName) {
      return imageLifecycle.uploadImageDataUrl({
        fetchImpl,
        canUpload: canUseRemoteUploadApi(),
        dataUrl,
        fileName
      });
    }

    async function persistWorkPhotoUrls(workId, uploadOptions = {}) {
      if (!canUseRemoteUploadApi()) {
        return { ok: false, reason: 'remote-upload-disabled' };
      }

      const exhibition = options.getCurrentExhibition();
      const work = Array.isArray(exhibition.works)
        ? exhibition.works.find((item) => item.id === workId)
        : null;
      if (!work) return { ok: false, reason: 'work-not-found' };

      const uploadPlan = imageLifecycle.buildUploadPlan(work, { ...uploadOptions, workId });
      if (!uploadPlan.ok) return uploadPlan;

      const token = `${options.nowImpl()}-${options.randomImpl().toString(36).slice(2, 10)}`;
      pendingPhotoUploadTokens.set(workId, token);

      if (uploadPlan.skipped) {
        clearPendingWorkPhotoFields(work);
        return { ok: true, skipped: true };
      }

      const previewUpload = uploadPlan.shouldUploadPreview
        ? await uploadImageDataUrl(uploadPlan.previewDataUrl, uploadPlan.previewFileName)
        : null;
      const fullUpload = uploadPlan.shouldUploadFull
        ? await uploadImageDataUrl(uploadPlan.fullDataUrl, uploadPlan.fullFileName)
        : null;

      if (uploadPlan.shouldUploadPreview && !previewUpload?.url) {
        return { ok: false, reason: 'preview-upload-failed' };
      }
      if (uploadPlan.shouldUploadFull && !fullUpload?.url) {
        return { ok: false, reason: 'full-upload-failed' };
      }

      const previewValidation = previewUpload ? await verifyUploadedImageFile(previewUpload) : null;
      const fullValidation = fullUpload ? await verifyUploadedImageFile(fullUpload) : null;

      if (previewUpload && !previewValidation?.ok) {
        return { ok: false, reason: 'preview-upload-validation-failed', details: previewValidation || null };
      }
      if (fullUpload && !fullValidation?.ok) {
        return { ok: false, reason: 'full-upload-validation-failed', details: fullValidation || null };
      }
      if (pendingPhotoUploadTokens.get(workId) !== token) {
        return { ok: false, reason: 'upload-superseded' };
      }

      const latestExhibition = options.getCurrentExhibition();
      const latestWork = Array.isArray(latestExhibition.works)
        ? latestExhibition.works.find((item) => item.id === workId)
        : null;
      if (!latestWork) return { ok: false, reason: 'latest-work-not-found' };

      const changed = imageLifecycle.applyUploadedPhotoFields(latestWork, { previewUpload, fullUpload });
      if (!changed) return { ok: true, skipped: true };

      if (state.exhibition) {
        state.exhibition.works = latestExhibition.works;
      }
      options.synchronizeArtwork?.(latestWork);
      options.saveExhibition();
      options.renderWorkRows();

      return { ok: true, previewUpload, fullUpload, previewValidation, fullValidation };
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReaderImpl();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });
    }

    function loadImageElement(src) {
      return new Promise((resolve, reject) => {
        const image = new ImageImpl();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image data.'));
        image.src = src;
      });
    }

    function renderResizedDataUrl(image, mimeType, quality, maxDimension) {
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) return '';

      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = options.createCanvas();
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) return '';
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      if (mimeType === 'image/png') return canvas.toDataURL(mimeType);
      return canvas.toDataURL(mimeType, quality);
    }

    async function buildLightweightPhotoPreview(dataUrl) {
      if (!dataUrl) return '';
      try {
        const image = await loadImageElement(dataUrl);
        const thumbnail = renderResizedDataUrl(image, 'image/webp', 0.55, 280);
        return thumbnail || dataUrl;
      } catch (error) {
        return dataUrl;
      }
    }

    async function buildCompactPhotoPreview(file) {
      const originalDataUrl = await readFileAsDataUrl(file);
      if (!originalDataUrl) return { dataUrl: '', mimeType: '', byteSize: 0 };

      if (originalDataUrl.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
        return {
          dataUrl: originalDataUrl,
          mimeType: file.type || '',
          byteSize: Number.isFinite(file.size) ? file.size : 0
        };
      }

      const image = await loadImageElement(originalDataUrl);
      const isPng = (file.type || '').toLowerCase() === 'image/png';
      const mimeCandidates = isPng ? ['image/webp', 'image/jpeg', 'image/png'] : ['image/webp', 'image/jpeg'];
      const qualities = [0.82, 0.72, 0.62, 0.52];
      const dimensions = [PHOTO_PREVIEW_MAX_DIMENSION, 1080, 920, 760, 620];
      let bestDataUrl = '';
      let bestMimeType = '';

      for (const maxDimension of dimensions) {
        for (const mimeType of mimeCandidates) {
          if (mimeType === 'image/png') {
            const pngDataUrl = renderResizedDataUrl(image, mimeType, 1, maxDimension);
            if (!pngDataUrl) continue;
            if (!bestDataUrl || pngDataUrl.length < bestDataUrl.length) {
              bestDataUrl = pngDataUrl;
              bestMimeType = mimeType;
            }
            if (pngDataUrl.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
              return { dataUrl: pngDataUrl, mimeType, byteSize: Math.round((pngDataUrl.length * 3) / 4) };
            }
            continue;
          }

          for (const quality of qualities) {
            const encoded = renderResizedDataUrl(image, mimeType, quality, maxDimension);
            if (!encoded) continue;
            if (!bestDataUrl || encoded.length < bestDataUrl.length) {
              bestDataUrl = encoded;
              bestMimeType = mimeType;
            }
            if (encoded.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
              return { dataUrl: encoded, mimeType, byteSize: Math.round((encoded.length * 3) / 4) };
            }
          }
        }
      }

      const fallbackDataUrl = bestDataUrl || originalDataUrl;
      return {
        dataUrl: fallbackDataUrl,
        mimeType: bestMimeType || file.type || '',
        byteSize: Math.round((fallbackDataUrl.length * 3) / 4)
      };
    }

    async function handleWorkPhotoChange(workId, event) {
      const file = event.target.files[0];
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;

      options.ensureWorkEditUndoSnapshot(workId);
      const previousPhotoSnapshot = snapshotWorkPhotoFields(work);

      if (!file) {
        work.photoName = '';
        work.photoUrl = '';
        work.photoPreviewUrl = '';
        work.photoPath = '';
        work.photoPreviewPath = '';
        work.photoDataUrl = '';
        work.photoPreviewDataUrl = '';
        clearPendingWorkPhotoFields(work);
        work.photoMimeType = '';
        work.photoByteSize = 0;
        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.saveExhibition();
        options.renderWorkRows();
        return;
      }

      try {
        const compactPhoto = await buildCompactPhotoPreview(file);
        const lightweightPreview = await buildLightweightPhotoPreview(compactPhoto.dataUrl);
        work.photoName = file.name;
        work.pendingPhotoDataUrl = compactPhoto.dataUrl;
        work.pendingPhotoPreviewDataUrl = lightweightPreview;
        work.photoMimeType = compactPhoto.mimeType;
        work.photoByteSize = compactPhoto.byteSize;

        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.renderWorkRows();

        const persisted = await persistWorkPhotoUrls(workId, {
          fullDataUrl: compactPhoto.dataUrl,
          previewDataUrl: lightweightPreview,
          fileName: file.name,
          replaceExisting: true
        });

        if (!persisted?.ok) {
          if (persisted?.reason === 'upload-superseded') return;
          applyWorkPhotoFields(work, previousPhotoSnapshot);
          if (state.exhibition) state.exhibition.works = exhibition.works;
          options.renderWorkRows();
          options.alertImpl('이미지 업로드에 실패했습니다. 기존 이미지 상태로 복원되었습니다. 네트워크를 확인한 뒤 다시 시도해주세요.');
          return;
        }
      } catch (error) {
        options.consoleImpl.error('Failed to process photo preview:', error);
        applyWorkPhotoFields(work, previousPhotoSnapshot);
        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.renderWorkRows();
        options.alertImpl('이미지 처리 중 오류가 발생했습니다. 기존 이미지 상태를 유지합니다.');
      }
    }

    function parseSizeParts(sizeText) {
      return inventoryModel.parseSizeParts(sizeText);
    }

    function handleWorkSizeChange(workId, part, value) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;

      options.ensureWorkEditUndoSnapshot(workId);
      const cleanedValue = (value || '').replace(/[^\d.]/g, '');
      const current = parseSizeParts(work.size);
      const width = part === 'width' ? cleanedValue : current.width;
      const height = part === 'height' ? cleanedValue : current.height;

      if (!width && !height) {
        work.size = '';
      } else if (width && height) {
        work.size = `${width} cm x ${height} cm`;
      } else {
        work.size = width ? `${width} cm x ` : ` x ${height} cm`;
      }

      if (state.exhibition) state.exhibition.works = exhibition.works;
      options.saveExhibition();
    }

    function openImagePreviewByWorkId(workId, event) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      const previewDataUrl = options.getPhotoPreviewDataUrl(work);
      if (!work || !previewDataUrl) return;
      if (event) event.stopPropagation();

      closeImagePreview();
      const preview = document.createElement('div');
      preview.id = 'image-preview-popover';
      preview.className = 'image-preview-popover';
      preview.innerHTML = `
    <div class="image-preview-header">
      <span>${work.title || work.photoName || '이미지 미리보기'}</span>
      <button type="button" class="image-preview-close" onclick="closeImagePreview()">✕</button>
    </div>
    <img src="${previewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="image-preview-large">
  `;

      const anchorRect = event?.currentTarget?.getBoundingClientRect();
      const fallbackTop = Math.max(16, window.innerHeight / 2 - 140);
      preview.style.top = `${anchorRect ? Math.max(16, anchorRect.top - 8) : fallbackTop}px`;
      preview.style.left = `${anchorRect ? anchorRect.right + 12 : 16}px`;
      document.body.appendChild(preview);

      const popoverRect = preview.getBoundingClientRect();
      if (popoverRect.right > window.innerWidth - 12 && anchorRect) {
        preview.style.left = `${Math.max(12, anchorRect.left - popoverRect.width - 12)}px`;
      }
      if (popoverRect.bottom > window.innerHeight - 12) {
        preview.style.top = `${Math.max(12, window.innerHeight - popoverRect.height - 12)}px`;
      }

      imagePreviewOutsideClickHandler = (clickEvent) => {
        const popover = document.getElementById('image-preview-popover');
        if (!popover) return;
        if (!popover.contains(clickEvent.target)) closeImagePreview();
      };

      options.setTimeoutImpl(() => {
        if (imagePreviewOutsideClickHandler) {
          document.addEventListener('click', imagePreviewOutsideClickHandler);
        }
      }, 0);
    }

    function closeImagePreview() {
      const popover = document.getElementById('image-preview-popover');
      if (popover) popover.remove();
      if (imagePreviewOutsideClickHandler) {
        document.removeEventListener('click', imagePreviewOutsideClickHandler);
        imagePreviewOutsideClickHandler = null;
      }
    }

    function deleteWork(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
        return;
      }
      options.pushWorkUndoSnapshot();
      exhibition.works = exhibition.works.filter((item) => item.id !== workId);
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = state.selectedWorkIds.filter((id) => id !== workId);
      state.lastWorkCheckboxIndex = null;
      options.saveExhibition();
      options.renderWorkRows();
    }

    function toggleSelectAllWorks(source) {
      const visibleWorks = options.getVisibleWorks();
      const visibleIds = visibleWorks.map((work) => work.id);
      if (source.checked) {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...visibleIds]));
      } else {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => !visibleIds.includes(id));
      }
      state.lastWorkCheckboxIndex = null;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function updateWorkSelectionActionButtons(visibleWorks) {
      const scopedWorks = Array.isArray(visibleWorks) ? visibleWorks : options.getVisibleWorks();
      const allVisibleSelected = scopedWorks.length > 0 && scopedWorks.every((work) => state.selectedWorkIds.includes(work.id));

      ['work-select-all-btn', 'work-select-all-btn-bottom'].forEach((buttonId) => {
        const selectAllButton = document.getElementById(buttonId);
        if (selectAllButton) selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
      });
      ['work-delete-selected-btn', 'work-delete-selected-btn-bottom'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) button.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      });
      ['work-edit-selected-btn', 'work-edit-selected-btn-bottom'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) button.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      });

      const selectAllCheckbox = document.getElementById('select-all-works');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = allVisibleSelected;
        selectAllCheckbox.indeterminate = !allVisibleSelected && state.selectedWorkIds.length > 0;
      }
      options.refreshGridKeyboardNavigation('works-tbody');
    }

    function toggleWorkSelection(workId, isChecked, event, rowIndex) {
      const visibleWorks = options.getVisibleWorks();
      const currentIndex = typeof rowIndex === 'number'
        ? rowIndex
        : visibleWorks.findIndex((work) => work.id === workId);
      const isShiftRange = Boolean(event && event.shiftKey && state.lastWorkCheckboxIndex !== null && currentIndex !== -1);

      if (isShiftRange) {
        const start = Math.min(state.lastWorkCheckboxIndex, currentIndex);
        const end = Math.max(state.lastWorkCheckboxIndex, currentIndex);
        const rangeIds = visibleWorks.slice(start, end + 1).map((work) => work.id);
        if (isChecked) {
          state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...rangeIds]));
        } else {
          state.selectedWorkIds = state.selectedWorkIds.filter((id) => !rangeIds.includes(id));
        }
      } else if (isChecked) {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, workId]));
      } else {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => id !== workId);
      }

      if (currentIndex !== -1) state.lastWorkCheckboxIndex = currentIndex;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function toggleSelectAllVisibleWorks() {
      const visibleWorks = options.getVisibleWorks();
      const visibleIds = visibleWorks.map((work) => work.id);
      const allSelected = visibleWorks.length > 0 && visibleIds.every((id) => state.selectedWorkIds.includes(id));
      if (allSelected) {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => !visibleIds.includes(id));
      } else {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...visibleIds]));
      }
      state.lastWorkCheckboxIndex = null;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function deleteAllWorks() {
      if (!window.confirm('모든 작품을 삭제하시겠습니까?')) return;
      const exhibition = options.getCurrentExhibition();
      let nextWorks = [];
      if (options.isArtistScopedUser()) {
        nextWorks = (exhibition.works || []).filter((work) => !options.canCurrentUserModifyOwnedRow(work));
        if (nextWorks.length === (exhibition.works || []).length) {
          options.alertImpl('삭제할 수 있는 항목이 없습니다.');
          return;
        }
      }

      options.pushWorkUndoSnapshot();
      exhibition.works = options.isArtistScopedUser() ? nextWorks : [];
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      state.allowLargeInventoryDropOnce = true;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function deleteSelectedWorks() {
      if (state.selectedWorkIds.length === 0) return;
      if (!window.confirm('선택된 작품을 삭제하시겠습니까?')) return;
      const exhibition = options.getCurrentExhibition();
      const selectedSet = new Set(state.selectedWorkIds);
      const deletableIds = (exhibition.works || [])
        .filter((work) => selectedSet.has(work.id) && options.canCurrentUserModifyOwnedRow(work))
        .map((work) => work.id);
      if (deletableIds.length === 0) {
        options.alertImpl('삭제할 수 있는 항목이 없습니다.');
        return;
      }
      options.pushWorkUndoSnapshot();
      exhibition.works = (exhibition.works || []).filter((work) => !deletableIds.includes(work.id));
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      state.allowLargeInventoryDropOnce = true;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function editSelectedWorks() {
      if (state.selectedWorkIds.length === 0) return;
      const exhibition = options.getCurrentExhibition();
      const selectedSet = new Set(state.selectedWorkIds);
      const editableWorks = (exhibition.works || [])
        .filter((work) => selectedSet.has(work.id) && options.canCurrentUserModifyOwnedRow(work));

      if (editableWorks.length === 0) {
        options.alertImpl('수정할 수 있는 항목이 없습니다.');
        return;
      }

      editableWorks.forEach((work) => {
        if (work.saved) {
          options.ensureWorkEditUndoSnapshot(work.id);
          work.wasSaved = true;
          work.editOriginalManualNumber = work.manualNumber || '';
          work.editOriginalTitle = work.title || '';
        }
        work.saved = false;
      });

      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    return {
      addWorkRow,
      duplicateWorkRow,
      saveWork,
      saveAllWorks,
      syncWorkToSalesRecords,
      syncWorkFromRow,
      normalizeManualNumber,
      normalizeTitle,
      shouldValidateManualNumberUniqueness,
      shouldValidateTitleUniqueness,
      getAllInventoryWorks,
      findSavedManualNumberConflict,
      findSavedTitleConflict,
      getBulkManualNumberConflicts,
      getBulkTitleConflicts,
      getMissingRequiredWorkFields,
      markMissingRequiredFields,
      toggleWorkEdit,
      openDeleteWorkModal,
      closeDeleteWorkModal,
      confirmDeleteWork,
      handleWorkChange,
      canUseRemoteUploadApi,
      buildPhotoUploadFileName,
      parseDataUrlMimeType,
      snapshotWorkPhotoFields,
      applyWorkPhotoFields,
      clearPendingWorkPhotoFields,
      verifyUploadedImageFile,
      uploadImageDataUrl,
      persistWorkPhotoUrls,
      readFileAsDataUrl,
      loadImageElement,
      renderResizedDataUrl,
      buildLightweightPhotoPreview,
      buildCompactPhotoPreview,
      handleWorkPhotoChange,
      parseSizeParts,
      handleWorkSizeChange,
      openImagePreviewByWorkId,
      closeImagePreview,
      deleteWork,
      toggleSelectAllWorks,
      updateWorkSelectionActionButtons,
      toggleWorkSelection,
      toggleSelectAllVisibleWorks,
      deleteAllWorks,
      deleteSelectedWorks,
      editSelectedWorks,
      MAX_PHOTO_PREVIEW_DATA_URL_LENGTH,
      PHOTO_PREVIEW_MAX_DIMENSION,
      TRANSIENT_WORK_PHOTO_FIELDS
    };
  }

  return { create };
});