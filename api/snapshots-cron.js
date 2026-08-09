const { sendJson, methodNotAllowed } = require('./_lib/http');
const { createDailyExhibitionSnapshots } = require('./_lib/exhibition-snapshot-store');

function isAuthorizedCron(req) {
  const cronHeader = req.headers && req.headers['x-vercel-cron'];
  if (typeof cronHeader === 'string' && cronHeader.trim()) return true;

  const expectedSecret = process.env.SNAPSHOT_CRON_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const provided = (req.query && req.query.secret) || '';
  const authHeader = typeof req.headers?.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  const bearerPrefix = 'bearer ';
  const bearerSecret = authHeader.toLowerCase().startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length).trim()
    : '';

  return provided === expectedSecret || bearerSecret === expectedSecret;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  if (!isAuthorizedCron(req)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  try {
    const result = await createDailyExhibitionSnapshots();

    sendJson(res, 200, {
      ok: true,
      exhibitionCount: result.exhibitionCount,
      createdCount: result.createdCount,
      existingCount: result.existingCount,
      timezone: 'Asia/Seoul',
      schedule: 'daily 07:00 and 19:00 KST'
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Cron snapshot failed.' });
  }
};
