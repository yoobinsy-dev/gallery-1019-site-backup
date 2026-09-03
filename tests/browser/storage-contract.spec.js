const { test, expect } = require('@playwright/test');

const PRODUCTION_HOST = 'gallery-1019-site.vercel.app';

test('cloud storage interception preserves native writes and coalesces one logical mutation', async ({ page }) => {
  const requests = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) throw new Error(`Production request blocked: ${url.href}`);
    if (url.pathname === '/api/state') {
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"meta":{}}' });
      } else {
        requests.push({ method: request.method(), body: request.postDataJSON() });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"ok":true,"meta":{"updatedAt":"2026-09-03T00:00:00.000Z"}}'
        });
      }
      return;
    }
    await route.continue();
  });

  await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.cloudSyncReady);
  const nativeResults = await page.evaluate(() => {
    const first = localStorage.setItem('users', JSON.stringify([{ id: 900001, name: 'first', unknownField: 'keep' }]));
    const second = localStorage.setItem('users', JSON.stringify([{ id: 900001, name: 'second', unknownField: 'keep' }]));
    return {
      firstType: typeof first,
      secondType: typeof second,
      stored: localStorage.getItem('users')
    };
  });
  expect(nativeResults).toEqual({
    firstType: 'undefined',
    secondType: 'undefined',
    stored: JSON.stringify([{ id: 900001, name: 'second', unknownField: 'keep' }])
  });
  await expect.poll(() => requests.length, { timeout: 4000 }).toBe(1);
  expect(requests[0]).toMatchObject({
    method: 'PUT',
    body: {
      key: 'users',
      value: [{ id: 900001, name: 'second', unknownField: 'keep' }]
    }
  });

  await page.evaluate(() => {
    const current = localStorage.getItem('users');
    localStorage.setItem('users', current);
  });
  await page.waitForTimeout(1700);
  expect(requests).toHaveLength(1);
});

test('remote state application emits its event without echoing a push', async ({ page }) => {
  const writes = [];
  await page.addInitScript(() => {
    const localUser = {
      id: 900002,
      name: 'CHARACTERIZATION_TEST_ADMIN',
      username: 'CHARACTERIZATION_TEST_ADMIN',
      password: 'test',
      accountType: '어드민',
      studioRole: '어드민',
      galleryRole: '어드민',
      siteAccess: 'both',
      approved: true
    };
    localStorage.setItem('users', JSON.stringify([localUser]));
    localStorage.setItem('currentUser', JSON.stringify(localUser));
    window.__storageAppliedEvents = [];
    window.addEventListener('cloud-sync:state-applied', (event) => {
      window.__storageAppliedEvents.push(event.detail);
    });
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) throw new Error(`Production request blocked: ${url.href}`);
    if (url.pathname === '/api/state') {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: { 'pottery-accounting-v1': [{ id: 'remote-entry', legacyField: 'keep' }] },
            meta: { 'pottery-accounting-v1': { updatedAt: '2026-09-03T01:00:00.000Z' } }
          })
        });
      } else {
        writes.push({ method: request.method(), body: request.postDataJSON() });
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      }
      return;
    }
    await route.continue();
  });

  await page.goto('/pottery-accounting.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.cloudSyncReady);
  await page.waitForTimeout(1700);
  const result = await page.evaluate(() => ({
    accounting: JSON.parse(localStorage.getItem('pottery-accounting-v1')),
    events: window.__storageAppliedEvents,
    appliedKeys: window.cloudSyncStatus.appliedRemoteKeys
  }));
  expect(result.accounting).toEqual([{ id: 'remote-entry', legacyField: 'keep' }]);
  expect(result.events).toEqual([{ keys: ['pottery-accounting-v1'] }]);
  expect(result.appliedKeys).toEqual(['pottery-accounting-v1']);
  expect(writes.filter((request) => request.body?.key === 'pottery-accounting-v1')).toEqual([]);
});

test('an open exhibition list renders remote state without reload or echo', async ({ browser }) => {
  const currentUser = {
    id: 900001,
    name: 'CHARACTERIZATION_TEST_ADMIN',
    username: 'CHARACTERIZATION_TEST_ADMIN',
    password: 'test',
    accountType: '어드민',
    galleryRole: '어드민',
    siteAccess: 'both',
    approved: true
  };
  const exhibitionId = 900101;
  const finalTitle = 'CHARACTERIZATION_TEST_REMOTE_EXHIBITION_R3';
  let remoteExhibitions = [];
  let releaseRemotePull;
  const remotePullReady = new Promise((resolve) => {
    releaseRemotePull = resolve;
  });
  const contextAWrites = [];
  const contextBWrites = [];

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await Promise.all([contextA, contextB].map((context) => context.addInitScript((user) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('exhibitions', '[]');
  }, currentUser)));
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) throw new Error(`Production request blocked: ${url.href}`);
    if (url.pathname !== '/api/state') {
      await route.continue();
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { exhibitions: remoteExhibitions }, meta: {} })
      });
      return;
    }
    const body = request.postDataJSON();
    contextAWrites.push(body);
    remoteExhibitions = body.value;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true,"meta":{"updatedAt":"2026-09-03T02:00:00.000Z"}}'
    });
  });
  await pageB.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === PRODUCTION_HOST) throw new Error(`Production request blocked: ${url.href}`);
    if (url.pathname !== '/api/state') {
      await route.continue();
      return;
    }
    if (request.method() === 'GET') {
      await remotePullReady;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { exhibitions: remoteExhibitions },
          meta: { exhibitions: { updatedAt: '2026-09-03T02:00:00.000Z' } }
        })
      });
      return;
    }
    contextBWrites.push(request.postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  try {
    await pageB.addInitScript(() => {
      window.__storageAppliedEvents = [];
      window.addEventListener('cloud-sync:state-applied', (event) => {
        window.__storageAppliedEvents.push(event.detail);
      });
    });
    await pageB.goto('/exhibitions.html', { waitUntil: 'domcontentloaded' });
    await expect(pageB.locator('#exhibitions-tbody')).toContainText('등록된 전시가 없습니다.');

    await pageA.goto('/exhibitions.html', { waitUntil: 'domcontentloaded' });
    await pageA.evaluate(() => window.cloudSyncReady);
    for (const revision of [1, 2, 3]) {
      await pageA.evaluate(({ id, title, revisionNumber }) => {
        localStorage.setItem('exhibitions', JSON.stringify([{
          id,
          title: `${title}_R${revisionNumber}`,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          type: '단체전',
          participants: [],
          active: true,
          createdAt: '2026-09-03T00:00:00.000Z',
          updatedAt: `2026-09-03T00:00:0${revisionNumber}.000Z`,
          works: []
        }]));
      }, { id: exhibitionId, title: 'CHARACTERIZATION_TEST_REMOTE_EXHIBITION', revisionNumber: revision });
    }
    await expect.poll(() => contextAWrites.length, { timeout: 4000 }).toBe(1);
    expect(contextAWrites[0]).toMatchObject({ key: 'exhibitions' });

    releaseRemotePull();
    await pageB.evaluate(() => window.cloudSyncReady);
    const contextBResult = await pageB.evaluate(({ id, title }) => ({
      stored: JSON.parse(localStorage.getItem('exhibitions') || '[]')
        .some((exhibition) => exhibition.id === id && exhibition.title === title),
      events: window.__storageAppliedEvents,
      appliedKeys: window.cloudSyncStatus.appliedRemoteKeys
    }), { id: exhibitionId, title: finalTitle });
    expect(contextBResult).toEqual({
      stored: true,
      events: [{ keys: ['exhibitions'] }],
      appliedKeys: ['exhibitions']
    });
    await expect(pageB.locator('#exhibitions-tbody')).toContainText(finalTitle);
    await pageB.waitForTimeout(1700);
    expect(contextBWrites).toEqual([]);
  } finally {
    releaseRemotePull();
    await contextA.close();
    await contextB.close();
  }
});