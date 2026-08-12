const { createHash } = require('crypto');
const { getStateMap, setStateValue } = require('../api/_lib/state-store');

const REPORT_PATH = 'tmp/real-migration-smoke-test-report.json';

// Fixed tiny representative set from live data scan.
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

async function putBlob(path, payload, mimeType) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const apiUrl = `https://blob.vercel-storage.com/?pathname=${encodeURIComponent(path)}`;
  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'x-api-version': '9',
      'x-vercel-blob-access': 'private',
      'x-content-type': mimeType,
      'x-add-random-suffix': '0',
      'x-content-length': String(payload.length)
    },
    body: payload
  });

  const textBody = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(textBody);
  } catch (error) {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed ? JSON.stringify(parsed) : textBody;
    throw new Error(`Blob upload failed (${response.status}): ${detail}`);
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.url) {
    throw new Error(`Blob upload response missing url: ${textBody}`);
  }

  return parsed;
}

async function validateUrl(url) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const response = await fetch(url, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  }

  const report = {
    startedAt: new Date().toISOString(),
    mode: 'REAL_MIGRATION_SMOKE_TEST',
    maxAssets: 3,
    targets: TARGETS,
    uploads: [],
    touchedRecords: [],
    validations: {
      urlRetrieval: [],
      base64Retained: [],
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
    const path = `exhibition-images/${target.exhibitionId}/${target.kind}/manual-smoke-${target.itemId}-${digest}.${ext}`;

    const uploaded = await putBlob(path, parsed.buffer, parsed.mimeType);
    const uploadedUrl = uploaded.url;
    const uploadedPath = uploaded.pathname || path;

    const fetchCheck = await validateUrl(uploaded.downloadUrl || uploadedUrl);

    report.uploads.push({
      target,
      dataField,
      urlField,
      pathField,
      uploadedUrl,
      uploadedPath,
      downloadUrl: uploaded.downloadUrl || '',
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      urlCheck: fetchCheck,
      beforeBase64Hash: hashText(dataValue),
      beforeBase64Length: dataValue.length
    });

    if (!fetchCheck.ok || !fetchCheck.isImage) {
      report.errors.push(`Uploaded URL validation failed for ${target.label}: status=${fetchCheck.status} contentType=${fetchCheck.contentType}`);
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

  const afterMap = await getStateMap(['exhibitions']);
  const afterExhibitions = Array.isArray(afterMap.exhibitions) ? afterMap.exhibitions : [];

  const changedPaths = [];
  collectDiffPaths(beforeExhibitions, afterExhibitions, '', changedPaths, 800);

  const allowedPathTokens = ['photoUrl', 'photoPath', 'photoPreviewUrl', 'photoPreviewPath'];
  const unexpected = changedPaths.filter((path) => !allowedPathTokens.some((token) => path.includes(token)));

  report.validations.noUnexpectedFieldChanges = {
    changedPathCount: changedPaths.length,
    unexpectedPathCount: unexpected.length,
    unexpectedPathsSample: unexpected.slice(0, 50)
  };

  const touchedUnique = new Set();
  let removedLegacy = 0;

  for (const touched of report.touchedRecords) {
    touchedUnique.add(`${touched.exhibitionId}:${touched.field}:${touched.itemId}`);

    const beforeEx = findExhibition(beforeExhibitions, touched.exhibitionId);
    const afterEx = findExhibition(afterExhibitions, touched.exhibitionId);
    const beforeItem = findItem(beforeEx, touched.field, touched.itemId);
    const afterItem = findItem(afterEx, touched.field, touched.itemId);

    const beforeBase64 = t(beforeItem?.[touched.dataField]);
    const afterBase64 = t(afterItem?.[touched.dataField]);

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
    const urlCheck = await validateUrl(urlValue);
    report.validations.urlRetrieval.push({
      exhibitionId: touched.exhibitionId,
      field: touched.field,
      itemId: touched.itemId,
      urlField: touched.urlField,
      url: urlValue,
      status: urlCheck.status,
      ok: urlCheck.ok,
      contentType: urlCheck.contentType,
      isImage: urlCheck.isImage
    });
  }

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
