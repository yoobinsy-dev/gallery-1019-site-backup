const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../helpers/load-source');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

test('normal API and cron runtime source contains no schema-changing SQL', () => {
  const runtimeFiles = walk(path.join(ROOT, 'api')).filter((file) => file.endsWith('.js'));
  const ddl = /\b(?:CREATE\s+(?:TABLE|INDEX|SCHEMA|DATABASE|ROLE)|ALTER\s+(?:TABLE|INDEX|SCHEMA|DATABASE|ROLE)|DROP\s+(?:TABLE|INDEX|SCHEMA|DATABASE|ROLE|CONSTRAINT)|TRUNCATE\s+TABLE)\b/i;
  const violations = runtimeFiles.flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return ddl.test(source) ? [path.relative(ROOT, file)] : [];
  });
  assert.deepEqual(violations, []);
});

test('explicit migration tooling remains outside normal API runtime paths', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts/migrate-database.js')), true);
  assert.match(fs.readFileSync(path.join(ROOT, 'sql/schema.sql'), 'utf8'), /CREATE TABLE/i);
});