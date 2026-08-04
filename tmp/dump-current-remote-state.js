const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function countEx(ex) {
  const works = Array.isArray(ex.works) ? ex.works.length : 0;
  const artWorks = Array.isArray(ex.artWorks) ? ex.artWorks.length : 0;
  const goods = Array.isArray(ex.goods) ? ex.goods.length : 0;
  const soldWorks = Array.isArray(ex.soldWorks) ? ex.soldWorks.length : 0;
  const artSoldWorks = Array.isArray(ex.artSoldWorks) ? ex.artSoldWorks.length : 0;
  const soldGoods = Array.isArray(ex.soldGoods) ? ex.soldGoods.length : 0;
  return { works, artWorks, goods, soldWorks, artSoldWorks, soldGoods };
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const row = await client.query(
    "SELECT state_value, updated_at FROM app_state WHERE state_key='exhibitions'"
  );

  if (row.rows.length === 0) {
    console.log('NO_EXHIBITIONS_ROW');
    await client.end();
    return;
  }

  const state = row.rows[0].state_value;
  const updatedAt = row.rows[0].updated_at;
  console.log('REMOTE_UPDATED_AT', new Date(updatedAt).toISOString());

  const exhibitions = Array.isArray(state) ? state : [];
  console.log('REMOTE_EXHIBITIONS_COUNT', exhibitions.length);

  exhibitions.forEach((ex) => {
    const c = countEx(ex || {});
    console.log('EX', ex?.id, (ex?.title || '').slice(0, 60), JSON.stringify(c));
  });

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'remote-exhibitions-backup-before-restore.json');
  fs.writeFileSync(outPath, JSON.stringify(exhibitions, null, 2));
  console.log('WROTE_BACKUP', outPath);

  await client.end();
})();
