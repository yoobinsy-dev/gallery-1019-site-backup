const { sendJson, methodNotAllowed } = require('./_lib/http');
const { query } = require('./_lib/db');
const { getRecentDecisionCount, getRecentAlerts } = require('./_lib/audit-store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    await query('SELECT 1');
    const conflict10m = await getRecentDecisionCount(['conflict_rejected', 'stale_rejected'], 10);
    const blockedDrops24h = await getRecentDecisionCount(['drop_blocked'], 24 * 60);
    const latestAlerts = await getRecentAlerts(5);

    sendJson(res, 200, {
      ok: true,
      service: 'gallery-1019-api',
      timestamp: new Date().toISOString(),
      safeguards: {
        conflictRejectedLast10m: conflict10m,
        blockedLargeDropsLast24h: blockedDrops24h,
        latestAlerts
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Database connection failed.'
    });
  }
};
