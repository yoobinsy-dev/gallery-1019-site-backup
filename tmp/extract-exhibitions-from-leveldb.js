const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require('classic-level');

async function main() {
  const dbPath = process.argv[2];
  const outDir = process.argv[3] || path.join(process.cwd(), 'tmp');

  if (!dbPath) {
    console.error('Usage: node tmp/extract-exhibitions-from-leveldb.js <db_path> [out_dir]');
    process.exit(1);
  }

  const db = new ClassicLevel(dbPath, {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
    readOnly: true,
    createIfMissing: false,
    errorIfExists: false
  });

  await db.open();

  let found = 0;

  for await (const [k, v] of db.iterator()) {
    const keyBuf = Buffer.isBuffer(k) ? k : Buffer.from(String(k));
    const valBuf = Buffer.isBuffer(v) ? v : Buffer.from(String(v));
    const keyText = keyBuf.toString('utf8');

    const isGallery = keyText.includes('gallery-1019-site.vercel.app') && keyText.includes('exhibitions');
    const isLocal = keyText.includes('127.0.0.1:5500') && keyText.includes('exhibitions');
    if (!isGallery && !isLocal) continue;

    found += 1;
    const tag = isGallery ? 'gallery-prod' : 'local-127';

    fs.mkdirSync(outDir, { recursive: true });
    const rawPath = path.join(outDir, `recovered-${tag}-exhibitions.raw.bin`);
    const utf8Path = path.join(outDir, `recovered-${tag}-exhibitions.utf8.json`);
    const utf16Path = path.join(outDir, `recovered-${tag}-exhibitions.utf16le.txt`);
    const keyPath = path.join(outDir, `recovered-${tag}-exhibitions.key.txt`);

    fs.writeFileSync(rawPath, valBuf);
    fs.writeFileSync(utf8Path, valBuf.toString('utf8'));
    fs.writeFileSync(utf16Path, valBuf.toString('utf16le'));
    fs.writeFileSync(keyPath, keyText);

    console.log('FOUND', tag);
    console.log('KEY_PATH', keyPath);
    console.log('RAW_PATH', rawPath, 'BYTES', valBuf.length);
    console.log('UTF8_PATH', utf8Path, 'CHARS', valBuf.toString('utf8').length);
    console.log('UTF16_PATH', utf16Path, 'CHARS', valBuf.toString('utf16le').length);

    try {
      const parsed = JSON.parse(valBuf.toString('utf8'));
      console.log('UTF8_JSON_PARSE', 'OK', 'ARRAY_LEN', Array.isArray(parsed) ? parsed.length : 'n/a');
    } catch (error) {
      console.log('UTF8_JSON_PARSE', 'ERR', error.message);
    }

    try {
      const parsed = JSON.parse(valBuf.toString('utf16le'));
      console.log('UTF16_JSON_PARSE', 'OK', 'ARRAY_LEN', Array.isArray(parsed) ? parsed.length : 'n/a');
    } catch (error) {
      console.log('UTF16_JSON_PARSE', 'ERR', error.message);
    }
  }

  console.log('FOUND_TOTAL', found);

  await db.close();
}

main().catch((error) => {
  console.error('EXTRACT_ERR', error.message);
  process.exit(1);
});
