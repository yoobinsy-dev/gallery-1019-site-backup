const fs = require('fs');

const report = JSON.parse(fs.readFileSync('tmp/real-migration-batch3-public-report.json', 'utf8'));
const transferSafe = report.validations?.transferSafeOmitWhenPublicUrlConfirmed || [];
const base64Retained = report.validations?.base64Retained || [];
const cert = report.validations?.certificateCriticalUnchanged || [];
const upload = report.validations?.uploadSucceeded || [];
const unauth = report.validations?.unauthGet200 || [];
const type = report.validations?.imageContentType || [];

const summary = {
  beforeBytes: report.before?.liveApiResponseBytes,
  afterBytes: report.after?.liveApiResponseBytes,
  batchByteReduction: report.after?.batchByteReduction,
  batchReductionPercent: report.before?.liveApiResponseBytes > 0
    ? Number((((report.after?.batchByteReduction || 0) / report.before.liveApiResponseBytes) * 100).toFixed(4))
    : null,
  counters: report.counters,
  selection: {
    totalSelected: report.selection?.totalSelected,
    fullSelected: report.selection?.fullSelected,
    previewSelected: report.selection?.previewSelected
  },
  touchedCount: (report.touchedRecords || []).length,
  allUploadsOk: upload.every((entry) => entry.ok === true),
  allUnauth200: unauth.every((entry) => entry.ok === true && entry.status === 200),
  allImageType: type.every((entry) => entry.isImage === true),
  allBase64Retained: base64Retained.every((entry) => entry.unchanged === true && entry.beforeLength === entry.afterLength && entry.afterLength > 0),
  allTransferSafeOmitted: transferSafe.every((entry) => entry.urlIsPublic === true && entry.omittedInTransferSafe === true),
  noUnexpectedFieldChanges: report.validations?.noUnexpectedFieldChanges,
  noDeletions: report.validations?.noDeletions,
  certChangedCount: cert.filter((entry) => Array.isArray(entry.changedFields) && entry.changedFields.length > 0).length,
  errorsCount: (report.errors || []).length,
  finishedAt: report.finishedAt
};

console.log(JSON.stringify(summary, null, 2));
