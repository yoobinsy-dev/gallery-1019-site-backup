const test = require('node:test');
const assert = require('node:assert/strict');

const { loadCommonJsWithMocks } = require('../helpers/load-source');

const stateStore = {
  getStateMap: async () => ({}),
  getStateMetaMap: async () => ({}),
  getStateMapWithMeta: async () => ({ data: {}, meta: {} }),
  setStateValue: async () => '2026-08-28T00:00:00.000Z',
  deleteStateValue: async () => {}
};
const auditStore = {
  logStateWriteAttempt: async () => {},
  recordAlert: async () => {},
  maybeTriggerConflictSpikeAlert: async () => {}
};
const imageRefs = {
  buildTransferSafeExhibitions: (value) => ({ exhibitions: value, stats: {} }),
  migrateExhibitionImageReferences: async (exhibitions) => ({ exhibitions, stats: {} })
};

const handler = loadCommonJsWithMocks('api/state.js', {
  './_lib/state-store': stateStore,
  './_lib/audit-store': auditStore,
  './_lib/exhibition-image-refs': imageRefs
}, [
  'detectLargeUnexpectedInventoryDrop',
  'detectSuspiciousUserDrop',
  'mergeUsersWithDelta',
  'mergeUsersPreservingPasswords',
  'hasUsersWithMissingPasswords',
  'hasAtLeastOneAdminWithPassword'
]);

const policy = handler.__characterization;

function exhibition(id, counts = {}, extra = {}) {
  const value = { id, ...extra };
  for (const field of ['artWorks', 'works', 'goods', 'artSoldWorks', 'soldGoods']) {
    if (Object.prototype.hasOwnProperty.call(counts, field)) {
      value[field] = Array.from({ length: counts[field] }, (_, index) => ({ id: index + 1 }));
    }
  }
  return value;
}

test('inventory-drop policy characterizes threshold boundaries and inventory fields', () => {
  assert.equal(policy.detectLargeUnexpectedInventoryDrop([exhibition(1, { artWorks: 19 })], [exhibition(1)]), null);
  assert.equal(policy.detectLargeUnexpectedInventoryDrop([exhibition(1, { artWorks: 20 })], [exhibition(1, { artWorks: 6 })]), null);
  assert.deepEqual(
    policy.detectLargeUnexpectedInventoryDrop([exhibition(1, { artWorks: 20 })], [exhibition(1, { artWorks: 5 })]),
    { exhibitionId: 1, previousCount: 20, nextCount: 5, dropped: 15, ratio: 0.75 }
  );
  assert.deepEqual(
    policy.detectLargeUnexpectedInventoryDrop(
      [exhibition(2, { works: 10, goods: 4, artSoldWorks: 3, soldGoods: 3 })],
      [exhibition(2)]
    ),
    { exhibitionId: 2, previousCount: 20, nextCount: 0, dropped: 20, ratio: 1 }
  );
});

test('inventory-drop policy characterizes missing, malformed, delta, clear, and multiple-drop behavior', () => {
  const current = [exhibition(1, { artWorks: 20 }), exhibition(2, { artWorks: 30 })];
  assert.equal(policy.detectLargeUnexpectedInventoryDrop(null, []), null);
  assert.equal(policy.detectLargeUnexpectedInventoryDrop(current, [], { treatMissingAsZero: false }), null);
  assert.equal(policy.detectLargeUnexpectedInventoryDrop(current, [], { onlyTouchedIds: new Set([9]) }), null);
  assert.equal(
    policy.detectLargeUnexpectedInventoryDrop(current, [
      exhibition(1, {}, { inventoryExplicitlyClearedAt: '2026-08-28' }),
      exhibition(2, { artWorks: 30 })
    ]),
    null
  );
  assert.equal(policy.detectLargeUnexpectedInventoryDrop(current, []).exhibitionId, 1);
  assert.equal(
    policy.detectLargeUnexpectedInventoryDrop(current, [exhibition(1), exhibition(2)], { onlyTouchedIds: new Set([2]) }).exhibitionId,
    2
  );
});

test('user merge characterizes identity, passwords, unknown fields, add, update, removal, and ordering', () => {
  const current = [
    { id: 1, username: 'admin', password: 'secret', accountType: '어드민', unknown: 'keep-if-present' },
    { id: 2, username: 'member', password: 'member-secret' }
  ];
  const merged = policy.mergeUsersWithDelta(current, [
    { id: 1, username: 'ADMIN', password: '', accountType: '어드민', changed: true },
    { id: 3, username: 'new', password: 'new-secret' }
  ], [2]);

  assert.deepEqual(merged, [
    { id: 1, username: 'ADMIN', password: 'secret', accountType: '어드민', changed: true },
    { id: 3, username: 'new', password: 'new-secret' }
  ]);
  assert.equal(policy.hasUsersWithMissingPasswords(merged), false);
  assert.equal(policy.hasAtLeastOneAdminWithPassword(merged), true);
});

test('user safety characterizes duplicate primary identities, malformed values, explicit drops, and invariants', () => {
  const duplicates = policy.mergeUsersWithDelta([], [
    { id: 1, username: 'first', password: 'a' },
    { id: 1, username: 'second', password: 'b' },
    null
  ]);
  assert.deepEqual(duplicates, [{ id: 1, username: 'second', password: 'b' }]);
  assert.deepEqual(policy.detectSuspiciousUserDrop([{}, {}, {}, {}], [{}, {}], []), {
    previousCount: 4, nextCount: 2, dropped: 2, ratio: 0.5, explicitRemovedIds: 0
  });
  assert.deepEqual(policy.detectSuspiciousUserDrop([{}, {}, {}, {}], [{}], []), {
    previousCount: 4, nextCount: 1, dropped: 3, ratio: 0.75, explicitRemovedIds: 0
  });
  assert.equal(policy.detectSuspiciousUserDrop([{}, {}, {}, {}], [{}], [1, 2, 3]), null);
  assert.equal(policy.hasUsersWithMissingPasswords([null, { id: 1 }]), true);
  assert.equal(policy.hasAtLeastOneAdminWithPassword([{ accountType: '어드민', password: '' }]), false);
});