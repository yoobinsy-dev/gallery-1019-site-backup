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
const calendar = {
  events: [],
  baseRules: [],
  baseRuleTimeline: [],
  baseWeekOverrides: {},
  studioUsers: [],
  instructors: [currentUser.name],
  classTeachingLog: []
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    await route.continue();
  });
  await context.addInitScript(({ user, fixtureCalendar }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', '[]');
    localStorage.setItem('pottery-students-v1', '[]');
    localStorage.setItem('pottery-personal-work-v1', '[]');
    localStorage.setItem('pottery-material-orders-v1', '[]');
    localStorage.setItem('pottery-accounting-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify(fixtureCalendar));
    const RealDate = Date;
    const fixedTime = new RealDate('2026-09-03T12:00:00').getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length > 0 ? args : [fixedTime]));
      }

      static now() {
        return fixedTime;
      }
    }
    globalThis.Date = FixedDate;
  }, { user: currentUser, fixtureCalendar: calendar });

  try {
    const response = await page.goto(`${BASE_URL}/pottery-master-calendar.html`, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400);
    await page.locator('#open-add-event-btn').waitFor({ state: 'visible' });

    await page.locator('#open-add-event-btn').click();
    await page.locator('#event-kind').selectOption('기타');
    await page.locator('#event-title').fill('CHARACTERIZATION_TEST_CALENDAR');
    await page.locator('#event-date').fill('2026-09-03');
    await page.locator('#event-start').fill('10:00');
    await page.locator('#event-end').fill('11:00');
    await page.locator('#save-event-btn').click();

    const createdBubble = page.locator('.event-bubble[title="CHARACTERIZATION_TEST_CALENDAR"]');
    await createdBubble.waitFor({ state: 'visible' });
    let stored = await readCalendar(page);
    assert.equal(stored.events.length, 1);
    assert.deepEqual(pickEvent(stored.events[0]), {
      kind: '기타',
      title: 'CHARACTERIZATION_TEST_CALENDAR',
      date: '2026-09-03',
      start: '10:00',
      end: '11:00'
    });

    await createdBubble.click();
    await page.locator('#quick-edit-title').fill('CHARACTERIZATION_TEST_CALENDAR_EDITED');
    await page.locator('#quick-edit-start').fill('11:00');
    await page.locator('#quick-edit-end').fill('12:00');
    await page.locator('#save-event-quick-edit-btn').click();

    const editedBubble = page.locator('.event-bubble[title="CHARACTERIZATION_TEST_CALENDAR_EDITED"]');
    await editedBubble.waitFor({ state: 'visible' });
    stored = await readCalendar(page);
    assert.deepEqual(pickEvent(stored.events[0]), {
      kind: '기타',
      title: 'CHARACTERIZATION_TEST_CALENDAR_EDITED',
      date: '2026-09-03',
      start: '11:00',
      end: '12:00'
    });

    await editedBubble.locator('.event-bubble-delete').click();
    await page.locator('#delete-confirm-ok-btn').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('studio-calendar-state-v1')).events.length === 0);
    assert.deepEqual(await readCalendar(page), calendar);

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(productionRequests, []);
    assert.deepEqual(apiWrites, []);
    console.log(JSON.stringify({
      ok: true,
      createStable: true,
      quickEditStable: true,
      exactCleanup: true,
      apiWrites: 0,
      productionRequests: 0
    }));
  } finally {
    await browser.close();
  }
}

async function readCalendar(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('studio-calendar-state-v1')));
}

function pickEvent(event) {
  return {
    kind: event.kind,
    title: event.title,
    date: event.date,
    start: event.start,
    end: event.end
  };
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});