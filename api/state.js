const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');
const { createHash } = require('crypto');
const { getStateMap, getStateMetaMap, getStateMapWithMeta, setStateValue, deleteStateValue } = require('./_lib/state-store');
const { logStateWriteAttempt, recordAlert, maybeTriggerConflictSpikeAlert } = require('./_lib/audit-store');
const { buildTransferSafeExhibitions, migrateExhibitionImageReferences } = require('./_lib/exhibition-image-refs');

const ALLOWED_KEYS = new Set(['users', 'exhibitions']);
const HARD_DROP_MIN_PREVIOUS_TOTAL = 20;
const HARD_DROP_MIN_ABSOLUTE = 15;
const HARD_DROP_RATIO = 0.7;

function toEpochMs(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt) {
  if (!baseUpdatedAt || !serverUpdatedAt) return false;
  return toEpochMs(serverUpdatedAt) > toEpochMs(baseUpdatedAt);
}

function hasKnownServerVersion(updatedAt) {
  return Boolean(updatedAt && toEpochMs(updatedAt) > 0);
}

function getExhibitionTimestamp(exhibition) {
  if (!exhibition || typeof exhibition !== 'object') return 0;
  return Math.max(
    toEpochMs(exhibition.updatedAt),
    toEpochMs(exhibition.modifiedAt),
    toEpochMs(exhibition.lastModifiedAt),
    toEpochMs(exhibition.createdAt)
  );
}

function getInventoryCount(exhibition) {
  if (!exhibition || typeof exhibition !== 'object') return 0;
  const art = Array.isArray(exhibition.artWorks)
    ? exhibition.artWorks.length
    : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
  const goods = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;
  const soldArt = Array.isArray(exhibition.artSoldWorks)
    ? exhibition.artSoldWorks.length
    : (Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks.length : 0);
  const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods.length : 0;
  return art + goods + soldArt + soldGoods;
}

function hasPreviewFields(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(
    (typeof item.photoPreviewUrl === 'string' && item.photoPreviewUrl.trim())
    || (typeof item.photoUrl === 'string' && item.photoUrl.trim())
    ||
    (typeof item.photoPreviewDataUrl === 'string' && item.photoPreviewDataUrl.trim())
    || (typeof item.photoDataUrl === 'string' && item.photoDataUrl.trim())
  );
}

function getPreviewIdentity(item) {
  if (!item || typeof item !== 'object') return '';

  const id = Number(item.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;

  const workId = Number(item.workId);
  if (Number.isFinite(workId) && workId > 0) return `work:${workId}`;

  const manualNumber = (item.manualNumber || '').toString().trim().toLowerCase();
  const title = (item.title || '').toString().trim().toLowerCase();
  if (manualNumber || title) return `manual:${manualNumber}|title:${title}`;
  return '';
}

function mergeItemPreviewFields(baseItem, incomingItem) {
  if (!incomingItem || typeof incomingItem !== 'object') return incomingItem;
  if (!baseItem || typeof baseItem !== 'object') return incomingItem;

  const merged = { ...incomingItem };

  if ((!merged.photoPreviewUrl || !String(merged.photoPreviewUrl).trim())
    && typeof baseItem.photoPreviewUrl === 'string'
    && baseItem.photoPreviewUrl.trim()) {
    merged.photoPreviewUrl = baseItem.photoPreviewUrl;
  }

  if ((!merged.photoUrl || !String(merged.photoUrl).trim())
    && typeof baseItem.photoUrl === 'string'
    && baseItem.photoUrl.trim()) {
    merged.photoUrl = baseItem.photoUrl;
  }

  if ((!merged.photoPreviewDataUrl || !String(merged.photoPreviewDataUrl).trim())
    && typeof baseItem.photoPreviewDataUrl === 'string'
    && baseItem.photoPreviewDataUrl.trim()) {
    merged.photoPreviewDataUrl = baseItem.photoPreviewDataUrl;
  }

  if ((!merged.photoDataUrl || !String(merged.photoDataUrl).trim())
    && typeof baseItem.photoDataUrl === 'string'
    && baseItem.photoDataUrl.trim()) {
    merged.photoDataUrl = baseItem.photoDataUrl;
  }

  if (!hasPreviewFields(incomingItem) && hasPreviewFields(baseItem)) {
    if ((!merged.photoPreviewDataUrl || !merged.photoPreviewDataUrl.trim())
      && typeof baseItem.photoPreviewDataUrl === 'string') {
      merged.photoPreviewDataUrl = baseItem.photoPreviewDataUrl;
    }

    if ((!merged.photoDataUrl || !merged.photoDataUrl.trim())
      && typeof baseItem.photoDataUrl === 'string') {
      merged.photoDataUrl = baseItem.photoDataUrl;
    }
  }

  return merged;
}

function mergeListPreviewFields(baseList, incomingList) {
  if (!Array.isArray(incomingList)) return incomingList;
  if (!Array.isArray(baseList) || baseList.length === 0) return incomingList;

  const baseByIdentity = new Map();
  baseList.forEach((item) => {
    const key = getPreviewIdentity(item);
    if (!key) return;
    if (!baseByIdentity.has(key)) {
      baseByIdentity.set(key, item);
    }
  });

  return incomingList.map((item) => {
    const key = getPreviewIdentity(item);
    if (!key) return item;
    return mergeItemPreviewFields(baseByIdentity.get(key), item);
  });
}

function mergeExhibitionPreviewFields(baseExhibition, incomingExhibition) {
  if (!incomingExhibition || typeof incomingExhibition !== 'object') return incomingExhibition;
  if (!baseExhibition || typeof baseExhibition !== 'object') return incomingExhibition;

  const merged = { ...incomingExhibition };
  ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'].forEach((field) => {
    if (Array.isArray(incomingExhibition[field])) {
      merged[field] = mergeListPreviewFields(baseExhibition[field], incomingExhibition[field]);
    }
  });

  return merged;
}

function hasExplicitInventoryClearMarker(exhibition) {
  return Boolean(
    exhibition
    && typeof exhibition.inventoryExplicitlyClearedAt === 'string'
    && exhibition.inventoryExplicitlyClearedAt.trim()
  );
}

function detectLargeUnexpectedInventoryDrop(currentValue, incomingValue, options = {}) {
  if (!Array.isArray(currentValue) || !Array.isArray(incomingValue)) return null;

  const onlyTouchedIds = options.onlyTouchedIds instanceof Set ? options.onlyTouchedIds : null;
  const treatMissingAsZero = options.treatMissingAsZero !== false;

  const incomingById = new Map(
    incomingValue
      .filter((item) => item && typeof item === 'object')
      .map((item) => [Number(item.id), item])
  );

  for (const current of currentValue) {
    const id = Number(current?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (onlyTouchedIds && !onlyTouchedIds.has(id)) continue;

    const previousCount = getInventoryCount(current);
    if (previousCount < HARD_DROP_MIN_PREVIOUS_TOTAL) continue;

    const incoming = incomingById.get(id);
    if (!incoming && !treatMissingAsZero) continue;
    const nextCount = getInventoryCount(incoming);
    const dropped = previousCount - nextCount;

    if (dropped < HARD_DROP_MIN_ABSOLUTE) continue;
    if (dropped / previousCount < HARD_DROP_RATIO) continue;

    if (hasExplicitInventoryClearMarker(incoming)) {
      continue;
    }

    return {
      exhibitionId: id,
      previousCount,
      nextCount,
      dropped,
      ratio: dropped / previousCount
    };
  }

  return null;
}

function getClientIdFromRequest(req) {
  const fromHeader = typeof req.headers?.['x-cloud-client-id'] === 'string'
    ? req.headers['x-cloud-client-id'].trim()
    : '';
  return fromHeader || null;
}

function normalizeUserIdentityPart(value) {
  return String(value || '').trim().toLowerCase();
}

function buildUserIdentityKeys(user) {
  const keys = [];
  const id = Number(user?.id);
  if (Number.isFinite(id) && id > 0) {
    keys.push(`id:${id}`);
  }

  const username = normalizeUserIdentityPart(user?.username);
  if (username) keys.push(`username:${username}`);

  const email = normalizeUserIdentityPart(user?.email);
  if (email) keys.push(`email:${email}`);

  const name = normalizeUserIdentityPart(user?.name);
  if (name) keys.push(`name:${name}`);

  return keys;
}

function mergeUsersPreservingPasswords(currentUsers, incomingUsers) {
  if (!Array.isArray(incomingUsers)) return incomingUsers;
  const current = Array.isArray(currentUsers) ? currentUsers : [];

  const currentByIdentity = new Map();
  current.forEach((user) => {
    if (!user || typeof user !== 'object') return;
    buildUserIdentityKeys(user).forEach((key) => {
      if (!currentByIdentity.has(key)) {
        currentByIdentity.set(key, user);
      }
    });
  });

  return incomingUsers.map((user) => {
    if (!user || typeof user !== 'object') return user;

    const hasIncomingPassword = Boolean(String(user.password || '').trim());
    if (hasIncomingPassword) return user;

    const identities = buildUserIdentityKeys(user);
    const matched = identities
      .map((key) => currentByIdentity.get(key))
      .find((candidate) => candidate && typeof candidate === 'object');

    const preservedPassword = String(matched?.password || '').trim();
    if (!preservedPassword) return user;

    return {
      ...user,
      password: preservedPassword
    };
  });
}

function getRequestId(req) {
  const fromHeader = typeof req.headers?.['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : '';
  if (fromHeader) return fromHeader;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function choosePreferredExhibition(currentExhibition, incomingExhibition) {
  const currentTs = getExhibitionTimestamp(currentExhibition);
  const incomingTs = getExhibitionTimestamp(incomingExhibition);

  if (incomingTs > currentTs) return mergeExhibitionPreviewFields(currentExhibition, incomingExhibition);
  if (currentTs > incomingTs) return mergeExhibitionPreviewFields(incomingExhibition, currentExhibition);

  const currentCount = getInventoryCount(currentExhibition);
  const incomingCount = getInventoryCount(incomingExhibition);
  if (incomingCount > currentCount) return mergeExhibitionPreviewFields(currentExhibition, incomingExhibition);
  return mergeExhibitionPreviewFields(incomingExhibition, currentExhibition);
}

function mergeExhibitionsState(currentValue, incomingValue) {
  if (!Array.isArray(currentValue)) return incomingValue;
  if (!Array.isArray(incomingValue)) return currentValue;

  const mergedById = new Map();
  const appendWithoutId = [];

  currentValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    if (!mergedById.has(id)) {
      mergedById.set(id, item);
    }
  });

  incomingValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    const current = mergedById.get(id);
    if (!current) {
      mergedById.set(id, item);
      return;
    }

    mergedById.set(id, choosePreferredExhibition(current, item));
  });

  const merged = Array.from(mergedById.values());
  if (appendWithoutId.length > 0) {
    merged.push(...appendWithoutId);
  }
  return merged;
}

function mergeExhibitionsStatePreferServerOnConflict(currentValue, incomingValue) {
  if (!Array.isArray(currentValue)) return incomingValue;
  if (!Array.isArray(incomingValue)) return currentValue;

  const mergedById = new Map();
  const appendWithoutId = [];

  currentValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    if (!mergedById.has(id)) {
      mergedById.set(id, item);
    }
  });

  incomingValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    const current = mergedById.get(id);
    if (!current) {
      mergedById.set(id, item);
      return;
    }

    // On stale conflicts, keep server exhibition state, but still heal missing preview fields.
    mergedById.set(id, mergeExhibitionPreviewFields(item, current));
  });

  const merged = Array.from(mergedById.values());
  if (appendWithoutId.length > 0) {
    merged.push(...appendWithoutId);
  }
  return merged;
}

function sanitizeRequestedKeys(raw) {
  if (!raw) return ['users', 'exhibitions'];
  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => ALLOWED_KEYS.has(item));

  return parsed.length > 0 ? parsed : ['users', 'exhibitions'];
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

function buildTransferSafeStateData(data, options = {}) {
  const view = String(options.view || '').trim().toLowerCase();
  if (!data || typeof data !== 'object') {
    return {
      data,
      stats: null
    };
  }

  if (!Array.isArray(data.exhibitions)) {
    return {
      data,
      stats: null
    };
  }

  const transferSafe = buildTransferSafeExhibitions(data.exhibitions);
  const nextData = { ...data, exhibitions: transferSafe.exhibitions };
  if (view === 'summary') {
    nextData.exhibitions = buildExhibitionsSummary(nextData.exhibitions);
  }

  return {
    data: nextData,
    stats: transferSafe.stats
  };
}

function normalizeStateMeta(keys, rawMeta) {
  const normalized = {};
  keys.forEach((key) => {
    normalized[key] = {
      updatedAt: rawMeta?.[key]?.updatedAt || null
    };
  });
  return normalized;
}

function buildStateEtag(keys, meta) {
  const fingerprint = keys
    .map((key) => `${key}:${meta?.[key]?.updatedAt || 'null'}`)
    .join('|');
  const digest = createHash('sha1').update(fingerprint).digest('hex');
  return `W/"state-${digest}"`;
}

function requestHasMatchingEtag(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader || !etag) return false;
  const normalized = String(ifNoneMatchHeader)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.includes('*') || normalized.includes(etag);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const keys = sanitizeRequestedKeys(req.query.keys);
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
      const transferSafe = buildTransferSafeStateData(data, { view });
      const responsePayload = {
        ok: true,
        data: transferSafe.data,
        meta
      };

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
      return;
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt.trim() : '';
      const requestId = getRequestId(req);
      const clientId = getClientIdFromRequest(req);

      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions.' });
        return;
      }

      const { meta: currentMeta } = await getStateMapWithMeta([key]);
      const serverUpdatedAt = currentMeta?.[key]?.updatedAt || '';

      if (key === 'users' && hasKnownServerVersion(serverUpdatedAt) && !baseUpdatedAt) {
        await logStateWriteAttempt({
          requestId,
          stateKey: key,
          action: 'PUT',
          decision: 'conflict_rejected',
          reason: 'missing-client-base-version',
          baseUpdatedAt,
          serverUpdatedAt,
          clientId
        });
        await maybeTriggerConflictSpikeAlert();

        sendJson(res, 409, {
          ok: false,
          error: 'State conflict: missing client base version for users data.',
          conflict: {
            key,
            serverUpdatedAt,
            baseUpdatedAt: null
          }
        });
        return;
      }

      if (key === 'users' && isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt)) {
        await logStateWriteAttempt({
          requestId,
          stateKey: key,
          action: 'PUT',
          decision: 'conflict_rejected',
          reason: 'server-newer-than-client-base',
          baseUpdatedAt,
          serverUpdatedAt,
          clientId
        });
        await maybeTriggerConflictSpikeAlert();

        sendJson(res, 409, {
          ok: false,
          error: 'State conflict: server has newer users data.',
          conflict: {
            key,
            serverUpdatedAt,
            baseUpdatedAt: baseUpdatedAt || null
          }
        });
        return;
      }

      let valueToPersist = body.value;
      let mergedOnConflict = false;
      let imageMigrationStats = null;

      if (key === 'users' && Array.isArray(body.value)) {
        const existingMap = await getStateMap(['users']);
        const currentUsers = Array.isArray(existingMap.users) ? existingMap.users : [];
        valueToPersist = mergeUsersPreservingPasswords(currentUsers, body.value);
      }

      if (key === 'exhibitions') {
        const existingMap = await getStateMap(['exhibitions']);
        const currentExhibitions = Array.isArray(existingMap.exhibitions) ? existingMap.exhibitions : [];
        const syncMode = String(body.syncMode || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full';
        const incomingExhibitions = Array.isArray(body.value) ? body.value : [];
        const staleConflict = isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt);

        if (syncMode === 'delta' && incomingExhibitions.length === 0) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'accepted',
            reason: 'delta-noop',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: 0,
            serverCount: currentExhibitions.length,
            mergedCount: currentExhibitions.length,
            clientId,
            details: { syncMode }
          });

          sendJson(res, 200, {
            ok: true,
            meta: {
              key,
              updatedAt: serverUpdatedAt || null
            },
            mergedOnConflict: false
          });
          return;
        }

        const touchedIds = syncMode === 'delta'
          ? new Set(
            incomingExhibitions
              .map((item) => Number(item?.id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
          : null;

        const blockedDrop = detectLargeUnexpectedInventoryDrop(currentExhibitions, incomingExhibitions, {
          onlyTouchedIds: touchedIds,
          treatMissingAsZero: syncMode !== 'delta'
        });
        if (blockedDrop) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'drop_blocked',
            reason: 'large-unexpected-inventory-drop-without-marker',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: incomingExhibitions.length,
            serverCount: currentExhibitions.length,
            mergedCount: currentExhibitions.length,
            clientId,
            details: {
              ...blockedDrop,
              syncMode
            }
          });

          await recordAlert({
            alertType: 'large-drop-blocked',
            severity: 'critical',
            message: `Blocked large inventory drop for exhibition ${blockedDrop.exhibitionId}.`,
            details: blockedDrop
          });

          sendJson(res, 422, {
            ok: false,
            error: 'Blocked suspicious large inventory drop. Add explicit clear marker to allow this reset.',
            blocked: blockedDrop
          });
          return;
        }

        mergedOnConflict = staleConflict;
        valueToPersist = staleConflict
            ? mergeExhibitionsStatePreferServerOnConflict(currentExhibitions, incomingExhibitions)
            : mergeExhibitionsState(currentExhibitions, incomingExhibitions);

        const configuredMaxUploads = Number(process.env.EXHIBITION_IMAGE_MIGRATION_MAX_UPLOADS);
        const migration = await migrateExhibitionImageReferences(valueToPersist, {
          maxUploads: Number.isFinite(configuredMaxUploads) ? configuredMaxUploads : 0
        });
        valueToPersist = migration.exhibitions;
        imageMigrationStats = migration.stats;
      }

      const updatedAt = await setStateValue(key, valueToPersist);

      await logStateWriteAttempt({
        requestId,
        stateKey: key,
        action: 'PUT',
        decision: mergedOnConflict ? 'merged_accept' : 'accepted',
        reason: mergedOnConflict ? 'stale-client-merged-server-side' : 'normal-write',
        baseUpdatedAt,
        serverUpdatedAt,
        incomingCount: Array.isArray(body.value) ? body.value.length : null,
        serverCount: key === 'exhibitions' && Array.isArray(valueToPersist) ? valueToPersist.length : null,
        mergedCount: Array.isArray(valueToPersist) ? valueToPersist.length : null,
        clientId,
        details: key === 'exhibitions'
          ? {
            syncMode: String(body.syncMode || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full',
            imageMigration: imageMigrationStats
          }
          : undefined
      });

      sendJson(res, 200, {
        ok: true,
        meta: {
          key,
          updatedAt
        },
        mergedOnConflict,
        imageMigration: imageMigrationStats
      });
      return;
    }

    if (req.method === 'DELETE') {
      const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
      const requestId = getRequestId(req);
      const clientId = getClientIdFromRequest(req);
      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions.' });
        return;
      }

      await deleteStateValue(key);
      await logStateWriteAttempt({
        requestId,
        stateKey: key,
        action: 'DELETE',
        decision: 'accepted',
        reason: 'explicit-delete',
        clientId
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
  }
};
