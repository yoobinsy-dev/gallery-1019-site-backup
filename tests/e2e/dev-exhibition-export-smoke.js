const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const {
  DEVELOPMENT_IDENTITIES,
  assertMutableTestTarget,
  assertSyntheticIdentifier
} = require('../helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const PRODUCTION_HOST = 'gallery-1019-site.vercel.app';
const EXHIBITION_TITLE = 'CHARACTERIZATION_TEST_EXHIBITION_EXPORT_DEV';
const currentUser = {
  id: 900001,
  username: 'CHARACTERIZATION_TEST_ADMIN',
  name: 'CHARACTERIZATION_TEST_ADMIN',
  password: 'not-a-real-credential',
  accountType: '어드민',
  studioRole: '어드민',
  galleryRole: '어드민',
  siteAccess: 'both'
};
const exhibitions = [{
  id: 900001,
  title: EXHIBITION_TITLE,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  managers: [currentUser.name],
  works: [{
    id: 900101,
    manualNumber: 'W-1',
    title: 'CHARACTERIZATION_TEST_WORK_EXPORT_DEV',
    author: currentUser.name,
    saved: true
  }],
  soldWorks: [{
    id: 900201,
    manualNumber: 'S-1',
    itemType: '작품',
    title: 'CHARACTERIZATION_TEST_SALE_EXPORT_DEV',
    buyerName: 'Buyer DEV',
    price: 250001
  }],
  manualRevenueItems: [],
  expenseItems: []
}];

async function main() {
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    archiveWriteEnabled: false
  });
  assertSyntheticIdentifier(EXHIBITION_TITLE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const productionRequests = [];
  const apiWrites = [];
  const pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) {
      productionRequests.push(url.href);
      await route.abort();
      return;
    }
    if (url.pathname === '/api/state') {
      if (request.method() !== 'GET') {
        apiWrites.push(`${request.method()} ${url.pathname}`);
        await route.abort();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { users: [currentUser], exhibitions },
          meta: {}
        })
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') apiWrites.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    await route.continue();
  });
  await context.addInitScript(({ user, fixtureExhibitions }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', JSON.stringify(fixtureExhibitions));
  }, { user: currentUser, fixtureExhibitions: exhibitions });

  try {
    const response = await page.goto(`${BASE_URL}/exhibition-detail.html?id=900001`, {
      waitUntil: 'networkidle'
    });
    assert.ok(response && response.status() < 400);

    const result = await page.evaluate(async () => {
      const captureExport = async (actionName) => {
        const originalCreateObjectURL = URL.createObjectURL;
        const originalClick = HTMLAnchorElement.prototype.click;
        let blob;
        let filename;
        URL.createObjectURL = (value) => {
          blob = value;
          return 'blob:dev-smoke';
        };
        HTMLAnchorElement.prototype.click = function click() {
          filename = this.download;
        };
        try {
          window[actionName]();
          return { filename, content: await blob.text() };
        } finally {
          URL.createObjectURL = originalCreateObjectURL;
          HTMLAnchorElement.prototype.click = originalClick;
        }
      };
      return {
        moduleLoaded: typeof ExhibitionExportModel === 'object',
        works: await captureExport('exportWorksToExcel'),
        sales: await captureExport('exportSalesToExcel'),
        accounting: await captureExport('exportAccountingToExcel')
      };
    });

    assert.equal(result.moduleLoaded, true);
    assert.equal(result.works.filename, `${EXHIBITION_TITLE}-works.xls`);
    assert.match(result.works.content, /CHARACTERIZATION_TEST_WORK_EXPORT_DEV/);
    assert.equal(result.sales.filename, `${EXHIBITION_TITLE}-sales.xls`);
    assert.match(result.sales.content, /Buyer DEV/);
    assert.equal(result.accounting.filename, `${EXHIBITION_TITLE}-accounting.xls`);
    assert.match(result.accounting.content, /작품 판매/);
    assert.match(result.accounting.content, /총이익/);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(productionRequests, []);
    assert.deepEqual(apiWrites, []);

    console.log(JSON.stringify({
      ok: true,
      deploymentHost: new URL(BASE_URL).hostname,
      exports: [result.works.filename, result.sales.filename, result.accounting.filename],
      productionRequests: 0,
      apiWrites: 0
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
