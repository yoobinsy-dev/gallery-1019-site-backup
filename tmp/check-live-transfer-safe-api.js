const targets = [
  { exId: 1785595618294, field: 'works', itemId: 1785595631924, kind: 'full' },
  { exId: 1785642780070, field: 'works', itemId: 1785732777057, kind: 'preview' },
  { exId: 1785642780070, field: 'works', itemId: 1785732855044, kind: 'preview' }
];

function t(v) {
  return typeof v === 'string' ? v.trim() : '';
}

(async () => {
  const host = t(process.env.VERCEL_URL);
  if (!host) {
    throw new Error('Missing VERCEL_URL');
  }
  const base = host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`;

  const response = await fetch(`${base}/api/state?keys=exhibitions`);
  if (!response.ok) {
    throw new Error(`State API failed: ${response.status}`);
  }

  const payload = await response.json();
  const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];

  for (const target of targets) {
    const exhibition = exhibitions.find((item) => Number(item?.id) === target.exId);
    const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
    const work = list.find((item) => Number(item?.id) === target.itemId);

    const dataField = target.kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
    const urlField = target.kind === 'full' ? 'photoUrl' : 'photoPreviewUrl';

    const url = t(work?.[urlField]);
    const dataLen = t(work?.[dataField]).length;
    console.log(`${target.exId}/${target.itemId} urlHost=${url.split('/')[2] || ''} dataLen=${dataLen}`);
  }
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
