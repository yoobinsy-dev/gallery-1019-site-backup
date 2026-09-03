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