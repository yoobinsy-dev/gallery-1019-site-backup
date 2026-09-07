const { test, expect } = require('@playwright/test');
const XLSX = require('xlsx');
const { buildSeedData } = require('../../scripts/seed-dev-dummy-data');

const user = {
  id: 91019999,
  username: 'DEV_DUMMY_ADMIN',
  name: 'DEV_DUMMY_관리자',
  password: 'not-a-real-credential',
  accountType: '어드민',
  galleryRole: '어드민',
  siteAccess: 'both',
  approved: true
};

async function mockStateApi(page, serverState) {
  await page.route('**/api/state**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: serverState, meta: {} }) });
      return;
    }
    const body = request.postDataJSON();
    serverState[body.key] = body.value;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, key: body.key, updatedAt: new Date().toISOString() }) });
  });
}

test('artwork management renders canonical collection and derived exhibition views with persistent edits', async ({ page }) => {
  const fixture = buildSeedData(new Date('2026-09-07T12:00:00.000Z'));
  const serverState = { ...fixture, users: [user] };
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockStateApi(page, serverState);
  await page.route('**/api/upload', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, file: { url: 'https://blob.example/artwork.png', pathname: 'uploads/artwork.png', contentType: 'image/png', size: 68 } })
  }));
  await page.addInitScript((activeUser) => localStorage.setItem('currentUser', JSON.stringify(activeUser)), user);

  await page.goto('/artwork-management.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.artworkManagementReady);
  const heading = page.getByRole('heading', { name: '작품 관리', exact: true });
  await expect(heading).toBeVisible();
  const headingBox = await heading.boundingBox();
  const backBox = await page.locator('.back-btn').boundingBox();
  const spacerBox = await page.locator('.header-spacer').boundingBox();
  expect(headingBox.x).toBeGreaterThanOrEqual(backBox.x + backBox.width);
  expect(spacerBox.x).toBeGreaterThanOrEqual(headingBox.x + headingBox.width);
  expect(Math.abs((headingBox.x + headingBox.width / 2) - 640)).toBeLessThan(20);
  expect((await page.locator('#collection-table').boundingBox()).height).toBeLessThanOrEqual(760);
  await expect(page.locator('#collection-table .tabulator-row')).toHaveCount(8);
  await expect(page.locator('#collection-table .tabulator-col-title')).toHaveText(['', '번호', '사진', '작품명', '작가', '가격', '크기', '재료', '연도', '등록일', '전시 이력']);
  await expect(page.getByText('DEV_DUMMY_소장전용_달항아리', { exact: true })).toBeVisible();
  const collectionDownload = page.waitForEvent('download');
  await page.locator('#artwork-export-btn').click();
  const collectionWorkbook = XLSX.readFile(await (await collectionDownload).path());
  const collectionHeaders = XLSX.utils.sheet_to_json(collectionWorkbook.Sheets['소장품'], { header: 1 })[0];
  expect(collectionHeaders).toEqual(['번호', '작품명', '작가', '가격', '크기', '재료', '연도', '등록일', '전시 이력']);

  const initialArtworkCount = serverState['gallery-artworks-v1'].length;
  await page.locator('#artwork-add-btn').click();
  await page.locator('#artwork-add-btn').click();
  await expect(page.locator('#collection-table .tabulator-row')).toHaveCount(10);
  expect(serverState['gallery-artworks-v1']).toHaveLength(initialArtworkCount);
  const draft = page.locator('#collection-table .tabulator-row').first();
  await expect(draft.locator('[tabulator-field="title"] input')).toBeFocused();
  await draft.locator('[tabulator-field="title"] input').fill('DEV_DUMMY_인라인 작품');
  await draft.locator('[tabulator-field="title"] input').press('Tab');
  await draft.locator('[tabulator-field="artistName"]').dblclick();
  await draft.locator('[tabulator-field="artistName"] input').fill('DEV_DUMMY_인라인 작가');
  await draft.locator('[tabulator-field="artistName"] input').press('Tab');
  await expect.poll(() => serverState['gallery-artworks-v1'].find((artwork) => artwork.title === 'DEV_DUMMY_인라인 작품')?.workId).toMatch(/^work_/);
  const inlineRow = page.locator('#collection-table .tabulator-row').filter({ hasText: 'DEV_DUMMY_인라인 작품' });
  await inlineRow.locator('input[type="file"]').setInputFiles({ name: 'artwork.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await expect.poll(() => serverState['gallery-artworks-v1'].find((artwork) => artwork.title === 'DEV_DUMMY_인라인 작품')?.imageRef?.photoUrl).toBe('https://blob.example/artwork.png');
  expect(JSON.stringify(serverState['gallery-artworks-v1']).includes('base64')).toBe(false);

  await page.getByRole('tab', { name: '과거 전시 작품' }).click();
  await expect(page.locator('#past-exhibition-table .tabulator-row')).toHaveCount(19);
  await expect(page.locator('#past-exhibition-table .tabulator-col-title')).toHaveText(['', '소장/판매 여부', '사진', '작품명', '작가', '가격', '크기', '재료', '연도', '최근 전시일', '최근 전시명', '전시 이력']);
  await expect(page.getByText('DEV_DUMMY_소장전용_달항아리', { exact: true })).toHaveCount(0);
  const repeated = page.locator('#past-exhibition-table .tabulator-row').filter({ hasText: 'DEV_DUMMY_순환하는 풍경_1' });
  await expect(repeated).toHaveCount(1);
  await expect(repeated.locator('.history-chip')).toHaveCount(3);
  await expect(page.locator('#past-exhibition-table .artwork-status-owned')).toHaveCount(6);
  expect(await page.locator('#past-exhibition-table .artwork-status-sold').count()).toBeGreaterThan(0);
  await expect(page.locator('#artwork-resolution-note')).toContainText('1개');
  await page.locator('#artwork-resolve-btn').click();
  await expect(page.locator('#artwork-resolution-context')).toContainText('DEV_DUMMY_작가_모호');
  await expect(page.locator('#artwork-resolution-context')).toContainText('DEV_DUMMY_모호한 작품');
  await expect(page.locator('#artwork-resolution-form select[name="workId"] option')).toHaveCount(3);
  await expect(page.locator('#artwork-resolution-form select[name="workId"]')).toContainText('20 × 20 cm');
  await expect(page.locator('#artwork-resolution-form select[name="workId"]')).toContainText('30 × 30 cm');
  await page.locator('#artwork-resolution-cancel').click();
  const tableHolder = page.locator('#past-exhibition-table .tabulator-tableholder');
  expect(await tableHolder.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await tableHolder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('#artwork-export-btn')).toBeVisible();
  const pastDownload = page.waitForEvent('download');
  await page.locator('#artwork-export-btn').click();
  const pastWorkbook = XLSX.readFile(await (await pastDownload).path());
  const pastHeaders = XLSX.utils.sheet_to_json(pastWorkbook.Sheets['과거 전시 작품'], { header: 1 })[0];
  expect(pastHeaders).toEqual(['소장/판매 여부', '작품명', '작가', '가격', '크기', '재료', '연도', '최근 전시일', '최근 전시명', '전시 이력']);

  await page.getByRole('tab', { name: '소장품' }).click();
  const firstRow = page.locator('#collection-table .tabulator-row').filter({ hasText: 'DEV_DUMMY_소장전용_달항아리' });
  const workId = await firstRow.getAttribute('data-index');
  const historicalPrices = fixture.exhibitions.flatMap((exhibition) => exhibition.works.filter((work) => work.workId === workId).map((work) => work.price));
  await firstRow.locator('input[type="checkbox"]').click();
  await expect(page.locator('#artwork-selection-count')).toHaveText('1개 선택');
  await page.locator('#artwork-edit-btn').click();
  await page.locator('#artwork-editor-form [name="title"]').fill('DEV_DUMMY_수정된 작품');
  await page.locator('#artwork-editor-form [name="currentPrice"]').fill('777000');
  await page.locator('#artwork-editor-form button[type="submit"]').click();
  await expect(page.getByText('DEV_DUMMY_수정된 작품', { exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  expect(serverState.exhibitions.flatMap((exhibition) => exhibition.works.filter((work) => work.workId === workId).map((work) => work.price))).toEqual(historicalPrices);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.artworkManagementReady);
  await expect(page.getByText('DEV_DUMMY_수정된 작품', { exact: true })).toBeVisible();
  await expect(page.getByText('DEV_DUMMY_인라인 작품', { exact: true })).toBeVisible();
  expect(serverState['gallery-artworks-v1']).toHaveLength(initialArtworkCount + 1);
  expect(pageErrors).toEqual([]);
});

test('artwork management mobile header and controls do not overlap', async ({ page }) => {
  const fixture = buildSeedData(new Date('2026-09-07T12:00:00.000Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockStateApi(page, { ...fixture, users: [user] });
  await page.addInitScript((activeUser) => localStorage.setItem('currentUser', JSON.stringify(activeUser)), user);

  await page.goto('/artwork-management.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.artworkManagementReady);
  const selectors = ['#user-display', '.artwork-header', '.artwork-tabs', '.artwork-toolbar', '#collection-table'];
  const boxes = await Promise.all(selectors.map(async (selector) => page.locator(selector).boundingBox()));
  boxes.forEach((box) => {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height);
  }
});

test('exhibition detail saves linked artwork identity and latest price to the canonical record', async ({ page }) => {
  const fixture = buildSeedData(new Date('2026-09-07T12:00:00.000Z'));
  const serverState = { ...fixture, users: [user] };
  const occurrenceCounts = new Map();
  fixture.exhibitions.forEach((exhibition) => exhibition.works.forEach((work) => {
    if (work.workId) occurrenceCounts.set(work.workId, (occurrenceCounts.get(work.workId) || 0) + 1);
  }));
  const exhibition = fixture.exhibitions.find((candidate) => candidate.works.some((work) => work.workId && occurrenceCounts.get(work.workId) === 1));
  const occurrence = exhibition.works.find((work) => work.workId && occurrenceCounts.get(work.workId) === 1);
  await mockStateApi(page, serverState);
  await page.addInitScript((activeUser) => localStorage.setItem('currentUser', JSON.stringify(activeUser)), user);

  await page.goto(`/exhibition-detail.html?id=${exhibition.id}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.evaluate(() => window.switchTab('inventory-list'));
  const row = page.locator(`tr[data-work-id="${occurrence.id}"]`);
  await row.getByRole('button', { name: '수정', exact: true }).click();
  await row.locator('input[data-field="title"]').fill('DEV_DUMMY_전시에서 수정');
  await row.locator('input[data-field="price"]').fill('888000');
  await row.getByRole('button', { name: '저장', exact: true }).click();

  await expect.poll(() => serverState['gallery-artworks-v1'].find((artwork) => artwork.workId === occurrence.workId)?.title).toBe('DEV_DUMMY_전시에서 수정');
  expect(serverState['gallery-artworks-v1'].find((artwork) => artwork.workId === occurrence.workId)?.currentPrice).toBe('₩888,000');
});