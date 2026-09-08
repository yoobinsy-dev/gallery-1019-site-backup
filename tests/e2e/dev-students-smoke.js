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
  manualUsedAdjustment: 1,
  creditLedgerV2: {
    version: 2,
    openingDate: '2026-07-26',
    openingBalance: 3,
    openingConfirmed: true,
    openingConfirmedAt: '2026-09-08T00:00:00.000Z',
    adjustments: []
  }
}, {
  id: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT_ID',
  name: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT',
  studentGroup: '정규반',
  instructor: currentUser.name,
  tuition: 250000,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-09-02',
  paymentHistory: ['2026-08-04', '2026-09-02'],
  paymentRecords: [
    { id: 'PAYMENT_CYCLE_AUGUST', date: '2026-08-04', tuition: 250000, basis: '4회', credits: 2 },
    { id: 'PAYMENT_CYCLE_SEPTEMBER', date: '2026-09-02', tuition: 250000, basis: '4회', credits: 4 }
  ],
  creditTrackingStartDate: '2026-08-04',
  carryOverBeforePayment: 0,
  paymentCycleCredits: 2,
  manualUsedAdjustment: 0,
  creditLedgerV2: {
    version: 2,
    openingDate: '2026-07-26',
    openingBalance: 0,
    openingConfirmed: true,
    openingConfirmedAt: '2026-09-08T00:00:00.000Z',
    adjustments: []
  }
}, {
  id: 'PAYMENT_CYCLE_REDUCED_STUDENT_ID',
  name: 'PAYMENT_CYCLE_REDUCED_STUDENT',
  studentGroup: '정규반',
  instructor: currentUser.name,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-08-04',
  paymentHistory: ['2026-08-04'],
  paymentRecords: [
    { id: 'PAYMENT_CYCLE_REDUCED_LEGACY', date: '2026-08-04', tuition: 250000, basis: '4회', credits: 2 }
  ],
  creditTrackingStartDate: '2026-08-04',
  carryOverBeforePayment: 0,
  paymentCycleCredits: 2,
  manualUsedAdjustment: 0,
  creditLedgerV2: {
    version: 2,
    openingDate: '2026-07-26',
    openingBalance: -2,
    openingConfirmed: true,
    openingConfirmedAt: '2026-09-08T00:00:00.000Z',
    adjustments: []
  }
}, {
  id: 'PAYMENT_CYCLE_RENEWED_STUDENT_ID',
  name: 'PAYMENT_CYCLE_RENEWED_STUDENT',
  studentGroup: '정규반',
  instructor: currentUser.name,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-09-05',
  paymentHistory: ['2026-08-04', '2026-09-05'],
  paymentRecords: [
    { id: 'PAYMENT_CYCLE_RENEWED_LEGACY', date: '2026-08-04', tuition: 250000, basis: '4회', credits: 2 },
    { id: 'PAYMENT_CYCLE_RENEWAL', date: '2026-09-05', tuition: 250000, basis: '4회', credits: 4 }
  ],
  creditTrackingStartDate: '2026-08-04',
  carryOverBeforePayment: 0,
  paymentCycleCredits: 2,
  manualUsedAdjustment: 0
}, {
  id: 'CREDIT_LEDGER_V2_MONTHLY_STUDENT_ID',
  name: 'CREDIT_LEDGER_V2_MONTHLY_STUDENT',
  studentGroup: '정규반',
  instructor: currentUser.name,
  tuitionBasis: '월초',
  paymentHistory: [],
  paymentRecords: []
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
  }, ...[
    ['PAYMENT_CYCLE_CLASS_1', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-04'],
    ['PAYMENT_CYCLE_CLASS_2', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-11'],
    ['PAYMENT_CYCLE_CLASS_5', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-09-01'],
    ['PAYMENT_CYCLE_CLASS_6', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-09-08'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_A', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-08-11'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_B', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-08-28'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_C', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-09-04'],
    ['PAYMENT_CYCLE_RENEWED_CLASS_A', 'PAYMENT_CYCLE_RENEWED_STUDENT', '2026-08-11'],
    ['PAYMENT_CYCLE_RENEWED_CLASS_B', 'PAYMENT_CYCLE_RENEWED_STUDENT', '2026-08-28'],
    ['PAYMENT_CYCLE_RENEWED_CLASS_C', 'PAYMENT_CYCLE_RENEWED_STUDENT', '2026-09-04']
  ].map(([id, title, date]) => ({
    id,
    kind: '수강',
    title,
    instructor: currentUser.name,
    date,
    start: '10:00',
    end: '11:00'
  }))],
  baseRules: [],
  baseRuleTimeline: [],
  baseWeekOverrides: {},
  studioUsers: [currentUser.name, ...students.map((student) => student.name)]
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
    const fixedTime = new RealDate('2026-09-08T12:00:00').getTime();
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

    const cycleRow = page.locator('#students-tbody tr').filter({ hasText: students[1].name });
    assert.equal((await cycleRow.locator('.remaining-badge').textContent()).trim(), '2');
    await cycleRow.locator('.row-action-btn.detail').click();
    const cycleDetail = await page.locator('#student-detail-payment-class-body').innerText();
    assert.ok(cycleDetail.indexOf('2026-09-08') < cycleDetail.indexOf('2026-09-01'));
    assert.ok(cycleDetail.indexOf('2026-09-01') < cycleDetail.indexOf('2026-08-11'));
    assert.doesNotMatch(cycleDetail, /이전 결제 사이클/);
    await page.locator('#student-detail-close-btn').click();

    const reducedRow = page.locator('#students-tbody tr').filter({ hasText: students[2].name });
    assert.equal((await reducedRow.locator('.remaining-badge').textContent()).trim(), '0');
    await reducedRow.locator('.row-action-btn.detail').click();
    assert.match(await page.locator('#student-detail-payment-class-body').innerText(), /다음 결제 대기[\s\S]*2026-09-04/);
    await page.locator('#student-detail-close-btn').click();

    const renewedRow = page.locator('#students-tbody tr').filter({ hasText: students[3].name });
    assert.equal((await renewedRow.locator('.remaining-badge').textContent()).trim(), '3');
    await renewedRow.locator('.row-action-btn.detail').click();
    const renewedDetail = await page.locator('#student-detail-payment-class-body').innerText();
    assert.match(renewedDetail, /2026-09-05[\s\S]*4회[\s\S]*4[\s\S]*2026-09-04/);
    await page.locator('#student-detail-close-btn').click();

    const v2SetupRows = page.locator('#credit-ledger-v2-setup-body tr');
    assert.equal(await v2SetupRows.count(), 4);
    assert.doesNotMatch(await page.locator('#credit-ledger-v2-setup-body').innerText(), /CREDIT_LEDGER_V2_MONTHLY_STUDENT/);
    assert.match(await page.locator('#credit-ledger-v2-progress').innerText(), /3 \/ 4/);
    assert.equal((await v2SetupRows.filter({ hasText: students[0].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '3');
    assert.equal((await v2SetupRows.filter({ hasText: students[1].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '0');
    assert.equal((await v2SetupRows.filter({ hasText: students[2].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '-2');
    const signedV2Row = v2SetupRows.filter({ hasText: students[1].name });
    assert.equal((await signedV2Row.locator('.credit-ledger-v2-balance').textContent()).trim(), '+2');
    assert.equal((await v2SetupRows.filter({ hasText: students[2].name })
      .locator('.credit-ledger-v2-balance').textContent()).trim(), '-3');
    await signedV2Row.locator('.credit-ledger-v2-preview').click();
    const v2History = await page.locator('#credit-ledger-v2-history-body').innerText();
    const sameDayV2Rows = page.locator('#credit-ledger-v2-history-body tr').filter({ hasText: '2026-08-04' });
    assert.equal(await sameDayV2Rows.count(), 2);
    assert.match(await sameDayV2Rows.nth(0).innerText(), /결제 2회/);
    assert.match(await sameDayV2Rows.nth(1).innerText(), /수업/);
    assert.match(v2History, /기초 잔액/);
    assert.doesNotMatch(v2History, /대기|사이클/);
    await page.locator('#credit-ledger-v2-close-btn').click();

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await studentRow.locator('.remaining-badge').textContent()).trim(), '2');
    assert.deepEqual(await readBusinessState(page), stateBefore);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedRow = page.locator('#students-tbody tr').filter({ hasText: students[0].name });
    assert.equal((await reloadedRow.locator('.remaining-badge').textContent()).trim(), '2');
    assert.equal((await page.locator('#students-tbody tr').filter({ hasText: students[1].name })
      .locator('.remaining-badge').textContent()).trim(), '2');
    assert.equal((await page.locator('#students-tbody tr').filter({ hasText: students[2].name })
      .locator('.remaining-badge').textContent()).trim(), '0');
    assert.equal((await page.locator('#students-tbody tr').filter({ hasText: students[3].name })
      .locator('.remaining-badge').textContent()).trim(), '3');
    assert.equal((await page.locator('#credit-ledger-v2-setup-body tr').filter({ hasText: students[0].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '3');
    assert.equal((await page.locator('#credit-ledger-v2-setup-body tr').filter({ hasText: students[1].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '0');
    assert.equal((await page.locator('#credit-ledger-v2-setup-body tr').filter({ hasText: students[2].name })
      .locator('.credit-ledger-v2-opening-input').inputValue()), '-2');
    assert.deepEqual(await readBusinessState(page), stateBefore);

    await gotoReady(page, '/pottery-master-calendar.html', 'body');
    await gotoReady(page, '/pottery-personal-work.html', 'body');

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(apiWrites, []);
    assert.deepEqual(productionRequests, []);
    console.log(JSON.stringify({
      ok: true,
      remainingCredits: 2,
      latePaymentRemainingCredits: 2,
      laterPaymentCapacity: 4,
      reducedStartingBalanceRemainingCredits: 0,
      exhaustedLegacyPending: true,
      renewedPaymentCapacity: 4,
      renewedRemainingCredits: 3,
      latePaymentDetailOrdered: true,
      recentClassDate: '2026-07-15',
      cancelledOccurrenceAbsent: true,
      paymentDetailStable: true,
      roleActionsVisible: true,
      recomputeStable: true,
      reloadStable: true,
      v2SignedOpenings: [3, 0, -2],
      v2MonthlyExcluded: true,
      v2SameDayPaymentFirst: true,
      v2NegativeCurrentBalance: -3,
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