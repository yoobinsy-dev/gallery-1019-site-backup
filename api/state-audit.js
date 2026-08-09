const { sendJson, methodNotAllowed } = require('./_lib/http');
const { getRecentAuditEvents, getRecentAlerts } = require('./_lib/audit-store');

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

    sendJson(res, 200, {
      ok: true,
      events,
      alerts
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Failed to load state audit logs.'
    });
  }
};
