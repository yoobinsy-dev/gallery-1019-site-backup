const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');
const { getStateMap, setStateValue } = require('./_lib/state-store');
const { migrateExhibitionImageReferences } = require('./_lib/exhibition-image-refs');

function isAuthorized(req) {
  const expectedSecret = process.env.EXHIBITION_IMAGE_MIGRATION_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const provided = (req.query && req.query.secret) || '';
  if (provided && provided === expectedSecret) return true;

  const authHeader = typeof req.headers?.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  const bearerPrefix = 'bearer ';
  const bearerSecret = authHeader.toLowerCase().startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length).trim()
    : '';

  return bearerSecret === expectedSecret;
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const dryRun = body && body.dryRun === true;
    const maxUploads = Math.max(1, Math.min(1000, Number(body?.maxUploads) || 200));

    const map = await getStateMap(['exhibitions']);
    const currentExhibitions = Array.isArray(map.exhibitions) ? map.exhibitions : [];
    const sourceCopy = cloneJson(currentExhibitions, []);

    const migration = await migrateExhibitionImageReferences(sourceCopy, {
      maxUploads
    });

    const migratedExhibitions = migration.exhibitions;
    const changed = JSON.stringify(migratedExhibitions) !== JSON.stringify(currentExhibitions);

    let updatedAt = null;
    if (!dryRun && changed) {
      updatedAt = await setStateValue('exhibitions', migratedExhibitions);
    }

    sendJson(res, 200, {
      ok: true,
      dryRun,
      changed,
      updatedAt,
      exhibitionCount: migratedExhibitions.length,
      migration: migration.stats
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Image migration failed.'
    });
  }
};
