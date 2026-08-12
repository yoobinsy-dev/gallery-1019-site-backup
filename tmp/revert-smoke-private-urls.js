const { getStateMap, setStateValue } = require('../api/_lib/state-store');

const TARGETS = [
  { kind: 'full', exhibitionId: 1785595618294, field: 'works', itemId: 1785595631924 },
  { kind: 'preview', exhibitionId: 1785642780070, field: 'works', itemId: 1785732777057 },
  { kind: 'preview', exhibitionId: 1785642780070, field: 'works', itemId: 1785732855044 }
];

function findExhibition(exhibitions, exhibitionId) {
  return exhibitions.find((ex) => Number(ex?.id) === Number(exhibitionId));
}

function findItem(exhibition, field, itemId) {
  const list = Array.isArray(exhibition?.[field]) ? exhibition[field] : [];
  return list.find((item) => Number(item?.id) === Number(itemId));
}

(async () => {
  const map = await getStateMap(['exhibitions']);
  const exhibitions = Array.isArray(map.exhibitions) ? map.exhibitions : [];
  const cloned = JSON.parse(JSON.stringify(exhibitions));

  const changes = [];

  for (const target of TARGETS) {
    const exhibition = findExhibition(cloned, target.exhibitionId);
    if (!exhibition) continue;
    const item = findItem(exhibition, target.field, target.itemId);
    if (!item) continue;

    if (target.kind === 'full') {
      const beforeUrl = String(item.photoUrl || '').trim();
      const beforePath = String(item.photoPath || '').trim();
      if (beforeUrl || beforePath) {
        item.photoUrl = '';
        item.photoPath = '';
        changes.push({ ...target, cleared: ['photoUrl', 'photoPath'] });
      }
    } else {
      const beforeUrl = String(item.photoPreviewUrl || '').trim();
      const beforePath = String(item.photoPreviewPath || '').trim();
      if (beforeUrl || beforePath) {
        item.photoPreviewUrl = '';
        item.photoPreviewPath = '';
        changes.push({ ...target, cleared: ['photoPreviewUrl', 'photoPreviewPath'] });
      }
    }
  }

  if (changes.length === 0) {
    console.log(JSON.stringify({ ok: true, writesPerformed: 0, changes }, null, 2));
    return;
  }

  await setStateValue('exhibitions', cloned);
  console.log(JSON.stringify({ ok: true, writesPerformed: 1, changes }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});
