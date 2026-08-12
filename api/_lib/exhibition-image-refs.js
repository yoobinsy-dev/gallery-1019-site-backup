const { createHash } = require('crypto');
const { put } = require('@vercel/blob');

const EXHIBITION_IMAGE_ARRAY_FIELDS = ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'];

function getExhibitionImageBlobToken() {
  return process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
}

function isPublicBlobUrl(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.includes('.public.blob.vercel-storage.com/');
}

function isDataUrl(value) {
  return /^data:[^;]+;base64,/i.test(normalizeText(value));
}

function parseDataUrl(dataUrl) {
  const normalized = normalizeText(dataUrl);
  const match = normalized.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;

  try {
    return {
      mimeType: String(match[1] || 'application/octet-stream').toLowerCase(),
      buffer: Buffer.from(match[2], 'base64')
    };
  } catch (error) {
    return null;
  }
}

function mimeTypeToExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('svg')) return 'svg';
  return 'bin';
}

function getItemIdentity(item) {
  if (!item || typeof item !== 'object') return '';

  const id = Number(item.id);
  if (Number.isFinite(id) && id > 0) return `id-${id}`;

  const workId = Number(item.workId);
  if (Number.isFinite(workId) && workId > 0) return `work-${workId}`;

  const manualNumber = normalizeText(item.manualNumber).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const title = normalizeText(item.title).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (manualNumber || title) {
    return `manual-${manualNumber || 'none'}-title-${title || 'none'}`;
  }

  return `item-${Math.random().toString(36).slice(2, 10)}`;
}

function buildBlobPath({ exhibitionId, itemIdentity, kind, mimeType, payload }) {
  const safeExhibitionId = Number.isFinite(Number(exhibitionId)) ? Number(exhibitionId) : 0;
  const safeKind = kind === 'preview' ? 'preview' : 'full';
  const digest = createHash('sha1').update(payload).digest('hex').slice(0, 16);
  const ext = mimeTypeToExtension(mimeType);
  return `exhibition-images/${safeExhibitionId || 'unknown'}/${safeKind}/${itemIdentity}-${digest}.${ext}`;
}

async function putBlob(path, payload, mimeType) {
  const token = getExhibitionImageBlobToken();
  if (!token) {
    throw new Error('Missing EXHIBITION_IMAGE_READ_WRITE_TOKEN. Public exhibition image store is not configured.');
  }

  return put(path, payload, {
    token,
    access: 'public',
    contentType: mimeType
  });
}

async function uploadDataUrlToBlob({ exhibitionId, itemIdentity, kind, dataUrl }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, error: 'invalid-data-url', upload: null };
  }

  const path = buildBlobPath({
    exhibitionId,
    itemIdentity,
    kind,
    mimeType: parsed.mimeType,
    payload: parsed.buffer
  });

  try {
    const upload = await putBlob(path, parsed.buffer, parsed.mimeType);
    return {
      ok: true,
      error: null,
      upload: {
        url: upload.url,
        pathname: upload.pathname || path,
        contentType: parsed.mimeType,
        size: parsed.buffer.length
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || 'upload-failed'),
      upload: null
    };
  }
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

function normalizeImageReferenceFields(item) {
  if (!item || typeof item !== 'object') return;

  const fullUrl = normalizeText(item.photoUrl);
  const previewUrl = normalizeText(item.photoPreviewUrl);
  const fullData = normalizeText(item.photoDataUrl);
  const previewData = normalizeText(item.photoPreviewDataUrl);

  if (!fullUrl && isHttpUrl(fullData)) {
    item.photoUrl = fullData;
  }

  if (!previewUrl && isHttpUrl(previewData)) {
    item.photoPreviewUrl = previewData;
  }
}

function stripLegacyImagePayloadsWhenUrlExists(item, stats) {
  if (!item || typeof item !== 'object') return;

  const fullUrl = normalizeText(item.photoUrl);
  const previewUrl = normalizeText(item.photoPreviewUrl);

  if (isPublicBlobUrl(fullUrl) && isDataUrl(item.photoDataUrl)) {
    item.photoDataUrl = '';
    stats.strippedFullDataUrlCount += 1;
  }

  if (isPublicBlobUrl(previewUrl) && isDataUrl(item.photoPreviewDataUrl)) {
    item.photoPreviewDataUrl = '';
    stats.strippedPreviewDataUrlCount += 1;
  }
}

function iterateExhibitionItems(exhibitions, callback) {
  if (!Array.isArray(exhibitions)) return;

  exhibitions.forEach((exhibition) => {
    if (!exhibition || typeof exhibition !== 'object') return;
    const exhibitionId = Number(exhibition.id);

    EXHIBITION_IMAGE_ARRAY_FIELDS.forEach((field) => {
      const list = exhibition[field];
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        callback(item, {
          exhibition,
          exhibitionId: Number.isFinite(exhibitionId) ? exhibitionId : null,
          field
        });
      });
    });
  });
}

function buildTransferSafeExhibitions(exhibitions) {
  const cloned = cloneJson(Array.isArray(exhibitions) ? exhibitions : [], []);
  const stats = {
    scannedItemCount: 0,
    normalizedUrlFieldCount: 0,
    strippedFullDataUrlCount: 0,
    strippedPreviewDataUrlCount: 0
  };

  iterateExhibitionItems(cloned, (item) => {
    stats.scannedItemCount += 1;
    const beforeFull = normalizeText(item.photoUrl);
    const beforePreview = normalizeText(item.photoPreviewUrl);

    normalizeImageReferenceFields(item);

    if (!beforeFull && normalizeText(item.photoUrl)) {
      stats.normalizedUrlFieldCount += 1;
    }
    if (!beforePreview && normalizeText(item.photoPreviewUrl)) {
      stats.normalizedUrlFieldCount += 1;
    }

    stripLegacyImagePayloadsWhenUrlExists(item, stats);
  });

  return {
    exhibitions: cloned,
    stats
  };
}

async function migrateExhibitionImageReferences(exhibitions, options = {}) {
  const cloned = cloneJson(Array.isArray(exhibitions) ? exhibitions : [], []);
  const rawMaxUploads = Number(options.maxUploads);
  const maxUploads = Number.isFinite(rawMaxUploads)
    ? Math.max(0, Math.min(500, rawMaxUploads))
    : 40;
  const blobEnabled = Boolean(getExhibitionImageBlobToken());

  const stats = {
    scannedItemCount: 0,
    normalizedUrlFieldCount: 0,
    uploadedFullCount: 0,
    uploadedPreviewCount: 0,
    skippedBecauseNoBlobToken: blobEnabled ? 0 : 1,
    skippedBecauseUploadBudget: 0,
    failedUploadCount: 0
  };

  let uploadBudget = maxUploads;

  iterateExhibitionItems(cloned, async () => {
    // This callback intentionally remains sync for traversal counting.
  });

  const tasks = [];
  iterateExhibitionItems(cloned, (item, context) => {
    tasks.push({ item, context });
  });

  for (const task of tasks) {
    const { item, context } = task;
    stats.scannedItemCount += 1;

    const beforeFull = normalizeText(item.photoUrl);
    const beforePreview = normalizeText(item.photoPreviewUrl);
    normalizeImageReferenceFields(item);
    const normalizedFull = normalizeText(item.photoUrl);
    const normalizedPreview = normalizeText(item.photoPreviewUrl);

    if (!beforeFull && normalizedFull) stats.normalizedUrlFieldCount += 1;
    if (!beforePreview && normalizedPreview) stats.normalizedUrlFieldCount += 1;

    if (!blobEnabled) {
      continue;
    }

    const itemIdentity = getItemIdentity(item);

    const previewDataUrl = normalizeText(item.photoPreviewDataUrl);
    if (!normalizeText(item.photoPreviewUrl) && isDataUrl(previewDataUrl)) {
      if (uploadBudget <= 0) {
        stats.skippedBecauseUploadBudget += 1;
      } else {
        uploadBudget -= 1;
        const uploaded = await uploadDataUrlToBlob({
          exhibitionId: context.exhibitionId,
          itemIdentity,
          kind: 'preview',
          dataUrl: previewDataUrl
        });

        if (uploaded.ok && uploaded.upload) {
          item.photoPreviewUrl = uploaded.upload.url;
          item.photoPreviewPath = uploaded.upload.pathname;
          stats.uploadedPreviewCount += 1;
        } else {
          stats.failedUploadCount += 1;
        }
      }
    }

    const fullDataUrl = normalizeText(item.photoDataUrl);
    if (!normalizeText(item.photoUrl) && isDataUrl(fullDataUrl)) {
      if (uploadBudget <= 0) {
        stats.skippedBecauseUploadBudget += 1;
      } else {
        uploadBudget -= 1;
        const uploaded = await uploadDataUrlToBlob({
          exhibitionId: context.exhibitionId,
          itemIdentity,
          kind: 'full',
          dataUrl: fullDataUrl
        });

        if (uploaded.ok && uploaded.upload) {
          item.photoUrl = uploaded.upload.url;
          item.photoPath = uploaded.upload.pathname;
          stats.uploadedFullCount += 1;
        } else {
          stats.failedUploadCount += 1;
        }
      }
    }
  }

  return {
    exhibitions: cloned,
    stats
  };
}

module.exports = {
  buildTransferSafeExhibitions,
  migrateExhibitionImageReferences
};
