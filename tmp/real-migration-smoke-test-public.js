const { createHash } = require('crypto');
const { put } = require('@vercel/blob');
const { getStateMap, setStateValue, getStateMetaMap } = require('../api/_lib/state-store');
const { buildTransferSafeExhibitions } = require('../api/_lib/exhibition-image-refs');

const REPORT_PATH = 'tmp/real-migration-smoke-test-public-report.json';

const TARGETS = [
  {
    kind: 'full',
    exhibitionId: 1785595618294,
    field: 'works',
    itemId: 1785595631924,
    label: 'test / works / A1 / 2 Vases'
  },
  {
    kind: 'preview',
    exhibitionId: 1785642780070,
    field: 'works',
    itemId: 1785732777057,
    label: '그냥 예술하라, 고양이처럼5 / works / A1 / 나의 집'
  },
  {
    kind: 'preview',
    exhibitionId: 1785642780070,
    field: 'works',
    itemId: 1785732855044,
    label: '그냥 예술하라, 고양이처럼5 / works / A2 / 영감의 순간'
  }
];

function t(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isHttpUrl(v) {
  const s = t(v).toLowerCase();
  return s.startsWith('http://') || s.startsWith('https://');
}

function isPublicBlobUrl(v) {
  return t(v).toLowerCase().includes('.public.blob.vercel-storage.com/');
}

function isDataUrl(v) {
  return /^data:[^;]+;base64,/i.test(t(v));
}

function parseDataUrl(dataUrl) {
  const source = t(dataUrl);
  const m = source.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;

  try {
    return {
      mimeType: String(m[1] || 'application/octet-stream').toLowerCase(),
      buffer: Buffer.from(m[2], 'base64'),
      raw: source
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

function hashText(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex');
}

function findExhibition(exhibitions, exhibitionId) {
  return exhibitions.find((ex) => Number(ex?.id) === Number(exhibitionId));
}

function findItem(exhibition, field, itemId) {
  const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
  return list.find((item) => Number(item?.id) === Number(itemId));
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

async function putBlob(path, payload, mimeType, token) {
  return put(path, payload, {
    token,
    access: 'public',
    contentType: mimeType
  });
}

async function validateUrlUnauth(url) {
  const response = await fetch(url, { method: 'GET' });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    isImage: contentType.startsWith('image/')
  };
}

function collectDiffPaths(before, after, basePath, out, limit = 400) {
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

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
  }

  const token = process.env.EXHIBITION_IMAGE_READ_WRITE_TOKEN
    || process.env.EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN
    || '';
  if (!token) {
    throw new Error('Missing EXHIBITION_IMAGE_READ_WRITE_TOKEN');
  }

  const report = {
    startedAt: new Date().toISOString(),
    mode: 'REAL_PUBLIC_MIGRATION_SMOKE_TEST',
    maxAssets: 3,
    targets: TARGETS,
    uploads: [],
    touchedRecords: [],
    validations: {
      uploadSucceeded: [],
      publicBlobDelivery: [],
      unauthGet200: [],
      imageContentType: [],
      previewDisplaysNormallyHeuristic: [],
      fullDisplaysNormallyHeuristic: [],
      pageRefreshDisplaysHeuristic: [],
      editingSavingWorksHeuristic: null,
      base64Retained: [],
      transferSafeOmitWhenPublicUrlConfirmed: [],
      noUnexpectedFieldChanges: null,
      certificateCriticalUnchanged: []
    },
    counters: {
      uploadsPerformed: 0,
      productionRecordsModified: 0,
      deletionsPerformed: 0,
      legacyBase64FieldsRemoved: 0,
      overwriteOperationsPerformed: 0,
      writesPerformed: 0
    },
    errors: []
  };

  const beforeMeta = await getStateMetaMap(['exhibitions']);
  const beforeUpdatedAt = beforeMeta?.exhibitions?.updatedAt || null;

  const beforeMap = await getStateMap(['exhibitions']);
  const beforeExhibitions = Array.isArray(beforeMap.exhibitions) ? beforeMap.exhibitions : [];
  const working = cloneJson(beforeExhibitions, []);

  for (const target of TARGETS) {
    const exhibition = findExhibition(working, target.exhibitionId);
    if (!exhibition) {
      report.errors.push(`Exhibition not found: ${target.exhibitionId}`);
      continue;
    }

    const item = findItem(exhibition, target.field, target.itemId);
    if (!item) {
      report.errors.push(`Item not found: ex=${target.exhibitionId} field=${target.field} item=${target.itemId}`);
      continue;
    }

    const dataField = target.kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
    const urlField = target.kind === 'full' ? 'photoUrl' : 'photoPreviewUrl';
    const pathField = target.kind === 'full' ? 'photoPath' : 'photoPreviewPath';

    const dataValue = t(item[dataField]);
    const existingUrl = t(item[urlField]);

    if (existingUrl && isHttpUrl(existingUrl)) {
      report.errors.push(`URL already exists for target ${target.label}; skipped.`);
      continue;
    }

    if (!isDataUrl(dataValue)) {
      report.errors.push(`Missing valid data URL for target ${target.label}; skipped.`);
      continue;
    }

    const parsed = parseDataUrl(dataValue);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      report.errors.push(`Failed to parse data URL for target ${target.label}; skipped.`);
      continue;
    }

    const digest = createHash('sha1').update(parsed.buffer).digest('hex').slice(0, 16);
    const ext = extFromMime(parsed.mimeType);
    const path = `exhibition-images/${target.exhibitionId}/${target.kind}/public-smoke-${target.itemId}-${digest}.${ext}`;

    const uploaded = await putBlob(path, parsed.buffer, parsed.mimeType, token);
    const uploadedUrl = uploaded.url;
    const uploadedPath = uploaded.pathname || path;

    const fetchCheck = await validateUrlUnauth(uploadedUrl);

    report.uploads.push({
      target,
      dataField,
      urlField,
      pathField,
      uploadedUrl,
      uploadedPath,
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      urlCheck: fetchCheck,
      beforeBase64Hash: hashText(dataValue),
      beforeBase64Length: dataValue.length
    });

    report.validations.uploadSucceeded.push({
      target: target.label,
      ok: Boolean(uploadedUrl)
    });
    report.validations.publicBlobDelivery.push({
      target: target.label,
      url: uploadedUrl,
      isPublicBlobUrl: isPublicBlobUrl(uploadedUrl)
    });
    report.validations.unauthGet200.push({
      target: target.label,
      status: fetchCheck.status,
      ok: fetchCheck.ok
    });
    report.validations.imageContentType.push({
      target: target.label,
      contentType: fetchCheck.contentType,
      isImage: fetchCheck.isImage
    });

    if (!fetchCheck.ok || !fetchCheck.isImage || !isPublicBlobUrl(uploadedUrl)) {
      report.errors.push(`Public URL validation failed for ${target.label}: status=${fetchCheck.status} contentType=${fetchCheck.contentType}`);
      continue;
    }

    item[urlField] = uploadedUrl;
    item[pathField] = uploadedPath;

    report.touchedRecords.push({
      exhibitionId: target.exhibitionId,
      field: target.field,
      itemId: target.itemId,
      kind: target.kind,
      label: target.label,
      urlField,
      pathField,
      dataField
    });

    if (report.touchedRecords.length >= 3) {
      break;
    }
  }

  if (report.touchedRecords.length === 0) {
    throw new Error('No assets were migrated in smoke test.');
  }

  await setStateValue('exhibitions', working);
  report.counters.writesPerformed = 1;

  const afterMeta = await getStateMetaMap(['exhibitions']);
  const afterUpdatedAt = afterMeta?.exhibitions?.updatedAt || null;

  const afterMap = await getStateMap(['exhibitions']);
  const afterExhibitions = Array.isArray(afterMap.exhibitions) ? afterMap.exhibitions : [];

  const changedPaths = [];
  collectDiffPaths(beforeExhibitions, afterExhibitions, '', changedPaths, 800);

  const allowedPathTokens = ['photoUrl', 'photoPath', 'photoPreviewUrl', 'photoPreviewPath'];
  const unexpected = changedPaths.filter((path) => !allowedPathTokens.some((tokenPart) => path.includes(tokenPart)));

  report.validations.noUnexpectedFieldChanges = {
    changedPathCount: changedPaths.length,
    unexpectedPathCount: unexpected.length,
    unexpectedPathsSample: unexpected.slice(0, 50)
  };

  const transferSafeAfter = buildTransferSafeExhibitions(afterExhibitions);

  const touchedUnique = new Set();
  let removedLegacy = 0;

  for (const touched of report.touchedRecords) {
    touchedUnique.add(`${touched.exhibitionId}:${touched.field}:${touched.itemId}`);

    const beforeEx = findExhibition(beforeExhibitions, touched.exhibitionId);
    const afterEx = findExhibition(afterExhibitions, touched.exhibitionId);
    const safeEx = findExhibition(transferSafeAfter.exhibitions, touched.exhibitionId);
    const beforeItem = findItem(beforeEx, touched.field, touched.itemId);
    const afterItem = findItem(afterEx, touched.field, touched.itemId);
    const safeItem = findItem(safeEx, touched.field, touched.itemId);

    const beforeBase64 = t(beforeItem?.[touched.dataField]);
    const afterBase64 = t(afterItem?.[touched.dataField]);
    const safeBase64 = t(safeItem?.[touched.dataField]);

    if (!afterBase64) {
      removedLegacy += 1;
    }

    report.validations.base64Retained.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      dataField: touched.dataField,
      beforeLength: beforeBase64.length,
      afterLength: afterBase64.length,
      unchanged: beforeBase64 === afterBase64,
      beforeHash: hashText(beforeBase64),
      afterHash: hashText(afterBase64)
    });

    const certFields = ['title', 'manualNumber', 'author', 'price', 'size', 'year'];
    const certDiff = certFields.filter((f) => JSON.stringify(beforeItem?.[f]) !== JSON.stringify(afterItem?.[f]));
    report.validations.certificateCriticalUnchanged.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      changedFields: certDiff
    });

    const urlValue = t(afterItem?.[touched.urlField]);
    const urlCheck = await validateUrlUnauth(urlValue);

    report.validations.previewDisplaysNormallyHeuristic.push({
      exhibitionId: touched.exhibitionId,
      itemId: touched.itemId,
      kind: touched.kind,
      ok: touched.kind === 'preview' ? (urlCheck.ok && urlCheck.isImage) : true
    });
    report.validations.fullDisplaysNormallyHeuristic.push({
      exhibitionId: touched.exhibitionId,
      itemId: touched.itemId,
      kind: touched.kind,
      ok: touched.kind === 'full' ? (urlCheck.ok && urlCheck.isImage) : true
    });

    report.validations.transferSafeOmitWhenPublicUrlConfirmed.push({
      exhibitionId: touched.exhibitionId,
      itemId: touched.itemId,
      urlField: touched.urlField,
      urlIsPublic: isPublicBlobUrl(urlValue),
      rawBase64Length: afterBase64.length,
      transferSafeBase64Length: safeBase64.length,
      omittedInTransferSafe: safeBase64.length === 0
    });
  }

  const refreshedMap = await getStateMap(['exhibitions']);
  const refreshedExhibitions = Array.isArray(refreshedMap.exhibitions) ? refreshedMap.exhibitions : [];
  report.validations.pageRefreshDisplaysHeuristic = report.touchedRecords.map((touched) => {
    const refreshedEx = findExhibition(refreshedExhibitions, touched.exhibitionId);
    const refreshedItem = findItem(refreshedEx, touched.field, touched.itemId);
    const url = t(refreshedItem?.[touched.urlField]);
    return {
      exhibitionId: touched.exhibitionId,
      itemId: touched.itemId,
      urlPresentAfterRefreshRead: Boolean(url)
    };
  });

  report.validations.editingSavingWorksHeuristic = {
    beforeUpdatedAt,
    afterUpdatedAt,
    updatedAtChanged: beforeUpdatedAt !== afterUpdatedAt,
    note: 'Server-side state write completed and persisted; UI save interaction was not directly automated in this script.'
  };

  report.counters.uploadsPerformed = report.uploads.length;
  report.counters.productionRecordsModified = touchedUnique.size;
  report.counters.legacyBase64FieldsRemoved = removedLegacy;
  report.counters.deletionsPerformed = 0;
  report.counters.overwriteOperationsPerformed = 0;

  report.finishedAt = new Date().toISOString();

  require('fs').writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  const failure = {
    ok: false,
    error: error.message || String(error)
  };
  try {
    require('fs').writeFileSync(REPORT_PATH, JSON.stringify(failure, null, 2));
  } catch (_) {
    // ignore
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
