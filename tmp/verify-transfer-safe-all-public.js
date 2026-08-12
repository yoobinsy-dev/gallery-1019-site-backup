(async () => {
  const res = await fetch('https://gallery-1019-site.vercel.app/api/state?keys=exhibitions');
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);

  const payload = await res.json();
  const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];
  const fields = ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'];

  const violations = [];
  let publicFull = 0;
  let publicPreview = 0;

  for (const exhibition of exhibitions) {
    const exhibitionId = Number(exhibition?.id);
    for (const field of fields) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      for (const item of list) {
        const id = Number(item?.id);
        const fullUrl = String(item?.photoUrl || '').trim();
        const previewUrl = String(item?.photoPreviewUrl || '').trim();
        const fullDataLen = String(item?.photoDataUrl || '').trim().length;
        const previewDataLen = String(item?.photoPreviewDataUrl || '').trim().length;

        const fullPublic = fullUrl.includes('.public.blob.vercel-storage.com/');
        const previewPublic = previewUrl.includes('.public.blob.vercel-storage.com/');

        if (fullPublic) {
          publicFull += 1;
          if (fullDataLen > 0) {
            violations.push({ exhibitionId, field, itemId: id, kind: 'full', fullDataLen });
          }
        }

        if (previewPublic) {
          publicPreview += 1;
          if (previewDataLen > 0) {
            violations.push({ exhibitionId, field, itemId: id, kind: 'preview', previewDataLen });
          }
        }
      }
    }
  }

  console.log(JSON.stringify({
    status: res.status,
    publicFull,
    publicPreview,
    totalPublic: publicFull + publicPreview,
    violationsCount: violations.length,
    violationsSample: violations.slice(0, 20)
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
