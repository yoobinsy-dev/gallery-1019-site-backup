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
const artistUser = {
  id: 900002,
  username: 'CHARACTERIZATION_TEST_ARTIST',
  name: 'CHARACTERIZATION_TEST_ARTIST',
  password: 'not-a-real-credential',
  accountType: '기획자/작가',
  galleryRole: '기획자/작가',
  siteAccess: 'gallery'
};
const users = [currentUser, artistUser];
const exhibitions = [{
  id: EXHIBITION_ID,
  title: 'CHARACTERIZATION_TEST_EXHIBITION',
  name: 'CHARACTERIZATION_TEST_EXHIBITION',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  managers: [currentUser.name],
  staff: { planners: [], artists: [artistUser.id], staffs: [] },
  works: [{
    id: 900101,
    manualNumber: 'W-LEGACY',
    title: 'CHARACTERIZATION_TEST_WORKS_PRECEDENCE',
    author: currentUser.name,
    price: '100000',
    photoName: 'characterization.png',
    photoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nVQAAAAASUVORK5CYII=',
    saved: true,
    createdByUserId: currentUser.id,
    legacyOnlyField: 'preserve-works'
  }, {
    id: 900102,
    manualNumber: 'W-ARTIST',
    title: 'CHARACTERIZATION_TEST_ARTIST_OWNED',
    author: artistUser.name,
    price: '200000',
    saved: true,
    createdByUserId: artistUser.id
  }],
  artWorks: [{
    id: 900103,
    manualNumber: 'A-CURRENT',
    title: 'CHARACTERIZATION_TEST_ARTWORKS_ONLY',
    author: currentUser.name,
    price: '300000',
    saved: true,
    createdByUserId: currentUser.id
  }],
  goods: [{
    id: 900201,
    manualNumber: 'G-1',
    title: 'CHARACTERIZATION_TEST_GOODS',
    price: '5000',
    quantity: 5,
    saved: true,
    createdByUserId: currentUser.id
  }],
  soldWorks: [
    { id: 1, workId: 900101, itemType: '작품', price: 250001, buyerName: 'Buyer A', soldAtKst: '2026-08-15 12:00:00', saved: true },
    { id: 2, itemType: '굿즈', price: 5000, soldQuantity: 2 }
  ],
  artSoldWorks: [],
  soldGoods: []
}];
const studentFixtures = [{
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
}, {
  id: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT_ID',
  name: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT',
  studentGroup: '정규반',
  classTime: '화 10:00~11:00',
  classType: '정규 수강',
  instructor: currentUser.name,
  tuition: 250000,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-09-02',
  paymentHistory: ['2026-08-04', '2026-09-02'],
  paymentRecords: [
    { id: 'PAYMENT_CYCLE_AUGUST', date: '2026-08-04', tuition: 250000, basis: '4회', credits: 4 },
    { id: 'PAYMENT_CYCLE_SEPTEMBER', date: '2026-09-02', tuition: 250000, basis: '4회', credits: 4 }
  ],
  creditTrackingStartDate: '2026-08-04',
  carryOverBeforePayment: 0,
  paymentCycleCredits: 4,
  manualUsedAdjustment: 0
}, {
  id: 'PAYMENT_CYCLE_REDUCED_STUDENT_ID',
  name: 'PAYMENT_CYCLE_REDUCED_STUDENT',
  studentGroup: '정규반',
  classTime: '화 12:00~13:00',
  classType: '정규 수강',
  instructor: currentUser.name,
  tuition: 250000,
  tuitionBasis: '4회',
  mostRecentPaymentDate: '2026-08-04',
  paymentHistory: ['2026-08-04'],
  creditTrackingStartDate: '2026-08-04',
  carryOverBeforePayment: 0,
  paymentCycleCredits: 2,
  manualUsedAdjustment: 0
}];
const personalWorkFixtures = [{
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
const materialOrderFixtures = [{
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
const calendarFixture = {
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
    ['PAYMENT_CYCLE_CLASS_1', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-04', '10:00'],
    ['PAYMENT_CYCLE_CLASS_2', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-11', '10:00'],
    ['PAYMENT_CYCLE_CLASS_3', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-25', '10:00'],
    ['PAYMENT_CYCLE_CLASS_4', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-08-28', '10:00'],
    ['PAYMENT_CYCLE_CLASS_5', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-09-01', '10:00'],
    ['PAYMENT_CYCLE_CLASS_6', 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT', '2026-09-08', '10:00'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_A', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-08-11', '12:00'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_B', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-08-28', '12:00'],
    ['PAYMENT_CYCLE_REDUCED_CLASS_C', 'PAYMENT_CYCLE_REDUCED_STUDENT', '2026-09-04', '12:00']
  ].map(([id, title, date, start]) => ({
    id,
    kind: '수강',
    title,
    instructor: currentUser.name,
    date,
    start,
    end: start === '12:00' ? '13:00' : '11:00'
  })), {
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
  }, {
    id: 'CHARACTERIZATION_TEST_CALENDAR_WEEKLY',
    kind: '기타',
    title: 'CHARACTERIZATION_TEST_CALENDAR_WEEKLY',
    date: '2026-08-24',
    start: '10:00',
    end: '11:00',
    repeatWeekly: true,
    repeatEndDate: '2026-09-07',
    repeatSkipDates: ['2026-08-31']
  }, {
    id: 'CHARACTERIZATION_TEST_CALENDAR_SINGLE',
    kind: '기타',
    title: 'CHARACTERIZATION_TEST_CALENDAR_SINGLE',
    date: '2026-09-01',
    start: '12:00',
    end: '13:00'
  }, {
    id: 'CHARACTERIZATION_TEST_CALENDAR_EXHIBITION',
    kind: '전시',
    title: 'CHARACTERIZATION_TEST_CALENDAR_EXHIBITION',
    date: '2026-08-30',
    endDate: '2026-09-02',
    start: '00:00',
    end: '24:00'
  }],
  baseRules: [],
  baseRuleTimeline: [],
  baseWeekOverrides: {}
};

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
          users,
          exhibitions,
          'pottery-students-v1': studentFixtures,
          'pottery-personal-work-v1': personalWorkFixtures,
          'studio-calendar-state-v1': calendarFixture,
          'pottery-material-orders-v1': materialOrderFixtures,
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
  await page.addInitScript(({ user, fixtureUsers, fixtureExhibitions, fixtureStudents, fixturePersonalWork, fixtureCalendar, fixtureMaterialOrders }) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('users', JSON.stringify(fixtureUsers));
    localStorage.setItem('exhibitions', JSON.stringify(fixtureExhibitions));
    localStorage.setItem('pottery-students-v1', JSON.stringify(fixtureStudents));
    localStorage.setItem('pottery-personal-work-v1', JSON.stringify(fixturePersonalWork));
    localStorage.setItem('pottery-material-orders-v1', JSON.stringify(fixtureMaterialOrders));
    localStorage.setItem('pottery-accounting-v1', '[]');
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify(fixtureCalendar));
  }, {
    user: currentUser,
    fixtureUsers: users,
    fixtureExhibitions: exhibitions,
    fixtureStudents: studentFixtures,
    fixturePersonalWork: personalWorkFixtures,
    fixtureCalendar: calendarFixture,
    fixtureMaterialOrders: materialOrderFixtures
  });
});

const pages = [
  ['login', '/login.html'],
  ['landing', '/index.html'],
  ['exhibition list', '/exhibitions.html'],
  ['exhibition detail', `/exhibition-detail.html?id=${EXHIBITION_ID}`],
  ['artwork management', '/artwork-management.html'],
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

test('exhibition detail initializes required controllers before loading page state', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (let startup = 0; startup < 3; startup += 1) {
    await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.exhibitionDetailReady);

    expect(await page.evaluate(() => typeof window.buildCertificateWorkbookBlob)).toBe('function');
    await expect(page.locator('#exhibition-title')).toHaveText('CHARACTERIZATION_TEST_EXHIBITION');
  }

  expect(pageErrors).toEqual([]);
});

test('works renderer preserves controlling body, roles, modes, and works compatibility', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.locator('.tab-button[data-tab="inventory-list"]').click();

  await expect(page.locator('tr[data-work-id="900101"]')).toContainText('CHARACTERIZATION_TEST_WORKS_PRECEDENCE');
  await expect(page.locator('tr[data-work-id="900102"]')).toContainText('CHARACTERIZATION_TEST_ARTIST_OWNED');
  await expect(page.getByText('CHARACTERIZATION_TEST_ARTWORKS_ONLY', { exact: true })).toHaveCount(0);
  await expect(page.locator('#work-select-all-btn-bottom')).toHaveCount(1);
  const savedArtRow = page.locator('tr[data-work-id="900101"]');
  await expect(savedArtRow.locator('img.saved-photo-image')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(savedArtRow.getByRole('button', { name: 'SOLD', exact: true })).toHaveCount(1);
  await savedArtRow.getByRole('button', { name: '수정', exact: true }).click();
  await expect(savedArtRow.locator('input[data-field="manualNumber"]')).toHaveValue('W-LEGACY');
  await expect(savedArtRow.locator('input[data-field="title"]')).toHaveValue('CHARACTERIZATION_TEST_WORKS_PRECEDENCE');
  await expect(savedArtRow.locator('input[data-field="price"]')).toHaveValue('100000');
  await expect(savedArtRow.locator('input[data-field="author"]')).toHaveValue(currentUser.name);

  await page.getByRole('button', { name: '굿즈 목록', exact: true }).click();
  const goodsRow = page.locator('tr[data-work-id="900201"]');
  await expect(goodsRow).toContainText('CHARACTERIZATION_TEST_GOODS');
  await expect(goodsRow.locator('td').nth(5)).toHaveText('5');
  await expect(goodsRow.locator('td').nth(6)).toHaveText('0');
  await expect(goodsRow.locator('td').nth(7)).toHaveText('5');
  await expect(page.locator('.works-table thead')).toContainText('판매된 수량');
  await expect(page.locator('#work-select-all-btn-bottom')).toHaveCount(1);

  await page.evaluate((artist) => {
    localStorage.setItem('currentUser', JSON.stringify(artist));
    window.switchTab('works');
  }, artistUser);
  const adminOwnedRow = page.locator('tr[data-work-id="900101"]');
  const artistOwnedRow = page.locator('tr[data-work-id="900102"]');
  const deleteAllButtons = page.locator('button.works-action-btn-danger').filter({ hasText: /^전체 삭제$/ });
  await expect(deleteAllButtons).toHaveCount(2);
  await expect(deleteAllButtons.first()).toBeHidden();
  await expect(deleteAllButtons.last()).toBeHidden();
  await expect(adminOwnedRow.getByRole('button', { name: '수정', exact: true })).toHaveCount(0);
  await expect(adminOwnedRow.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0);
  await expect(artistOwnedRow.getByRole('button', { name: '수정', exact: true })).toHaveCount(1);
  await expect(artistOwnedRow.getByRole('button', { name: '삭제', exact: true })).toHaveCount(1);

  await page.evaluate(async (exhibitionId) => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    delete exhibition.works;
    exhibition.artWorks = [{
      id: 900301,
      title: 'CHARACTERIZATION_TEST_ARTWORKS_FALLBACK',
      saved: true,
      createdByUserId: 900002
    }];
    localStorage.setItem('exhibitions', JSON.stringify([{ ...exhibition, id: exhibitionId }]));
    await window.initDetailPage();
  }, EXHIBITION_ID);
  await page.getByRole('button', { name: '작품 목록', exact: true }).click();
  await expect(page.locator('tr[data-work-id="900301"]')).toContainText('CHARACTERIZATION_TEST_ARTWORKS_FALLBACK');
});

test('exhibition detail grid preserves click, arrow, enter, and modal keyboard behavior', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.evaluate(() => window.switchTab('inventory-list'));

  const row = page.locator('tr[data-work-id="900101"]');
  const cells = row.locator('td');
  const startCell = cells.nth(2);
  await startCell.click({ position: { x: 5, y: 5 } });
  await expect(startCell).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cells.nth(3)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(startCell).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(row.locator('input[data-field="manualNumber"]')).toBeVisible();
  await expect(row.locator('input[data-field="title"]')).toBeVisible();

  await page.evaluate(() => window.openSalesAddModal());
  await page.locator('#sales-add-search-input').fill('W-ARTIST');
  await page.locator('#sales-add-search-input').press('ArrowDown');
  await expect(page.locator('#sales-add-search-results .sales-search-result-highlighted')).toHaveCount(1);
});

test('exhibition detail shell preserves tab state, aliases, and single render behavior', async ({ page }) => {
  await page.addInitScript(({ userId, exhibitionId }) => {
    localStorage.setItem(`exhibition-detail-last-tab:${userId}:${exhibitionId}`, 'inventory-sales');
  }, { userId: currentUser.id, exhibitionId: EXHIBITION_ID });
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);

  const activeTabs = page.locator('.tab-button.active');
  await expect(activeTabs).toHaveCount(1);
  await expect(activeTabs).toHaveAttribute('data-tab', 'inventory-sales');
  await expect(page.locator('#sales-search')).toHaveCount(1);

  for (let index = 0; index < 3; index += 1) {
    await page.locator('.tab-button[data-tab="exhibition-info"]').click();
    await expect(page.locator('#tab-content .works-sales-title')).toHaveText('전시 정보');
    await expect(activeTabs).toHaveCount(1);
    await page.locator('.tab-button[data-tab="inventory-sales"]').click();
    await expect(page.locator('#sales-search')).toHaveCount(1);
    await expect(activeTabs).toHaveCount(1);
  }

  await page.evaluate(() => window.switchTab('works'));
  await expect(activeTabs).toHaveAttribute('data-tab', 'inventory-list');
  await expect(page.locator('#works-tbody')).toHaveCount(1);
  const preferenceKey = `exhibition-detail-last-tab:${currentUser.id}:${EXHIBITION_ID}`;
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey))
    .toBe('inventory-list');

  await page.evaluate((artist) => {
    localStorage.setItem('currentUser', JSON.stringify(artist));
    window.switchTab('exhibition-accounting');
  }, artistUser);
  await expect(activeTabs).toHaveAttribute('data-tab', 'exhibition-info');
  await expect(page.locator('.tab-button[data-tab="exhibition-accounting"]')).toBeHidden();
  await expect(page.locator('#tab-content .works-sales-title')).toHaveText('전시 정보');
});

test('exhibition sales add modal preserves search, buffer, buyer, and reset behavior', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.evaluate(() => window.switchTab('inventory-sales'));
  await page.evaluate(() => window.openSalesAddModal());

  const modal = page.locator('#sales-add-modal');
  const searchInput = page.locator('#sales-add-search-input');
  await expect(modal).toHaveCSS('display', 'flex');
  await expect(searchInput).toBeFocused();
  await expect(page.locator('#sales-add-selected-count')).toHaveText('0개 선택됨');

  await searchInput.fill('W-ARTIST');
  await expect(page.locator('#sales-add-search-results')).toContainText('CHARACTERIZATION_TEST_ARTIST_OWNED');
  await searchInput.press('Enter');
  await expect(page.locator('#sales-add-selected-list .sales-selected-row')).toHaveCount(1);
  await expect(page.locator('#sales-add-selected-ticker')).toHaveText('선택 1건 · 합계 ₩200,000');

  await page.locator('#sales-add-apply-common-buyer').check();
  await expect(page.locator('#sales-add-common-buyer-fields')).toBeVisible();
  await page.locator('#sales-add-common-buyer-name').fill('Character Buyer');
  await page.locator('#sales-add-common-buyer-phone').fill('01012345678');
  await expect(page.locator('#sales-add-common-buyer-phone')).toHaveValue('010-1234-5678');

  await modal.click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeHidden();
  await page.evaluate(() => window.openSalesAddModal());
  await expect(modal).toHaveCSS('display', 'flex');
  await expect(searchInput).toHaveValue('');
  await expect(page.locator('#sales-add-selected-count')).toHaveText('0개 선택됨');
  await expect(page.locator('#sales-add-apply-common-buyer')).not.toBeChecked();
  await expect(page.locator('#sales-add-common-buyer-fields')).toBeHidden();
});

test('exhibition sales shell preserves table and duplicated action controls', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.locator('.tab-button[data-tab="inventory-sales"]').click();

  await expect(page.locator('.sales-table thead th')).toHaveCount(16);
  await expect(page.locator('#sold-works-tbody tr')).toHaveCount(2);
  await expect(page.locator('#sales-search')).toHaveAttribute('placeholder', '번호, 제목, 작가, 구매자, 결제방법 등 검색');
  await expect(page.getByRole('button', { name: '+ 판매 항목 추가', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '엑셀 파일로 다운 받기', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '모든 보증서 다운 받기', exact: true })).toHaveCount(2);
  await expect(page.locator('#sales-select-all-btn')).toHaveCount(1);
  await expect(page.locator('#sales-select-all-btn-bottom')).toHaveCount(1);
  await expect(page.locator('#sales-sold-stats-ticker')).toHaveCount(1);

  const savedArtSale = page.locator('#sold-works-tbody tr[data-sold-id="1"]');
  const unsavedGoodsSale = page.locator('#sold-works-tbody tr[data-sold-id="2"]');
  await expect(savedArtSale.getByRole('button', { name: '수정', exact: true })).toHaveCount(1);
  await expect(savedArtSale.getByRole('button', { name: '보증서 만들기', exact: true })).toHaveCount(1);
  await expect(savedArtSale.locator('input[data-field="soldQuantity"]')).toHaveCount(0);
  await expect(unsavedGoodsSale.getByRole('button', { name: '저장', exact: true })).toHaveCount(1);
  await expect(unsavedGoodsSale.locator('input[data-field="soldQuantity"]')).toHaveValue('2');
  await expect(unsavedGoodsSale.locator('select[data-field="paymentMethod"]')).toHaveValue('');
  await expect(unsavedGoodsSale.getByRole('button', { name: /보증서/ })).toHaveCount(0);

  await page.locator('#sales-search').fill('CHARACTERIZATION_TEST_WORKS_PRECEDENCE');
  await expect(page.locator('#sold-works-tbody tr')).toHaveCount(1);
  await page.locator('#sales-search').fill('CHARACTERIZATION_TEST_NO_MATCH');
  await expect(page.locator('#sold-works-tbody')).toHaveText('검색 결과가 없습니다.');
  await page.locator('#sales-search').fill('');
  await page.getByRole('button', { name: '+ 판매 항목 추가', exact: true }).first().click();
  await expect(page.locator('#sales-add-modal')).toHaveCSS('display', 'flex');
});

test('exhibition accounting shell preserves projection, rows, and duplicated controls', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.locator('.tab-button[data-tab="exhibition-accounting"]').click();

  await expect(page.locator('.accounting-card')).toHaveCount(2);
  await expect(page.locator('.accounting-table')).toHaveCount(2);
  await expect(page.locator('.accounting-table thead th')).toHaveCount(8);
  await expect(page.locator('.accounting-card').nth(0).locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('.accounting-card').nth(1).locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ 지출 항목 추가', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ 수입 항목 추가', exact: true })).toHaveCount(2);
  await expect(page.locator('#expense-select-all-btn')).toHaveCount(1);
  await expect(page.locator('#expense-select-all-btn-bottom')).toHaveCount(1);
  await expect(page.locator('#revenue-select-all-btn')).toHaveCount(1);
  await expect(page.locator('#revenue-select-all-btn-bottom')).toHaveCount(1);
  await expect(page.locator('.accounting-profit-ticker')).toHaveClass(/positive/);
  await expect(page.locator('.accounting-profit-meta')).toHaveText('수입 합계 ₩ 260,001 · 지출 합계 ₩ 158,000.6');
  await expect(page.locator('.accounting-profit-value')).toHaveText('₩ 102,000.4');

  await page.getByRole('button', { name: '+ 지출 항목 추가', exact: true }).first().click();
  await expect(page.locator('.accounting-card').nth(0).locator('tbody tr')).toHaveCount(5);
  await expect(page.locator('.accounting-card').nth(0).locator('tbody .accounting-text-input')).toHaveCount(1);
  await expect(page.locator('.accounting-card').nth(0).locator('tbody .accounting-amount-input')).toHaveCount(1);
});

test('exhibition snapshot client preserves requests, defaults, and refresh order', async ({ page }) => {
  const requests = [];
  await page.route('**/api/exhibition-snapshots*', async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      url: request.url(),
      body: request.postDataJSON?.() || null
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        snapshots: [{ id: 77, snapshot_type: 'manual', created_at: '2026-08-15T12:00:00.000Z' }],
        canUndo: true
      })
    });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);

  await page.evaluate(() => window.fetchExhibitionBackupSnapshots());
  expect(requests[0]).toMatchObject({ method: 'GET', body: null });
  expect(new URL(requests[0].url).searchParams.get('exhibitionId')).toBe(String(EXHIBITION_ID));
  expect(new URL(requests[0].url).searchParams.get('limit')).toBe('100');
  await page.evaluate(() => window.switchTab('exhibition-backup'));
  await expect(page.locator('#tab-content')).toContainText('#77');
  await expect(page.locator('#tab-content')).toContainText('0');
  await expect(page.locator('#tab-content')).toContainText('-');

  await page.evaluate(() => window.createManualExhibitionSnapshot());
  await page.evaluate(() => window.restoreExhibitionSnapshot(77));
  await page.evaluate(() => window.undoExhibitionSnapshotRestore());

  const posts = requests.filter((request) => request.method === 'POST').map((request) => request.body);
  expect(posts).toEqual([
    { action: 'capture-now', exhibitionId: EXHIBITION_ID, note: 'manual backup by CHARACTERIZATION_TEST_ADMIN' },
    { action: 'restore', exhibitionId: EXHIBITION_ID, snapshotId: 77 },
    { action: 'undo-restore', exhibitionId: EXHIBITION_ID }
  ]);
  expect(requests.filter((request) => request.method === 'GET')).toHaveLength(4);
});

test('certificate builder preserves template cells, date, image, and source records', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  const result = await page.evaluate(async () => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    const sold = exhibition.soldWorks.find((item) => item.id === 1);
    const work = exhibition.works.find((item) => item.id === 900101);
    const before = JSON.stringify({ sold, work });
    const blob = await window.buildCertificateWorkbookBlob(sold, work);
    const workbook = await XlsxPopulate.fromDataAsync(await blob.arrayBuffer());
    const sheet = workbook.sheet(0);
    const zip = await JSZip.loadAsync(blob);
    const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('xl/media/') && !zip.files[name].dir);
    return {
      artist: sheet.cell('F24').value(),
      title: sheet.cell('F26').value(),
      date: sheet.cell('B3').value(),
      mediaCount: mediaFiles.length,
      size: blob.size,
      sourceUnchanged: before === JSON.stringify({ sold, work })
    };
  });

  expect(result.artist).toBe(currentUser.name);
  expect(result.title).toBe('CHARACTERIZATION_TEST_WORKS_PRECEDENCE');
  expect(result.date).toBe('Date 2026.08.15');
  expect(result.mediaCount).toBeGreaterThan(0);
  expect(result.size).toBeGreaterThan(1000);
  expect(result.sourceUnchanged).toBe(true);
});

test('certificate dependencies load once from deployable vendor paths', async ({ page }) => {
  const dependencyRequests = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/vendor/')) dependencyRequests.push(pathname);
  });

  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  const result = await page.evaluate(async () => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    const sold = exhibition.soldWorks.find((item) => item.id === 1);
    const work = exhibition.works.find((item) => item.id === 900101);
    const blobs = await Promise.all([
      window.buildCertificateWorkbookBlob(sold, work),
      window.buildCertificateWorkbookBlob(sold, work)
    ]);
    await window.buildCertificateWorkbookBlob(sold, work);
    return {
      initialized: Boolean(window.XlsxPopulate && window.JSZip),
      sizes: blobs.map((blob) => blob.size)
    };
  });

  expect(result.initialized).toBe(true);
  expect(result.sizes.every((size) => size > 1000)).toBe(true);
  expect(dependencyRequests).toEqual([
    '/vendor/xlsx-populate-1.21.0/xlsx-populate.min.js',
    '/vendor/jszip-3.10.1/jszip.min.js'
  ]);
});

test('missing certificate dependency preserves the loader failure', async ({ page }) => {
  await page.route('**/vendor/xlsx-populate-1.21.0/xlsx-populate.min.js', (route) => route.abort());
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  const message = await page.evaluate(async () => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    const sold = exhibition.soldWorks.find((item) => item.id === 1);
    const work = exhibition.works.find((item) => item.id === 900101);
    try {
      await window.buildCertificateWorkbookBlob(sold, work);
      return '';
    } catch (error) {
      return error.message;
    }
  });

  expect(message).toBe('Failed to load certificate dependency: /vendor/xlsx-populate-1.21.0/xlsx-populate.min.js');
});

test('certificate batch builder preserves page blocks, print area, images, and source records', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  const result = await page.evaluate(async () => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    const sourceWork = exhibition.works.find((item) => item.id === 900101);
    const imageDataUrl = sourceWork.photoPreviewDataUrl || sourceWork.photoDataUrl || sourceWork.photoUrl;
    const entries = [
      {
        sold: { author: 'CHARACTERIZATION_TEST_BATCH_ARTIST_1', title: 'CHARACTERIZATION_TEST_BATCH_WORK_1', soldAtKst: '2026-08-15 12:00:00' },
        work: { ...sourceWork, author: 'CHARACTERIZATION_TEST_BATCH_ARTIST_1', title: 'CHARACTERIZATION_TEST_BATCH_WORK_1' },
        imageDataUrl
      },
      {
        sold: { author: 'CHARACTERIZATION_TEST_BATCH_ARTIST_2', title: 'CHARACTERIZATION_TEST_BATCH_WORK_2', soldAtKst: '2026-08-16 12:00:00' },
        work: { ...sourceWork, author: 'CHARACTERIZATION_TEST_BATCH_ARTIST_2', title: 'CHARACTERIZATION_TEST_BATCH_WORK_2' },
        imageDataUrl
      }
    ];
    const before = JSON.stringify(entries);
    const blob = await window.buildAllCertificatesWorkbookBlob(entries);
    const workbook = await XlsxPopulate.fromDataAsync(await blob.arrayBuffer());
    const sheet = workbook.sheet(0);
    const zip = await JSZip.loadAsync(blob);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('text');
    const workbookXml = await zip.file('xl/workbook.xml').async('text');
    const mediaFiles = Object.keys(zip.files).filter((name) => /^xl\/media\/certificate-artwork-\d+\.png$/.test(name));
    return {
      firstArtist: sheet.cell('F24').value(),
      firstTitle: sheet.cell('F26').value(),
      secondArtist: sheet.cell('F68').value(),
      secondTitle: sheet.cell('F70').value(),
      mediaFiles,
      hasPageBreak: /<rowBreaks[^>]*count="1"[^>]*>[\s\S]*<brk id="45"/.test(sheetXml),
      hasPrintArea: workbookXml.includes('$A$2:$I$89'),
      sourceUnchanged: before === JSON.stringify(entries)
    };
  });

  expect(result).toMatchObject({
    firstArtist: 'CHARACTERIZATION_TEST_BATCH_ARTIST_1',
    firstTitle: 'CHARACTERIZATION_TEST_BATCH_WORK_1',
    secondArtist: 'CHARACTERIZATION_TEST_BATCH_ARTIST_2',
    secondTitle: 'CHARACTERIZATION_TEST_BATCH_WORK_2',
    hasPageBreak: true,
    hasPrintArea: true,
    sourceUnchanged: true
  });
  expect(result.mediaFiles).toEqual([
    'xl/media/certificate-artwork-1.png',
    'xl/media/certificate-artwork-2.png'
  ]);
});

test('exhibition files preserve upload, preview, download, ownership, and delete behavior', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  await page.locator('[data-tab="exhibition-files"]').click();
  await page.locator('.exhibition-file-upload-card').click();
  await expect(page.locator('#file-upload-modal')).toHaveCSS('display', 'flex');
  await expect(page.locator('#file-upload-modal-title')).toHaveText('서류 업로드');

  await page.locator('#file-upload-input').setInputFiles({
    name: 'CHARACTERIZATION_TEST_FILE.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('CHARACTERIZATION_TEST_FILE_CONTENT')
  });
  await expect(page.locator('#file-upload-selected-info')).toHaveText('1개 파일 선택됨');
  await page.locator('.file-upload-title-input').fill('CHARACTERIZATION_TEST_DOCUMENT');
  await expect(page.locator('.file-upload-preview-item')).toHaveCount(1);
  await page.locator('#file-upload-modal .modal-approve').click();

  await expect(page.locator('#file-upload-modal')).toHaveCSS('display', 'none');
  await expect(page.locator('#file-upload-input')).toHaveValue('');
  const card = page.locator('.exhibition-file-card').filter({ hasText: 'CHARACTERIZATION_TEST_DOCUMENT' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.exhibition-file-preview-image')).toHaveAttribute('src', /^data:image\/svg\+xml/);

  await page.evaluate(() => {
    window.__characterizationFileDownload = null;
    HTMLAnchorElement.prototype.click = function captureFileDownload() {
      window.__characterizationFileDownload = { href: this.href, download: this.download };
    };
  });
  await card.getByRole('button', { name: '다운로드' }).click();
  const download = await page.evaluate(() => window.__characterizationFileDownload);
  expect(download.download).toBe('CHARACTERIZATION_TEST_DOCUMENT.txt');
  expect(download.href).toMatch(/^data:text\/plain/);

  const storedFile = await page.evaluate(() => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    return exhibition.filesDocs?.find((fileItem) => fileItem.title === 'CHARACTERIZATION_TEST_DOCUMENT');
  });
  expect(storedFile).toMatchObject({
    title: 'CHARACTERIZATION_TEST_DOCUMENT',
    fileName: 'CHARACTERIZATION_TEST_FILE.txt',
    previewKind: 'generic',
    mimeType: 'text/plain',
    createdByUserId: currentUser.id
  });
  expect(storedFile.fileDataUrl).toMatch(/^data:text\/plain/);

  await card.getByRole('button', { name: '삭제' }).click();
  await expect(card).toHaveCount(0);
  const remainingFiles = await page.evaluate(() => {
    const [exhibition] = JSON.parse(localStorage.getItem('exhibitions') || '[]');
    return exhibition.filesDocs || [];
  });
  expect(remainingFiles).toEqual([]);
});

test('exhibition exports preserve filenames and key payload cells', async ({ page }) => {
  await page.goto(`/exhibition-detail.html?id=${EXHIBITION_ID}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.exhibitionDetailReady);
  const captureExport = async (action) => {
    const result = await page.evaluate(async (actionName) => {
      const originalCreateObjectURL = URL.createObjectURL;
      const originalClick = HTMLAnchorElement.prototype.click;
      let blob;
      let filename;
      URL.createObjectURL = (value) => { blob = value; return 'blob:characterization'; };
      HTMLAnchorElement.prototype.click = function click() { filename = this.download; };
      try {
        window[actionName]();
        return { filename, text: await blob.text() };
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
        HTMLAnchorElement.prototype.click = originalClick;
      }
    }, action);
    return result;
  };

  const worksExport = await captureExport('exportWorksToExcel');
  expect(worksExport.filename).toBe('CHARACTERIZATION_TEST_EXHIBITION-works.xls');
  expect(worksExport.text).toContain('CHARACTERIZATION_TEST_WORKS_PRECEDENCE');

  await page.locator('.tab-button[data-tab="inventory-sales"]').click();
  const salesExport = await captureExport('exportSalesToExcel');
  expect(salesExport.filename).toBe('CHARACTERIZATION_TEST_EXHIBITION-sales.xls');
  expect(salesExport.text).toContain('Buyer A');

  await page.locator('.tab-button[data-tab="exhibition-accounting"]').click();
  const accountingExport = await captureExport('exportAccountingToExcel');
  expect(accountingExport.filename).toBe('CHARACTERIZATION_TEST_EXHIBITION-accounting.xls');
  expect(accountingExport.text).toContain('작품 판매');
  expect(accountingExport.text).toContain('총이익');
});

test('master calendar preserves recurrence across week and month navigation', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);

  await expect(page.locator('#week-label')).toHaveText('2026.08.24 ~ 2026.08.30');
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_WEEKLY', { exact: true })).toHaveCount(1);
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_EXHIBITION', { exact: true })).toHaveCount(1);

  await page.locator('#next-week-btn').click();
  await expect(page.locator('#week-label')).toHaveText('2026.08.31 ~ 2026.09.06');
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_WEEKLY', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_SINGLE', { exact: true })).toHaveCount(1);
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_EXHIBITION', { exact: true })).toHaveCount(1);

  await page.locator('#next-week-btn').click();
  await expect(page.locator('#week-label')).toHaveText('2026.09.07 ~ 2026.09.13');
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_WEEKLY', { exact: true })).toHaveCount(1);
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_EXHIBITION', { exact: true })).toHaveCount(0);

  await page.locator('#month-view-btn').click();
  await expect(page.locator('#week-label')).toHaveText('2026년 09월');
  await expect(page.locator('.month-mini-pill').filter({ hasText: 'CHARACTERIZATION_TEST_CALENDAR_WEEKLY' })).toHaveCount(1);
  await expect(page.locator('.month-span-pill').getByText('CHARACTERIZATION_TEST_CALENDAR_EXHIBITION', { exact: true })).toHaveCount(1);

  await page.locator('#prev-week-btn').click();
  await expect(page.locator('#week-label')).toHaveText('2026년 08월');
  await expect(page.locator('.month-mini-pill').filter({ hasText: 'CHARACTERIZATION_TEST_CALENDAR_WEEKLY' })).toHaveCount(1);
});

test('master calendar preserves week and month DOM projection', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);

  const events = [
    { id: 'GOLD_ORDINARY', kind: '개인작업', title: 'GOLD_ORDINARY', date: '2026-08-24', start: '10:00', end: '11:00', capacity: 1 },
    { id: 'GOLD_OVERLAP', kind: '개인작업', title: 'GOLD_OVERLAP', date: '2026-08-24', start: '10:30', end: '11:30', capacity: 1 },
    { id: 'GOLD_ADJACENT', kind: '개인작업', title: 'GOLD_ADJACENT', date: '2026-08-24', start: '11:00', end: '12:00', capacity: 1 },
    { id: 'GOLD_RECURRING', kind: '개인작업', title: 'GOLD_RECURRING', date: '2026-08-17', start: '14:00', end: '15:00', capacity: 1, repeatWeekly: true, repeatEndDate: '2026-08-31', repeatSkipDates: [] },
    { id: 'GOLD_CANCELLED', kind: '개인작업', title: 'GOLD_CANCELLED', date: '2026-08-19', start: '15:00', end: '16:00', capacity: 1, repeatWeekly: true, repeatEndDate: '2026-09-02', repeatSkipDates: ['2026-08-26'] },
    { id: 'GOLD_OVERRIDE', kind: '개인작업', title: 'GOLD_OVERRIDE', date: '2026-08-26', start: '15:30', end: '16:30', capacity: 1 },
    { id: 'GOLD_BOUNDARY', kind: '개인작업', title: 'GOLD_BOUNDARY', date: '2026-08-30', start: '23:30', end: '24:00', capacity: 1 },
    { id: 'GOLD_EXHIBITION', kind: '전시회', title: 'GOLD_EXHIBITION', date: '2026-08-24', endDate: '2026-08-26', start: '00:00', end: '24:00' }
  ];
  await page.evaluate((nextEvents) => {
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify({
      events: nextEvents,
      baseRules: [],
      baseRuleTimeline: [],
      baseWeekOverrides: {}
    }));
    window.dispatchEvent(new CustomEvent('cloud-sync:state-applied', {
      detail: { keys: ['studio-calendar-state-v1'] }
    }));
  }, events);

  await expect(page.locator('#calendar-day-header .day-header')).toHaveCount(7);
  await expect(page.locator('#calendar-body .day-slot')).toHaveCount(336);
  const ordinary = page.locator('.event-bubble[data-event-id="GOLD_ORDINARY"]');
  const overlap = page.locator('.event-bubble[data-event-id="GOLD_OVERLAP"]');
  const adjacent = page.locator('.event-bubble[data-event-id="GOLD_ADJACENT"]');
  const recurring = page.locator('.event-bubble[data-event-id="GOLD_RECURRING"]');
  const boundary = page.locator('.event-bubble[data-event-id="GOLD_BOUNDARY"]');
  await expect(ordinary).toHaveAttribute('data-day-index', '0');
  await expect(ordinary).toHaveAttribute('data-start-slot', '20');
  await expect(ordinary).toHaveAttribute('data-end-slot', '22');
  await expect(ordinary).toHaveAttribute('data-lane', '0');
  await expect(ordinary).toHaveCSS('top', '561px');
  await expect(ordinary).toHaveCSS('height', '54px');
  await expect(overlap).toHaveAttribute('data-lane', '1');
  await expect(adjacent).toHaveAttribute('data-lane', '0');
  await expect(recurring).toHaveAttribute('data-date', '2026-08-24');
  await expect(page.getByText('GOLD_CANCELLED', { exact: true })).toHaveCount(0);
  await expect(page.getByText('GOLD_OVERRIDE', { exact: true })).toHaveCount(1);
  await expect(boundary).toHaveAttribute('data-start-slot', '47');
  await expect(boundary).toHaveAttribute('data-end-slot', '48');
  await expect(boundary).toHaveCSS('height', '26px');
  await expect(page.locator('.all-day-pill').filter({ hasText: 'GOLD_EXHIBITION' })).toHaveCount(1);

  const ordinaryBox = await ordinary.boundingBox();
  expect(ordinaryBox).not.toBeNull();
  await ordinary.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'mouse',
    button: 0,
    clientX: ordinaryBox.x + ordinaryBox.width / 2,
    clientY: ordinaryBox.y + ordinaryBox.height / 2
  });
  await expect(ordinary).toHaveClass(/editing/);
  await page.locator('body').dispatchEvent('pointercancel', { pointerId: 71, pointerType: 'mouse' });
  await expect(ordinary).not.toHaveClass(/editing/);

  await page.locator('#month-view-btn').click();
  await expect(page.locator('#calendar-body .month-day-cell')).toHaveCount(42);
  const august24 = page.locator('#calendar-body .month-day-cell').nth(28);
  await expect(august24.locator('.month-mini-pill')).toHaveText([
    '10:00 GOLD_ORDINARY',
    '10:30 GOLD_OVERLAP',
    '11:00 GOLD_ADJACENT',
    '14:00 GOLD_RECURRING'
  ]);
  const exhibition = page.locator('.month-span-pill').filter({ hasText: 'GOLD_EXHIBITION' });
  await expect(exhibition).toHaveCount(1);
  await expect(exhibition).toHaveCSS('top', '534px');
});

test('master calendar recurring delete preserves one-occurrence prompt behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);
  await page.evaluate(() => {
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify({
      events: [{
        id: 'CHARACTERIZATION_TEST_RECURRING_DELETE',
        kind: '개인작업',
        title: 'CHARACTERIZATION_TEST_RECURRING_DELETE',
        date: '2026-08-19',
        start: '14:00',
        end: '15:00',
        capacity: 1,
        repeatWeekly: true,
        repeatEndDate: '2026-09-02',
        repeatSkipDates: []
      }],
      baseRules: [],
      baseRuleTimeline: [],
      baseWeekOverrides: {}
    }));
    window.dispatchEvent(new CustomEvent('cloud-sync:state-applied', {
      detail: { keys: ['studio-calendar-state-v1'] }
    }));
  });

  const occurrence = page.locator('.event-bubble[data-event-id="CHARACTERIZATION_TEST_RECURRING_DELETE"]');
  await expect(occurrence).toHaveAttribute('data-date', '2026-08-26');
  await occurrence.locator('.event-bubble-delete').click();
  await expect(page.locator('#recurring-delete-modal')).toHaveClass(/open/);
  await page.locator('#delete-recurring-one-btn').click();
  await expect(page.locator('#recurring-delete-modal')).not.toHaveClass(/open/);
  await expect(occurrence).toHaveCount(0);

  const storedEvent = await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return documentState.events?.find((eventItem) => eventItem.id === 'CHARACTERIZATION_TEST_RECURRING_DELETE');
  });
  expect(storedEvent).toMatchObject({
    date: '2026-08-19',
    repeatWeekly: true,
    repeatEndDate: '2026-09-02',
    repeatSkipDates: ['2026-08-26']
  });

  await page.locator('#next-week-btn').click();
  await expect(page.locator('.event-bubble[data-event-id="CHARACTERIZATION_TEST_RECURRING_DELETE"]')).toHaveAttribute('data-date', '2026-09-02');
});

test('master calendar event modal preserves reset and single listener behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);

  const modal = page.locator('#event-modal');
  await page.locator('#open-add-event-btn').click();
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#event-date')).toHaveValue('2026-08-24');
  await expect(page.locator('#event-selector-grid .event-select-cell')).toHaveCount(336);
  await page.locator('#event-kind').selectOption('기타');
  await page.locator('#event-title').fill('SHOULD_RESET');
  await page.locator('[data-close-modal="event-modal"]').click();
  await expect(modal).not.toHaveClass(/open/);

  await page.locator('#open-add-event-btn').click();
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#event-kind')).toHaveValue('수강');
  await expect(page.locator('#event-title')).toHaveValue('');

  let dialogCount = 0;
  page.on('dialog', async (dialog) => {
    dialogCount += 1;
    await dialog.dismiss();
  });
  await page.locator('#save-event-btn').click();
  await expect.poll(() => dialogCount).toBe(1);
  await expect(modal).toHaveClass(/open/);
});

test('master calendar event selector preserves drag selection and single save behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);
  await page.locator('#open-add-event-btn').click();
  await page.locator('#event-kind').selectOption('기타');
  await page.locator('#event-title').fill('CHARACTERIZATION_TEST_SELECTOR_CREATED');

  const startCell = page.locator('.event-select-cell[data-day="2"][data-slot="24"]');
  const endCell = page.locator('.event-select-cell[data-day="2"][data-slot="25"]');
  await startCell.dispatchEvent('mousedown', { button: 0 });
  await endCell.dispatchEvent('mouseenter');
  await endCell.dispatchEvent('mouseup', { button: 0 });
  await expect(page.locator('#event-date')).toHaveValue('2026-08-26');
  await expect(page.locator('#event-start')).toHaveValue('12:00');
  await expect(page.locator('#event-end')).toHaveValue('13:00');
  await expect(page.locator('.event-selector-bubble.is-preview')).toHaveCount(1);
  await expect(page.locator('.event-selector-bubble.is-preview')).toHaveText('CHARACTERIZATION_TEST_SELECTOR_CREATED');

  await page.locator('#save-event-btn').click();
  await expect(page.locator('#event-modal')).not.toHaveClass(/open/);
  await expect(page.locator('#calendar-body').getByText('CHARACTERIZATION_TEST_SELECTOR_CREATED', { exact: true })).toHaveCount(1);
  const createdEvents = await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.events || []).filter((eventItem) => eventItem.title === 'CHARACTERIZATION_TEST_SELECTOR_CREATED');
  });
  expect(createdEvents).toHaveLength(1);
  expect(createdEvents[0]).toMatchObject({
    kind: '기타',
    title: 'CHARACTERIZATION_TEST_SELECTOR_CREATED',
    date: '2026-08-26',
    start: '12:00',
    end: '13:00',
    repeatWeekly: false
  });
});

test('master calendar quick edit preserves population, reset, and single save behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);
  await page.locator('#next-week-btn').click();

  const eventBubble = page.locator('.event-bubble[data-event-id="CHARACTERIZATION_TEST_CALENDAR_SINGLE"]');
  const modal = page.locator('#event-quick-edit-modal');
  await eventBubble.click();
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#quick-edit-kind')).toHaveText('기타');
  await expect(page.locator('#quick-edit-title-row')).toBeVisible();
  await expect(page.locator('#quick-edit-user-row')).toBeHidden();
  await expect(page.locator('#quick-edit-title')).toHaveValue('CHARACTERIZATION_TEST_CALENDAR_SINGLE');
  await expect(page.locator('#quick-edit-date')).toHaveValue('2026-09-01');
  await expect(page.locator('#quick-edit-start')).toHaveValue('12:00');
  await expect(page.locator('#quick-edit-end')).toHaveValue('13:00');

  await page.locator('#quick-edit-title').fill('STALE_QUICK_EDIT_VALUE');
  await page.locator('[data-close-modal="event-quick-edit-modal"]').click();
  await eventBubble.click();
  await expect(page.locator('#quick-edit-title')).toHaveValue('CHARACTERIZATION_TEST_CALENDAR_SINGLE');

  await page.locator('#quick-edit-title').fill('CHARACTERIZATION_TEST_CALENDAR_SINGLE_EDITED');
  await page.locator('#save-event-quick-edit-btn').click();
  await expect(modal).not.toHaveClass(/open/);
  await expect(page.getByText('CHARACTERIZATION_TEST_CALENDAR_SINGLE_EDITED', { exact: true })).toHaveCount(1);
  const changedEvents = await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.events || []).filter((eventItem) => eventItem.title === 'CHARACTERIZATION_TEST_CALENDAR_SINGLE_EDITED');
  });
  expect(changedEvents).toHaveLength(1);
  expect(changedEvents[0]).toMatchObject({
    id: 'CHARACTERIZATION_TEST_CALENDAR_SINGLE',
    date: '2026-09-01',
    start: '12:00',
    end: '13:00'
  });
});

test('master calendar base edit preserves population, reset, save, and delete behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);
  await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    documentState.baseRules = [{
      id: 'CHARACTERIZATION_TEST_BASE_RULE',
      day: 0,
      startSlot: 20,
      endSlot: 22,
      type: '개인작업 시간',
      className: '',
      instructor: ''
    }];
    documentState.baseRuleTimeline = [];
    documentState.baseWeekOverrides = {};
    localStorage.setItem('studio-calendar-state-v1', JSON.stringify(documentState));
    window.dispatchEvent(new CustomEvent('cloud-sync:state-applied', {
      detail: { keys: ['studio-calendar-state-v1'] }
    }));
  });

  await page.locator('#open-base-editor-btn').click();
  const ruleCell = page.locator('.base-cell[data-rule-id="CHARACTERIZATION_TEST_BASE_RULE"].base-block-start');
  const editModal = page.locator('#base-edit-modal');
  await ruleCell.click();
  await expect(editModal).toHaveClass(/open/);
  await expect(page.locator('#edit-base-type')).toHaveValue('개인작업 시간');
  await expect(page.locator('#edit-base-class-row')).toBeHidden();
  await expect(page.locator('#edit-base-day')).toHaveValue('0');
  await expect(page.locator('#edit-base-start')).toHaveValue('10:00');
  await expect(page.locator('#edit-base-end')).toHaveValue('11:00');

  await page.locator('#edit-base-start').fill('09:00');
  await page.locator('[data-close-modal="base-edit-modal"]').click();
  await ruleCell.click();
  await expect(page.locator('#edit-base-start')).toHaveValue('10:00');

  await page.locator('#edit-base-type').selectOption('이용 불가');
  await page.locator('#edit-base-start').fill('10:30');
  await page.locator('#edit-base-end').fill('11:30');
  await page.locator('#save-base-edit-btn').click();
  await expect(editModal).not.toHaveClass(/open/);
  const savedRules = await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.baseRules || []).filter((rule) => rule.id === 'CHARACTERIZATION_TEST_BASE_RULE');
  });
  expect(savedRules).toEqual([{
    id: 'CHARACTERIZATION_TEST_BASE_RULE',
    day: 0,
    startSlot: 21,
    endSlot: 23,
    type: '이용 불가',
    className: '',
    instructor: ''
  }]);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.base-cell[data-rule-id="CHARACTERIZATION_TEST_BASE_RULE"].base-block-start').click();
  await page.locator('#delete-base-edit-btn').click();
  await expect(editModal).not.toHaveClass(/open/);
  expect(await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.baseRules || []).some((rule) => rule.id === 'CHARACTERIZATION_TEST_BASE_RULE');
  })).toBe(false);
});

test('master calendar base editor preserves drag add, ghost cleanup, and undo behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T12:00:00'));
  await page.goto('/pottery-master-calendar.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.masterCalendarReady);
  await page.locator('#open-base-editor-btn').click();
  await page.locator('#base-add-block-btn').click();
  await page.locator('#base-type').selectOption('개인작업 시간');

  const startCell = page.locator('.base-cell[data-day="1"][data-slot="20"]');
  const endCell = page.locator('.base-cell[data-day="1"][data-slot="21"]');
  await startCell.dispatchEvent('mousedown', { button: 0 });
  await expect(page.locator('.base-add-ghost')).toHaveCount(1);
  await endCell.dispatchEvent('mouseenter');
  await endCell.dispatchEvent('mouseup', { button: 0 });
  await expect(page.locator('.base-add-ghost')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/is-dragging-base/);

  const createdRules = await page.evaluate(() => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.baseRules || []).filter((rule) => rule.type === '개인작업 시간');
  });
  expect(createdRules).toHaveLength(1);
  expect(createdRules[0]).toMatchObject({
    day: 1,
    startSlot: 20,
    endSlot: 22,
    type: '개인작업 시간',
    className: '',
    instructor: ''
  });
  await expect(page.locator(`.base-cell[data-rule-id="${createdRules[0].id}"]`)).toHaveCount(2);

  await page.keyboard.press('Meta+z');
  await expect(page.locator(`.base-cell[data-rule-id="${createdRules[0].id}"]`)).toHaveCount(0);
  expect(await page.evaluate((ruleId) => {
    const documentState = JSON.parse(localStorage.getItem('studio-calendar-state-v1') || '{}');
    return (documentState.baseRules || []).some((rule) => rule.id === ruleId);
  }, createdRules[0].id)).toBe(false);
});

test('material orders preserve grouping, editing, merge overlap, undo, keyboard focus, and export', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-04-15T12:00:00'));
  await page.goto('/pottery-material-orders.html', { waitUntil: 'networkidle' });

  const firstRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_A"]');
  const secondRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_B"]');
  const thirdRow = page.locator('tr[data-item-id="CHARACTERIZATION_TEST_ITEM_C"]');
  await expect(page.locator('#month-label')).toHaveText('2025년 4월');
  await expect(firstRow.locator('td[data-merge-col="number"]')).toHaveText('2');
  await expect(firstRow.locator('td[data-merge-col="number"]')).toHaveAttribute('rowspan', '2');
  await expect(secondRow.locator('td[data-merge-col="number"]')).toHaveCount(0);
  await expect(page.locator('.orders-total-row td').filter({ hasText: '33,500원' })).toHaveCount(1);

  await firstRow.locator('[data-action="edit"]').click();
  const firstProduct = firstRow.locator('.js-edit-product');
  await firstProduct.fill('Clay A Edited');
  await firstProduct.press('ArrowRight');
  await expect(firstRow.locator('.js-edit-quantity')).toBeFocused();

  await firstProduct.click();
  await secondRow.locator('.js-edit-product').click({ modifiers: ['Shift'] });
  await page.locator('#order-merge-cells-btn').click();
  await expect(firstRow.locator('td[data-merge-col="product"]')).toHaveAttribute('rowspan', '2');
  await expect(secondRow.locator('td[data-merge-col="product"]')).toHaveCSS('display', 'none');

  await firstRow.locator('.js-edit-product').click();
  await thirdRow.locator('td[data-merge-col="product"]').click({ modifiers: ['Shift'] });
  await page.locator('#order-merge-cells-btn').click();
  await expect(firstRow.locator('td[data-merge-col="product"]')).toHaveAttribute('rowspan', '3');

  await page.locator('#order-undo-btn').click();
  await expect(firstRow.locator('td[data-merge-col="product"]')).toHaveAttribute('rowspan', '2');
  await expect(thirdRow.locator('td[data-merge-col="product"]')).not.toHaveCSS('display', 'none');
  await expect(firstRow.locator('td[data-merge-col="product"]')).toContainText('Clay A Edited');

  await firstRow.locator('[data-action="edit"]').click();
  await firstRow.locator('.js-edit-product').fill('Clay A Saved');
  await firstRow.locator('[data-action="save"]').click();
  await expect(firstRow.locator('td[data-merge-col="product"]')).toContainText('Clay A Saved');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#order-export-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('재료주문_2025-04.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"1","2025-04-02","흙","클레이어","Clay A Saved"');
  expect(csv).toContain('"2","2025-04-01","기타","중앙도재","Tool C"');
});

test('material orders modal preserves lifecycle and single listener behavior', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-04-15T12:00:00'));
  await page.goto('/pottery-material-orders.html', { waitUntil: 'networkidle' });

  const modal = page.locator('#material-order-modal');
  const lines = page.locator('#material-order-lines .order-line-row');
  const openButton = page.locator('#order-add-btn');

  await openButton.click();
  await expect(modal).toHaveClass(/is-open/);
  await expect(page.locator('#material-order-date')).toHaveValue('2025-04-15');
  await expect(lines).toHaveCount(1);
  await page.locator('#add-order-line-btn').click();
  await expect(lines).toHaveCount(2);
  await page.locator('#close-order-modal-btn').click();
  await expect(modal).not.toHaveClass(/is-open/);

  await openButton.click();
  await expect(lines).toHaveCount(1);
  await page.locator('#add-order-line-btn').click();
  await expect(lines).toHaveCount(2);

  const firstProduct = lines.nth(0).locator('.js-new-product');
  await firstProduct.focus();
  await firstProduct.press('ArrowRight');
  await expect(lines.nth(0).locator('.js-new-quantity')).toBeFocused();
  await page.keyboard.press('Meta+z');
  await expect(lines).toHaveCount(1);
  await page.locator('#add-order-line-btn').click();
  await expect(lines).toHaveCount(2);

  await lines.nth(0).locator('.js-new-product').fill('CHARACTERIZATION_TEST_NEW_CLAY');
  await lines.nth(1).locator('.js-new-product').fill('CHARACTERIZATION_TEST_NEW_GLAZE');
  await page.locator('#material-order-form').evaluate((form) => form.requestSubmit());

  await expect(modal).not.toHaveClass(/is-open/);
  await expect(page.locator('tr[data-item-id]')).toHaveCount(5);
  await expect(page.getByText('CHARACTERIZATION_TEST_NEW_CLAY', { exact: true })).toHaveCount(1);
  await expect(page.getByText('CHARACTERIZATION_TEST_NEW_GLAZE', { exact: true })).toHaveCount(1);
});

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
  await page.evaluate(() => window.exhibitionDetailReady);
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
  await page.evaluate(() => window.exhibitionDetailReady);
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

test('student payment credits preserve row, detail, role actions, recomputation, and reload', async ({ page }) => {
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
  await page.goto('/pottery-students.html', { waitUntil: 'networkidle' });
  const stateBefore = await page.evaluate(() => ({
    students: localStorage.getItem('pottery-students-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }));
  const studentRow = page.locator('#students-tbody tr').filter({ hasText: 'CHARACTERIZATION_TEST_STUDENT' });
  await expect(studentRow).toHaveCount(1);
  const cells = studentRow.locator('td');
  await expect(cells.nth(5)).toContainText('2026-07-15');
  await expect(studentRow.locator('.remaining-badge')).toHaveText('2');
  await expect(studentRow.locator('.row-action-btn.payment-add')).toBeVisible();
  await expect(studentRow.locator('.row-action-btn.edit')).toBeVisible();
  await expect(studentRow.locator('.row-action-btn.delete')).toBeVisible();

  await studentRow.locator('.row-action-btn.detail').click();
  await expect(page.locator('#student-detail-modal')).toHaveClass(/open/);
  await expect(page.locator('#student-detail-title')).toContainText('CHARACTERIZATION_TEST_STUDENT');
  const detailText = await page.locator('#student-detail-payment-class-body').innerText();
  expect(detailText).toContain('2026-07-01');
  expect(detailText).toContain('4회');
  expect(detailText).toContain('120,000원');
  expect(detailText).toContain('2026-07-15');
  expect(detailText).not.toContain('2026-07-08');
  await page.locator('#student-detail-close-btn').click();

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(studentRow.locator('.remaining-badge')).toHaveText('2');
  expect(await page.evaluate(() => ({
    students: localStorage.getItem('pottery-students-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }))).toEqual(stateBefore);

  await page.reload({ waitUntil: 'networkidle' });
  const reloadedRow = page.locator('#students-tbody tr').filter({ hasText: 'CHARACTERIZATION_TEST_STUDENT' });
  await expect(reloadedRow.locator('.remaining-badge')).toHaveText('2');
  expect(await page.evaluate(() => ({
    students: localStorage.getItem('pottery-students-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }))).toEqual(stateBefore);
  expect(pageErrors).toEqual([]);
});

test('student payment cycles render late payment overflow consistently and preserve reduced credits', async ({ page }) => {
  await page.addInitScript(() => {
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
    window.Date = FixedDate;
  });

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/pottery-students.html', { waitUntil: 'networkidle' });

  const cycleRow = page.locator('#students-tbody tr').filter({ hasText: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT' });
  await expect(cycleRow.locator('.remaining-badge')).toHaveText('2');
  await cycleRow.locator('.row-action-btn.detail').click();

  const detailText = await page.locator('#student-detail-payment-class-body').innerText();
  expect(detailText.indexOf('2026-09-08')).toBeLessThan(detailText.indexOf('2026-09-01'));
  expect(detailText.indexOf('2026-09-01')).toBeLessThan(detailText.indexOf('2026-08-04'));
  expect(detailText).not.toContain('이전 결제 사이클');
  await page.locator('#student-detail-close-btn').click();

  const reducedRow = page.locator('#students-tbody tr').filter({ hasText: 'PAYMENT_CYCLE_REDUCED_STUDENT' });
  await expect(reducedRow.locator('.remaining-badge')).toHaveText('0');
  await reducedRow.locator('.row-action-btn.detail').click();
  const reducedDetailRows = page.locator('#student-detail-payment-class-body tr');
  await expect(reducedDetailRows.filter({ hasText: '2026-08-04' })).toContainText('2026-08-28');
  await expect(reducedDetailRows.filter({ hasText: '2026-08-04' })).not.toContainText('2026-09-04');
  await expect(reducedDetailRows.filter({ hasText: '다음 결제 대기' })).toContainText('2026-09-04');
  await page.locator('#student-detail-close-btn').click();

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#students-tbody tr').filter({ hasText: 'PAYMENT_CYCLE_LATE_ENTRY_STUDENT' })
    .locator('.remaining-badge')).toHaveText('2');
  await expect(page.locator('#students-tbody tr').filter({ hasText: 'PAYMENT_CYCLE_REDUCED_STUDENT' })
    .locator('.remaining-badge')).toHaveText('0');
  expect(pageErrors).toEqual([]);
});

test('personal work cycles preserve active, dormant, payment, usage, edit, detail, and reload behavior', async ({ page }) => {
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
  await page.goto('/pottery-personal-work.html', { waitUntil: 'networkidle' });
  const stateBefore = await page.evaluate(() => ({
    personalWork: localStorage.getItem('pottery-personal-work-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }));

  const activeRow = page.locator('#personal-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_ACTIVE"]');
  await expect(activeRow).toHaveCount(1);
  await expect(activeRow.locator('.period-col')).toHaveText('2026-08-15 ~ 2026-09-15');
  await expect(activeRow.locator('.personal-need-payment')).toHaveText('결제 필요');
  await expect(activeRow.locator('.used-col')).toHaveText('2시간');
  await expect(activeRow.locator('.remain-col')).toHaveText('1시간');

  const dormantRow = page.locator('#personal-dormant-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_DORMANT"]');
  await expect(dormantRow).toHaveCount(1);
  await expect(dormantRow.locator('.period-col')).toHaveText('2026-07-01 ~ 2026-08-01');
  await expect(dormantRow.locator('.personal-need-payment')).toHaveCount(0);
  await expect(dormantRow.locator('.used-col')).toHaveText('3시간');
  await expect(dormantRow.locator('.remain-col')).toHaveText('1시간');

  await activeRow.locator('.personal-action-btn.edit').click();
  await expect(page.locator('#edit-start-CHARACTERIZATION_TEST_PERSONAL_ACTIVE')).toHaveValue('2026-07-15');
  await activeRow.locator('.personal-action-btn.cancel').click();
  await activeRow.locator('.personal-action-btn.detail').click();
  await expect(page.locator('#personal-detail-modal')).toHaveClass(/open/);
  await expect(page.locator('#personal-detail-payment-body')).toContainText('2026-07-15');
  await expect(page.locator('#personal-detail-usage-body')).toContainText('2026-08-15 13:00~15:00');
  await page.locator('#personal-detail-close').click();

  expect(await page.evaluate(() => ({
    personalWork: localStorage.getItem('pottery-personal-work-v1'),
    calendar: localStorage.getItem('studio-calendar-state-v1')
  }))).toEqual(stateBefore);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#personal-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_ACTIVE"] .remain-col')).toHaveText('1시간');
  await expect(page.locator('#personal-dormant-tbody tr[data-id="CHARACTERIZATION_TEST_PERSONAL_DORMANT"] .remain-col')).toHaveText('1시간');
  expect(await page.evaluate(() => localStorage.getItem('pottery-personal-work-v1'))).toBe(stateBefore.personalWork);
  expect(pageErrors).toEqual([]);
});