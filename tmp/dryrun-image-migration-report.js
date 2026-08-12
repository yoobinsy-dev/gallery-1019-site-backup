const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const IMAGE_FIELDS = ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'];
const REPORT_PATH = path.join(process.cwd(), 'tmp', 'dryrun-image-migration-report.json');
const INPUT_JSON_PATH = process.env.DRYRUN_INPUT_JSON || '';

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isHttpUrl(v) {
  const s = text(v).toLowerCase();
  return s.startsWith('http://') || s.startsWith('https://');
}

function isDataUrl(v) {
  return /^data:[^;]+;base64,/i.test(text(v));
}

function parseDataUrl(v) {
  const s = text(v);
  const m = s.match(/^data:([^;]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!m) return { ok: false, reason: 'malformed-data-url' };

  const mimeType = String(m[1] || '').toLowerCase();
  const b64 = String(m[2] || '').replace(/\s+/g, '');
  if (!b64) return { ok: false, reason: 'empty-base64' };
  if (!/^[a-z0-9+/=]+$/i.test(b64)) return { ok: false, reason: 'invalid-base64-charset' };

  const padding = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
  const decodedBytes = Math.max(0, Math.floor((b64.length * 3) / 4) - padding);

  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf || buf.length === 0) return { ok: false, reason: 'base64-decode-empty' };
  } catch (error) {
    return { ok: false, reason: 'base64-decode-failed' };
  }

  return {
    ok: true,
    mimeType,
    base64Length: b64.length,
    dataUrlLength: s.length,
    decodedBytes,
    hash: crypto.createHash('sha1').update(b64).digest('hex')
  };
}

function toExt(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  return 'bin';
}

function getIdentity(item, exIndex, field, itemIndex) {
  const id = Number(item?.id);
  if (Number.isFinite(id) && id > 0) return `id-${id}`;

  const workId = Number(item?.workId);
  if (Number.isFinite(workId) && workId > 0) return `work-${workId}`;

  const manual = text(item?.manualNumber).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const title = text(item?.title).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (manual || title) return `manual-${manual || 'none'}-title-${title || 'none'}`;

  return `idx-${exIndex}-${field}-${itemIndex}`;
}

function getExhibitionKey(ex, exIndex) {
  const id = Number(ex?.id);
  if (Number.isFinite(id) && id > 0) return `ex:${id}`;
  return `ex-index:${exIndex}`;
}

function cloneJson(value, fallback) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}

function normalizeReferenceFields(item) {
  if (!item || typeof item !== 'object') return;

  const photoUrl = text(item.photoUrl);
  const previewUrl = text(item.photoPreviewUrl);
  const photoDataUrl = text(item.photoDataUrl);
  const previewDataUrl = text(item.photoPreviewDataUrl);

  if (!photoUrl && isHttpUrl(photoDataUrl)) item.photoUrl = photoDataUrl;
  if (!previewUrl && isHttpUrl(previewDataUrl)) item.photoPreviewUrl = previewDataUrl;
}

function transferSafeStrip(item) {
  if (!item || typeof item !== 'object') return;

  const photoUrl = text(item.photoUrl);
  const previewUrl = text(item.photoPreviewUrl);

  if (photoUrl && isDataUrl(item.photoDataUrl)) item.photoDataUrl = '';
  if (previewUrl && isDataUrl(item.photoPreviewDataUrl)) item.photoPreviewDataUrl = '';
}

function simulateCurrentTransferSafe(exhibitions) {
  const cloned = cloneJson(Array.isArray(exhibitions) ? exhibitions : [], []);
  cloned.forEach((ex) => {
    if (!ex || typeof ex !== 'object') return;
    IMAGE_FIELDS.forEach((field) => {
      const list = ex[field];
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        normalizeReferenceFields(item);
        transferSafeStrip(item);
      });
    });
  });
  return cloned;
}

function simulatePostMigrationTransferSafe(exhibitions) {
  const cloned = cloneJson(Array.isArray(exhibitions) ? exhibitions : [], []);
  cloned.forEach((ex, exIndex) => {
    if (!ex || typeof ex !== 'object') return;
    const exIdNum = Number(ex.id);
    const exId = Number.isFinite(exIdNum) && exIdNum > 0 ? String(exIdNum) : 'unknown';

    IMAGE_FIELDS.forEach((field) => {
      const list = ex[field];
      if (!Array.isArray(list)) return;

      list.forEach((item, itemIndex) => {
        if (!item || typeof item !== 'object') return;

        normalizeReferenceFields(item);

        const identity = getIdentity(item, exIndex, field, itemIndex);
        const fullUrl = text(item.photoUrl);
        const previewUrl = text(item.photoPreviewUrl);

        const fullParsed = parseDataUrl(item.photoDataUrl);
        if (!fullUrl && fullParsed.ok) {
          const ext = toExt(fullParsed.mimeType);
          const digest = fullParsed.hash.slice(0, 16);
          item.photoUrl = `https://blob.example.com/exhibition-images/${exId}/full/${identity}-${digest}.${ext}`;
        }

        const previewParsed = parseDataUrl(item.photoPreviewDataUrl);
        if (!previewUrl && previewParsed.ok) {
          const ext = toExt(previewParsed.mimeType);
          const digest = previewParsed.hash.slice(0, 16);
          item.photoPreviewUrl = `https://blob.example.com/exhibition-images/${exId}/preview/${identity}-${digest}.${ext}`;
        }

        transferSafeStrip(item);
      });
    });
  });
  return cloned;
}

(async () => {
  const useOfflineInput = Boolean(INPUT_JSON_PATH);
  const client = useOfflineInput
    ? null
    : new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

  const report = {
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    source: 'production-db-read-only',
    metrics: {},
    cannotMigrateSafely: [],
    unusualRecords: [],
    duplicateImages: {
      full: [],
      preview: []
    },
    confirmation: {
      productionDataChanged: false,
      writesPerformed: 0,
      uploadsPerformed: 0,
      deleteOperationsPerformed: 0,
      overwriteOperationsPerformed: 0
    }
  };

  const maxDetails = 250;

  const duplicateFullMap = new Map();
  const duplicatePreviewMap = new Map();

  const exWithPhotoDataUrl = new Set();
  const exWithPhotoPreviewDataUrl = new Set();
  const exWithPhotoUrl = new Set();
  const exWithPhotoPreviewUrl = new Set();

  let itemsNeedFullMigration = 0;
  let itemsNeedPreviewMigration = 0;

  let totalBase64DecodedBytes = 0;
  let totalBase64DataUrlChars = 0;

  try {
    let stateUpdatedAt = null;
    let exhibitions = [];

    if (useOfflineInput) {
      const resolvedPath = path.isAbsolute(INPUT_JSON_PATH)
        ? INPUT_JSON_PATH
        : path.join(process.cwd(), INPUT_JSON_PATH);
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      exhibitions = Array.isArray(parsed) ? parsed : [];
      report.source = 'offline-json-snapshot';
      report.inputSnapshotPath = resolvedPath;
    } else {
      await client.connect();
      const row = await client.query("SELECT state_value, updated_at FROM app_state WHERE state_key='exhibitions'");
      const stateValue = row.rows[0]?.state_value;
      stateUpdatedAt = row.rows[0]?.updated_at ? new Date(row.rows[0].updated_at).toISOString() : null;
      exhibitions = Array.isArray(stateValue) ? stateValue : [];
    }

    report.metrics.stateUpdatedAt = stateUpdatedAt;
    report.metrics.totalExhibitionsExamined = exhibitions.length;

    exhibitions.forEach((ex, exIndex) => {
      const exKey = getExhibitionKey(ex, exIndex);

      IMAGE_FIELDS.forEach((field) => {
        const list = Array.isArray(ex?.[field]) ? ex[field] : [];

        list.forEach((item, itemIndex) => {
          if (!item || typeof item !== 'object') return;

          const itemRef = {
            exhibitionId: Number.isFinite(Number(ex?.id)) ? Number(ex.id) : null,
            exhibitionTitle: text(ex?.title).slice(0, 120),
            exhibitionIndex: exIndex,
            field,
            itemIndex,
            itemId: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
            workId: Number.isFinite(Number(item?.workId)) ? Number(item.workId) : null,
            manualNumber: text(item?.manualNumber),
            title: text(item?.title).slice(0, 120)
          };

          const fullUrl = text(item.photoUrl);
          const previewUrl = text(item.photoPreviewUrl);
          const fullData = text(item.photoDataUrl);
          const previewData = text(item.photoPreviewDataUrl);

          if (fullData) exWithPhotoDataUrl.add(exKey);
          if (previewData) exWithPhotoPreviewDataUrl.add(exKey);
          if (fullUrl) exWithPhotoUrl.add(exKey);
          if (previewUrl) exWithPhotoPreviewUrl.add(exKey);

          if (fullData) {
            if (isDataUrl(fullData)) {
              const parsed = parseDataUrl(fullData);
              if (parsed.ok) {
                totalBase64DecodedBytes += parsed.decodedBytes;
                totalBase64DataUrlChars += parsed.dataUrlLength;

                if (!duplicateFullMap.has(parsed.hash)) duplicateFullMap.set(parsed.hash, []);
                duplicateFullMap.get(parsed.hash).push(itemRef);
              } else if (report.cannotMigrateSafely.length < maxDetails) {
                report.cannotMigrateSafely.push({
                  ...itemRef,
                  kind: 'full',
                  reason: parsed.reason
                });
              }
            } else if (isHttpUrl(fullData)) {
              if (report.unusualRecords.length < maxDetails) {
                report.unusualRecords.push({
                  ...itemRef,
                  kind: 'full',
                  reason: 'photoDataUrl-contains-http-url'
                });
              }
            } else if (report.cannotMigrateSafely.length < maxDetails) {
              report.cannotMigrateSafely.push({
                ...itemRef,
                kind: 'full',
                reason: 'photoDataUrl-non-data-non-http-string'
              });
            }
          }

          if (previewData) {
            if (isDataUrl(previewData)) {
              const parsed = parseDataUrl(previewData);
              if (parsed.ok) {
                totalBase64DecodedBytes += parsed.decodedBytes;
                totalBase64DataUrlChars += parsed.dataUrlLength;

                if (!duplicatePreviewMap.has(parsed.hash)) duplicatePreviewMap.set(parsed.hash, []);
                duplicatePreviewMap.get(parsed.hash).push(itemRef);
              } else if (report.cannotMigrateSafely.length < maxDetails) {
                report.cannotMigrateSafely.push({
                  ...itemRef,
                  kind: 'preview',
                  reason: parsed.reason
                });
              }
            } else if (isHttpUrl(previewData)) {
              if (report.unusualRecords.length < maxDetails) {
                report.unusualRecords.push({
                  ...itemRef,
                  kind: 'preview',
                  reason: 'photoPreviewDataUrl-contains-http-url'
                });
              }
            } else if (report.cannotMigrateSafely.length < maxDetails) {
              report.cannotMigrateSafely.push({
                ...itemRef,
                kind: 'preview',
                reason: 'photoPreviewDataUrl-non-data-non-http-string'
              });
            }
          }

          if (fullUrl && !isHttpUrl(fullUrl) && report.unusualRecords.length < maxDetails) {
            report.unusualRecords.push({ ...itemRef, kind: 'full', reason: 'photoUrl-non-http-string' });
          }
          if (previewUrl && !isHttpUrl(previewUrl) && report.unusualRecords.length < maxDetails) {
            report.unusualRecords.push({ ...itemRef, kind: 'preview', reason: 'photoPreviewUrl-non-http-string' });
          }

          const fullParsed = parseDataUrl(fullData);
          if (!isHttpUrl(fullUrl) && fullParsed.ok) {
            itemsNeedFullMigration += 1;
          } else if (!isHttpUrl(fullUrl) && fullData && !fullParsed.ok && report.cannotMigrateSafely.length < maxDetails) {
            report.cannotMigrateSafely.push({
              ...itemRef,
              kind: 'full',
              reason: `cannot-migrate-full:${fullParsed.reason}`
            });
          }

          const previewParsed = parseDataUrl(previewData);
          if (!isHttpUrl(previewUrl) && previewParsed.ok) {
            itemsNeedPreviewMigration += 1;
          } else if (!isHttpUrl(previewUrl) && previewData && !previewParsed.ok && report.cannotMigrateSafely.length < maxDetails) {
            report.cannotMigrateSafely.push({
              ...itemRef,
              kind: 'preview',
              reason: `cannot-migrate-preview:${previewParsed.reason}`
            });
          }

          if (fullParsed.ok && previewParsed.ok && fullParsed.hash === previewParsed.hash && report.unusualRecords.length < maxDetails) {
            report.unusualRecords.push({
              ...itemRef,
              kind: 'both',
              reason: 'full-and-preview-base64-identical'
            });
          }

          if (fullParsed.ok && fullParsed.decodedBytes > 10 * 1024 * 1024 && report.unusualRecords.length < maxDetails) {
            report.unusualRecords.push({
              ...itemRef,
              kind: 'full',
              reason: `very-large-full-base64:${fullParsed.decodedBytes}`
            });
          }

          if (previewParsed.ok && previewParsed.decodedBytes > 2 * 1024 * 1024 && report.unusualRecords.length < maxDetails) {
            report.unusualRecords.push({
              ...itemRef,
              kind: 'preview',
              reason: `very-large-preview-base64:${previewParsed.decodedBytes}`
            });
          }
        });
      });
    });

    const currentTransferSafe = simulateCurrentTransferSafe(exhibitions);
    const postMigrationTransferSafe = simulatePostMigrationTransferSafe(exhibitions);

    const currentDataPayloadBytes = Buffer.byteLength(JSON.stringify(currentTransferSafe), 'utf8');
    const postDataPayloadBytes = Buffer.byteLength(JSON.stringify(postMigrationTransferSafe), 'utf8');

    const responseNow = {
      ok: true,
      data: { exhibitions: currentTransferSafe },
      meta: { exhibitions: { updatedAt: stateUpdatedAt } }
    };

    const responseAfter = {
      ok: true,
      data: { exhibitions: postMigrationTransferSafe },
      meta: { exhibitions: { updatedAt: stateUpdatedAt } }
    };

    const responseNowBytes = Buffer.byteLength(JSON.stringify(responseNow), 'utf8');
    const responseAfterBytes = Buffer.byteLength(JSON.stringify(responseAfter), 'utf8');

    report.metrics.exhibitionsContainingPhotoDataUrl = exWithPhotoDataUrl.size;
    report.metrics.exhibitionsContainingPhotoPreviewDataUrl = exWithPhotoPreviewDataUrl.size;
    report.metrics.exhibitionsContainingPhotoUrl = exWithPhotoUrl.size;
    report.metrics.exhibitionsContainingPhotoPreviewUrl = exWithPhotoPreviewUrl.size;

    report.metrics.fullResolutionImagesNeedingMigration = itemsNeedFullMigration;
    report.metrics.previewImagesNeedingMigration = itemsNeedPreviewMigration;

    report.metrics.approxTotalBase64ImageDataBytesDecoded = totalBase64DecodedBytes;
    report.metrics.approxTotalBase64ImageDataMiBDecoded = Number((totalBase64DecodedBytes / (1024 * 1024)).toFixed(2));
    report.metrics.approxTotalBase64DataUrlChars = totalBase64DataUrlChars;

    report.metrics.currentTransferSafeExhibitionsPayloadBytes = currentDataPayloadBytes;
    report.metrics.estimatedPostMigrationTransferSafeExhibitionsPayloadBytes = postDataPayloadBytes;
    report.metrics.estimatedExhibitionsPayloadBytesDisappearing = Math.max(0, currentDataPayloadBytes - postDataPayloadBytes);

    report.metrics.currentApiStateResponseBytesApprox = responseNowBytes;
    report.metrics.estimatedPostMigrationApiStateResponseBytesApprox = responseAfterBytes;
    report.metrics.estimatedApiStateResponseBytesDisappearing = Math.max(0, responseNowBytes - responseAfterBytes);

    for (const [hash, refs] of duplicateFullMap.entries()) {
      if (refs.length > 1) {
        report.duplicateImages.full.push({ hash, count: refs.length, samples: refs.slice(0, 8) });
      }
    }
    for (const [hash, refs] of duplicatePreviewMap.entries()) {
      if (refs.length > 1) {
        report.duplicateImages.preview.push({ hash, count: refs.length, samples: refs.slice(0, 8) });
      }
    }

    report.duplicateImages.full.sort((a, b) => b.count - a.count);
    report.duplicateImages.preview.sort((a, b) => b.count - a.count);

    report.metrics.cannotMigrateSafelyCount = report.cannotMigrateSafely.length;
    report.metrics.unusualRecordCount = report.unusualRecords.length;
    report.metrics.duplicateFullImageGroups = report.duplicateImages.full.length;
    report.metrics.duplicatePreviewImageGroups = report.duplicateImages.preview.length;

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(JSON.stringify({
      ok: true,
      reportPath: REPORT_PATH,
      metrics: report.metrics,
      confirmation: report.confirmation,
      topDuplicateFullGroup: report.duplicateImages.full[0]?.count || 0,
      topDuplicatePreviewGroup: report.duplicateImages.preview[0]?.count || 0
    }, null, 2));
  } catch (error) {
    console.error('DRY_RUN_ANALYSIS_FAILED', error?.message || String(error));
    process.exitCode = 1;
  } finally {
    if (client) {
      try { await client.end(); } catch {}
    }
  }
})();
