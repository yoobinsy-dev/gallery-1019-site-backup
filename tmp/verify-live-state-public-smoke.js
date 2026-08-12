const fs = require('fs');

const statePath = 'tmp/live_state_after_public_smoke.json';
const targets = [
  { exId: 1785595618294, field: 'works', itemId: 1785595631924, kind: 'full' },
  { exId: 1785642780070, field: 'works', itemId: 1785732777057, kind: 'preview' },
  { exId: 1785642780070, field: 'works', itemId: 1785732855044, kind: 'preview' }
];

const raw = fs.readFileSync(statePath, 'utf8');
const payload = JSON.parse(raw);
const exhibitions = Array.isArray(payload?.data?.exhibitions) ? payload.data.exhibitions : [];

for (const target of targets) {
  const exhibition = exhibitions.find((item) => Number(item?.id) === target.exId);
  const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
  const work = list.find((item) => Number(item?.id) === target.itemId) || {};

  const dataField = target.kind === 'full' ? 'photoDataUrl' : 'photoPreviewDataUrl';
  const urlField = target.kind === 'full' ? 'photoUrl' : 'photoPreviewUrl';
  const url = String(work[urlField] || '').trim();
  const host = url.split('/')[2] || '';
  const dataLen = String(work[dataField] || '').length;

  console.log(`${target.exId}/${target.itemId} host=${host} dataLen=${dataLen}`);
}
