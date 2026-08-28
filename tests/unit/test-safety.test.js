const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEVELOPMENT_IDENTITIES,
  assertMutableTestTarget,
  assertSyntheticIdentifier
} = require('../helpers/test-safety');

function validDevelopmentIdentity(overrides = {}) {
  return {
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: `https://${DEVELOPMENT_IDENTITIES.host}`,
    archiveWriteEnabled: false,
    ...overrides
  };
}

test('test safety accepts only the complete documented development identity', () => {
  assert.equal(assertMutableTestTarget(validDevelopmentIdentity()), true);
});

test('test safety refuses production host and each production resource identifier', () => {
  assert.throws(
    () => assertMutableTestTarget(validDevelopmentIdentity({ baseUrl: 'https://gallery-1019-site.vercel.app' })),
    /production resource identity/
  );

  for (const [field, value] of [
    ['vercelProjectId', 'prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG'],
    ['databaseBranchId', 'br-crimson-flower-auah6zwc'],
    ['databaseEndpointId', 'ep-autumn-brook-aum5q7ch'],
    ['imageStoreId', 'store_8GrgABDn7KW6YuH3']
  ]) {
    assert.throws(
      () => assertMutableTestTarget(validDevelopmentIdentity({ [field]: value })),
      /production resource identity/
    );
  }
});

test('test safety fails closed for missing, unknown, or write-enabled identities', () => {
  assert.throws(() => assertMutableTestTarget(), /host identity/);
  assert.throws(
    () => assertMutableTestTarget(validDevelopmentIdentity({ databaseEndpointId: 'unknown' })),
    /database endpoint/
  );
  assert.throws(
    () => assertMutableTestTarget(validDevelopmentIdentity({ archiveWriteEnabled: true })),
    /archive writes must be disabled/
  );
});

test('test safety requires visibly synthetic mutable fixture identifiers', () => {
  assert.equal(assertSyntheticIdentifier('E2E_TEST_exhibition_001'), true);
  assert.equal(assertSyntheticIdentifier('CHARACTERIZATION_TEST_user_001'), true);
  assert.throws(() => assertSyntheticIdentifier('ordinary-record'), /not marked as synthetic/);
});