const fs = require('fs');
const { Client } = require('pg');

const BASELINE_BYTES = 4384673;
const TARGETS = [
  { exId: 1785595618294, field: 'works', itemId: 1785595631924, kind: 'full' },
  { exId: 1785642780070, field: 'works', itemId: 1785732777057, kind: 'preview' },
  { exId: 1785642780070, field: 'works', itemId: 1785732855044, kind: 'preview' }
];

function t(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function findWork(exhibitions, target) {
  const exhibition = exhibitions.find((item) => Number(item?.id) === target.exId);
  const list = Array.isArray(exhibition?.[target.field]) ? exhibition[target.field] : [];
  return list.find((item) => Number(item?.id) === target.itemId) || null;
}

function getFields(kind) {
  if (kind === 'full') return { dataField: 'photoDataUrl', urlField: 'photoUrl' };
  return { dataField: 'photoPreviewDataUrl', urlField: 'photoPreviewUrl' };
}

function countPublicBlobRefs(exhibitions) {
  let count = 0;
  const isPublic = (url) => /\.public\.blob\.vercel-storage\.com/i.test(t(url));

  for (const ex of Array.isArray(exhibitions) ? exhibitions : []) {
    const buckets = ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'];
    for (const bucket of buckets) {
      const list = Array.isArray(ex?.[bucket]) ? ex[bucket] : [];
      for (const item of list) {
        if (isPublic(item?.photoUrl)) count += 1;
        if (isPublic(item?.photoPreviewUrl)) count += 1;
      }
    }
  }

  return count;
}

async function loadDbExhibitions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const dbRow = await client.query("SELECT state_value FROM app_state WHERE state_key='exhibitions'");
  const exhibitions = Array.isArray(dbRow.rows?.[0]?.state_value) ? dbRow.rows[0].state_value : [];
  await client.end();
  return exhibitions;
}

async function main() {
  const host = t(process.env.VERCEL_URL) || 'gallery-1019-site.vercel.app';
  const base = host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`;

  const beforeRes = await fetch(`${base}/api/state?keys=exhibitions`);
  if (!beforeRes.ok) throw new Error(`GET before failed: ${beforeRes.status}`);

  const beforePayload = await beforeRes.json();
  const beforeBytesHeader = Number(beforeRes.headers.get('x-state-response-bytes') || '0');
  const beforeBytesComputed = Buffer.byteLength(JSON.stringify(beforePayload), 'utf8');
  const beforeExhibitions = Array.isArray(beforePayload?.data?.exhibitions) ? beforePayload.data.exhibitions : [];
  const baseUpdatedAt = t(beforePayload?.meta?.exhibitions?.updatedAt);

  const targetBefore = TARGETS.map((target) => {
    const work = findWork(beforeExhibitions, target);
    const { dataField, urlField } = getFields(target.kind);
    const url = t(work?.[urlField]);
    return {
      ...target,
      url,
      urlHost: url.split('/')[2] || '',
      apiDataLen: t(work?.[dataField]).length
    };
  });

  const publicChecks = [];
  for (const row of targetBefore) {
    const r = await fetch(row.url);
    const contentType = t(r.headers.get('content-type'));
    publicChecks.push({
      exId: row.exId,
      itemId: row.itemId,
      status: r.status,
      ok: r.ok,
      contentType,
      isImage: contentType.startsWith('image/')
    });
  }

  const dbExhibitionsBefore = await loadDbExhibitions();
  const dbTargetBefore = TARGETS.map((target) => {
    const work = findWork(dbExhibitionsBefore, target);
    const { dataField, urlField } = getFields(target.kind);
    return {
      ...target,
      url: t(work?.[urlField]),
      dbDataLen: t(work?.[dataField]).length
    };
  });

  const dbPublicRefCountBefore = countPublicBlobRefs(dbExhibitionsBefore);

  const putRes = await fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-client-id': 'postdeploy-verification-noop-save'
    },
    body: JSON.stringify({
      key: 'exhibitions',
      value: beforeExhibitions,
      baseUpdatedAt,
      syncMode: 'full'
    })
  });

  if (!putRes.ok) throw new Error(`PUT save failed: ${putRes.status}`);
  const putPayload = await putRes.json();

  const afterRes = await fetch(`${base}/api/state?keys=exhibitions`);
  if (!afterRes.ok) throw new Error(`GET after failed: ${afterRes.status}`);

  const afterPayload = await afterRes.json();
  const afterBytesHeader = Number(afterRes.headers.get('x-state-response-bytes') || '0');
  const afterBytesComputed = Buffer.byteLength(JSON.stringify(afterPayload), 'utf8');
  const afterExhibitions = Array.isArray(afterPayload?.data?.exhibitions) ? afterPayload.data.exhibitions : [];

  const targetAfter = TARGETS.map((target) => {
    const work = findWork(afterExhibitions, target);
    const { dataField, urlField } = getFields(target.kind);
    const url = t(work?.[urlField]);
    return {
      ...target,
      url,
      urlHost: url.split('/')[2] || '',
      apiDataLen: t(work?.[dataField]).length
    };
  });

  const dbExhibitionsAfter = await loadDbExhibitions();
  const dbTargetAfter = TARGETS.map((target) => {
    const work = findWork(dbExhibitionsAfter, target);
    const { dataField, urlField } = getFields(target.kind);
    return {
      ...target,
      url: t(work?.[urlField]),
      dbDataLen: t(work?.[dataField]).length
    };
  });

  const dbPublicRefCountAfter = countPublicBlobRefs(dbExhibitionsAfter);

  const result = {
    verifiedAt: new Date().toISOString(),
    base,
    baselineBytes: BASELINE_BYTES,
    before: {
      apiBytesHeader: beforeBytesHeader,
      apiBytesComputed: beforeBytesComputed,
      bytesVsBaseline: BASELINE_BYTES - beforeBytesHeader,
      targetApi: targetBefore,
      targetDb: dbTargetBefore,
      dbPublicRefCount: dbPublicRefCountBefore,
      publicChecks
    },
    noopSave: {
      ok: Boolean(putPayload?.ok),
      updatedAt: putPayload?.meta?.updatedAt || null,
      mergedOnConflict: Boolean(putPayload?.mergedOnConflict),
      imageMigration: putPayload?.imageMigration || null
    },
    after: {
      apiBytesHeader: afterBytesHeader,
      apiBytesComputed: afterBytesComputed,
      bytesVsBaseline: BASELINE_BYTES - afterBytesHeader,
      targetApi: targetAfter,
      targetDb: dbTargetAfter,
      dbPublicRefCount: dbPublicRefCountAfter
    }
  };

  fs.writeFileSync('tmp/postdeploy-public-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
