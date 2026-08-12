const fs = require('fs');

const report = JSON.parse(fs.readFileSync('tmp/real-migration-batch3-public-report.json', 'utf8'));
const touched = Array.isArray(report.touchedRecords) ? report.touchedRecords : [];

function t(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDataField(kind) {
  return kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
}

function findItem(exhibitions, target) {
  const exhibition = exhibitions.find((entry) => Number(entry?.id) === Number(target.exhibitionId));
  const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
  return list.find((entry) => Number(entry?.id) === Number(target.itemId)) || null;
}

(async () => {
  const host = t(process.env.VERCEL_URL) || 'gallery-1019-site.vercel.app';
  const base = host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`;

  const response = await fetch(`${base}/api/state?keys=exhibitions`);
  if (!response.ok) {
    throw new Error(`Failed live /api/state read: ${response.status}`);
  }

  const payload = await response.json();
  const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];

  const rows = touched.map((target) => {
    const item = findItem(exhibitions, target);
    const dataField = getDataField(target.kind);
    const dataLen = t(item?.[dataField]).length;
    const urlLen = t(item?.[target.urlField]).length;
    return {
      exhibitionId: target.exhibitionId,
      field: target.field,
      itemId: target.itemId,
      kind: target.kind,
      dataField,
      transferSafeDataLen: dataLen,
      urlPresent: urlLen > 0,
      omitted: dataLen === 0
    };
  });

  console.log(JSON.stringify({
    checked: rows.length,
    omittedCount: rows.filter((row) => row.omitted).length,
    allOmitted: rows.every((row) => row.omitted === true),
    rows
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
