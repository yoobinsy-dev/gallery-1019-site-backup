(async () => {
  const res = await fetch('https://gallery-1019-site.vercel.app/api/state?keys=exhibitions');
  if (!res.ok) {
    throw new Error(`Failed to fetch live state: ${res.status}`);
  }

  const payload = await res.json();
  const headerBytes = Number(res.headers.get('x-state-response-bytes') || '0');
  const computedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  let transferredBase64Bytes = 0;
  const fields = ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'];
  const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];

  for (const exhibition of exhibitions) {
    for (const field of fields) {
      const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
      for (const item of list) {
        transferredBase64Bytes += String(item?.photoDataUrl || '').trim().length;
        transferredBase64Bytes += String(item?.photoPreviewDataUrl || '').trim().length;
      }
    }
  }

  const originalBaseline = 4384673;
  const preFinalBaseline = 1339536;
  const reductionFromOriginalBytes = originalBaseline - headerBytes;
  const reductionFromOriginalPercent = Number(((reductionFromOriginalBytes / originalBaseline) * 100).toFixed(4));
  const reductionFromPreFinalBytes = preFinalBaseline - headerBytes;
  const reductionFromPreFinalPercent = Number(((reductionFromPreFinalBytes / preFinalBaseline) * 100).toFixed(4));

  console.log(JSON.stringify({
    status: res.status,
    headerBytes,
    computedBytes,
    transferredBase64Bytes,
    reductionFromOriginalBytes,
    reductionFromOriginalPercent,
    reductionFromPreFinalBytes,
    reductionFromPreFinalPercent
  }, null, 2));
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
