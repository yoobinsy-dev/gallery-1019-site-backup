const { getStateMap } = require('../api/_lib/state-store');

function t(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isPublic(v) {
  return t(v).includes('.public.blob.vercel-storage.com/');
}

(async () => {
  const map = await getStateMap(['exhibitions']);
  const exhibitions = Array.isArray(map?.exhibitions) ? map.exhibitions : [];
  const fields = ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'];

  let totalItems = 0;
  let totalPhotoDataBytes = 0;
  let totalPreviewDataBytes = 0;
  let withPhotoData = 0;
  let withPreviewData = 0;
  let publicFull = 0;
  let publicPreview = 0;
  let legacyWithoutPublic = 0;

  for (const exhibition of exhibitions) {
    for (const field of fields) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      totalItems += list.length;
      for (const item of list) {
        const fullData = t(item?.photoDataUrl);
        const previewData = t(item?.photoPreviewDataUrl);
        const fullUrl = t(item?.photoUrl);
        const previewUrl = t(item?.photoPreviewUrl);

        if (fullData) {
          withPhotoData += 1;
          totalPhotoDataBytes += fullData.length;
        }
        if (previewData) {
          withPreviewData += 1;
          totalPreviewDataBytes += previewData.length;
        }
        if (isPublic(fullUrl)) publicFull += 1;
        if (isPublic(previewUrl)) publicPreview += 1;
        if ((fullData && !isPublic(fullUrl)) || (previewData && !isPublic(previewUrl))) {
          legacyWithoutPublic += 1;
        }
      }
    }
  }

  console.log(JSON.stringify({
    exhibitionCount: exhibitions.length,
    totalItems,
    publicFull,
    publicPreview,
    withPhotoData,
    withPreviewData,
    totalPhotoDataBytes,
    totalPreviewDataBytes,
    totalBase64Bytes: totalPhotoDataBytes + totalPreviewDataBytes,
    legacyWithoutPublic
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
