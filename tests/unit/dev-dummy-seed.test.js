const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSeedData, cleanupSeedState, mergeSeedState, summarize } = require('../../scripts/seed-dev-dummy-data');
const manifest = require('../../scripts/dev-dummy-data-manifest.json');

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), 'en', { numeric: true }));
}

test('DEV dummy seed is deterministic, idempotent, and preserves unrelated state', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');
  const seed = buildSeedData(now);
  const unrelated = {
    users: [{ id: 7, username: 'existing', password: 'existing-password' }],
    exhibitions: [{ id: 7, title: 'existing' }],
    'pottery-students-v1': [{ id: 'existing-student', name: 'existing' }],
    'pottery-personal-work-v1': [{ id: 'existing-personal', userName: 'existing' }],
    'studio-calendar-state-v1': { events: [{ id: 'existing-event', title: 'existing' }], studioUsers: [], instructors: ['existing'], baseRules: [{ id: 'existing-rule' }] },
    'pottery-material-orders-v1': [{ id: 'existing-order', items: [{ id: 'existing-item' }] }],
    'pottery-accounting-v1': [{ id: 'existing-accounting', title: 'existing' }],
    'gallery-artworks-v1': [{ workId: 'work_existing', title: 'existing' }]
  };

  const once = mergeSeedState(unrelated, seed);
  const twice = mergeSeedState(once, seed);
  assert.deepEqual(twice, once);
  assert.deepEqual(summarize(once), manifest.counts);

  const cleaned = cleanupSeedState(twice);
  assert.deepEqual(cleaned, unrelated);
});

test('DEV dummy seed covers supported exhibition and studio states', () => {
  const seed = buildSeedData(new Date('2026-09-07T12:00:00.000Z'));
  assert.deepEqual(seed.users.map((item) => item.id), manifest.userIds);
  assert.deepEqual(sorted(seed['gallery-artworks-v1'].map((item) => item.workId)), sorted(manifest.artworkIds));
  assert.equal(seed['gallery-artworks-v1'].filter((item) => item.collection.owned).length, 8);
  assert.equal(seed.exhibitions.flatMap((item) => item.works).filter((work) => !work.workId).length, 1);
  assert.equal(seed.users[0].username, 'DEV_DUMMY_ADMIN');
  assert.equal(seed.users[0].approved, true);
  assert.deepEqual(seed.exhibitions.map((item) => item.id), manifest.exhibitionIds);
  assert.deepEqual(sorted(seed.exhibitions.flatMap((item) => item.works.map((work) => work.id))), sorted(manifest.workIds));
  assert.deepEqual(sorted(seed.exhibitions.flatMap((item) => item.soldWorks.map((sale) => sale.id))), sorted(manifest.saleIds));
  assert.deepEqual(sorted(seed.exhibitions.flatMap((item) => item.goods.map((goods) => goods.id))), sorted(manifest.goodsIds));
  assert.deepEqual(sorted(seed.exhibitions.flatMap((item) => item.expenseItems.map((expense) => expense.id))), sorted(manifest.exhibitionExpenseIds));
  assert.deepEqual(sorted(seed['pottery-students-v1'].map((student) => student.id)), sorted(manifest.studentIds));
  assert.deepEqual(sorted(seed['pottery-students-v1'].flatMap((student) => student.paymentRecords.map((payment) => payment.id))), sorted(manifest.studentPaymentIds));
  assert.deepEqual(sorted(seed['pottery-personal-work-v1'].map((entry) => entry.id)), sorted(manifest.personalWorkIds));
  assert.deepEqual(sorted(seed['studio-calendar-state-v1'].events.map((event) => event.id)), sorted(manifest.calendarEventIds));
  assert.deepEqual(sorted(seed['pottery-material-orders-v1'].map((order) => order.id)), sorted(manifest.materialOrderIds));
  assert.deepEqual(sorted(seed['pottery-material-orders-v1'].flatMap((order) => order.items.map((item) => item.id))), sorted(manifest.materialOrderItemIds));
  assert.equal(seed.exhibitions.every((item) => JSON.stringify(item.works) === JSON.stringify(item.artWorks)), true);
  assert.equal(seed.exhibitions.flatMap((item) => item.works).some((work) => work.price === '판매안함'), true);
  assert.deepEqual(new Set(seed['pottery-material-orders-v1'].flatMap((order) => order.items.map((item) => item.status))), new Set(['주문 완료', '배송중', '배송 완료']));
  assert.equal(seed['pottery-personal-work-v1'].some((item) => item.isDormant), true);
  assert.equal(seed['studio-calendar-state-v1'].events.some((item) => item.repeatWeekly), true);
});