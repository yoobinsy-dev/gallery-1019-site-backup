const { createHash } = require('crypto');

function createStateReadService(dependencies) {
  const {
    allowedKeys,
    buildTransferSafeExhibitions,
    getStateMap,
    getStateMetaMap,
    sendJson
  } = dependencies;
  const defaultKeys = Array.from(allowedKeys);

  return async function handleStateRead(req, res) {
    const keys = sanitizeRequestedKeys(req.query.keys, allowedKeys, defaultKeys);
    const view = String(req.query.view || '').trim().toLowerCase();
    const rawMeta = await getStateMetaMap(keys);
    const meta = normalizeStateMeta(keys, rawMeta);
    const etag = buildStateEtag(keys, meta);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (requestHasMatchingEtag(req.headers?.['if-none-match'], etag)) {
      res.statusCode = 304;
      res.end();
      return;
    }

    const data = await getStateMap(keys);
    const transferSafe = buildTransferSafeStateData(data, { view, buildTransferSafeExhibitions });
    const responsePayload = { ok: true, data: transferSafe.data, meta };
    const responseBytes = Buffer.byteLength(JSON.stringify(responsePayload), 'utf8');
    res.setHeader('X-State-Response-Bytes', String(responseBytes));

    if (Array.isArray(transferSafe.data?.exhibitions)) {
      console.log('[api/state:get]', {
        keys,
        view: view || 'full',
        responseBytes,
        exhibitionCount: transferSafe.data.exhibitions.length,
        transferStats: transferSafe.stats || null
      });
    }

    sendJson(res, 200, responsePayload);
  };
}

function sanitizeRequestedKeys(raw, allowedKeys, defaultKeys) {
  if (!raw) return defaultKeys.slice();
  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => allowedKeys.has(item));
  return parsed.length > 0 ? parsed : defaultKeys.slice();
}

function buildTransferSafeStateData(data, options) {
  const view = String(options.view || '').trim().toLowerCase();
  if (!data || typeof data !== 'object' || !Array.isArray(data.exhibitions)) {
    return { data, stats: null };
  }

  const transferSafe = options.buildTransferSafeExhibitions(data.exhibitions);
  const nextData = { ...data, exhibitions: transferSafe.exhibitions };
  if (view === 'summary') nextData.exhibitions = buildExhibitionsSummary(nextData.exhibitions);
  return { data: nextData, stats: transferSafe.stats };
}

function buildExhibitionsSummary(exhibitions) {
  if (!Array.isArray(exhibitions)) return [];
  return exhibitions.map((exhibition) => {
    if (!exhibition || typeof exhibition !== 'object') return exhibition;
    return {
      id: exhibition.id,
      title: exhibition.title,
      startDate: exhibition.startDate,
      endDate: exhibition.endDate,
      type: exhibition.type,
      participants: Array.isArray(exhibition.participants) ? exhibition.participants : [],
      staff: exhibition.staff || { planners: [], artists: [], staffs: [] },
      active: Boolean(exhibition.active),
      createdAt: exhibition.createdAt || null,
      updatedAt: exhibition.updatedAt || null
    };
  });
}

function normalizeStateMeta(keys, rawMeta) {
  const normalized = {};
  keys.forEach((key) => {
    normalized[key] = { updatedAt: rawMeta?.[key]?.updatedAt || null };
  });
  return normalized;
}

function buildStateEtag(keys, meta) {
  const fingerprint = keys.map((key) => `${key}:${meta?.[key]?.updatedAt || 'null'}`).join('|');
  const digest = createHash('sha1').update(fingerprint).digest('hex');
  return `W/"state-${digest}"`;
}

function requestHasMatchingEtag(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader || !etag) return false;
  const normalized = String(ifNoneMatchHeader).split(',').map((entry) => entry.trim()).filter(Boolean);
  return normalized.includes('*') || normalized.includes(etag);
}

module.exports = { createStateReadService };