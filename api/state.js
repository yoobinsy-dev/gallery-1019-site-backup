const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');
const { getStateMapWithMeta, setStateValue, deleteStateValue } = require('./_lib/state-store');

const ALLOWED_KEYS = new Set(['users', 'exhibitions']);

function sanitizeRequestedKeys(raw) {
  if (!raw) return ['users', 'exhibitions'];
  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => ALLOWED_KEYS.has(item));

  return parsed.length > 0 ? parsed : ['users', 'exhibitions'];
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const keys = sanitizeRequestedKeys(req.query.keys);
      const { data, meta } = await getStateMapWithMeta(keys);
      sendJson(res, 200, { ok: true, data, meta });
      return;
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const key = typeof body.key === 'string' ? body.key.trim() : '';

      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions.' });
        return;
      }

      await setStateValue(key, body.value);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions.' });
        return;
      }

      await deleteStateValue(key);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
  }
};
