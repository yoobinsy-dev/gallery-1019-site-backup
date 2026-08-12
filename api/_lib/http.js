const { createHash } = require('crypto');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function createWeakEtag(payload, prefix = 'json') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const digest = createHash('sha1').update(body).digest('hex');
  return `W/"${prefix}-${digest}"`;
}

function requestHasMatchingEtag(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader || !etag) return false;

  const normalized = String(ifNoneMatchHeader)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.includes('*') || normalized.includes(etag);
}

function writeCacheHeaders(res, cacheControl, etag) {
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }

  if (etag) {
    res.setHeader('ETag', etag);
  }
}

function sendCachedJson(req, res, statusCode, payload, options = {}) {
  const cacheControl = typeof options.cacheControl === 'string'
    ? options.cacheControl.trim()
    : '';
  const etag = typeof options.etag === 'string'
    ? options.etag.trim()
    : '';

  writeCacheHeaders(res, cacheControl, etag);

  if (statusCode === 200 && requestHasMatchingEtag(req?.headers?.['if-none-match'], etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }

  sendJson(res, statusCode, payload);
}

function methodNotAllowed(res, allowedMethods) {
  res.setHeader('Allow', allowedMethods.join(', '));
  sendJson(res, 405, { error: 'Method Not Allowed' });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}

module.exports = {
  createWeakEtag,
  sendCachedJson,
  sendJson,
  methodNotAllowed,
  readJsonBody,
  writeCacheHeaders
};
