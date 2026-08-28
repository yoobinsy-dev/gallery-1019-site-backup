const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const PRODUCTION_HOST = 'gallery-1019-site.vercel.app';
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
  title: 'CHARACTERIZATION_TEST_EXHIBITION',
  endDate: '2026-08-31',
  soldWorks: [
    { id: 1, itemType: '작품', price: 250001 },
    { id: 2, itemType: '굿즈', price: 5000, soldQuantity: 2 }
  ],
  artSoldWorks: [],
  soldGoods: []
}];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const productionRequests = [];
  const apiWrites = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) {
      productionRequests.push(url.href);
      await route.abort();
      return;
    }
    if (url.pathname === '/api/state') {
      if (request.method() !== 'GET') apiWrites.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            users: [currentUser],
            exhibitions,
            'pottery-students-v1': [],
            'pottery-personal-work-v1': [],
            'studio-calendar-state-v1': { events: [], baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {} },
            'pottery-material-orders-v1': [],
            'pottery-accounting-v1': []
          },
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
    localStorage.setItem('pottery-accounting-v1', '[]');
    localStorage.setItem('pottery-students-v1', '[]');
    localStorage.setItem('pottery-personal-work-v1', '[]');
    localStorage.setItem('pottery-material-orders-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify({
      events: [], baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {}
    }));
    const RealDate = Date;
    const fixedTime = new RealDate('2026-08-15T12:00:00').getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length > 0 ? args : [fixedTime]));
      }

      static now() {
        return fixedTime;
      }
    }
    globalThis.Date = FixedDate;
  }, { user: currentUser, fixtureExhibitions: exhibitions });

  try {
    const response = await page.goto(`${BASE_URL}/pottery-accounting.html`, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400);
    await page.locator('#accounting-tab-gallery').waitFor({ state: 'visible' });
    const accountingBefore = await page.evaluate(() => localStorage.getItem('pottery-accounting-v1'));

    await page.locator('#accounting-tab-gallery').click();
    await assertText(page, '#accounting-month-label', '2026년 8월');
    await assertText(page, '#accounting-total-revenue', '260,001원');
    await assertText(page, '#accounting-total-expense', '158,001원');
    await assertText(page, '#accounting-total-profit', '102,000원');

    const artRow = page.locator('#accounting-revenue-body .accounting-category-row').filter({ hasText: '작품 판매' });
    const goodsRow = page.locator('#accounting-revenue-body .accounting-category-row').filter({ hasText: '굿즈 판매' });
    assert.equal((await artRow.locator('.accounting-category-amount').textContent()).trim(), '250,001원');
    assert.equal((await goodsRow.locator('.accounting-category-amount').textContent()).trim(), '10,000원');
    await artRow.locator('button[data-action="toggle-category"]').click();
    assert.equal((await artRow.locator('.accounting-status-cell').textContent()).trim(), '상세 열림');

    await page.locator('#accounting-tab-pottery').click();
    await page.locator('#accounting-tab-gallery').click();
    await assertText(page, '#accounting-total-revenue', '260,001원');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#accounting-export-btn').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^갤러리-회계-2026-08\.(xlsx|csv)$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('pottery-accounting-v1')), accountingBefore);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#accounting-tab-gallery').click();
    await assertText(page, '#accounting-total-revenue', '260,001원');
    assert.equal(await page.evaluate(() => localStorage.getItem('pottery-accounting-v1')), accountingBefore);

    for (const path of ['/index.html', '/exhibitions.html']) {
      const startupResponse = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
      assert.ok(startupResponse && startupResponse.status() < 400, `${path} failed to start.`);
      await page.locator('body').waitFor({ state: 'visible' });
    }

    assert.deepEqual(errors, []);
    assert.deepEqual(apiWrites, []);
    assert.deepEqual(productionRequests, []);
    console.log(JSON.stringify({
      ok: true,
      accountingTotals: { revenue: 260001, expense: 158001, profit: 102000 },
      exportFilename: download.suggestedFilename(),
      reloadStable: true,
      accountingStorageUnchanged: true,
      surroundingPages: ['index.html', 'exhibitions.html'],
      apiWrites: 0,
      productionRequests: 0
    }));
  } finally {
    await browser.close();
  }
}

async function assertText(page, selector, expected) {
  assert.equal((await page.locator(selector).textContent()).trim(), expected);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});