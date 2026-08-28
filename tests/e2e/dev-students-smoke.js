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
const students = [{
  id: 'CHARACTERIZATION_TEST_STUDENT_ID',
  name: 'CHARACTERIZATION_TEST_STUDENT',
  studentGroup: '정규반',
  classTime: '수 10:00~11:00',
  classType: '정규 수강',
  instructor: currentUser.name,
  tuition: 120000,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-07-01',
  paymentHistory: ['2026-07-01'],
  paymentRecords: [{
    id: 'CHARACTERIZATION_TEST_PAYMENT',
    date: '2026-07-01',
    tuition: 120000,
    basis: '4회',
    credits: 4
  }],
  creditTrackingStartDate: '2026-07-01',
  carryOverBeforePayment: 1,
  paymentCycleCredits: 4,
  manualUsedAdjustment: 1
}];
const calendar = {
  events: [{
    id: 'CHARACTERIZATION_TEST_STUDENT_CLASS',
    kind: '수강',
    title: 'CHARACTERIZATION_TEST_STUDENT',
    instructor: currentUser.name,
    date: '2026-07-01',
    start: '10:00',
    end: '11:00',
    repeatWeekly: true,
    repeatEndDate: '2026-07-15',
    repeatSkipDates: ['2026-07-08']
  }],
  baseRules: [],
  baseRuleTimeline: [],
  baseWeekOverrides: {},
  studioUsers: [currentUser.name, students[0].name]
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
            'pottery-students-v1': students,
            'pottery-personal-work-v1': [],
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
  await context.addInitScript(({ user, fixtureStudents, fixtureCalendar }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', '[]');
    localStorage.setItem('pottery-students-v1', JSON.stringify(fixtureStudents));
    localStorage.setItem('pottery-personal-work-v1', '[]');
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
  }, { user: currentUser, fixtureStudents: students, fixtureCalendar: calendar });

  try {
    await gotoReady(page, '/pottery-students.html', '#students-tbody');
    const stateBefore = await readBusinessState(page);
    const studentRow = page.locator('#students-tbody tr').filter({ hasText: students[0].name });
    assert.equal(await studentRow.count(), 1);
    assert.match((await studentRow.locator('td').nth(5).textContent()).trim(), /2026-07-15/);
    assert.equal((await studentRow.locator('.remaining-badge').textContent()).trim(), '2');
    assert.equal(await studentRow.locator('.row-action-btn.payment-add').isVisible(), true);
    assert.equal(await studentRow.locator('.row-action-btn.edit').isVisible(), true);
    assert.equal(await studentRow.locator('.row-action-btn.delete').isVisible(), true);

    await studentRow.locator('.row-action-btn.detail').click();
    const detailText = await page.locator('#student-detail-payment-class-body').innerText();
    assert.match(detailText, /2026-07-01/);
    assert.match(detailText, /4회/);
    assert.match(detailText, /120,000원/);
    assert.match(detailText, /2026-07-15/);
    assert.doesNotMatch(detailText, /2026-07-08/);
    await page.locator('#student-detail-close-btn').click();

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await studentRow.locator('.remaining-badge').textContent()).trim(), '2');
    assert.deepEqual(await readBusinessState(page), stateBefore);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedRow = page.locator('#students-tbody tr').filter({ hasText: students[0].name });
    assert.equal((await reloadedRow.locator('.remaining-badge').textContent()).trim(), '2');
    assert.deepEqual(await readBusinessState(page), stateBefore);

    await gotoReady(page, '/pottery-master-calendar.html', 'body');
    await gotoReady(page, '/pottery-personal-work.html', 'body');

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(apiWrites, []);
    assert.deepEqual(productionRequests, []);
    console.log(JSON.stringify({
      ok: true,
      remainingCredits: 2,
      recentClassDate: '2026-07-15',
      cancelledOccurrenceAbsent: true,
      paymentDetailStable: true,
      roleActionsVisible: true,
      recomputeStable: true,
      reloadStable: true,
      businessStateUnchanged: true,
      calendarSmoke: true,
      personalWorkSmoke: true,
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
    students: localStorage.getItem('pottery-students-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});