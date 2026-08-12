const { getStateMap } = require('../api/_lib/state-store');
const { buildTransferSafeExhibitions } = require('../api/_lib/exhibition-image-refs');

const targets = [
  { exId: 1785595618294, field: 'works', itemId: 1785595631924, kind: 'full' },
  { exId: 1785642780070, field: 'works', itemId: 1785732777057, kind: 'preview' },
  { exId: 1785642780070, field: 'works', itemId: 1785732855044, kind: 'preview' }
];

function findItem(exhibitions, target) {
  const exhibition = exhibitions.find((ex) => Number(ex?.id) === target.exId);
  const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
  return list.find((item) => Number(item?.id) === target.itemId) || null;
}

(async () => {
  const map = await getStateMap(['exhibitions']);
  const exhibitions = Array.isArray(map.exhibitions) ? map.exhibitions : [];
  const safeExhibitions = buildTransferSafeExhibitions(exhibitions).exhibitions;

  for (const target of targets) {
    const rawItem = findItem(exhibitions, target);
    const safeItem = findItem(safeExhibitions, target);

    const dataField = target.kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
    const urlField = target.kind === 'full' ? 'photoUrl' : 'photoPreviewUrl';

    const rawDataLen = String(rawItem?.[dataField] || '').length;
    const safeDataLen = String(safeItem?.[dataField] || '').length;
    const safeUrl = String(safeItem?.[urlField] || '').trim();

    console.log(`${target.exId}/${target.itemId} safeUrl=${safeUrl ? 'yes' : 'no'} rawDataLen=${rawDataLen} safeDataLen=${safeDataLen}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
