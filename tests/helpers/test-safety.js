const PRODUCTION_HOSTS = new Set([
  'gallery-1019-site.vercel.app'
]);

const PRODUCTION_RESOURCE_IDS = new Set([
  'prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG',
  'br-crimson-flower-auah6zwc',
  'ep-autumn-brook-aum5q7ch',
  'store_8GrgABDn7KW6YuH3'
]);

const DEVELOPMENT_IDENTITIES = Object.freeze({
  vercelProjectId: 'prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2',
  databaseBranchId: 'br-divine-waterfall-au77ncm0',
  databaseEndpointId: 'ep-falling-cell-au5eg3l0',
  databaseRole: 'gallery_1019_runtime',
  imageStoreId: 'store_juobLGwpzZY4gmFa',
  host: 'gallery-1019-site-dev.vercel.app'
});

function normalizeHost(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    return new URL(input.includes('://') ? input : `https://${input}`).hostname.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function assertMutableTestTarget(identity = {}) {
  const host = normalizeHost(identity.baseUrl || identity.host);
  const values = Object.values(identity).map((value) => String(value || '').trim());

  if (!host) {
    throw new Error('Mutable test refused: target host identity is missing or invalid.');
  }
  if (PRODUCTION_HOSTS.has(host) || values.some((value) => PRODUCTION_RESOURCE_IDS.has(value))) {
    throw new Error('Mutable test refused: production resource identity detected.');
  }

  const expected = DEVELOPMENT_IDENTITIES;
  const requiredMatches = [
    ['host', host, expected.host],
    ['Vercel project', identity.vercelProjectId, expected.vercelProjectId],
    ['database branch', identity.databaseBranchId, expected.databaseBranchId],
    ['database endpoint', identity.databaseEndpointId, expected.databaseEndpointId],
    ['database role', identity.databaseRole, expected.databaseRole],
    ['image store', identity.imageStoreId, expected.imageStoreId]
  ];

  requiredMatches.forEach(([label, actual, wanted]) => {
    if (String(actual || '').trim() !== wanted) {
      throw new Error(`Mutable test refused: ${label} is not the documented development resource.`);
    }
  });

  if (identity.archiveWriteEnabled !== false) {
    throw new Error('Mutable test refused: development archive writes must be disabled.');
  }

  return true;
}

function assertSyntheticIdentifier(value) {
  const text = String(value || '').trim();
  if (!/^(E2E_TEST_|CHARACTERIZATION_TEST_)/.test(text)) {
    throw new Error('Mutable fixture refused: identifier is not marked as synthetic test data.');
  }
  return true;
}

module.exports = {
  DEVELOPMENT_IDENTITIES,
  PRODUCTION_HOSTS,
  PRODUCTION_RESOURCE_IDS,
  assertMutableTestTarget,
  assertSyntheticIdentifier,
  normalizeHost
};