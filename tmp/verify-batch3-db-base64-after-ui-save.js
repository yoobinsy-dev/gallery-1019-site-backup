const fs = require('fs');
const { getStateMap } = require('../api/_lib/state-store');

const report = JSON.parse(fs.readFileSync('tmp/real-migration-batch3-public-report.json', 'utf8'));
const touched = Array.isArray(report.touchedRecords) ? report.touchedRecords : [];

function t(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function findItem(exhibitions, target) {
  const exhibition = exhibitions.find((entry) => Number(entry?.id) === Number(target.exhibitionId));
  const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
  return list.find((entry) => Number(entry?.id) === Number(target.itemId)) || null;
}

(async () => {
  const map = await getStateMap(['exhibitions']);
  const exhibitions = Array.isArray(map?.exhibitions) ? map.exhibitions : [];

  const rows = touched.map((target) => {
    const item = findItem(exhibitions, target);
    const dataField = target.kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
    const dataLen = t(item?.[dataField]).length;
    return {
      exhibitionId: target.exhibitionId,
      field: target.field,
      itemId: target.itemId,
      kind: target.kind,
      dataField,
      base64LengthInDb: dataLen,
      retained: dataLen > 0
    };
  });

  console.log(JSON.stringify({
    checked: rows.length,
    retainedCount: rows.filter((row) => row.retained).length,
    allRetained: rows.every((row) => row.retained),
    rows
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
