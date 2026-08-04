const { ClassicLevel } = require('classic-level');

async function dump(dbPath) {
  const db = new ClassicLevel(dbPath, {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
    readOnly: true,
    createIfMissing: false,
    errorIfExists: false
  });

  await db.open();

  let total = 0;
  let matched = 0;
  const keyNeedles = [
    'gallery-1019-site.vercel.app',
    '127.0.0.1:5500',
    'exhibitions',
    '__sync_updated_at__'
  ];
  const valNeedles = [
    'artSoldWorks',
    'soldGoods',
    'soldAtKst',
    'buyerName',
    'paymentMethod',
    'exhibitions'
  ];

  for await (const [k, v] of db.iterator()) {
    total += 1;
    const key = Buffer.isBuffer(k) ? k : Buffer.from(String(k));
    const value = Buffer.isBuffer(v) ? v : Buffer.from(String(v));

    const keyText = key.toString('utf8');
    const valText = value.toString('utf8');

    const keyHit = keyNeedles.some((n) => keyText.includes(n));
    const valHit = valNeedles.some((n) => valText.includes(n));

    if (keyHit || valHit) {
      matched += 1;
      console.log('---ENTRY---');
      console.log('KEY_HEX', key.toString('hex').slice(0, 220));
      console.log('KEY_TXT', keyText.slice(0, 500));
      console.log('VAL_TXT', valText.slice(0, 1200));
      if (matched >= 200) break;
    }
  }

  console.log('TOTAL_KEYS', total);
  console.log('MATCHED_KEYS', matched);

  await db.close();
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node tmp/dump-leveldb-keys.js <db_path>');
  process.exit(1);
}

dump(target).catch((error) => {
  console.error('DUMP_ERR', error.message);
  process.exit(1);
});
