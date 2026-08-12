const fs = require('fs');

const file = process.argv[2] || 'tmp/.env.production.dryrun';
const txt = fs.readFileSync(file, 'utf8');
const lines = txt.split(/\r?\n/).filter(Boolean);
const keys = lines
  .filter((line) => !line.startsWith('#') && line.includes('='))
  .map((line) => line.split('=')[0].trim());

const dbLine = lines.find((line) => line.startsWith('DATABASE_URL='));
let databaseHost = null;
if (dbLine) {
  const raw = dbLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  try {
    databaseHost = new URL(raw).hostname;
  } catch (error) {
    databaseHost = null;
  }
}

console.log(JSON.stringify({
  envFile: file,
  keyCount: keys.length,
  hasDatabaseUrl: keys.includes('DATABASE_URL'),
  hasBlobToken: keys.includes('BLOB_READ_WRITE_TOKEN'),
  databaseHost
}, null, 2));
