const { sendJson, methodNotAllowed } = require('./_lib/http');
const { query } = require('./_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    await query('SELECT 1');
    sendJson(res, 200, {
      ok: true,
      service: 'gallery-1019-api',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Database connection failed.'
    });
  }
};
