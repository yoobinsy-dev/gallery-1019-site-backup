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
const personalWork = [{
  id: 'CHARACTERIZATION_TEST_PERSONAL_ACTIVE',
  userName: 'CHARACTERIZATION_TEST_ACTIVE_ARTIST',
  startDate: '2026-07-15',
  maxHours: 3,
  monthlyFee: 100000,
  lastPaymentDate: '2026-07-15',
  paymentHistory: ['2026-07-15']
}, {
  id: 'CHARACTERIZATION_TEST_PERSONAL_DORMANT',
  userName: 'CHARACTERIZATION_TEST_DORMANT_ARTIST',
  startDate: '2026-05-01',
  maxHours: 4,
  monthlyFee: 80000,
  lastPaymentDate: '2026-07-01',
  paymentHistory: ['2026-07-01'],
  isDormant: true,
  dormantCycleStart: '2026-07-01',
  dormantCycleEnd: '2026-08-01'
}];
const calendar = {
  events: [{
    id: 'CHARACTERIZATION_TEST_PERSONAL_ACTIVE_USAGE',
    kind: '개인작업',
    title: 'CHARACTERIZATION_TEST_ACTIVE_ARTIST',
    date: '2026-08-15',
    start: '13:00',
    end: '15:00'
  }, {
    id: 'CHARACTERIZATION_TEST_PERSONAL_DORMANT_USAGE',
    kind: '강사 지도 하 개인작업',
    title: 'CHARACTERIZATION_TEST_DORMANT_ARTIST',
    date: '2026-07-10',
    start: '09:00',
    end: '12:00'
  }],
  baseRules: [],
  baseRuleTimeline: [],
  baseWeekOverrides: {},
  studioUsers: [currentUser.name]
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
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
            'pottery-personal-work-v1': personalWork,
            'studio-calendar-state-v1': calendar,
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
  await context.addInitScript(({ user, fixturePersonalWork, fixtureCalendar }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', '[]');
    localStorage.setItem('pottery-students-v1', '[]');
    localStorage.setItem('pottery-personal-work-v1', JSON.stringify(fixturePersonalWork));
    localStorage.setItem('pottery-material-orders-v1', '[]');
    localStorage.setItem('pottery-accounting-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify(fixtureCalendar));
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
  }, { user: currentUser, fixturePersonalWork: personalWork, fixtureCalendar: calendar });

  try {
    await gotoReady(page, '/pottery-personal-work.html', '#personal-tbody');
    const stateBefore = await readBusinessState(page);
    const activeRow = page.locator('#personal-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_ACTIVE"]');
    assert.equal(await activeRow.count(), 1);
    assert.equal((await activeRow.locator('.period-col').textContent()).trim(), '2026-08-15 ~ 2026-09-15');
    assert.equal((await activeRow.locator('.personal-need-payment').textContent()).trim(), '결제 필요');
    assert.equal((await activeRow.locator('.used-col').textContent()).trim(), '2시간');
    assert.equal((await activeRow.locator('.remain-col').textContent()).trim(), '1시간');

    const dormantRow = page.locator('#personal-dormant-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_DORMANT"]');
    assert.equal(await dormantRow.count(), 1);
    assert.equal((await dormantRow.locator('.period-col').textContent()).trim(), '2026-07-01 ~ 2026-08-01');
    assert.equal(await dormantRow.locator('.personal-need-payment').count(), 0);
    assert.equal((await dormantRow.locator('.used-col').textContent()).trim(), '3시간');
    assert.equal((await dormantRow.locator('.remain-col').textContent()).trim(), '1시간');

    await activeRow.locator('.personal-action-btn.edit').click();
    assert.equal(await page.locator('#edit-start-CHARACTERIZATION_TEST_PERSONAL_ACTIVE').inputValue(), '2026-07-15');
    await activeRow.locator('.personal-action-btn.cancel').click();
    await activeRow.locator('.personal-action-btn.detail').click();
    assert.match(await page.locator('#personal-detail-payment-body').innerText(), /2026-07-15/);
    assert.match(await page.locator('#personal-detail-usage-body').innerText(), /2026-08-15 13:00~15:00/);
    await page.locator('#personal-detail-close').click();
    assert.deepEqual(await readBusinessState(page), stateBefore);

    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal((await page.locator('#personal-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_ACTIVE"] .remain-col').textContent()).trim(), '1시간');
    assert.equal((await page.locator('#personal-dormant-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_DORMANT"] .remain-col').textContent()).trim(), '1시간');
    assert.deepEqual(await readBusinessState(page), stateBefore);
    await gotoReady(page, '/pottery-master-calendar.html', 'body');

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(apiWrites, []);
    assert.deepEqual(productionRequests, []);
    console.log(JSON.stringify({
      ok: true,
      activeCycle: '2026-08-15 ~ 2026-09-15',
      activeUsage: 2,
      activeRemaining: 1,
      paymentRequired: true,
      dormantCycle: '2026-07-01 ~ 2026-08-01',
      dormantUsage: 3,
      dormantRemaining: 1,
      detailEditStable: true,
      reloadStable: true,
      businessStateUnchanged: true,
      calendarSmoke: true,
      apiWrites: 0,
      productionRequests: 0
    }));
  } finally {
    await browser.close();
  }
}

async function gotoReady(page, path, selector) {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  assert.ok(response && response.status() < 400, `${path} failed to load.`);
  await page.locator(selector).first().waitFor({ state: 'visible' });
}

async function readBusinessState(page) {
  return page.evaluate(() => ({
    personalWork: localStorage.getItem('pottery-personal-work-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});