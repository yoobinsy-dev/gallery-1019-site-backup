(function initializeExhibitionImageLifecycle(root) {
  'use strict';

  const TRANSIENT_PHOTO_FIELDS = Object.freeze([
    'pendingPhotoDataUrl',
    'pendingPhotoPreviewDataUrl'
  ]);

  function getPhotoPreviewSource(item) {
    const pendingPreview = (item?.pendingPhotoPreviewDataUrl || '').toString().trim();
    if (pendingPreview) return pendingPreview;
    const pendingFull = (item?.pendingPhotoDataUrl || '').toString().trim();
    if (pendingFull) return pendingFull;
    const previewUrl = (item?.photoPreviewUrl || '').toString().trim();
    if (previewUrl) return previewUrl;
    const fullUrl = (item?.photoUrl || '').toString().trim();
    if (fullUrl) return fullUrl;
    return (item?.photoPreviewDataUrl || item?.photoDataUrl || '').toString().trim();
  }

  function getPhotoSource(item) {
    const pendingFull = (item?.pendingPhotoDataUrl || '').toString().trim();
    if (pendingFull) return pendingFull;
    const fullUrl = (item?.photoUrl || '').toString().trim();
    if (fullUrl) return fullUrl;
    return (item?.photoDataUrl || '').toString().trim();
  }

  function getExtensionFromMimeType(mimeType) {
    const normalized = (mimeType || '').toString().toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    return 'bin';
  }

  function buildPhotoUploadFileName(baseName, suffix, mimeType) {
    const stem = (baseName || 'work-image')
      .toString()
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const extension = getExtensionFromMimeType(mimeType);
    return `${stem || 'work-image'}-${suffix}.${extension}`;
  }

  function parseDataUrlMimeType(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
    return match ? match[1] : '';
  }

  function snapshotPhotoFields(work) {
    if (!work || typeof work !== 'object') return null;
    return {
      photoName: work.photoName || '',
      photoUrl: work.photoUrl || '',
      photoPreviewUrl: work.photoPreviewUrl || '',
      photoPath: work.photoPath || '',
      photoPreviewPath: work.photoPreviewPath || '',
      photoDataUrl: work.photoDataUrl || '',
      photoPreviewDataUrl: work.photoPreviewDataUrl || '',
      photoMimeType: work.photoMimeType || '',
      photoByteSize: Number.isFinite(work.photoByteSize) ? work.photoByteSize : 0,
      pendingPhotoDataUrl: work.pendingPhotoDataUrl || '',
      pendingPhotoPreviewDataUrl: work.pendingPhotoPreviewDataUrl || ''
    };
  }

  function applyPhotoFields(work, snapshot) {
    if (!work || typeof work !== 'object' || !snapshot) return;
    work.photoName = snapshot.photoName || '';
    work.photoUrl = snapshot.photoUrl || '';
    work.photoPreviewUrl = snapshot.photoPreviewUrl || '';
    work.photoPath = snapshot.photoPath || '';
    work.photoPreviewPath = snapshot.photoPreviewPath || '';
    work.photoDataUrl = snapshot.photoDataUrl || '';
    work.photoPreviewDataUrl = snapshot.photoPreviewDataUrl || '';
    work.photoMimeType = snapshot.photoMimeType || '';
    work.photoByteSize = Number.isFinite(snapshot.photoByteSize) ? snapshot.photoByteSize : 0;
    work.pendingPhotoDataUrl = snapshot.pendingPhotoDataUrl || '';
    work.pendingPhotoPreviewDataUrl = snapshot.pendingPhotoPreviewDataUrl || '';
  }

  function clearPendingPhotoFields(work) {
    if (!work || typeof work !== 'object') return;
    TRANSIENT_PHOTO_FIELDS.forEach((field) => {
      if (field in work) work[field] = '';
    });
  }

  function buildUploadPlan(work, options = {}) {
    const replaceExisting = options.replaceExisting !== false;
    const fullDataUrl = (options.fullDataUrl || work.pendingPhotoDataUrl || work.photoDataUrl || '').toString().trim();
    const previewDataUrl = (options.previewDataUrl || work.pendingPhotoPreviewDataUrl || work.photoPreviewDataUrl || '').toString().trim();
    if (!fullDataUrl && !previewDataUrl) return { ok: false, reason: 'missing-data-url' };

    const baseName = work.photoName || options.fileName || `work-${options.workId}`;
    const previewMimeType = parseDataUrlMimeType(previewDataUrl) || parseDataUrlMimeType(fullDataUrl) || 'image/webp';
    const fullMimeType = parseDataUrlMimeType(fullDataUrl) || previewMimeType;
    const shouldUploadPreview = Boolean(previewDataUrl) && (replaceExisting || !work.photoPreviewUrl);
    const shouldUploadFull = Boolean(fullDataUrl) && (replaceExisting || !work.photoUrl);
    return {
      ok: true,
      skipped: !shouldUploadPreview && !shouldUploadFull,
      fullDataUrl,
      previewDataUrl,
      shouldUploadPreview,
      shouldUploadFull,
      previewFileName: buildPhotoUploadFileName(baseName, 'preview', previewMimeType),
      fullFileName: buildPhotoUploadFileName(baseName, 'full', fullMimeType)
    };
  }

  function applyUploadedPhotoFields(work, uploads) {
    let changed = false;
    if (uploads.previewUpload?.url) {
      work.photoPreviewUrl = uploads.previewUpload.url;
      work.photoPreviewPath = uploads.previewUpload.pathname || '';
      changed = true;
    }
    if (uploads.fullUpload?.url) {
      work.photoUrl = uploads.fullUpload.url;
      work.photoPath = uploads.fullUpload.pathname || '';
      changed = true;
    }
    if (work.photoPreviewDataUrl || work.photoDataUrl || work.pendingPhotoPreviewDataUrl || work.pendingPhotoDataUrl) {
      work.photoPreviewDataUrl = '';
      work.photoDataUrl = '';
      clearPendingPhotoFields(work);
      changed = true;
    }
    return changed;
  }

  async function verifyUploadedImage(options) {
    const url = (options.uploadedFile?.url || '').toString().trim();
    if (!url) return { ok: false, status: 0, contentType: '', isImage: false };
    try {
      const response = await options.fetchImpl(url, { method: 'GET' });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      return {
        ok: response.ok && contentType.startsWith('image/'),
        status: response.status,
        contentType,
        isImage: contentType.startsWith('image/')
      };
    } catch (error) {
      return { ok: false, status: 0, contentType: '', isImage: false };
    }
  }

  async function uploadImageDataUrl(options) {
    const source = (options.dataUrl || '').toString().trim();
    if (!source || !options.canUpload) return null;
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 1;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await options.fetchImpl(options.endpoint || '/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: source, filename: options.fileName })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload?.file?.url) {
          throw new Error(payload?.error || 'upload-failed');
        }
        return payload.file;
      } catch (error) {
        if (attempt === maxRetries) return null;
      }
    }
    return null;
  }

  const api = Object.freeze({
    applyPhotoFields,
    applyUploadedPhotoFields,
    buildPhotoUploadFileName,
    buildUploadPlan,
    clearPendingPhotoFields,
    getPhotoPreviewSource,
    getPhotoSource,
    parseDataUrlMimeType,
    snapshotPhotoFields,
    uploadImageDataUrl,
    verifyUploadedImage
  });
  root.ExhibitionImageLifecycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
