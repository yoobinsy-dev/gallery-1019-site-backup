const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const ASSETS = Object.freeze([
  {
    packageName: 'xlsx-populate',
    version: '1.21.0',
    relativePath: 'vendor/xlsx-populate-1.21.0/xlsx-populate.min.js',
    sha256: '33aa41e75cffc90385888e3541526efd1bc30846f84b85f875e9ced122c14b86'
  },
  {
    packageName: 'jszip',
    version: '3.10.1',
    relativePath: 'vendor/jszip-3.10.1/jszip.min.js',
    sha256: 'acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e'
  }
]);

test('certificate browser dependencies are pinned deployable assets', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

  ASSETS.forEach((asset) => {
    const absolutePath = path.join(ROOT, asset.relativePath);
    assert.equal(packageJson.dependencies[asset.packageName], asset.version);
    assert.equal(packageLock.packages[`node_modules/${asset.packageName}`].version, asset.version);
    assert.equal(fs.existsSync(absolutePath), true);
    assert.equal(createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'), asset.sha256);
  });
});

test('certificate loader and generated runtime use root-relative vendor paths', () => {
  const source = fs.readFileSync(path.join(ROOT, 'exhibition-detail.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(ROOT, 'exhibition-detail-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'exhibition-detail.html'), 'utf8');

  ASSETS.forEach((asset) => {
    const publicPath = `/${asset.relativePath}`;
    assert.match(source, new RegExp(publicPath.replaceAll('.', '\\.')));
    assert.match(runtime, new RegExp(publicPath.replaceAll('.', '\\.')));
  });
  assert.doesNotMatch(source, /loadClassicScript\(['"]node_modules\//);
  assert.doesNotMatch(runtime, /loadClassicScript\(['"]node_modules\//);
  assert.match(html, /exhibition-detail-runtime\.js\?v=20260907-1/);
});