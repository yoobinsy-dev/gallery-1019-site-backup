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
const orders = [{
  id: 'CHARACTERIZATION_TEST_ORDER_A',
  orderDate: '2025-04-02',
  createdAt: '2025-04-02T00:00:00.000Z',
  orderWideDiscount: false,
  orderWideShipping: false,
  items: [{
    id: 'CHARACTERIZATION_TEST_ITEM_A', category: '흙', site: '클레이어', product: 'Clay A', quantity: 2,
    price: 10000, discount: 1000, shippingFee: 500, status: '주문 완료'
  }, {
    id: 'CHARACTERIZATION_TEST_ITEM_B', category: '유약', site: '대원도재', product: 'Glaze B', quantity: 1,
    price: 20000, discount: 2000, shippingFee: 1000, status: '배송중'
  }]
}, {
  id: 'CHARACTERIZATION_TEST_ORDER_B',
  orderDate: '2025-04-01',
  createdAt: '2025-04-01T00:00:00.000Z',
  orderWideDiscount: false,
  orderWideShipping: false,
  items: [{
    id: 'CHARACTERIZATION_TEST_ITEM_C', category: '기타', site: '중앙도재', product: 'Tool C', quantity: 1,
    price: 5000, discount: null, shippingFee: null, status: '배송 완료'
  }]
}];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const browserErrors = [];
  const apiWrites = [];
  const productionRequests = [];

  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
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
            exhibitions: [],
            'pottery-students-v1': [],
            'pottery-personal-work-v1': [],
            'studio-calendar-state-v1': { events: [], baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {} },
            'pottery-material-orders-v1': orders,
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
  await context.addInitScript(({ user, fixtureOrders }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', '[]');
    localStorage.setItem('pottery-students-v1', '[]');
    localStorage.setItem('pottery-personal-work-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify({ events: [], baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {} }));
    localStorage.setItem('pottery-material-orders-v1', JSON.stringify(fixtureOrders));
    localStorage.setItem('pottery-accounting-v1', '[]');
  }, { user: currentUser, fixtureOrders: orders });

  await page.clock.setFixedTime(new Date('2025-04-15T12:00:00'));
  const response = await page.goto(`${BASE_URL}/pottery-material-orders.html`, { waitUntil: 'networkidle' });
  assert.ok(response && response.status() < 400, 'Material orders page failed to load.');

  const firstRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_A"]');
  const secondRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_B"]');
  const thirdRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_C"]');
  assert.equal(await page.locator('#month-label').innerText(), '2025년 4월');
  assert.equal(await firstRow.locator('td[data-merge-col="number"]').innerText(), '2');
  assert.equal(await firstRow.locator('td[data-merge-col="number"]').getAttribute('rowspan'), '2');
  assert.match(await page.locator('.orders-total-row').innerText(), /33,500원/);

  await firstRow.locator('[data-action="edit"]').click();
  const firstProduct = firstRow.locator('.js-edit-product');
  await firstProduct.fill('Clay A Edited');
  await firstProduct.press('ArrowRight');
  assert.equal(await firstRow.locator('.js-edit-quantity').evaluate((element) => element === document.activeElement), true);

  await firstProduct.click();
  await secondRow.locator('.js-edit-product').click({ modifiers: ['Shift'] });
  await page.locator('#order-merge-cells-btn').click();
  assert.equal(await firstRow.locator('td[data-merge-col="product"]').getAttribute('rowspan'), '2');

  await firstRow.locator('.js-edit-product').click();
  await thirdRow.locator('td[data-merge-col="product"]').click({ modifiers: ['Shift'] });
  await page.locator('#order-merge-cells-btn').click();
  assert.equal(await firstRow.locator('td[data-merge-col="product"]').getAttribute('rowspan'), '3');

  await page.locator('#order-undo-btn').click();
  assert.equal(await firstRow.locator('td[data-merge-col="product"]').getAttribute('rowspan'), '2');
  assert.match(await firstRow.locator('td[data-merge-col="product"]').innerText(), /Clay A Edited/);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#order-export-btn').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), '재료주문_2025-04.csv');

  assert.deepEqual(browserErrors, []);
  assert.deepEqual(apiWrites, []);
  assert.deepEqual(productionRequests, []);
  console.log(JSON.stringify({
    ok: true,
    groupingStable: true,
    keyboardFocusStable: true,
    mergeUndoStable: true,
    exportFilename: download.suggestedFilename(),
    apiWrites: apiWrites.length,
    productionRequests: productionRequests.length
  }));
  await browser.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});