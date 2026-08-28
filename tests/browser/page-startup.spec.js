const { test, expect } = require('@playwright/test');

const PRODUCTION_HOST = 'gallery-1019-site.vercel.app';
const EXHIBITION_ID = 900001;
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
  id: EXHIBITION_ID,
  title: 'CHARACTERIZATION_TEST_EXHIBITION',
  name: 'CHARACTERIZATION_TEST_EXHIBITION',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  managers: [currentUser.name],
  works: [],
  artWorks: [],
  goods: [],
  soldWorks: [
    { id: 1, itemType: '작품', price: 250001 },
    { id: 2, itemType: '굿즈', price: 5000, soldQuantity: 2 }
  ],
  artSoldWorks: [],
  soldGoods: []
}];

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === PRODUCTION_HOST) {
      throw new Error(`Production request blocked: ${url.href}`);
    }
    if (url.pathname === '/api/state') {
      const payload = {
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
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshots: [] }) });
      return;
    }
    await route.continue();
  });
  await page.addInitScript(({ user, fixtureExhibitions }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify([user]));
    localStorage.setItem('exhibitions', JSON.stringify(fixtureExhibitions));
    localStorage.setItem('pottery-students-v1', '[]');
    localStorage.setItem('pottery-personal-work-v1', '[]');
    localStorage.setItem('pottery-material-orders-v1', '[]');
    localStorage.setItem('pottery-accounting-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify({ events: [], baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {} }));
  }, { user: currentUser, fixtureExhibitions: exhibitions });
});

const pages = [
  ['login', '/login.html'],
  ['landing', '/index.html'],
  ['exhibition list', '/exhibitions.html'],
  ['exhibition detail', `/exhibition-detail.html?id=${EXHIBITION_ID}`],
  ['inventory', '/inventory.html'],
  ['studio calendar', '/pottery-master-calendar.html'],
  ['students', '/pottery-students.html'],
  ['personal work', '/pottery-personal-work.html'],
  ['material orders', '/pottery-material-orders.html'],
  ['accounting', '/pottery-accounting.html']
];

for (const [name, path] of pages) {
  test(`${name} starts without uncaught JavaScript or missing local scripts`, async ({ page }) => {
    const pageErrors = [];
    const missingScripts = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.endsWith('.js')) {
        missingScripts.push(`${response.status()} ${response.url()}`);
      }
    });
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBeLessThan(400);
    await page.waitForTimeout(250);
    expect(missingScripts).toEqual([]);
    expect(pageErrors).toEqual([]);
    await expect(page.locator('body')).toBeVisible();
  });
}

test('certificate generation resolves synthetic Blob-backed art and produces a valid XLSX archive', async ({ page }) => {
  const blobUrl = 'https://characterization-test.public.blob.vercel-storage.com/exhibition-images/900001/full/test.png';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nVQAAAAASUVORK5CYII=', 'base64');
  await page.route(blobUrl, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      contentType: 'image/png',
      body: png
    });
  });
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async (source) => {
    if (typeof window.buildCertificateWorkbookBlob !== 'function') {
      throw new Error('Certificate generator global is unavailable.');
    }
    const sold = {
      workId: 1,
      author: 'CHARACTERIZATION_TEST_ARTIST',
      title: 'CHARACTERIZATION_TEST_WORK',
      soldAtKst: '2026-08-28 12:00:00',
      certificateReady: false,
      certificateVersion: 0
    };
    const work = {
      id: 1,
      author: sold.author,
      title: sold.title,
      materials: 'Synthetic clay',
      size: '1 x 1 cm',
      year: '2026',
      photoUrl: source
    };
    const blob = await window.buildCertificateWorkbookBlob(sold, work);
    const zip = await window.JSZip.loadAsync(blob);
    return {
      size: blob.size,
      type: blob.type,
      files: Object.keys(zip.files),
      readyStateUnchanged: sold.certificateReady === false && sold.certificateVersion === 0
    };
  }, blobUrl);
  expect(result.size).toBeGreaterThan(1000);
  expect(result.files).toContain('xl/workbook.xml');
  expect(result.files).toContain('xl/worksheets/sheet1.xml');
  expect(result.files).toContain('xl/media/certificate-artwork.png');
  expect(result.readyStateUnchanged).toBe(true);
});

test('selected artwork file uses the current client-side compact-image path', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const bytes = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nVQAAAAASUVORK5CYII='),
      (char) => char.charCodeAt(0)
    );
    const file = new File([bytes], 'CHARACTERIZATION_TEST_ARTWORK.png', { type: 'image/png' });
    const compact = await window.buildCompactPhotoPreview(file);
    return { ...compact, prefix: compact.dataUrl.slice(0, 22) };
  });
  expect(result.mimeType).toBe('image/png');
  expect(result.byteSize).toBeGreaterThan(0);
  expect(result.prefix).toBe('data:image/png;base64,');
});

test('login accepts a synthetic local fixture and stores the current user', async ({ page }) => {
  await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('currentUser'));
  await page.locator('#login-id').fill('CHARACTERIZATION_TEST_ADMIN');
  await page.locator('#login-password').fill('not-a-real-credential');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('currentUser') || 'null'));
  expect(stored && stored.username).toBe('CHARACTERIZATION_TEST_ADMIN');
  await expect(page.locator('#auth-message')).toContainText('로그인 성공');
});

test('gallery accounting preserves category totals, export, state, and reload', async ({ page }) => {
  await page.addInitScript(() => {
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
    window.Date = FixedDate;
  });

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/pottery-accounting.html', { waitUntil: 'networkidle' });
  const accountingBefore = await page.evaluate(() => localStorage.getItem('pottery-accounting-v1'));

  await page.locator('#accounting-tab-gallery').click();
  await expect(page.locator('#accounting-month-label')).toHaveText('2026년 8월');
  await expect(page.locator('#accounting-total-revenue')).toHaveText('260,001원');
  await expect(page.locator('#accounting-total-expense')).toHaveText('158,001원');
  await expect(page.locator('#accounting-total-profit')).toHaveText('102,000원');

  const artRow = page.locator('#accounting-revenue-body .accounting-category-row').filter({ hasText: '작품 판매' });
  const goodsRow = page.locator('#accounting-revenue-body .accounting-category-row').filter({ hasText: '굿즈 판매' });
  await expect(artRow.locator('.accounting-category-amount')).toHaveText('250,001원');
  await expect(goodsRow.locator('.accounting-category-amount')).toHaveText('10,000원');
  await artRow.locator('button[data-action="toggle-category"]').click();
  await expect(artRow.locator('.accounting-status-cell')).toHaveText('상세 열림');

  await page.locator('#accounting-tab-pottery').click();
  await page.locator('#accounting-tab-gallery').click();
  await expect(page.locator('#accounting-total-revenue')).toHaveText('260,001원');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#accounting-export-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^갤러리-회계-2026-08\.(xlsx|csv)$/);
  expect(await page.evaluate(() => localStorage.getItem('pottery-accounting-v1'))).toBe(accountingBefore);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#accounting-tab-gallery').click();
  await expect(page.locator('#accounting-total-revenue')).toHaveText('260,001원');
  expect(await page.evaluate(() => localStorage.getItem('pottery-accounting-v1'))).toBe(accountingBefore);
  expect(pageErrors).toEqual([]);
});