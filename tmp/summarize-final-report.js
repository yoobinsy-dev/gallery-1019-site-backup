const fs = require('fs');

const report = JSON.parse(fs.readFileSync('tmp/real-migration-final-public-report.json', 'utf8'));

const transferSafe = report.validations?.transferSafeOmitWhenPublicUrlConfirmed || [];
const base64Retained = report.validations?.base64Retained || [];
const cert = report.validations?.certificateCriticalUnchanged || [];
const uploadSucceeded = report.validations?.uploadSucceeded || [];
const uploadFailed = report.validations?.uploadFailed || [];
const unauth200 = report.validations?.unauthGet200 || [];
const imageType = report.validations?.imageContentType || [];

const summary = {
  mode: report.mode,
  remainingFoundBeforeMigration: report.before?.remainingLegacyAssetsWithoutPublicUrl,
  attempted: report.counters?.attempted,
  succeeded: report.counters?.succeeded,
  failed: report.counters?.failed,
  fullSucceeded: report.counters?.fullSucceeded,
  previewSucceeded: report.counters?.previewSucceeded,
  recordsModified: report.counters?.productionRecordsModified,
  totalPublicRefsNow: report.after?.totalPublicReferences,
  remainingWithoutPublicNow: report.after?.remainingLegacyAssetsWithoutPublicUrl,
  beforeSize: report.before?.liveApiResponseBytes,
  finalSize: report.after?.liveApiResponseBytes,
  batchByteReduction: report.after?.batchByteReduction,
  reductionFromOriginalBytes: report.after?.reductionFromOriginalBaselineBytes,
  reductionFromOriginalPercent: report.after?.reductionFromOriginalBaselinePercent,
  reductionFromPreFinalBytes: report.after?.reductionFromPreFinalBaselineBytes,
  reductionFromPreFinalPercent: report.after?.reductionFromPreFinalBaselinePercent,
  transferredBase64Before: report.before?.transferredBase64Bytes,
  transferredBase64After: report.after?.transferredBase64Bytes,
  allUploadsHaveUrl: uploadSucceeded.every((x) => x.ok === true),
  failedUploadsLogged: uploadFailed.length,
  allUploadedUrlsReturned200: unauth200.every((x) => x.ok === true && x.status === 200),
  allUploadedUrlsAreImages: imageType.every((x) => x.isImage === true),
  allBase64RetainedForTouched: base64Retained.every((x) => x.unchanged === true && x.beforeLength === x.afterLength && x.afterLength > 0),
  allTransferSafeOmittedForPublicTouched: transferSafe.every((x) => x.urlIsPublic === true && x.omittedInTransferSafe === true),
  noRecordsDeleted: report.validations?.noDeletions?.noDeletion === true,
  beforeItemCount: report.validations?.noDeletions?.beforeItemCount,
  afterItemCount: report.validations?.noDeletions?.afterItemCount,
  noUnexpectedFieldChanges: report.validations?.noUnexpectedFieldChanges?.unexpectedPathCount === 0,
  unexpectedPathCount: report.validations?.noUnexpectedFieldChanges?.unexpectedPathCount,
  certCriticalChangedCount: cert.reduce((n, x) => n + (Array.isArray(x.changedFields) ? x.changedFields.length : 0), 0),
  blobDeletionsPerformed: report.counters?.blobDeletionsPerformed,
  unexpectedErrors: report.counters?.unexpectedErrors
};

console.log(JSON.stringify(summary, null, 2));
