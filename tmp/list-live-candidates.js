const { getStateMap } = require('../api/_lib/state-store');

function t(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isData(v) {
  return /^data:[^;]+;base64,/i.test(t(v));
}

function isHttp(v) {
  const s = t(v).toLowerCase();
  return s.startsWith('http://') || s.startsWith('https://');
}

(async () => {
  const map = await getStateMap(['exhibitions']);
  const exs = Array.isArray(map.exhibitions) ? map.exhibitions : [];
  const preferred = ['works', 'artWorks', 'artSoldWorks', 'soldWorks', 'goods', 'soldGoods'];
  const full = [];
  const preview = [];

  exs.forEach((ex) => {
    preferred.forEach((field) => {
      const list = Array.isArray(ex?.[field]) ? ex[field] : [];
      list.forEach((item, itemIndex) => {
        if (!item || typeof item !== 'object') return;

        const rec = {
          exhibitionId: Number(ex?.id) || null,
          exhibitionTitle: t(ex?.title).slice(0, 80),
          field,
          itemIndex,
          itemId: Number(item?.id) || null,
          workId: Number(item?.workId) || null,
          manualNumber: t(item?.manualNumber),
          title: t(item?.title).slice(0, 80),
          hasFullData: isData(item.photoDataUrl),
          hasPreviewData: isData(item.photoPreviewDataUrl),
          hasFullUrl: isHttp(item.photoUrl),
          hasPreviewUrl: isHttp(item.photoPreviewUrl),
          fullLen: t(item.photoDataUrl).length,
          previewLen: t(item.photoPreviewDataUrl).length
        };

        if (rec.hasFullData && !rec.hasFullUrl) full.push(rec);
        if (rec.hasPreviewData && !rec.hasPreviewUrl) preview.push(rec);
      });
    });
  });

  console.log(JSON.stringify({
    fullCount: full.length,
    previewCount: preview.length,
    fullTop: full.slice(0, 20),
    previewTop: preview.slice(0, 20)
  }, null, 2));
})().catch((error) => {
  console.error('LIST_CANDIDATES_ERR', error.message || String(error));
  process.exit(1);
});
