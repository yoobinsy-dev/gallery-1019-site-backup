const { createWeakEtag, sendCachedJson, sendJson, methodNotAllowed, writeCacheHeaders } = require('./_lib/http');
const { getRecentAuditEvents, getRecentAlerts } = require('./_lib/audit-store');

const PRIVATE_REVALIDATE_CACHE_CONTROL = 'private, max-age=0, must-revalidate';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    const limit = req.query && req.query.limit ? Number(req.query.limit) : 50;
    const alertsLimit = req.query && req.query.alertLimit ? Number(req.query.alertLimit) : 20;

    const [events, alerts] = await Promise.all([
      getRecentAuditEvents(limit),
      getRecentAlerts(alertsLimit)
    ]);

    const payload = {
      ok: true,
      events,
      alerts
    };

    const etag = createWeakEtag(payload, `state-audit-${limit}-${alertsLimit}`);
    sendCachedJson(req, res, 200, payload, {
      cacheControl: PRIVATE_REVALIDATE_CACHE_CONTROL,
      etag
    });
  } catch (error) {
    writeCacheHeaders(res, 'no-store');
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Failed to load state audit logs.'
    });
  }
};
