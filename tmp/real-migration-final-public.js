const fs = require('fs');
const { createHash } = require('crypto');
const { put } = require('@vercel/blob');
const { getStateMap, getStateMetaMap, setStateValue } = require('../api/_lib/state-store');
const { buildTransferSafeExhibitions } = require('../api/_lib/exhibition-image-refs');

const REPORT_PATH = 'tmp/real-migration-final-public-report.json';
const MAX_ASSETS = Number.POSITIVE_INFINITY;
const STOP_ON_UNEXPECTED_ERRORS = true;
const MAX_UNEXPECTED_ERRORS = 3;
const ORIGINAL_BASELINE_BYTES = 4384673;
const PRE_FINAL_BASELINE_BYTES = 1339536;
const API_HOST = (process.env.VERCEL_URL || 'gallery-1019-site.vercel.app').trim();
const API_BASE = API_HOST.startsWith('http://') || API_HOST.startsWith('https://') ? API_HOST : `https://${API_HOST}`;
const ARRAY_FIELDS = ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'];
const CERTIFICATE_CRITICAL_FIELDS = ['title', 'manualNumber', 'author', 'price', 'size', 'year'];

function t(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDataUrl(value) {
  return /^data:[^;]+;base64,/i.test(t(value));
}

function isHttpUrl(value) {
  const normalized = t(value).toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
}

function isPublicBlobUrl(value) {
  return t(value).toLowerCase().includes('.public.blob.vercel-storage.com/');
}

function parseDataUrl(dataUrl) {
  const normalized = t(dataUrl);
  const match = normalized.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;

  try {
    return {
      mimeType: String(match[1] || 'application/octet-stream').toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
      raw: normalized
    };
  } catch (error) {
    return null;
  }
}

function extFromMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  return 'bin';
}

function handleUnexpectedError(report, message) {
  report.errors.push(message);
  report.counters.unexpectedErrors += 1;
  if (STOP_ON_UNEXPECTED_ERRORS || report.counters.unexpectedErrors >= MAX_UNEXPECTED_ERRORS) {
    throw new Error(message);
  }
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

function hashText(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex');
}

function getExhibitionImageBlobToken() {
  return process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
}

function countInventoryItems(exhibitions) {
  let total = 0;
  for (const exhibition of Array.isArray(exhibitions) ? exhibitions : []) {
    for (const field of ARRAY_FIELDS) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      total += list.length;
    }
  }
  return total;
}

function findExhibition(exhibitions, exhibitionId) {
  return exhibitions.find((exhibition) => Number(exhibition?.id) === Number(exhibitionId));
}

function findItem(exhibition, field, itemId) {
  const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
  return list.find((item) => Number(item?.id) === Number(itemId));
}

function collectDiffPaths(before, after, basePath, out, limit = 1000) {
  if (out.length >= limit) return;

  const beforeIsObj = before && typeof before === 'object';
  const afterIsObj = after && typeof after === 'object';

  if (!beforeIsObj || !afterIsObj) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push(basePath || '$');
    }
    return;
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeArr = Array.isArray(before) ? before : [];
    const afterArr = Array.isArray(after) ? after : [];
    if (beforeArr.length !== afterArr.length) {
      out.push(`${basePath || '$'}.length`);
      return;
    }

    for (let i = 0; i < beforeArr.length; i += 1) {
      collectDiffPaths(beforeArr[i], afterArr[i], `${basePath}[${i}]`, out, limit);
      if (out.length >= limit) return;
    }
    return;
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    collectDiffPaths(before[key], after[key], basePath ? `${basePath}.${key}` : key, out, limit);
    if (out.length >= limit) return;
  }
}

function buildCandidates(exhibitions) {
  const fullCandidates = [];
  const previewCandidates = [];

  for (const exhibition of Array.isArray(exhibitions) ? exhibitions : []) {
    const exhibitionId = Number(exhibition?.id);
    if (!Number.isFinite(exhibitionId) || exhibitionId <= 0) continue;

    for (const field of ARRAY_FIELDS) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      for (let idx = 0; idx < list.length; idx += 1) {
        const item = list[idx];
        if (!item || typeof item !== 'object') continue;

        const itemId = Number(item?.id);
        if (!Number.isFinite(itemId) || itemId <= 0) continue;

        const fullUrl = t(item.photoUrl);
        const previewUrl = t(item.photoPreviewUrl);
        const fullDataUrl = t(item.photoDataUrl);
        const previewDataUrl = t(item.photoPreviewDataUrl);

        if (isDataUrl(fullDataUrl) && !isHttpUrl(fullUrl) && !isPublicBlobUrl(fullUrl)) {
          fullCandidates.push({
            kind: 'full',
            exhibitionId,
            field,
            itemId,
            itemTitle: t(item?.title),
            manualNumber: t(item?.manualNumber),
            dataField: 'photoDataUrl',
            urlField: 'photoUrl',
            pathField: 'photoPath',
            dataLen: fullDataUrl.length
          });
        }

        if (isDataUrl(previewDataUrl) && !isHttpUrl(previewUrl) && !isPublicBlobUrl(previewUrl)) {
          previewCandidates.push({
            kind: 'preview',
            exhibitionId,
            field,
            itemId,
            itemTitle: t(item?.title),
            manualNumber: t(item?.manualNumber),
            dataField: 'photoPreviewDataUrl',
            urlField: 'photoPreviewUrl',
            pathField: 'photoPreviewPath',
            dataLen: previewDataUrl.length
          });
        }
      }
    }
  }

  return { fullCandidates, previewCandidates };
}

function chooseMixedCandidates(fullCandidates, previewCandidates, maxAssets) {
  const fullQueue = [...fullCandidates];
  const previewQueue = [...previewCandidates];
  const selection = [];

  const maxSelectable = Math.min(maxAssets, fullQueue.length + previewQueue.length);

  let turn = fullQueue.length >= previewQueue.length ? 'full' : 'preview';

  while (selection.length < maxSelectable) {
    if (turn === 'full') {
      if (fullQueue.length > 0) {
        selection.push(fullQueue.shift());
      } else if (previewQueue.length > 0) {
        selection.push(previewQueue.shift());
      }
      turn = 'preview';
    } else {
      if (previewQueue.length > 0) {
        selection.push(previewQueue.shift());
      } else if (fullQueue.length > 0) {
        selection.push(fullQueue.shift());
      }
      turn = 'full';
    }
  }

  return selection;
}

async function putBlob(path, payload, mimeType, token) {
  return put(path, payload, {
    token,
    access: 'public',
    contentType: mimeType
  });
}

async function validatePublicUrl(url) {
  const response = await fetch(url, { method: 'GET' });
  const contentType = t(response.headers.get('content-type')).toLowerCase();
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    isImage: contentType.startsWith('image/')
  };
}

async function getLiveStateBytes() {
  const response = await fetch(`${API_BASE}/api/state?keys=exhibitions`);
  if (!response.ok) {
    throw new Error(`Failed to query live state bytes: ${response.status}`);
  }

  const payload = await response.json();
  const headerValue = Number(response.headers.get('x-state-response-bytes') || '0');
  const computed = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];
  let transferredBase64Bytes = 0;
  for (const exhibition of exhibitions) {
    for (const field of ARRAY_FIELDS) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      for (const item of list) {
        transferredBase64Bytes += t(item?.photoDataUrl).length;
        transferredBase64Bytes += t(item?.photoPreviewDataUrl).length;
      }
    }
  }

  return {
    headerBytes: headerValue,
    computedBytes: computed,
    transferredBase64Bytes
  };
}

function countPublicReferences(exhibitions) {
  let full = 0;
  let preview = 0;

  for (const exhibition of Array.isArray(exhibitions) ? exhibitions : []) {
    for (const field of ARRAY_FIELDS) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      for (const item of list) {
        if (isPublicBlobUrl(item?.photoUrl)) full += 1;
        if (isPublicBlobUrl(item?.photoPreviewUrl)) preview += 1;
      }
    }
  }

  return {
    full,
    preview,
    total: full + preview
  };
}

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
  }

  const token = getExhibitionImageBlobToken();
  if (!token) {
    throw new Error('Missing EXHIBITION_IMAGE_READ_WRITE_TOKEN');
  }

  const report = {
    startedAt: new Date().toISOString(),
    mode: 'REAL_PUBLIC_MIGRATION_FINAL_ALL',
    constraints: {
      maxAssets: MAX_ASSETS,
      usePublicStore: true,
      preserveLegacyBase64: true,
      noBlobDeletes: true,
      noDedup: true,
      noUnrelatedFieldMutations: true
    },
    before: {
      liveApiResponseBytes: null,
      transferredBase64Bytes: null,
      stateUpdatedAt: null,
      exhibitionCount: 0,
      totalInventoryItems: 0,
      totalPublicReferences: 0,
      remainingLegacyAssetsWithoutPublicUrl: 0,
      candidateCounts: {
        full: 0,
        preview: 0
      }
    },
    selection: {
      totalSelected: 0,
      fullSelected: 0,
      previewSelected: 0,
      selectedTargets: []
    },
    uploads: [],
    touchedRecords: [],
    validations: {
      uploadSucceeded: [],
      uploadFailed: [],
      publicBlobDelivery: [],
      unauthGet200: [],
      imageContentType: [],
      base64Retained: [],
      transferSafeOmitWhenPublicUrlConfirmed: [],
      certificateCriticalUnchanged: [],
      noUnexpectedFieldChanges: null,
      noDeletions: null
    },
    counters: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      unexpectedErrors: 0,
      fullAttempted: 0,
      previewAttempted: 0,
      fullSucceeded: 0,
      previewSucceeded: 0,
      productionRecordsModified: 0,
      legacyBase64FieldsRemoved: 0,
      writesPerformed: 0,
      deletionsPerformed: 0,
      blobDeletionsPerformed: 0
    },
    after: {
      liveApiResponseBytes: null,
      transferredBase64Bytes: null,
      stateUpdatedAt: null,
      exhibitionCount: 0,
      totalInventoryItems: 0,
      totalPublicReferences: 0,
      remainingLegacyAssetsWithoutPublicUrl: 0,
      batchByteReduction: null,
      reductionFromOriginalBaselineBytes: null,
      reductionFromOriginalBaselinePercent: null,
      reductionFromPreFinalBaselineBytes: null,
      reductionFromPreFinalBaselinePercent: null
    },
    errors: []
  };

  const beforeLive = await getLiveStateBytes();
  report.before.liveApiResponseBytes = beforeLive.headerBytes;
  report.before.transferredBase64Bytes = beforeLive.transferredBase64Bytes;

  const beforeMeta = await getStateMetaMap(['exhibitions']);
  report.before.stateUpdatedAt = beforeMeta?.exhibitions?.updatedAt || null;

  const beforeMap = await getStateMap(['exhibitions']);
  const beforeExhibitions = Array.isArray(beforeMap?.exhibitions) ? beforeMap.exhibitions : [];
  report.before.exhibitionCount = beforeExhibitions.length;
  report.before.totalInventoryItems = countInventoryItems(beforeExhibitions);
  report.before.totalPublicReferences = countPublicReferences(beforeExhibitions).total;

  const { fullCandidates, previewCandidates } = buildCandidates(beforeExhibitions);
  report.before.candidateCounts.full = fullCandidates.length;
  report.before.candidateCounts.preview = previewCandidates.length;
  report.before.remainingLegacyAssetsWithoutPublicUrl = fullCandidates.length + previewCandidates.length;

  const selectedTargets = chooseMixedCandidates(fullCandidates, previewCandidates, MAX_ASSETS);

  report.selection.totalSelected = selectedTargets.length;
  report.selection.fullSelected = selectedTargets.filter((target) => target.kind === 'full').length;
  report.selection.previewSelected = selectedTargets.filter((target) => target.kind === 'preview').length;
  report.selection.selectedTargets = selectedTargets;

  if (selectedTargets.length === 0) {
    report.after = {
      ...report.after,
      liveApiResponseBytes: beforeLive.headerBytes,
      transferredBase64Bytes: beforeLive.transferredBase64Bytes,
      exhibitionCount: report.before.exhibitionCount,
      totalInventoryItems: report.before.totalInventoryItems,
      totalPublicReferences: report.before.totalPublicReferences,
      remainingLegacyAssetsWithoutPublicUrl: 0,
      batchByteReduction: 0,
      reductionFromOriginalBaselineBytes: ORIGINAL_BASELINE_BYTES - beforeLive.headerBytes,
      reductionFromOriginalBaselinePercent: Number((((ORIGINAL_BASELINE_BYTES - beforeLive.headerBytes) / ORIGINAL_BASELINE_BYTES) * 100).toFixed(4)),
      reductionFromPreFinalBaselineBytes: PRE_FINAL_BASELINE_BYTES - beforeLive.headerBytes,
      reductionFromPreFinalBaselinePercent: Number((((PRE_FINAL_BASELINE_BYTES - beforeLive.headerBytes) / PRE_FINAL_BASELINE_BYTES) * 100).toFixed(4))
    };
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const working = cloneJson(beforeExhibitions, []);

  for (const target of selectedTargets) {
    const exhibition = findExhibition(working, target.exhibitionId);
    const item = findItem(exhibition, target.field, target.itemId);

    if (!item) {
      handleUnexpectedError(report, `Target item missing in working state: ${target.exhibitionId}/${target.field}/${target.itemId}`);
    }

    const dataValue = t(item[target.dataField]);
    const existingUrl = t(item[target.urlField]);

    if (isPublicBlobUrl(existingUrl)) {
      report.errors.push(`Skipped already-public target: ${target.exhibitionId}/${target.field}/${target.itemId}/${target.kind}`);
      continue;
    }

    if (isHttpUrl(existingUrl)) {
      report.errors.push(`Skipped existing HTTP URL target to avoid overwrite: ${target.exhibitionId}/${target.field}/${target.itemId}/${target.kind}`);
      continue;
    }

    report.counters.attempted += 1;
    if (target.kind === 'full') report.counters.fullAttempted += 1;
    if (target.kind === 'preview') report.counters.previewAttempted += 1;

    if (!isDataUrl(dataValue)) {
      handleUnexpectedError(report, `Missing data URL at migration time: ${target.exhibitionId}/${target.field}/${target.itemId}/${target.kind}`);
    }

    const parsed = parseDataUrl(dataValue);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      handleUnexpectedError(report, `Failed to parse data URL: ${target.exhibitionId}/${target.field}/${target.itemId}/${target.kind}`);
    }

    const digest = createHash('sha1').update(parsed.buffer).digest('hex').slice(0, 16);
    const ext = extFromMime(parsed.mimeType);
    const path = `exhibition-images/${target.exhibitionId}/${target.kind}/public-final-${target.itemId}-${digest}.${ext}`;

    let uploaded = null;
    try {
      uploaded = await putBlob(path, parsed.buffer, parsed.mimeType, token);
    } catch (error) {
      report.counters.failed += 1;
      report.validations.uploadFailed.push({
        target,
        stage: 'upload',
        message: error.message || String(error)
      });
      continue;
    }

    const uploadedUrl = t(uploaded?.url);
    const uploadedPath = t(uploaded?.pathname) || path;

    const publicCheck = await validatePublicUrl(uploadedUrl);

    const uploadRecord = {
      target,
      dataField: target.dataField,
      urlField: target.urlField,
      pathField: target.pathField,
      uploadedUrl,
      uploadedPath,
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      beforeBase64Hash: hashText(dataValue),
      beforeBase64Length: dataValue.length,
      urlCheck: publicCheck,
      persisted: false
    };

    report.uploads.push(uploadRecord);
    report.validations.uploadSucceeded.push({
      target,
      ok: Boolean(uploadedUrl)
    });
    report.validations.publicBlobDelivery.push({
      target,
      url: uploadedUrl,
      isPublicBlobUrl: isPublicBlobUrl(uploadedUrl)
    });
    report.validations.unauthGet200.push({
      target,
      status: publicCheck.status,
      ok: publicCheck.ok
    });
    report.validations.imageContentType.push({
      target,
      contentType: publicCheck.contentType,
      isImage: publicCheck.isImage
    });

    if (!uploadedUrl || !isPublicBlobUrl(uploadedUrl) || !publicCheck.ok || !publicCheck.isImage) {
      report.counters.failed += 1;
      report.validations.uploadFailed.push({
        target,
        stage: 'validate',
        status: publicCheck.status,
        contentType: publicCheck.contentType,
        isImage: publicCheck.isImage,
        uploadedUrl
      });
      continue;
    }

    item[target.urlField] = uploadedUrl;
    item[target.pathField] = uploadedPath;
    uploadRecord.persisted = true;

    report.touchedRecords.push({
      exhibitionId: target.exhibitionId,
      field: target.field,
      itemId: target.itemId,
      kind: target.kind,
      dataField: target.dataField,
      urlField: target.urlField,
      pathField: target.pathField,
      itemTitle: target.itemTitle,
      manualNumber: target.manualNumber
    });

    report.counters.succeeded += 1;
    if (target.kind === 'full') report.counters.fullSucceeded += 1;
    if (target.kind === 'preview') report.counters.previewSucceeded += 1;
  }

  if (report.touchedRecords.length > 0) {
    await setStateValue('exhibitions', working);
    report.counters.writesPerformed = 1;
  }

  const afterMeta = await getStateMetaMap(['exhibitions']);
  report.after.stateUpdatedAt = afterMeta?.exhibitions?.updatedAt || null;

  const afterMap = await getStateMap(['exhibitions']);
  const afterExhibitions = Array.isArray(afterMap?.exhibitions) ? afterMap.exhibitions : [];
  report.after.exhibitionCount = afterExhibitions.length;
  report.after.totalInventoryItems = countInventoryItems(afterExhibitions);
  report.after.totalPublicReferences = countPublicReferences(afterExhibitions).total;

  const afterCandidates = buildCandidates(afterExhibitions);
  report.after.remainingLegacyAssetsWithoutPublicUrl = afterCandidates.fullCandidates.length + afterCandidates.previewCandidates.length;

  const changedPaths = [];
  collectDiffPaths(beforeExhibitions, afterExhibitions, '', changedPaths, 2000);

  const allowedPathTokens = ['photoUrl', 'photoPath', 'photoPreviewUrl', 'photoPreviewPath'];
  const unexpectedPaths = changedPaths.filter((path) => !allowedPathTokens.some((tokenPart) => path.includes(tokenPart)));

  report.validations.noUnexpectedFieldChanges = {
    changedPathCount: changedPaths.length,
    unexpectedPathCount: unexpectedPaths.length,
    unexpectedPathsSample: unexpectedPaths.slice(0, 100)
  };

  const beforeItemCount = countInventoryItems(beforeExhibitions);
  const afterItemCount = countInventoryItems(afterExhibitions);
  report.validations.noDeletions = {
    beforeItemCount,
    afterItemCount,
    deletedItems: beforeItemCount - afterItemCount,
    noDeletion: beforeItemCount === afterItemCount
  };

  const transferSafe = buildTransferSafeExhibitions(afterExhibitions);

  let removedLegacyBase64 = 0;
  const modifiedRecordKeys = new Set();

  for (const touched of report.touchedRecords) {
    modifiedRecordKeys.add(`${touched.exhibitionId}:${touched.field}:${touched.itemId}`);

    const beforeExhibition = findExhibition(beforeExhibitions, touched.exhibitionId);
    const afterExhibition = findExhibition(afterExhibitions, touched.exhibitionId);
    const safeExhibition = findExhibition(transferSafe.exhibitions, touched.exhibitionId);

    const beforeItem = findItem(beforeExhibition, touched.field, touched.itemId);
    const afterItem = findItem(afterExhibition, touched.field, touched.itemId);
    const safeItem = findItem(safeExhibition, touched.field, touched.itemId);

    const beforeBase64 = t(beforeItem?.[touched.dataField]);
    const afterBase64 = t(afterItem?.[touched.dataField]);
    const safeBase64 = t(safeItem?.[touched.dataField]);

    if (!afterBase64) {
      removedLegacyBase64 += 1;
    }

    report.validations.base64Retained.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      kind: touched.kind,
      dataField: touched.dataField,
      beforeLength: beforeBase64.length,
      afterLength: afterBase64.length,
      unchanged: beforeBase64 === afterBase64,
      beforeHash: hashText(beforeBase64),
      afterHash: hashText(afterBase64)
    });

    const afterUrl = t(afterItem?.[touched.urlField]);
    report.validations.transferSafeOmitWhenPublicUrlConfirmed.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      kind: touched.kind,
      urlField: touched.urlField,
      urlIsPublic: isPublicBlobUrl(afterUrl),
      rawBase64Length: afterBase64.length,
      transferSafeBase64Length: safeBase64.length,
      omittedInTransferSafe: safeBase64.length === 0
    });

    const certDiff = CERTIFICATE_CRITICAL_FIELDS.filter((field) => {
      return JSON.stringify(beforeItem?.[field]) !== JSON.stringify(afterItem?.[field]);
    });

    report.validations.certificateCriticalUnchanged.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      changedFields: certDiff
    });
  }

  report.counters.productionRecordsModified = modifiedRecordKeys.size;
  report.counters.legacyBase64FieldsRemoved = removedLegacyBase64;
  report.counters.deletionsPerformed = 0;
  report.counters.blobDeletionsPerformed = 0;

  const afterLive = await getLiveStateBytes();
  report.after.liveApiResponseBytes = afterLive.headerBytes;
  report.after.transferredBase64Bytes = afterLive.transferredBase64Bytes;
  report.after.batchByteReduction = beforeLive.headerBytes - afterLive.headerBytes;
  report.after.reductionFromOriginalBaselineBytes = ORIGINAL_BASELINE_BYTES - afterLive.headerBytes;
  report.after.reductionFromOriginalBaselinePercent = Number((((ORIGINAL_BASELINE_BYTES - afterLive.headerBytes) / ORIGINAL_BASELINE_BYTES) * 100).toFixed(4));
  report.after.reductionFromPreFinalBaselineBytes = PRE_FINAL_BASELINE_BYTES - afterLive.headerBytes;
  report.after.reductionFromPreFinalBaselinePercent = Number((((PRE_FINAL_BASELINE_BYTES - afterLive.headerBytes) / PRE_FINAL_BASELINE_BYTES) * 100).toFixed(4));

  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  const failure = {
    ok: false,
    error: error.message || String(error),
    finishedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(failure, null, 2));
  } catch (_) {
    // ignore
  }

  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
