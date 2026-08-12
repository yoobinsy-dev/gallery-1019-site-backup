const fs = require('fs');

const report = JSON.parse(fs.readFileSync('tmp/dryrun-image-migration-report.json', 'utf8'));
const headers = fs.readFileSync('tmp/live_state_headers.txt', 'utf8');
const bodyRaw = fs.readFileSync('tmp/live_state_body.json', 'utf8');

let body = null;
try {
  body = JSON.parse(bodyRaw);
} catch (error) {
  body = null;
}

const statusLine = (headers.split(/\r?\n/)[0] || '').trim();
const xStateMatch = headers.match(/(^|\n)x-state-response-bytes:\s*([^\r\n]+)/i);
const contentLengthMatch = headers.match(/(^|\n)content-length:\s*([^\r\n]+)/i);

const currentApprox = Number(report?.metrics?.currentApiStateResponseBytesApprox || 0);
const reducedApprox = Number(report?.metrics?.estimatedPostMigrationApiStateResponseBytesApprox || 0);
const reducedBytes = Math.max(0, currentApprox - reducedApprox);
const reductionPct = currentApprox > 0 ? (reducedBytes / currentApprox) * 100 : 0;

const out = {
  liveApi: {
    statusLine,
    bodyBytesUtf8: Buffer.byteLength(bodyRaw, 'utf8'),
    xStateResponseBytes: xStateMatch ? Number(String(xStateMatch[2]).trim()) : null,
    contentLength: contentLengthMatch ? Number(String(contentLengthMatch[2]).trim()) : null,
    liveExhibitionCount: Array.isArray(body?.data?.exhibitions) ? body.data.exhibitions.length : null
  },
  dryRun: {
    source: report.source,
    generatedAt: report.generatedAt,
    metrics: report.metrics,
    cannotMigrateSafelyCount: Array.isArray(report.cannotMigrateSafely) ? report.cannotMigrateSafely.length : null,
    unusualRecordCount: Array.isArray(report.unusualRecords) ? report.unusualRecords.length : null,
    duplicateFullGroups: report?.duplicateImages?.full?.length ?? null,
    duplicatePreviewGroups: report?.duplicateImages?.preview?.length ?? null,
    topDuplicateFullGroup: report?.duplicateImages?.full?.[0]?.count ?? 0,
    topDuplicatePreviewGroup: report?.duplicateImages?.preview?.[0]?.count ?? 0
  },
  derived: {
    estimatedReductionBytes: reducedBytes,
    estimatedReductionPercent: Number(reductionPct.toFixed(2))
  },
  confirmation: report.confirmation
};

console.log(JSON.stringify(out, null, 2));
