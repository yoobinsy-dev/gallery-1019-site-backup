const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const exhibitionIndex = require('../../artworks/exhibition-index');
const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const USER = {
  id: 91019999,
  username: 'DEV_DUMMY_ADMIN',
  name: 'DEV_DUMMY_관리자',
  accountType: '어드민',
  galleryRole: '어드민',
  siteAccess: 'both',
  approved: true
};

async function readState() {
  const response = await fetch(`${BASE_URL}/api/state?keys=exhibitions,gallery-artworks-v1`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.data;
}

function verifyTarget() {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.vercel', 'project.json'), 'utf8'));
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    vercelProjectId: project.projectId,
    databaseEndpointId: databaseUrl.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(databaseUrl.username),
    archiveWriteEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
  });
}

async function main() {
  verifyTarget();
  const before = await readState();
  const rows = exhibitionIndex.buildExhibitionIndex(before.exhibitions, before['gallery-artworks-v1']).rows;
  const representative = rows.filter((row) => row.occurrences.length > 1).sort((left, right) => right.occurrences.length - left.occurrences.length)[0];
  assert.ok(representative, 'A repeated linked DEV artwork is required.');
  const latest = representative.occurrences.at(-1);
  const originalOccurrence = structuredClone(latest.work);
  const originalSales = structuredClone({ soldWorks: latest.exhibition.soldWorks || [], artSoldWorks: latest.exhibition.artSoldWorks || [] });
  const pageErrors = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript((user) => localStorage.setItem('currentUser', JSON.stringify(user)), USER);
    await page.goto(`${BASE_URL}/exhibition-detail.html?id=${latest.exhibition.id}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.exhibitionDetailReady);
    await page.evaluate(() => window.switchTab('inventory-list'));
    const row = page.locator(`tr[data-work-id="${latest.work.id}"]`);
    await assert.doesNotReject(() => row.waitFor({ state: 'visible' }));
    assert.match(await row.textContent(), new RegExp(originalOccurrence.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await row.getByRole('button', { name: '수정', exact: true }).click();
    assert.equal(await row.locator('input[data-field="title"]').inputValue(), originalOccurrence.title);
    assert.equal(await row.locator('input[data-field="price"]').inputValue(), String(originalOccurrence.price));
    await row.getByRole('button', { name: '저장', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.exhibitionDetailReady);
    await page.evaluate(() => window.switchTab('inventory-list'));
    await page.locator(`tr[data-work-id="${latest.work.id}"]`).waitFor({ state: 'visible' });
  } finally {
    await browser.close();
  }

  const after = await readState();
  const savedExhibition = after.exhibitions.find((item) => String(item.id) === String(latest.exhibition.id));
  const savedOccurrence = exhibitionIndex.getExhibitionWorks(savedExhibition).find((item) => String(item.id) === String(latest.work.id));
  assert.deepEqual(savedOccurrence, originalOccurrence);
  assert.deepEqual({ soldWorks: savedExhibition.soldWorks || [], artSoldWorks: savedExhibition.artSoldWorks || [] }, originalSales);
  assert.equal(savedOccurrence.workId, representative.workId);
  assert.deepEqual(
    ['photoUrl', 'photoPreviewUrl', 'photoPath', 'photoPreviewPath'].map((field) => savedOccurrence[field] || ''),
    ['photoUrl', 'photoPreviewUrl', 'photoPath', 'photoPreviewPath'].map((field) => originalOccurrence[field] || '')
  );
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log(JSON.stringify({
    ok: true,
    workId: representative.workId,
    exhibitionId: latest.exhibition.id,
    occurrenceId: latest.work.id,
    rendered: true,
    editSaveReload: true,
    historicalPricePreserved: true,
    imagePreserved: true,
    salesAndCertificateStatePreserved: true,
    productionRequests: 0
  }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
