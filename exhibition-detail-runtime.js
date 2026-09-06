/* sync/cloud-sync-protocol.js */
(function initializeCloudSyncProtocol(root) {
  'use strict';

  const SYNCED_KEYS = Object.freeze([
    'users',
    'exhibitions',
    'pottery-students-v1',
    'pottery-personal-work-v1',
    'studio-calendar-state-v1',
    'pottery-material-orders-v1',
    'pottery-accounting-v1'
  ]);

  function getPageName(pathname) {
    const normalizedPath = String(pathname || '').trim();
    if (!normalizedPath) return '';
    const segments = normalizedPath.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1].toLowerCase() : '';
  }

  function resolveActiveSyncKeys(pathname) {
    const page = getPageName(pathname);
    if (!page) return SYNCED_KEYS.slice();

    if (page === 'login.html' || page === 'users.html') {
      return ['users'];
    }
    if (page === 'pottery-master-calendar.html' || page === 'pottery-personal-work.html') {
      return ['users', 'pottery-personal-work-v1', 'studio-calendar-state-v1'];
    }
    if (page === 'pottery-material-orders.html') {
      return ['users', 'pottery-material-orders-v1'];
    }
    if (page === 'pottery-students.html') {
      return ['users', 'pottery-students-v1', 'studio-calendar-state-v1'];
    }
    if (page === 'pottery-accounting.html') {
      return SYNCED_KEYS.slice();
    }
    if (page === 'gallery-lounge.html' || page === 'inventory.html') {
      return [];
    }
    if (page === 'exhibitions.html') {
      return ['exhibitions'];
    }
    if (page === 'exhibition-detail.html') {
      return ['users', 'exhibitions'];
    }
    return SYNCED_KEYS.slice();
  }

  const api = Object.freeze({
    SYNCED_KEYS,
    resolveActiveSyncKeys
  });
  root.CloudSyncProtocol = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* sync/cloud-sync-model.js */
(function initializeCloudSyncModel(root) {
  'use strict';

  const EXHIBITION_IMAGE_LIST_FIELDS = Object.freeze([
    'artWorks',
    'goods',
    'artSoldWorks',
    'soldGoods',
    'works',
    'soldWorks'
  ]);

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  }

  function buildStateSignature(value) {
    if (typeof value === 'string') return `str:${value}`;
    return `json:${safeStringify(value)}`;
  }

  function isSameValue(first, second) {
    return safeStringify(first) === safeStringify(second);
  }

  function normalizeHttpUrl(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://') ? normalized : '';
  }

  function toTransferSafeImageItem(item) {
    if (!item || typeof item !== 'object') return item;

    const next = { ...item };
    const fullUrl = normalizeHttpUrl(next.photoUrl) || normalizeHttpUrl(next.photoDataUrl);
    const previewUrl = normalizeHttpUrl(next.photoPreviewUrl) || normalizeHttpUrl(next.photoPreviewDataUrl);

    if (fullUrl && !normalizeHttpUrl(next.photoUrl)) next.photoUrl = fullUrl;
    if (previewUrl && !normalizeHttpUrl(next.photoPreviewUrl)) next.photoPreviewUrl = previewUrl;
    return next;
  }

  function buildTransferSafeExhibitionsPayload(exhibitions) {
    if (!Array.isArray(exhibitions)) return exhibitions;

    let cloned;
    try {
      cloned = JSON.parse(JSON.stringify(exhibitions));
    } catch (error) {
      return exhibitions;
    }

    cloned.forEach((exhibition) => {
      if (!exhibition || typeof exhibition !== 'object') return;
      EXHIBITION_IMAGE_LIST_FIELDS.forEach((field) => {
        if (!Array.isArray(exhibition[field])) return;
        exhibition[field] = exhibition[field].map((item) => toTransferSafeImageItem(item));
      });
    });
    return cloned;
  }

  function getExhibitionId(exhibition) {
    const id = Number(exhibition?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function buildExhibitionsDelta(previousExhibitions, nextExhibitions) {
    if (!Array.isArray(previousExhibitions) || !Array.isArray(nextExhibitions)) {
      return {
        changed: Array.isArray(nextExhibitions) ? nextExhibitions : [],
        removedIds: []
      };
    }

    const previousById = new Map();
    previousExhibitions.forEach((item) => {
      const id = getExhibitionId(item);
      if (id !== null) previousById.set(id, item);
    });

    const nextById = new Map();
    const changed = [];
    nextExhibitions.forEach((item) => {
      const id = getExhibitionId(item);
      if (id === null) {
        changed.push(item);
        return;
      }
      nextById.set(id, item);
      const previous = previousById.get(id);
      if (!previous || !isSameValue(previous, item)) changed.push(item);
    });

    const removedIds = [];
    previousById.forEach((_, id) => {
      if (!nextById.has(id)) removedIds.push(id);
    });
    return { changed, removedIds };
  }

  function normalizeUserIdentityPart(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getUserIdentity(user) {
    const id = Number(user?.id);
    if (Number.isFinite(id) && id > 0) return `id:${id}`;

    const username = normalizeUserIdentityPart(user?.username);
    if (username) return `username:${username}`;
    const email = normalizeUserIdentityPart(user?.email);
    if (email) return `email:${email}`;
    const name = normalizeUserIdentityPart(user?.name);
    return name ? `name:${name}` : '';
  }

  function buildUsersDelta(previousUsers, nextUsers) {
    if (!Array.isArray(previousUsers) || !Array.isArray(nextUsers)) {
      return {
        changed: Array.isArray(nextUsers) ? nextUsers : [],
        removedIds: []
      };
    }

    const previousByIdentity = new Map();
    previousUsers.forEach((user) => {
      if (!user || typeof user !== 'object') return;
      const identity = getUserIdentity(user);
      if (identity && !previousByIdentity.has(identity)) previousByIdentity.set(identity, user);
    });

    const nextByIdentity = new Map();
    const changed = [];
    nextUsers.forEach((user) => {
      if (!user || typeof user !== 'object') {
        changed.push(user);
        return;
      }
      const identity = getUserIdentity(user);
      if (!identity) {
        changed.push(user);
        return;
      }
      nextByIdentity.set(identity, user);
      const previous = previousByIdentity.get(identity);
      if (!previous || !isSameValue(previous, user)) changed.push(user);
    });

    const removedIds = [];
    previousByIdentity.forEach((user, identity) => {
      if (nextByIdentity.has(identity)) return;
      const id = Number(user?.id);
      if (Number.isFinite(id) && id > 0) removedIds.push(id);
    });
    return { changed, removedIds: Array.from(new Set(removedIds)) };
  }

  const api = Object.freeze({
    buildExhibitionsDelta,
    buildStateSignature,
    buildTransferSafeExhibitionsPayload,
    buildUsersDelta,
    isSameValue,
    normalizeHttpUrl
  });
  root.CloudSyncModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* sync/cloud-sync-reconciliation.js */
(function initializeCloudSyncReconciliation(root) {
  'use strict';

  const cloudSyncModel = root.CloudSyncModel
    || (typeof require === 'function' ? require('./cloud-sync-model') : null);
  if (!cloudSyncModel) {
    throw new Error('CloudSyncModel must load before cloud-sync-reconciliation.js.');
  }

  const REMOTE_DROP_MIN_PREVIOUS_TOTAL = 20;
  const REMOTE_DROP_MIN_ABSOLUTE = 15;
  const REMOTE_DROP_RATIO = 0.7;
  const PREVIEW_DATA_URL_SAFE_LENGTH = 280000;
  const EXHIBITION_IMAGE_LIST_FIELDS = Object.freeze([
    'artWorks',
    'goods',
    'artSoldWorks',
    'soldGoods',
    'works',
    'soldWorks'
  ]);
  const { normalizeHttpUrl } = cloudSyncModel;

  function getEpochMs(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getMaterialOrderIdentity(order, fallbackPrefix, index) {
    const id = String(order?.id || '').trim();
    if (id) return `id:${id}`;

    const createdAt = String(order?.createdAt || '').trim();
    const orderDate = String(order?.orderDate || '').trim();
    if (createdAt || orderDate) {
      return `date:${orderDate}|created:${createdAt}|idx:${index}`;
    }

    return `${fallbackPrefix}:${index}`;
  }

  function getMaterialOrderEpochMs(order) {
    if (!order || typeof order !== 'object') return 0;

    const candidates = [order.updatedAt, order.modifiedAt, order.createdAt, order.orderDate];
    for (let index = 0; index < candidates.length; index += 1) {
      const epochMs = getEpochMs(candidates[index]);
      if (epochMs > 0) return epochMs;
    }
    return 0;
  }

  function mergeMaterialOrderItems(preferredItems, fallbackItems) {
    const result = [];
    const seen = new Set();
    const pushIfNew = (item, prefix, index) => {
      if (!item || typeof item !== 'object') return;
      const identity = String(item.id || '').trim() || `${prefix}:${index}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      result.push(item);
    };

    if (Array.isArray(preferredItems)) {
      preferredItems.forEach((item, index) => pushIfNew(item, 'pref', index));
    }
    if (Array.isArray(fallbackItems)) {
      fallbackItems.forEach((item, index) => pushIfNew(item, 'fallback', index));
    }
    return result;
  }

  function mergeMaterialOrderPair(localOrder, remoteOrder) {
    if (!localOrder || typeof localOrder !== 'object') return remoteOrder;
    if (!remoteOrder || typeof remoteOrder !== 'object') return localOrder;

    const localMs = getMaterialOrderEpochMs(localOrder);
    const remoteMs = getMaterialOrderEpochMs(remoteOrder);
    const preferred = localMs >= remoteMs ? localOrder : remoteOrder;
    const fallback = preferred === localOrder ? remoteOrder : localOrder;
    const merged = { ...fallback, ...preferred };
    merged.items = mergeMaterialOrderItems(preferred.items, fallback.items);

    if (typeof preferred.orderWideDiscount === 'boolean') {
      merged.orderWideDiscount = preferred.orderWideDiscount;
    } else if (typeof fallback.orderWideDiscount === 'boolean') {
      merged.orderWideDiscount = fallback.orderWideDiscount;
    }

    if (typeof preferred.orderWideShipping === 'boolean') {
      merged.orderWideShipping = preferred.orderWideShipping;
    } else if (typeof fallback.orderWideShipping === 'boolean') {
      merged.orderWideShipping = fallback.orderWideShipping;
    }
    return merged;
  }

  function mergeMaterialOrdersForSync(localOrders, remoteOrders) {
    if (!Array.isArray(localOrders) || !Array.isArray(remoteOrders)) {
      return Array.isArray(remoteOrders) ? remoteOrders : (Array.isArray(localOrders) ? localOrders : []);
    }

    const merged = [];
    const localByIdentity = new Map();
    const consumedLocal = new Set();
    localOrders.forEach((order, index) => {
      if (!order || typeof order !== 'object') return;
      const identity = getMaterialOrderIdentity(order, 'local', index);
      if (!localByIdentity.has(identity)) localByIdentity.set(identity, order);
    });

    remoteOrders.forEach((remoteOrder, index) => {
      if (!remoteOrder || typeof remoteOrder !== 'object') return;
      const identity = getMaterialOrderIdentity(remoteOrder, 'remote', index);
      const localOrder = localByIdentity.get(identity);
      if (localOrder) {
        merged.push(mergeMaterialOrderPair(localOrder, remoteOrder));
        consumedLocal.add(identity);
      } else {
        merged.push(remoteOrder);
      }
    });

    localByIdentity.forEach((localOrder, identity) => {
      if (!consumedLocal.has(identity)) merged.push(localOrder);
    });
    return merged;
  }

  function hasPhotoPreview(item) {
    if (!item || typeof item !== 'object') return false;
    return Boolean(
      normalizeHttpUrl(item.photoPreviewUrl)
      || normalizeHttpUrl(item.photoUrl)
      || (typeof item.photoPreviewDataUrl === 'string' && item.photoPreviewDataUrl.length > 0)
      || (typeof item.photoDataUrl === 'string' && item.photoDataUrl.length > 0)
    );
  }

  function hasAnyPhotoPreviewInExhibitions(exhibitions) {
    if (!Array.isArray(exhibitions)) return false;
    return exhibitions.some((exhibition) => exhibition
      && typeof exhibition === 'object'
      && EXHIBITION_IMAGE_LIST_FIELDS.some((field) => Array.isArray(exhibition[field])
        && exhibition[field].some(hasPhotoPreview)));
  }

  function getPreviewIdentity(item) {
    if (!item || typeof item !== 'object') return '';
    const id = Number(item.id);
    if (Number.isFinite(id) && id > 0) return `id:${id}`;
    const workId = Number(item.workId);
    if (Number.isFinite(workId) && workId > 0) return `work:${workId}`;
    const manualNumber = String(item.manualNumber || '').trim().toLowerCase();
    const title = String(item.title || '').trim().toLowerCase();
    return manualNumber || title ? `manual:${manualNumber}|title:${title}` : '';
  }

  function mergeItemPreservingPreview(localItem, remoteItem) {
    if (!remoteItem || typeof remoteItem !== 'object') return remoteItem;
    if (hasPhotoPreview(remoteItem) || !hasPhotoPreview(localItem)) return remoteItem;

    const merged = { ...remoteItem };
    if (!normalizeHttpUrl(merged.photoPreviewUrl) && normalizeHttpUrl(localItem?.photoPreviewUrl)) {
      merged.photoPreviewUrl = localItem.photoPreviewUrl;
    }
    if (!normalizeHttpUrl(merged.photoUrl) && normalizeHttpUrl(localItem?.photoUrl)) {
      merged.photoUrl = localItem.photoUrl;
    }
    if ((!merged.photoPreviewDataUrl || merged.photoPreviewDataUrl.length === 0)
      && typeof localItem.photoPreviewDataUrl === 'string'
      && localItem.photoPreviewDataUrl.length > 0) {
      merged.photoPreviewDataUrl = localItem.photoPreviewDataUrl;
    }
    if ((!merged.photoDataUrl || merged.photoDataUrl.length === 0)
      && typeof localItem.photoDataUrl === 'string'
      && localItem.photoDataUrl.length > 0
      && localItem.photoDataUrl.length <= PREVIEW_DATA_URL_SAFE_LENGTH) {
      merged.photoDataUrl = localItem.photoDataUrl;
    }
    return merged;
  }

  function mergeListPreservingPreview(localList, remoteList) {
    if (!Array.isArray(remoteList)) return remoteList;
    if (!Array.isArray(localList) || localList.length === 0) return remoteList;

    const localByIdentity = new Map();
    localList.forEach((item) => {
      const identity = getPreviewIdentity(item);
      if (identity && hasPhotoPreview(item) && !localByIdentity.has(identity)) {
        localByIdentity.set(identity, item);
      }
    });
    return remoteList.map((item) => {
      const identity = getPreviewIdentity(item);
      return identity ? mergeItemPreservingPreview(localByIdentity.get(identity), item) : item;
    });
  }

  function mergeExhibitionsPreservingPreview(localExhibitions, remoteExhibitions) {
    if (!Array.isArray(remoteExhibitions)) return remoteExhibitions;
    if (!Array.isArray(localExhibitions) || localExhibitions.length === 0) return remoteExhibitions;

    const localById = new Map(localExhibitions
      .filter((exhibition) => exhibition && typeof exhibition === 'object')
      .map((exhibition) => [Number(exhibition.id), exhibition]));
    return remoteExhibitions.map((remoteExhibition) => {
      const id = Number(remoteExhibition?.id);
      if (!Number.isFinite(id) || id <= 0) return remoteExhibition;
      const localExhibition = localById.get(id);
      if (!localExhibition || !remoteExhibition || typeof remoteExhibition !== 'object') return remoteExhibition;
      const merged = { ...remoteExhibition };
      EXHIBITION_IMAGE_LIST_FIELDS.forEach((field) => {
        if (Array.isArray(remoteExhibition[field])) {
          merged[field] = mergeListPreservingPreview(localExhibition[field], remoteExhibition[field]);
        }
      });
      return merged;
    });
  }

  function countInventoryRowsInExhibitions(exhibitions) {
    if (!Array.isArray(exhibitions)) return 0;
    return exhibitions.reduce((sum, exhibition) => {
      if (!exhibition || typeof exhibition !== 'object') return sum;
      const works = Array.isArray(exhibition.artWorks)
        ? exhibition.artWorks.length
        : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
      const goods = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;
      const soldWorks = Array.isArray(exhibition.artSoldWorks)
        ? exhibition.artSoldWorks.length
        : (Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks.length : 0);
      const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods.length : 0;
      return sum + works + goods + soldWorks + soldGoods;
    }, 0);
  }

  function getInventoryListCount(exhibition) {
    if (!exhibition || typeof exhibition !== 'object') return 0;
    const artCount = Array.isArray(exhibition.artWorks)
      ? exhibition.artWorks.length
      : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
    return artCount + (Array.isArray(exhibition.goods) ? exhibition.goods.length : 0);
  }

  function isSuspiciousRemoteExhibitionsDrop(localValue, remoteValue) {
    if (!Array.isArray(localValue) || !Array.isArray(remoteValue)) return false;
    const remoteById = new Map(remoteValue
      .filter((item) => item && typeof item === 'object')
      .map((item) => [Number(item.id), item]));

    return localValue.some((localExhibition) => {
      if (!localExhibition || typeof localExhibition !== 'object') return false;
      const localId = Number(localExhibition.id);
      if (!Number.isFinite(localId) || localId <= 0) return false;
      const localCount = getInventoryListCount(localExhibition);
      if (localCount < REMOTE_DROP_MIN_PREVIOUS_TOTAL) return false;
      const remoteExhibition = remoteById.get(localId);
      const remoteCount = getInventoryListCount(remoteExhibition);
      const dropped = localCount - remoteCount;
      if (dropped < REMOTE_DROP_MIN_ABSOLUTE || dropped / localCount < REMOTE_DROP_RATIO) return false;
      if (remoteExhibition
        && typeof remoteExhibition.inventoryExplicitlyClearedAt === 'string'
        && remoteExhibition.inventoryExplicitlyClearedAt.trim()) return false;
      return remoteCount <= Math.floor(localCount * 0.3);
    });
  }

  function shouldPreferRemoteExhibitions(localValue, remoteValue) {
    if (!Array.isArray(localValue) || !Array.isArray(remoteValue)) return false;
    const localCount = countInventoryRowsInExhibitions(localValue);
    const remoteCount = countInventoryRowsInExhibitions(remoteValue);
    if (remoteCount <= localCount) return false;
    return localCount === 0 || (remoteCount - localCount) >= 10;
  }

  const api = Object.freeze({
    hasAnyPhotoPreviewInExhibitions,
    isSuspiciousRemoteExhibitionsDrop,
    mergeExhibitionsPreservingPreview,
    mergeMaterialOrdersForSync,
    shouldPreferRemoteExhibitions
  });
  root.CloudSyncReconciliation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* cloud-sync.js */
(function () {
  const cloudSyncProtocol = globalThis.CloudSyncProtocol;
  if (!cloudSyncProtocol) {
    throw new Error('CloudSyncProtocol must load before cloud-sync.js.');
  }
  const cloudSyncModel = globalThis.CloudSyncModel;
  if (!cloudSyncModel) {
    throw new Error('CloudSyncModel must load before cloud-sync.js.');
  }
  const cloudSyncReconciliation = globalThis.CloudSyncReconciliation;
  if (!cloudSyncReconciliation) {
    throw new Error('CloudSyncReconciliation must load before cloud-sync.js.');
  }

  const SYNCED_KEYS = new Set(cloudSyncProtocol.SYNCED_KEYS);
  const {
    buildExhibitionsDelta,
    buildStateSignature,
    buildTransferSafeExhibitionsPayload,
    buildUsersDelta,
    isSameValue
  } = cloudSyncModel;
  const {
    hasAnyPhotoPreviewInExhibitions,
    isSuspiciousRemoteExhibitionsDrop,
    mergeExhibitionsPreservingPreview,
    mergeMaterialOrdersForSync,
    shouldPreferRemoteExhibitions
  } = cloudSyncReconciliation;
  const PUSH_DEBOUNCE_MS = 1500;
  const META_KEY = '__sync_updated_at__';
  const SESSION_META_KEY = '__sync_updated_at_session__';
  const REMOTE_META_KEY = '__sync_remote_updated_at__';
  const SESSION_REMOTE_META_KEY = '__sync_remote_updated_at_session__';
  const CLIENT_ID_KEY = '__cloud_sync_client_id__';
  const STATE_PULL_ETAG_KEY = '__cloud_sync_state_pull_etags__';
  const READY_EVENT = 'cloud-sync:ready';
  const STATE_APPLIED_EVENT = 'cloud-sync:state-applied';

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const pendingTimers = new Map();
  const lastSyncedStateSignatures = new Map();

  const pathname = typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : '';
  const activeSyncKeys = cloudSyncProtocol.resolveActiveSyncKeys(pathname);
  const activeSyncKeySet = new Set(activeSyncKeys);

  let applyingRemoteState = false;
  let resolveCloudSyncReady = null;

  const initialHadRemoteData = {};
  SYNCED_KEYS.forEach((key) => {
    initialHadRemoteData[key] = false;
  });

  const cloudSyncStatus = {
    ready: false,
    activeKeys: activeSyncKeys.slice(),
    remoteReachable: false,
    hadRemoteData: initialHadRemoteData,
    appliedRemoteKeys: []
  };

  const cloudSyncReady = new Promise((resolve) => {
    resolveCloudSyncReady = resolve;
  });

  if (typeof window !== 'undefined') {
    window.cloudSyncReady = cloudSyncReady;
    window.cloudSyncStatus = cloudSyncStatus;
  }

  function finalizeCloudSyncReady() {
    if (cloudSyncStatus.ready) return;

    cloudSyncStatus.ready = true;
    if (typeof resolveCloudSyncReady === 'function') {
      resolveCloudSyncReady(cloudSyncStatus);
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(READY_EVENT, {
        detail: cloudSyncStatus
      }));
    }
  }

  function isKeyEnabled(key) {
    return activeSyncKeySet.has(String(key || '').trim());
  }

  function getRequestedSyncKeys() {
    return activeSyncKeys.slice();
  }

  function queuePushWithBaseline(key, nextValue, baselineValue) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;

    if (normalizedKey === 'users' && Array.isArray(nextValue) && Array.isArray(baselineValue)) {
      const stateSignature = buildStateSignature(nextValue);
      const delta = buildUsersDelta(baselineValue, nextValue);

      if (delta.changed.length === 0 && delta.removedIds.length === 0) {
        return;
      }

      schedulePush(normalizedKey, delta.changed, {
        stateSignature,
        syncMode: 'delta',
        removedIds: delta.removedIds
      });
      return;
    }

    if (normalizedKey === 'exhibitions' && Array.isArray(nextValue) && Array.isArray(baselineValue)) {
      const transferSafeNext = buildTransferSafeExhibitionsPayload(nextValue);
      const transferSafeBaseline = buildTransferSafeExhibitionsPayload(baselineValue);
      const stateSignature = buildStateSignature(transferSafeNext);
      const delta = buildExhibitionsDelta(transferSafeBaseline, transferSafeNext);
      if (delta.removedIds.length > 0) {
        // Deletions are less frequent and safer to transmit as full payload.
        schedulePush(normalizedKey, transferSafeNext, { stateSignature, syncMode: 'full' });
        return;
      }

      if (delta.changed.length === 0) {
        return;
      }

      if (delta.changed.length < nextValue.length) {
        schedulePush(normalizedKey, delta.changed, { stateSignature, syncMode: 'delta' });
        return;
      }

      schedulePush(normalizedKey, transferSafeNext, { stateSignature, syncMode: 'full' });
      return;
    }

    const stateSignature = buildStateSignature(nextValue);
    schedulePush(normalizedKey, nextValue, { stateSignature, syncMode: 'full' });
  }

  function getSyncMeta() {
    const mergeMeta = (primary, secondary) => {
      const merged = { ...(secondary || {}), ...(primary || {}) };
      Object.keys(secondary || {}).forEach((key) => {
        const primaryTime = getEpochMs(primary?.[key]);
        const secondaryTime = getEpochMs(secondary[key]);
        if (secondaryTime > primaryTime) {
          merged[key] = secondary[key];
        }
      });
      return merged;
    };

    try {
      const raw = localStorage.getItem(META_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const localMeta = parsed && typeof parsed === 'object' ? parsed : {};

      if (typeof sessionStorage === 'undefined') {
        return localMeta;
      }

      const sessionRaw = sessionStorage.getItem(SESSION_META_KEY);
      const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
      const sessionMeta = sessionParsed && typeof sessionParsed === 'object' ? sessionParsed : {};
      return mergeMeta(localMeta, sessionMeta);
    } catch (error) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          const sessionRaw = sessionStorage.getItem(SESSION_META_KEY);
          const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
          return sessionParsed && typeof sessionParsed === 'object' ? sessionParsed : {};
        }
      } catch (sessionError) {
        // Ignore fallback parsing errors.
      }

      return {};
    }
  }

  function setSyncMeta(meta) {
    try {
      originalSetItem.call(localStorage, META_KEY, JSON.stringify(meta || {}));
    } catch (error) {
      // Ignore metadata persistence errors.
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta || {}));
      }
    } catch (error) {
      // Ignore session metadata persistence errors.
    }
  }

  function getRemoteSyncMeta() {
    const mergeMeta = (primary, secondary) => {
      const merged = { ...(secondary || {}), ...(primary || {}) };
      Object.keys(secondary || {}).forEach((key) => {
        const primaryTime = getEpochMs(primary?.[key]);
        const secondaryTime = getEpochMs(secondary[key]);
        if (secondaryTime > primaryTime) {
          merged[key] = secondary[key];
        }
      });
      return merged;
    };

    try {
      const raw = localStorage.getItem(REMOTE_META_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const localMeta = parsed && typeof parsed === 'object' ? parsed : {};

      if (typeof sessionStorage === 'undefined') {
        return localMeta;
      }

      const sessionRaw = sessionStorage.getItem(SESSION_REMOTE_META_KEY);
      const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
      const sessionMeta = sessionParsed && typeof sessionParsed === 'object' ? sessionParsed : {};
      return mergeMeta(localMeta, sessionMeta);
    } catch (error) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          const sessionRaw = sessionStorage.getItem(SESSION_REMOTE_META_KEY);
          const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
          return sessionParsed && typeof sessionParsed === 'object' ? sessionParsed : {};
        }
      } catch (sessionError) {
        // Ignore fallback parsing errors.
      }

      return {};
    }
  }

  function setRemoteSyncMeta(meta) {
    try {
      originalSetItem.call(localStorage, REMOTE_META_KEY, JSON.stringify(meta || {}));
    } catch (error) {
      // Ignore metadata persistence errors.
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_REMOTE_META_KEY, JSON.stringify(meta || {}));
      }
    } catch (error) {
      // Ignore session metadata persistence errors.
    }
  }

  function markKnownRemoteVersion(key, updatedAtIso) {
    if (!SYNCED_KEYS.has(key) || !isKeyEnabled(key)) return;
    const meta = getRemoteSyncMeta();
    const previous = meta[key];
    if (getEpochMs(updatedAtIso) < getEpochMs(previous)) {
      return;
    }
    meta[key] = updatedAtIso;
    setRemoteSyncMeta(meta);
  }

  function parseJsonSafe(value) {
    if (typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function getEpochMs(value) {
    const time = new Date(value || '').getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function markLocalUpdate(key, updatedAtIso) {
    if (!SYNCED_KEYS.has(key) || !isKeyEnabled(key)) return;
    const meta = getSyncMeta();
    meta[key] = updatedAtIso || new Date().toISOString();
    setSyncMeta(meta);
  }

  function canUseRemoteState() {
    return typeof window !== 'undefined' && window.location && !window.location.protocol.startsWith('file');
  }

  function getPullEtags() {
    if (typeof sessionStorage === 'undefined') {
      return {};
    }

    try {
      const raw = sessionStorage.getItem(STATE_PULL_ETAG_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function setPullEtags(etags) {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    try {
      sessionStorage.setItem(STATE_PULL_ETAG_KEY, JSON.stringify(etags || {}));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function getPullEtagForKeys(keySignature) {
    const etags = getPullEtags();
    return String(etags[keySignature] || '').trim();
  }

  function setPullEtagForKeys(keySignature, etag) {
    if (!keySignature || !etag) return;
    const etags = getPullEtags();
    etags[keySignature] = etag;
    setPullEtags(etags);
  }

  function createClientId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getClientId() {
    if (typeof sessionStorage === 'undefined') {
      return createClientId();
    }

    try {
      const existing = sessionStorage.getItem(CLIENT_ID_KEY);
      if (existing) return existing;

      const next = createClientId();
      sessionStorage.setItem(CLIENT_ID_KEY, next);
      return next;
    } catch (error) {
      return createClientId();
    }
  }

  function schedulePush(key, value, options = {}) {
    if (!canUseRemoteState()) return;
    if (!SYNCED_KEYS.has(key) || !isKeyEnabled(key)) return;

    const stateSignature = typeof options.stateSignature === 'string' ? options.stateSignature : buildStateSignature(value);
    if (stateSignature && stateSignature === lastSyncedStateSignatures.get(key)) {
      return;
    }

    const syncMode = options.syncMode === 'delta' ? 'delta' : 'full';
    const removedIds = key === 'users' && Array.isArray(options.removedIds)
      ? Array.from(new Set(
        options.removedIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ))
      : [];

    const existing = pendingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      try {
        if (value === null) {
          await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
            method: 'DELETE'
          });
          return;
        }

        const remoteMeta = getRemoteSyncMeta();
        const baseUpdatedAt = remoteMeta[key] || null;
        const valueForTransfer = key === 'exhibitions' && Array.isArray(value)
          ? buildTransferSafeExhibitionsPayload(value)
          : value;

        const requestBody = {
          key,
          value: valueForTransfer,
          baseUpdatedAt,
          syncMode
        };

        if (key === 'users') {
          requestBody.removedIds = removedIds;
        }

        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-cloud-client-id': getClientId()
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          if (response.status === 409 || response.status === 422) {
            await pullRemoteState();
          }
          return;
        }

        const payload = await response.json().catch(() => null);
        const serverUpdatedAt = payload?.meta?.updatedAt;
        if (typeof serverUpdatedAt === 'string' && serverUpdatedAt) {
          markKnownRemoteVersion(key, serverUpdatedAt);
          markLocalUpdate(key, serverUpdatedAt);
          lastSyncedStateSignatures.set(key, stateSignature);
        }
      } catch (error) {
        console.error('Cloud sync push failed for key:', key, error);
      }
    }, PUSH_DEBOUNCE_MS);

    pendingTimers.set(key, timer);
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const previousRaw = this.getItem(key);
    originalSetItem.call(this, key, value);

    if (previousRaw === value) {
      return;
    }

    if (SYNCED_KEYS.has(key) && isKeyEnabled(key) && !applyingRemoteState) {
      markLocalUpdate(key);
    }

    if (applyingRemoteState || !SYNCED_KEYS.has(key) || !isKeyEnabled(key)) {
      return;
    }

    if (key === 'exhibitions' || key === 'users') {
      const nextParsed = parseJsonSafe(value);
      const previousParsed = parseJsonSafe(previousRaw);

      if (Array.isArray(nextParsed)) {
        queuePushWithBaseline(key, nextParsed, Array.isArray(previousParsed) ? previousParsed : []);
        return;
      }
    }

    try {
      const parsedValue = JSON.parse(value);
      schedulePush(key, parsedValue, { stateSignature: buildStateSignature(parsedValue), syncMode: 'full' });
    } catch (error) {
      schedulePush(key, value, { stateSignature: buildStateSignature(value), syncMode: 'full' });
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem.call(this, key);

    if (SYNCED_KEYS.has(key) && isKeyEnabled(key) && !applyingRemoteState) {
      markLocalUpdate(key);
    }

    if (applyingRemoteState || !SYNCED_KEYS.has(key) || !isKeyEnabled(key)) {
      return;
    }

    lastSyncedStateSignatures.delete(key);
    schedulePush(key, null);
  };

  async function pullRemoteState() {
    if (!canUseRemoteState()) {
      finalizeCloudSyncReady();
      return;
    }

    const requestedKeys = getRequestedSyncKeys();
    if (requestedKeys.length === 0) {
      finalizeCloudSyncReady();
      return;
    }

    try {
      const keySignature = requestedKeys.slice().sort().join(',');
      const previousEtag = getPullEtagForKeys(keySignature);
      const headers = {};
      if (previousEtag) {
        headers['If-None-Match'] = previousEtag;
      }

      const response = await fetch(`/api/state?keys=${encodeURIComponent(requestedKeys.join(','))}`, {
        headers
      });
      if (response.status === 304) {
        cloudSyncStatus.remoteReachable = true;
        return;
      }
      if (!response.ok) return;
      cloudSyncStatus.remoteReachable = true;

      const responseEtag = String(response.headers?.get('ETag') || '').trim();
      if (responseEtag) {
        setPullEtagForKeys(keySignature, responseEtag);
      }

      const payload = await response.json();
      if (!payload || !payload.ok || !payload.data) return;

      const remoteData = payload.data;
      const remoteMeta = payload.meta || {};
      const localMeta = getSyncMeta();
      const appliedRemoteKeys = [];
      applyingRemoteState = true;

      requestedKeys.forEach((key) => {
        const remoteValue = remoteData[key];
        cloudSyncStatus.hadRemoteData[key] = typeof remoteValue !== 'undefined';
        const localRaw = localStorage.getItem(key);
        const remoteUpdatedAt = remoteMeta[key]?.updatedAt || null;
        const localUpdatedAt = localMeta[key] || null;
        const parsedLocal = (key === 'exhibitions' || key === 'pottery-material-orders-v1')
          ? parseJsonSafe(localRaw)
          : null;

        if (typeof remoteValue !== 'undefined') {
          const remoteTime = getEpochMs(remoteUpdatedAt);
          const localTime = getEpochMs(localUpdatedAt);
          let mergedRemoteValue = remoteValue;
          let shouldHealRemotePreviews = false;

          if (key === 'pottery-material-orders-v1' && Array.isArray(parsedLocal) && Array.isArray(remoteValue)) {
            const reconciledOrders = mergeMaterialOrdersForSync(parsedLocal, remoteValue);
            const localNeedsApply = !isSameValue(parsedLocal, reconciledOrders);
            const remoteNeedsRepair = !isSameValue(remoteValue, reconciledOrders);

            if (localNeedsApply || remoteNeedsRepair) {
              originalSetItem.call(localStorage, key, JSON.stringify(reconciledOrders));
              markLocalUpdate(key, remoteUpdatedAt || new Date().toISOString());
              appliedRemoteKeys.push(key);

              if (remoteNeedsRepair) {
                schedulePush(key, reconciledOrders, {
                  stateSignature: buildStateSignature(reconciledOrders),
                  syncMode: 'full'
                });
              }
              return;
            }
          }

          if (remoteUpdatedAt) {
            markKnownRemoteVersion(key, remoteUpdatedAt);
          }

          if (key === 'exhibitions' && parsedLocal && Array.isArray(remoteValue)) {
            const localHasPreview = hasAnyPhotoPreviewInExhibitions(parsedLocal);
            const remoteHasPreview = hasAnyPhotoPreviewInExhibitions(remoteValue);

            if (localHasPreview && !remoteHasPreview) {
              mergedRemoteValue = mergeExhibitionsPreservingPreview(parsedLocal, remoteValue);
              shouldHealRemotePreviews = hasAnyPhotoPreviewInExhibitions(mergedRemoteValue);
            }
          }

          if (key === 'exhibitions' && shouldPreferRemoteExhibitions(parsedLocal, remoteValue)) {
            originalSetItem.call(localStorage, key, JSON.stringify(mergedRemoteValue));
            if (remoteUpdatedAt) {
              markLocalUpdate(key, remoteUpdatedAt);
            }
            if (shouldHealRemotePreviews) {
              schedulePush(key, mergedRemoteValue);
            }
            appliedRemoteKeys.push(key);
            return;
          }

          if (key === 'exhibitions' && parsedLocal && isSuspiciousRemoteExhibitionsDrop(parsedLocal, remoteValue)) {
            try {
              queuePushWithBaseline(key, JSON.parse(localRaw), remoteValue);
            } catch (error) {
              schedulePush(key, parsedLocal || localRaw, {
                stateSignature: buildStateSignature(parsedLocal || localRaw),
                syncMode: 'full'
              });
            }
            return;
          }

          // Apply remote only when it is newer than local.
          if (!localRaw || remoteTime > localTime) {
            originalSetItem.call(localStorage, key, JSON.stringify(mergedRemoteValue));
            if (remoteUpdatedAt) {
              markLocalUpdate(key, remoteUpdatedAt);
            }
            if (shouldHealRemotePreviews) {
              schedulePush(key, mergedRemoteValue);
            }
            appliedRemoteKeys.push(key);
            return;
          }

          // Local is newer/equal; push local back to server to converge.
          try {
            queuePushWithBaseline(key, JSON.parse(localRaw), remoteValue);
          } catch (error) {
            schedulePush(key, localRaw, {
              stateSignature: buildStateSignature(localRaw),
              syncMode: 'full'
            });
          }
          return;
        }

        if (localRaw) {
          try {
            queuePushWithBaseline(key, JSON.parse(localRaw), []);
          } catch (error) {
            schedulePush(key, localRaw, {
              stateSignature: buildStateSignature(localRaw),
              syncMode: 'full'
            });
          }
        }
      });

      cloudSyncStatus.appliedRemoteKeys = appliedRemoteKeys.slice();
      if (appliedRemoteKeys.length > 0 && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(STATE_APPLIED_EVENT, {
          detail: {
            keys: appliedRemoteKeys
          }
        }));
      }
    } catch (error) {
      console.error('Cloud sync pull failed:', error);
    } finally {
      applyingRemoteState = false;
      finalizeCloudSyncReady();
    }
  }

  pullRemoteState();
})();

/* auth.js */
// Authentication logic
let currentUser = null;
const MAX_PERSISTED_PHOTO_PREVIEW_LENGTH = 280000;
const EMERGENCY_RECOVERY_PASSWORD = 'recover1019!';

function isStorageQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22
    || error.code === 1014;
}

function stripHeavyFieldsFromValue(value, aggressive) {
  if (!value || typeof value !== 'object') return false;

  let stripped = false;
  const stripField = (fieldName) => {
    if (typeof value[fieldName] === 'string' && value[fieldName].length > 0) {
      value[fieldName] = '';
      stripped = true;
    }
  };

  stripField('photoDataUrl');
  stripField('imageDataUrl');

  if (aggressive) {
    // Keep lightweight preview thumbnails whenever possible.
    // Removing photoPreviewDataUrl causes user-visible "disappearing image" regressions.
    stripField('fileDataUrl');
    stripField('previewDataUrl');
  }

  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (Array.isArray(child)) {
      child.forEach((item) => {
        if (stripHeavyFieldsFromValue(item, aggressive)) {
          stripped = true;
        }
      });
      return;
    }

    if (child && typeof child === 'object' && stripHeavyFieldsFromValue(child, aggressive)) {
      stripped = true;
    }
  });

  return stripped;
}

function stripHeavyImageFieldsFromExhibitions(exhibitions, aggressive = false) {
  if (!Array.isArray(exhibitions)) return false;

  let stripped = false;
  exhibitions.forEach((exhibition) => {
    if (stripHeavyFieldsFromValue(exhibition, aggressive)) {
      stripped = true;
    }
  });

  return stripped;
}

function compactSerializedExhibitionsValue(serializedValue, aggressive = false) {
  if (typeof serializedValue !== 'string') return null;
  try {
    const parsed = JSON.parse(serializedValue);
    const changed = stripHeavyImageFieldsFromExhibitions(parsed, aggressive);
    if (!changed) return null;
    return JSON.stringify(parsed);
  } catch (error) {
    return null;
  }
}

function compactStoredExhibitions(aggressive = false) {
  const raw = localStorage.getItem('exhibitions');
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const changed = stripHeavyImageFieldsFromExhibitions(parsed, aggressive);
    if (!changed) return false;
    localStorage.setItem('exhibitions', JSON.stringify(parsed));
    return true;
  } catch (error) {
    return false;
  }
}

function safeSetLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      console.error('Failed to save localStorage key:', key, error);
      return false;
    }

    // First retry with compacted exhibition payload when writing exhibitions itself.
    if (key === 'exhibitions') {
      const compactModes = [false, true];
      for (const aggressive of compactModes) {
        const compactedValue = compactSerializedExhibitionsValue(value, aggressive);
        if (!compactedValue) continue;

        try {
          localStorage.setItem(key, compactedValue);
          if (aggressive) {
            console.warn('Saved exhibitions after aggressive compaction of preview/file payload.');
          } else {
            console.warn('Saved exhibitions after compacting image payload.');
          }
          return true;
        } catch (retryError) {
          // Continue to generic compaction retry path.
        }
      }
    }

    // Otherwise compact existing exhibitions to free up space, then retry.
    const compactModes = [false, true];
    for (const aggressive of compactModes) {
      const compactedStorage = compactStoredExhibitions(aggressive);
      if (!compactedStorage) continue;

      try {
        localStorage.setItem(key, value);
        if (aggressive) {
          console.warn('Saved localStorage after aggressive compaction of preview/file payload.');
        } else {
          console.warn('Saved localStorage after compacting stored image payload.');
        }
        return true;
      } catch (retryError) {
        if (!isStorageQuotaError(retryError)) {
          console.error('Failed to save localStorage key after compaction:', key, retryError);
          return false;
        }
      }
    }

    console.error('Failed to save localStorage key due to storage quota:', key, error);
    return false;
  }
}

window.safeSetLocalStorageItem = safeSetLocalStorageItem;

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  reconcileCurrentUserFromUsers({ silent: true });
  renderGlobalUserInfoBox();
  const loginForm = document.getElementById('login-id');
  if (loginForm) {
    loginForm.focus();
  }
});

window.addEventListener('cloud-sync:ready', () => {
  reconcileCurrentUserFromUsers();
});

window.addEventListener('cloud-sync:state-applied', (event) => {
  const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
  if (keys.includes('users')) {
    reconcileCurrentUserFromUsers();
  }
});

function normalizeAccountTypeLabel(type) {
  return type ? type.toString().trim() : '';
}

function ensureProfileEditStyles() {
  if (document.getElementById('profile-edit-styles')) return;

  const style = document.createElement('style');
  style.id = 'profile-edit-styles';
  style.textContent = `
    .user-info {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 8px !important;
    }

    .user-info .user-pill-actions {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      margin-left: 0 !important;
    }

    .user-info #user-display {
      display: inline-flex !important;
      align-items: center !important;
      flex: 0 1 auto !important;
      min-width: 0 !important;
      max-width: min(56vw, 280px) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .user-pill-actions {
      display: inline-flex;
      gap: 8px;
      margin-left: 10px;
      align-items: center;
    }

    .edit-account-btn {
      padding: 6px 12px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .edit-account-btn:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }

    .profile-edit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
      box-sizing: border-box;
    }

    .profile-edit-modal {
      width: 100%;
      max-width: 480px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .profile-edit-header {
      padding: 16px 18px;
      border-bottom: 1px solid #e5e7eb;
    }

    .profile-edit-title {
      margin: 0;
      font-size: 18px;
      color: #111827;
    }

    .profile-edit-body {
      padding: 16px 18px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .profile-edit-body label {
      font-size: 13px;
      color: #374151;
      font-weight: 600;
    }

    .profile-edit-body input {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .profile-edit-note {
      margin: 2px 0 0;
      color: #6b7280;
      font-size: 12px;
    }

    .profile-edit-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 18px 18px;
    }

    .profile-edit-btn {
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .profile-edit-cancel {
      background: #f3f4f6;
      color: #111827;
    }

    .profile-edit-save {
      background: #111827;
      color: #ffffff;
    }

    .profile-edit-message {
      min-height: 18px;
      font-size: 12px;
      color: #b91c1c;
      margin-top: 2px;
    }
  `;

  document.head.appendChild(style);
}

function ensureProfileEditModal() {
  ensureProfileEditStyles();
  if (document.getElementById('profile-edit-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'profile-edit-overlay';
  overlay.className = 'profile-edit-overlay';
  overlay.innerHTML = `
    <div class="profile-edit-modal">
      <div class="profile-edit-header">
        <h3 class="profile-edit-title">계정 수정</h3>
      </div>
      <div class="profile-edit-body">
        <label for="profile-edit-name">실명</label>
        <input id="profile-edit-name" type="text" autocomplete="name">

        <label for="profile-edit-username">사용자명</label>
        <input id="profile-edit-username" type="text" autocomplete="username">

        <label for="profile-edit-email">이메일</label>
        <input id="profile-edit-email" type="email" autocomplete="email">

        <label for="profile-edit-phone">전화번호</label>
        <input id="profile-edit-phone" type="tel" autocomplete="tel">

        <label for="profile-edit-password">새 비밀번호 (선택)</label>
        <input id="profile-edit-password" type="password" autocomplete="new-password">

        <label for="profile-edit-confirm">새 비밀번호 확인</label>
        <input id="profile-edit-confirm" type="password" autocomplete="new-password">

        <p class="profile-edit-note">접근 사이트/권한은 여기서 수정할 수 없습니다.</p>
        <div id="profile-edit-message" class="profile-edit-message"></div>
      </div>
      <div class="profile-edit-footer">
        <button class="profile-edit-btn profile-edit-cancel" onclick="closeProfileEditModal()">취소</button>
        <button class="profile-edit-btn profile-edit-save" onclick="saveProfileEdit()">저장</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeProfileEditModal();
    }
  });

  document.body.appendChild(overlay);
}

function getCurrentUserRecordIndex(users, activeUser) {
  if (!Array.isArray(users) || !activeUser) return -1;

  const currentId = Number(activeUser.id);
  if (Number.isFinite(currentId) && currentId > 0) {
    const byId = users.findIndex((user) => Number(user?.id) === currentId);
    if (byId !== -1) return byId;
  }

  const normalizedUsername = normalizeLoginValue(activeUser.username);
  const normalizedEmail = normalizeLoginValue(activeUser.email);
  const normalizedPhone = normalizeLoginValue(activeUser.phone);
  const normalizedName = normalizeLoginValue(activeUser.name);

  return users.findIndex((user) => {
    if (!user || typeof user !== 'object') return false;
    return normalizeLoginValue(user.username) === normalizedUsername
      || normalizeLoginValue(user.email) === normalizedEmail
      || normalizeLoginValue(user.phone) === normalizedPhone
      || normalizeLoginValue(user.name) === normalizedName;
  });
}

function showProfileEditMessage(message) {
  const messageEl = document.getElementById('profile-edit-message');
  if (!messageEl) return;
  messageEl.textContent = message || '';
}

function openProfileEditModal() {
  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  if (!activeUser) return;

  ensureProfileEditModal();

  const overlay = document.getElementById('profile-edit-overlay');
  if (!overlay) return;

  document.getElementById('profile-edit-name').value = activeUser.name || '';
  document.getElementById('profile-edit-username').value = activeUser.username || '';
  document.getElementById('profile-edit-email').value = activeUser.email || '';
  document.getElementById('profile-edit-phone').value = activeUser.phone || '';
  document.getElementById('profile-edit-password').value = '';
  document.getElementById('profile-edit-confirm').value = '';
  showProfileEditMessage('');

  overlay.style.display = 'flex';
}

function closeProfileEditModal() {
  const overlay = document.getElementById('profile-edit-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  showProfileEditMessage('');
}

function saveProfileEdit() {
  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  if (!activeUser) {
    showProfileEditMessage('로그인 정보가 없어 수정할 수 없습니다.');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userIndex = getCurrentUserRecordIndex(users, activeUser);
  if (userIndex === -1) {
    showProfileEditMessage('사용자 계정을 찾을 수 없습니다.');
    return;
  }

  const name = document.getElementById('profile-edit-name').value.trim();
  const username = document.getElementById('profile-edit-username').value.trim();
  const email = document.getElementById('profile-edit-email').value.trim();
  const phone = document.getElementById('profile-edit-phone').value.trim();
  const newPassword = document.getElementById('profile-edit-password').value.trim();
  const confirmPassword = document.getElementById('profile-edit-confirm').value.trim();

  if (!name || !username || !email || !phone) {
    showProfileEditMessage('실명, 사용자명, 이메일, 전화번호를 모두 입력하세요.');
    return;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      showProfileEditMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showProfileEditMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }
  }

  const normalizedName = normalizeLoginValue(name);
  const normalizedUsername = normalizeLoginValue(username);
  const duplicateIdentity = users.some((user, index) => {
    if (!user || typeof user !== 'object') return false;
    if (index === userIndex) return false;
    return normalizeLoginValue(user.name) === normalizedName
      || normalizeLoginValue(user.username) === normalizedUsername;
  });

  if (duplicateIdentity) {
    showProfileEditMessage('이미 사용 중인 실명 또는 사용자명입니다.');
    return;
  }

  const updatedUser = {
    ...users[userIndex],
    name,
    username,
    email,
    phone
  };

  if (newPassword) {
    updatedUser.password = newPassword;
  }

  users[userIndex] = updatedUser;

  const savedUsers = safeSetLocalStorageItem('users', JSON.stringify(users));
  if (!savedUsers) {
    showProfileEditMessage('저장 공간이 부족해 계정 수정을 저장하지 못했습니다.');
    return;
  }

  currentUser = updatedUser;
  const savedCurrentUser = safeSetLocalStorageItem('currentUser', JSON.stringify(updatedUser));
  if (!savedCurrentUser) {
    showProfileEditMessage('로그인 상태 저장에 실패했습니다. 다시 시도해 주세요.');
    return;
  }

  renderGlobalUserInfoBox();
  closeProfileEditModal();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('auth:profile-updated', {
      detail: { user: updatedUser }
    }));
  }
}

window.openProfileEditModal = openProfileEditModal;
window.closeProfileEditModal = closeProfileEditModal;
window.saveProfileEdit = saveProfileEdit;

function renderGlobalUserInfoBox() {
  ensureProfileEditStyles();

  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  const existingBox = document.querySelector('.user-info');

  if (!activeUser) {
    if (existingBox) {
      existingBox.remove();
    }
    return;
  }

  const accountTypeLabel = normalizeAccountTypeLabel(activeUser.accountType) || '미지정';
  const userLabel = `<strong>${activeUser.name}</strong> (${accountTypeLabel})`;

  if (existingBox) {
    let actionWrap = existingBox.querySelector('.user-pill-actions');
    if (!actionWrap) {
      actionWrap = document.createElement('span');
      actionWrap.className = 'user-pill-actions';
      existingBox.appendChild(actionWrap);
    }

    let userDisplay = existingBox.querySelector('#user-display');
    if (!userDisplay) {
      userDisplay = document.createElement('span');
      userDisplay.id = 'user-display';
    }
    userDisplay.innerHTML = userLabel;

    let editButton = existingBox.querySelector('.edit-account-btn');
    if (!editButton) {
      editButton = document.createElement('button');
      editButton.className = 'edit-account-btn';
      editButton.textContent = '계정 수정';
    }
    editButton.setAttribute('onclick', 'openProfileEditModal()');

    let logoutButton = existingBox.querySelector('.logout-btn');
    if (!logoutButton) {
      logoutButton = document.createElement('button');
      logoutButton.className = 'logout-btn';
      logoutButton.textContent = '로그아웃';
    }
    logoutButton.setAttribute('onclick', 'logout()');

    actionWrap.replaceChildren(userDisplay, editButton, logoutButton);
    return;
  }

  const userInfoBox = document.createElement('div');
  userInfoBox.className = 'user-info';
  userInfoBox.innerHTML = `
    <span class="user-pill-actions">
      <span id="user-display">${userLabel}</span>
      <button class="edit-account-btn" onclick="openProfileEditModal()">계정 수정</button>
      <button class="logout-btn" onclick="logout()">로그아웃</button>
    </span>
  `;
  document.body.prepend(userInfoBox);
}

function logout() {
  if (confirm('로그아웃하시겠습니까?')) {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }
}

window.logout = logout;

function toggleForm() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  
  if (loginForm.classList.contains('active')) {
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
  } else {
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
  }
  
  clearMessage();
}

function normalizeLoginValue(value) {
  return value ? value.toString().trim().toLowerCase() : '';
}

function findUserForLogin(users, normalizedId, password) {
  if (!Array.isArray(users) || !normalizedId) return null;

  return users.find((u) => {
    const normalizedName = normalizeLoginValue(u.name);
    const normalizedUsername = normalizeLoginValue(u.username);
    const normalizedPhone = normalizeLoginValue(u.phone);
    const normalizedEmail = normalizeLoginValue(u.email);
    return (normalizedName === normalizedId
      || normalizedUsername === normalizedId
      || normalizedPhone === normalizedId
      || normalizedEmail === normalizedId)
      && String(u.password || '') === String(password || '');
  }) || null;
}

async function handleLogin() {
  const id = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!id || !password) {
    showMessage('ID와 비밀번호를 입력하세요.', 'error');
    return;
  }

  const normalizedId = normalizeLoginValue(id);
  let users = JSON.parse(localStorage.getItem('users')) || [];
  let user = findUserForLogin(users, normalizedId, password);

  // On first load, users may still be syncing from remote; retry once after cloud-sync becomes ready.
  if (!user && isLoginPage()) {
    await waitForCloudSyncReady();
    users = JSON.parse(localStorage.getItem('users')) || [];
    user = findUserForLogin(users, normalizedId, password);
  }

  if (!user) {
    showMessage('ID 또는 비밀번호가 잘못되었습니다.', 'error');
    return;
  }

  // Log the user in
  currentUser = user;
  const savedCurrentUser = safeSetLocalStorageItem('currentUser', JSON.stringify(currentUser));
  if (!savedCurrentUser) {
    showMessage('저장 공간이 부족해 로그인 상태를 저장하지 못했습니다.', 'error');
    return;
  }
  showMessage('로그인 성공! 잠시 후 대시보드로 이동합니다...', 'success');

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1500);
}

function reconcileCurrentUserFromUsers(options = {}) {
  const activeUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (!activeUser) {
    currentUser = null;
    return null;
  }

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  if (!Array.isArray(users) || users.length === 0) {
    currentUser = activeUser;
    return activeUser;
  }

  const matchedIndex = getCurrentUserRecordIndex(users, activeUser);
  if (matchedIndex === -1) {
    currentUser = activeUser;
    return activeUser;
  }

  const matchedUser = users[matchedIndex];
  const mergedUser = {
    ...activeUser,
    ...matchedUser,
    password: String(matchedUser?.password || activeUser?.password || '')
  };

  const before = JSON.stringify(activeUser);
  const after = JSON.stringify(mergedUser);
  currentUser = mergedUser;

  if (before !== after) {
    safeSetLocalStorageItem('currentUser', JSON.stringify(mergedUser));
    if (!options.silent) {
      renderGlobalUserInfoBox();
    }
  }

  return mergedUser;
}

function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const confirmPassword = document.getElementById('signup-confirm').value.trim();

  if (!name || !username || !email || !phone || !password || !confirmPassword) {
    showMessage('모든 필드를 입력하세요.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showMessage('비밀번호가 일치하지 않습니다.', 'error');
    return;
  }

  if (password.length < 6) {
    showMessage('비밀번호는 최소 6자 이상이어야 합니다.', 'error');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const normalizedName = normalizeLoginValue(name);
  const normalizedUsername = normalizeLoginValue(username);

  // Name and username must remain unique across all accounts.
  const hasDuplicateIdentity = users.some((user) => {
    return normalizeLoginValue(user.name) === normalizedName
      || normalizeLoginValue(user.username) === normalizedUsername;
  });

  if (hasDuplicateIdentity) {
    showMessage('이미 사용 중인 실명 또는 사용자명입니다.', 'error');
    return;
  }

  // Create new user
  const newUser = {
    id: Date.now(),
    name: name,
    username: username,
    email: email,
    phone: phone,
    password: password,
    accountType: null, // Will be assigned by admin
    approved: false,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  const savedUsers = safeSetLocalStorageItem('users', JSON.stringify(users));
  if (!savedUsers) {
    showMessage('저장 공간이 부족해 회원가입 정보를 저장하지 못했습니다.', 'error');
    return;
  }

  showMessage('회원가입 성공! 관리자의 승인을 기다려주세요. 로그인 페이지로 이동합니다...', 'success');

  setTimeout(() => {
    // Clear form
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-username').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-phone').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-confirm').value = '';

    // Toggle back to login form
    document.getElementById('signup-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
  }, 2000);
}

function showMessage(message, type) {
  const messageDiv = document.getElementById('auth-message');
  messageDiv.textContent = message;
  messageDiv.className = 'auth-message ' + type;
  messageDiv.style.display = 'block';
}

function clearMessage() {
  const messageDiv = document.getElementById('auth-message');
  messageDiv.textContent = '';
  messageDiv.className = 'auth-message';
  messageDiv.style.display = 'none';
}

function loadCurrentUser() {
  const stored = localStorage.getItem('currentUser');
  if (stored) {
    currentUser = JSON.parse(stored);
  }
}

function canUseRemoteState() {
  return typeof window !== 'undefined' && window.location && !window.location.protocol.startsWith('file');
}

function hasPasswordValue(user) {
  return Boolean(String(user?.password || '').trim());
}

function isAdminRoleLabel(label) {
  const value = String(label || '').trim();
  return value === '어드민';
}

function hasAnyAdminAccount(users) {
  return (users || []).some((user) => {
    if (!user || typeof user !== 'object') return false;
    const accountType = String(user.accountType || '').trim();
    const studioRole = String(user.studioRole || '').trim();
    const galleryRole = String(user.galleryRole || '').trim();
    return isAdminRoleLabel(accountType) || isAdminRoleLabel(studioRole) || isAdminRoleLabel(galleryRole);
  });
}

function repairUsersMissingPasswords() {
  if (!isLoginPage()) return false;

  const rawUsers = JSON.parse(localStorage.getItem('users'));
  const users = Array.isArray(rawUsers) ? rawUsers : [];
  if (users.length === 0) return false;

  let changed = false;
  users.forEach((user) => {
    if (!user || typeof user !== 'object') return;
    if (!hasPasswordValue(user)) {
      user.password = EMERGENCY_RECOVERY_PASSWORD;
      changed = true;
    }
  });

  if (!hasAnyAdminAccount(users)) {
    const maxId = users.reduce((acc, user) => {
      const id = Number(user && user.id);
      return Number.isFinite(id) && id > acc ? id : acc;
    }, 0);

    users.push({
      id: maxId + 1,
      name: '복구 관리자',
      username: 'recoveryadmin',
      email: 'recovery@1019.com',
      phone: '010-1019-1019',
      password: EMERGENCY_RECOVERY_PASSWORD,
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    });
    changed = true;
  }

  if (!changed) return false;

  safeSetLocalStorageItem('users', JSON.stringify(users));
  if (typeof window !== 'undefined') {
    window.__authRecoveryNotice = `복구 모드: 누락된 비밀번호를 임시 비밀번호(${EMERGENCY_RECOVERY_PASSWORD})로 복구했습니다.`;
  }
  return true;
}

function isLocalPreviewEnvironment() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const host = (window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isLoginPage() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const path = window.location.pathname || '';
  return path.endsWith('/login.html') || path === '/login.html' || path === 'login.html';
}

function waitForCloudSyncReady(timeoutMs = 4000) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const cloudReady = window.cloudSyncReady;
  if (!cloudReady || typeof cloudReady.then !== 'function') {
    return Promise.resolve(window.cloudSyncStatus || null);
  }

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve(window.cloudSyncStatus || null);
    }, timeoutMs);
  });

  return Promise.race([
    cloudReady.catch(() => null),
    timeoutPromise
  ]);
}

async function seedDefaultUsersIfNeeded() {
  if (!isLoginPage()) {
    return;
  }

  const existingUsers = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    return;
  }

  const syncStatus = await waitForCloudSyncReady();
  const usersAfterSync = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(usersAfterSync) && usersAfterSync.length > 0) {
    repairUsersMissingPasswords();
    return;
  }

  if (canUseRemoteState() && !isLocalPreviewEnvironment()) {
    const remoteReachable = Boolean(syncStatus && syncStatus.remoteReachable);
    const remoteHasUsers = Boolean(syncStatus && syncStatus.hadRemoteData && syncStatus.hadRemoteData.users);

    if (remoteHasUsers) {
      return;
    }

    if (!remoteReachable) {
      console.warn('Skipping default user seeding because remote sync is unreachable.');
      return;
    }
  }

  seedDefaultUsers();
  repairUsersMissingPasswords();
}

function ensureLocalPreviewDualSiteAdmin() {
  if (!isLocalPreviewEnvironment()) {
    return;
  }

  const rawUsers = JSON.parse(localStorage.getItem('users'));
  const users = Array.isArray(rawUsers) ? rawUsers : [];

  let changed = false;
  const now = new Date().toISOString();

  const applyDualAdminFields = (user) => {
    if (!user || typeof user !== 'object') return;

    if (user.accountType !== '어드민') {
      user.accountType = '어드민';
      changed = true;
    }
    if (user.approved !== true) {
      user.approved = true;
      changed = true;
    }
    if (user.siteAccess !== 'both') {
      user.siteAccess = 'both';
      changed = true;
    }
    if (user.studioRole !== '어드민') {
      user.studioRole = '어드민';
      changed = true;
    }
    if (user.galleryRole !== '어드민') {
      user.galleryRole = '어드민';
      changed = true;
    }
  };

  const candidates = users.filter((user) => {
    const username = normalizeLoginValue(user && user.username);
    const email = normalizeLoginValue(user && user.email);
    return username === 'admin'
      || username === 'yoobinsy'
      || email === 'admin@1019.com'
      || email === 'yoobinsy@gmail.com';
  });

  if (candidates.length > 0) {
    candidates.forEach((user) => applyDualAdminFields(user));
  } else {
    const maxId = users.reduce((acc, user) => {
      const id = Number(user && user.id);
      return Number.isFinite(id) && id > acc ? id : acc;
    }, 0);

    users.push({
      id: maxId + 1,
      name: '로컬 어드민',
      username: 'localadmin',
      email: 'localadmin@1019.com',
      phone: '010-1019-1019',
      password: 'localadmin123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: now
    });
    changed = true;
  }

  if (changed) {
    safeSetLocalStorageItem('users', JSON.stringify(users));
  }
}

function registerLocalPreviewAdminGuards() {
  if (!isLocalPreviewEnvironment()) {
    return;
  }

  waitForCloudSyncReady().finally(() => {
    ensureLocalPreviewDualSiteAdmin();
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (keys.includes('users')) {
      ensureLocalPreviewDualSiteAdmin();
    }
  });
}

function seedDefaultUsers() {
  const users = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(users) && users.length > 0) {
    return;
  }

  const initialUsers = [];
  const defaultUsers = [
    {
      id: 1,
      name: '관리자',
      username: 'admin',
      email: 'admin@1019.com',
      phone: '010-0000-0000',
      password: 'admin123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      name: '기획자 테스트',
      username: 'planner',
      email: 'planner@1019.com',
      phone: '010-1111-1111',
      password: 'planner123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 3,
      name: '작가 테스트',
      username: 'artist',
      email: 'artist@1019.com',
      phone: '010-2222-2222',
      password: 'artist123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 4,
      name: '이수민',
      username: 'sumin',
      email: 'sumin@example.com',
      phone: '010-3333-3333',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 5,
      name: '김현우',
      username: 'hyunwoo',
      email: 'hyunwoo@example.com',
      phone: '010-4444-4444',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 6,
      name: '박지윤',
      username: 'jiyoon',
      email: 'jiyoon@example.com',
      phone: '010-5555-5555',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 7,
      name: '최민준',
      username: 'minjun',
      email: 'minjun@example.com',
      phone: '010-6666-6666',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 8,
      name: '정서연',
      username: 'seoyeon',
      email: 'seoyeon@example.com',
      phone: '010-7777-7777',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 9,
      name: 'yoobinsy',
      username: 'yoobinsy',
      email: 'yoobinsy@gmail.com',
      phone: '010-1234-5678',
      password: 'test123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    }
  ];

  defaultUsers.forEach(defaultUser => {
    initialUsers.push(defaultUser);
  });

  safeSetLocalStorageItem('users', JSON.stringify(initialUsers));
}

seedDefaultUsersIfNeeded();
waitForCloudSyncReady().finally(() => {
  const recovered = repairUsersMissingPasswords();
  if (recovered && typeof showMessage === 'function') {
    showMessage(window.__authRecoveryNotice || '복구 모드가 적용되었습니다.', 'success');
  }
});
ensureLocalPreviewDualSiteAdmin();
registerLocalPreviewAdminGuards();

/* storage/storage-adapter.js */
(function initializeBrowserStorageAdapter(root) {
  'use strict';

  function createStorageAdapter(options = {}) {
    const storage = options.storage || root.localStorage;
    const safeWrite = options.safeWrite || root.safeSetLocalStorageItem;

    return Object.freeze({
      read(key) {
        return storage.getItem(key);
      },
      write(key, serializedValue) {
        return storage.setItem(key, serializedValue);
      },
      writeSafely(key, serializedValue) {
        if (typeof safeWrite === 'function') {
          return safeWrite(key, serializedValue);
        }
        try {
          storage.setItem(key, serializedValue);
          return true;
        } catch (error) {
          return false;
        }
      },
      remove(key) {
        return storage.removeItem(key);
      }
    });
  }

  const api = Object.freeze({
    createStorageAdapter,
    storage: createStorageAdapter()
  });
  root.BrowserStorageAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* storage/exhibitions-repository.js */
(function initializeExhibitionsRepository(root) {
  'use strict';

  const KEY = 'exhibitions';

  function createExhibitionsRepository(storage) {
    return Object.freeze({
      loadExhibitions() {
        return JSON.parse(storage.read(KEY) || 'null') || [];
      },
      saveExhibitionsSafely(exhibitions) {
        return storage.writeSafely(KEY, JSON.stringify(exhibitions));
      }
    });
  }

  function createDeferredExhibitionsRepository(getStorage) {
    function requireStorage() {
      const storage = getStorage();
      if (!storage) {
        throw new Error('Exhibitions storage adapter is unavailable.');
      }
      return storage;
    }

    return Object.freeze({
      loadExhibitions() {
        return createExhibitionsRepository(requireStorage()).loadExhibitions();
      },
      saveExhibitionsSafely(exhibitions) {
        return createExhibitionsRepository(requireStorage()).saveExhibitionsSafely(exhibitions);
      }
    });
  }

  const api = Object.freeze({
    KEY,
    createExhibitionsRepository,
    createDeferredExhibitionsRepository,
    repository: createDeferredExhibitionsRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.ExhibitionsRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* storage/exhibition-detail-repository.js */
(function initializeExhibitionDetailRepository(root) {
  'use strict';

  function createExhibitionDetailRepository(storage) {
    return Object.freeze({
      loadUsers() {
        return JSON.parse(storage.read('users') || 'null') || [];
      },
      loadInventoryBackup(key) {
        try {
          const parsed = JSON.parse(storage.read(key) || 'null');
          if (!parsed || typeof parsed !== 'object') return null;
          if (!parsed.snapshot || typeof parsed.snapshot !== 'object') return null;
          return parsed;
        } catch (error) {
          return null;
        }
      },
      saveInventoryBackupSafely(key, backup) {
        return storage.writeSafely(key, JSON.stringify(backup));
      },
      loadPreference(key) {
        try {
          return storage.read(key) || '';
        } catch (error) {
          return '';
        }
      },
      savePreference(key, value) {
        try {
          storage.write(key, value);
        } catch (error) {
          // Preferences are non-critical and retain best-effort storage semantics.
        }
      }
    });
  }

  function createDeferredExhibitionDetailRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Exhibition detail storage adapter is unavailable.');
      return createExhibitionDetailRepository(storage);
    }
    return Object.freeze({
      loadUsers: () => repository().loadUsers(),
      loadInventoryBackup: (key) => repository().loadInventoryBackup(key),
      saveInventoryBackupSafely: (key, backup) => repository().saveInventoryBackupSafely(key, backup),
      loadPreference: (key) => repository().loadPreference(key),
      savePreference: (key, value) => repository().savePreference(key, value)
    });
  }

  const api = Object.freeze({
    createExhibitionDetailRepository,
    createDeferredExhibitionDetailRepository,
    repository: createDeferredExhibitionDetailRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.ExhibitionDetailRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/sales-model.js */
(function initializeExhibitionSalesModel(root) {
  'use strict';

  function normalizeSoldItemType(sold) {
    if (!sold) return '작품';
    return sold.itemType === '굿즈' ? '굿즈' : '작품';
  }

  function parseSoldQuantity(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(number) || number <= 0) return 1;
    return Math.floor(number);
  }

  function parseStockQuantity(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.floor(number);
  }

  function getSoldQuantityForItemType(itemType, value) {
    return itemType === '굿즈' ? parseSoldQuantity(value) : 1;
  }

  function getGoodsSoldQuantity(records, goodsId) {
    return records
      .filter((sold) => normalizeSoldItemType(sold) === '굿즈' && sold.workId === goodsId)
      .reduce((sum, sold) => sum + parseSoldQuantity(sold.soldQuantity), 0);
  }

  function getSalesSearchResults(options) {
    const artWorks = Array.isArray(options?.artWorks)
      ? options.artWorks
      : (Array.isArray(options?.works) ? options.works : []);
    const goods = Array.isArray(options?.goods) ? options.goods : [];
    const items = [
      ...artWorks.map((work) => ({ ...work, itemType: '작품' })),
      ...goods.map((work) => ({ ...work, itemType: '굿즈' }))
    ];
    const query = options?.query;
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (query === '__all__') return items;
    if (!normalizedQuery) return [];

    return items
      .filter((work) => {
        const number = String(work.manualNumber || '').toLowerCase();
        const title = String(work.title || '').toLowerCase();
        return number.includes(normalizedQuery) || title.includes(normalizedQuery);
      })
      .slice(0, 20);
  }

  function filterSoldWorks(records, options = {}) {
    if (options.advanced) {
      const filters = options.filters || {};
      return records.filter((sold) => {
        const soldDate = String(sold.soldAtKst || '').slice(0, 10);
        const from = String(filters.soldDateFrom || '').trim();
        const to = String(filters.soldDateTo || '').trim();
        if (from && (!soldDate || soldDate < from)) return false;
        if (to && (!soldDate || soldDate > to)) return false;

        const textFields = ['manualNumber', 'title', 'author', 'buyerName', 'buyerPhone', 'paymentMethod'];
        return textFields.every((key) => {
          const value = String(filters[key] || '').trim().toLowerCase();
          if (!value) return true;
          return String(sold[key] || '').toLowerCase().includes(value);
        });
      });
    }

    const search = String(options.search || '').trim().toLowerCase();
    if (!search) return records;
    return records.filter((sold) => {
      const paymentDisplay = sold.paymentMethod === '기타'
        ? `기타 ${sold.paymentMethodEtc || ''}`
        : (sold.paymentMethod || '');
      const text = `${sold.manualNumber || ''} ${normalizeSoldItemType(sold)} ${sold.title || ''} ${sold.author || ''} ${sold.price || ''} ${sold.soldQuantity || ''} ${sold.soldAtKst || ''} ${sold.buyerName || ''} ${sold.buyerPhone || ''} ${paymentDisplay} ${sold.note || ''}`.toLowerCase();
      return text.includes(search);
    });
  }

  function parseSoldPriceAmount(value, isNotForSale) {
    if (typeof isNotForSale === 'function' && isNotForSale(value)) return 0;
    const amount = Number(String(value || '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount;
  }

  function getSoldSortValue(sold, field, isNotForSale) {
    if (field === 'itemType') return normalizeSoldItemType(sold);
    if (field === 'price') {
      const amount = parseSoldPriceAmount(sold.price, isNotForSale);
      return amount > 0 ? String(amount) : '';
    }
    const values = {
      manualNumber: sold.manualNumber,
      category: sold.category,
      title: sold.title,
      author: sold.author,
      soldAtKst: sold.soldAtKst,
      buyerName: sold.buyerName,
      buyerPhone: sold.buyerPhone,
      paymentMethod: sold.paymentMethod
    };
    return values[field] || '';
  }

  function getSortedSoldWorks(options) {
    const filtered = filterSoldWorks(options?.records || [], options);
    if (!options?.sortField) return filtered;
    const direction = options.sortDirection === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const leftValue = getSoldSortValue(left, options.sortField, options.isNotForSale);
      const rightValue = getSoldSortValue(right, options.sortField, options.isNotForSale);
      return options.compareValues(leftValue, rightValue, options.sortField) * direction;
    });
  }

  function getArtistSalesSummary(records, isNotForSale) {
    const summaryMap = new Map();
    records.forEach((sold) => {
      const author = String(sold.author || '').trim() || '작가 미지정';
      const quantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), sold.soldQuantity);
      const revenue = parseSoldPriceAmount(sold.price, isNotForSale) * quantity;
      const existing = summaryMap.get(author) || { author, soldCount: 0, totalRevenue: 0 };
      existing.soldCount += quantity;
      existing.totalRevenue += revenue;
      summaryMap.set(author, existing);
    });
    return Array.from(summaryMap.values()).sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.soldCount !== left.soldCount) return right.soldCount - left.soldCount;
      return left.author.localeCompare(right.author, 'ko');
    });
  }

  function getSoldStats(options) {
    const records = Array.isArray(options?.records) ? options.records : [];
    const selectedIds = Array.isArray(options?.selectedIds) ? options.selectedIds : [];
    const selectedSet = new Set(selectedIds);
    const idField = options?.idField || 'id';
    const scoped = selectedIds.length > 0
      ? records.filter((item) => selectedSet.has(item[idField]))
      : records;
    return {
      basisLabel: selectedIds.length > 0
        ? `${options.selectedLabel} ${selectedIds.length}개 기준 판매 통계`
        : options.allLabel,
      soldCount: scoped.length,
      totalAmount: scoped.reduce((sum, item) => sum + parseSoldPriceAmount(item.price, options.isNotForSale), 0)
    };
  }

  const api = Object.freeze({
    filterSoldWorks,
    getArtistSalesSummary,
    getGoodsSoldQuantity,
    getSalesSearchResults,
    getSoldQuantityForItemType,
    getSoldSortValue,
    getSoldStats,
    getSortedSoldWorks,
    normalizeSoldItemType,
    parseSoldPriceAmount,
    parseSoldQuantity,
    parseStockQuantity
  });
  root.ExhibitionSalesModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/accounting-projection.js */
(function initializeExhibitionAccountingProjection(root) {
  'use strict';

  function parseAmount(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function formatAmount(value) {
    return `₩ ${parseAmount(value).toLocaleString('ko-KR')}`;
  }

  function buildRevenueItems(options) {
    let artTotal = 0;
    let goodsTotal = 0;
    const soldWorks = Array.isArray(options?.soldWorks) ? options.soldWorks : [];
    soldWorks.forEach((sold) => {
      const itemType = options.normalizeItemType(sold);
      const unitAmount = parseAmount(sold.price);
      const quantity = options.getQuantity(itemType, sold.soldQuantity);
      const rowAmount = unitAmount * quantity;
      if (itemType === '굿즈') goodsTotal += rowAmount;
      else artTotal += rowAmount;
    });

    const manualItems = Array.isArray(options?.manualRevenueItems) ? options.manualRevenueItems : [];
    const manualRows = manualItems.map((item) => ({
      id: item.id,
      division: item.division,
      amount: item.amount,
      source: 'manual'
    }));
    return [
      { id: 'art', division: '작품 판매', amount: artTotal, source: 'auto' },
      { id: 'goods', division: '굿즈 판매', amount: goodsTotal, source: 'auto' },
      ...manualRows
    ];
  }

  function getExpenseEffectiveAmount(item, revenueTotals) {
    if (!item) return 0;
    if (item.code === 'commission-art') return (revenueTotals.art || 0) * 0.6;
    if (item.code === 'commission-goods') return (revenueTotals.goods || 0) * 0.8;
    return parseAmount(item.amount);
  }

  function buildFinanceProjection(options) {
    const expenseItems = Array.isArray(options?.expenseItems) ? options.expenseItems : [];
    const revenueItems = Array.isArray(options?.revenueItems) ? options.revenueItems : [];
    const revenueTotals = {
      art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
      goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
    };
    const expenseTotal = expenseItems.reduce(
      (sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals),
      0
    );
    const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
    return {
      revenueTotals,
      expenseTotal,
      revenueTotal,
      profitTotal: revenueTotal - expenseTotal
    };
  }

  const api = Object.freeze({
    buildFinanceProjection,
    buildRevenueItems,
    formatAmount,
    getExpenseEffectiveAmount,
    parseAmount
  });
  root.ExhibitionAccountingProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/export-model.js */
(function initializeExhibitionExportModel(root) {
  'use strict';

  const EXCEL_MIME_TYPE = 'application/vnd.ms-excel;charset=utf-8;';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function sanitizeTitle(title) {
    return String(title || 'exhibition').replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
  }

  function buildFilename(title, suffix) {
    return `${sanitizeTitle(title)}-${suffix}.xls`;
  }

  function getPaymentDisplay(sold) {
    if (sold.paymentMethod === '기타') {
      return `기타${sold.paymentMethodEtc ? ` (${sold.paymentMethodEtc})` : ''}`;
    }
    return sold.paymentMethod || '';
  }

  function buildSalesExport(options) {
    const soldWorks = Array.isArray(options?.soldWorks) ? options.soldWorks : [];
    const getPhotoPreviewDataUrl = typeof options?.getPhotoPreviewDataUrl === 'function'
      ? options.getPhotoPreviewDataUrl
      : () => '';
    const headers = ['번호', '사진', '제목', '작가', '가격', '판매일시', '구매자 성함', '구매자 연락처', '결제방법', '비고'];
    const headerRow = headers.map((header) => `<th style="background:#f0f0f0;font-weight:bold;border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(header)}</th>`).join('');
    const dataRows = soldWorks.map((sold) => {
      const soldPreviewDataUrl = getPhotoPreviewDataUrl(sold);
      const photoCell = soldPreviewDataUrl
        ? `<td style="border:1px solid #ccc;padding:4px;text-align:center"><img src="${soldPreviewDataUrl}" width="80" height="80" style="object-fit:contain"></td>`
        : `<td style="border:1px solid #ccc;padding:6px 10px">${escapeHtml(sold.photoName || '')}</td>`;
      const cells = [
        sold.manualNumber || '',
        null,
        sold.title || '',
        sold.author || '',
        sold.price || '',
        sold.soldAtKst || '',
        sold.buyerName || '',
        sold.buyerPhone || '',
        getPaymentDisplay(sold),
        sold.note || ''
      ];
      const tdCells = cells.map((value, index) => {
        if (index === 1) return photoCell;
        return `<td style="border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${tdCells}</tr>`;
    }).join('');
    const content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>table{border-collapse:collapse}td,th{font-family:Arial,sans-serif;font-size:12px}</style>
</head><body>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
</body></html>`;
    return {
      content,
      filename: buildFilename(options?.title, 'sales'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  function buildAccountingExport(options) {
    const exhibition = options?.exhibition || {};
    const expenseItems = Array.isArray(options?.expenseItems) ? options.expenseItems : [];
    const revenueItems = Array.isArray(options?.revenueItems) ? options.revenueItems : [];
    const formatAmount = options.formatAmount;
    const getExpenseEffectiveAmount = options.getExpenseEffectiveAmount;
    const parseAmount = options.parseAmount;
    const revenueTotals = {
      art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
      goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
    };
    const expenseRows = expenseItems.map((item) => ({
      division: item.division || '',
      amount: formatAmount(getExpenseEffectiveAmount(item, revenueTotals))
    }));
    const revenueRows = revenueItems.map((item) => ({
      division: item.division || '',
      amount: formatAmount(item.amount)
    }));
    const expenseTotal = expenseItems.reduce(
      (sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals),
      0
    );
    const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
    const profitTotal = revenueTotal - expenseTotal;
    const buildRows = (rows) => rows.map((row) => `
    <tr>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.division)}</td>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.amount)}</td>
    </tr>
  `).join('');
    const content = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; margin-bottom: 16px; width: 100%; }
        th, td { font-family: Arial, sans-serif; font-size: 12px; }
      </style>
    </head>
    <body>
      <h2>${escapeHtml(exhibition.title || '전시 회계')}</h2>
      <p>기간: ${escapeHtml((exhibition.startDate || '') + ' ~ ' + (exhibition.endDate || ''))}</p>

      <table>
        <thead>
          <tr>
            <th colspan="2" style="border:1px solid #ccc;padding:8px 10px;background:#f3f4f6;text-align:left;">지출</th>
          </tr>
          <tr>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">구분</th>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(expenseRows)}
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">합계</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAmount(expenseTotal))}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th colspan="2" style="border:1px solid #ccc;padding:8px 10px;background:#f3f4f6;text-align:left;">수입</th>
          </tr>
          <tr>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">구분</th>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(revenueRows)}
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">합계</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAmount(revenueTotal))}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">총이익</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">${escapeHtml(formatAmount(profitTotal))}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;
    return {
      content,
      filename: buildFilename(exhibition.title, 'accounting'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  function buildWorksExport(options) {
    const works = Array.isArray(options?.works) ? options.works : [];
    const rows = [
      ['번호', '사진', '제목', '작가', '가격', '재료', '크기', '연도', '분류']
    ];
    works.forEach((work) => {
      rows.push([
        work.manualNumber || '',
        work.photoName || '',
        work.title || '',
        work.author || '',
        work.price || '',
        work.materials || '',
        work.size || '',
        work.year || '',
        work.category || ''
      ]);
    });
    const sheetRows = rows.map((row) => {
      const cells = row.map((value) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    const content = `<?xml version="1.0" encoding="UTF-8"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      <Worksheet ss:Name="Sheet1">
        <Table>${sheetRows}</Table>
      </Worksheet>
    </Workbook>`;
    return {
      content,
      filename: buildFilename(options?.title, 'works'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  const api = Object.freeze({
    buildAccountingExport,
    buildFilename,
    buildSalesExport,
    buildWorksExport,
    getPaymentDisplay,
    sanitizeTitle
  });
  root.ExhibitionExportModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/snapshot-client.js */
(function initializeExhibitionSnapshotClient(root) {
  'use strict';

  async function requestJson(fetchImpl, url, options) {
    const response = await fetchImpl(url, options);
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  async function listSnapshots(options) {
    const exhibitionId = options.exhibitionId;
    const limit = options.limit || 100;
    const result = await requestJson(
      options.fetchImpl,
      `/api/exhibition-snapshots?exhibitionId=${encodeURIComponent(exhibitionId)}&limit=${encodeURIComponent(limit)}`
    );
    if (!result.response.ok || !result.payload?.ok) {
      return {
        ok: false,
        error: result.payload?.error || '스냅샷 목록을 불러오지 못했습니다.',
        snapshots: [],
        canUndo: false
      };
    }
    return {
      ok: true,
      error: '',
      snapshots: Array.isArray(result.payload.snapshots) ? result.payload.snapshots : [],
      canUndo: Boolean(result.payload.canUndo)
    };
  }

  async function postSnapshotAction(options) {
    const body = {
      action: options.action,
      exhibitionId: options.exhibitionId
    };
    if (options.snapshotId !== undefined) body.snapshotId = options.snapshotId;
    if (options.note !== undefined) body.note = options.note;
    const result = await requestJson(options.fetchImpl, '/api/exhibition-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return {
      ok: Boolean(result.response.ok && result.payload?.ok),
      error: result.payload?.error || options.defaultError
    };
  }

  function captureSnapshot(options) {
    return postSnapshotAction({
      ...options,
      action: 'capture-now',
      defaultError: '스냅샷 생성에 실패했습니다.'
    });
  }

  function restoreSnapshot(options) {
    return postSnapshotAction({
      ...options,
      action: 'restore',
      defaultError: '복원에 실패했습니다.'
    });
  }

  function undoRestore(options) {
    return postSnapshotAction({
      ...options,
      action: 'undo-restore',
      defaultError: '되돌리기에 실패했습니다.'
    });
  }

  async function fetchExhibitions(options) {
    const result = await requestJson(options.fetchImpl, '/api/state?keys=exhibitions');
    if (!result.response.ok || !result.payload?.ok || !result.payload?.data) {
      return { ok: false, exhibitions: [] };
    }
    return {
      ok: true,
      exhibitions: Array.isArray(result.payload.data.exhibitions)
        ? result.payload.data.exhibitions
        : []
    };
  }

  const api = Object.freeze({
    captureSnapshot,
    fetchExhibitions,
    listSnapshots,
    restoreSnapshot,
    undoRestore
  });
  root.ExhibitionSnapshotClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/backup-controller.js */
(function initializeExhibitionDetailBackupController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailBackupController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBackupControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const fetchImpl = options.fetchImpl;
    const snapshotClient = options.snapshotClient;
    const exhibitionsRepository = options.exhibitionsRepository;

    function getBackupExhibitionId() {
      const id = Number(state.exhibitionId || options.getCurrentExhibition()?.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      return id;
    }

    function formatBackupDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('ko-KR', { hour12: false });
    }

    async function fetchExhibitionBackupSnapshots() {
      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        state.backupError = '전시 ID를 찾을 수 없습니다.';
        return;
      }

      state.backupLoading = true;
      state.backupError = '';
      options.switchTab('exhibition-backup');

      try {
        const result = await snapshotClient.listSnapshots({
          fetchImpl,
          exhibitionId
        });
        state.backupError = result.error;
        state.backupSnapshots = result.snapshots;
        state.backupCanUndo = result.canUndo;
      } catch (error) {
        state.backupError = '네트워크 오류로 스냅샷 목록을 불러오지 못했습니다.';
        state.backupSnapshots = [];
        state.backupCanUndo = false;
      } finally {
        state.backupLoading = false;
        options.switchTab('exhibition-backup');
      }
    }

    function getBackupSnapshotRowsHtml() {
      const rows = state.backupSnapshots || [];
      if (rows.length === 0) {
        return '<tr><td colspan="6" class="no-users">저장된 전시 스냅샷이 없습니다.</td></tr>';
      }

      return rows.map((snapshot) => {
        const snapshotId = Number(snapshot.id);
        const restoredTag = snapshot.restored_at
          ? `<div style="font-size:12px;color:#2f6f3e;margin-top:4px;">복원됨: ${options.escapeHtml(formatBackupDate(snapshot.restored_at))}</div>`
          : '';

        return `
      <tr>
        <td>
          <strong>#${snapshotId}</strong>
          <div style="font-size:12px;color:#666;">${options.escapeHtml(snapshot.snapshot_type || '')}</div>
        </td>
        <td>${options.escapeHtml(String(snapshot.works_goods_count ?? 0))}</td>
        <td>${options.escapeHtml(String(snapshot.sold_items_count ?? 0))}</td>
        <td>${options.escapeHtml(formatBackupDate(snapshot.created_at))}${restoredTag}</td>
        <td>${options.escapeHtml(snapshot.note || '-')}</td>
        <td>
          <button type="button" class="action-btn approve-btn" onclick="restoreExhibitionSnapshot(${snapshotId})">restore</button>
        </td>
      </tr>
    `;
      }).join('');
    }

    function renderExhibitionBackup(container) {
      if (options.getExhibitionAccessRole() !== 'admin') {
        const fallbackTab = options.getFirstAllowedTab() || 'exhibition-info';
        options.switchTab(fallbackTab);
        return;
      }

      const loadingNotice = state.backupLoading
        ? '<p class="accounting-description">스냅샷 목록을 불러오는 중입니다...</p>'
        : '';
      const errorNotice = state.backupError
        ? `<p class="accounting-description" style="color:#b23b3b;">${options.escapeHtml(state.backupError)}</p>`
        : '';

      container.innerHTML = `
    <div class="works-sales-wrapper">
      <div class="works-sales-title">전시 백업</div>
      <p class="accounting-description">이 전시만 분리 저장된 스냅샷입니다. 잘못 복원했을 경우 되돌리기를 눌러 직전 상태로 복귀할 수 있습니다.</p>
      ${loadingNotice}
      ${errorNotice}
      <div class="works-actions" style="margin-bottom:12px;">
        <button type="button" class="works-action-btn" onclick="createManualExhibitionSnapshot()">스냅샷 생성</button>
        <button type="button" class="works-action-btn works-action-btn-secondary" onclick="fetchExhibitionBackupSnapshots()">새로고침</button>
        <button type="button" class="works-action-btn works-action-btn-secondary" onclick="undoExhibitionSnapshotRestore()" ${state.backupCanUndo ? '' : 'disabled'}>되돌리기</button>
      </div>
      <div class="works-table-wrapper expanded">
        <table class="works-table">
          <thead>
            <tr>
              <th>스냅샷</th>
              <th>목록 수 (작품+굿즈)</th>
              <th>판매 수량</th>
              <th>생성 시각</th>
              <th>메모</th>
              <th>복원</th>
            </tr>
          </thead>
          <tbody>
            ${getBackupSnapshotRowsHtml()}
          </tbody>
        </table>
      </div>
    </div>
  `;

      if (!state.backupLoading && state.backupSnapshots.length === 0 && !state.backupError) {
        fetchExhibitionBackupSnapshots();
      }
    }

    async function createManualExhibitionSnapshot() {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 스냅샷을 생성할 수 있습니다.');
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      const currentUser = options.getCurrentUser();
      const actorName = (currentUser?.name || '').toString().trim() || 'admin';
      const note = `manual backup by ${actorName}`;

      try {
        const result = await snapshotClient.captureSnapshot({
          fetchImpl,
          exhibitionId,
          note
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        options.alertImpl('스냅샷이 생성되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('스냅샷 생성 요청 중 오류가 발생했습니다.');
      }
    }

    async function refreshExhibitionStateFromServer(exhibitionId) {
      const targetId = Number(exhibitionId);
      if (!Number.isFinite(targetId) || targetId <= 0) return false;

      try {
        const result = await snapshotClient.fetchExhibitions({ fetchImpl });
        if (!result.ok) return false;
        const remoteExhibitions = result.exhibitions;
        exhibitionsRepository.saveExhibitionsSafely(remoteExhibitions);

        const index = remoteExhibitions.findIndex((item) => Number(item?.id) === targetId);
        if (index !== -1) {
          state.exhibition = remoteExhibitions[index];
        }

        return true;
      } catch (error) {
        return false;
      }
    }

    async function restoreExhibitionSnapshot(snapshotId) {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 복원할 수 있습니다.');
        return;
      }

      if (!options.confirmImpl('이 스냅샷으로 전시 데이터를 복원하시겠습니까?')) {
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      try {
        const result = await snapshotClient.restoreSnapshot({
          fetchImpl,
          exhibitionId,
          snapshotId
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        await refreshExhibitionStateFromServer(exhibitionId);

        options.alertImpl('복원이 완료되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('복원 요청 중 오류가 발생했습니다.');
      }
    }

    async function undoExhibitionSnapshotRestore() {
      if (options.getExhibitionAccessRole() !== 'admin') {
        options.alertImpl('어드민 계정만 되돌릴 수 있습니다.');
        return;
      }

      const exhibitionId = getBackupExhibitionId();
      if (!exhibitionId) {
        options.alertImpl('전시 ID를 찾을 수 없습니다.');
        return;
      }

      if (!options.confirmImpl('마지막 복원을 되돌리시겠습니까?')) {
        return;
      }

      try {
        const result = await snapshotClient.undoRestore({
          fetchImpl,
          exhibitionId
        });
        if (!result.ok) {
          options.alertImpl(result.error);
          return;
        }

        await refreshExhibitionStateFromServer(exhibitionId);

        options.alertImpl('되돌리기가 완료되었습니다.');
        await fetchExhibitionBackupSnapshots();
      } catch (error) {
        options.alertImpl('되돌리기 요청 중 오류가 발생했습니다.');
      }
    }

    void document;

    return {
      getBackupExhibitionId,
      formatBackupDate,
      fetchExhibitionBackupSnapshots,
      getBackupSnapshotRowsHtml,
      renderExhibitionBackup,
      createManualExhibitionSnapshot,
      refreshExhibitionStateFromServer,
      restoreExhibitionSnapshot,
      undoExhibitionSnapshotRestore
    };
  }

  return { create };
});

/* exhibitions/image-lifecycle.js */
(function initializeExhibitionImageLifecycle(root) {
  'use strict';

  const TRANSIENT_PHOTO_FIELDS = Object.freeze([
    'pendingPhotoDataUrl',
    'pendingPhotoPreviewDataUrl'
  ]);

  function getPhotoPreviewSource(item) {
    const pendingPreview = (item?.pendingPhotoPreviewDataUrl || '').toString().trim();
    if (pendingPreview) return pendingPreview;
    const pendingFull = (item?.pendingPhotoDataUrl || '').toString().trim();
    if (pendingFull) return pendingFull;
    const previewUrl = (item?.photoPreviewUrl || '').toString().trim();
    if (previewUrl) return previewUrl;
    const fullUrl = (item?.photoUrl || '').toString().trim();
    if (fullUrl) return fullUrl;
    return (item?.photoPreviewDataUrl || item?.photoDataUrl || '').toString().trim();
  }

  function getPhotoSource(item) {
    const pendingFull = (item?.pendingPhotoDataUrl || '').toString().trim();
    if (pendingFull) return pendingFull;
    const fullUrl = (item?.photoUrl || '').toString().trim();
    if (fullUrl) return fullUrl;
    return (item?.photoDataUrl || '').toString().trim();
  }

  function getExtensionFromMimeType(mimeType) {
    const normalized = (mimeType || '').toString().toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    return 'bin';
  }

  function buildPhotoUploadFileName(baseName, suffix, mimeType) {
    const stem = (baseName || 'work-image')
      .toString()
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const extension = getExtensionFromMimeType(mimeType);
    return `${stem || 'work-image'}-${suffix}.${extension}`;
  }

  function parseDataUrlMimeType(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
    return match ? match[1] : '';
  }

  function snapshotPhotoFields(work) {
    if (!work || typeof work !== 'object') return null;
    return {
      photoName: work.photoName || '',
      photoUrl: work.photoUrl || '',
      photoPreviewUrl: work.photoPreviewUrl || '',
      photoPath: work.photoPath || '',
      photoPreviewPath: work.photoPreviewPath || '',
      photoDataUrl: work.photoDataUrl || '',
      photoPreviewDataUrl: work.photoPreviewDataUrl || '',
      photoMimeType: work.photoMimeType || '',
      photoByteSize: Number.isFinite(work.photoByteSize) ? work.photoByteSize : 0,
      pendingPhotoDataUrl: work.pendingPhotoDataUrl || '',
      pendingPhotoPreviewDataUrl: work.pendingPhotoPreviewDataUrl || ''
    };
  }

  function applyPhotoFields(work, snapshot) {
    if (!work || typeof work !== 'object' || !snapshot) return;
    work.photoName = snapshot.photoName || '';
    work.photoUrl = snapshot.photoUrl || '';
    work.photoPreviewUrl = snapshot.photoPreviewUrl || '';
    work.photoPath = snapshot.photoPath || '';
    work.photoPreviewPath = snapshot.photoPreviewPath || '';
    work.photoDataUrl = snapshot.photoDataUrl || '';
    work.photoPreviewDataUrl = snapshot.photoPreviewDataUrl || '';
    work.photoMimeType = snapshot.photoMimeType || '';
    work.photoByteSize = Number.isFinite(snapshot.photoByteSize) ? snapshot.photoByteSize : 0;
    work.pendingPhotoDataUrl = snapshot.pendingPhotoDataUrl || '';
    work.pendingPhotoPreviewDataUrl = snapshot.pendingPhotoPreviewDataUrl || '';
  }

  function clearPendingPhotoFields(work) {
    if (!work || typeof work !== 'object') return;
    TRANSIENT_PHOTO_FIELDS.forEach((field) => {
      if (field in work) work[field] = '';
    });
  }

  function buildUploadPlan(work, options = {}) {
    const replaceExisting = options.replaceExisting !== false;
    const fullDataUrl = (options.fullDataUrl || work.pendingPhotoDataUrl || work.photoDataUrl || '').toString().trim();
    const previewDataUrl = (options.previewDataUrl || work.pendingPhotoPreviewDataUrl || work.photoPreviewDataUrl || '').toString().trim();
    if (!fullDataUrl && !previewDataUrl) return { ok: false, reason: 'missing-data-url' };

    const baseName = work.photoName || options.fileName || `work-${options.workId}`;
    const previewMimeType = parseDataUrlMimeType(previewDataUrl) || parseDataUrlMimeType(fullDataUrl) || 'image/webp';
    const fullMimeType = parseDataUrlMimeType(fullDataUrl) || previewMimeType;
    const shouldUploadPreview = Boolean(previewDataUrl) && (replaceExisting || !work.photoPreviewUrl);
    const shouldUploadFull = Boolean(fullDataUrl) && (replaceExisting || !work.photoUrl);
    return {
      ok: true,
      skipped: !shouldUploadPreview && !shouldUploadFull,
      fullDataUrl,
      previewDataUrl,
      shouldUploadPreview,
      shouldUploadFull,
      previewFileName: buildPhotoUploadFileName(baseName, 'preview', previewMimeType),
      fullFileName: buildPhotoUploadFileName(baseName, 'full', fullMimeType)
    };
  }

  function applyUploadedPhotoFields(work, uploads) {
    let changed = false;
    if (uploads.previewUpload?.url) {
      work.photoPreviewUrl = uploads.previewUpload.url;
      work.photoPreviewPath = uploads.previewUpload.pathname || '';
      changed = true;
    }
    if (uploads.fullUpload?.url) {
      work.photoUrl = uploads.fullUpload.url;
      work.photoPath = uploads.fullUpload.pathname || '';
      changed = true;
    }
    if (work.photoPreviewDataUrl || work.photoDataUrl || work.pendingPhotoPreviewDataUrl || work.pendingPhotoDataUrl) {
      work.photoPreviewDataUrl = '';
      work.photoDataUrl = '';
      clearPendingPhotoFields(work);
      changed = true;
    }
    return changed;
  }

  async function verifyUploadedImage(options) {
    const url = (options.uploadedFile?.url || '').toString().trim();
    if (!url) return { ok: false, status: 0, contentType: '', isImage: false };
    try {
      const response = await options.fetchImpl(url, { method: 'GET' });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      return {
        ok: response.ok && contentType.startsWith('image/'),
        status: response.status,
        contentType,
        isImage: contentType.startsWith('image/')
      };
    } catch (error) {
      return { ok: false, status: 0, contentType: '', isImage: false };
    }
  }

  async function uploadImageDataUrl(options) {
    const source = (options.dataUrl || '').toString().trim();
    if (!source || !options.canUpload) return null;
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 1;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await options.fetchImpl(options.endpoint || '/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: source, filename: options.fileName })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload?.file?.url) {
          throw new Error(payload?.error || 'upload-failed');
        }
        return payload.file;
      } catch (error) {
        if (attempt === maxRetries) return null;
      }
    }
    return null;
  }

  const api = Object.freeze({
    applyPhotoFields,
    applyUploadedPhotoFields,
    buildPhotoUploadFileName,
    buildUploadPlan,
    clearPendingPhotoFields,
    getPhotoPreviewSource,
    getPhotoSource,
    parseDataUrlMimeType,
    snapshotPhotoFields,
    uploadImageDataUrl,
    verifyUploadedImage
  });
  root.ExhibitionImageLifecycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/certificate-model.js */
(function initializeExhibitionCertificateModel(root) {
  'use strict';

  const EMU_PER_PIXEL = 9525;

  function getSourceArtwork(exhibition, sold) {
    const artWorks = Array.isArray(exhibition?.artWorks)
      ? exhibition.artWorks
      : (Array.isArray(exhibition?.works) ? exhibition.works : []);
    return artWorks.find((work) => work.id === sold?.workId) || null;
  }

  function hasGeneratedCertificate(sold) {
    return Boolean(sold && sold.certificateReady === true && sold.certificateVersion === 2);
  }

  function normalizeCertificateDateText(soldAtKst) {
    const text = (soldAtKst || '').toString().trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return text;
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  function safeCertificateFileName(baseTitle) {
    const clean = String(baseTitle || '작품').replace(/[\\/:*?"<>|]/g, '_').trim() || '작품';
    return `${clean}-보증서.xlsx`;
  }

  function buildAllCertificatesFileName(exhibition) {
    const exhibitionName = (exhibition?.title || exhibition?.name || '전시').toString().trim() || '전시';
    return `${exhibitionName.replace(/[\\/:*?"<>|]/g, '_')}-모든보증서.xlsx`;
  }

  function normalizeArtistNameKey(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function getArtistInstagram(artistInstagramMap, sold, work) {
    const map = artistInstagramMap || {};
    const author = (work?.author || sold?.author || '').toString().trim();
    if (!author) return '';
    const direct = (map[author] || '').toString().trim();
    if (direct) return direct;
    const normalizedAuthor = normalizeArtistNameKey(author);
    const fallbackKey = Object.keys(map).find(
      (name) => normalizeArtistNameKey(name) === normalizedAuthor
    );
    return fallbackKey ? (map[fallbackKey] || '').toString().trim() : '';
  }

  function buildCertificateFields(sold, work, artistInstagram) {
    return {
      artist: (work?.author || sold?.author || '').toString(),
      title: (work?.title || sold?.title || '').toString(),
      materials: (work?.materials || '').toString(),
      size: (work?.size || '').toString(),
      year: (work?.year || '').toString(),
      edition: '',
      soldDate: normalizeCertificateDateText(sold?.soldAtKst || ''),
      photoText: (work?.photoName || sold?.photoName || '').toString(),
      artistInstagram: (artistInstagram || '').toString().trim()
    };
  }

  function excelColumnWidthToPixels(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth) || numericWidth <= 0) return 64;
    return Math.floor(((256 * numericWidth + Math.floor(128 / 7)) / 256) * 7);
  }

  function excelRowHeightToPixels(heightPt) {
    const numericHeight = Number(heightPt);
    if (!Number.isFinite(numericHeight) || numericHeight <= 0) return 20;
    return Math.floor(numericHeight * 96 / 72);
  }

  function parseWorksheetMetrics(sheetXml) {
    const defaultColWidthMatch = sheetXml.match(/defaultColWidth="([\d.]+)"/);
    const defaultRowHeightMatch = sheetXml.match(/defaultRowHeight="([\d.]+)"/);
    const defaultColWidth = Number(defaultColWidthMatch?.[1] || 8.43);
    const defaultRowHeight = Number(defaultRowHeightMatch?.[1] || 15);
    const colRanges = [];
    const colTagMatches = sheetXml.match(/<col\b[^>]*\/>/g) || [];
    colTagMatches.forEach((tag) => {
      const min = Number((tag.match(/\bmin="(\d+)"/) || [])[1] || 0);
      const max = Number((tag.match(/\bmax="(\d+)"/) || [])[1] || 0);
      const width = Number((tag.match(/\bwidth="([\d.]+)"/) || [])[1] || defaultColWidth);
      if (min && max) colRanges.push({ min, max, width });
    });
    const rowHeightByIndex = new Map();
    const rowTagRegex = /<row\b([^>]*)>/g;
    let rowMatch;
    while ((rowMatch = rowTagRegex.exec(sheetXml))) {
      const attributes = rowMatch[1] || '';
      const rowNumber = Number((attributes.match(/\br="(\d+)"/) || [])[1] || 0);
      const rowHeight = Number((attributes.match(/\bht="([\d.]+)"/) || [])[1] || 0);
      if (rowNumber && Number.isFinite(rowHeight) && rowHeight > 0) {
        rowHeightByIndex.set(rowNumber - 1, rowHeight);
      }
    }
    return {
      getColumnWidthPx(colIndexZeroBased) {
        const colIndex1Based = colIndexZeroBased + 1;
        const matched = colRanges.find(
          (range) => colIndex1Based >= range.min && colIndex1Based <= range.max
        );
        return excelColumnWidthToPixels(matched ? matched.width : defaultColWidth);
      },
      getRowHeightPx(rowIndexZeroBased) {
        return excelRowHeightToPixels(rowHeightByIndex.get(rowIndexZeroBased) || defaultRowHeight);
      }
    };
  }

  function sumAxisPixels(startIndex, endExclusive, sizeFn) {
    let sum = 0;
    for (let index = startIndex; index < endExclusive; index += 1) sum += sizeFn(index);
    return sum;
  }

  function positionPxToCellOffset(startIndex, endExclusive, positionPx, sizeFn) {
    const totalPx = sumAxisPixels(startIndex, endExclusive, sizeFn);
    if (positionPx <= 0) return { index: startIndex, offsetPx: 0 };
    if (positionPx >= totalPx) return { index: endExclusive, offsetPx: 0 };
    let remaining = positionPx;
    for (let index = startIndex; index < endExclusive; index += 1) {
      const segment = sizeFn(index);
      if (remaining < segment) return { index, offsetPx: remaining };
      remaining -= segment;
    }
    return { index: endExclusive, offsetPx: 0 };
  }

  function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
    const bounds = { fromCol: 2, toCol: 7, fromRow: 4 + rowOffset, toRow: 22 + rowOffset };
    const boxWidthPx = sumAxisPixels(bounds.fromCol, bounds.toCol, metrics.getColumnWidthPx);
    const boxHeightPx = sumAxisPixels(bounds.fromRow, bounds.toRow, metrics.getRowHeightPx);
    const safeImageWidth = Math.max(1, Number(imageWidthPx) || 1);
    const safeImageHeight = Math.max(1, Number(imageHeightPx) || 1);
    const imageRatio = safeImageWidth / safeImageHeight;
    const boxRatio = boxWidthPx / boxHeightPx;
    const fittedWidthPx = imageRatio > boxRatio ? boxWidthPx : boxHeightPx * imageRatio;
    const fittedHeightPx = imageRatio > boxRatio ? boxWidthPx / imageRatio : boxHeightPx;
    const startXPx = (boxWidthPx - fittedWidthPx) / 2;
    const startYPx = (boxHeightPx - fittedHeightPx) / 2;
    const fromX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, startXPx, metrics.getColumnWidthPx);
    const toX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, startXPx + fittedWidthPx, metrics.getColumnWidthPx);
    const fromY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, startYPx, metrics.getRowHeightPx);
    const toY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, startYPx + fittedHeightPx, metrics.getRowHeightPx);
    return {
      fromCol: fromX.index,
      fromColOff: Math.round(fromX.offsetPx * EMU_PER_PIXEL),
      toCol: toX.index,
      toColOff: Math.round(toX.offsetPx * EMU_PER_PIXEL),
      fromRow: fromY.index,
      fromRowOff: Math.round(fromY.offsetPx * EMU_PER_PIXEL),
      toRow: toY.index,
      toRowOff: Math.round(toY.offsetPx * EMU_PER_PIXEL)
    };
  }

  const api = Object.freeze({
    buildAllCertificatesFileName,
    buildCertificateFields,
    computeContainedImageAnchor,
    getArtistInstagram,
    getSourceArtwork,
    hasGeneratedCertificate,
    normalizeCertificateDateText,
    parseWorksheetMetrics,
    safeCertificateFileName
  });
  root.ExhibitionCertificateModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/certificate-controller.js */
(function initializeExhibitionDetailCertificateController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailCertificateController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCertificateControllerModule() {
  'use strict';

  const CERT_TEMPLATE_PATHS = [
    'Templates/certificate-template.xlsx',
    'Templates/작품보증서%20양식.xlsx'
  ];
  const CERTIFICATE_BLOCK_START_ROW = 2;
  const CERTIFICATE_BLOCK_END_ROW = 45;
  const CERTIFICATE_BLOCK_HEIGHT = CERTIFICATE_BLOCK_END_ROW - CERTIFICATE_BLOCK_START_ROW + 1;

  function create(options) {
    let certTemplateArrayBufferPromise = null;

    function getModel() {
      const model = options.getExhibitionCertificateModel?.() || options.ExhibitionCertificateModel;
      if (!model) throw new Error('ExhibitionCertificateModel is unavailable.');
      return model;
    }

    function getImageLifecycle() {
      const imageLifecycle = options.getExhibitionImageLifecycle?.() || options.ExhibitionImageLifecycle;
      if (!imageLifecycle) throw new Error('ExhibitionImageLifecycle is unavailable.');
      return imageLifecycle;
    }

    function getJSZip() {
      return options.getJSZip();
    }

    function getXlsxPopulate() {
      return options.getXlsxPopulate();
    }

    async function ensureCertificateLibraries() {
      if (typeof options.ensureCertificateLibraries === 'function') {
        await options.ensureCertificateLibraries();
      }
    }

    async function fetchCertificateTemplateArrayBuffer() {
      const failures = [];

      for (const path of CERT_TEMPLATE_PATHS) {
        try {
          const response = await options.fetch(path);
          if (!response.ok) {
            failures.push(`${path} (${response.status})`);
            continue;
          }
          return response.arrayBuffer();
        } catch (error) {
          failures.push(`${path} (network error)`);
        }
      }

      throw new Error(`template fetch failed: ${failures.join(', ')}`);
    }

    function getCertificateTemplateArrayBuffer() {
      if (!certTemplateArrayBufferPromise) {
        certTemplateArrayBufferPromise = fetchCertificateTemplateArrayBuffer().catch((error) => {
          certTemplateArrayBufferPromise = null;
          throw error;
        });
      }
      return certTemplateArrayBufferPromise;
    }

    function getSourceArtworkForSold(sold) {
      return options.getSourceArtworkForSold(sold);
    }

    function hasGeneratedCertificate(sold) {
      return getModel().hasGeneratedCertificate(sold);
    }

    function normalizeCertificateDateText(soldAtKst) {
      return getModel().normalizeCertificateDateText(soldAtKst);
    }

    function safeCertificateFileName(baseTitle) {
      return getModel().safeCertificateFileName(baseTitle);
    }

    function getCertificateImageDataUrl(sold, work) {
      const imageLifecycle = getImageLifecycle();
      return imageLifecycle.getPhotoPreviewSource(work)
        || imageLifecycle.getPhotoSource(work)
        || imageLifecycle.getPhotoPreviewSource(sold)
        || imageLifecycle.getPhotoSource(sold);
    }

    function dataUrlToUint8Array(dataUrl) {
      const base64 = String(dataUrl || '').split(',')[1] || '';
      const binary = options.atob(base64);
      const bytes = new options.Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    function blobToUint8Array(blob) {
      return new Promise((resolve, reject) => {
        const reader = new options.FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (!(result instanceof options.ArrayBuffer)) {
            reject(new Error('Failed to read blob as ArrayBuffer.'));
            return;
          }
          resolve(new options.Uint8Array(result));
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob data.'));
        reader.readAsArrayBuffer(blob);
      });
    }

    function canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      });
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new options.FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Failed to read artwork image blob.'));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read artwork image blob.'));
        reader.readAsDataURL(blob);
      });
    }

    async function resolveCertificateImageDataUrl(imageSource) {
      const source = (imageSource || '').toString().trim();
      if (!source) {
        throw new Error('Missing artwork image source.');
      }
      if (!/^https?:\/\//i.test(source)) {
        return source;
      }

      const response = await options.fetch(source, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'default'
      });
      if (!response.ok) {
        throw new Error(`Artwork image fetch failed (${response.status}).`);
      }

      return blobToDataUrl(await response.blob());
    }

    async function buildCertificatePngBytesFromDataUrl(imageDataUrl) {
      const source = await resolveCertificateImageDataUrl(imageDataUrl);
      const image = await options.loadImageElement(source);
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) {
        throw new Error('Invalid artwork image dimensions.');
      }

      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = options.document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas 2D context is unavailable.');
      }
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToBlob(canvas, 'image/png', 0.92);
      if (blob) {
        return {
          bytes: await blobToUint8Array(blob),
          width: targetWidth,
          height: targetHeight
        };
      }

      const pngDataUrl = canvas.toDataURL('image/png');
      return {
        bytes: dataUrlToUint8Array(pngDataUrl),
        width: targetWidth,
        height: targetHeight
      };
    }

    function parseWorksheetMetrics(sheetXml) {
      return getModel().parseWorksheetMetrics(sheetXml);
    }

    function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
      return getModel().computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset);
    }

    function removeXmlAttribute(tag, attrName) {
      const attrRegex = new RegExp(`\\s${attrName}="[^"]*"`, 'g');
      return tag.replace(attrRegex, '');
    }

    function setOrReplaceXmlAttribute(tag, attrName, attrValue) {
      const attrRegex = new RegExp(`\\s${attrName}="[^"]*"`);
      if (attrRegex.test(tag)) {
        return tag.replace(attrRegex, ` ${attrName}="${attrValue}"`);
      }
      return tag.replace(/\/>$/, ` ${attrName}="${attrValue}"/>`);
    }

    function enforceWorksheetPageSetupXml(sheetXml, pageOptions = {}) {
      if (!sheetXml) return sheetXml;
      let nextXml = sheetXml;
      const fitToWidth = String(pageOptions.fitToWidth ?? 1);
      const fitToHeight = String(pageOptions.fitToHeight ?? 1);
      const fitToPage = String(pageOptions.fitToPage ?? 1);
      const sheetPrOpenCloseRegex = /<sheetPr\b([^>]*)>([\s\S]*?)<\/sheetPr>/;
      const sheetPrSelfClosingRegex = /<sheetPr\b([^>]*)\/>/;

      if (sheetPrOpenCloseRegex.test(nextXml)) {
        nextXml = nextXml.replace(sheetPrOpenCloseRegex, (full, attrs, body) => {
          const cleanBody = /<pageSetUpPr\b[^>]*\/>/.test(body)
            ? body.replace(/<pageSetUpPr\b[^>]*\/>/, `<pageSetUpPr fitToPage="${fitToPage}"/>`)
            : `${body}<pageSetUpPr fitToPage="${fitToPage}"/>`;
          return `<sheetPr${attrs}>${cleanBody}</sheetPr>`;
        });
      } else if (sheetPrSelfClosingRegex.test(nextXml)) {
        nextXml = nextXml.replace(sheetPrSelfClosingRegex, `<sheetPr$1><pageSetUpPr fitToPage="${fitToPage}"/></sheetPr>`);
      } else {
        nextXml = nextXml.replace(/(<worksheet\b[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="${fitToPage}"/></sheetPr>`);
      }

      const pageSetupRegex = /<pageSetup\b[^>]*\/>/;
      if (pageSetupRegex.test(nextXml)) {
        nextXml = nextXml.replace(pageSetupRegex, (tag) => {
          let updated = removeXmlAttribute(tag, 'scale');
          updated = setOrReplaceXmlAttribute(updated, 'orientation', 'portrait');
          updated = setOrReplaceXmlAttribute(updated, 'fitToWidth', fitToWidth);
          updated = setOrReplaceXmlAttribute(updated, 'fitToHeight', fitToHeight);
          return updated;
        });
      } else {
        const pageSetupTag = `<pageSetup paperSize="9" orientation="portrait" fitToWidth="${fitToWidth}" fitToHeight="${fitToHeight}"/>`;
        if (nextXml.includes('<headerFooter>')) {
          nextXml = nextXml.replace('<headerFooter>', `${pageSetupTag}<headerFooter>`);
        } else if (nextXml.includes('<drawing ')) {
          nextXml = nextXml.replace(/<drawing\b/, `${pageSetupTag}<drawing`);
        } else {
          nextXml = nextXml.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
        }
      }
      return nextXml;
    }

    function buildWorkbookPrintAreaFormula(workbookXml, endRow = CERTIFICATE_BLOCK_END_ROW) {
      const sheetNameMatch = workbookXml.match(/<sheet\b[^>]*\bname="([^"]+)"/);
      const sheetName = (sheetNameMatch?.[1] || 'Sheet1').replace(/'/g, "''");
      const safeEndRow = Math.max(CERTIFICATE_BLOCK_END_ROW, Number(endRow) || CERTIFICATE_BLOCK_END_ROW);
      return `'${sheetName}'!$A$${CERTIFICATE_BLOCK_START_ROW}:$I$${safeEndRow}`;
    }

    function upsertWorkbookPrintArea(workbookXml, printAreaFormula) {
      if (!workbookXml) return workbookXml;
      const printAreaTag = `<definedName name="_xlnm.Print_Area" localSheetId="0">${printAreaFormula}</definedName>`;
      const printAreaRegex = /<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[\s\S]*?<\/definedName>/;
      if (printAreaRegex.test(workbookXml)) return workbookXml.replace(printAreaRegex, printAreaTag);
      if (workbookXml.includes('<definedNames>')) return workbookXml.replace('</definedNames>', `${printAreaTag}</definedNames>`);
      if (workbookXml.includes('</sheets>')) return workbookXml.replace('</sheets>', `</sheets><definedNames>${printAreaTag}</definedNames>`);
      if (workbookXml.includes('<calcPr')) return workbookXml.replace('<calcPr', `<definedNames>${printAreaTag}</definedNames><calcPr`);
      return workbookXml.replace('</workbook>', `<definedNames>${printAreaTag}</definedNames></workbook>`);
    }

    function buildArtworkAnchorXml(imageAnchor, picId, relId) {
      return `
<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>${imageAnchor.fromCol}</xdr:col><xdr:colOff>${imageAnchor.fromColOff}</xdr:colOff><xdr:row>${imageAnchor.fromRow}</xdr:row><xdr:rowOff>${imageAnchor.fromRowOff}</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${imageAnchor.toCol}</xdr:col><xdr:colOff>${imageAnchor.toColOff}</xdr:colOff><xdr:row>${imageAnchor.toRow}</xdr:row><xdr:rowOff>${imageAnchor.toRowOff}</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="${picId}" name="Artwork ${picId}"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}" cstate="print"/>
      <a:stretch><a:fillRect/></a:stretch>
    </xdr:blipFill>
    <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`;
    }

    async function applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl) {
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is unavailable');
      const zip = await JSZip.loadAsync(workbookBlob);
      const pngImage = await buildCertificatePngBytesFromDataUrl(imageDataUrl);
      const drawingPath = 'xl/drawings/drawing1.xml';
      const drawingRelsPath = 'xl/drawings/_rels/drawing1.xml.rels';
      const sheetPath = 'xl/worksheets/sheet1.xml';
      const workbookPath = 'xl/workbook.xml';
      const drawingFile = zip.file(drawingPath);
      const drawingRelsFile = zip.file(drawingRelsPath);
      const sheetFile = zip.file(sheetPath);
      const workbookFile = zip.file(workbookPath);
      if (!drawingFile || !drawingRelsFile) throw new Error('Template drawing files were not found.');

      const drawingXml = await drawingFile.async('string');
      const drawingRelsXml = await drawingRelsFile.async('string');
      const sheetXml = sheetFile ? await sheetFile.async('string') : '';
      const workbookXml = workbookFile ? await workbookFile.async('string') : '';
      const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((match) => Number(match[1]) || 0);
      const nextRelId = `rId${relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1}`;
      const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      const nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      zip.file('xl/media/certificate-artwork.png', pngImage.bytes);
      const insertedRel = `<Relationship Id="${nextRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork.png"/>`;
      const newDrawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);
      const defaultAnchor = { fromCol: 2, fromColOff: 0, fromRow: 4, fromRowOff: 0, toCol: 7, toColOff: 0, toRow: 22, toRowOff: 0 };
      const imageAnchor = sheetXml
        ? computeContainedImageAnchor(parseWorksheetMetrics(sheetXml), pngImage.width, pngImage.height)
        : defaultAnchor;
      const artworkAnchor = buildArtworkAnchorXml(imageAnchor, nextPicId, nextRelId);
      const newDrawingXml = drawingXml.replace('</xdr:wsDr>', `${artworkAnchor}</xdr:wsDr>`);
      const newSheetXml = enforceWorksheetPageSetupXml(sheetXml, { fitToWidth: 1, fitToHeight: 1, fitToPage: 1 });
      const newWorkbookXml = upsertWorkbookPrintArea(workbookXml, buildWorkbookPrintAreaFormula(workbookXml));
      zip.file(drawingRelsPath, newDrawingRelsXml);
      zip.file(drawingPath, newDrawingXml);
      if (sheetFile) zip.file(sheetPath, newSheetXml);
      if (workbookFile) zip.file(workbookPath, newWorkbookXml);
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    function downloadBlobFile(blob, fileName) {
      const url = options.URL.createObjectURL(blob);
      const link = options.document.createElement('a');
      link.href = url;
      link.download = fileName;
      options.document.body.appendChild(link);
      link.click();
      link.remove();
      options.URL.revokeObjectURL(url);
    }

    function getArtistInstagramForCertificate(sold, work) {
      const exhibition = options.ensureExhibitionInfoData();
      return getModel().getArtistInstagram(exhibition.artistInstagramMap, sold, work);
    }

    function escapeXmlText(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    async function applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, instagramTag) {
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') return workbookBlob;
      const placeholder = 'instagram_handle_name';
      const replacement = escapeXmlText((instagramTag || '').toString().trim());
      const zip = await JSZip.loadAsync(workbookBlob);
      let changed = false;
      for (const path of ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']) {
        const file = zip.file(path);
        if (!file) continue;
        const xml = await file.async('text');
        const replacedXml = xml.split(placeholder).join(replacement);
        if (replacedXml !== xml) {
          zip.file(path, replacedXml);
          changed = true;
        }
      }
      if (!changed) return workbookBlob;
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    function applyCertificateArtistInstagram(sheet, instagramTag) {
      const value = (instagramTag || '').toString().trim();
      if (!sheet) return;
      const placeholder = 'instagram_handle_name';
      let applied = false;
      ['A45', 'B45', 'C45'].forEach((address) => {
        try {
          const cell = sheet.cell(address);
          const raw = cell.value();
          const text = raw == null ? '' : String(raw);
          if (!text.includes(placeholder)) return;
          cell.value(text.split(placeholder).join(value));
          applied = true;
        } catch (error) {
          // Ignore per-cell failures and continue.
        }
      });
      if (applied) return;
      const labelRegex = /(인스타|instagram|insta|sns)/i;
      try {
        const usedRange = sheet.usedRange();
        if (usedRange) {
          const startCell = usedRange.startCell();
          const values = usedRange.value();
          if (Array.isArray(values)) {
            for (let rowIndex = 0; rowIndex < values.length && !applied; rowIndex += 1) {
              const row = values[rowIndex];
              if (!Array.isArray(row)) continue;
              for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
                const text = (row[columnIndex] == null ? '' : String(row[columnIndex])).trim();
                if (!labelRegex.test(text)) continue;
                sheet.cell(startCell.rowNumber() + rowIndex, startCell.columnNumber() + columnIndex + 1).value(value);
                applied = true;
                break;
              }
            }
          }
        }
      } catch (error) {
        applied = false;
      }
      if (!applied) sheet.cell('F36').value(value);
    }

    async function buildCertificateWorkbookBlob(sold, work) {
      await ensureCertificateLibraries();
      const XlsxPopulate = getXlsxPopulate();
      if (typeof XlsxPopulate === 'undefined') throw new Error('XlsxPopulate is unavailable');
      const templateBuffer = await getCertificateTemplateArrayBuffer();
      const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
      const sheet = workbook.sheet(0);
      const fields = getModel().buildCertificateFields(sold, work, getArtistInstagramForCertificate(sold, work));
      sheet.cell('F24').value(fields.artist);
      sheet.cell('F26').value(fields.title);
      sheet.cell('F28').value(fields.materials);
      sheet.cell('F30').value(fields.size);
      sheet.cell('F32').value(fields.year);
      sheet.cell('F34').value(fields.edition);
      if (fields.soldDate) sheet.cell('B3').value(`Date ${fields.soldDate}`);
      if (fields.photoText) sheet.cell('C22').value('');
      let workbookBlob = await workbook.outputAsync();
      workbookBlob = await applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, fields.artistInstagram);
      const imageDataUrl = getCertificateImageDataUrl(sold, work);
      if (!imageDataUrl) throw new Error('Artwork image not found for certificate.');
      return applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl);
    }

    function buildAllCertificatesDownloadFileName() {
      return getModel().buildAllCertificatesFileName(options.getCurrentExhibition());
    }

    function upsertWorksheetRowBreaksXml(sheetXml, breakRows) {
      if (!sheetXml) return sheetXml;
      let nextXml = sheetXml
        .replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/g, '')
        .replace(/<rowBreaks\b[^>]*\/>/g, '');
      const rows = Array.isArray(breakRows)
        ? breakRows.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      if (rows.length === 0) return nextXml;
      const uniqueRows = Array.from(new Set(rows)).sort((a, b) => a - b);
      const breaksBody = uniqueRows.map((row) => `<brk id="${Math.round(row)}" max="16383" man="1"/>`).join('');
      const rowBreaksTag = `<rowBreaks count="${uniqueRows.length}" manualBreakCount="${uniqueRows.length}">${breaksBody}</rowBreaks>`;
      if (nextXml.includes('<drawing ')) return nextXml.replace(/<drawing\b/, `${rowBreaksTag}<drawing`);
      if (nextXml.includes('</worksheet>')) return nextXml.replace('</worksheet>', `${rowBreaksTag}</worksheet>`);
      return nextXml;
    }

    function parseXmlDocumentOrThrow(xmlText, label) {
      const parser = new options.DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const parseErrors = xmlDoc.getElementsByTagName('parsererror');
      if (parseErrors && parseErrors.length > 0) throw new Error(`Failed to parse ${label || 'XML'}.`);
      return xmlDoc;
    }

    function getElementsByLocalName(node, localName) {
      if (!node) return [];
      return Array.from(node.getElementsByTagNameNS('*', localName));
    }

    function splitCellReference(cellRef) {
      const match = String(cellRef || '').trim().match(/^([A-Z]+)(\d+)$/);
      if (!match) return null;
      return { column: match[1], row: Number(match[2]) };
    }

    function shiftCellReferenceRow(cellRef, rowOffset) {
      const parsed = splitCellReference(cellRef);
      if (!parsed) return cellRef;
      return `${parsed.column}${parsed.row + Number(rowOffset || 0)}`;
    }

    function shiftRangeReferenceRows(rangeRef, rowOffset) {
      return String(rangeRef || '').replace(/([A-Z]+)(\d+)/g, (full, col, row) => `${col}${Number(row) + Number(rowOffset || 0)}`);
    }

    function setSheetCellInlineText(cellElement, textValue, xmlDoc) {
      if (!cellElement || !xmlDoc) return;
      while (cellElement.firstChild) cellElement.removeChild(cellElement.firstChild);
      cellElement.setAttribute('t', 'inlineStr');
      const mainNs = xmlDoc.documentElement ? xmlDoc.documentElement.namespaceURI : null;
      const inlineStringNode = xmlDoc.createElementNS(mainNs, 'is');
      const textNode = xmlDoc.createElementNS(mainNs, 't');
      const text = String(textValue == null ? '' : textValue);
      if (/^\s|\s$/.test(text) || text.includes('\n')) textNode.setAttribute('xml:space', 'preserve');
      textNode.textContent = text;
      inlineStringNode.appendChild(textNode);
      cellElement.appendChild(inlineStringNode);
    }

    function getDrawingAnchorFromRowIndex(anchorXml) {
      const match = String(anchorXml || '').match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>/);
      if (!match) return null;
      const rowIndex = Number(match[1]);
      return Number.isFinite(rowIndex) ? rowIndex : null;
    }

    function shiftDrawingAnchorRows(anchorXml, rowOffset) {
      const offset = Number(rowOffset || 0);
      if (!offset) return anchorXml;
      return String(anchorXml || '')
        .replace(/(<xdr:from>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:from>)/,
          (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`)
        .replace(/(<xdr:to>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:to>)/,
          (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`);
    }

    function duplicateTemplateDrawingAnchorsForPages(drawingXml, pageCount) {
      const totalPages = Number(pageCount || 0);
      if (totalPages <= 1 || !drawingXml) return drawingXml;
      const anchorBlocks = Array.from(String(drawingXml).matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)).map((match) => match[0]);
      if (anchorBlocks.length === 0) return drawingXml;
      const templateAnchors = anchorBlocks.filter((anchorXml) => {
        const fromRow = getDrawingAnchorFromRowIndex(anchorXml);
        return Number.isFinite(fromRow) && fromRow >= CERTIFICATE_BLOCK_START_ROW - 1 && fromRow <= CERTIFICATE_BLOCK_END_ROW - 1;
      });
      if (templateAnchors.length === 0) return drawingXml;
      const picIdNumbers = Array.from(String(drawingXml).matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      let insertedAnchorsXml = '';
      for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateAnchors.forEach((anchorXml) => {
          let shifted = shiftDrawingAnchorRows(anchorXml, rowOffset);
          shifted = shifted.replace(/(<xdr:cNvPr\b[^>]*\bid=")(\d+)(")/, (full, prefix, id, suffix) => {
            const replacement = `${prefix}${nextPicId}${suffix}`;
            nextPicId += 1;
            return replacement;
          });
          insertedAnchorsXml += shifted;
        });
      }
      if (!insertedAnchorsXml) return drawingXml;
      return String(drawingXml).replace('</xdr:wsDr>', `${insertedAnchorsXml}</xdr:wsDr>`);
    }

    function parseSharedStringsText(sharedStringsXml) {
      if (!sharedStringsXml) return [];
      const doc = parseXmlDocumentOrThrow(sharedStringsXml, 'sharedStrings.xml');
      return getElementsByLocalName(doc, 'si').map((siNode) =>
        getElementsByLocalName(siNode, 't').map((node) => node.textContent || '').join(''));
    }

    function getTemplateInstagramPattern(sheetDoc, sharedStringsXml) {
      const sharedTexts = parseSharedStringsText(sharedStringsXml);
      const instagramCell = getElementsByLocalName(sheetDoc, 'c').find((cell) => (cell.getAttribute('r') || '') === 'A45');
      if (!instagramCell) return 'instagram_handle_name';
      const valueNode = getElementsByLocalName(instagramCell, 'v')[0];
      const type = (instagramCell.getAttribute('t') || '').toLowerCase();
      if (type === 's' && valueNode) {
        const sharedText = sharedTexts[Number(valueNode.textContent || 0)] || '';
        if (sharedText.includes('instagram_handle_name')) return sharedText;
      }
      return 'instagram_handle_name';
    }

    function setInlineCellValueByRef(cellMap, ref, value, xmlDoc) {
      const cellElement = cellMap.get(ref);
      if (cellElement) setSheetCellInlineText(cellElement, value, xmlDoc);
    }

    async function buildAllCertificatesWorkbookBlob(entries) {
      await ensureCertificateLibraries();
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is unavailable');
      const certificateEntries = Array.isArray(entries) ? entries : [];
      if (certificateEntries.length === 0) throw new Error('No generated certificates to export.');
      const zip = await JSZip.loadAsync(await getCertificateTemplateArrayBuffer());
      const sheetPath = 'xl/worksheets/sheet1.xml';
      const workbookPath = 'xl/workbook.xml';
      const sharedStringsPath = 'xl/sharedStrings.xml';
      const drawingPath = 'xl/drawings/drawing1.xml';
      const drawingRelsPath = 'xl/drawings/_rels/drawing1.xml.rels';
      const sheetFile = zip.file(sheetPath);
      const workbookFile = zip.file(workbookPath);
      const drawingFile = zip.file(drawingPath);
      const drawingRelsFile = zip.file(drawingRelsPath);
      if (!sheetFile || !workbookFile || !drawingFile || !drawingRelsFile) {
        throw new Error('Template files are incomplete for certificate export.');
      }
      const sourceSheetXml = await sheetFile.async('text');
      const workbookXml = await workbookFile.async('text');
      const sharedStringsFile = zip.file(sharedStringsPath);
      const sharedStringsXml = sharedStringsFile ? await sharedStringsFile.async('text') : '';
      let drawingXml = await drawingFile.async('text');
      let drawingRelsXml = await drawingRelsFile.async('text');
      const sheetDoc = parseXmlDocumentOrThrow(sourceSheetXml, 'sheet1.xml');
      const sheetData = getElementsByLocalName(sheetDoc, 'sheetData')[0];
      if (!sheetData) throw new Error('Template sheetData was not found.');
      const templateRows = getElementsByLocalName(sheetData, 'row')
        .filter((rowElement) => {
          const rowIndex = Number(rowElement.getAttribute('r') || 0);
          return rowIndex >= CERTIFICATE_BLOCK_START_ROW && rowIndex <= CERTIFICATE_BLOCK_END_ROW;
        })
        .map((rowElement) => rowElement.cloneNode(true));
      if (templateRows.length === 0) throw new Error('Template certificate row block was not found.');
      const mergeCellsNode = getElementsByLocalName(sheetDoc, 'mergeCells')[0] || null;
      const templateMergeRefs = mergeCellsNode
        ? getElementsByLocalName(mergeCellsNode, 'mergeCell').map((node) => (node.getAttribute('ref') || '').trim()).filter(Boolean)
        : [];
      while (sheetData.firstChild) sheetData.removeChild(sheetData.firstChild);
      const cellMap = new Map();
      certificateEntries.forEach((entry, pageIndex) => {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateRows.forEach((templateRow) => {
          const rowClone = templateRow.cloneNode(true);
          rowClone.setAttribute('r', String(Number(rowClone.getAttribute('r') || 0) + rowOffset));
          getElementsByLocalName(rowClone, 'c').forEach((cell) => {
            const originalRef = cell.getAttribute('r') || '';
            if (!originalRef) return;
            const shiftedRef = shiftCellReferenceRow(originalRef, rowOffset);
            cell.setAttribute('r', shiftedRef);
            cellMap.set(shiftedRef, cell);
          });
          sheetData.appendChild(rowClone);
        });
      });
      const sheetRoot = sheetDoc.documentElement;
      const sheetMainNs = sheetRoot ? sheetRoot.namespaceURI : null;
      let resolvedMergeCellsNode = mergeCellsNode;
      if (!resolvedMergeCellsNode) {
        resolvedMergeCellsNode = sheetDoc.createElementNS(sheetMainNs, 'mergeCells');
        if (sheetData.nextSibling) sheetData.parentNode.insertBefore(resolvedMergeCellsNode, sheetData.nextSibling);
        else sheetData.parentNode.appendChild(resolvedMergeCellsNode);
      }
      while (resolvedMergeCellsNode.firstChild) resolvedMergeCellsNode.removeChild(resolvedMergeCellsNode.firstChild);
      let mergeCount = 0;
      certificateEntries.forEach((entry, pageIndex) => {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateMergeRefs.forEach((mergeRef) => {
          const mergeCellNode = sheetDoc.createElementNS(sheetMainNs, 'mergeCell');
          mergeCellNode.setAttribute('ref', shiftRangeReferenceRows(mergeRef, rowOffset));
          resolvedMergeCellsNode.appendChild(mergeCellNode);
          mergeCount += 1;
        });
      });
      resolvedMergeCellsNode.setAttribute('count', String(mergeCount));
      const instagramPattern = getTemplateInstagramPattern(sheetDoc, sharedStringsXml);
      certificateEntries.forEach((entry, pageIndex) => {
        const sold = entry.sold || {};
        const work = entry.work || {};
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        const fields = getModel().buildCertificateFields(sold, work, getArtistInstagramForCertificate(sold, work));
        setInlineCellValueByRef(cellMap, `F${24 + rowOffset}`, fields.artist, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${26 + rowOffset}`, fields.title, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${28 + rowOffset}`, fields.materials, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${30 + rowOffset}`, fields.size, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${32 + rowOffset}`, fields.year, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${34 + rowOffset}`, fields.edition, sheetDoc);
        setInlineCellValueByRef(cellMap, `B${3 + rowOffset}`, fields.soldDate ? `Date ${fields.soldDate}` : '', sheetDoc);
        const instagramText = fields.artistInstagram
          ? (instagramPattern.includes('instagram_handle_name')
            ? instagramPattern.split('instagram_handle_name').join(fields.artistInstagram)
            : fields.artistInstagram)
          : '';
        setInlineCellValueByRef(cellMap, `A${45 + rowOffset}`, instagramText, sheetDoc);
      });
      const finalEndRow = CERTIFICATE_BLOCK_END_ROW + (certificateEntries.length - 1) * CERTIFICATE_BLOCK_HEIGHT;
      const dimensionNode = getElementsByLocalName(sheetDoc, 'dimension')[0];
      if (dimensionNode) dimensionNode.setAttribute('ref', `A${CERTIFICATE_BLOCK_START_ROW}:I${finalEndRow}`);
      let newSheetXml = new options.XMLSerializer().serializeToString(sheetDoc);
      newSheetXml = enforceWorksheetPageSetupXml(newSheetXml, { fitToWidth: 1, fitToHeight: 0, fitToPage: 1 });
      const pageBreakRows = [];
      for (let index = 0; index < certificateEntries.length - 1; index += 1) {
        pageBreakRows.push(CERTIFICATE_BLOCK_END_ROW + index * CERTIFICATE_BLOCK_HEIGHT);
      }
      newSheetXml = upsertWorksheetRowBreaksXml(newSheetXml, pageBreakRows);
      drawingXml = duplicateTemplateDrawingAnchorsForPages(drawingXml, certificateEntries.length);
      const metrics = parseWorksheetMetrics(newSheetXml);
      const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextRelIdNum = relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1;
      const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      for (let index = 0; index < certificateEntries.length; index += 1) {
        const pngImage = await buildCertificatePngBytesFromDataUrl(certificateEntries[index].imageDataUrl);
        zip.file(`xl/media/certificate-artwork-${index + 1}.png`, pngImage.bytes);
        const relId = `rId${nextRelIdNum}`;
        nextRelIdNum += 1;
        const picId = nextPicId;
        nextPicId += 1;
        const insertedRel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork-${index + 1}.png"/>`;
        drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);
        const imageAnchor = computeContainedImageAnchor(metrics, pngImage.width, pngImage.height, index * CERTIFICATE_BLOCK_HEIGHT);
        drawingXml = drawingXml.replace('</xdr:wsDr>', `${buildArtworkAnchorXml(imageAnchor, picId, relId)}</xdr:wsDr>`);
      }
      zip.file(sheetPath, newSheetXml);
      zip.file(workbookPath, upsertWorkbookPrintArea(workbookXml, buildWorkbookPrintAreaFormula(workbookXml, finalEndRow)));
      zip.file(drawingPath, drawingXml);
      zip.file(drawingRelsPath, drawingRelsXml);
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    async function handleDownloadAllCertificatesAction() {
      const soldWorks = options.ensureSoldWorksArray();
      const generatedSales = soldWorks.filter((sold) => options.normalizeSoldItemType(sold) === '작품' && hasGeneratedCertificate(sold));
      if (generatedSales.length === 0) {
        options.alert('생성된 보증서가 없습니다. 먼저 판매 항목에서 보증서를 생성해주세요.');
        return;
      }
      const entries = [];
      const missingImageSales = [];
      generatedSales.forEach((sold) => {
        const work = getSourceArtworkForSold(sold) || null;
        const imageDataUrl = getCertificateImageDataUrl(sold, work);
        if (!imageDataUrl) missingImageSales.push(sold);
        else entries.push({ sold, work, imageDataUrl });
      });
      if (missingImageSales.length > 0) {
        options.alert(`이미지가 누락된 보증서 ${missingImageSales.length}건이 있어 전체 보증서를 생성할 수 없습니다. 판매 목록에서 이미지 상태를 확인해주세요.`);
        return;
      }
      try {
        downloadBlobFile(await buildAllCertificatesWorkbookBlob(entries), buildAllCertificatesDownloadFileName());
      } catch (error) {
        options.console.error('all certificates generation failed', error);
        options.alert('모든 보증서 다운로드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    }

    async function handleSoldCertificateAction(soldId) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find((item) => item.id === soldId);
      if (!sold || options.normalizeSoldItemType(sold) !== '작품') return;
      if (!sold.saved) {
        options.alert('보증서 생성을 위해 판매 항목을 먼저 저장해주세요.');
        return;
      }
      const work = getSourceArtworkForSold(sold);
      if (!work) {
        options.alert('작품 목록에서 해당 작품 정보를 찾을 수 없습니다. 작품 목록 데이터를 확인해주세요.');
        return;
      }
      if (!getCertificateImageDataUrl(sold, work)) {
        options.alert('작품 이미지가 없어 보증서를 생성할 수 없습니다. 작품 목록에서 사진을 먼저 등록해주세요.');
        return;
      }
      const certificateFileName = sold.certificateFileName || safeCertificateFileName(work?.title || sold.title || '작품');
      if (hasGeneratedCertificate(sold)) {
        try {
          downloadBlobFile(await buildCertificateWorkbookBlob(sold, work), certificateFileName);
        } catch (error) {
          options.console.error('certificate download failed', error);
          options.alert('보증서 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
        return;
      }
      try {
        await buildCertificateWorkbookBlob(sold, work);
        sold.certificateFileName = certificateFileName;
        sold.certificateCreatedAt = new Date().toISOString();
        sold.certificateReady = true;
        sold.certificateVersion = 2;
        options.setStateSoldWorks(soldWorks);
        options.saveExhibition();
        options.renderSalesManagement();
      } catch (error) {
        options.console.error('certificate generation failed', error);
        options.alert('보증서 생성에 실패했습니다. 템플릿 파일과 네트워크 상태를 확인해주세요.');
      }
    }

    async function handleSoldCertificateRemakeAction(soldId) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find((item) => item.id === soldId);
      if (!sold || options.normalizeSoldItemType(sold) !== '작품') return;
      if (!sold.saved || !hasGeneratedCertificate(sold)) {
        options.alert('먼저 보증서를 만들어주세요.');
        return;
      }
      const work = getSourceArtworkForSold(sold);
      if (!work) {
        options.alert('작품 목록에서 해당 작품 정보를 찾을 수 없습니다. 작품 목록 데이터를 확인해주세요.');
        return;
      }
      if (!getCertificateImageDataUrl(sold, work)) {
        options.alert('작품 이미지가 없어 보증서를 다시 만들 수 없습니다. 작품 목록에서 사진을 먼저 등록해주세요.');
        return;
      }
      try {
        await buildCertificateWorkbookBlob(sold, work);
        sold.certificateFileName = safeCertificateFileName(work.title || sold.title || '작품');
        sold.certificateCreatedAt = new Date().toISOString();
        sold.certificateReady = true;
        sold.certificateVersion = 2;
        options.setStateSoldWorks(soldWorks);
        options.saveExhibition();
        options.renderSalesManagement();
        options.alert('보증서를 다시 만들었습니다. 보증서 다운로드 버튼에서 새 보증서를 다운로드할 수 있습니다.');
      } catch (error) {
        options.console.error('certificate remake failed', error);
        options.alert('보증서를 다시 만드는 데 실패했습니다. 템플릿 파일과 네트워크 상태를 확인해주세요.');
      }
    }

    return {
      applyCertificateArtistInstagram,
      applyCertificateImageToWorkbookBlob,
      applyCertificateInstagramPlaceholderToWorkbookBlob,
      buildAllCertificatesDownloadFileName,
      buildAllCertificatesWorkbookBlob,
      buildArtworkAnchorXml,
      buildCertificatePngBytesFromDataUrl,
      buildCertificateWorkbookBlob,
      buildWorkbookPrintAreaFormula,
      blobToDataUrl,
      blobToUint8Array,
      canvasToBlob,
      computeContainedImageAnchor,
      dataUrlToUint8Array,
      downloadBlobFile,
      enforceWorksheetPageSetupXml,
      escapeXmlText,
      fetchCertificateTemplateArrayBuffer,
      getArtistInstagramForCertificate,
      getCertificateImageDataUrl,
      getCertificateTemplateArrayBuffer,
      getSourceArtworkForSold,
      getDrawingAnchorFromRowIndex,
      getElementsByLocalName,
      getTemplateInstagramPattern,
      hasGeneratedCertificate,
      handleDownloadAllCertificatesAction,
      handleSoldCertificateAction,
      handleSoldCertificateRemakeAction,
      normalizeCertificateDateText,
      parseSharedStringsText,
      parseWorksheetMetrics,
      parseXmlDocumentOrThrow,
      removeXmlAttribute,
      resolveCertificateImageDataUrl,
      safeCertificateFileName,
      setInlineCellValueByRef,
      setOrReplaceXmlAttribute,
      setSheetCellInlineText,
      shiftCellReferenceRow,
      shiftDrawingAnchorRows,
      shiftRangeReferenceRows,
      splitCellReference,
      duplicateTemplateDrawingAnchorsForPages,
      upsertWorkbookPrintArea,
      upsertWorksheetRowBreaksXml
    };
  }

  return { create };
});

/* exhibitions/inventory-model.js */
(function initializeExhibitionInventoryModel(root) {
  'use strict';

  function normalizeManualNumber(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function normalizeTitle(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function shouldValidateManualNumberUniqueness(work) {
    if (!work) return false;
    const current = normalizeManualNumber(work.manualNumber);
    if (!current || work.wasSaved === undefined) return false;
    if (!work.wasSaved) return true;
    return current !== normalizeManualNumber(work.editOriginalManualNumber);
  }

  function shouldValidateTitleUniqueness(work) {
    if (!work) return false;
    const current = normalizeTitle(work.title);
    if (!current || work.wasSaved === undefined) return false;
    if (!work.wasSaved) return true;
    return current !== normalizeTitle(work.editOriginalTitle);
  }

  function findSavedConflict(work, allWorks, field, normalize) {
    const target = normalize(work?.[field]);
    if (!target) return null;
    return allWorks.find((candidate) => {
      if (!candidate || candidate.id === work.id || !candidate.saved) return false;
      return normalize(candidate[field]) === target;
    }) || null;
  }

  function findSavedManualNumberConflict(work, allWorks) {
    return findSavedConflict(work, allWorks, 'manualNumber', normalizeManualNumber);
  }

  function findSavedTitleConflict(work, allWorks) {
    return findSavedConflict(work, allWorks, 'title', normalizeTitle);
  }

  function getBulkConflicts(allWorks, pendingWorks, field, normalize, shouldValidate) {
    const conflictIds = new Set();
    const pendingIds = new Set(pendingWorks.filter(shouldValidate).map((work) => work.id));
    const savedValues = new Map();
    allWorks.forEach((work) => {
      if (!work || !work.saved || pendingIds.has(work.id)) return;
      const normalized = normalize(work[field]);
      if (normalized && !savedValues.has(normalized)) savedValues.set(normalized, work.id);
    });
    const pendingValues = new Map();
    pendingWorks.forEach((work) => {
      if (!shouldValidate(work)) return;
      const normalized = normalize(work[field]);
      if (!normalized) return;
      if (savedValues.has(normalized)) conflictIds.add(work.id);
      const ids = pendingValues.get(normalized) || [];
      ids.push(work.id);
      pendingValues.set(normalized, ids);
    });
    pendingValues.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => conflictIds.add(id));
    });
    return conflictIds;
  }

  function getBulkManualNumberConflicts(allWorks, pendingWorks) {
    return getBulkConflicts(
      allWorks,
      pendingWorks,
      'manualNumber',
      normalizeManualNumber,
      shouldValidateManualNumberUniqueness
    );
  }

  function getBulkTitleConflicts(allWorks, pendingWorks) {
    return getBulkConflicts(
      allWorks,
      pendingWorks,
      'title',
      normalizeTitle,
      shouldValidateTitleUniqueness
    );
  }

  function getMissingRequiredWorkFields(work) {
    const missing = [];
    if (!(work.manualNumber || '').toString().trim()) missing.push('manualNumber');
    if (!(work.title || '').toString().trim()) missing.push('title');
    if (!(work.price || '').toString().trim()) missing.push('price');
    return missing;
  }

  function parseSizeParts(sizeText) {
    const text = (sizeText || '').toString().trim();
    if (!text) return { width: '', height: '' };
    const normalized = text.replace(/\s+/g, ' ').replace(/×/g, 'x');
    const fullMatch = normalized.match(/([\d.]+)\s*cm?\s*x\s*([\d.]+)\s*cm?/i)
      || normalized.match(/([\d.]+)\s*x\s*([\d.]+)/i);
    if (fullMatch) return { width: fullMatch[1] || '', height: fullMatch[2] || '' };
    const widthOnlyMatch = normalized.match(/^([\d.]+)\s*cm?\s*x?\s*$/i)
      || normalized.match(/^([\d.]+)\s*x\s*$/i);
    if (widthOnlyMatch) return { width: widthOnlyMatch[1] || '', height: '' };
    const heightOnlyMatch = normalized.match(/^x\s*([\d.]+)\s*cm?$/i)
      || normalized.match(/^x\s*([\d.]+)$/i);
    if (heightOnlyMatch) return { width: '', height: heightOnlyMatch[1] || '' };
    return { width: '', height: '' };
  }

  function filterWorks(works, options = {}) {
    if (options.advanced) {
      const filters = options.filters || {};
      return works.filter((work) => Object.keys(filters).every((key) => {
        const value = filters[key].trim().toLowerCase();
        if (!value) return true;
        return (work[key] || '').toString().toLowerCase().includes(value);
      }));
    }
    const search = String(options.search || '').trim().toLowerCase();
    if (!search) return works;
    return works.filter((work) => {
      const text = `${work.manualNumber || ''} ${work.title || ''} ${work.author || ''} ${work.price || ''} ${work.materials || ''} ${work.size || ''} ${work.year || ''} ${work.category || ''}`.toLowerCase();
      return text.includes(search);
    });
  }

  function getWorkSortValue(work, field, options = {}) {
    switch (field) {
      case 'manualNumber':
      case 'photoName':
      case 'title':
      case 'author':
      case 'price':
      case 'materials':
      case 'size':
      case 'year':
      case 'category':
        return work[field] || '';
      case 'quantity':
        return String(options.parseStockQuantity(work.quantity || 0));
      case 'soldQuantity':
        return String(options.getGoodsSoldQuantity(work.id));
      case 'remainingQuantity': {
        const stockQuantity = options.parseStockQuantity(work.quantity || 0);
        const soldQuantity = options.getGoodsSoldQuantity(work.id);
        return String(Math.max(0, stockQuantity - soldQuantity));
      }
      case 'status':
        return options.soldWorkIdSet?.has(work.id) ? 'sold' : '';
      default:
        return '';
    }
  }

  function getSortedWorks(options) {
    const filtered = filterWorks(options.works || [], options);
    if (!options.sortField) return filtered;
    const direction = options.sortDirection === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const leftValue = getWorkSortValue(left, options.sortField, options);
      const rightValue = getWorkSortValue(right, options.sortField, options);
      return options.compareValues(leftValue, rightValue, options.sortField) * direction;
    });
  }

  const api = Object.freeze({
    filterWorks,
    findSavedManualNumberConflict,
    findSavedTitleConflict,
    getBulkManualNumberConflicts,
    getBulkTitleConflicts,
    getMissingRequiredWorkFields,
    getSortedWorks,
    getWorkSortValue,
    normalizeManualNumber,
    normalizeTitle,
    parseSizeParts,
    shouldValidateManualNumberUniqueness,
    shouldValidateTitleUniqueness
  });
  root.ExhibitionInventoryModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/works-editor-controller.js */
(function initializeExhibitionDetailWorksEditorController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailWorksEditorController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorksEditorControllerModule() {
  'use strict';

  const MAX_PHOTO_PREVIEW_DATA_URL_LENGTH = 360000;
  const PHOTO_PREVIEW_MAX_DIMENSION = 1280;
  const TRANSIENT_WORK_PHOTO_FIELDS = ['pendingPhotoDataUrl', 'pendingPhotoPreviewDataUrl'];

  function create(options) {
    const state = options.state;
    const document = options.document;
    const window = options.window;
    const fetchImpl = options.fetchImpl;
    const FileReaderImpl = options.FileReaderImpl;
    const ImageImpl = options.ImageImpl;
    const inventoryModel = options.inventoryModel;
    const imageLifecycle = options.imageLifecycle;
    const pendingPhotoUploadTokens = new Map();
    let imagePreviewOutsideClickHandler = null;

    function addWorkRow() {
      const exhibition = options.getCurrentExhibition();
      exhibition.works = exhibition.works || [];
      options.pushWorkUndoSnapshot();
      const author = exhibition.type === '개인전' ? (exhibition.participants?.[0] || '') : '';
      exhibition.works.push({
        id: options.nowImpl(),
        createdByUserId: options.getCurrentUserId(),
        manualNumber: '',
        photoName: '',
        photoUrl: '',
        photoPreviewUrl: '',
        photoPath: '',
        photoPreviewPath: '',
        photoDataUrl: '',
        photoPreviewDataUrl: '',
        photoMimeType: '',
        photoByteSize: 0,
        title: '',
        author,
        price: '',
        materials: '',
        size: '',
        year: '',
        category: '',
        quantity: state.inventoryMode === 'goods' ? '0' : '',
        wasSaved: false,
        saved: false
      });
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.updateSaveAllButtonVisibility();

      options.requestAnimationFrameImpl(() => {
        const tbody = document.getElementById('works-tbody');
        const lastRow = tbody?.lastElementChild;
        if (lastRow) {
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusTarget = lastRow.querySelector('input, textarea, select');
          if (focusTarget) {
            focusTarget.focus();
          }
        }
      });
    }

    function duplicateWorkRow(workId) {
      const exhibition = options.getCurrentExhibition();
      exhibition.works = exhibition.works || [];
      const source = exhibition.works.find((work) => work.id === workId);
      if (!source) return;
      if (!options.canCurrentUserModifyOwnedRow(source)) {
        options.alertImpl('다른 사용자가 추가한 항목은 복사할 수 없습니다.');
        return;
      }

      options.pushWorkUndoSnapshot();

      const duplicated = {
        id: options.nowImpl() + Math.floor(options.randomImpl() * 100000),
        createdByUserId: options.getCurrentUserId(),
        manualNumber: source.manualNumber || '',
        photoName: source.photoName || '',
        photoUrl: source.photoUrl || '',
        photoPreviewUrl: source.photoPreviewUrl || '',
        photoPath: source.photoPath || '',
        photoPreviewPath: source.photoPreviewPath || '',
        photoDataUrl: source.photoDataUrl || '',
        photoPreviewDataUrl: source.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(source),
        photoMimeType: source.photoMimeType || '',
        photoByteSize: Number(source.photoByteSize) || 0,
        title: source.title || '',
        author: source.author || '',
        price: source.price || '',
        materials: source.materials || '',
        size: source.size || '',
        year: source.year || '',
        category: source.category || '',
        quantity: source.quantity ?? (state.inventoryMode === 'goods' ? '0' : ''),
        wasSaved: false,
        saved: false
      };

      exhibition.works.push(duplicated);
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.updateSaveAllButtonVisibility();

      options.requestAnimationFrameImpl(() => {
        const row = document.querySelector(`tr[data-work-id="${duplicated.id}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusTarget = row.querySelector('input[data-field="manualNumber"]') || row.querySelector('input, textarea, select');
        if (focusTarget) {
          focusTarget.focus();
        }
      });
    }

    function saveWork(workId, triggerButton) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
        return;
      }

      const row = triggerButton && typeof triggerButton.closest === 'function'
        ? triggerButton.closest('tr')
        : document.querySelector(`tr[data-work-id="${workId}"]`);
      syncWorkFromRow(work, row);

      const missing = getMissingRequiredWorkFields(work);
      if (missing.length > 0) {
        markMissingRequiredFields(row, missing);
        return;
      }

      const allWorks = getAllInventoryWorks(exhibition);
      const shouldValidateNumber = shouldValidateManualNumberUniqueness(work);
      const manualNumberConflict = shouldValidateNumber ? findSavedManualNumberConflict(work, allWorks) : null;
      if (manualNumberConflict) {
        markMissingRequiredFields(row, ['manualNumber']);
        options.alertImpl('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
        return;
      }

      markMissingRequiredFields(row, []);

      if (work.price) {
        work.price = options.formatPriceForSave(work.price);
      }

      work.saved = true;
      work.wasSaved = true;
      delete work.editOriginalManualNumber;
      delete work.editOriginalTitle;
      state.workEditSnapshotIds = state.workEditSnapshotIds.filter((id) => id !== workId);
      syncWorkToSalesRecords(work);
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
    }

    function saveAllWorks() {
      const exhibition = options.getCurrentExhibition();
      const works = exhibition.works || [];
      let saveCount = 0;
      const pendingWorks = [];

      for (const work of works) {
        if (work.saved) continue;
        if (!options.canCurrentUserModifyOwnedRow(work)) continue;
        const row = document.querySelector(`tr[data-work-id="${work.id}"]`);
        syncWorkFromRow(work, row);
        const missing = getMissingRequiredWorkFields(work);
        if (missing.length > 0) {
          markMissingRequiredFields(row, missing);
          return;
        }
        markMissingRequiredFields(row, []);
        pendingWorks.push(work);
      }

      const allWorks = getAllInventoryWorks(exhibition);
      const numberConflictIds = getBulkManualNumberConflicts(allWorks, pendingWorks);
      if (numberConflictIds.size > 0) {
        pendingWorks.forEach((work) => {
          const row = document.querySelector(`tr[data-work-id="${work.id}"]`);
          if (!row) return;
          const missingFields = [];
          if (numberConflictIds.has(work.id)) {
            missingFields.push('manualNumber');
          }
          if (missingFields.length > 0) {
            markMissingRequiredFields(row, missingFields);
          }
        });
        options.alertImpl('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
        return;
      }

      works.forEach((work) => {
        if (!work.saved) {
          if (!options.canCurrentUserModifyOwnedRow(work)) return;
          if (work.price) {
            work.price = options.formatPriceForSave(work.price);
          }
          work.saved = true;
          work.wasSaved = true;
          delete work.editOriginalManualNumber;
          delete work.editOriginalTitle;
          state.workEditSnapshotIds = state.workEditSnapshotIds.filter((id) => id !== work.id);
          syncWorkToSalesRecords(work);
          saveCount++;
        }
      });
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
    }

    function syncWorkToSalesRecords(work) {
      const exhibition = options.getCurrentExhibition();
      const soldWorks = exhibition.soldWorks;
      if (!soldWorks || soldWorks.length === 0) return;
      const expectedType = state.inventoryMode === 'goods' ? '굿즈' : '작품';
      let changed = false;
      soldWorks.forEach((sold) => {
        if (sold.workId !== work.id) return;
        if (options.normalizeSoldItemType(sold) !== expectedType) return;
        sold.manualNumber = work.manualNumber || sold.manualNumber;
        sold.category = work.category || sold.category;
        sold.title = work.title || sold.title;
        sold.author = work.author || sold.author;
        sold.price = work.price || sold.price;
        sold.photoName = work.photoName || sold.photoName;
        sold.photoUrl = work.photoUrl || sold.photoUrl;
        sold.photoPreviewUrl = work.photoPreviewUrl || work.photoUrl || sold.photoPreviewUrl;
        sold.photoDataUrl = work.photoDataUrl || sold.photoDataUrl;
        sold.photoPreviewDataUrl = work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work) || sold.photoPreviewDataUrl;
        changed = true;
      });
      if (changed && state.exhibition) {
        state.exhibition.soldWorks = soldWorks;
      }
    }

    function syncWorkFromRow(work, row) {
      if (!row || !work) return;
      const manualNumberInput = row.querySelector('input[data-field="manualNumber"]');
      const categoryInput = row.querySelector('input[data-field="category"]');
      const titleInput = row.querySelector('input[data-field="title"]');
      const authorInput = row.querySelector('input[data-field="author"]');
      const priceInput = row.querySelector('input[data-field="price"]');
      const materialsInput = row.querySelector('input[data-field="materials"]');
      const yearInput = row.querySelector('input[data-field="year"]');
      const sizeWidthInput = row.querySelector('input[data-field="sizeWidth"]');
      const sizeHeightInput = row.querySelector('input[data-field="sizeHeight"]');
      const quantityInput = row.querySelector('input[data-field="quantity"]');

      if (manualNumberInput) work.manualNumber = manualNumberInput.value.trim();
      if (categoryInput) work.category = categoryInput.value.trim();
      if (titleInput) work.title = titleInput.value.trim();
      if (authorInput) work.author = authorInput.value.trim();
      if (priceInput) work.price = priceInput.value.trim();
      if (materialsInput) work.materials = materialsInput.value.trim();
      if (yearInput) work.year = yearInput.value.trim();
      if (sizeWidthInput || sizeHeightInput) {
        const width = (sizeWidthInput?.value || '').replace(/[^\d.]/g, '').trim();
        const height = (sizeHeightInput?.value || '').replace(/[^\d.]/g, '').trim();
        if (!width && !height) {
          work.size = '';
        } else if (width && height) {
          work.size = `${width} cm x ${height} cm`;
        } else {
          work.size = width ? `${width} cm x ` : ` x ${height} cm`;
        }
      }
      if (quantityInput) work.quantity = quantityInput.value.trim();
    }

    function normalizeManualNumber(value) {
      return inventoryModel.normalizeManualNumber(value);
    }

    function normalizeTitle(value) {
      return inventoryModel.normalizeTitle(value);
    }

    function shouldValidateManualNumberUniqueness(work) {
      return inventoryModel.shouldValidateManualNumberUniqueness(work);
    }

    function shouldValidateTitleUniqueness(work) {
      return inventoryModel.shouldValidateTitleUniqueness(work);
    }

    function getAllInventoryWorks(exhibition) {
      if (!exhibition) return [];
      options.initializeInventoryData(exhibition);
      const artWorks = Array.isArray(exhibition.artWorks) ? exhibition.artWorks : [];
      const goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
      return [...artWorks, ...goods];
    }

    function findSavedManualNumberConflict(work, allWorks) {
      return inventoryModel.findSavedManualNumberConflict(work, allWorks);
    }

    function findSavedTitleConflict(work, allWorks) {
      return inventoryModel.findSavedTitleConflict(work, allWorks);
    }

    function getBulkManualNumberConflicts(allWorks, pendingWorks) {
      return inventoryModel.getBulkManualNumberConflicts(allWorks, pendingWorks);
    }

    function getBulkTitleConflicts(allWorks, pendingWorks) {
      return inventoryModel.getBulkTitleConflicts(allWorks, pendingWorks);
    }

    function getMissingRequiredWorkFields(work) {
      return inventoryModel.getMissingRequiredWorkFields(work);
    }

    function markMissingRequiredFields(row, missingFields) {
      if (!row) return;
      const fields = ['manualNumber', 'title', 'price'];
      fields.forEach((field) => {
        const input = row.querySelector(`input[data-field="${field}"]`);
        if (!input) return;
        input.classList.toggle('required-missing', missingFields.includes(field));
      });
    }

    function toggleWorkEdit(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
        return;
      }
      if (work.saved) {
        options.ensureWorkEditUndoSnapshot(workId);
        work.wasSaved = true;
        work.editOriginalManualNumber = work.manualNumber || '';
        work.editOriginalTitle = work.title || '';
      }
      work.saved = false;
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();
      options.scrollRowToViewportCenter(`tr[data-work-id="${workId}"]`);
    }

    function openDeleteWorkModal(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
        return;
      }
      state.pendingDeleteWorkId = workId;
      document.getElementById('delete-modal').style.display = 'flex';
    }

    function closeDeleteWorkModal() {
      state.pendingDeleteWorkId = null;
      document.getElementById('delete-modal').style.display = 'none';
    }

    function confirmDeleteWork() {
      const workId = state.pendingDeleteWorkId;
      if (workId === null) return;
      deleteWork(workId);
      closeDeleteWorkModal();
    }

    function handleWorkChange(workId, field, value) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;
      if (field === 'author' && exhibition.type === '개인전') return;
      options.ensureWorkEditUndoSnapshot(workId);
      work[field] = value;
      if (state.exhibition) {
        state.exhibition.works = exhibition.works;
      }
      options.saveExhibition();
    }

    function canUseRemoteUploadApi() {
      return typeof window !== 'undefined'
        && window.location
        && !String(window.location.protocol || '').startsWith('file');
    }

    function buildPhotoUploadFileName(baseName, suffix, mimeType) {
      return imageLifecycle.buildPhotoUploadFileName(baseName, suffix, mimeType);
    }

    function parseDataUrlMimeType(dataUrl) {
      return imageLifecycle.parseDataUrlMimeType(dataUrl);
    }

    function snapshotWorkPhotoFields(work) {
      return imageLifecycle.snapshotPhotoFields(work);
    }

    function applyWorkPhotoFields(work, snapshot) {
      imageLifecycle.applyPhotoFields(work, snapshot);
    }

    function clearPendingWorkPhotoFields(work) {
      imageLifecycle.clearPendingPhotoFields(work);
    }

    async function verifyUploadedImageFile(uploadedFile) {
      return imageLifecycle.verifyUploadedImage({ fetchImpl, uploadedFile });
    }

    async function uploadImageDataUrl(dataUrl, fileName) {
      return imageLifecycle.uploadImageDataUrl({
        fetchImpl,
        canUpload: canUseRemoteUploadApi(),
        dataUrl,
        fileName
      });
    }

    async function persistWorkPhotoUrls(workId, uploadOptions = {}) {
      if (!canUseRemoteUploadApi()) {
        return { ok: false, reason: 'remote-upload-disabled' };
      }

      const exhibition = options.getCurrentExhibition();
      const work = Array.isArray(exhibition.works)
        ? exhibition.works.find((item) => item.id === workId)
        : null;
      if (!work) return { ok: false, reason: 'work-not-found' };

      const uploadPlan = imageLifecycle.buildUploadPlan(work, { ...uploadOptions, workId });
      if (!uploadPlan.ok) return uploadPlan;

      const token = `${options.nowImpl()}-${options.randomImpl().toString(36).slice(2, 10)}`;
      pendingPhotoUploadTokens.set(workId, token);

      if (uploadPlan.skipped) {
        clearPendingWorkPhotoFields(work);
        return { ok: true, skipped: true };
      }

      const previewUpload = uploadPlan.shouldUploadPreview
        ? await uploadImageDataUrl(uploadPlan.previewDataUrl, uploadPlan.previewFileName)
        : null;
      const fullUpload = uploadPlan.shouldUploadFull
        ? await uploadImageDataUrl(uploadPlan.fullDataUrl, uploadPlan.fullFileName)
        : null;

      if (uploadPlan.shouldUploadPreview && !previewUpload?.url) {
        return { ok: false, reason: 'preview-upload-failed' };
      }
      if (uploadPlan.shouldUploadFull && !fullUpload?.url) {
        return { ok: false, reason: 'full-upload-failed' };
      }

      const previewValidation = previewUpload ? await verifyUploadedImageFile(previewUpload) : null;
      const fullValidation = fullUpload ? await verifyUploadedImageFile(fullUpload) : null;

      if (previewUpload && !previewValidation?.ok) {
        return { ok: false, reason: 'preview-upload-validation-failed', details: previewValidation || null };
      }
      if (fullUpload && !fullValidation?.ok) {
        return { ok: false, reason: 'full-upload-validation-failed', details: fullValidation || null };
      }
      if (pendingPhotoUploadTokens.get(workId) !== token) {
        return { ok: false, reason: 'upload-superseded' };
      }

      const latestExhibition = options.getCurrentExhibition();
      const latestWork = Array.isArray(latestExhibition.works)
        ? latestExhibition.works.find((item) => item.id === workId)
        : null;
      if (!latestWork) return { ok: false, reason: 'latest-work-not-found' };

      const changed = imageLifecycle.applyUploadedPhotoFields(latestWork, { previewUpload, fullUpload });
      if (!changed) return { ok: true, skipped: true };

      if (state.exhibition) {
        state.exhibition.works = latestExhibition.works;
      }
      options.saveExhibition();
      options.renderWorkRows();

      return { ok: true, previewUpload, fullUpload, previewValidation, fullValidation };
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReaderImpl();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });
    }

    function loadImageElement(src) {
      return new Promise((resolve, reject) => {
        const image = new ImageImpl();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image data.'));
        image.src = src;
      });
    }

    function renderResizedDataUrl(image, mimeType, quality, maxDimension) {
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) return '';

      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = options.createCanvas();
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) return '';
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      if (mimeType === 'image/png') return canvas.toDataURL(mimeType);
      return canvas.toDataURL(mimeType, quality);
    }

    async function buildLightweightPhotoPreview(dataUrl) {
      if (!dataUrl) return '';
      try {
        const image = await loadImageElement(dataUrl);
        const thumbnail = renderResizedDataUrl(image, 'image/webp', 0.55, 280);
        return thumbnail || dataUrl;
      } catch (error) {
        return dataUrl;
      }
    }

    async function buildCompactPhotoPreview(file) {
      const originalDataUrl = await readFileAsDataUrl(file);
      if (!originalDataUrl) return { dataUrl: '', mimeType: '', byteSize: 0 };

      if (originalDataUrl.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
        return {
          dataUrl: originalDataUrl,
          mimeType: file.type || '',
          byteSize: Number.isFinite(file.size) ? file.size : 0
        };
      }

      const image = await loadImageElement(originalDataUrl);
      const isPng = (file.type || '').toLowerCase() === 'image/png';
      const mimeCandidates = isPng ? ['image/webp', 'image/jpeg', 'image/png'] : ['image/webp', 'image/jpeg'];
      const qualities = [0.82, 0.72, 0.62, 0.52];
      const dimensions = [PHOTO_PREVIEW_MAX_DIMENSION, 1080, 920, 760, 620];
      let bestDataUrl = '';
      let bestMimeType = '';

      for (const maxDimension of dimensions) {
        for (const mimeType of mimeCandidates) {
          if (mimeType === 'image/png') {
            const pngDataUrl = renderResizedDataUrl(image, mimeType, 1, maxDimension);
            if (!pngDataUrl) continue;
            if (!bestDataUrl || pngDataUrl.length < bestDataUrl.length) {
              bestDataUrl = pngDataUrl;
              bestMimeType = mimeType;
            }
            if (pngDataUrl.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
              return { dataUrl: pngDataUrl, mimeType, byteSize: Math.round((pngDataUrl.length * 3) / 4) };
            }
            continue;
          }

          for (const quality of qualities) {
            const encoded = renderResizedDataUrl(image, mimeType, quality, maxDimension);
            if (!encoded) continue;
            if (!bestDataUrl || encoded.length < bestDataUrl.length) {
              bestDataUrl = encoded;
              bestMimeType = mimeType;
            }
            if (encoded.length <= MAX_PHOTO_PREVIEW_DATA_URL_LENGTH) {
              return { dataUrl: encoded, mimeType, byteSize: Math.round((encoded.length * 3) / 4) };
            }
          }
        }
      }

      const fallbackDataUrl = bestDataUrl || originalDataUrl;
      return {
        dataUrl: fallbackDataUrl,
        mimeType: bestMimeType || file.type || '',
        byteSize: Math.round((fallbackDataUrl.length * 3) / 4)
      };
    }

    async function handleWorkPhotoChange(workId, event) {
      const file = event.target.files[0];
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;

      options.ensureWorkEditUndoSnapshot(workId);
      const previousPhotoSnapshot = snapshotWorkPhotoFields(work);

      if (!file) {
        work.photoName = '';
        work.photoUrl = '';
        work.photoPreviewUrl = '';
        work.photoPath = '';
        work.photoPreviewPath = '';
        work.photoDataUrl = '';
        work.photoPreviewDataUrl = '';
        clearPendingWorkPhotoFields(work);
        work.photoMimeType = '';
        work.photoByteSize = 0;
        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.saveExhibition();
        options.renderWorkRows();
        return;
      }

      try {
        const compactPhoto = await buildCompactPhotoPreview(file);
        const lightweightPreview = await buildLightweightPhotoPreview(compactPhoto.dataUrl);
        work.photoName = file.name;
        work.pendingPhotoDataUrl = compactPhoto.dataUrl;
        work.pendingPhotoPreviewDataUrl = lightweightPreview;
        work.photoMimeType = compactPhoto.mimeType;
        work.photoByteSize = compactPhoto.byteSize;

        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.renderWorkRows();

        const persisted = await persistWorkPhotoUrls(workId, {
          fullDataUrl: compactPhoto.dataUrl,
          previewDataUrl: lightweightPreview,
          fileName: file.name,
          replaceExisting: true
        });

        if (!persisted?.ok) {
          if (persisted?.reason === 'upload-superseded') return;
          applyWorkPhotoFields(work, previousPhotoSnapshot);
          if (state.exhibition) state.exhibition.works = exhibition.works;
          options.renderWorkRows();
          options.alertImpl('이미지 업로드에 실패했습니다. 기존 이미지 상태로 복원되었습니다. 네트워크를 확인한 뒤 다시 시도해주세요.');
          return;
        }
      } catch (error) {
        options.consoleImpl.error('Failed to process photo preview:', error);
        applyWorkPhotoFields(work, previousPhotoSnapshot);
        if (state.exhibition) state.exhibition.works = exhibition.works;
        options.renderWorkRows();
        options.alertImpl('이미지 처리 중 오류가 발생했습니다. 기존 이미지 상태를 유지합니다.');
      }
    }

    function parseSizeParts(sizeText) {
      return inventoryModel.parseSizeParts(sizeText);
    }

    function handleWorkSizeChange(workId, part, value) {
      const exhibition = options.getCurrentExhibition();
      const work = exhibition.works.find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) return;

      options.ensureWorkEditUndoSnapshot(workId);
      const cleanedValue = (value || '').replace(/[^\d.]/g, '');
      const current = parseSizeParts(work.size);
      const width = part === 'width' ? cleanedValue : current.width;
      const height = part === 'height' ? cleanedValue : current.height;

      if (!width && !height) {
        work.size = '';
      } else if (width && height) {
        work.size = `${width} cm x ${height} cm`;
      } else {
        work.size = width ? `${width} cm x ` : ` x ${height} cm`;
      }

      if (state.exhibition) state.exhibition.works = exhibition.works;
      options.saveExhibition();
    }

    function openImagePreviewByWorkId(workId, event) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      const previewDataUrl = options.getPhotoPreviewDataUrl(work);
      if (!work || !previewDataUrl) return;
      if (event) event.stopPropagation();

      closeImagePreview();
      const preview = document.createElement('div');
      preview.id = 'image-preview-popover';
      preview.className = 'image-preview-popover';
      preview.innerHTML = `
    <div class="image-preview-header">
      <span>${work.title || work.photoName || '이미지 미리보기'}</span>
      <button type="button" class="image-preview-close" onclick="closeImagePreview()">✕</button>
    </div>
    <img src="${previewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="image-preview-large">
  `;

      const anchorRect = event?.currentTarget?.getBoundingClientRect();
      const fallbackTop = Math.max(16, window.innerHeight / 2 - 140);
      preview.style.top = `${anchorRect ? Math.max(16, anchorRect.top - 8) : fallbackTop}px`;
      preview.style.left = `${anchorRect ? anchorRect.right + 12 : 16}px`;
      document.body.appendChild(preview);

      const popoverRect = preview.getBoundingClientRect();
      if (popoverRect.right > window.innerWidth - 12 && anchorRect) {
        preview.style.left = `${Math.max(12, anchorRect.left - popoverRect.width - 12)}px`;
      }
      if (popoverRect.bottom > window.innerHeight - 12) {
        preview.style.top = `${Math.max(12, window.innerHeight - popoverRect.height - 12)}px`;
      }

      imagePreviewOutsideClickHandler = (clickEvent) => {
        const popover = document.getElementById('image-preview-popover');
        if (!popover) return;
        if (!popover.contains(clickEvent.target)) closeImagePreview();
      };

      options.setTimeoutImpl(() => {
        if (imagePreviewOutsideClickHandler) {
          document.addEventListener('click', imagePreviewOutsideClickHandler);
        }
      }, 0);
    }

    function closeImagePreview() {
      const popover = document.getElementById('image-preview-popover');
      if (popover) popover.remove();
      if (imagePreviewOutsideClickHandler) {
        document.removeEventListener('click', imagePreviewOutsideClickHandler);
        imagePreviewOutsideClickHandler = null;
      }
    }

    function deleteWork(workId) {
      const exhibition = options.getCurrentExhibition();
      const work = (exhibition.works || []).find((item) => item.id === workId);
      if (!work) return;
      if (!options.canCurrentUserModifyOwnedRow(work)) {
        options.alertImpl('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
        return;
      }
      options.pushWorkUndoSnapshot();
      exhibition.works = exhibition.works.filter((item) => item.id !== workId);
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = state.selectedWorkIds.filter((id) => id !== workId);
      state.lastWorkCheckboxIndex = null;
      options.saveExhibition();
      options.renderWorkRows();
    }

    function toggleSelectAllWorks(source) {
      const visibleWorks = options.getVisibleWorks();
      const visibleIds = visibleWorks.map((work) => work.id);
      if (source.checked) {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...visibleIds]));
      } else {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => !visibleIds.includes(id));
      }
      state.lastWorkCheckboxIndex = null;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function updateWorkSelectionActionButtons(visibleWorks) {
      const scopedWorks = Array.isArray(visibleWorks) ? visibleWorks : options.getVisibleWorks();
      const allVisibleSelected = scopedWorks.length > 0 && scopedWorks.every((work) => state.selectedWorkIds.includes(work.id));

      ['work-select-all-btn', 'work-select-all-btn-bottom'].forEach((buttonId) => {
        const selectAllButton = document.getElementById(buttonId);
        if (selectAllButton) selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
      });
      ['work-delete-selected-btn', 'work-delete-selected-btn-bottom'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) button.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      });
      ['work-edit-selected-btn', 'work-edit-selected-btn-bottom'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) button.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      });

      const selectAllCheckbox = document.getElementById('select-all-works');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = allVisibleSelected;
        selectAllCheckbox.indeterminate = !allVisibleSelected && state.selectedWorkIds.length > 0;
      }
      options.refreshGridKeyboardNavigation('works-tbody');
    }

    function toggleWorkSelection(workId, isChecked, event, rowIndex) {
      const visibleWorks = options.getVisibleWorks();
      const currentIndex = typeof rowIndex === 'number'
        ? rowIndex
        : visibleWorks.findIndex((work) => work.id === workId);
      const isShiftRange = Boolean(event && event.shiftKey && state.lastWorkCheckboxIndex !== null && currentIndex !== -1);

      if (isShiftRange) {
        const start = Math.min(state.lastWorkCheckboxIndex, currentIndex);
        const end = Math.max(state.lastWorkCheckboxIndex, currentIndex);
        const rangeIds = visibleWorks.slice(start, end + 1).map((work) => work.id);
        if (isChecked) {
          state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...rangeIds]));
        } else {
          state.selectedWorkIds = state.selectedWorkIds.filter((id) => !rangeIds.includes(id));
        }
      } else if (isChecked) {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, workId]));
      } else {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => id !== workId);
      }

      if (currentIndex !== -1) state.lastWorkCheckboxIndex = currentIndex;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function toggleSelectAllVisibleWorks() {
      const visibleWorks = options.getVisibleWorks();
      const visibleIds = visibleWorks.map((work) => work.id);
      const allSelected = visibleWorks.length > 0 && visibleIds.every((id) => state.selectedWorkIds.includes(id));
      if (allSelected) {
        state.selectedWorkIds = state.selectedWorkIds.filter((id) => !visibleIds.includes(id));
      } else {
        state.selectedWorkIds = Array.from(new Set([...state.selectedWorkIds, ...visibleIds]));
      }
      state.lastWorkCheckboxIndex = null;
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function deleteAllWorks() {
      if (!window.confirm('모든 작품을 삭제하시겠습니까?')) return;
      const exhibition = options.getCurrentExhibition();
      let nextWorks = [];
      if (options.isArtistScopedUser()) {
        nextWorks = (exhibition.works || []).filter((work) => !options.canCurrentUserModifyOwnedRow(work));
        if (nextWorks.length === (exhibition.works || []).length) {
          options.alertImpl('삭제할 수 있는 항목이 없습니다.');
          return;
        }
      }

      options.pushWorkUndoSnapshot();
      exhibition.works = options.isArtistScopedUser() ? nextWorks : [];
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      state.allowLargeInventoryDropOnce = true;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function deleteSelectedWorks() {
      if (state.selectedWorkIds.length === 0) return;
      if (!window.confirm('선택된 작품을 삭제하시겠습니까?')) return;
      const exhibition = options.getCurrentExhibition();
      const selectedSet = new Set(state.selectedWorkIds);
      const deletableIds = (exhibition.works || [])
        .filter((work) => selectedSet.has(work.id) && options.canCurrentUserModifyOwnedRow(work))
        .map((work) => work.id);
      if (deletableIds.length === 0) {
        options.alertImpl('삭제할 수 있는 항목이 없습니다.');
        return;
      }
      options.pushWorkUndoSnapshot();
      exhibition.works = (exhibition.works || []).filter((work) => !deletableIds.includes(work.id));
      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      state.allowLargeInventoryDropOnce = true;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    function editSelectedWorks() {
      if (state.selectedWorkIds.length === 0) return;
      const exhibition = options.getCurrentExhibition();
      const selectedSet = new Set(state.selectedWorkIds);
      const editableWorks = (exhibition.works || [])
        .filter((work) => selectedSet.has(work.id) && options.canCurrentUserModifyOwnedRow(work));

      if (editableWorks.length === 0) {
        options.alertImpl('수정할 수 있는 항목이 없습니다.');
        return;
      }

      editableWorks.forEach((work) => {
        if (work.saved) {
          options.ensureWorkEditUndoSnapshot(work.id);
          work.wasSaved = true;
          work.editOriginalManualNumber = work.manualNumber || '';
          work.editOriginalTitle = work.title || '';
        }
        work.saved = false;
      });

      if (state.exhibition) state.exhibition.works = exhibition.works;
      state.selectedWorkIds = [];
      state.lastWorkCheckboxIndex = null;
      options.saveExhibition();
      options.switchTab(options.getCurrentInventoryListTabName());
    }

    return {
      addWorkRow,
      duplicateWorkRow,
      saveWork,
      saveAllWorks,
      syncWorkToSalesRecords,
      syncWorkFromRow,
      normalizeManualNumber,
      normalizeTitle,
      shouldValidateManualNumberUniqueness,
      shouldValidateTitleUniqueness,
      getAllInventoryWorks,
      findSavedManualNumberConflict,
      findSavedTitleConflict,
      getBulkManualNumberConflicts,
      getBulkTitleConflicts,
      getMissingRequiredWorkFields,
      markMissingRequiredFields,
      toggleWorkEdit,
      openDeleteWorkModal,
      closeDeleteWorkModal,
      confirmDeleteWork,
      handleWorkChange,
      canUseRemoteUploadApi,
      buildPhotoUploadFileName,
      parseDataUrlMimeType,
      snapshotWorkPhotoFields,
      applyWorkPhotoFields,
      clearPendingWorkPhotoFields,
      verifyUploadedImageFile,
      uploadImageDataUrl,
      persistWorkPhotoUrls,
      readFileAsDataUrl,
      loadImageElement,
      renderResizedDataUrl,
      buildLightweightPhotoPreview,
      buildCompactPhotoPreview,
      handleWorkPhotoChange,
      parseSizeParts,
      handleWorkSizeChange,
      openImagePreviewByWorkId,
      closeImagePreview,
      deleteWork,
      toggleSelectAllWorks,
      updateWorkSelectionActionButtons,
      toggleWorkSelection,
      toggleSelectAllVisibleWorks,
      deleteAllWorks,
      deleteSelectedWorks,
      editSelectedWorks,
      MAX_PHOTO_PREVIEW_DATA_URL_LENGTH,
      PHOTO_PREVIEW_MAX_DIMENSION,
      TRANSIENT_WORK_PHOTO_FIELDS
    };
  }

  return { create };
});

/* exhibitions/inventory-renderer.js */
(function initializeExhibitionInventoryRenderer(root) {
  'use strict';

  function buildActionButtons(work, canModifyWork) {
    const actionButton = !canModifyWork
      ? ''
      : (work.saved
        ? `<button class="action-btn edit-btn" onclick="toggleWorkEdit(${work.id})">수정</button>`
        : `<button class="action-btn approve-btn" onclick="saveWork(${work.id}, this)">저장</button>`);
    const duplicateButton = canModifyWork
      ? `<button class="action-btn approve-btn" onclick="duplicateWorkRow(${work.id})">복사</button>`
      : '';
    const deleteButton = canModifyWork
      ? `<button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>`
      : '';
    return { actionButton, duplicateButton, deleteButton };
  }

  function buildPhotoCells(work, previewDataUrl) {
    const savedPhotoCell = previewDataUrl
      ? `<img src="${previewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `<span class="saved-photo">${work.photoName || '사진 없음'}</span>`;
    const editPhotoPreview = previewDataUrl
      ? `<img src="${previewDataUrl}" alt="미리보기" class="photo-preview-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `${work.photoName || '사진 없음'}`;
    return { savedPhotoCell, editPhotoPreview };
  }

  function buildWorkRow(options) {
    const {
      work,
      index,
      isGoodsMode,
      isSelected,
      canModifyWork,
      previewDataUrl,
      isUnsold,
      isSold,
      soldQuantity,
      stockQuantity,
      remainingQuantity,
      isSoloExhibition,
      sizeParts = { width: '', height: '' }
    } = options;
    const { actionButton, duplicateButton, deleteButton } = buildActionButtons(work, canModifyWork);
    const { savedPhotoCell, editPhotoPreview } = buildPhotoCells(work, previewDataUrl);
    const authorText = work.author || '';
    const authorInput = isSoloExhibition
      ? `<input type="text" data-field="author" value="${authorText}" disabled>`
      : `<input type="text" data-field="author" value="${authorText}" onchange="handleWorkChange(${work.id}, 'author', this.value)">`;
    const savedPriceCell = isUnsold
      ? `<span class="price-not-for-sale">미판매</span>`
      : `${work.price || ''}`;
    const statusCell = isSold
      ? `<button type="button" class="work-status-badge sold" onclick="jumpToSoldWork(${work.id})">SOLD</button>`
      : '';
    const checkboxCell = `<td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>`;

    if (isGoodsMode) {
      if (work.saved || !canModifyWork) {
        return {
          className: 'work-saved-row',
          html: `
          ${checkboxCell}
          <td>${work.manualNumber || ''}</td>
          <td>${savedPhotoCell}</td>
          <td>${work.title || ''}</td>
          <td>${savedPriceCell}</td>
          <td>${stockQuantity}</td>
          <td>${soldQuantity}</td>
          <td>${remainingQuantity}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            ${deleteButton}
          </td>
        `
        };
      }
      return {
        className: '',
        html: `
          ${checkboxCell}
          <td><input type="text" data-field="manualNumber" value="${work.manualNumber || ''}" onchange="handleWorkChange(${work.id}, 'manualNumber', this.value)"></td>
          <td>
            <input type="file" accept="image/*" onchange="handleWorkPhotoChange(${work.id}, event)" class="photo-input">
            <div class="photo-preview">${editPhotoPreview}</div>
          </td>
          <td><input type="text" data-field="title" value="${work.title || ''}" onchange="handleWorkChange(${work.id}, 'title', this.value)"></td>
          <td>
            <div class="price-input-group">
              <input type="text" data-field="price" value="${isUnsold ? '미판매' : (work.price || '')}" oninput="handlePriceInput(${work.id}, event)" onchange="handleWorkChange(${work.id}, 'price', this.value)">
              <button type="button" class="price-cancel-btn" data-tooltip="미판매" title="미판매" aria-label="미판매" onclick="setWorkNotForSale(${work.id}, this)">✕</button>
            </div>
          </td>
          <td><input data-field="quantity" type="number" min="0" value="${stockQuantity}" onchange="handleWorkChange(${work.id}, 'quantity', this.value)"></td>
          <td>${soldQuantity}</td>
          <td>${remainingQuantity}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
          </td>
        `
      };
    }

    if (work.saved || !canModifyWork) {
      return {
        className: 'work-saved-row',
        html: `
        ${checkboxCell}
        <td>${work.manualNumber || ''}</td>
        <td>${work.category || ''}</td>
        <td>${savedPhotoCell}</td>
        <td>${work.title || ''}</td>
        <td>${authorText || ''}</td>
        <td>${savedPriceCell}</td>
        <td>${work.materials || ''}</td>
        <td>${work.size || ''}</td>
        <td>${work.year || ''}</td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          ${duplicateButton}
          ${deleteButton}
        </td>
      `
      };
    }

    return {
      className: '',
      html: `
        ${checkboxCell}
        <td><input type="text" data-field="manualNumber" value="${work.manualNumber || ''}" onchange="handleWorkChange(${work.id}, 'manualNumber', this.value)"></td>
        <td><input type="text" data-field="category" value="${work.category || ''}" onchange="handleWorkChange(${work.id}, 'category', this.value)"></td>
        <td>
          <input type="file" accept="image/*" onchange="handleWorkPhotoChange(${work.id}, event)" class="photo-input">
          <div class="photo-preview">${editPhotoPreview}</div>
        </td>
        <td><input type="text" data-field="title" value="${work.title || ''}" onchange="handleWorkChange(${work.id}, 'title', this.value)"></td>
        <td>${authorInput}</td>
        <td>
          <div class="price-input-group">
            <input type="text" data-field="price" value="${isUnsold ? '미판매' : (work.price || '')}" oninput="handlePriceInput(${work.id}, event)" onchange="handleWorkChange(${work.id}, 'price', this.value)">
            <button type="button" class="price-cancel-btn" data-tooltip="미판매" title="미판매" aria-label="미판매" onclick="setWorkNotForSale(${work.id}, this)">✕</button>
          </div>
        </td>
        <td><input type="text" data-field="materials" value="${work.materials || ''}" onchange="handleWorkChange(${work.id}, 'materials', this.value)"></td>
        <td>
          <div class="size-input-group">
            <input type="text" data-field="sizeWidth" value="${sizeParts.width}" class="size-dimension-input" placeholder="가로" oninput="handleWorkSizeChange(${work.id}, 'width', this.value)">
            <span class="size-unit">cm x</span>
            <input type="text" data-field="sizeHeight" value="${sizeParts.height}" class="size-dimension-input" placeholder="세로" oninput="handleWorkSizeChange(${work.id}, 'height', this.value)">
            <span class="size-unit">cm</span>
          </div>
        </td>
        <td><input type="text" data-field="year" value="${work.year || ''}" onchange="handleWorkChange(${work.id}, 'year', this.value)"></td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          ${duplicateButton}
          <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
        </td>
      `
    };
  }

  const api = Object.freeze({ buildWorkRow });
  root.ExhibitionInventoryRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/inventory-backup-model.js */
(function initializeExhibitionInventoryBackupModel(root) {
  'use strict';

  const INVENTORY_BACKUP_KEY_PREFIX = 'exhibition-inventory-backup:';
  const LARGE_DROP_MIN_PREVIOUS_TOTAL = 20;
  const LARGE_DROP_MIN_ABSOLUTE = 15;
  const LARGE_DROP_RATIO = 0.7;
  const HEAVY_FIELDS = ['photoDataUrl', 'imageDataUrl', 'photoPreviewDataUrl', 'fileDataUrl', 'previewDataUrl'];

  function cloneJson(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return fallback;
    }
  }

  function stripLargePayloadFields(value) {
    if (!value || typeof value !== 'object') return;
    HEAVY_FIELDS.forEach((field) => {
      if (typeof value[field] === 'string' && value[field].length > 0) value[field] = '';
    });
    Object.keys(value).forEach((key) => {
      const child = value[key];
      if (Array.isArray(child)) {
        child.forEach((item) => stripLargePayloadFields(item));
      } else if (child && typeof child === 'object') {
        stripLargePayloadFields(child);
      }
    });
  }

  function getInventoryBackupStorageKey(exhibitionId) {
    const id = Number(exhibitionId);
    if (!Number.isFinite(id) || id <= 0) return '';
    return `${INVENTORY_BACKUP_KEY_PREFIX}${id}`;
  }

  function getInventoryListCounts(exhibition) {
    if (!exhibition || typeof exhibition !== 'object') return { art: 0, goods: 0, total: 0 };
    const art = Array.isArray(exhibition.artWorks)
      ? exhibition.artWorks.length
      : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
    const goods = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;
    return { art, goods, total: art + goods };
  }

  function normalizeInventoryBackupSnapshot(exhibition) {
    const snapshot = {
      id: exhibition?.id,
      artWorks: Array.isArray(exhibition?.artWorks)
        ? exhibition.artWorks
        : (Array.isArray(exhibition?.works) ? exhibition.works : []),
      goods: Array.isArray(exhibition?.goods) ? exhibition.goods : [],
      artSoldWorks: Array.isArray(exhibition?.artSoldWorks)
        ? exhibition.artSoldWorks
        : (Array.isArray(exhibition?.soldWorks) ? exhibition.soldWorks : []),
      soldGoods: Array.isArray(exhibition?.soldGoods) ? exhibition.soldGoods : []
    };
    const cloned = cloneJson(snapshot, null);
    if (!cloned) return null;
    stripLargePayloadFields(cloned);
    return cloned;
  }

  function isLargeUnexpectedInventoryDrop(previousExhibition, nextExhibition) {
    const previous = getInventoryListCounts(previousExhibition);
    const next = getInventoryListCounts(nextExhibition);
    if (previous.total < LARGE_DROP_MIN_PREVIOUS_TOTAL) return false;
    const dropped = previous.total - next.total;
    if (dropped < LARGE_DROP_MIN_ABSOLUTE) return false;
    if (dropped / previous.total < LARGE_DROP_RATIO) return false;
    const artWipe = previous.art >= 10 && next.art === 0;
    const goodsWipe = previous.goods >= 10 && next.goods === 0;
    return artWipe || goodsWipe || next.total <= Math.floor(previous.total * 0.3);
  }

  const api = Object.freeze({
    cloneJson,
    getInventoryBackupStorageKey,
    getInventoryListCounts,
    isLargeUnexpectedInventoryDrop,
    normalizeInventoryBackupSnapshot,
    stripLargePayloadFields
  });
  root.ExhibitionInventoryBackupModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/info-controller.js */
(function initializeExhibitionDetailInfoController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailInfoController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInfoControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const loadUsers = options.loadUsers;

    function ensureExhibitionInfoData() {
      const exhibition = options.getCurrentExhibition();
      if (typeof exhibition.artistNote !== 'string') exhibition.artistNote = '';
      if (typeof exhibition.invitationText !== 'string') exhibition.invitationText = '';
      if (typeof exhibition.artistNoteSaved !== 'boolean') exhibition.artistNoteSaved = false;
      if (typeof exhibition.invitationTextSaved !== 'boolean') exhibition.invitationTextSaved = false;
      if (!exhibition.artistInstagramMap || typeof exhibition.artistInstagramMap !== 'object' || Array.isArray(exhibition.artistInstagramMap)) {
        exhibition.artistInstagramMap = {};
      }
      if (typeof exhibition.artistInstagramSaved !== 'boolean') exhibition.artistInstagramSaved = false;
      return exhibition;
    }

    function getExhibitionArtistNamesForInstagram(exhibition) {
      const names = new Set();

      const participantNames = Array.isArray(exhibition.participants) ? exhibition.participants : [];
      participantNames.forEach((name) => {
        const trimmed = (name || '').toString().trim();
        if (trimmed) names.add(trimmed);
      });

      const assignedArtistIds = Array.isArray(exhibition.staff?.artists) ? exhibition.staff.artists : [];
      if (assignedArtistIds.length > 0) {
        try {
          const users = loadUsers();
          const byId = new Map(users.map((user) => [Number(user.id), (user.name || '').toString().trim()]));
          assignedArtistIds.forEach((id) => {
            const name = byId.get(Number(id));
            if (name) names.add(name);
          });
        } catch (error) {
          // Ignore user parsing failures.
        }
      }

      const map = exhibition.artistInstagramMap || {};
      Object.keys(map).forEach((name) => {
        const trimmed = (name || '').toString().trim();
        if (trimmed) names.add(trimmed);
      });

      return Array.from(names);
    }

    function renderExhibitionInfo(container) {
      const exhibition = ensureExhibitionInfoData();
      const participants = Array.isArray(exhibition.participants) ? exhibition.participants : [];
      const participantText = participants.length > 0 ? participants.join(', ') : '-';
      const artistNames = getExhibitionArtistNamesForInstagram(exhibition);
      const instagramMap = exhibition.artistInstagramMap || {};

      const artistLocked = !!exhibition.artistNoteSaved;
      const inviteLocked = !!exhibition.invitationTextSaved;
      const instagramLocked = !!exhibition.artistInstagramSaved;

      const artistButton = artistLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('artistNote')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('artistNote')">저장</button>`;
      const inviteButton = inviteLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('invitationText')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('invitationText')">저장</button>`;
      const instagramButton = instagramLocked
        ? `<button type="button" class="action-btn edit-btn" onclick="editExhibitionInfoField('artistInstagramMap')">수정</button>`
        : `<button type="button" class="action-btn approve-btn" onclick="saveExhibitionInfoField('artistInstagramMap')">저장</button>`;
      const instagramRowsHtml = artistNames.length > 0
        ? artistNames.map((artistName) => {
          const value = (instagramMap[artistName] || '').toString();
          return `
        <label class="artist-instagram-row">
          <span class="artist-instagram-name">${options.escapeHtml(artistName)}</span>
          <input
            type="text"
            class="artist-instagram-input"
            data-artist-name="${options.escapeHtml(artistName)}"
            value="${options.escapeHtml(value)}"
            placeholder="@instagram_id"
            ${instagramLocked ? 'readonly' : ''}
          >
        </label>
      `;
        }).join('')
        : '<p class="empty-state">참여 작가 정보가 없습니다.</p>';

      container.innerHTML = `
    <div class="exhibition-info-wrapper">
      <div class="works-sales-title">전시 정보</div>
      <div class="exhibition-info-grid">
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 제목</span>
          <strong class="exhibition-info-value">${options.escapeHtml(exhibition.title || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 기간</span>
          <strong class="exhibition-info-value">${options.escapeHtml(`${exhibition.startDate || ''} ~ ${exhibition.endDate || ''}`.trim() || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 유형</span>
          <strong class="exhibition-info-value">${options.escapeHtml(exhibition.type || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">참여 작가</span>
          <strong class="exhibition-info-value">${options.escapeHtml(participantText)}</strong>
        </div>
      </div>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>참여 작가 인스타그램</h3>
          ${instagramButton}
        </div>
        <div class="artist-instagram-list">
          ${instagramRowsHtml}
        </div>
      </section>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>작가 노트</h3>
          ${artistButton}
        </div>
        <textarea
          id="artist-note-input"
          class="exhibition-note-textarea"
          placeholder="작가 노트를 입력하세요."
          ${artistLocked ? 'readonly' : ''}
        >${options.escapeHtml(exhibition.artistNote || '')}</textarea>
      </section>

      <section class="exhibition-note-section">
        <div class="exhibition-note-header">
          <h3>초대의 글</h3>
          ${inviteButton}
        </div>
        <textarea
          id="invitation-text-input"
          class="exhibition-note-textarea"
          placeholder="초대의 글을 입력하세요."
          ${inviteLocked ? 'readonly' : ''}
        >${options.escapeHtml(exhibition.invitationText || '')}</textarea>
      </section>
    </div>
  `;
    }

    function saveExhibitionInfoField(fieldName) {
      const exhibition = ensureExhibitionInfoData();
      if (fieldName === 'artistInstagramMap') {
        const inputs = Array.from(document.querySelectorAll('.artist-instagram-input'));
        const nextMap = {};
        inputs.forEach((input) => {
          const artistName = (input.dataset.artistName || '').trim();
          if (!artistName) return;
          nextMap[artistName] = (input.value || '').trim();
        });

        exhibition.artistInstagramMap = nextMap;
        exhibition.artistInstagramSaved = true;

        if (state.exhibition) {
          state.exhibition.artistInstagramMap = exhibition.artistInstagramMap;
          state.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
        }

        options.saveExhibition();
        options.switchTab('exhibition-info');
        return;
      }

      const isArtistField = fieldName === 'artistNote';
      const inputId = isArtistField ? 'artist-note-input' : 'invitation-text-input';
      const input = document.getElementById(inputId);
      if (!input) return;

      const nextValue = (input.value || '').trim();
      if (isArtistField) {
        exhibition.artistNote = nextValue;
        exhibition.artistNoteSaved = true;
      } else {
        exhibition.invitationText = nextValue;
        exhibition.invitationTextSaved = true;
      }

      if (state.exhibition) {
        state.exhibition.artistNote = exhibition.artistNote;
        state.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
        state.exhibition.invitationText = exhibition.invitationText;
        state.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
      }

      options.saveExhibition();
      options.switchTab('exhibition-info');
    }

    function editExhibitionInfoField(fieldName) {
      const exhibition = ensureExhibitionInfoData();

      if (fieldName === 'artistInstagramMap') {
        exhibition.artistInstagramSaved = false;
      } else if (fieldName === 'artistNote') {
        exhibition.artistNoteSaved = false;
      } else {
        exhibition.invitationTextSaved = false;
      }

      if (state.exhibition) {
        state.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
        state.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
        state.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
      }

      options.saveExhibition();
      options.switchTab('exhibition-info');
    }

    return Object.freeze({
      ensureExhibitionInfoData,
      getExhibitionArtistNamesForInstagram,
      renderExhibitionInfo,
      saveExhibitionInfoField,
      editExhibitionInfoField
    });
  }

  return Object.freeze({ create });
});

/* exhibitions/detail/staff-controller.js */
(function initializeExhibitionDetailStaffController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailStaffController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStaffControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function getInviteRoleLabel(role) {
      if (role === 'planners') return '기획자';
      if (role === 'artists') return '작가';
      if (role === 'staffs') return '스탭';
      return '관계자';
    }

    function renderStaffManagement(container) {
      if (!options.canManageStaffRoles()) {
        const fallbackTab = options.getFirstAllowedTab() || 'exhibition-info';
        options.switchTab(fallbackTab);
        return;
      }

      const exhibition = options.getCurrentExhibition();
      const planners = exhibition.staff?.planners || [];
      const artists = exhibition.staff?.artists || [];
      const staffs = exhibition.staff?.staffs || [];

      const users = options.loadUsers();
      const candidates = users.filter(user => user.approved && options.normalizeAccountType(options.getEffectiveGalleryRole(user)) === '기획자/작가');

      const roleSection = (role, label, assignedIds) => {
        const section = document.createElement('section');
        section.className = 'role-section';

        const header = document.createElement('div');
        header.className = 'section-heading';
        header.innerHTML = `<h2>${label}</h2><button class="add-exhibition-btn small" onclick="openInviteModal('${role}')">+ 초대</button>`;
        section.appendChild(header);

        const list = document.createElement('div');
        list.className = 'role-list';

        if (assignedIds.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = '아직 초대된 사용자가 없습니다.';
          list.appendChild(empty);
        } else {
          assignedIds.forEach(userId => {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            const row = document.createElement('div');
            row.className = 'role-row';
            row.innerHTML = `
          <div>
            <p class="role-name">${user.name}</p>
            <p class="role-meta">${user.username} · ${user.email}</p>
          </div>
          <button class="action-btn delete-btn" onclick="removeStaffMember('${role}', ${user.id})">제거</button>
        `;
            list.appendChild(row);
          });
        }

        section.appendChild(list);
        return section;
      };

      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '전시 관계자 관리';
      wrapper.appendChild(title);

      wrapper.appendChild(roleSection('planners', '기획자', planners));
      wrapper.appendChild(roleSection('artists', '작가', artists));
      wrapper.appendChild(roleSection('staffs', '스탭', staffs));
      container.appendChild(wrapper);
    }

    function openInviteModal(role) {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      state.inviteRole = role;
      const exhibition = options.getCurrentExhibition();
      const users = options.loadUsers();

      document.getElementById('invite-modal-title').textContent = `${getInviteRoleLabel(role)} 초대`;
      document.getElementById('invite-modal-description').textContent = '모든 사용자 중에서 전시에 참여자를 선택하세요.';

      const listContainer = document.getElementById('invite-user-list');
      listContainer.innerHTML = '';

      const assignedIds = new Set(exhibition.staff?.[role] || []);

      state.inviteSearch = '';
      renderInviteUserList(users, assignedIds);
      document.getElementById('invite-search').value = '';
      document.getElementById('invite-modal').style.display = 'flex';
    }

    function closeInviteModal() {
      document.getElementById('invite-modal').style.display = 'none';
      state.inviteRole = null;
      state.inviteSearch = '';
    }

    function filterInviteUsers() {
      state.inviteSearch = document.getElementById('invite-search').value.trim().toLowerCase();
      const users = options.loadUsers();
      const exhibition = options.getCurrentExhibition();
      const assignedIds = new Set(exhibition.staff?.[state.inviteRole] || []);
      renderInviteUserList(users, assignedIds);
    }

    function renderInviteUserList(users, assignedIds) {
      const listContainer = document.getElementById('invite-user-list');
      listContainer.innerHTML = '';
      const search = state.inviteSearch;

      if (users.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">등록된 사용자가 없습니다.</p>';
        return;
      }

      let renderedCount = 0;

      users.forEach(user => {
        const label = options.normalizeAccountType(options.getEffectiveGalleryRole(user)) || '미지정';
        const text = `${user.name} ${user.username} ${user.email} ${label}`.toLowerCase();
        if (search && !text.includes(search)) return;

        const row = document.createElement('label');
        row.className = 'invite-user-row';
        row.innerHTML = `
      <input type="checkbox" value="${user.id}" ${assignedIds.has(user.id) ? 'checked' : ''}>
      <span>
        <strong>${user.name}</strong> (${user.username}) • ${user.email} • ${label}
      </span>
    `;
        listContainer.appendChild(row);
        renderedCount += 1;
      });

      if (renderedCount === 0) {
        listContainer.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
      }
    }

    function confirmInvite() {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      const role = state.inviteRole;
      if (!role) return;

      const checkboxes = Array.from(document.querySelectorAll('#invite-user-list input[type="checkbox"]'));
      const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.value));

      const exhibition = options.getCurrentExhibition();
      exhibition.staff = exhibition.staff || { planners: [], artists: [], staffs: [] };
      exhibition.staff[role] = Array.from(new Set(selectedIds));
      if (state.exhibition) {
        state.exhibition.staff = exhibition.staff;
      }
      options.saveExhibition();
      closeInviteModal();
      options.switchTab('staff');
    }

    function removeStaffMember(role, userId) {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      const exhibition = options.getCurrentExhibition();
      exhibition.staff[role] = (exhibition.staff[role] || []).filter(id => id !== userId);
      if (state.exhibition) {
        state.exhibition.staff = exhibition.staff;
      }
      options.saveExhibition();
      options.switchTab('staff');
    }

    return Object.freeze({
      getInviteRoleLabel,
      renderStaffManagement,
      openInviteModal,
      closeInviteModal,
      filterInviteUsers,
      renderInviteUserList,
      confirmInvite,
      removeStaffMember
    });
  }

  return Object.freeze({ create });
});

/* exhibitions/detail/files-controller.js */
(function initializeExhibitionDetailFilesController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailFilesController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFilesControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const URL = options.URL;
    const Date = options.Date;
    const Math = options.Math;

    function ensureExhibitionFilesData() {
      const exhibition = options.getCurrentExhibition();
      if (!Array.isArray(exhibition.filesDocs)) exhibition.filesDocs = [];
      if (!Array.isArray(exhibition.filesPromo)) exhibition.filesPromo = [];
      return exhibition;
    }

    function getFilesForView(view) {
      const exhibition = ensureExhibitionFilesData();
      return view === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
    }

    function getFilesViewLabel(view) {
      return view === 'promo' ? '홍보물' : '서류';
    }

    function switchFilesView(view) {
      state.filesView = view === 'promo' ? 'promo' : 'docs';
      options.switchTab('exhibition-files');
    }

    function renderExhibitionFiles(container) {
      const view = state.filesView === 'promo' ? 'promo' : 'docs';
      const activeFiles = getFilesForView(view);

      const cardsHtml = activeFiles.map((fileItem) => {
        const isPdf = isPdfLikeFile(fileItem.mimeType || '', fileItem.fileName || '', fileItem.fileDataUrl || fileItem.previewDataUrl || '') || fileItem.previewKind === 'pdf';
        const pdfSource = fileItem.fileDataUrl || fileItem.previewDataUrl || '';
        const canDeleteFile = options.canCurrentUserModifyOwnedRow(fileItem);
        const previewHtml = isPdf && pdfSource
          ? `<embed src="${pdfSource}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="exhibition-file-preview-pdf" />`
          : `<img src="${fileItem.previewDataUrl}" alt="${options.escapeAccountingHtml(fileItem.title || fileItem.fileName || '파일 미리보기')}" class="exhibition-file-preview-image">`;

        return `
    <article class="exhibition-file-card" title="${options.escapeAccountingHtml(fileItem.fileName || '')}">
      <div class="exhibition-file-preview-wrap">
        ${previewHtml}
      </div>
      <p class="exhibition-file-name">${options.escapeAccountingHtml(fileItem.title || fileItem.fileName || '제목 없음')}</p>
      <div class="exhibition-file-actions">
        <button type="button" class="action-btn edit-btn" onclick="downloadExhibitionFile('${view}', '${String(fileItem.id).replace(/'/g, "\\'")}')">다운로드</button>
        ${canDeleteFile ? `<button type="button" class="action-btn delete-btn" onclick="deleteExhibitionFile('${view}', '${String(fileItem.id).replace(/'/g, "\\'")}')">삭제</button>` : ''}
      </div>
    </article>
  `;
      }).join('');

      container.innerHTML = `
    <div class="works-sales-wrapper exhibition-files-wrapper">
      <div class="works-sales-title">전시 파일</div>
      <div class="works-sales-toggle-bar">
        <button type="button" class="works-sales-toggle-btn${view === 'docs' ? ' active' : ''}" onclick="switchFilesView('docs')">서류</button>
        <button type="button" class="works-sales-toggle-btn${view === 'promo' ? ' active' : ''}" onclick="switchFilesView('promo')">홍보물</button>
      </div>
      <p class="accounting-description">카드를 클릭하거나 파일을 드래그 앤 드롭해 업로드하세요.</p>
      <div class="exhibition-files-dropzone" ondragover="handleFilesDragOver(event)" ondragleave="handleFilesDragLeave(event)" ondrop="handleFilesDrop(event)">
        <div class="exhibition-files-grid" id="exhibition-files-grid">
          ${cardsHtml}
          <button type="button" class="exhibition-file-card exhibition-file-upload-card" onclick="openFileUploadModal('${view}')">
            <span class="exhibition-file-upload-plus">+</span>
            <span class="exhibition-file-upload-text">클릭하여 파일 업로드</span>
          </button>
        </div>
      </div>
    </div>
  `;
    }

    function isPdfLikeFile(mimeType, fileName, dataUrl) {
      const mime = String(mimeType || '').toLowerCase();
      const name = String(fileName || '').toLowerCase();
      const data = String(dataUrl || '').toLowerCase();
      return mime.includes('pdf') || name.endsWith('.pdf') || data.startsWith('data:application/pdf');
    }

    function triggerFileDownload(dataUrl, fileName) {
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function getFileDownloadName(fileItem, fallbackIndex) {
      const sourceName = (fileItem.fileName || '').trim();
      const title = (fileItem.title || '').trim();
      const extMatch = sourceName.match(/\.([a-zA-Z0-9]{1,8})$/);
      const ext = extMatch ? `.${extMatch[1]}` : '';
      const base = title || sourceName || `file-${fallbackIndex + 1}`;
      return ext && !base.toLowerCase().endsWith(ext.toLowerCase()) ? `${base}${ext}` : base;
    }

    function deleteExhibitionFile(view, fileId) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const targetList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      const target = targetList.find((item) => item.id === fileId);
      if (!target) return;
      if (!options.canCurrentUserModifyOwnedRow(target)) {
        options.alert('다른 사용자가 추가한 파일은 삭제할 수 없습니다.');
        return;
      }
      const next = targetList.filter((item) => item.id !== fileId);
      if (targetView === 'promo') exhibition.filesPromo = next;
      else exhibition.filesDocs = next;

      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }

      options.saveExhibition();
      options.switchTab('exhibition-files');
    }

    function deleteAllExhibitionFiles(view) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const currentList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      if (currentList.length === 0) return;

      let nextList = [];
      if (options.isArtistScopedUser()) {
        nextList = currentList.filter((item) => !options.canCurrentUserModifyOwnedRow(item));
        if (nextList.length === currentList.length) {
          options.alert('삭제할 수 있는 파일이 없습니다.');
          return;
        }
      }

      if (targetView === 'promo') exhibition.filesPromo = options.isArtistScopedUser() ? nextList : [];
      else exhibition.filesDocs = options.isArtistScopedUser() ? nextList : [];

      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }

      options.saveExhibition();
      options.switchTab('exhibition-files');
    }

    function downloadExhibitionFile(view, fileId) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const targetList = getFilesForView(targetView);
      const target = targetList.find((item) => item.id === fileId);
      if (!target) return;
      const dataUrl = target.fileDataUrl || target.previewDataUrl;
      triggerFileDownload(dataUrl, getFileDownloadName(target, 0));
    }

    function downloadAllExhibitionFiles(view) {
      const targetView = view === 'promo' ? 'promo' : 'docs';
      const targetList = getFilesForView(targetView);
      if (!targetList.length) return;
      targetList.forEach((item, index) => {
        const dataUrl = item.fileDataUrl || item.previewDataUrl;
        triggerFileDownload(dataUrl, getFileDownloadName(item, index));
      });
    }

    function openFileUploadModal(targetView, droppedFiles) {
      state.fileUploadTarget = targetView === 'promo' ? 'promo' : 'docs';
      setPendingUploadEntries(Array.isArray(droppedFiles) ? droppedFiles : []);
      const modal = document.getElementById('file-upload-modal');
      const modalTitle = document.getElementById('file-upload-modal-title');
      const modalDesc = document.getElementById('file-upload-modal-description');
      const input = document.getElementById('file-upload-input');
      if (modalTitle) modalTitle.textContent = `${getFilesViewLabel(state.fileUploadTarget)} 업로드`;
      if (modalDesc) modalDesc.textContent = `${getFilesViewLabel(state.fileUploadTarget)} 탭에 저장됩니다.`;
      if (input) input.value = '';
      updateFileUploadSelectedInfo();
      if (modal) modal.style.display = 'flex';
    }

    function closeFileUploadModal() {
      const modal = document.getElementById('file-upload-modal');
      const input = document.getElementById('file-upload-input');
      if (input) input.value = '';
      clearPendingUploadEntries();
      if (modal) modal.style.display = 'none';
    }

    function handleFileUploadInputChange(event) {
      const files = Array.from(event?.target?.files || []);
      setPendingUploadEntries(files);
      updateFileUploadSelectedInfo();
    }

    function updateFileUploadSelectedInfo() {
      const info = document.getElementById('file-upload-selected-info');
      if (!info) return;
      const count = state.pendingUploadEntries.length;
      if (count === 0) {
        info.textContent = '선택된 파일이 없습니다.';
        renderFileUploadPreviewList();
        return;
      }
      info.textContent = `${count}개 파일 선택됨`;
      renderFileUploadPreviewList();
    }

    function clearPendingUploadEntries() {
      (state.pendingUploadEntries || []).forEach((entry) => {
        if (entry && entry.objectUrl) {
          try {
            URL.revokeObjectURL(entry.objectUrl);
          } catch (error) {
            // Ignore revoke errors for stale object URLs.
          }
        }
      });
      state.pendingUploadEntries = [];
      state.pendingUploadFiles = [];
    }

    function getFileNameWithoutExtension(fileName) {
      const name = String(fileName || '').trim();
      if (!name) return '';
      const idx = name.lastIndexOf('.');
      return idx > 0 ? name.slice(0, idx) : name;
    }

    function createPendingUploadEntry(file, index) {
      const mime = (file.type || '').toLowerCase();
      const isImage = mime.startsWith('image/');
      const isPdf = isPdfLikeFile(mime, file.name || '', '');
      const needsObjectUrl = isImage || isPdf;
      const objectUrl = needsObjectUrl ? URL.createObjectURL(file) : '';
      return {
        id: `${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}`,
        file,
        title: '',
        previewKind: isPdf ? 'pdf' : (isImage ? 'image' : 'generic'),
        previewDataUrl: isPdf || isImage ? objectUrl : buildGenericFilePreviewDataUrl(file.name || ''),
        objectUrl
      };
    }

    function setPendingUploadEntries(files) {
      clearPendingUploadEntries();
      state.pendingUploadFiles = files;
      state.pendingUploadEntries = files.map((file, index) => createPendingUploadEntry(file, index));
    }

    function updatePendingUploadTitle(index, value) {
      const entry = state.pendingUploadEntries[index];
      if (!entry) return;
      entry.title = value;
    }

    function renderFileUploadPreviewList() {
      const list = document.getElementById('file-upload-preview-list');
      if (!list) return;
      const entries = state.pendingUploadEntries || [];
      if (entries.length === 0) {
        list.innerHTML = '';
        return;
      }
      list.innerHTML = entries.map((entry, index) => {
        const previewHtml = entry.previewKind === 'pdf'
          ? `<embed src="${entry.previewDataUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="file-upload-preview-thumb-pdf" />`
          : entry.previewKind === 'image'
            ? `<img src="${entry.previewDataUrl}" alt="파일 미리보기" class="file-upload-preview-thumb-image">`
            : `<img src="${entry.previewDataUrl}" alt="문서 미리보기" class="file-upload-preview-thumb-image">`;
        return `
      <div class="file-upload-preview-item">
        <div class="file-upload-preview-thumb-wrap">${previewHtml}</div>
        <div class="file-upload-preview-meta">
          <p class="file-upload-field-label">파일 제목 입력</p>
          <input type="text" class="auth-input file-upload-title-input" value="${options.escapeAccountingHtml(entry.title || '')}" placeholder="제목 입력" oninput="updatePendingUploadTitle(${index}, this.value)">
          <p class="file-upload-preview-filename">원본 파일명: ${options.escapeAccountingHtml(entry.file.name || '파일')}</p>
        </div>
      </div>
    `;
      }).join('');
    }

    function handleFilesDragOver(event) {
      event.preventDefault();
      const zone = event.currentTarget;
      if (zone) zone.classList.add('drag-over');
    }

    function handleFilesDragLeave(event) {
      const zone = event.currentTarget;
      if (zone) zone.classList.remove('drag-over');
    }

    function handleFilesDrop(event) {
      event.preventDefault();
      const zone = event.currentTarget;
      if (zone) zone.classList.remove('drag-over');
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length === 0) return;
      openFileUploadModal(state.filesView, files);
    }

    function buildGenericFilePreviewDataUrl(fileName) {
      const extension = (fileName.split('.').pop() || 'FILE').toUpperCase().slice(0, 5);
      const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="#f8fafc"/>
      <rect x="56" y="56" width="688" height="888" rx="34" fill="#ffffff" stroke="#d1d5db" stroke-width="8"/>
      <rect x="112" y="142" width="576" height="210" rx="26" fill="#e0e7ff"/>
      <text x="400" y="274" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif" font-size="88" font-weight="700" fill="#3730a3">${extension}</text>
      <rect x="112" y="410" width="488" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="464" width="560" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="518" width="452" height="28" rx="14" fill="#e5e7eb"/>
      <rect x="112" y="572" width="536" height="28" rx="14" fill="#e5e7eb"/>
    </svg>
  `;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    async function buildFileCardPreview(file) {
      const mimeType = (file.type || '').toLowerCase();
      const isPdf = isPdfLikeFile(mimeType, file.name || '', '');
      if (mimeType.startsWith('image/')) {
        const compact = await options.buildCompactPhotoPreview(file);
        return { previewDataUrl: compact.dataUrl, fileDataUrl: compact.dataUrl, previewKind: 'image', mimeType: compact.mimeType || file.type || '', byteSize: compact.byteSize || file.size || 0 };
      }
      if (isPdf) {
        const fileDataUrl = await options.readFileAsDataUrl(file);
        return { previewDataUrl: fileDataUrl, fileDataUrl, previewKind: 'pdf', mimeType: file.type || '', byteSize: Number.isFinite(file.size) ? file.size : 0 };
      }
      const fileDataUrl = await options.readFileAsDataUrl(file);
      return { previewDataUrl: buildGenericFilePreviewDataUrl(file.name || ''), fileDataUrl, previewKind: 'generic', mimeType: file.type || '', byteSize: Number.isFinite(file.size) ? file.size : 0 };
    }

    async function confirmFileUploadModal() {
      const entries = state.pendingUploadEntries || [];
      if (entries.length === 0) {
        options.alert('업로드할 파일을 먼저 선택해주세요.');
        return;
      }
      const targetView = state.fileUploadTarget === 'promo' ? 'promo' : 'docs';
      const exhibition = ensureExhibitionFilesData();
      const targetList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const file = entry.file;
        const preview = await buildFileCardPreview(file);
        const generatedTitle = (entry.title || '').trim() || file.name || '제목 없음';
        targetList.push({
          id: `${Date.now()}-${Math.floor(Math.random() * 100000)}-${i}`,
          title: generatedTitle,
          fileName: file.name || '',
          previewDataUrl: preview.previewDataUrl,
          fileDataUrl: preview.fileDataUrl,
          previewKind: preview.previewKind,
          mimeType: preview.mimeType,
          byteSize: preview.byteSize,
          createdByUserId: options.getCurrentUserId(),
          createdAt: new Date().toISOString()
        });
      }
      if (state.exhibition) {
        state.exhibition.filesDocs = exhibition.filesDocs;
        state.exhibition.filesPromo = exhibition.filesPromo;
      }
      options.saveExhibition();
      clearPendingUploadEntries();
      closeFileUploadModal();
      options.switchTab('exhibition-files');
    }

    return Object.freeze({
      ensureExhibitionFilesData, getFilesForView, getFilesViewLabel, switchFilesView,
      renderExhibitionFiles, isPdfLikeFile, triggerFileDownload, getFileDownloadName,
      deleteExhibitionFile, deleteAllExhibitionFiles, downloadExhibitionFile,
      downloadAllExhibitionFiles, openFileUploadModal, closeFileUploadModal,
      handleFileUploadInputChange, updateFileUploadSelectedInfo, clearPendingUploadEntries,
      getFileNameWithoutExtension, createPendingUploadEntry, setPendingUploadEntries,
      updatePendingUploadTitle, renderFileUploadPreviewList, handleFilesDragOver,
      handleFilesDragLeave, handleFilesDrop, buildGenericFilePreviewDataUrl,
      buildFileCardPreview, confirmFileUploadModal
    });
  }

  return Object.freeze({ create });
});

/* exhibitions/detail/inventory-state-controller.js */
(function initializeExhibitionDetailInventoryStateController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailInventoryStateController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInventoryStateControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;

    function getDefaultInventoryUiState() {
      return {
        workSearch: '',
        workAdvanced: false,
        salesSearch: '',
        salesAdvanced: false,
        workListExpanded: true,
        selectedWorkIds: [],
        selectedSalesIds: [],
        salesUndoStack: [],
        workUndoStack: [],
        salesEditSnapshotIds: [],
        salesSearchQuery: '',
        salesSearchResults: [],
        salesAddBuffer: [],
        salesSearchHighlightIndex: -1,
        workSortField: null,
        workSortDirection: 'asc',
        salesSortField: null,
        salesSortDirection: 'asc',
        unsavedWorkCount: 0,
        workEditSnapshotIds: [],
        lastWorkCheckboxIndex: null,
        lastSalesCheckboxIndex: null,
        workFilters: {
          title: '',
          artist: '',
          price: '',
          materials: '',
          size: '',
          year: '',
          category: ''
        },
        salesFilters: {
          manualNumber: '',
          title: '',
          author: '',
          soldDateFrom: '',
          soldDateTo: '',
          buyerName: '',
          buyerPhone: '',
          paymentMethod: ''
        }
      };
    }

    function cloneInventoryUiState(uiState) {
      return JSON.parse(JSON.stringify(uiState));
    }

    function initializeInventoryData(exhibition) {
      if (!exhibition) return;
      exhibition.artWorks = Array.isArray(exhibition.artWorks)
        ? exhibition.artWorks
        : (Array.isArray(exhibition.works) ? exhibition.works : []);
      exhibition.artSoldWorks = Array.isArray(exhibition.artSoldWorks)
        ? exhibition.artSoldWorks
        : (Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : []);
      exhibition.goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
      exhibition.soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods : [];

      if (!state.inventoryUiStateByMode.art) {
        state.inventoryUiStateByMode.art = cloneInventoryUiState(getDefaultInventoryUiState());
      }
      if (!state.inventoryUiStateByMode.goods) {
        state.inventoryUiStateByMode.goods = cloneInventoryUiState(getDefaultInventoryUiState());
      }
    }

    function persistActiveInventoryUiState() {
      const mode = state.inventoryMode;
      if (!mode) return;
      const target = {
        workSearch: state.workSearch,
        workAdvanced: state.workAdvanced,
        salesSearch: state.salesSearch,
        salesAdvanced: state.salesAdvanced,
        workListExpanded: state.workListExpanded,
        selectedWorkIds: state.selectedWorkIds,
        selectedSalesIds: state.selectedSalesIds,
        salesUndoStack: state.salesUndoStack,
        workUndoStack: state.workUndoStack,
        salesEditSnapshotIds: state.salesEditSnapshotIds,
        salesSearchQuery: state.salesSearchQuery,
        salesSearchResults: state.salesSearchResults,
        salesAddBuffer: state.salesAddBuffer,
        salesSearchHighlightIndex: state.salesSearchHighlightIndex,
        workSortField: state.workSortField,
        workSortDirection: state.workSortDirection,
        salesSortField: state.salesSortField,
        salesSortDirection: state.salesSortDirection,
        unsavedWorkCount: state.unsavedWorkCount,
        workEditSnapshotIds: state.workEditSnapshotIds,
        lastWorkCheckboxIndex: state.lastWorkCheckboxIndex,
        lastSalesCheckboxIndex: state.lastSalesCheckboxIndex,
        workFilters: state.workFilters,
        salesFilters: state.salesFilters
      };
      state.inventoryUiStateByMode[mode] = cloneInventoryUiState(target);
    }

    function restoreInventoryUiState(mode) {
      const snapshot = state.inventoryUiStateByMode[mode]
        || cloneInventoryUiState(getDefaultInventoryUiState());
      state.workSearch = snapshot.workSearch;
      state.workAdvanced = snapshot.workAdvanced;
      state.salesSearch = snapshot.salesSearch;
      state.salesAdvanced = snapshot.salesAdvanced;
      state.workListExpanded = snapshot.workListExpanded;
      state.selectedWorkIds = snapshot.selectedWorkIds;
      state.selectedSalesIds = snapshot.selectedSalesIds;
      state.salesUndoStack = snapshot.salesUndoStack;
      state.workUndoStack = snapshot.workUndoStack;
      state.salesEditSnapshotIds = snapshot.salesEditSnapshotIds;
      state.salesSearchQuery = snapshot.salesSearchQuery;
      state.salesSearchResults = snapshot.salesSearchResults;
      state.salesAddBuffer = snapshot.salesAddBuffer;
      state.salesSearchHighlightIndex = snapshot.salesSearchHighlightIndex;
      state.workSortField = snapshot.workSortField;
      state.workSortDirection = snapshot.workSortDirection;
      state.salesSortField = snapshot.salesSortField;
      state.salesSortDirection = snapshot.salesSortDirection;
      state.unsavedWorkCount = snapshot.unsavedWorkCount;
      state.workEditSnapshotIds = snapshot.workEditSnapshotIds;
      state.lastWorkCheckboxIndex = snapshot.lastWorkCheckboxIndex;
      state.lastSalesCheckboxIndex = snapshot.lastSalesCheckboxIndex;
      state.workFilters = snapshot.workFilters;
      state.salesFilters = snapshot.salesFilters;
    }

    function syncInventoryMode(mode) {
      const exhibition = options.getCurrentExhibition();
      initializeInventoryData(exhibition);
      persistActiveInventoryUiState();

      if (state.inventoryMode === 'goods') {
        exhibition.goods = Array.isArray(exhibition.works) ? exhibition.works : exhibition.goods;
        exhibition.soldGoods = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.soldGoods;
      } else {
        exhibition.artWorks = Array.isArray(exhibition.works) ? exhibition.works : exhibition.artWorks;
        exhibition.artSoldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.artSoldWorks;
      }

      state.inventoryMode = mode;

      if (mode === 'goods') {
        exhibition.works = exhibition.goods;
        exhibition.soldWorks = exhibition.soldGoods;
      } else {
        exhibition.works = exhibition.artWorks;
        exhibition.soldWorks = exhibition.artSoldWorks;
      }

      restoreInventoryUiState(mode);
    }

    return Object.freeze({
      getDefaultInventoryUiState,
      cloneInventoryUiState,
      initializeInventoryData,
      persistActiveInventoryUiState,
      restoreInventoryUiState,
      syncInventoryMode
    });
  }

  return Object.freeze({ create });
});

/* exhibitions/detail/tabs-controller.js */
(function initializeExhibitionDetailTabsController(root) {
  'use strict';

  function applyTabVisibilityByPermission(options) {
    options.document.querySelectorAll('.tab-button').forEach((button) => {
      const tab = button.getAttribute('data-tab') || '';
      button.style.display = options.canAccessTab(tab) ? '' : 'none';
    });
  }

  function switchTab(tabName, options) {
    const state = options.state;

    if (!options.canAccessTab(tabName)) {
      options.applyTabVisibilityByPermission();
      const fallbackTab = options.getFirstAllowedTab();
      if (!fallbackTab) {
        options.alertNoAccess();
        options.redirectToExhibitions();
        return;
      }
      tabName = fallbackTab;
    }

    if (tabName === 'works') {
      state.currentTab = 'inventory-list';
      state.inventoryListView = 'art';
      options.syncInventoryMode('art');
    } else if (tabName === 'goods') {
      state.currentTab = 'inventory-list';
      state.inventoryListView = 'goods';
      options.syncInventoryMode('goods');
    } else if (tabName === 'sales' || tabName === 'inventory-sales') {
      state.currentTab = 'inventory-sales';
      options.syncInventoryMode('art');
    } else if (tabName === 'inventory-list') {
      state.currentTab = 'inventory-list';
      if (!['art', 'goods'].includes(state.inventoryListView)) {
        state.inventoryListView = 'art';
      }
      options.syncInventoryMode(state.inventoryListView);
    } else {
      state.currentTab = tabName;
    }

    if (state.currentTab === 'inventory-list') {
      options.saveLastViewedExhibitionTab(options.getCurrentInventoryListTabName());
    } else {
      options.saveLastViewedExhibitionTab(state.currentTab);
    }

    options.document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-tab') === state.currentTab);
    });

    const content = options.document.getElementById('tab-content');
    if (!content) return;
    content.innerHTML = '';

    if (tabName === 'staff') {
      options.renderStaffManagement(content);
    } else if (tabName === 'exhibition-info') {
      options.renderExhibitionInfo(content);
    } else if (tabName === 'works' || tabName === 'goods' || tabName === 'inventory-list') {
      options.renderInventoryListManagement(content);
    } else if (tabName === 'sales' || tabName === 'inventory-sales') {
      options.renderInventorySalesManagement(content);
    } else if (tabName === 'exhibition-files') {
      options.renderExhibitionFiles(content);
    } else if (tabName === 'exhibition-accounting') {
      options.renderExhibitionAccounting(content);
    } else if (tabName === 'exhibition-backup') {
      options.renderExhibitionBackup(content);
    }
  }

  const api = Object.freeze({
    applyTabVisibilityByPermission,
    switchTab
  });
  root.ExhibitionDetailTabsController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/sales-add-controller.js */
(function initializeExhibitionDetailSalesAddController(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const schedule = options.setTimeout;

    function resetSalesAddCommonBuyerState() {
      state.salesAddApplyCommonBuyer = false;
      state.salesAddCommonBuyerName = '';
      state.salesAddCommonBuyerPhone = '';
      state.salesAddCommonPaymentMethod = '';
    }

    function renderSalesAddCommonBuyerSection() {
      const checkbox = document.getElementById('sales-add-apply-common-buyer');
      const fieldsSection = document.getElementById('sales-add-common-buyer-fields');
      const buyerNameInput = document.getElementById('sales-add-common-buyer-name');
      const buyerPhoneInput = document.getElementById('sales-add-common-buyer-phone');
      const paymentMethodSelect = document.getElementById('sales-add-common-payment-method');

      const enabled = !!state.salesAddApplyCommonBuyer;

      if (checkbox) checkbox.checked = enabled;
      if (fieldsSection) fieldsSection.hidden = !enabled;
      if (buyerNameInput) buyerNameInput.value = state.salesAddCommonBuyerName || '';
      if (buyerPhoneInput) buyerPhoneInput.value = state.salesAddCommonBuyerPhone || '';
      if (paymentMethodSelect) paymentMethodSelect.value = state.salesAddCommonPaymentMethod || '';
    }

    function handleSalesAddCommonBuyerToggle(checked) {
      state.salesAddApplyCommonBuyer = !!checked;
      renderSalesAddCommonBuyerSection();
    }

    function handleSalesAddCommonBuyerFieldChange(field, value) {
      if (field === 'buyerPhone') {
        const formatted = options.formatKoreanPhone(value);
        state.salesAddCommonBuyerPhone = formatted;
        const phoneInput = document.getElementById('sales-add-common-buyer-phone');
        if (phoneInput && phoneInput.value !== formatted) {
          phoneInput.value = formatted;
        }
        return;
      }

      if (field === 'buyerName') {
        state.salesAddCommonBuyerName = value || '';
        return;
      }

      if (field === 'paymentMethod') {
        state.salesAddCommonPaymentMethod = value || '';
      }
    }

    function openSalesAddModal() {
      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesAddBuffer = [];
      resetSalesAddCommonBuyerState();
      renderSalesAddSearchResults();
      renderSalesAddBuffer();
      renderSalesAddCommonBuyerSection();

      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        schedule(() => input.focus(), 0);
      }

      const modal = document.getElementById('sales-add-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeSalesAddModal() {
      const modal = document.getElementById('sales-add-modal');
      if (modal) modal.style.display = 'none';
      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesAddBuffer = [];
      resetSalesAddCommonBuyerState();
    }

    function handleSalesAddSearchInput(value) {
      state.salesSearchQuery = value;
      state.salesSearchResults = options.getSalesSearchResults(value);
      state.salesSearchHighlightIndex = -1;
      renderSalesAddSearchResults();
    }

    function handleSalesAddSearchKeydown(event) {
      const results = state.salesSearchResults;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (results.length === 0) return;
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        let next = state.salesSearchHighlightIndex;
        do {
          next += dir;
        } while (next >= 0 && next < results.length && !!options.getSalesPopupWorkDisabledReason(results[next]));
        state.salesSearchHighlightIndex = Math.max(-1, Math.min(results.length - 1, next));
        renderSalesAddSearchResults();
        return;
      }

      if (event.key !== 'Enter') return;
      event.preventDefault();

      const hi = state.salesSearchHighlightIndex;
      if (hi >= 0 && hi < results.length && !options.getSalesPopupWorkDisabledReason(results[hi])) {
        addWorkToSalesBuffer(results[hi]);
        return;
      }

      const query = (state.salesSearchQuery || '').trim().toLowerCase();
      if (!query || results.length === 0) return;

      const exact = results.find(work => {
        const number = (work.manualNumber || '').toString().trim().toLowerCase();
        const title = (work.title || '').toString().trim().toLowerCase();
        return (number === query || title === query) && !options.getSalesPopupWorkDisabledReason(work);
      });
      const firstAvailable = results.find(work => !options.getSalesPopupWorkDisabledReason(work));
      addWorkToSalesBuffer(exact || firstAvailable);
    }

    function addWorkToSalesBuffer(work) {
      if (!work) return;
      if (options.getSalesPopupWorkDisabledReason(work)) return;
      const exists = state.salesAddBuffer.some(item => item.workId === work.id && item.itemType === work.itemType);
      if (exists) return;

      state.salesAddBuffer.push({
        bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        workId: work.id,
        itemType: work.itemType || '작품',
        manualNumber: work.manualNumber || '',
        category: work.category || '',
        photoName: work.photoName || '',
        photoUrl: work.photoUrl || '',
        photoPreviewUrl: work.photoPreviewUrl || '',
        photoDataUrl: work.photoDataUrl || '',
        photoPreviewDataUrl: work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work),
        title: work.title || '',
        author: work.author || '',
        price: work.price || '',
        soldQuantity: work.itemType === '굿즈' ? 1 : 1,
        madeToOrder: false
      });

      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesSearchHighlightIndex = -1;
      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        input.focus();
      }

      renderSalesAddSearchResults();
      renderSalesAddBuffer();
    }

    function addMadeToOrderWorkToSalesBuffer(work) {
      if (!work) return;
      const disabledReason = options.getSalesPopupWorkDisabledReason(work);
      if (!disabledReason) return;

      state.salesAddBuffer.push({
        bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        workId: work.id,
        itemType: work.itemType || '작품',
        manualNumber: work.manualNumber || '',
        category: work.category || '',
        photoName: work.photoName || '',
        photoUrl: work.photoUrl || '',
        photoPreviewUrl: work.photoPreviewUrl || '',
        photoDataUrl: work.photoDataUrl || '',
        photoPreviewDataUrl: work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work),
        title: work.title || '',
        author: work.author || '',
        price: work.price || '',
        soldQuantity: work.itemType === '굿즈' ? 1 : 1,
        madeToOrder: true
      });

      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesSearchHighlightIndex = -1;
      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        input.focus();
      }

      renderSalesAddSearchResults();
      renderSalesAddBuffer();
    }

    function addMadeToOrderFromSearchResult(workId, itemType, event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      const results = state.salesSearchResults || [];
      const work = results.find((item) => item.id === workId && (item.itemType || '작품') === itemType)
        || options.getSalesSearchResults('__all__').find((item) => item.id === workId && (item.itemType || '작품') === itemType);
      if (!work) return;
      addMadeToOrderWorkToSalesBuffer(work);
    }

    function renderSalesAddSearchResults() {
      const container = document.getElementById('sales-add-search-results');
      if (!container) return;

      const query = (state.salesSearchQuery || '').trim();
      const results = state.salesSearchResults;
      container.innerHTML = '';

      if (!query) {
        container.innerHTML = '<p class="empty-state">작품/굿즈 번호 또는 제목으로 검색하세요.</p>';
        return;
      }

      if (results.length === 0) {
        container.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
        return;
      }

      const hi = state.salesSearchHighlightIndex;
      results.forEach((work, idx) => {
        const disabledReason = options.getSalesPopupWorkDisabledReason(work);
        const isDisabled = !!disabledReason;
        const tagText = disabledReason === 'alreadySold' ? '판매된 작품' : '미판매';
        const metaText = isDisabled
          ? `분류: ${work.itemType || '작품'} · ${work.author || '-'} · <span class="sales-status-tag-group"><span class="sales-not-for-sale-tag">${tagText}</span><button type="button" class="sales-made-to-order-btn" onclick="addMadeToOrderFromSearchResult(${work.id}, '${work.itemType || '작품'}', event)">주문제작</button></span>`
          : `분류: ${work.itemType || '작품'} · ${work.author || '-'} · ${work.price || '-'}`;
        const row = document.createElement('div');
        row.className = 'sales-search-result-row'
          + (idx === hi ? ' sales-search-result-highlighted' : '')
          + (isDisabled ? ' sales-search-result-disabled' : '');
        if (isDisabled) {
          row.setAttribute('aria-disabled', 'true');
          row.onclick = null;
        } else {
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.onclick = () => addWorkToSalesBuffer(work);
        }
        row.innerHTML = `
          <span class="sales-search-result-number">${work.manualNumber || '-'}</span>
          <span class="sales-search-result-title">${work.title || '제목 없음'}</span>
          <span class="sales-search-result-meta">${metaText}</span>
        `;
        container.appendChild(row);
      });

      if (hi >= 0) {
        const highlighted = container.querySelector('.sales-search-result-highlighted');
        if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderSalesAddBuffer() {
      const container = document.getElementById('sales-add-selected-list');
      const countEl = document.getElementById('sales-add-selected-count');
      const tickerEl = document.getElementById('sales-add-selected-ticker');
      if (!container || !countEl) return;

      const items = state.salesAddBuffer;
      countEl.textContent = `${items.length}개 선택됨`;
      updateSalesAddSelectedTicker(items, tickerEl);
      container.innerHTML = '';

      if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">아직 선택된 작품이 없습니다.</p>';
        return;
      }

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'sales-selected-row';
        const rowKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        const numberText = item.madeToOrder
          ? `<span class="sales-number-with-badge"><span>${item.manualNumber || '-'}</span><span class="sales-made-to-order-square-badge"><span>주문</span><span>제작</span></span></span>`
          : (item.manualNumber || '-');
        const titleText = item.title || '제목 없음';
        row.innerHTML = `
          <span class="sales-search-result-number">${numberText}</span>
          <span class="sales-search-result-title">${titleText}</span>
          <div class="sales-selected-actions">
            <span class="sales-search-result-meta">분류: ${item.itemType || '작품'} · ${item.author || '-'} · ${item.price || '-'}</span>
            ${item.itemType === '굿즈' ? `<input type="number" min="1" value="${options.parseSoldQuantity(item.soldQuantity)}" onchange="updateSalesBufferQuantity('${rowKey}', this.value)" style="width:88px;padding:4px 8px;border:1px solid #ddd;border-radius:8px;">` : ''}
            <button type="button" class="sales-selected-remove-btn" title="목록에서 제거" aria-label="목록에서 제거" onclick="removeWorkFromSalesBuffer('${rowKey}')">−</button>
          </div>
        `;
        container.appendChild(row);
      });
    }

    function updateSalesAddSelectedTicker(items, tickerEl) {
      const targetTicker = tickerEl || document.getElementById('sales-add-selected-ticker');
      if (!targetTicker) return;

      const safeItems = Array.isArray(items) ? items : [];
      const totalAmount = safeItems.reduce((sum, item) => {
        const unitPrice = options.parsePriceToNumber(item?.price);
        const quantity = options.normalizeSoldItemType(item) === '굿즈' ? options.parseSoldQuantity(item?.soldQuantity) : 1;
        return sum + (unitPrice * quantity);
      }, 0);

      targetTicker.textContent = `선택 ${safeItems.length}건 · 합계 ${options.formatCurrencyKrw(totalAmount)}`;
    }

    function updateSalesBufferQuantity(bufferKey, value) {
      const target = state.salesAddBuffer.find((item) => {
        const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        return itemKey === bufferKey;
      });
      if (!target) return;
      target.soldQuantity = options.parseSoldQuantity(value);
      updateSalesAddSelectedTicker(state.salesAddBuffer);
    }

    function removeWorkFromSalesBuffer(bufferKey) {
      state.salesAddBuffer = state.salesAddBuffer.filter((item) => {
        const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        return itemKey !== bufferKey;
      });
      renderSalesAddBuffer();
    }

    function confirmSalesAddModal() {
      const items = state.salesAddBuffer;
      if (!items || items.length === 0) {
        closeSalesAddModal();
        return;
      }

      const applyCommonBuyer = !!state.salesAddApplyCommonBuyer;
      const commonBuyerName = applyCommonBuyer
        ? (state.salesAddCommonBuyerName || '').trim()
        : '';
      const commonBuyerPhone = applyCommonBuyer
        ? options.formatKoreanPhone((state.salesAddCommonBuyerPhone || '').trim())
        : '';
      const commonPaymentMethod = applyCommonBuyer
        ? (state.salesAddCommonPaymentMethod || '').trim()
        : '';

      const exhibition = options.getCurrentExhibition();
      const soldWorks = options.ensureSoldWorksArray();
      options.pushSalesUndoSnapshot();
      const soldAtKst = options.getCurrentKstDateTimeString();

      items.forEach(item => {
        soldWorks.push({
          id: options.now() + Math.floor(options.random() * 100000),
          createdByUserId: options.getCurrentUserId(),
          workId: item.workId,
          itemType: item.itemType || '작품',
          manualNumber: item.manualNumber,
          category: item.category || '',
          photoName: item.photoName,
          photoUrl: item.photoUrl || '',
          photoPreviewUrl: item.photoPreviewUrl || '',
          photoDataUrl: item.photoDataUrl,
          photoPreviewDataUrl: item.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(item),
          title: item.title,
          author: item.author,
          price: item.price,
          soldQuantity: options.parseSoldQuantity(item.soldQuantity),
          soldAtKst,
          buyerName: commonBuyerName,
          buyerPhone: commonBuyerPhone,
          paymentMethod: commonPaymentMethod,
          paymentMethodEtc: '',
          madeToOrder: !!item.madeToOrder,
          note: '',
          saved: false
        });
      });

      if (state.exhibition) {
        state.exhibition.soldWorks = soldWorks;
      }
      options.saveExhibition();
      closeSalesAddModal();
      if (options.getCurrentTab() === 'exhibition-accounting') {
        options.switchTab('exhibition-accounting');
      } else {
        options.renderSoldWorkRows();
      }
    }

    return Object.freeze({
      resetSalesAddCommonBuyerState,
      renderSalesAddCommonBuyerSection,
      handleSalesAddCommonBuyerToggle,
      handleSalesAddCommonBuyerFieldChange,
      openSalesAddModal,
      closeSalesAddModal,
      handleSalesAddSearchInput,
      handleSalesAddSearchKeydown,
      addWorkToSalesBuffer,
      addMadeToOrderWorkToSalesBuffer,
      addMadeToOrderFromSearchResult,
      renderSalesAddSearchResults,
      renderSalesAddBuffer,
      updateSalesAddSelectedTicker,
      updateSalesBufferQuantity,
      removeWorkFromSalesBuffer,
      confirmSalesAddModal
    });
  }

  const api = Object.freeze({ create });
  root.ExhibitionDetailSalesAddController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/grid-navigation.js */
(function initializeExhibitionDetailGridNavigation(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function isNavigableListTbodyId(tbodyId) {
      return tbodyId === 'works-tbody' || tbodyId === 'sold-works-tbody';
    }

    function getGridCellFromElement(element) {
      if (!element || typeof element.closest !== 'function') return null;
      return element.closest('#works-tbody td, #sold-works-tbody td');
    }

    function getGridMetaFromCell(cell) {
      if (!cell) return null;
      const row = cell.closest('tr');
      const tbody = cell.closest('tbody');
      if (!row || !tbody || !isNavigableListTbodyId(tbody.id)) return null;
      if (row.querySelector('.no-users')) return null;

      const cells = Array.from(row.querySelectorAll('td'));
      const colIndex = cells.indexOf(cell);
      if (colIndex === -1) return null;

      const rowIdAttr = tbody.id === 'works-tbody' ? 'data-work-id' : 'data-sold-id';
      const rowId = row.getAttribute(rowIdAttr);
      if (!rowId) return null;

      return {
        tbodyId: tbody.id,
        rowId,
        colIndex
      };
    }

    function updateGridNavAnchorFromCell(cell) {
      const meta = getGridMetaFromCell(cell);
      if (!meta) return;
      state.gridNavAnchor = meta;
    }

    function getGridEntryControl(cell) {
      if (!cell) return null;
      return cell.querySelector('input:not([type="checkbox"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    }

    function focusGridCell(cell, preferEntry) {
      if (!cell) return;

      if (preferEntry) {
        const control = getGridEntryControl(cell);
        if (control) {
          control.focus();
          if (control.tagName === 'INPUT' && control.type === 'text' && typeof control.select === 'function') {
            control.select();
          }
          updateGridNavAnchorFromCell(cell);
          return;
        }
      }

      cell.tabIndex = -1;
      cell.focus({ preventScroll: true });
      updateGridNavAnchorFromCell(cell);
    }

    function findGridCellByAnchor(anchor) {
      if (!anchor || !isNavigableListTbodyId(anchor.tbodyId)) return null;
      const tbody = document.getElementById(anchor.tbodyId);
      if (!tbody) return null;

      const rowAttr = anchor.tbodyId === 'works-tbody' ? 'data-work-id' : 'data-sold-id';
      const row = Array.from(tbody.querySelectorAll('tr')).find((candidate) => candidate.getAttribute(rowAttr) === String(anchor.rowId));
      if (!row) return null;

      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length === 0) return null;
      const boundedCol = Math.max(0, Math.min(Number(anchor.colIndex) || 0, cells.length - 1));
      return cells[boundedCol] || null;
    }

    function getCurrentGridCell(targetElement) {
      const directCell = getGridCellFromElement(targetElement);
      if (directCell) return directCell;
      return findGridCellByAnchor(state.gridNavAnchor);
    }

    function getGridRowsFromCell(cell) {
      const tbody = cell?.closest('tbody');
      if (!tbody) return [];
      return Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelectorAll('td').length > 0 && !row.querySelector('.no-users'));
    }

    function getAdjacentGridCell(cell, key) {
      const row = cell?.closest('tr');
      if (!row) return null;
      const rows = getGridRowsFromCell(cell);
      const rowIndex = rows.indexOf(row);
      if (rowIndex === -1) return null;

      const cells = Array.from(row.querySelectorAll('td'));
      const colIndex = cells.indexOf(cell);
      if (colIndex === -1) return null;

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const nextCol = key === 'ArrowLeft' ? colIndex - 1 : colIndex + 1;
        if (nextCol < 0 || nextCol >= cells.length) return null;
        return cells[nextCol] || null;
      }

      const nextRowIndex = key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
      if (nextRowIndex < 0 || nextRowIndex >= rows.length) return null;
      const nextRowCells = Array.from(rows[nextRowIndex].querySelectorAll('td'));
      if (nextRowCells.length === 0) return null;
      return nextRowCells[Math.min(colIndex, nextRowCells.length - 1)] || null;
    }

    function setPendingGridFocus(tbodyId, rowId, colIndex) {
      state.pendingGridFocus = {
        tbodyId,
        rowId: String(rowId),
        colIndex: Number(colIndex) || 0
      };
    }

    function applyPendingGridFocusForTbody(tbodyId) {
      const pending = state.pendingGridFocus;
      if (!pending || pending.tbodyId !== tbodyId) return;
      const targetCell = findGridCellByAnchor(pending);
      if (!targetCell) return;
      state.pendingGridFocus = null;
      focusGridCell(targetCell, true);
    }

    function refreshGridKeyboardNavigation(tbodyId) {
      if (!isNavigableListTbodyId(tbodyId)) return;
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;

      tbody.querySelectorAll('td').forEach((cell) => {
        cell.classList.add('keyboard-grid-cell');
      });

      applyPendingGridFocusForTbody(tbodyId);
    }

    function handleGridKeyboardNavigation(event) {
      const salesAddModal = document.getElementById('sales-add-modal');
      if (salesAddModal && salesAddModal.style.display === 'flex') {
        return;
      }

      const key = event.key;
      const isArrowKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
      const isEnterKey = key === 'Enter';
      if (!isArrowKey && !isEnterKey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      const cell = getCurrentGridCell(target);
      if (!cell) return;

      if (isEnterKey) {
        if (target && typeof target.matches === 'function' && target.matches('button, input[type="checkbox"], input[type="file"]')) {
          return;
        }
        event.preventDefault();
        options.startCellEditFromEnter(cell);
        return;
      }

      event.preventDefault();
      const nextCell = getAdjacentGridCell(cell, key);
      if (!nextCell) return;
      focusGridCell(nextCell, true);
    }

    function handleGridCellClick(event) {
      const cell = getGridCellFromElement(event.target);
      if (!cell) return;

      updateGridNavAnchorFromCell(cell);
      if (event.target && typeof event.target.closest === 'function' && event.target.closest('input, textarea, select, button, a, label')) {
        return;
      }

      focusGridCell(cell, false);
    }

    function handleGridCellFocusIn(event) {
      const cell = getGridCellFromElement(event.target);
      if (!cell) return;
      updateGridNavAnchorFromCell(cell);
    }

    return Object.freeze({
      isNavigableListTbodyId,
      getGridCellFromElement,
      getGridMetaFromCell,
      updateGridNavAnchorFromCell,
      getGridEntryControl,
      focusGridCell,
      findGridCellByAnchor,
      getCurrentGridCell,
      getGridRowsFromCell,
      getAdjacentGridCell,
      setPendingGridFocus,
      applyPendingGridFocusForTbody,
      refreshGridKeyboardNavigation,
      handleGridKeyboardNavigation,
      handleGridCellClick,
      handleGridCellFocusIn
    });
  }

  const api = Object.freeze({ create });
  root.ExhibitionDetailGridNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/works-view.js */
(function initializeExhibitionDetailWorksView(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function renderInventoryListManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '작품 / 굿즈 목록';
      wrapper.appendChild(title);

      const toggleBar = document.createElement('div');
      toggleBar.className = 'works-sales-toggle-bar';
      toggleBar.innerHTML = `
        <button type="button" class="works-sales-toggle-btn${state.inventoryListView === 'art' ? ' active' : ''}" onclick="switchTab('works')">작품 목록</button>
        <button type="button" class="works-sales-toggle-btn${state.inventoryListView === 'goods' ? ' active' : ''}" onclick="switchTab('goods')">굿즈 목록</button>
      `;
      wrapper.appendChild(toggleBar);

      const innerContent = document.createElement('div');
      innerContent.className = 'works-sales-subcontent';
      wrapper.appendChild(innerContent);

      container.appendChild(wrapper);

      renderWorksManagement(innerContent);
    }

    function renderWorksManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-wrapper';
      const isGoodsMode = state.inventoryMode === 'goods';

      const searchBar = document.createElement('div');
      searchBar.className = 'works-search-bar';
      searchBar.innerHTML = `
        <div class="works-search-row">
          <input id="work-search" type="text" class="works-search" placeholder="작품명, 작가, 재료 등 검색" value="${state.workSearch}" oninput="handleWorkSearchInput(this.value)">
          <button class="modal-btn modal-approve" onclick="toggleWorkAdvanced()">${state.workAdvanced ? '간단 검색' : '고급 검색'}</button>
        </div>
        <div id="advanced-search-panel" class="advanced-search-panel ${state.workAdvanced ? 'active' : ''}">
          <div class="advanced-search-grid">
            <label>제목 <input type="text" id="filter-title" value="${state.workFilters.title}" onchange="handleAdvancedFilter('title', this.value)"></label>
            <label>작가 <input type="text" id="filter-artist" value="${state.workFilters.artist}" onchange="handleAdvancedFilter('artist', this.value)"></label>
            <label>가격 <input type="text" id="filter-price" value="${state.workFilters.price}" onchange="handleAdvancedFilter('price', this.value)"></label>
            <label>재료 <input type="text" id="filter-materials" value="${state.workFilters.materials}" onchange="handleAdvancedFilter('materials', this.value)"></label>
            <label>크기 <input type="text" id="filter-size" value="${state.workFilters.size}" onchange="handleAdvancedFilter('size', this.value)"></label>
            <label>연도 <input type="text" id="filter-year" value="${state.workFilters.year}" onchange="handleAdvancedFilter('year', this.value)"></label>
            <label>카테고리 <input type="text" id="filter-category" value="${state.workFilters.category}" onchange="handleAdvancedFilter('category', this.value)"></label>
          </div>
          <div class="advanced-search-actions">
            <button class="modal-btn modal-approve" onclick="applyWorkFilters()">검색</button>
            <button class="modal-btn modal-cancel" onclick="resetWorkFilters()">초기화</button>
          </div>
        </div>
      `;
      wrapper.appendChild(searchBar);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'works-action-row';

      const addButton = document.createElement('button');
      addButton.className = 'works-action-btn';
      addButton.textContent = isGoodsMode ? '+ 굿즈 추가' : '+ 작품 추가';
      addButton.onclick = () => options.addWorkRow();
      actionsRow.appendChild(addButton);

      const actionGroup = document.createElement('div');
      actionGroup.className = 'works-action-group';

      const selectAllButton = document.createElement('button');
      selectAllButton.className = 'works-action-btn works-action-btn-secondary';
      selectAllButton.id = 'work-select-all-btn';
      const visibleWorks = options.getVisibleWorks();
      const allVisibleSelected = visibleWorks.length > 0 && visibleWorks.every(work => state.selectedWorkIds.includes(work.id));
      selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
      selectAllButton.onclick = () => options.toggleSelectAllVisibleWorks();
      actionGroup.appendChild(selectAllButton);

      const deleteAllButton = document.createElement('button');
      deleteAllButton.className = 'works-action-btn works-action-btn-danger';
      deleteAllButton.textContent = '전체 삭제';
      deleteAllButton.onclick = () => options.deleteAllWorks();
      if (options.isArtistScopedUser()) {
        deleteAllButton.style.display = 'none';
      }
      actionGroup.appendChild(deleteAllButton);

      const deleteSelectedButton = document.createElement('button');
      deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      deleteSelectedButton.id = 'work-delete-selected-btn';
      deleteSelectedButton.textContent = '선택된 항목만 삭제';
      deleteSelectedButton.onclick = () => options.deleteSelectedWorks();
      deleteSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      actionGroup.appendChild(deleteSelectedButton);

      const editSelectedButton = document.createElement('button');
      editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      editSelectedButton.id = 'work-edit-selected-btn';
      editSelectedButton.textContent = '선택된 항목 수정';
      editSelectedButton.onclick = () => options.editSelectedWorks();
      editSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      actionGroup.appendChild(editSelectedButton);

      const exportButton = document.createElement('button');
      exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      exportButton.textContent = '엑셀 파일로 다운 받기';
      exportButton.onclick = () => options.exportWorksToExcel();

      const saveAllButton = document.createElement('button');
      saveAllButton.className = 'works-action-btn works-action-btn-secondary';
      saveAllButton.textContent = '전체 저장';
      saveAllButton.id = 'save-all-btn';
      saveAllButton.style.display = 'none';
      saveAllButton.onclick = () => options.saveAllWorks();
      actionGroup.appendChild(saveAllButton);

      const undoButton = document.createElement('button');
      undoButton.className = 'works-action-btn works-action-btn-secondary';
      undoButton.id = 'work-undo-btn';
      undoButton.textContent = '되돌리기';
      undoButton.onclick = () => options.undoWorkChanges();
      actionGroup.appendChild(undoButton);

      actionsRow.appendChild(actionGroup);
      actionsRow.appendChild(exportButton);
      wrapper.appendChild(actionsRow);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'works-table-wrapper' + (state.workListExpanded ? ' expanded' : ' collapsed');
      const table = document.createElement('table');
      table.className = 'works-table';
      if (isGoodsMode) {
        table.innerHTML = `
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" id="select-all-works" onclick="toggleSelectAllWorks(this)"></th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>번호</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleWorkSort('manualNumber')">${options.getSortIndicator('manualNumber')}</button>
                </div>
              </th>
              <th>사진</th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>제품 이름</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'title' ? ' active' : ''}" onclick="toggleWorkSort('title')">${options.getSortIndicator('title')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>가격</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'price' ? ' active' : ''}" onclick="toggleWorkSort('price')">${options.getSortIndicator('price')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'quantity' ? ' active' : ''}" onclick="toggleWorkSort('quantity')">${options.getSortIndicator('quantity')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>판매된 수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'soldQuantity' ? ' active' : ''}" onclick="toggleWorkSort('soldQuantity')">${options.getSortIndicator('soldQuantity')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>남은 수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'remainingQuantity' ? ' active' : ''}" onclick="toggleWorkSort('remainingQuantity')">${options.getSortIndicator('remainingQuantity')}</button>
                </div>
              </th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody id="works-tbody"></tbody>
        `;
      } else {
        const headerCells = [
          { key: 'manualNumber', label: '번호' },
          { key: 'category', label: '카테고리' },
          { key: 'photoName', label: '사진' },
          { key: 'title', label: '제목' },
          { key: 'author', label: '작가' },
          { key: 'price', label: '가격' },
          { key: 'materials', label: '재료' },
          { key: 'size', label: '크기' },
          { key: 'year', label: '연도' }
        ];
        table.innerHTML = `
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" id="select-all-works" onclick="toggleSelectAllWorks(this)"></th>
              ${headerCells.map(({ key, label }) => `
                <th class="sortable-header">
                  <div class="header-with-sort">
                    <span>${label}</span>
                    ${key !== 'photoName' ? `<button type="button" class="header-sort-btn${state.workSortField === key ? ' active' : ''}" onclick="toggleWorkSort('${key}')">${options.getSortIndicator(key)}</button>` : ''}
                  </div>
                </th>
              `).join('')}
              <th class="sortable-header work-status-cell">
                <div class="header-with-sort">
                  <span>상태</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'status' ? ' active' : ''}" onclick="toggleWorkSort('status')">${options.getSortIndicator('status')}</button>
                </div>
              </th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody id="works-tbody"></tbody>
        `;
      }
      tableWrapper.appendChild(table);
      const fadeOverlay = document.createElement('div');
      fadeOverlay.className = 'fade-overlay';
      tableWrapper.appendChild(fadeOverlay);
      wrapper.appendChild(tableWrapper);

      const bottomActionsRow = document.createElement('div');
      bottomActionsRow.className = 'works-action-row';
      bottomActionsRow.style.marginTop = '12px';
      bottomActionsRow.style.marginBottom = '0';

      const bottomAddButton = document.createElement('button');
      bottomAddButton.className = 'works-action-btn';
      bottomAddButton.textContent = isGoodsMode ? '+ 굿즈 추가' : '+ 작품 추가';
      bottomAddButton.onclick = () => options.addWorkRow();
      bottomActionsRow.appendChild(bottomAddButton);

      const bottomActionGroup = document.createElement('div');
      bottomActionGroup.className = 'works-action-group';

      const bottomSelectAllButton = document.createElement('button');
      bottomSelectAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSelectAllButton.id = 'work-select-all-btn-bottom';
      bottomSelectAllButton.onclick = () => options.toggleSelectAllVisibleWorks();
      bottomActionGroup.appendChild(bottomSelectAllButton);

      const bottomDeleteAllButton = document.createElement('button');
      bottomDeleteAllButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteAllButton.textContent = '전체 삭제';
      bottomDeleteAllButton.onclick = () => options.deleteAllWorks();
      if (options.isArtistScopedUser()) {
        bottomDeleteAllButton.style.display = 'none';
      }
      bottomActionGroup.appendChild(bottomDeleteAllButton);

      const bottomDeleteSelectedButton = document.createElement('button');
      bottomDeleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteSelectedButton.id = 'work-delete-selected-btn-bottom';
      bottomDeleteSelectedButton.textContent = '선택된 항목만 삭제';
      bottomDeleteSelectedButton.onclick = () => options.deleteSelectedWorks();
      bottomDeleteSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      bottomActionGroup.appendChild(bottomDeleteSelectedButton);

      const bottomEditSelectedButton = document.createElement('button');
      bottomEditSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      bottomEditSelectedButton.id = 'work-edit-selected-btn-bottom';
      bottomEditSelectedButton.textContent = '선택된 항목 수정';
      bottomEditSelectedButton.onclick = () => options.editSelectedWorks();
      bottomEditSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      bottomActionGroup.appendChild(bottomEditSelectedButton);

      const bottomSaveAllButton = document.createElement('button');
      bottomSaveAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSaveAllButton.textContent = '전체 저장';
      bottomSaveAllButton.id = 'save-all-btn-bottom';
      bottomSaveAllButton.style.display = 'none';
      bottomSaveAllButton.onclick = () => options.saveAllWorks();
      bottomActionGroup.appendChild(bottomSaveAllButton);

      const bottomUndoButton = document.createElement('button');
      bottomUndoButton.className = 'works-action-btn works-action-btn-secondary';
      bottomUndoButton.id = 'work-undo-btn-bottom';
      bottomUndoButton.textContent = '되돌리기';
      bottomUndoButton.onclick = () => options.undoWorkChanges();
      bottomActionGroup.appendChild(bottomUndoButton);

      const bottomExportButton = document.createElement('button');
      bottomExportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomExportButton.textContent = '엑셀 파일로 다운 받기';
      bottomExportButton.onclick = () => options.exportWorksToExcel();

      bottomActionsRow.appendChild(bottomActionGroup);
      bottomActionsRow.appendChild(bottomExportButton);
      wrapper.appendChild(bottomActionsRow);

      container.appendChild(wrapper);
      options.updateWorksUndoButton();
      renderWorkRows();
    }

    function updateSaveAllButtonVisibility() {
      ['save-all-btn', 'save-all-btn-bottom'].forEach((buttonId) => {
        const saveAllBtn = document.getElementById(buttonId);
        if (saveAllBtn) {
          saveAllBtn.style.display = state.unsavedWorkCount >= 2 ? 'inline-block' : 'none';
        }
      });
    }

    function renderWorkRows() {
      const tbody = document.getElementById('works-tbody');
      const exhibition = options.getCurrentExhibition();
      const isGoodsMode = state.inventoryMode === 'goods';
      const works = options.getSortedWorks();
      tbody.innerHTML = '';

      state.unsavedWorkCount = works.filter((work) => !work.saved).length;
      updateSaveAllButtonVisibility();
      options.updateWorkSelectionActionButtons(works);

      if (works.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${isGoodsMode ? 9 : 12}" class="no-users">등록된 ${isGoodsMode ? '굿즈가' : '작품이'} 없습니다.</td>`;
        tbody.appendChild(emptyRow);
        options.refreshGridKeyboardNavigation('works-tbody');
        return;
      }

      const soldWorkIdSet = new Set(
        options.ensureSoldWorksArray()
          .filter((item) => options.normalizeSoldItemType(item) === '작품')
          .map((item) => item.workId)
      );
      const selectAllCheckbox = document.getElementById('select-all-works');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = works.every((work) => state.selectedWorkIds.includes(work.id));
      }

      works.forEach((work, index) => {
        const row = document.createElement('tr');
        const soldQuantity = isGoodsMode ? options.getGoodsSoldQuantity(work.id) : 0;
        const stockQuantity = isGoodsMode ? options.parseStockQuantity(work.quantity || 0) : 0;
        const presentation = options.inventoryRenderer.buildWorkRow({
          work,
          index,
          isGoodsMode,
          isSelected: state.selectedWorkIds.includes(work.id),
          canModifyWork: options.canCurrentUserModifyOwnedRow(work),
          previewDataUrl: options.getPhotoPreviewDataUrl(work),
          isUnsold: options.isWorkNotForSale(work.price),
          isSold: soldWorkIdSet.has(work.id),
          soldQuantity,
          stockQuantity,
          remainingQuantity: Math.max(0, stockQuantity - soldQuantity),
          isSoloExhibition: exhibition.type === '개인전',
          sizeParts: options.parseSizeParts(work.size)
        });
        row.setAttribute('data-work-id', String(work.id));
        row.className = presentation.className;
        row.innerHTML = presentation.html;
        tbody.appendChild(row);
      });

      options.refreshGridKeyboardNavigation('works-tbody');
    }

    return {
      renderInventoryListManagement,
      renderWorksManagement,
      renderWorkRows,
      updateSaveAllButtonVisibility
    };
  }

  const api = { create };
  root.ExhibitionDetailWorksView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/sales-view-controller.js */
(function initializeExhibitionDetailSalesViewController(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function cloneSalesRecords(records) {
      return JSON.parse(JSON.stringify(records || []));
    }

    function pushSalesUndoSnapshot() {
      const soldWorks = options.ensureSoldWorksArray();
      state.salesUndoStack.push(cloneSalesRecords(soldWorks));
      if (state.salesUndoStack.length > 30) {
        state.salesUndoStack.shift();
      }
    }

    function updateSalesActionButtons() {
      const soldWorks = options.ensureSoldWorksArray();
      const selectedCount = state.selectedSalesIds.length;
      const unsavedCount = soldWorks.filter(item => !item.saved).length;

      const allSelected = soldWorks.length > 0 && soldWorks.every(item => state.selectedSalesIds.includes(item.id));
      ['sales-select-all-btn', 'sales-select-all-btn-bottom'].forEach((buttonId) => {
        const selectAllButton = document.getElementById(buttonId);
        if (selectAllButton) {
          selectAllButton.textContent = allSelected ? '전체 선택 해제' : '전체 선택';
        }
      });

      ['sales-delete-selected-btn', 'sales-delete-selected-btn-bottom'].forEach((buttonId) => {
        const deleteSelectedButton = document.getElementById(buttonId);
        if (deleteSelectedButton) {
          deleteSelectedButton.style.display = selectedCount > 0 ? 'inline-block' : 'none';
        }
      });

      ['sales-edit-selected-btn', 'sales-edit-selected-btn-bottom'].forEach((buttonId) => {
        const editSelectedButton = document.getElementById(buttonId);
        if (editSelectedButton) {
          editSelectedButton.style.display = selectedCount > 0 ? 'inline-block' : 'none';
        }
      });

      ['sales-save-all-btn', 'sales-save-all-btn-bottom'].forEach((buttonId) => {
        const saveAllButton = document.getElementById(buttonId);
        if (saveAllButton) {
          saveAllButton.style.display = unsavedCount > 0 ? 'inline-block' : 'none';
        }
      });

      const canUndo = state.salesUndoStack.length > 0;
      ['sales-undo-btn', 'sales-undo-btn-bottom'].forEach((buttonId) => {
        const undoButton = document.getElementById(buttonId);
        if (undoButton) {
          undoButton.disabled = !canUndo;
          undoButton.style.opacity = canUndo ? '1' : '0.5';
          undoButton.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
      });

      options.refreshGridKeyboardNavigation('sold-works-tbody');
    }

    function isValidKoreanPhone(value) {
      return /^01\d-\d{3,4}-\d{4}$/.test((value || '').trim());
    }

    function getMissingRequiredSoldFields(sold) {
      const missing = [];
      if (!(sold.buyerName || '').toString().trim()) {
        missing.push('buyerName');
      }
      if (!(sold.paymentMethod || '').toString().trim()) {
        missing.push('paymentMethod');
      }
      if ((sold.paymentMethod || '').toString().trim() === '기타' && !(sold.paymentMethodEtc || '').toString().trim()) {
        missing.push('paymentMethodEtc');
      }
      return missing;
    }

    function markMissingSoldFields(row, missingFields) {
      if (!row) return;
      const fields = ['buyerName', 'paymentMethod', 'paymentMethodEtc'];
      fields.forEach((field) => {
        const element = row.querySelector(`[data-field="${field}"]`);
        if (!element) return;
        element.classList.toggle('sales-required-missing', missingFields.includes(field));
      });
    }

    function syncSoldFromRow(sold, row) {
      if (!sold || !row) return;

      const soldAtInput = row.querySelector('input[data-field="soldAtKst"]');
      const buyerNameInput = row.querySelector('input[data-field="buyerName"]');
      const buyerPhoneInput = row.querySelector('input[data-field="buyerPhone"]');
      const noteInput = row.querySelector('input[data-field="note"]');
      const paymentMethodSelect = row.querySelector('select[data-field="paymentMethod"]');
      const paymentMethodEtcInput = row.querySelector('input[data-field="paymentMethodEtc"]');
      const soldQuantityInput = row.querySelector('input[data-field="soldQuantity"]');

      if (soldAtInput) sold.soldAtKst = options.soldInputValueToKst(soldAtInput.value);
      if (buyerNameInput) sold.buyerName = buyerNameInput.value.trim();
      if (buyerPhoneInput) sold.buyerPhone = buyerPhoneInput.value.trim();
      if (noteInput) sold.note = noteInput.value.trim();
      if (paymentMethodSelect) sold.paymentMethod = paymentMethodSelect.value;
      if (paymentMethodEtcInput) {
        sold.paymentMethodEtc = paymentMethodEtcInput.value.trim();
      } else if (sold.paymentMethod !== '기타') {
        sold.paymentMethodEtc = '';
      }
      if (soldQuantityInput) {
        sold.soldQuantity = options.getSoldQuantityForItemType(options.normalizeSoldItemType(sold), soldQuantityInput.value);
      }
    }

    function saveSoldWork(soldId, triggerButton) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      if (!sold) return;
      if (!options.canCurrentUserModifyOwnedRow(sold)) {
        options.alert('다른 사용자가 추가한 판매 항목은 수정할 수 없습니다.');
        return;
      }

      const row = triggerButton && typeof triggerButton.closest === 'function'
        ? triggerButton.closest('tr')
        : document.querySelector(`tr[data-sold-id="${soldId}"]`);
      syncSoldFromRow(sold, row);

      const missing = getMissingRequiredSoldFields(sold);
      if (missing.length > 0) {
        markMissingSoldFields(row, missing);
        return;
      }

      sold.soldQuantity = options.getSoldQuantityForItemType(options.normalizeSoldItemType(sold), sold.soldQuantity);
      markMissingSoldFields(row, []);
      sold.saved = true;
      state.salesEditSnapshotIds = state.salesEditSnapshotIds.filter(id => id !== soldId);
      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function saveAllSoldWorks() {
      const soldWorks = options.ensureSoldWorksArray();

      for (const sold of soldWorks) {
        if (sold.saved || !options.canCurrentUserModifyOwnedRow(sold)) continue;
        const row = document.querySelector(`tr[data-sold-id="${sold.id}"]`);
        syncSoldFromRow(sold, row);
        const missing = getMissingRequiredSoldFields(sold);
        if (missing.length > 0) {
          markMissingSoldFields(row, missing);
          return;
        }
        markMissingSoldFields(row, []);
      }

      soldWorks.forEach((sold) => {
        if (!sold.saved) {
          if (!options.canCurrentUserModifyOwnedRow(sold)) return;
          sold.soldQuantity = options.getSoldQuantityForItemType(options.normalizeSoldItemType(sold), sold.soldQuantity);
          sold.saved = true;
          state.salesEditSnapshotIds = state.salesEditSnapshotIds.filter(id => id !== sold.id);
        }
      });

      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function ensureSalesEditUndoSnapshot(soldId) {
      if (state.salesEditSnapshotIds.includes(soldId)) return;
      pushSalesUndoSnapshot();
      state.salesEditSnapshotIds.push(soldId);
    }

    function toggleSoldWorkEdit(soldId) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      if (!sold) return;
      if (!options.canCurrentUserModifyOwnedRow(sold)) {
        options.alert('다른 사용자가 추가한 판매 항목은 수정할 수 없습니다.');
        return;
      }

      if (sold.saved) ensureSalesEditUndoSnapshot(soldId);
      sold.saved = false;
      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
      options.scrollRowToViewportCenter(`tr[data-sold-id="${soldId}"]`);
    }

    function deleteSoldWork(soldId) {
      const exhibition = options.getCurrentExhibition();
      const soldWorks = options.ensureSoldWorksArray();
      const target = soldWorks.find(item => item.id === soldId);
      if (!target) return;
      if (!options.canCurrentUserModifyOwnedRow(target)) {
        options.alert('다른 사용자가 추가한 판매 항목은 삭제할 수 없습니다.');
        return;
      }
      if (!options.confirm('이 판매 기록을 삭제하시겠습니까?')) return;

      pushSalesUndoSnapshot();
      exhibition.soldWorks = soldWorks.filter(item => item.id !== soldId);
      state.selectedSalesIds = state.selectedSalesIds.filter(id => id !== soldId);
      if (state.exhibition) state.exhibition.soldWorks = exhibition.soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function handleSoldFieldChange(soldId, field, value) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      if (!sold || !options.canCurrentUserModifyOwnedRow(sold)) return;

      ensureSalesEditUndoSnapshot(soldId);
      if (field === 'soldQuantity') {
        if (sold.saved) return;
        sold.soldQuantity = options.getSoldQuantityForItemType(options.normalizeSoldItemType(sold), value);
      } else {
        sold[field] = (value || '').trim();
      }
      if (field === 'paymentMethodEtc' && sold.paymentMethod !== '기타') sold.paymentMethodEtc = '';
      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
    }

    function handleSoldPhoneInput(soldId, event) {
      const formatted = options.formatKoreanPhone(event.target.value);
      event.target.value = formatted;
      handleSoldFieldChange(soldId, 'buyerPhone', formatted);
    }

    function handleSoldPaymentMethodChange(soldId, value) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      if (!sold || !options.canCurrentUserModifyOwnedRow(sold)) return;

      ensureSalesEditUndoSnapshot(soldId);
      sold.paymentMethod = value;
      if (value !== '기타') sold.paymentMethodEtc = '';
      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function handleSoldWorkSearchChange(soldId, field, value) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      if (!sold || !options.canCurrentUserModifyOwnedRow(sold)) return;
      pushSalesUndoSnapshot();

      const query = (value || '').trim();
      sold[field] = query;
      const sourceWorks = options.getSalesSearchResults('__all__');
      const match = sourceWorks.find((work) => {
        if (field === 'manualNumber') {
          return (work.manualNumber || '').toString().trim().toLowerCase() === query.toLowerCase();
        }
        return (work.title || '').toString().trim().toLowerCase() === query.toLowerCase();
      });

      if (match) {
        sold.workId = match.id;
        sold.itemType = match.itemType || '작품';
        sold.manualNumber = match.manualNumber || '';
        sold.category = match.category || '';
        sold.title = match.title || '';
        sold.photoName = match.photoName || '';
        sold.photoUrl = match.photoUrl || '';
        sold.photoPreviewUrl = match.photoPreviewUrl || match.photoUrl || '';
        sold.photoDataUrl = match.photoDataUrl || '';
        sold.photoPreviewDataUrl = match.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(match);
        sold.author = match.author || '';
        sold.price = match.price || '';
        sold.soldQuantity = sold.itemType === '굿즈' ? options.parseSoldQuantity(sold.soldQuantity) : 1;
      } else {
        sold.workId = null;
        sold.itemType = '작품';
        sold.category = '';
        sold.photoName = '';
        sold.photoUrl = '';
        sold.photoPreviewUrl = '';
        sold.photoDataUrl = '';
        sold.photoPreviewDataUrl = '';
        sold.author = '';
        sold.price = '';
      }

      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function toggleSalesSelection(soldId, isChecked, event, rowIndex) {
      const soldWorks = options.getSortedSoldWorks();
      const currentIndex = typeof rowIndex === 'number'
        ? rowIndex
        : soldWorks.findIndex(item => item.id === soldId);
      const isShiftRange = Boolean(event && event.shiftKey && state.lastSalesCheckboxIndex !== null && currentIndex !== -1);

      if (isShiftRange) {
        const start = Math.min(state.lastSalesCheckboxIndex, currentIndex);
        const end = Math.max(state.lastSalesCheckboxIndex, currentIndex);
        const rangeIds = soldWorks.slice(start, end + 1).map(item => item.id);
        if (isChecked) {
          state.selectedSalesIds = Array.from(new Set([...state.selectedSalesIds, ...rangeIds]));
        } else {
          state.selectedSalesIds = state.selectedSalesIds.filter(id => !rangeIds.includes(id));
        }
      } else if (isChecked) {
        state.selectedSalesIds = Array.from(new Set([...state.selectedSalesIds, soldId]));
      } else {
        state.selectedSalesIds = state.selectedSalesIds.filter(id => id !== soldId);
      }

      if (currentIndex !== -1) state.lastSalesCheckboxIndex = currentIndex;
      renderSoldWorkRows();
    }

    function toggleSelectAllSales(source) {
      const soldWorks = options.ensureSoldWorksArray();
      state.selectedSalesIds = source.checked ? soldWorks.map(item => item.id) : [];
      renderSoldWorkRows();
    }

    function toggleSelectAllSalesFromButton() {
      const soldWorks = options.ensureSoldWorksArray();
      const ids = soldWorks.map(item => item.id);
      const allSelected = soldWorks.length > 0 && soldWorks.every(item => state.selectedSalesIds.includes(item.id));
      state.selectedSalesIds = allSelected ? [] : ids;
      renderSoldWorkRows();
    }

    function editSelectedSoldWorks() {
      const soldWorks = options.ensureSoldWorksArray();
      if (state.selectedSalesIds.length === 0) return;
      const selectedSet = new Set(state.selectedSalesIds);
      const editableSoldWorks = soldWorks.filter(item => selectedSet.has(item.id) && options.canCurrentUserModifyOwnedRow(item));
      if (editableSoldWorks.length === 0) {
        options.alert('수정할 수 있는 판매 기록이 없습니다.');
        return;
      }

      editableSoldWorks.forEach((item) => {
        if (item.saved) ensureSalesEditUndoSnapshot(item.id);
        item.saved = false;
      });
      if (state.exhibition) state.exhibition.soldWorks = soldWorks;
      state.selectedSalesIds = [];
      state.lastSalesCheckboxIndex = null;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function deleteAllSoldWorks() {
      const exhibition = options.getCurrentExhibition();
      const soldWorks = options.ensureSoldWorksArray();
      if (soldWorks.length === 0) return;
      if (!options.confirm('모든 판매 기록을 삭제하시겠습니까?')) return;

      let nextSoldWorks = [];
      if (options.isArtistScopedUser()) {
        nextSoldWorks = soldWorks.filter(item => !options.canCurrentUserModifyOwnedRow(item));
        if (nextSoldWorks.length === soldWorks.length) {
          options.alert('삭제할 수 있는 판매 기록이 없습니다.');
          return;
        }
      }

      pushSalesUndoSnapshot();
      exhibition.soldWorks = options.isArtistScopedUser() ? nextSoldWorks : [];
      state.selectedSalesIds = state.selectedSalesIds.filter((id) => {
        const item = soldWorks.find(sold => sold.id === id);
        return item && !options.canCurrentUserModifyOwnedRow(item);
      });
      if (state.exhibition) state.exhibition.soldWorks = exhibition.soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function deleteSelectedSoldWorks() {
      const exhibition = options.getCurrentExhibition();
      const soldWorks = options.ensureSoldWorksArray();
      if (state.selectedSalesIds.length === 0) return;
      if (!options.confirm('선택된 판매 기록을 삭제하시겠습니까?')) return;

      const selectedSet = new Set(state.selectedSalesIds);
      const deletableIds = soldWorks
        .filter(item => selectedSet.has(item.id) && options.canCurrentUserModifyOwnedRow(item))
        .map(item => item.id);
      if (deletableIds.length === 0) {
        options.alert('삭제할 수 있는 판매 기록이 없습니다.');
        return;
      }

      pushSalesUndoSnapshot();
      exhibition.soldWorks = soldWorks.filter(item => !deletableIds.includes(item.id));
      state.selectedSalesIds = [];
      if (state.exhibition) state.exhibition.soldWorks = exhibition.soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    function undoSalesChanges() {
      const exhibition = options.getCurrentExhibition();
      if (state.salesUndoStack.length === 0) return;
      const previous = state.salesUndoStack.pop();
      exhibition.soldWorks = cloneSalesRecords(previous);
      state.selectedSalesIds = [];
      if (state.exhibition) state.exhibition.soldWorks = exhibition.soldWorks;
      options.saveExhibition();
      renderSoldWorkRows();
    }

    let imagePreviewOutsideClickHandler = null;

    function openImagePreviewBySoldId(soldId, event) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find(item => item.id === soldId);
      const previewDataUrl = options.getPhotoPreviewDataUrl(sold);
      if (!sold || !previewDataUrl) return;

      if (event) event.stopPropagation();
      const existingPreview = document.getElementById('image-preview-popover');
      if (existingPreview) existingPreview.remove();
      if (imagePreviewOutsideClickHandler) {
        document.removeEventListener('click', imagePreviewOutsideClickHandler);
      }

      const preview = document.createElement('div');
      preview.id = 'image-preview-popover';
      preview.className = 'image-preview-popover';
      preview.innerHTML = `
        <div class="image-preview-header">
          <span>${sold.title || sold.photoName || '이미지 미리보기'}</span>
          <button type="button" class="image-preview-close" onclick="closeImagePreview()">✕</button>
        </div>
        <img src="${previewDataUrl}" alt="${(sold.title || '작품').replace(/"/g, '&quot;')}" class="image-preview-large">
      `;

      const anchorRect = event?.currentTarget?.getBoundingClientRect();
      const fallbackTop = Math.max(16, options.window.innerHeight / 2 - 140);
      preview.style.top = `${anchorRect ? Math.max(16, anchorRect.top - 8) : fallbackTop}px`;
      preview.style.left = `${anchorRect ? anchorRect.right + 12 : 16}px`;
      document.body.appendChild(preview);

      const popoverRect = preview.getBoundingClientRect();
      if (popoverRect.right > options.window.innerWidth - 12 && anchorRect) {
        preview.style.left = `${Math.max(12, anchorRect.left - popoverRect.width - 12)}px`;
      }
      if (popoverRect.bottom > options.window.innerHeight - 12) {
        preview.style.top = `${Math.max(12, options.window.innerHeight - popoverRect.height - 12)}px`;
      }

      imagePreviewOutsideClickHandler = (clickEvent) => {
        const popover = document.getElementById('image-preview-popover');
        if (popover && popover.contains(clickEvent.target)) return;
        if (popover) popover.remove();
        document.removeEventListener('click', imagePreviewOutsideClickHandler);
        imagePreviewOutsideClickHandler = null;
      };

      options.window.setTimeout(() => {
        if (imagePreviewOutsideClickHandler) document.addEventListener('click', imagePreviewOutsideClickHandler);
      }, 0);
    }

    function renderSoldWorkRows() {
      const tbody = document.getElementById('sold-works-tbody');
      if (!tbody) {
        options.renderSoldStatsTicker('sales');
        updateSalesActionButtons();
        return;
      }

      const exhibition = options.getCurrentExhibition();
      const soldWorksAll = options.ensureSoldWorksArray();
      const soldWorks = options.getSortedSoldWorks();
      const sourceWorks = options.getSalesSearchResults('__all__');
      tbody.innerHTML = '';

      if (soldWorksAll.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="16" class="no-users">등록된 판매 작품이 없습니다.</td>';
        tbody.appendChild(emptyRow);
        options.renderSoldStatsTicker('sales');
        updateSalesActionButtons();
        return;
      }

      if (soldWorks.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="16" class="no-users">검색 결과가 없습니다.</td>';
        tbody.appendChild(emptyRow);
        options.renderSoldStatsTicker('sales');
        updateSalesActionButtons();
        return;
      }

      soldWorks.forEach((sold, index) => {
        const row = document.createElement('tr');
        row.setAttribute('data-sold-id', String(sold.id));
        const isSelected = state.selectedSalesIds.includes(sold.id);
        const isSaved = !!sold.saved;
        const canModifySold = options.canCurrentUserModifyOwnedRow(sold);
        const isReadonlyRow = isSaved || !canModifySold;
        const actionButton = !canModifySold
          ? ''
          : (isSaved
            ? `<button class="action-btn edit-btn" onclick="toggleSoldWorkEdit(${sold.id})">수정</button>`
            : `<button class="action-btn approve-btn" onclick="saveSoldWork(${sold.id}, this)">저장</button>`);
        const soldPreviewDataUrl = options.getPhotoPreviewDataUrl(sold);
        const previewCell = soldPreviewDataUrl
          ? `<img src="${soldPreviewDataUrl}" alt="${(sold.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewBySoldId(${sold.id}, event)">`
          : `<span class="saved-photo">${sold.photoName || '사진 없음'}</span>`;
        const soldItemType = options.normalizeSoldItemType(sold);
        const sourceMatch = sourceWorks.find((work) => work.id === sold.workId && work.itemType === soldItemType);
        const categoryText = sold.category || sourceMatch?.category || '';
        const soldQuantityValue = options.getSoldQuantityForItemType(soldItemType, sold.soldQuantity);
        const isCertificateReady = options.hasGeneratedCertificate(sold);
        const certificateButtonHtml = soldItemType === '작품'
          ? (isCertificateReady
            ? `<div class="certificate-actions">
                <button class="action-btn approve-btn" onclick="handleSoldCertificateAction(${sold.id})">보증서 다운로드</button>
                <button class="action-btn edit-btn" onclick="handleSoldCertificateRemakeAction(${sold.id})">보증서 다시 만들기</button>
              </div>`
            : `<button class="action-btn edit-btn" onclick="handleSoldCertificateAction(${sold.id})">보증서 만들기</button>`)
          : '';

        const paymentDisplay = sold.paymentMethod === '기타'
          ? `기타${sold.paymentMethodEtc ? ` (${sold.paymentMethodEtc})` : ''}`
          : (sold.paymentMethod || '');
        const manualNumberCell = sold.madeToOrder
          ? `<span class="sales-number-with-badge"><span>${sold.manualNumber || ''}</span><span class="sales-made-to-order-square-badge"><span>주문</span><span>제작</span></span></span>`
          : (sold.manualNumber || '');

        const paymentInputCell = `
          <div class="sales-payment-group">
            <select data-field="paymentMethod" onchange="handleSoldPaymentMethodChange(${sold.id}, this.value)">
              <option value="" ${!sold.paymentMethod ? 'selected' : ''}>선택</option>
              <option value="카드결제" ${sold.paymentMethod === '카드결제' ? 'selected' : ''}>카드결제</option>
              <option value="계좌이체" ${sold.paymentMethod === '계좌이체' ? 'selected' : ''}>계좌이체</option>
              <option value="온누리상품권" ${sold.paymentMethod === '온누리상품권' ? 'selected' : ''}>온누리상품권</option>
              <option value="기타" ${sold.paymentMethod === '기타' ? 'selected' : ''}>기타</option>
            </select>
            ${sold.paymentMethod === '기타' ? `<input data-field="paymentMethodEtc" type="text" value="${sold.paymentMethodEtc || ''}" placeholder="기타 결제방법 입력" onchange="handleSoldFieldChange(${sold.id}, 'paymentMethodEtc', this.value)">` : ''}
          </div>
        `;

        row.innerHTML = `
          <td class="checkbox-col"><input type="checkbox" class="sales-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleSalesSelection(${sold.id}, this.checked, event, ${index})"></td>
          <td>${manualNumberCell}</td>
          <td>${soldItemType}</td>
          <td>${categoryText}</td>
          <td>${previewCell}</td>
          <td>${sold.title || ''}</td>
          <td>${sold.author || ''}</td>
          <td>${sold.price || ''}</td>
          ${isReadonlyRow
            ? `<td>${soldQuantityValue}</td>`
            : (soldItemType === '굿즈'
              ? `<td><input data-field="soldQuantity" type="number" min="1" value="${soldQuantityValue}" onchange="handleSoldFieldChange(${sold.id}, 'soldQuantity', this.value)"></td>`
              : `<td><input data-field="soldQuantity" type="number" min="1" value="1" disabled aria-label="작품 수량"></td>`)}
          ${isReadonlyRow
            ? `<td>${sold.soldAtKst || ''}</td>`
            : `<td><input type="datetime-local" data-field="soldAtKst" value="${options.soldKstToInputValue(sold.soldAtKst)}" onchange="handleSoldFieldChange(${sold.id}, 'soldAtKst', soldInputValueToKst(this.value))"></td>`}
          ${isReadonlyRow
            ? `<td>${sold.buyerName || ''}</td>`
            : `<td><input data-field="buyerName" type="text" value="${sold.buyerName || ''}" placeholder="구매자 성함" onchange="handleSoldFieldChange(${sold.id}, 'buyerName', this.value)"></td>`}
          ${isReadonlyRow
            ? `<td>${sold.buyerPhone || ''}</td>`
            : `<td><input data-field="buyerPhone" type="text" value="${sold.buyerPhone || ''}" placeholder="010-0000-0000" oninput="handleSoldPhoneInput(${sold.id}, event)" onchange="handleSoldFieldChange(${sold.id}, 'buyerPhone', this.value)"></td>`}
          ${isReadonlyRow ? `<td>${paymentDisplay}</td>` : `<td>${paymentInputCell}</td>`}
          ${isReadonlyRow
            ? `<td>${sold.note || ''}</td>`
            : `<td><input data-field="note" type="text" value="${sold.note || ''}" placeholder="비고" onchange="handleSoldFieldChange(${sold.id}, 'note', this.value)"></td>`}
          <td>
            ${actionButton}
            ${canModifySold ? `<button class="action-btn delete-btn" onclick="deleteSoldWork(${sold.id})">삭제</button>` : ''}
          </td>
          <td>${certificateButtonHtml}</td>
        `;

        tbody.appendChild(row);
      });

      const selectAll = document.getElementById('select-all-sales');
      if (selectAll) {
        const allSelected = soldWorksAll.length > 0 && soldWorksAll.every(item => state.selectedSalesIds.includes(item.id));
        selectAll.checked = allSelected;
      }

      options.renderSoldStatsTicker('sales');
      updateSalesActionButtons();
    }

    function renderInventorySalesManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '작품 / 굿즈 판매';
      wrapper.appendChild(title);

      const innerContent = document.createElement('div');
      innerContent.className = 'works-sales-subcontent';
      wrapper.appendChild(innerContent);

      container.appendChild(wrapper);

      renderSalesManagement(innerContent);
    }

    function renderSalesManagement(container) {
      if (container) {
        container.innerHTML = '';
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'works-wrapper';

      const searchBar = document.createElement('div');
      searchBar.className = 'works-search-bar';
      searchBar.innerHTML = `
        <div class="works-search-row">
          <input id="sales-search" type="text" class="works-search" placeholder="번호, 제목, 작가, 구매자, 결제방법 등 검색" value="${state.salesSearch}" oninput="handleSalesSearchInput(this.value)">
          <button class="modal-btn modal-approve" onclick="toggleSalesAdvanced()">${state.salesAdvanced ? '간단 검색' : '고급 검색'}</button>
        </div>
        <div id="sales-advanced-search-panel" class="advanced-search-panel ${state.salesAdvanced ? 'active' : ''}">
          <div class="advanced-search-grid">
            <label>번호 <input type="text" id="sales-filter-manualNumber" value="${state.salesFilters.manualNumber}" onchange="handleSalesAdvancedFilter('manualNumber', this.value)"></label>
            <label>제목 <input type="text" id="sales-filter-title" value="${state.salesFilters.title}" onchange="handleSalesAdvancedFilter('title', this.value)"></label>
            <label>작가 <input type="text" id="sales-filter-author" value="${state.salesFilters.author}" onchange="handleSalesAdvancedFilter('author', this.value)"></label>
            <div class="sales-date-range-row">
              <label class="sales-date-range-label">판매일</label>
              <div class="sales-date-range">
                <input type="date" id="sales-filter-soldDateFrom" value="${state.salesFilters.soldDateFrom}" onchange="handleSalesAdvancedFilter('soldDateFrom', this.value)">
                <span class="sales-date-range-sep">~</span>
                <input type="date" id="sales-filter-soldDateTo" value="${state.salesFilters.soldDateTo}" onchange="handleSalesAdvancedFilter('soldDateTo', this.value)">
              </div>
            </div>
            <label>구매자 성함 <input type="text" id="sales-filter-buyerName" value="${state.salesFilters.buyerName}" onchange="handleSalesAdvancedFilter('buyerName', this.value)"></label>
            <label>구매자 연락처 <input type="text" id="sales-filter-buyerPhone" value="${state.salesFilters.buyerPhone}" onchange="handleSalesAdvancedFilter('buyerPhone', this.value)"></label>
            <label>결제방법 <input type="text" id="sales-filter-paymentMethod" value="${state.salesFilters.paymentMethod}" onchange="handleSalesAdvancedFilter('paymentMethod', this.value)"></label>
          </div>
          <div class="advanced-search-actions">
            <button class="modal-btn modal-approve" onclick="applySalesFilters()">검색</button>
            <button class="modal-btn modal-cancel" onclick="resetSalesFilters()">초기화</button>
          </div>
        </div>
      `;
      wrapper.appendChild(searchBar);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'works-action-row';

      const addSoldButton = document.createElement('button');
      addSoldButton.className = 'works-action-btn';
      addSoldButton.textContent = '+ 판매 항목 추가';
      addSoldButton.onclick = () => options.openSalesAddModal();
      actionsRow.appendChild(addSoldButton);

      const actionGroup = document.createElement('div');
      actionGroup.className = 'works-action-group';

      const selectAllButton = document.createElement('button');
      selectAllButton.className = 'works-action-btn works-action-btn-secondary';
      selectAllButton.id = 'sales-select-all-btn';
      selectAllButton.onclick = () => toggleSelectAllSalesFromButton();
      actionGroup.appendChild(selectAllButton);

      const saveAllButton = document.createElement('button');
      saveAllButton.className = 'works-action-btn works-action-btn-secondary';
      saveAllButton.id = 'sales-save-all-btn';
      saveAllButton.textContent = '전체 저장';
      saveAllButton.onclick = () => saveAllSoldWorks();
      saveAllButton.style.display = 'none';
      actionGroup.appendChild(saveAllButton);

      const deleteAllButton = document.createElement('button');
      deleteAllButton.className = 'works-action-btn works-action-btn-danger';
      deleteAllButton.textContent = '전체 삭제';
      deleteAllButton.onclick = () => deleteAllSoldWorks();
      if (options.isArtistScopedUser()) {
        deleteAllButton.style.display = 'none';
      }
      actionGroup.appendChild(deleteAllButton);

      const deleteSelectedButton = document.createElement('button');
      deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      deleteSelectedButton.id = 'sales-delete-selected-btn';
      deleteSelectedButton.textContent = '선택된 항목만 삭제';
      deleteSelectedButton.onclick = () => deleteSelectedSoldWorks();
      deleteSelectedButton.style.display = 'none';
      actionGroup.appendChild(deleteSelectedButton);

      const editSelectedButton = document.createElement('button');
      editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      editSelectedButton.id = 'sales-edit-selected-btn';
      editSelectedButton.textContent = '선택된 항목 수정';
      editSelectedButton.onclick = () => editSelectedSoldWorks();
      editSelectedButton.style.display = 'none';
      actionGroup.appendChild(editSelectedButton);

      const undoButton = document.createElement('button');
      undoButton.className = 'works-action-btn works-action-btn-secondary';
      undoButton.id = 'sales-undo-btn';
      undoButton.textContent = '되돌리기';
      undoButton.onclick = () => undoSalesChanges();
      actionGroup.appendChild(undoButton);

      const exportButton = document.createElement('button');
      exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      exportButton.textContent = '엑셀 파일로 다운 받기';
      exportButton.onclick = () => options.exportSalesToExcel();

      const allCertificatesButton = document.createElement('button');
      allCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      allCertificatesButton.textContent = '모든 보증서 다운 받기';
      allCertificatesButton.onclick = () => options.handleDownloadAllCertificatesAction();

      actionsRow.appendChild(actionGroup);
      actionsRow.appendChild(exportButton);
      actionsRow.appendChild(allCertificatesButton);
      wrapper.appendChild(actionsRow);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'works-table-wrapper expanded';
      const table = document.createElement('table');
      table.className = 'works-table sales-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th class="checkbox-col"><input type="checkbox" id="select-all-sales" onclick="toggleSelectAllSales(this)"></th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>번호</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleSalesSort('manualNumber')">${options.getSalesSortIndicator('manualNumber')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>분류</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'itemType' ? ' active' : ''}" onclick="toggleSalesSort('itemType')">${options.getSalesSortIndicator('itemType')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>카테고리</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'category' ? ' active' : ''}" onclick="toggleSalesSort('category')">${options.getSalesSortIndicator('category')}</button>
              </div>
            </th>
            <th>사진</th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>제목</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'title' ? ' active' : ''}" onclick="toggleSalesSort('title')">${options.getSalesSortIndicator('title')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>작가</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'author' ? ' active' : ''}" onclick="toggleSalesSort('author')">${options.getSalesSortIndicator('author')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>가격</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'price' ? ' active' : ''}" onclick="toggleSalesSort('price')">${options.getSalesSortIndicator('price')}</button>
              </div>
            </th>
            <th>수량</th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>판매일시</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'soldAtKst' ? ' active' : ''}" onclick="toggleSalesSort('soldAtKst')">${options.getSalesSortIndicator('soldAtKst')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>구매자 성함</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'buyerName' ? ' active' : ''}" onclick="toggleSalesSort('buyerName')">${options.getSalesSortIndicator('buyerName')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>구매자 연락처</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'buyerPhone' ? ' active' : ''}" onclick="toggleSalesSort('buyerPhone')">${options.getSalesSortIndicator('buyerPhone')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>결제방법</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'paymentMethod' ? ' active' : ''}" onclick="toggleSalesSort('paymentMethod')">${options.getSalesSortIndicator('paymentMethod')}</button>
              </div>
            </th>
            <th>비고</th>
            <th>작업</th>
            <th>보증서</th>
          </tr>
        </thead>
        <tbody id="sold-works-tbody"></tbody>
      `;

      tableWrapper.appendChild(table);
      wrapper.appendChild(tableWrapper);

      const bottomActionsRow = document.createElement('div');
      bottomActionsRow.className = 'works-action-row';
      bottomActionsRow.style.marginTop = '12px';
      bottomActionsRow.style.marginBottom = '0';

      const bottomAddSoldButton = document.createElement('button');
      bottomAddSoldButton.className = 'works-action-btn';
      bottomAddSoldButton.textContent = '+ 판매 항목 추가';
      bottomAddSoldButton.onclick = () => options.openSalesAddModal();
      bottomActionsRow.appendChild(bottomAddSoldButton);

      const bottomActionGroup = document.createElement('div');
      bottomActionGroup.className = 'works-action-group';

      const bottomSelectAllButton = document.createElement('button');
      bottomSelectAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSelectAllButton.id = 'sales-select-all-btn-bottom';
      bottomSelectAllButton.onclick = () => toggleSelectAllSalesFromButton();
      bottomActionGroup.appendChild(bottomSelectAllButton);

      const bottomSaveAllButton = document.createElement('button');
      bottomSaveAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSaveAllButton.id = 'sales-save-all-btn-bottom';
      bottomSaveAllButton.textContent = '전체 저장';
      bottomSaveAllButton.onclick = () => saveAllSoldWorks();
      bottomSaveAllButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomSaveAllButton);

      const bottomDeleteAllButton = document.createElement('button');
      bottomDeleteAllButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteAllButton.textContent = '전체 삭제';
      bottomDeleteAllButton.onclick = () => deleteAllSoldWorks();
      if (options.isArtistScopedUser()) {
        bottomDeleteAllButton.style.display = 'none';
      }
      bottomActionGroup.appendChild(bottomDeleteAllButton);

      const bottomDeleteSelectedButton = document.createElement('button');
      bottomDeleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteSelectedButton.id = 'sales-delete-selected-btn-bottom';
      bottomDeleteSelectedButton.textContent = '선택된 항목만 삭제';
      bottomDeleteSelectedButton.onclick = () => deleteSelectedSoldWorks();
      bottomDeleteSelectedButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomDeleteSelectedButton);

      const bottomEditSelectedButton = document.createElement('button');
      bottomEditSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      bottomEditSelectedButton.id = 'sales-edit-selected-btn-bottom';
      bottomEditSelectedButton.textContent = '선택된 항목 수정';
      bottomEditSelectedButton.onclick = () => editSelectedSoldWorks();
      bottomEditSelectedButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomEditSelectedButton);

      const bottomUndoButton = document.createElement('button');
      bottomUndoButton.className = 'works-action-btn works-action-btn-secondary';
      bottomUndoButton.id = 'sales-undo-btn-bottom';
      bottomUndoButton.textContent = '되돌리기';
      bottomUndoButton.onclick = () => undoSalesChanges();
      bottomActionGroup.appendChild(bottomUndoButton);

      const bottomExportButton = document.createElement('button');
      bottomExportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomExportButton.textContent = '엑셀 파일로 다운 받기';
      bottomExportButton.onclick = () => options.exportSalesToExcel();

      const bottomAllCertificatesButton = document.createElement('button');
      bottomAllCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomAllCertificatesButton.textContent = '모든 보증서 다운 받기';
      bottomAllCertificatesButton.onclick = () => options.handleDownloadAllCertificatesAction();

      bottomActionsRow.appendChild(bottomActionGroup);
      bottomActionsRow.appendChild(bottomExportButton);
      bottomActionsRow.appendChild(bottomAllCertificatesButton);
      wrapper.appendChild(bottomActionsRow);

      const ticker = document.createElement('div');
      ticker.className = 'stats-ticker';
      ticker.id = 'sales-sold-stats-ticker';
      wrapper.appendChild(ticker);

      container.appendChild(wrapper);
      renderSoldWorkRows();
    }

    return {
      cloneSalesRecords,
      pushSalesUndoSnapshot,
      updateSalesActionButtons,
      renderInventorySalesManagement,
      renderSalesManagement,
      renderSoldWorkRows,
      isValidKoreanPhone,
      getMissingRequiredSoldFields,
      markMissingSoldFields,
      saveSoldWork,
      saveAllSoldWorks,
      toggleSoldWorkEdit,
      deleteSoldWork,
      handleSoldFieldChange,
      syncSoldFromRow,
      handleSoldPhoneInput,
      handleSoldPaymentMethodChange,
      handleSoldWorkSearchChange,
      toggleSalesSelection,
      ensureSalesEditUndoSnapshot,
      toggleSelectAllSales,
      toggleSelectAllSalesFromButton,
      editSelectedSoldWorks,
      deleteAllSoldWorks,
      deleteSelectedSoldWorks,
      undoSalesChanges,
      openImagePreviewBySoldId
    };
  }

  const api = { create };
  root.ExhibitionDetailSalesViewController = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibitions/detail/accounting-view-controller.js */
(function initializeExhibitionDetailAccountingViewController(root) {
  'use strict';

  function create(options) {
    const exhibitionDetailState = options.state;
    const document = options.document;
    const accountingProjection = options.accountingProjection;
    const canManageAccountingData = options.canManageAccountingData;
    const getFirstAllowedTab = options.getFirstAllowedTab;
    const switchTab = options.switchTab;
    const getCurrentExhibition = options.getCurrentExhibition;
    const ensureSoldWorksArray = options.ensureSoldWorksArray;
    const normalizeSoldItemType = options.normalizeSoldItemType;
    const getSoldQuantityForItemType = options.getSoldQuantityForItemType;
    const cloneSalesRecords = options.cloneSalesRecords;
    const saveExhibition = options.saveExhibition;
    const escapeHtml = options.escapeHtml;
    const alert = options.alert;
    const now = options.now;
    const random = options.random;

    function parseAccountingAmount(value) {
      return accountingProjection.parseAmount(value);
    }

    function formatAccountingAmount(value) {
      return accountingProjection.formatAmount(value);
    }

    function getExhibitionExpenseItems() {
      const exhibition = getCurrentExhibition();
      if (!Array.isArray(exhibition.expenseItems)) {
        exhibition.expenseItems = [];
      }

      if (!exhibition.expenseDefaultsInitialized) {
        const defaultRows = [
          { id: 'expense-print', code: 'print', division: '홍보물 인쇄', amount: '' },
          { id: 'expense-marketing', code: 'marketing', division: '마케팅 비용', amount: '' },
          { id: 'expense-commission-art', code: 'commission-art', division: '작가 커미션 (판매작)', amount: '' },
          { id: 'expense-commission-goods', code: 'commission-goods', division: '작가 커미션 (판매굿즈)', amount: '' }
        ];

        exhibition.expenseItems = [...defaultRows, ...exhibition.expenseItems];
        exhibition.expenseDefaultsInitialized = true;

        if (exhibitionDetailState.exhibition) {
          exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
          exhibitionDetailState.exhibition.expenseDefaultsInitialized = true;
        }
        saveExhibition();
      }

      return exhibition.expenseItems;
    }

    function getExhibitionRevenueItems() {
      return accountingProjection.buildRevenueItems({
        soldWorks: ensureSoldWorksArray(),
        manualRevenueItems: getExhibitionManualRevenueItems(),
        normalizeItemType: normalizeSoldItemType,
        getQuantity: getSoldQuantityForItemType
      });
    }

    function getExhibitionManualRevenueItems() {
      const exhibition = getCurrentExhibition();
      if (!Array.isArray(exhibition.manualRevenueItems)) {
        exhibition.manualRevenueItems = [];
      }
      return exhibition.manualRevenueItems;
    }

    function getExpenseEffectiveAmount(item, revenueTotals) {
      return accountingProjection.getExpenseEffectiveAmount(item, revenueTotals);
    }

    function buildAccountingTableRows(items, options = {}) {
      const {
        kind = 'expense',
        selectedIds = [],
        revenueTotals = { art: 0, goods: 0 },
        editingIds = []
      } = options;

      const isExpense = kind === 'expense';
      const rows = items.map((item) => {
        const isChecked = selectedIds.includes(item.id);
        const isAutoCommission = item.code === 'commission-art' || item.code === 'commission-goods';
        const isEditing = editingIds.includes(item.id);
        const displayAmount = isAutoCommission ? getExpenseEffectiveAmount(item, revenueTotals) : item.amount;
        const isAutoRevenue = !isExpense && item.source === 'auto';

        if (!isExpense) {
          return `
            <tr>
              <td class="checkbox-col"><input type="checkbox" data-accounting-kind="${kind}" data-accounting-id="${item.id}" ${isChecked ? 'checked' : ''} ${isAutoRevenue ? '' : ''} onclick='toggleAccountingRowSelection("${kind}", ${JSON.stringify(item.id)}, this.checked)'></td>
              <td>
                ${isAutoRevenue || !isEditing
                  ? `<span class="accounting-cell-text">${escapeHtml(String(item.division || ''))}</span>`
                  : `<input
                      id="revenue-division-${item.id}"
                      type="text"
                      class="accounting-text-input"
                      value="${escapeHtml(String(item.division || ''))}"
                      placeholder="예: 협찬금"
                      >`}
              </td>
              <td class="accounting-amount-cell">
                ${isAutoRevenue || !isEditing
                  ? `<span class="accounting-cell-text">${formatAccountingAmount(item.amount)}</span>`
                  : `<input
                      id="revenue-amount-${item.id}"
                      type="text"
                      class="accounting-amount-input"
                      value="${escapeHtml(String(item.amount || ''))}"
                      placeholder="₩ 0"
                      oninput="this.value = formatAccountingInput(this.value)"
                      >`}
              </td>
              <td class="accounting-action-cell">
                <button class="action-btn edit-btn" onclick='${isAutoRevenue ? `editAccountingRow("revenue", ${JSON.stringify(item.id)})` : (isEditing ? `saveRevenueRowEdit(${JSON.stringify(item.id)})` : `editAccountingRow("revenue", ${JSON.stringify(item.id)})`)}'>${!isAutoRevenue && isEditing ? '저장' : '수정'}</button>
                <button class="action-btn delete-btn" onclick='deleteAccountingRow("revenue", ${JSON.stringify(item.id)})'>삭제</button>
              </td>
            </tr>
          `;
        }

        return `
          <tr>
            <td class="checkbox-col"><input type="checkbox" data-accounting-kind="${kind}" data-accounting-id="${item.id}" ${isChecked ? 'checked' : ''} onclick='toggleAccountingRowSelection("${kind}", ${JSON.stringify(item.id)}, this.checked)'></td>
            <td>
              ${isAutoCommission || !isEditing
                ? `<span class="accounting-cell-text">${escapeHtml(String(item.division || ''))}</span>`
                : `<input
                    id="expense-division-${item.id}"
                    type="text"
                    class="accounting-text-input"
                    value="${escapeHtml(String(item.division || ''))}"
                    placeholder="예: 설치비, 운송비"
                    >`}
            </td>
            <td>
              ${isAutoCommission || !isEditing
                ? `<span class="accounting-cell-text">${formatAccountingAmount(displayAmount)}</span>`
                : `<input
                    id="expense-amount-${item.id}"
                    type="text"
                    class="accounting-amount-input"
                    value="${escapeHtml(String(item.amount || ''))}"
                    placeholder="0"
                    oninput="this.value = formatAccountingInput(this.value)"
                    >`}
            </td>
            <td class="accounting-action-cell">
              <button class="action-btn edit-btn" onclick='${isEditing ? `saveExpenseRowEdit(${JSON.stringify(item.id)})` : `editAccountingRow("expense", ${JSON.stringify(item.id)})`}'>${isEditing ? '저장' : '수정'}</button>
              <button class="action-btn delete-btn" onclick='deleteAccountingRow("expense", ${JSON.stringify(item.id)})'>삭제</button>
            </td>
          </tr>
        `;
      }).join('');

      return rows;
    }

    function renderExhibitionAccounting(container) {
      if (!canManageAccountingData()) {
        const fallbackTab = getFirstAllowedTab() || 'exhibition-info';
        switchTab(fallbackTab);
        return;
      }

      const exhibition = getCurrentExhibition();
      const expenseItems = getExhibitionExpenseItems();
      const revenueItems = getExhibitionRevenueItems();
      const { revenueTotals, expenseTotal, revenueTotal, profitTotal } =
        accountingProjection.buildFinanceProjection({ expenseItems, revenueItems });

      exhibitionDetailState.selectedExpenseIds = exhibitionDetailState.selectedExpenseIds
        .filter((id) => expenseItems.some((item) => item.id === id));
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds
        .filter((id) => expenseItems.some((item) => item.id === id));
      exhibitionDetailState.selectedRevenueIds = exhibitionDetailState.selectedRevenueIds
        .filter((id) => revenueItems.some((item) => item.id === id));
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds
        .filter((id) => revenueItems.some((item) => item.id === id));

      container.innerHTML = `
        <div class="accounting-wrapper">
          <div class="accounting-header-row">
            <h2>전시 회계</h2>
            <button type="button" class="works-action-btn works-action-btn-secondary" onclick="exportAccountingToExcel()">엑셀 파일로 다운로드</button>
          </div>
          <p class="accounting-description">전시의 지출과 수입을 한 화면에서 확인하세요.</p>
          <div class="accounting-profit-ticker ${profitTotal < 0 ? 'negative' : 'positive'}" role="status" aria-live="polite">
            <span class="accounting-profit-label">총이익</span>
            <strong class="accounting-profit-value">${formatAccountingAmount(profitTotal)}</strong>
            <span class="accounting-profit-meta">수입 합계 ${formatAccountingAmount(revenueTotal)} · 지출 합계 ${formatAccountingAmount(expenseTotal)}</span>
          </div>

          <div class="accounting-grid">
            <section class="accounting-card">
              <div class="accounting-card-header">
                <h3>지출</h3>
              </div>
              <div class="accounting-actions">
                <button type="button" class="works-action-btn" onclick="addExpenseItem()">+ 지출 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-select-all-btn" onclick="toggleAccountingSelectAllFromButton('expense')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('expense')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-undo-btn" onclick="undoExpenseAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="expense-delete-selected-btn" onclick="deleteSelectedExpenseItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
              <div class="accounting-table-wrapper">
                <table class="works-table accounting-table">
                  <colgroup>
                    <col class="accounting-col-checkbox">
                    <col class="accounting-col-division">
                    <col class="accounting-col-amount">
                    <col class="accounting-col-action">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="checkbox-col"><input type="checkbox" id="select-all-expense-accounting" onclick="toggleAccountingSelectAll('expense', this)"></th>
                      <th>구분</th>
                      <th>금액</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildAccountingTableRows(expenseItems, { kind: 'expense', selectedIds: exhibitionDetailState.selectedExpenseIds, revenueTotals, editingIds: exhibitionDetailState.editingExpenseIds })}
                  </tbody>
                  <tfoot>
                    <tr class="accounting-total-row">
                      <td></td>
                      <td>합계</td>
                      <td class="accounting-amount-cell">${formatAccountingAmount(expenseTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div class="accounting-actions" style="margin-top:10px;">
                <button type="button" class="works-action-btn" onclick="addExpenseItem()">+ 지출 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-select-all-btn-bottom" onclick="toggleAccountingSelectAllFromButton('expense')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('expense')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-undo-btn-bottom" onclick="undoExpenseAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="expense-delete-selected-btn-bottom" onclick="deleteSelectedExpenseItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
            </section>

            <section class="accounting-card">
              <div class="accounting-card-header">
                <h3>수입</h3>
                <span class="accounting-note">작품/굿즈 판매 내역 자동 반영</span>
              </div>
              <div class="accounting-actions">
                <button type="button" class="works-action-btn" onclick="addRevenueItem()">+ 수입 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-select-all-btn" onclick="toggleAccountingSelectAllFromButton('revenue')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('revenue')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-undo-btn" onclick="undoRevenueAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="revenue-delete-selected-btn" onclick="deleteSelectedRevenueItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
              <div class="accounting-table-wrapper">
                <table class="works-table accounting-table">
                  <colgroup>
                    <col class="accounting-col-checkbox">
                    <col class="accounting-col-division">
                    <col class="accounting-col-amount">
                    <col class="accounting-col-action">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="checkbox-col"><input type="checkbox" id="select-all-revenue-accounting" onclick="toggleAccountingSelectAll('revenue', this)"></th>
                      <th>구분</th>
                      <th>금액</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildAccountingTableRows(revenueItems, { kind: 'revenue', selectedIds: exhibitionDetailState.selectedRevenueIds, editingIds: exhibitionDetailState.editingRevenueIds })}
                  </tbody>
                  <tfoot>
                    <tr class="accounting-total-row">
                      <td></td>
                      <td>합계</td>
                      <td class="accounting-amount-cell">${formatAccountingAmount(revenueTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div class="accounting-actions" style="margin-top:10px;">
                <button type="button" class="works-action-btn" onclick="addRevenueItem()">+ 수입 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-select-all-btn-bottom" onclick="toggleAccountingSelectAllFromButton('revenue')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('revenue')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-undo-btn-bottom" onclick="undoRevenueAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="revenue-delete-selected-btn-bottom" onclick="deleteSelectedRevenueItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
            </section>
          </div>
        </div>
      `;

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }

      updateAccountingActionButtons();
    }

    function formatAccountingInput(value) {
      const raw = String(value ?? '').replace(/[^\d.-]/g, '');
      if (!raw || raw === '-' || raw === '.' || raw === '-.') return raw;
      const number = Number(raw);
      if (!Number.isFinite(number)) return '';
      return `₩ ${number.toLocaleString('ko-KR')}`;
    }

    function addExpenseItem() {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      pushExpenseUndoSnapshot();
      const newId = now() + Math.floor(random() * 1000);
      const expenses = getExhibitionExpenseItems();
      expenses.push({
        id: newId,
        division: '',
        amount: ''
      });
      if (!exhibitionDetailState.editingExpenseIds.includes(newId)) {
        exhibitionDetailState.editingExpenseIds = [...exhibitionDetailState.editingExpenseIds, newId];
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function handleExpenseFieldChange(expenseId, field, value) {
      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === expenseId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') return;
      pushExpenseUndoSnapshot();

      if (field === 'amount') {
        target.amount = formatAccountingInput(value);
      } else {
        target[field] = value;
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteSelectedExpenseItems() {
      if (exhibitionDetailState.selectedExpenseIds.length === 0) return;
      pushExpenseUndoSnapshot();
      const selectedIds = new Set(exhibitionDetailState.selectedExpenseIds);
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = getExhibitionExpenseItems().filter((item) => !selectedIds.has(item.id));
      exhibitionDetailState.selectedExpenseIds = [];
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => !selectedIds.has(id));

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function pushExpenseUndoSnapshot() {
      const snapshot = JSON.parse(JSON.stringify(getExhibitionExpenseItems()));
      exhibitionDetailState.expenseUndoStack.push(snapshot);
      if (exhibitionDetailState.expenseUndoStack.length > 30) {
        exhibitionDetailState.expenseUndoStack.shift();
      }
    }

    function pushRevenueUndoSnapshot() {
      const snapshot = {
        soldWorks: cloneSalesRecords(ensureSoldWorksArray()),
        manualRevenueItems: JSON.parse(JSON.stringify(getExhibitionManualRevenueItems()))
      };
      exhibitionDetailState.revenueUndoStack.push(snapshot);
      if (exhibitionDetailState.revenueUndoStack.length > 30) {
        exhibitionDetailState.revenueUndoStack.shift();
      }
    }

    function toggleAccountingRowSelection(kind, id, checked) {
      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = checked
          ? Array.from(new Set([...exhibitionDetailState.selectedExpenseIds, id]))
          : exhibitionDetailState.selectedExpenseIds.filter((itemId) => itemId !== id);
      } else {
        exhibitionDetailState.selectedRevenueIds = checked
          ? Array.from(new Set([...exhibitionDetailState.selectedRevenueIds, id]))
          : exhibitionDetailState.selectedRevenueIds.filter((itemId) => itemId !== id);
      }
      updateAccountingActionButtons();
    }

    function toggleAccountingSelectAll(kind, source) {
      const items = kind === 'expense' ? getExhibitionExpenseItems() : getExhibitionRevenueItems();
      const ids = items.map((item) => item.id);

      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = source.checked ? ids : [];
      } else {
        exhibitionDetailState.selectedRevenueIds = source.checked ? ids : [];
      }

      switchTab('exhibition-accounting');
    }

    function toggleAccountingSelectAllFromButton(kind) {
      const items = kind === 'expense' ? getExhibitionExpenseItems() : getExhibitionRevenueItems();
      const ids = items.map((item) => item.id);
      const selectedIds = kind === 'expense' ? exhibitionDetailState.selectedExpenseIds : exhibitionDetailState.selectedRevenueIds;
      const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = allSelected ? [] : ids;
      } else {
        exhibitionDetailState.selectedRevenueIds = allSelected ? [] : ids;
      }

      switchTab('exhibition-accounting');
    }

    function deleteAllAccountingItems(kind) {
      if (kind === 'expense') {
        const expenses = getExhibitionExpenseItems();
        if (expenses.length === 0) return;
        pushExpenseUndoSnapshot();
        const exhibition = getCurrentExhibition();
        exhibition.expenseItems = [];
        exhibitionDetailState.selectedExpenseIds = [];
        exhibitionDetailState.editingExpenseIds = [];
        if (exhibitionDetailState.exhibition) {
          exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
        }
        saveExhibition();
        switchTab('exhibition-accounting');
        return;
      }

      const soldWorks = ensureSoldWorksArray();
      const manualRevenueItems = getExhibitionManualRevenueItems();
      if (soldWorks.length === 0 && manualRevenueItems.length === 0) return;
      pushRevenueUndoSnapshot();
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = [];
      exhibition.manualRevenueItems = [];
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function undoExpenseAccountingChanges() {
      if (exhibitionDetailState.expenseUndoStack.length === 0) return;
      const previous = exhibitionDetailState.expenseUndoStack.pop();
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = JSON.parse(JSON.stringify(previous || []));
      exhibitionDetailState.selectedExpenseIds = [];
      exhibitionDetailState.editingExpenseIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function undoRevenueAccountingChanges() {
      if (exhibitionDetailState.revenueUndoStack.length === 0) return;
      const previous = exhibitionDetailState.revenueUndoStack.pop();
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = cloneSalesRecords(previous?.soldWorks || []);
      exhibition.manualRevenueItems = JSON.parse(JSON.stringify(previous?.manualRevenueItems || []));
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteSelectedRevenueItems() {
      if (exhibitionDetailState.selectedRevenueIds.length === 0) return;
      pushRevenueUndoSnapshot();
      const selectedKinds = new Set(exhibitionDetailState.selectedRevenueIds);
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = ensureSoldWorksArray().filter((item) => {
        const kind = normalizeSoldItemType(item) === '굿즈' ? 'goods' : 'art';
        return !selectedKinds.has(kind);
      });
      exhibition.manualRevenueItems = getExhibitionManualRevenueItems().filter((item) => !selectedKinds.has(item.id));
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => !selectedKinds.has(id));
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function updateAccountingActionButtons() {
      const expenseItems = getExhibitionExpenseItems();
      const revenueItems = getExhibitionRevenueItems();

      const expenseAllSelected = expenseItems.length > 0 && expenseItems.every((item) => exhibitionDetailState.selectedExpenseIds.includes(item.id));
      const revenueAllSelected = revenueItems.length > 0 && revenueItems.every((item) => exhibitionDetailState.selectedRevenueIds.includes(item.id));

      ['expense-select-all-btn', 'expense-select-all-btn-bottom'].forEach((buttonId) => {
        const expenseSelectAllBtn = document.getElementById(buttonId);
        if (expenseSelectAllBtn) {
          expenseSelectAllBtn.textContent = expenseAllSelected ? '전체 선택 해제' : '전체 선택';
        }
      });

      ['revenue-select-all-btn', 'revenue-select-all-btn-bottom'].forEach((buttonId) => {
        const revenueSelectAllBtn = document.getElementById(buttonId);
        if (revenueSelectAllBtn) {
          revenueSelectAllBtn.textContent = revenueAllSelected ? '전체 선택 해제' : '전체 선택';
        }
      });

      ['expense-delete-selected-btn', 'expense-delete-selected-btn-bottom'].forEach((buttonId) => {
        const expenseDeleteSelectedBtn = document.getElementById(buttonId);
        if (expenseDeleteSelectedBtn) {
          expenseDeleteSelectedBtn.style.display = exhibitionDetailState.selectedExpenseIds.length > 0 ? 'inline-block' : 'none';
        }
      });

      ['revenue-delete-selected-btn', 'revenue-delete-selected-btn-bottom'].forEach((buttonId) => {
        const revenueDeleteSelectedBtn = document.getElementById(buttonId);
        if (revenueDeleteSelectedBtn) {
          revenueDeleteSelectedBtn.style.display = exhibitionDetailState.selectedRevenueIds.length > 0 ? 'inline-block' : 'none';
        }
      });

      ['expense-undo-btn', 'expense-undo-btn-bottom'].forEach((buttonId) => {
        const expenseUndoBtn = document.getElementById(buttonId);
        if (expenseUndoBtn) {
          const canUndo = exhibitionDetailState.expenseUndoStack.length > 0;
          expenseUndoBtn.disabled = !canUndo;
          expenseUndoBtn.style.opacity = canUndo ? '1' : '0.5';
          expenseUndoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
      });

      ['revenue-undo-btn', 'revenue-undo-btn-bottom'].forEach((buttonId) => {
        const revenueUndoBtn = document.getElementById(buttonId);
        if (revenueUndoBtn) {
          const canUndo = exhibitionDetailState.revenueUndoStack.length > 0;
          revenueUndoBtn.disabled = !canUndo;
          revenueUndoBtn.style.opacity = canUndo ? '1' : '0.5';
          revenueUndoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
      });

      const expenseHeaderCheckbox = document.getElementById('select-all-expense-accounting');
      if (expenseHeaderCheckbox) {
        expenseHeaderCheckbox.checked = expenseAllSelected;
      }

      const revenueHeaderCheckbox = document.getElementById('select-all-revenue-accounting');
      if (revenueHeaderCheckbox) {
        revenueHeaderCheckbox.checked = revenueAllSelected;
      }
    }

    function addRevenueItem() {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      pushRevenueUndoSnapshot();
      const newId = `revenue-${now()}-${Math.floor(random() * 1000)}`;
      const manualRevenueItems = getExhibitionManualRevenueItems();
      manualRevenueItems.push({
        id: newId,
        division: '',
        amount: ''
      });

      if (!exhibitionDetailState.editingRevenueIds.includes(newId)) {
        exhibitionDetailState.editingRevenueIds = [...exhibitionDetailState.editingRevenueIds, newId];
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function editAccountingRow(kind, rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      if (kind === 'revenue') {
        const revenueItems = getExhibitionRevenueItems();
        const targetRevenue = revenueItems.find((item) => item.id === rowId);
        if (!targetRevenue) return;

        if (targetRevenue.source === 'auto') {
          exhibitionDetailState.salesSearch = rowId === 'goods' ? '굿즈' : '작품';
          switchTab('inventory-sales');
          return;
        }

        if (!exhibitionDetailState.editingRevenueIds.includes(rowId)) {
          exhibitionDetailState.editingRevenueIds = [...exhibitionDetailState.editingRevenueIds, rowId];
        }
        switchTab('exhibition-accounting');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === rowId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') {
        alert('해당 항목은 판매 합계 기반 자동 계산 항목입니다. 작품/굿즈 판매 내역을 수정해주세요.');
        return;
      }

      if (!exhibitionDetailState.editingExpenseIds.includes(rowId)) {
        exhibitionDetailState.editingExpenseIds = [...exhibitionDetailState.editingExpenseIds, rowId];
      }
      switchTab('exhibition-accounting');
    }

    function saveExpenseRowEdit(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === rowId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') return;

      const divisionInput = document.getElementById(`expense-division-${rowId}`);
      const amountInput = document.getElementById(`expense-amount-${rowId}`);
      const nextDivision = (divisionInput ? divisionInput.value : target.division || '').trim();
      const nextAmount = (amountInput ? amountInput.value : target.amount || '').trim();

      if (!nextDivision || !nextAmount) {
        alert('구분과 금액을 모두 입력한 뒤 저장해주세요.');
        return;
      }

      pushExpenseUndoSnapshot();
      target.division = nextDivision;
      target.amount = formatAccountingInput(nextAmount);

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }

      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => id !== rowId);
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteAccountingRow(kind, rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      if (kind === 'revenue') {
        deleteRevenueRowByType(rowId);
        return;
      }
      deleteExpenseRowById(rowId);
    }

    function deleteExpenseRowById(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      if (!expenses.some((item) => item.id === rowId)) return;

      pushExpenseUndoSnapshot();
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = expenses.filter((item) => item.id !== rowId);
      exhibitionDetailState.selectedExpenseIds = exhibitionDetailState.selectedExpenseIds.filter((id) => id !== rowId);
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => id !== rowId);

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteRevenueRowByType(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const exhibition = getCurrentExhibition();
      const soldWorks = ensureSoldWorksArray();
      const manualRevenueItems = getExhibitionManualRevenueItems();
      const hasManual = manualRevenueItems.some((item) => item.id === rowId);
      const isAutoKind = rowId === 'art' || rowId === 'goods';
      if (!hasManual && !isAutoKind) return;

      pushRevenueUndoSnapshot();
      if (isAutoKind) {
        exhibition.soldWorks = soldWorks.filter((item) => {
          const kind = normalizeSoldItemType(item) === '굿즈' ? 'goods' : 'art';
          return kind !== rowId;
        });
      } else {
        exhibition.manualRevenueItems = manualRevenueItems.filter((item) => item.id !== rowId);
      }
      exhibitionDetailState.selectedRevenueIds = exhibitionDetailState.selectedRevenueIds.filter((id) => id !== rowId);
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => id !== rowId);

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function saveRevenueRowEdit(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const manualRevenueItems = getExhibitionManualRevenueItems();
      const target = manualRevenueItems.find((item) => item.id === rowId);
      if (!target) return;

      const divisionInput = document.getElementById(`revenue-division-${rowId}`);
      const amountInput = document.getElementById(`revenue-amount-${rowId}`);
      const nextDivision = (divisionInput ? divisionInput.value : target.division || '').trim();
      const nextAmountRaw = (amountInput ? amountInput.value : target.amount || '').trim();

      if (!nextDivision || !nextAmountRaw) {
        alert('구분과 금액을 모두 입력한 뒤 저장해주세요.');
        return;
      }

      pushRevenueUndoSnapshot();
      target.division = nextDivision;
      target.amount = formatAccountingInput(nextAmountRaw);

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }

      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => id !== rowId);
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    return {
      addExpenseItem,
      addRevenueItem,
      buildAccountingTableRows,
      deleteAccountingRow,
      deleteAllAccountingItems,
      deleteExpenseRowById,
      deleteRevenueRowByType,
      deleteSelectedExpenseItems,
      deleteSelectedRevenueItems,
      editAccountingRow,
      formatAccountingAmount,
      formatAccountingInput,
      getExhibitionExpenseItems,
      getExhibitionManualRevenueItems,
      getExhibitionRevenueItems,
      getExpenseEffectiveAmount,
      handleExpenseFieldChange,
      parseAccountingAmount,
      pushExpenseUndoSnapshot,
      pushRevenueUndoSnapshot,
      renderExhibitionAccounting,
      saveExpenseRowEdit,
      saveRevenueRowEdit,
      toggleAccountingRowSelection,
      toggleAccountingSelectAll,
      toggleAccountingSelectAllFromButton,
      undoExpenseAccountingChanges,
      undoRevenueAccountingChanges,
      updateAccountingActionButtons
    };
  }

  const api = { create };
  root.ExhibitionDetailAccountingViewController = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* exhibition-detail.js */
const exhibitionDetailState = {
  exhibitionId: null,
  exhibition: null,
  currentTab: 'exhibition-info',
  inventoryMode: 'art',
  inventoryListView: 'art',
  inventoryUiStateByMode: {
    art: null,
    goods: null
  },
  inviteRole: null,
  inviteSearch: '',
  pendingDeleteWorkId: null,
  workSearch: '',
  workAdvanced: false,
  salesSearch: '',
  salesAdvanced: false,
  workListExpanded: true,
  selectedWorkIds: [],
  selectedSalesIds: [],
  salesUndoStack: [],
  workUndoStack: [],
  salesEditSnapshotIds: [],
  salesSearchQuery: '',
  salesSearchResults: [],
  salesAddBuffer: [],
  salesSearchHighlightIndex: -1,
  salesAddApplyCommonBuyer: false,
  salesAddCommonBuyerName: '',
  salesAddCommonBuyerPhone: '',
  salesAddCommonPaymentMethod: '',
  workSortField: null,
  workSortDirection: 'asc',
  salesSortField: null,
  salesSortDirection: 'asc',
  unsavedWorkCount: 0,
  workEditSnapshotIds: [],
  lastWorkCheckboxIndex: null,
  lastSalesCheckboxIndex: null,
  gridNavAnchor: null,
  pendingGridFocus: null,
  workFilters: {
    title: '',
    artist: '',
    price: '',
    materials: '',
    size: '',
    year: '',
    category: ''
  },
  salesFilters: {
    manualNumber: '',
    title: '',
    author: '',
    soldDateFrom: '',
    soldDateTo: '',
    buyerName: '',
    buyerPhone: '',
    paymentMethod: ''
  },
  selectedExpenseIds: [],
  selectedRevenueIds: [],
  expenseUndoStack: [],
  revenueUndoStack: [],
  editingExpenseIds: [],
  editingRevenueIds: [],
  filesView: 'docs',
  fileUploadTarget: 'docs',
  pendingUploadFiles: [],
  pendingUploadEntries: [],
  lastSaveFailureAlertAt: 0,
  allowLargeInventoryDropOnce: false,
  backupSnapshots: [],
  backupCanUndo: false,
  backupLoading: false,
  backupError: ''
};

const INVENTORY_BACKUP_KEY_PREFIX = 'exhibition-inventory-backup:';
const LARGE_DROP_MIN_PREVIOUS_TOTAL = 20;
const LARGE_DROP_MIN_ABSOLUTE = 15;
const LARGE_DROP_RATIO = 0.7;

let certificateController = null;
let inventoryStateController = null;
let worksEditorController = null;
let worksView = null;
let salesViewController = null;
let accountingViewController = null;
let backupController = null;
let infoController = null;
let staffController = null;
let filesController = null;
let salesAddController = null;
let gridNavigationController = null;
let exhibitionDetailDependencies = null;
let certificateLibrariesPromise = null;

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load certificate dependency: ${source}`));
    document.head.appendChild(script);
  });
}

function ensureCertificateLibraries() {
  if (globalThis.XlsxPopulate && globalThis.JSZip) return Promise.resolve();
  if (!certificateLibrariesPromise) {
    certificateLibrariesPromise = Promise.all([
      globalThis.XlsxPopulate
        ? Promise.resolve()
        : loadClassicScript('node_modules/xlsx-populate/browser/xlsx-populate.min.js'),
      globalThis.JSZip
        ? Promise.resolve()
        : loadClassicScript('node_modules/jszip/dist/jszip.min.js')
    ]).then(() => {
      if (!globalThis.XlsxPopulate || !globalThis.JSZip) {
        throw new Error('Certificate dependencies did not initialize.');
      }
    });
  }
  return certificateLibrariesPromise;
}

function resolveExhibitionDetailDependencies() {
  const dependencies = {
    accountingProjection: globalThis.ExhibitionAccountingProjection,
    backupControllerModule: globalThis.ExhibitionDetailBackupController,
    certificateControllerModule: globalThis.ExhibitionDetailCertificateController,
    certificateModel: globalThis.ExhibitionCertificateModel,
    detailRepository: globalThis.ExhibitionDetailRepository?.repository,
    exportModel: globalThis.ExhibitionExportModel,
    filesControllerModule: globalThis.ExhibitionDetailFilesController,
    gridNavigationModule: globalThis.ExhibitionDetailGridNavigation,
    imageLifecycle: globalThis.ExhibitionImageLifecycle,
    infoControllerModule: globalThis.ExhibitionDetailInfoController,
    inventoryBackupModel: globalThis.ExhibitionInventoryBackupModel,
    inventoryModel: globalThis.ExhibitionInventoryModel,
    inventoryRenderer: globalThis.ExhibitionInventoryRenderer,
    inventoryStateControllerModule: globalThis.ExhibitionDetailInventoryStateController,
    repository: globalThis.ExhibitionsRepository?.repository,
    salesAddControllerModule: globalThis.ExhibitionDetailSalesAddController,
    salesModel: globalThis.ExhibitionSalesModel,
    salesViewControllerModule: globalThis.ExhibitionDetailSalesViewController,
    snapshotClient: globalThis.ExhibitionSnapshotClient,
    staffControllerModule: globalThis.ExhibitionDetailStaffController,
    tabsController: globalThis.ExhibitionDetailTabsController,
    worksEditorControllerModule: globalThis.ExhibitionDetailWorksEditorController,
    worksViewModule: globalThis.ExhibitionDetailWorksView,
    accountingViewControllerModule: globalThis.ExhibitionDetailAccountingViewController
  };
  const missing = Object.entries(dependencies).find(([, dependency]) => !dependency);
  if (missing) throw new Error(`Exhibition detail dependency is unavailable: ${missing[0]}`);
  return Object.freeze(dependencies);
}

function createCertificateController() {
  return exhibitionDetailDependencies.certificateControllerModule.create({
    ExhibitionCertificateModel: exhibitionDetailDependencies.certificateModel,
    ExhibitionImageLifecycle: exhibitionDetailDependencies.imageLifecycle,
    ensureCertificateLibraries,
    getJSZip: () => globalThis.JSZip,
    getXlsxPopulate: () => globalThis.XlsxPopulate,
    document,
    URL,
    fetch: (...args) => globalThis.fetch(...args),
    DOMParser: globalThis.DOMParser,
    XMLSerializer: globalThis.XMLSerializer,
    FileReader: globalThis.FileReader,
    ArrayBuffer: globalThis.ArrayBuffer,
    Uint8Array: globalThis.Uint8Array,
    atob: (...args) => globalThis.atob(...args),
    loadImageElement,
    getCurrentExhibition,
    ensureExhibitionInfoData,
    ensureSoldWorksArray,
    normalizeSoldItemType,
    getSourceArtworkForSold: (sold) => exhibitionDetailDependencies.certificateModel.getSourceArtwork(getCurrentExhibition(), sold),
    saveExhibition,
    renderSalesManagement: renderSoldWorkRows,
    setStateSoldWorks(soldWorks) {
      if (exhibitionDetailState.exhibition) exhibitionDetailState.exhibition.soldWorks = soldWorks;
    },
    alert,
    console
  });
}

function createInventoryStateController() {
  return exhibitionDetailDependencies.inventoryStateControllerModule.create({
    state: exhibitionDetailState,
    getCurrentExhibition
  });
}

function createWorksEditorController() {
  return exhibitionDetailDependencies.worksEditorControllerModule.create({
    state: exhibitionDetailState,
    document,
    window,
    fetchImpl: (...args) => fetch(...args),
    FileReaderImpl: FileReader,
    ImageImpl: Image,
    createCanvas: () => document.createElement('canvas'),
    inventoryModel: exhibitionDetailDependencies.inventoryModel,
    imageLifecycle: exhibitionDetailDependencies.imageLifecycle,
    getCurrentExhibition,
    getCurrentUserId,
    pushWorkUndoSnapshot,
    saveExhibition,
    renderWorkRows,
    updateSaveAllButtonVisibility,
    requestAnimationFrameImpl: (callback) => requestAnimationFrame(callback),
    canCurrentUserModifyOwnedRow,
    alertImpl: (...args) => alert(...args),
    getPhotoPreviewDataUrl,
    formatPriceForSave,
    normalizeSoldItemType,
    initializeInventoryData,
    ensureWorkEditUndoSnapshot,
    scrollRowToViewportCenter,
    getVisibleWorks,
    switchTab,
    getCurrentInventoryListTabName,
    isArtistScopedUser,
    refreshGridKeyboardNavigation,
    setTimeoutImpl: (callback, delay) => setTimeout(callback, delay),
    nowImpl: () => Date.now(),
    randomImpl: () => Math.random(),
    consoleImpl: console
  });
}

function createWorksView() {
  return exhibitionDetailDependencies.worksViewModule.create({
    state: exhibitionDetailState,
    document,
    syncInventoryMode,
    getCurrentExhibition,
    getExhibitionAccessRole,
    isArtistScopedUser,
    getVisibleWorks,
    getSortedWorks,
    updateWorkSelectionActionButtons,
    updateWorksUndoButton,
    inventoryRenderer: exhibitionDetailDependencies.inventoryRenderer,
    canCurrentUserModifyOwnedRow,
    getPhotoPreviewDataUrl,
    ensureSoldWorksArray,
    normalizeSoldItemType,
    getGoodsSoldQuantity,
    parseStockQuantity,
    parseSizeParts,
    isWorkNotForSale,
    refreshGridKeyboardNavigation,
    getSortIndicator,
    addWorkRow,
    toggleSelectAllVisibleWorks,
    deleteAllWorks,
    deleteSelectedWorks,
    editSelectedWorks,
    exportWorksToExcel,
    saveAllWorks,
    undoWorkChanges
  });
}

function createSalesViewController() {
  return exhibitionDetailDependencies.salesViewControllerModule.create({
    state: exhibitionDetailState,
    document,
    window,
    openSalesAddModal,
    exportSalesToExcel,
    handleDownloadAllCertificatesAction,
    isArtistScopedUser,
    getSalesSortIndicator,
    getCurrentExhibition,
    ensureSoldWorksArray,
    getSortedSoldWorks,
    getSalesSearchResults,
    canCurrentUserModifyOwnedRow,
    getPhotoPreviewDataUrl,
    normalizeSoldItemType,
    getSoldQuantityForItemType,
    hasGeneratedCertificate,
    soldKstToInputValue,
    soldInputValueToKst,
    formatKoreanPhone,
    parseSoldQuantity,
    saveExhibition,
    renderSoldStatsTicker,
    refreshGridKeyboardNavigation,
    scrollRowToViewportCenter,
    alert: (...args) => alert(...args),
    confirm: (...args) => confirm(...args)
  });
}

function createAccountingViewController() {
  return exhibitionDetailDependencies.accountingViewControllerModule.create({
  state: exhibitionDetailState,
  document,
  accountingProjection: exhibitionDetailDependencies.accountingProjection,
  canManageAccountingData,
  getFirstAllowedTab,
  switchTab,
  getCurrentExhibition,
  ensureSoldWorksArray,
  normalizeSoldItemType,
  getSoldQuantityForItemType,
  cloneSalesRecords,
  saveExhibition,
  escapeHtml: escapeAccountingHtml,
  alert: (...args) => alert(...args),
  now: () => Date.now(),
  random: () => Math.random()
  });
}

function createBackupController() {
  return exhibitionDetailDependencies.backupControllerModule.create({
  state: exhibitionDetailState,
  document,
  fetchImpl: (...args) => fetch(...args),
  snapshotClient: exhibitionDetailDependencies.snapshotClient,
  exhibitionsRepository: exhibitionDetailDependencies.repository,
  getCurrentExhibition,
  getCurrentUser,
  getExhibitionAccessRole,
  getFirstAllowedTab,
  switchTab,
  escapeHtml: escapeAccountingHtml,
  alertImpl: (...args) => alert(...args),
  confirmImpl: (...args) => confirm(...args)
  });
}

function createInfoController() {
  return exhibitionDetailDependencies.infoControllerModule.create({
  state: exhibitionDetailState,
  document,
  loadUsers: () => exhibitionDetailDependencies.detailRepository.loadUsers(),
  getCurrentExhibition: () => getCurrentExhibition(),
  escapeHtml: (value) => escapeAccountingHtml(value),
  saveExhibition: () => saveExhibition(),
  switchTab: (tabName) => switchTab(tabName)
  });
}

function createStaffController() {
  return exhibitionDetailDependencies.staffControllerModule.create({
  state: exhibitionDetailState,
  document,
  getCurrentExhibition: () => getCurrentExhibition(),
  canManageStaffRoles: () => canManageStaffRoles(),
  getFirstAllowedTab: () => getFirstAllowedTab(),
  getEffectiveGalleryRole: (user) => getEffectiveGalleryRole(user),
  normalizeAccountType: (type) => normalizeAccountType(type),
  loadUsers: () => exhibitionDetailDependencies.detailRepository.loadUsers(),
  saveExhibition: () => saveExhibition(),
  switchTab: (tabName) => switchTab(tabName),
  alert: (...args) => alert(...args)
  });
}

function getCurrentExhibition() {
  return exhibitionDetailState.exhibition || {
    id: exhibitionDetailState.exhibitionId,
    title: '전시 정보 없음',
    startDate: '',
    endDate: '',
    type: '',
    staff: { planners: [], artists: [], staffs: [] },
    works: []
  };
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('currentUser')) || null;
}

const EXHIBITION_TAB_ORDER = [
  'exhibition-info',
  'staff',
  'inventory-list',
  'inventory-sales',
  'exhibition-accounting',
  'exhibition-files',
  'exhibition-backup'
];

const EXHIBITION_TAB_ACCESS_BY_ROLE = {
  admin: [...EXHIBITION_TAB_ORDER],
  planner: ['exhibition-info', 'inventory-list', 'inventory-sales', 'exhibition-accounting', 'exhibition-files'],
  artist: ['exhibition-info', 'inventory-list', 'inventory-sales', 'exhibition-files'],
  staff: ['exhibition-info', 'inventory-list', 'inventory-sales', 'exhibition-files'],
  none: []
};

function normalizeTabForAccess(tabName) {
  if (tabName === 'works' || tabName === 'goods' || tabName === 'inventory-list') return 'inventory-list';
  if (tabName === 'sales' || tabName === 'inventory-sales') return 'inventory-sales';
  return tabName;
}

function getCurrentUserId() {
  const user = getCurrentUser();
  return Number.isFinite(Number(user?.id)) ? Number(user.id) : null;
}

function normalizeSiteAccess(access) {
  const raw = access ? access.toString().trim().toLowerCase() : '';
  if (raw === 'both' || raw === 'all') return 'both';
  if (raw === 'pottery' || raw === 'studio') return 'pottery';
  if (raw === 'gallery') return 'gallery';
  return '';
}

function getEffectiveSiteAccess(user) {
  const direct = normalizeSiteAccess(user?.siteAccess);
  if (direct) return direct;
  return 'gallery';
}

function hasGalleryAccess(user) {
  const siteAccess = getEffectiveSiteAccess(user);
  return siteAccess === 'gallery' || siteAccess === 'both';
}

function normalizeGalleryRole(role) {
  const value = normalizeAccountType(role);
  if (value === '기획자' || value === '작가') {
    return '기획자/작가';
  }
  return value;
}

function getEffectiveGalleryRole(user) {
  const direct = normalizeGalleryRole(user?.galleryRole);
  if (direct) return direct;
  return normalizeGalleryRole(user?.accountType);
}

function getExhibitionAccessRole() {
  const user = getCurrentUser();
  if (!user) return 'none';
  if (!hasGalleryAccess(user)) return 'none';

  if (normalizeAccountType(getEffectiveGalleryRole(user)) === '어드민') {
    return 'admin';
  }

  const exhibition = getCurrentExhibition();
  const userId = Number(user.id);
  if (!Number.isFinite(userId)) return 'none';

  const planners = Array.isArray(exhibition.staff?.planners) ? exhibition.staff.planners.map(Number) : [];
  const artists = Array.isArray(exhibition.staff?.artists) ? exhibition.staff.artists.map(Number) : [];
  const staffs = Array.isArray(exhibition.staff?.staffs) ? exhibition.staff.staffs.map(Number) : [];

  if (planners.includes(userId)) return 'planner';
  if (artists.includes(userId)) return 'artist';
  if (staffs.includes(userId)) return 'staff';
  return 'none';
}

function getAllowedTabsForCurrentUser() {
  const role = getExhibitionAccessRole();
  return EXHIBITION_TAB_ACCESS_BY_ROLE[role] || [];
}

function canAccessTab(tabName) {
  const normalizedTab = normalizeTabForAccess(tabName);
  return getAllowedTabsForCurrentUser().includes(normalizedTab);
}

function getFirstAllowedTab() {
  const allowed = getAllowedTabsForCurrentUser();
  return EXHIBITION_TAB_ORDER.find((tab) => allowed.includes(tab)) || '';
}

function applyTabVisibilityByPermission() {
  exhibitionDetailDependencies.tabsController.applyTabVisibilityByPermission({
    document,
    canAccessTab
  });
}

function isArtistScopedUser() {
  const role = getExhibitionAccessRole();
  return role === 'artist' || role === 'staff';
}

function canCurrentUserModifyOwnedRow(rowItem) {
  const role = getExhibitionAccessRole();
  if (role === 'none') return false;
  if (role !== 'artist' && role !== 'staff') return true;

  const ownerId = Number(rowItem?.createdByUserId);
  const userId = getCurrentUserId();
  if (!Number.isFinite(ownerId) || !Number.isFinite(userId)) return false;
  return ownerId === userId;
}

function canManageStaffRoles() {
  return getExhibitionAccessRole() === 'admin';
}

function canManageAccountingData() {
  const role = getExhibitionAccessRole();
  return role === 'admin' || role === 'planner';
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function parseExhibitionIdFromQuery() {
  const rawId = getQueryParam('id');
  if (!rawId) return null;
  const parsed = Number(rawId);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseInitialTabFromQuery() {
  const rawTab = getQueryParam('tab');
  if (!rawTab) return '';
  return normalizeTabForAccess(rawTab.toString().trim());
}

function waitForCloudSyncReady(timeoutMs = 5000) {
  const cloudReady = window.cloudSyncReady;
  if (!cloudReady || typeof cloudReady.then !== 'function') {
    return Promise.resolve(window.cloudSyncStatus || null);
  }

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve(window.cloudSyncStatus || null);
    }, timeoutMs);
  });

  return Promise.race([
    cloudReady.catch(() => null),
    timeoutPromise
  ]);
}

function cloneJson(value, fallback) {
  return exhibitionDetailDependencies.inventoryBackupModel.cloneJson(value, fallback);
}

function stripLargePayloadFields(value) {
  return exhibitionDetailDependencies.inventoryBackupModel.stripLargePayloadFields(value);
}

function getInventoryBackupStorageKey(exhibitionId) {
  return exhibitionDetailDependencies.inventoryBackupModel.getInventoryBackupStorageKey(exhibitionId);
}

function getInventoryListCounts(exhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.getInventoryListCounts(exhibition);
}

function normalizeInventoryBackupSnapshot(exhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.normalizeInventoryBackupSnapshot(exhibition);
}

function loadInventoryBackup(exhibitionId) {
  const key = getInventoryBackupStorageKey(exhibitionId);
  if (!key) return null;
  return exhibitionDetailDependencies.detailRepository.loadInventoryBackup(key);
}

function persistInventoryBackup(exhibition) {
  const key = getInventoryBackupStorageKey(exhibition?.id);
  if (!key) return false;

  const snapshot = normalizeInventoryBackupSnapshot(exhibition);
  if (!snapshot) return false;

  const backup = {
    updatedAt: new Date().toISOString(),
    counts: getInventoryListCounts(snapshot),
    snapshot
  };
  return exhibitionDetailDependencies.detailRepository.saveInventoryBackupSafely(key, backup);
}

function updateInventoryResetMarker(exhibition) {
  const counts = getInventoryListCounts(exhibition);
  if (counts.total === 0) {
    exhibition.inventoryExplicitlyClearedAt = new Date().toISOString();
    return;
  }

  if (typeof exhibition.inventoryExplicitlyClearedAt === 'string') {
    delete exhibition.inventoryExplicitlyClearedAt;
  }
}

function restoreInventoryFromBackupIfNeeded(exhibitions, exhibitionIndex) {
  if (!Array.isArray(exhibitions) || exhibitionIndex < 0 || exhibitionIndex >= exhibitions.length) {
    return false;
  }

  const exhibition = exhibitions[exhibitionIndex];
  const backup = loadInventoryBackup(exhibition?.id);
  if (!backup) return false;

  const backupSnapshot = backup.snapshot;
  const backupCounts = backup.counts || getInventoryListCounts(backupSnapshot);
  const currentCounts = getInventoryListCounts(exhibition);

  const isLikelyWipe = currentCounts.total === 0 && backupCounts.total > 0;
  const isSevereDrop = backupCounts.total >= LARGE_DROP_MIN_PREVIOUS_TOTAL
    && currentCounts.total <= 3
    && (backupCounts.total - currentCounts.total) >= LARGE_DROP_MIN_ABSOLUTE;
  if (!isLikelyWipe && !isSevereDrop) return false;

  const clearedAtMs = Date.parse(exhibition.inventoryExplicitlyClearedAt || '');
  const backupAtMs = Date.parse(backup.updatedAt || '');
  if (Number.isFinite(clearedAtMs) && Number.isFinite(backupAtMs) && clearedAtMs >= backupAtMs) {
    return false;
  }

  exhibition.artWorks = cloneJson(backupSnapshot.artWorks || [], []);
  exhibition.goods = cloneJson(backupSnapshot.goods || [], []);
  exhibition.artSoldWorks = cloneJson(backupSnapshot.artSoldWorks || [], []);
  exhibition.soldGoods = cloneJson(backupSnapshot.soldGoods || [], []);
  exhibition.updatedAt = new Date().toISOString();

  if (!Array.isArray(exhibition.works) || exhibition.works.length === 0) {
    exhibition.works = exhibition.artWorks;
  }
  if (!Array.isArray(exhibition.soldWorks) || exhibition.soldWorks.length === 0) {
    exhibition.soldWorks = exhibition.artSoldWorks;
  }

  exhibitions[exhibitionIndex] = exhibition;

  const restoredSaved = exhibitionDetailDependencies.repository.saveExhibitionsSafely(exhibitions);

  if (!restoredSaved) return false;

  console.warn('Recovered exhibition inventory from local backup due to likely data loss.');
  return true;
}

function isLargeUnexpectedInventoryDrop(previousExhibition, nextExhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.isLargeUnexpectedInventoryDrop(
    previousExhibition,
    nextExhibition
  );
}

function getExhibitionLastTabStorageKey() {
  const exhibitionId = Number(exhibitionDetailState.exhibitionId);
  if (!Number.isFinite(exhibitionId) || exhibitionId <= 0) return '';
  const userId = Number(getCurrentUserId());
  const userPart = Number.isFinite(userId) && userId > 0 ? userId : 'guest';
  return `exhibition-detail-last-tab:${userPart}:${exhibitionId}`;
}

function loadLastViewedExhibitionTab() {
  const key = getExhibitionLastTabStorageKey();
  if (!key) return '';
  const value = exhibitionDetailDependencies.detailRepository.loadPreference(key);
  return value ? normalizeTabForAccess(value) : '';
}

function saveLastViewedExhibitionTab(tabName) {
  const key = getExhibitionLastTabStorageKey();
  if (!key) return;
  const normalized = normalizeTabForAccess(tabName);
  if (!normalized) return;
  exhibitionDetailDependencies.detailRepository.savePreference(key, normalized);
}

function goBack() {
  window.location.href = 'exhibitions.html';
}

async function initDetailPage() {
  if (!certificateController || !salesViewController) {
    throw new Error('Exhibition detail controllers must be initialized before page startup.');
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  exhibitionDetailState.exhibitionId = parseExhibitionIdFromQuery();
  if (!exhibitionDetailState.exhibitionId) {
    alert('전시 정보가 올바르지 않습니다. 전시 목록에서 다시 선택해주세요.');
    window.location.href = 'exhibitions.html';
    return;
  }

  await waitForCloudSyncReady();

  const exhibitions = exhibitionDetailDependencies.repository.loadExhibitions();
  const exhibitionIndex = exhibitions.findIndex(e => e.id === exhibitionDetailState.exhibitionId);
  exhibitionDetailState.exhibition = exhibitionIndex !== -1 ? exhibitions[exhibitionIndex] : null;

  if (!exhibitionDetailState.exhibition) {
    alert('선택한 전시를 찾을 수 없습니다. 전시 목록으로 이동합니다.');
    window.location.href = 'exhibitions.html';
    return;
  }

  if (restoreInventoryFromBackupIfNeeded(exhibitions, exhibitionIndex)) {
    exhibitionDetailState.exhibition = exhibitions[exhibitionIndex] || exhibitionDetailState.exhibition;
  }

  const exhibition = getCurrentExhibition();
  initializeInventoryData(exhibition);
  syncInventoryMode('art');
  persistInventoryBackup(exhibition);

  const initialTabFromQuery = parseInitialTabFromQuery();
  const initialTab = initialTabFromQuery || loadLastViewedExhibitionTab();
  if (initialTab) {
    exhibitionDetailState.currentTab = initialTab;
  }

  applyTabVisibilityByPermission();
  const firstAllowedTab = getFirstAllowedTab();
  if (!firstAllowedTab) {
    alert('이 전시에 접근할 권한이 없습니다.');
    window.location.href = 'exhibitions.html';
    return;
  }
  if (!canAccessTab(exhibitionDetailState.currentTab)) {
    exhibitionDetailState.currentTab = firstAllowedTab;
  }

  document.getElementById('exhibition-title').textContent = exhibition.title;
  document.getElementById('exhibition-dates').textContent = `${exhibition.startDate} ~ ${exhibition.endDate}`.trim();
  switchTab(exhibitionDetailState.currentTab);
}

function getDefaultInventoryUiState() {
  return inventoryStateController.getDefaultInventoryUiState();
}

function cloneInventoryUiState(uiState) {
  return inventoryStateController.cloneInventoryUiState(uiState);
}

function initializeInventoryData(exhibition) {
  return inventoryStateController.initializeInventoryData(exhibition);
}

function persistActiveInventoryUiState() {
  return inventoryStateController.persistActiveInventoryUiState();
}

function restoreInventoryUiState(mode) {
  return inventoryStateController.restoreInventoryUiState(mode);
}

function syncInventoryMode(mode) {
  return inventoryStateController.syncInventoryMode(mode);
}

function switchTab(tabName) {
  return exhibitionDetailDependencies.tabsController.switchTab(tabName, {
    state: exhibitionDetailState,
    document,
    canAccessTab,
    getFirstAllowedTab,
    applyTabVisibilityByPermission,
    alertNoAccess: () => alert('이 전시에 접근할 권한이 없습니다.'),
    redirectToExhibitions: () => { window.location.href = 'exhibitions.html'; },
    syncInventoryMode,
    saveLastViewedExhibitionTab,
    getCurrentInventoryListTabName,
    renderStaffManagement,
    renderExhibitionInfo,
    renderInventoryListManagement,
    renderInventorySalesManagement,
    renderExhibitionFiles,
    renderExhibitionAccounting,
    renderExhibitionBackup
  });
}

function getBackupExhibitionId() {
  return backupController.getBackupExhibitionId();
}

function formatBackupDate(value) {
  return backupController.formatBackupDate(value);
}

async function fetchExhibitionBackupSnapshots() {
  return backupController.fetchExhibitionBackupSnapshots();
}

function getBackupSnapshotRowsHtml() {
  return backupController.getBackupSnapshotRowsHtml();
}

function renderExhibitionBackup(container) {
  return backupController.renderExhibitionBackup(container);
}

async function createManualExhibitionSnapshot() {
  return backupController.createManualExhibitionSnapshot();
}

async function refreshExhibitionStateFromServer(exhibitionId) {
  return backupController.refreshExhibitionStateFromServer(exhibitionId);
}

async function restoreExhibitionSnapshot(snapshotId) {
  return backupController.restoreExhibitionSnapshot(snapshotId);
}

async function undoExhibitionSnapshotRestore() {
  return backupController.undoExhibitionSnapshotRestore();
}

function ensureExhibitionInfoData() {
  return infoController.ensureExhibitionInfoData();
}

function getExhibitionArtistNamesForInstagram(exhibition) {
  return infoController.getExhibitionArtistNamesForInstagram(exhibition);
}

function renderExhibitionInfo(container) {
  return infoController.renderExhibitionInfo(container);
}

function saveExhibitionInfoField(fieldName) {
  return infoController.saveExhibitionInfoField(fieldName);
}

function editExhibitionInfoField(fieldName) {
  return infoController.editExhibitionInfoField(fieldName);
}

function createFilesController() {
  return exhibitionDetailDependencies.filesControllerModule.create({
    state: exhibitionDetailState,
    document,
    URL,
    Date,
    Math,
    getCurrentExhibition,
    canCurrentUserModifyOwnedRow,
    isArtistScopedUser,
    getCurrentUserId,
    escapeAccountingHtml,
    buildCompactPhotoPreview,
    readFileAsDataUrl,
    saveExhibition,
    switchTab,
    alert
  });
}

function ensureExhibitionFilesData() {
  return filesController.ensureExhibitionFilesData();
}

function getFilesForView(view) {
  return filesController.getFilesForView(view);
}

function getFilesViewLabel(view) {
  return filesController.getFilesViewLabel(view);
}

function switchFilesView(view) {
  return filesController.switchFilesView(view);
}

function renderExhibitionFiles(container) {
  return filesController.renderExhibitionFiles(container);
}

function isPdfLikeFile(mimeType, fileName, dataUrl) {
  return filesController.isPdfLikeFile(mimeType, fileName, dataUrl);
}

function triggerFileDownload(dataUrl, fileName) {
  return filesController.triggerFileDownload(dataUrl, fileName);
}

function getFileDownloadName(fileItem, fallbackIndex) {
  return filesController.getFileDownloadName(fileItem, fallbackIndex);
}

function deleteExhibitionFile(view, fileId) {
  return filesController.deleteExhibitionFile(view, fileId);
}

function deleteAllExhibitionFiles(view) {
  return filesController.deleteAllExhibitionFiles(view);
}

function downloadExhibitionFile(view, fileId) {
  return filesController.downloadExhibitionFile(view, fileId);
}

function downloadAllExhibitionFiles(view) {
  return filesController.downloadAllExhibitionFiles(view);
}

function openFileUploadModal(targetView, droppedFiles) {
  return filesController.openFileUploadModal(targetView, droppedFiles);
}

function closeFileUploadModal() {
  return filesController.closeFileUploadModal();
}

function handleFileUploadInputChange(event) {
  return filesController.handleFileUploadInputChange(event);
}

function updateFileUploadSelectedInfo() {
  return filesController.updateFileUploadSelectedInfo();
}

function clearPendingUploadEntries() {
  return filesController.clearPendingUploadEntries();
}

function getFileNameWithoutExtension(fileName) {
  return filesController.getFileNameWithoutExtension(fileName);
}

function createPendingUploadEntry(file, index) {
  return filesController.createPendingUploadEntry(file, index);
}

function setPendingUploadEntries(files) {
  return filesController.setPendingUploadEntries(files);
}

function updatePendingUploadTitle(index, value) {
  return filesController.updatePendingUploadTitle(index, value);
}

function renderFileUploadPreviewList() {
  return filesController.renderFileUploadPreviewList();
}

function handleFilesDragOver(event) {
  return filesController.handleFilesDragOver(event);
}

function handleFilesDragLeave(event) {
  return filesController.handleFilesDragLeave(event);
}

function handleFilesDrop(event) {
  return filesController.handleFilesDrop(event);
}

function buildGenericFilePreviewDataUrl(fileName) {
  return filesController.buildGenericFilePreviewDataUrl(fileName);
}

async function buildFileCardPreview(file) {
  return filesController.buildFileCardPreview(file);
}

async function confirmFileUploadModal() {
  return filesController.confirmFileUploadModal();
}

function parseAccountingAmount(value) {
  return accountingViewController.parseAccountingAmount(value);
}

function formatAccountingAmount(value) {
  return accountingViewController.formatAccountingAmount(value);
}

function escapeAccountingHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getExhibitionExpenseItems() {
  return accountingViewController.getExhibitionExpenseItems();
}

function getExhibitionRevenueItems() {
  return accountingViewController.getExhibitionRevenueItems();
}

function getExhibitionManualRevenueItems() {
  return accountingViewController.getExhibitionManualRevenueItems();
}

function getExpenseEffectiveAmount(item, revenueTotals) {
  return accountingViewController.getExpenseEffectiveAmount(item, revenueTotals);
}

function buildAccountingTableRows(items, options = {}) {
  return accountingViewController.buildAccountingTableRows(items, options);
}

function renderExhibitionAccounting(container) {
  return accountingViewController.renderExhibitionAccounting(container);
}

function formatAccountingInput(value) {
  return accountingViewController.formatAccountingInput(value);
}

function addExpenseItem() {
  return accountingViewController.addExpenseItem();
}

function handleExpenseFieldChange(expenseId, field, value) {
  return accountingViewController.handleExpenseFieldChange(expenseId, field, value);
}

function deleteSelectedExpenseItems() {
  return accountingViewController.deleteSelectedExpenseItems();
}

function pushExpenseUndoSnapshot() {
  return accountingViewController.pushExpenseUndoSnapshot();
}

function pushRevenueUndoSnapshot() {
  return accountingViewController.pushRevenueUndoSnapshot();
}

function toggleAccountingRowSelection(kind, id, checked) {
  return accountingViewController.toggleAccountingRowSelection(kind, id, checked);
}

function toggleAccountingSelectAll(kind, source) {
  return accountingViewController.toggleAccountingSelectAll(kind, source);
}

function toggleAccountingSelectAllFromButton(kind) {
  return accountingViewController.toggleAccountingSelectAllFromButton(kind);
}

function deleteAllAccountingItems(kind) {
  return accountingViewController.deleteAllAccountingItems(kind);
}

function undoExpenseAccountingChanges() {
  return accountingViewController.undoExpenseAccountingChanges();
}

function undoRevenueAccountingChanges() {
  return accountingViewController.undoRevenueAccountingChanges();
}

function deleteSelectedRevenueItems() {
  return accountingViewController.deleteSelectedRevenueItems();
}

function updateAccountingActionButtons() {
  return accountingViewController.updateAccountingActionButtons();
}

function addRevenueItem() {
  return accountingViewController.addRevenueItem();
}

function editAccountingRow(kind, rowId) {
  return accountingViewController.editAccountingRow(kind, rowId);
}

function saveExpenseRowEdit(rowId) {
  return accountingViewController.saveExpenseRowEdit(rowId);
}

function deleteAccountingRow(kind, rowId) {
  return accountingViewController.deleteAccountingRow(kind, rowId);
}

function deleteExpenseRowById(rowId) {
  return accountingViewController.deleteExpenseRowById(rowId);
}

function deleteRevenueRowByType(rowId) {
  return accountingViewController.deleteRevenueRowByType(rowId);
}

function saveRevenueRowEdit(rowId) {
  return accountingViewController.saveRevenueRowEdit(rowId);
}

function getCurrentInventoryListTabName() {
  return exhibitionDetailState.inventoryListView === 'goods' ? 'goods' : 'works';
}

function ensureSoldWorksArray() {
  const exhibition = getCurrentExhibition();
  exhibition.soldWorks = exhibition.soldWorks || [];
  return exhibition.soldWorks;
}

function getSalesMasterRecords() {
  const exhibition = getCurrentExhibition();
  return Array.isArray(exhibition.artSoldWorks) ? exhibition.artSoldWorks : ensureSoldWorksArray();
}

function normalizeSoldItemType(sold) {
  return exhibitionDetailDependencies.salesModel.normalizeSoldItemType(sold);
}

function parseSoldQuantity(value) {
  return exhibitionDetailDependencies.salesModel.parseSoldQuantity(value);
}

function parseStockQuantity(value) {
  return exhibitionDetailDependencies.salesModel.parseStockQuantity(value);
}

function getGoodsSoldQuantity(goodsId) {
  return exhibitionDetailDependencies.salesModel.getGoodsSoldQuantity(getSalesMasterRecords(), goodsId);
}

function renderInventoryListManagement(container) {
  return worksView.renderInventoryListManagement(container);
}

function renderInventorySalesManagement(container) {
  return salesViewController.renderInventorySalesManagement(container);
}

function renderSalesManagement(container) {
  return salesViewController.renderSalesManagement(container);
}

function isArtistSalesSummaryEnabled() {
  const type = (getCurrentExhibition().type || '').toString().trim();
  return type === '2인전' || type === '3인전' || type === '단체전';
}

function parsePriceToNumber(value) {
  return exhibitionDetailDependencies.salesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatCurrencyKrw(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

function getArtistSalesSummary() {
  return exhibitionDetailDependencies.salesModel.getArtistSalesSummary(ensureSoldWorksArray(), isWorkNotForSale);
}

function openArtistSalesSummaryModal() {
  if (!isArtistSalesSummaryEnabled()) return;
  const modal = document.getElementById('artist-sales-summary-modal');
  const content = document.getElementById('artist-sales-summary-content');
  if (!modal || !content) return;

  const rows = getArtistSalesSummary();
  if (rows.length === 0) {
    content.innerHTML = '<p class="empty-state">판매 데이터가 없습니다.</p>';
    modal.style.display = 'flex';
    return;
  }

  const totalCount = rows.reduce((sum, row) => sum + row.soldCount, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0);

  content.innerHTML = `
    <div class="artist-sales-summary-headline">
      <span>총 판매 수량: <strong>${totalCount.toLocaleString('ko-KR')}점</strong></span>
      <span>총 판매 금액: <strong>${formatCurrencyKrw(totalRevenue)}</strong></span>
    </div>
    <div class="works-table-wrapper artist-sales-summary-table-wrapper">
      <table class="works-table artist-sales-summary-table">
        <thead>
          <tr>
            <th>작가</th>
            <th>판매 수량</th>
            <th>총 판매 금액</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.author}</td>
              <td>${row.soldCount.toLocaleString('ko-KR')}점</td>
              <td>${formatCurrencyKrw(row.totalRevenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeArtistSalesSummaryModal() {
  const modal = document.getElementById('artist-sales-summary-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

function cloneSalesRecords(records) {
  return salesViewController.cloneSalesRecords(records);
}

function cloneWorkRecords(records) {
  return JSON.parse(JSON.stringify(records || []));
}

function pushWorkUndoSnapshot() {
  const exhibition = getCurrentExhibition();
  const works = exhibition.works || [];
  exhibitionDetailState.workUndoStack.push(cloneWorkRecords(works));
  if (exhibitionDetailState.workUndoStack.length > 30) {
    exhibitionDetailState.workUndoStack.shift();
  }
  updateWorksUndoButton();
}

function updateWorksUndoButton() {
  const canUndo = exhibitionDetailState.workUndoStack.length > 0;
  ['work-undo-btn', 'work-undo-btn-bottom'].forEach((buttonId) => {
    const undoButton = document.getElementById(buttonId);
    if (!undoButton) return;
    undoButton.disabled = !canUndo;
    undoButton.style.opacity = canUndo ? '1' : '0.5';
    undoButton.style.cursor = canUndo ? 'pointer' : 'not-allowed';
  });
}

function undoWorkChanges() {
  const exhibition = getCurrentExhibition();
  if (exhibitionDetailState.workUndoStack.length === 0) return;
  const previous = exhibitionDetailState.workUndoStack.pop();
  exhibition.works = cloneWorkRecords(previous);
  exhibitionDetailState.workEditSnapshotIds = [];
  exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => exhibition.works.some(work => work.id === id));
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  updateWorksUndoButton();
  switchTab(getCurrentInventoryListTabName());
}

function ensureWorkEditUndoSnapshot(workId) {
  if (exhibitionDetailState.workEditSnapshotIds.includes(workId)) return;
  pushWorkUndoSnapshot();
  exhibitionDetailState.workEditSnapshotIds.push(workId);
}

function pushSalesUndoSnapshot() {
  return salesViewController.pushSalesUndoSnapshot();
}

function updateSalesActionButtons() {
  return salesViewController.updateSalesActionButtons();
}

function renderSoldWorkRows() {
  return salesViewController.renderSoldWorkRows();
}

function getSoldQuantityForItemType(itemType, value) {
  return exhibitionDetailDependencies.salesModel.getSoldQuantityForItemType(itemType, value);
}

function getSalesSearchResults(query) {
  const exhibition = getCurrentExhibition();
  return exhibitionDetailDependencies.salesModel.getSalesSearchResults({
    artWorks: exhibition.artWorks,
    works: exhibition.works,
    goods: exhibition.goods,
    query
  });
}

function createSalesAddController() {
  return exhibitionDetailDependencies.salesAddControllerModule.create({
    state: exhibitionDetailState,
    document,
    setTimeout,
    getSalesSearchResults,
    getSalesPopupWorkDisabledReason,
    getPhotoPreviewDataUrl,
    formatKoreanPhone,
    parseSoldQuantity,
    normalizeSoldItemType,
    parsePriceToNumber,
    formatCurrencyKrw,
    getCurrentExhibition,
    ensureSoldWorksArray,
    pushSalesUndoSnapshot,
    getCurrentKstDateTimeString,
    getCurrentUserId,
    saveExhibition,
    getCurrentTab: () => exhibitionDetailState.currentTab,
    switchTab,
    renderSoldWorkRows,
    now: Date.now,
    random: Math.random
  });
}

function resetSalesAddCommonBuyerState() {
  return salesAddController.resetSalesAddCommonBuyerState();
}

function renderSalesAddCommonBuyerSection() {
  return salesAddController.renderSalesAddCommonBuyerSection();
}

function handleSalesAddCommonBuyerToggle(checked) {
  return salesAddController.handleSalesAddCommonBuyerToggle(checked);
}

function handleSalesAddCommonBuyerFieldChange(field, value) {
  return salesAddController.handleSalesAddCommonBuyerFieldChange(field, value);
}

function openSalesAddModal() {
  return salesAddController.openSalesAddModal();
}

function closeSalesAddModal() {
  return salesAddController.closeSalesAddModal();
}

function handleSalesAddSearchInput(value) {
  return salesAddController.handleSalesAddSearchInput(value);
}

function handleSalesAddSearchKeydown(event) {
  return salesAddController.handleSalesAddSearchKeydown(event);
}

function addWorkToSalesBuffer(work) {
  return salesAddController.addWorkToSalesBuffer(work);
}

function addMadeToOrderWorkToSalesBuffer(work) {
  return salesAddController.addMadeToOrderWorkToSalesBuffer(work);
}

function addMadeToOrderFromSearchResult(workId, itemType, event) {
  return salesAddController.addMadeToOrderFromSearchResult(workId, itemType, event);
}

function renderSalesAddSearchResults() {
  return salesAddController.renderSalesAddSearchResults();
}

function getSalesPopupWorkDisabledReason(work) {
  if (!work) return '';
  if (isWorkNotForSale(work.price)) return 'notForSale';
  if (work.itemType === '굿즈') return '';
  const soldWorks = ensureSoldWorksArray();
  const alreadySold = soldWorks.some(item => normalizeSoldItemType(item) === '작품' && item.workId === work.id);
  return alreadySold ? 'alreadySold' : '';
}

function renderSalesAddBuffer() {
  return salesAddController.renderSalesAddBuffer();
}

function updateSalesAddSelectedTicker(items, tickerEl) {
  return salesAddController.updateSalesAddSelectedTicker(items, tickerEl);
}

function updateSalesBufferQuantity(bufferKey, value) {
  return salesAddController.updateSalesBufferQuantity(bufferKey, value);
}

function removeWorkFromSalesBuffer(bufferKey) {
  return salesAddController.removeWorkFromSalesBuffer(bufferKey);
}

function confirmSalesAddModal() {
  return salesAddController.confirmSalesAddModal();
}

function isValidKoreanPhone(value) {
  return salesViewController.isValidKoreanPhone(value);
}

function getMissingRequiredSoldFields(sold) {
  return salesViewController.getMissingRequiredSoldFields(sold);
}

function markMissingSoldFields(row, missingFields) {
  return salesViewController.markMissingSoldFields(row, missingFields);
}

function saveSoldWork(soldId, triggerButton) {
  return salesViewController.saveSoldWork(soldId, triggerButton);
}

function saveAllSoldWorks() {
  return salesViewController.saveAllSoldWorks();
}

function toggleSoldWorkEdit(soldId) {
  return salesViewController.toggleSoldWorkEdit(soldId);
}

function scrollRowToViewportCenter(selector) {
  if (!selector) return;
  requestAnimationFrame(() => {
    const row = document.querySelector(selector);
    if (!row) return;
    row.scrollIntoView({ behavior: 'auto', block: 'center' });
  });
}

function deleteSoldWork(soldId) {
  return salesViewController.deleteSoldWork(soldId);
}

// Convert "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm" for datetime-local input value
function soldKstToInputValue(kst) {
  if (!kst) return '';
  const m = kst.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : '';
}

// Convert "YYYY-MM-DDTHH:mm" → "YYYY-MM-DD HH:mm:ss" (preserving existing seconds as :00)
function soldInputValueToKst(inputVal) {
  if (!inputVal) return '';
  return inputVal.replace('T', ' ') + ':00';
}

function getCurrentKstDateTimeString() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const map = {};
  parts.forEach(p => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function getPhotoPreviewDataUrl(item) {
  return exhibitionDetailDependencies.imageLifecycle.getPhotoPreviewSource(item);
}

function getPhotoDataUrl(item) {
  return exhibitionDetailDependencies.imageLifecycle.getPhotoSource(item);
}

function fetchCertificateTemplateArrayBuffer() { return certificateController.fetchCertificateTemplateArrayBuffer(); }
function getCertificateTemplateArrayBuffer() { return certificateController.getCertificateTemplateArrayBuffer(); }
function getSourceArtworkForSold(sold) { return certificateController.getSourceArtworkForSold(sold); }
function hasGeneratedCertificate(sold) { return certificateController.hasGeneratedCertificate(sold); }
function normalizeCertificateDateText(soldAtKst) { return certificateController.normalizeCertificateDateText(soldAtKst); }
function safeCertificateFileName(baseTitle) { return certificateController.safeCertificateFileName(baseTitle); }
function getCertificateImageDataUrl(sold, work) { return certificateController.getCertificateImageDataUrl(sold, work); }
function dataUrlToUint8Array(dataUrl) { return certificateController.dataUrlToUint8Array(dataUrl); }
function blobToUint8Array(blob) { return certificateController.blobToUint8Array(blob); }
function canvasToBlob(canvas, mimeType, quality) { return certificateController.canvasToBlob(canvas, mimeType, quality); }
function blobToDataUrl(blob) { return certificateController.blobToDataUrl(blob); }
function resolveCertificateImageDataUrl(imageSource) { return certificateController.resolveCertificateImageDataUrl(imageSource); }
function buildCertificatePngBytesFromDataUrl(imageDataUrl) { return certificateController.buildCertificatePngBytesFromDataUrl(imageDataUrl); }
function parseWorksheetMetrics(sheetXml) { return certificateController.parseWorksheetMetrics(sheetXml); }
function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
  return certificateController.computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset);
}
function removeXmlAttribute(tag, attrName) { return certificateController.removeXmlAttribute(tag, attrName); }
function setOrReplaceXmlAttribute(tag, attrName, attrValue) { return certificateController.setOrReplaceXmlAttribute(tag, attrName, attrValue); }
function enforceWorksheetPageSetupXml(sheetXml, options = {}) { return certificateController.enforceWorksheetPageSetupXml(sheetXml, options); }
function upsertWorksheetRowBreaksXml(sheetXml, breakRows) { return certificateController.upsertWorksheetRowBreaksXml(sheetXml, breakRows); }
function buildWorkbookPrintAreaFormula(workbookXml, endRow) { return certificateController.buildWorkbookPrintAreaFormula(workbookXml, endRow); }
function upsertWorkbookPrintArea(workbookXml, printAreaFormula) { return certificateController.upsertWorkbookPrintArea(workbookXml, printAreaFormula); }
function parseXmlDocumentOrThrow(xmlText, label) { return certificateController.parseXmlDocumentOrThrow(xmlText, label); }
function getElementsByLocalName(node, localName) { return certificateController.getElementsByLocalName(node, localName); }
function splitCellReference(cellRef) { return certificateController.splitCellReference(cellRef); }
function shiftCellReferenceRow(cellRef, rowOffset) { return certificateController.shiftCellReferenceRow(cellRef, rowOffset); }
function shiftRangeReferenceRows(rangeRef, rowOffset) { return certificateController.shiftRangeReferenceRows(rangeRef, rowOffset); }
function setSheetCellInlineText(cellElement, textValue, xmlDoc) { return certificateController.setSheetCellInlineText(cellElement, textValue, xmlDoc); }
function buildArtworkAnchorXml(imageAnchor, picId, relId) { return certificateController.buildArtworkAnchorXml(imageAnchor, picId, relId); }
function getDrawingAnchorFromRowIndex(anchorXml) { return certificateController.getDrawingAnchorFromRowIndex(anchorXml); }
function shiftDrawingAnchorRows(anchorXml, rowOffset) { return certificateController.shiftDrawingAnchorRows(anchorXml, rowOffset); }
function duplicateTemplateDrawingAnchorsForPages(drawingXml, pageCount) { return certificateController.duplicateTemplateDrawingAnchorsForPages(drawingXml, pageCount); }
function parseSharedStringsText(sharedStringsXml) { return certificateController.parseSharedStringsText(sharedStringsXml); }
function getTemplateInstagramPattern(sheetDoc, sharedStringsXml) { return certificateController.getTemplateInstagramPattern(sheetDoc, sharedStringsXml); }
function setInlineCellValueByRef(cellMap, ref, value, xmlDoc) { return certificateController.setInlineCellValueByRef(cellMap, ref, value, xmlDoc); }
function applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl) { return certificateController.applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl); }
function escapeXmlText(value) { return certificateController.escapeXmlText(value); }
function applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, instagramTag) {
  return certificateController.applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, instagramTag);
}
function applyCertificateArtistInstagram(sheet, instagramTag) { return certificateController.applyCertificateArtistInstagram(sheet, instagramTag); }
function getArtistInstagramForCertificate(sold, work) { return certificateController.getArtistInstagramForCertificate(sold, work); }
function buildCertificateWorkbookBlob(sold, work) { return certificateController.buildCertificateWorkbookBlob(sold, work); }
function buildAllCertificatesDownloadFileName() { return certificateController.buildAllCertificatesDownloadFileName(); }
function buildAllCertificatesWorkbookBlob(entries) { return certificateController.buildAllCertificatesWorkbookBlob(entries); }
function downloadBlobFile(blob, fileName) { return certificateController.downloadBlobFile(blob, fileName); }
function handleDownloadAllCertificatesAction() { return certificateController.handleDownloadAllCertificatesAction(); }
function handleSoldCertificateAction(soldId) { return certificateController.handleSoldCertificateAction(soldId); }
function handleSoldCertificateRemakeAction(soldId) { return certificateController.handleSoldCertificateRemakeAction(soldId); }

function handleSoldFieldChange(soldId, field, value) {
  return salesViewController.handleSoldFieldChange(soldId, field, value);
}

function syncSoldFromRow(sold, row) {
  return salesViewController.syncSoldFromRow(sold, row);
}

function formatKoreanPhone(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function handleSoldPhoneInput(soldId, event) {
  return salesViewController.handleSoldPhoneInput(soldId, event);
}

function handleSoldPaymentMethodChange(soldId, value) {
  return salesViewController.handleSoldPaymentMethodChange(soldId, value);
}

function addSoldWorkRow() {
  openSalesAddModal();
}

function handleSoldWorkSearchChange(soldId, field, value) {
  return salesViewController.handleSoldWorkSearchChange(soldId, field, value);
}

function toggleSalesSelection(soldId, isChecked, event, rowIndex) {
  return salesViewController.toggleSalesSelection(soldId, isChecked, event, rowIndex);
}

function ensureSalesEditUndoSnapshot(soldId) {
  return salesViewController.ensureSalesEditUndoSnapshot(soldId);
}

function getInviteRoleLabel(role) { return staffController.getInviteRoleLabel(role); }

function toggleSalesCheckbox(soldId, isChecked) {
  if (isChecked) {
    exhibitionDetailState.selectedSalesIds = Array.from(new Set([...exhibitionDetailState.selectedSalesIds, soldId]));
  } else {
    exhibitionDetailState.selectedSalesIds = exhibitionDetailState.selectedSalesIds.filter(id => id !== soldId);
  }
  renderSoldWorkRows();
}

function jumpToSoldWork(workId) {
  const soldWorks = ensureSoldWorksArray();
  const target = soldWorks.find(item => item.workId === workId);
  if (!target) {
    switchTab('sales');
    return;
  }

  switchTab('sales');
  requestAnimationFrame(() => {
    const row = document.querySelector(`tr[data-sold-id="${target.id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('sales-row-jump-highlight');
    setTimeout(() => row.classList.remove('sales-row-jump-highlight'), 1400);
  });
}

function toggleSelectAllSales(source) {
  return salesViewController.toggleSelectAllSales(source);
}

function toggleSelectAllSalesFromButton() {
  return salesViewController.toggleSelectAllSalesFromButton();
}

function editSelectedSoldWorks() {
  return salesViewController.editSelectedSoldWorks();
}

function deleteAllSoldWorks() {
  return salesViewController.deleteAllSoldWorks();
}

function deleteSelectedSoldWorks() {
  return salesViewController.deleteSelectedSoldWorks();
}

function undoSalesChanges() {
  return salesViewController.undoSalesChanges();
}

function openImagePreviewBySoldId(soldId, event) {
  return salesViewController.openImagePreviewBySoldId(soldId, event);
}

function renderStaffManagement(container) {
  return staffController.renderStaffManagement(container);
}

function openInviteModal(role) {
  return staffController.openInviteModal(role);
}

function closeInviteModal() {
  return staffController.closeInviteModal();
}

function filterInviteUsers() {
  return staffController.filterInviteUsers();
}

function renderInviteUserList(users, assignedIds) {
  return staffController.renderInviteUserList(users, assignedIds);
}

function confirmInvite() {
  return staffController.confirmInvite();
}

function removeStaffMember(role, userId) {
  return staffController.removeStaffMember(role, userId);
}

function renderWorksManagement(container) {
  return worksView.renderWorksManagement(container);
}

function updateSaveAllButtonVisibility() {
  return worksView.updateSaveAllButtonVisibility();
}

function renderWorkRows() {
  return worksView.renderWorkRows();
}

function addWorkRow() {
  return worksEditorController.addWorkRow();
}

function duplicateWorkRow(workId) {
  return worksEditorController.duplicateWorkRow(workId);
}

function saveWork(workId, triggerButton) {
  return worksEditorController.saveWork(workId, triggerButton);
}

function saveAllWorks() {
  return worksEditorController.saveAllWorks();
}

function syncWorkToSalesRecords(work) {
  return worksEditorController.syncWorkToSalesRecords(work);
}

function syncWorkFromRow(work, row) {
  return worksEditorController.syncWorkFromRow(work, row);
}

function normalizeManualNumber(value) {
  return worksEditorController.normalizeManualNumber(value);
}

function normalizeTitle(value) {
  return worksEditorController.normalizeTitle(value);
}

function shouldValidateManualNumberUniqueness(work) {
  return worksEditorController.shouldValidateManualNumberUniqueness(work);
}

function shouldValidateTitleUniqueness(work) {
  return worksEditorController.shouldValidateTitleUniqueness(work);
}

function getAllInventoryWorks(exhibition) {
  return worksEditorController.getAllInventoryWorks(exhibition);
}

function findSavedManualNumberConflict(work, allWorks) {
  return worksEditorController.findSavedManualNumberConflict(work, allWorks);
}

function findSavedTitleConflict(work, allWorks) {
  return worksEditorController.findSavedTitleConflict(work, allWorks);
}

function getBulkManualNumberConflicts(allWorks, pendingWorks) {
  return worksEditorController.getBulkManualNumberConflicts(allWorks, pendingWorks);
}

function getBulkTitleConflicts(allWorks, pendingWorks) {
  return worksEditorController.getBulkTitleConflicts(allWorks, pendingWorks);
}

function getMissingRequiredWorkFields(work) {
  return worksEditorController.getMissingRequiredWorkFields(work);
}

function markMissingRequiredFields(row, missingFields) {
  return worksEditorController.markMissingRequiredFields(row, missingFields);
}

function toggleWorkEdit(workId) {
  return worksEditorController.toggleWorkEdit(workId);
}

function openDeleteWorkModal(workId) {
  return worksEditorController.openDeleteWorkModal(workId);
}

function closeDeleteWorkModal() {
  return worksEditorController.closeDeleteWorkModal();
}

function confirmDeleteWork() {
  return worksEditorController.confirmDeleteWork();
}

function handleWorkChange(workId, field, value) {
  return worksEditorController.handleWorkChange(workId, field, value);
}

let TRANSIENT_WORK_PHOTO_FIELDS = [];

function canUseRemoteUploadApi() {
  return worksEditorController.canUseRemoteUploadApi();
}

function buildPhotoUploadFileName(baseName, suffix, mimeType) {
  return worksEditorController.buildPhotoUploadFileName(baseName, suffix, mimeType);
}

function parseDataUrlMimeType(dataUrl) {
  return worksEditorController.parseDataUrlMimeType(dataUrl);
}

function snapshotWorkPhotoFields(work) {
  return worksEditorController.snapshotWorkPhotoFields(work);
}

function applyWorkPhotoFields(work, snapshot) {
  return worksEditorController.applyWorkPhotoFields(work, snapshot);
}

function clearPendingWorkPhotoFields(work) {
  return worksEditorController.clearPendingWorkPhotoFields(work);
}

async function verifyUploadedImageFile(uploadedFile) {
  return worksEditorController.verifyUploadedImageFile(uploadedFile);
}

async function uploadImageDataUrl(dataUrl, fileName) {
  return worksEditorController.uploadImageDataUrl(dataUrl, fileName);
}

async function persistWorkPhotoUrls(workId, options = {}) {
  return worksEditorController.persistWorkPhotoUrls(workId, options);
}

function readFileAsDataUrl(file) {
  return worksEditorController.readFileAsDataUrl(file);
}

function loadImageElement(src) {
  return worksEditorController.loadImageElement(src);
}

function renderResizedDataUrl(image, mimeType, quality, maxDimension) {
  return worksEditorController.renderResizedDataUrl(image, mimeType, quality, maxDimension);
}

async function buildLightweightPhotoPreview(dataUrl) {
  return worksEditorController.buildLightweightPhotoPreview(dataUrl);
}

async function buildCompactPhotoPreview(file) {
  return worksEditorController.buildCompactPhotoPreview(file);
}

async function handleWorkPhotoChange(workId, event) {
  return worksEditorController.handleWorkPhotoChange(workId, event);
}

function parseSizeParts(sizeText) {
  return worksEditorController.parseSizeParts(sizeText);
}

function handleWorkSizeChange(workId, part, value) {
  return worksEditorController.handleWorkSizeChange(workId, part, value);
}

function openImagePreviewByWorkId(workId, event) {
  return worksEditorController.openImagePreviewByWorkId(workId, event);
}

function closeImagePreview() {
  return worksEditorController.closeImagePreview();
}

function deleteWork(workId) {
  return worksEditorController.deleteWork(workId);
}

function toggleSelectAllWorks(source) {
  return worksEditorController.toggleSelectAllWorks(source);
}

function updateWorkSelectionActionButtons(visibleWorks) {
  return worksEditorController.updateWorkSelectionActionButtons(visibleWorks);
}

function toggleWorkSelection(workId, isChecked, event, rowIndex) {
  return worksEditorController.toggleWorkSelection(workId, isChecked, event, rowIndex);
}

function toggleSelectAllVisibleWorks() {
  return worksEditorController.toggleSelectAllVisibleWorks();
}

function deleteAllWorks() {
  return worksEditorController.deleteAllWorks();
}

function deleteSelectedWorks() {
  return worksEditorController.deleteSelectedWorks();
}

function editSelectedWorks() {
  return worksEditorController.editSelectedWorks();
}

function parseSoldPriceAmount(value) {
  return exhibitionDetailDependencies.salesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatWonAmount(amount) {
  return `₩${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}`;
}

function getSoldStatsForWorksTicker() {
  return exhibitionDetailDependencies.salesModel.getSoldStats({
    records: ensureSoldWorksArray(),
    selectedIds: exhibitionDetailState.selectedWorkIds,
    idField: 'workId',
    selectedLabel: '선택된 작품',
    allLabel: '전체 작품 기준 판매 통계',
    isNotForSale: isWorkNotForSale
  });
}

function getSoldStatsForSalesTicker() {
  return exhibitionDetailDependencies.salesModel.getSoldStats({
    records: ensureSoldWorksArray(),
    selectedIds: exhibitionDetailState.selectedSalesIds,
    selectedLabel: '선택된 판매',
    allLabel: '전체 판매 기준 판매 통계',
    isNotForSale: isWorkNotForSale
  });
}

function renderSoldStatsTicker(scope) {
  const ticker = document.getElementById(scope === 'sales' ? 'sales-sold-stats-ticker' : 'works-sold-stats-ticker');
  if (!ticker) return;

  const stats = scope === 'sales'
    ? getSoldStatsForSalesTicker()
    : getSoldStatsForWorksTicker();
  const summaryButtonHtml = (scope === 'sales' && isArtistSalesSummaryEnabled())
    ? `<button type="button" class="artist-sales-summary-trigger-btn" onclick="openArtistSalesSummaryModal()">작가별 판매 요약</button>`
    : '';

  ticker.innerHTML = `
    <p class="stats-ticker-label">${stats.basisLabel}</p>
    <div class="stats-ticker-items">
      <span class="stats-ticker-item">판매 작품 <strong>${stats.soldCount}</strong>점</span>
      <span class="stats-ticker-item">총 판매액 <strong>${formatWonAmount(stats.totalAmount)}</strong></span>
      ${summaryButtonHtml}
    </div>
  `;
}

function getVisibleWorks() {
  return getSortedWorks();
}

function getSortedWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorkIdSet = new Set(
    ensureSoldWorksArray()
      .filter((item) => normalizeSoldItemType(item) === '작품')
      .map((item) => item.workId)
  );
  return exhibitionDetailDependencies.inventoryModel.getSortedWorks({
    works: exhibition.works || [],
    advanced: exhibitionDetailState.workAdvanced,
    filters: exhibitionDetailState.workFilters,
    search: exhibitionDetailState.workSearch,
    sortField: exhibitionDetailState.workSortField,
    sortDirection: exhibitionDetailState.workSortDirection,
    compareValues: compareWorkValues,
    parseStockQuantity,
    getGoodsSoldQuantity,
    soldWorkIdSet
  });
}

function getWorkSortValue(work, field) {
  const soldWorkIdSet = new Set(
    ensureSoldWorksArray()
      .filter((item) => normalizeSoldItemType(item) === '작품')
      .map(item => item.workId)
  );
  return exhibitionDetailDependencies.inventoryModel.getWorkSortValue(work, field, {
    parseStockQuantity,
    getGoodsSoldQuantity,
    soldWorkIdSet
  });
}

function getSortedSoldWorks() {
  return exhibitionDetailDependencies.salesModel.getSortedSoldWorks({
    records: ensureSoldWorksArray(),
    advanced: exhibitionDetailState.salesAdvanced,
    filters: exhibitionDetailState.salesFilters,
    search: exhibitionDetailState.salesSearch,
    sortField: exhibitionDetailState.salesSortField,
    sortDirection: exhibitionDetailState.salesSortDirection,
    compareValues: compareWorkValues,
    isNotForSale: isWorkNotForSale
  });
}

function exportSalesToExcel() {
  const exportData = exhibitionDetailDependencies.exportModel.buildSalesExport({
    title: exhibitionDetailState.exhibition?.title,
    soldWorks: getSortedSoldWorks(),
    getPhotoPreviewDataUrl
  });
  downloadBlobFile(
    new Blob([exportData.content], { type: exportData.mimeType }),
    exportData.filename
  );
}

function getSoldSortValue(sold, field) {
  return exhibitionDetailDependencies.salesModel.getSoldSortValue(sold, field, isWorkNotForSale);
}

function getManualNumberSortGroup(value) {
  if (!value) return 3;
  if (/^[A-Za-z]/.test(value)) return 0;
  if (/^\d/.test(value)) return 1;
  if (/^[가-힣]/.test(value)) return 2;
  return 2;
}

function compareManualNumberValues(a, b) {
  const textA = String(a ?? '').trim();
  const textB = String(b ?? '').trim();

  const groupA = getManualNumberSortGroup(textA);
  const groupB = getManualNumberSortGroup(textB);
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  const collator = new Intl.Collator(['en', 'ko'], {
    numeric: true,
    sensitivity: 'base'
  });
  return collator.compare(textA, textB);
}

function compareWorkValues(a, b, field = '') {
  if (field === 'manualNumber') {
    return compareManualNumberValues(a, b);
  }

  const textA = String(a ?? '').trim();
  const textB = String(b ?? '').trim();
  const categoryA = getSortCategory(textA);
  const categoryB = getSortCategory(textB);

  if (categoryA !== categoryB) {
    return categoryA - categoryB;
  }

  if (categoryA === 0) {
    return textA.localeCompare(textB, 'ko');
  }

  if (categoryA === 1) {
    return textA.localeCompare(textB, 'en');
  }

  if (categoryA === 2) {
    const numA = Number(textA);
    const numB = Number(textB);
    return numA - numB;
  }

  return textA.localeCompare(textB, 'ko');
}

function getSortCategory(value) {
  if (!value) return 3;
  if (/[가-힣]/.test(value)) return 0;
  if (/[A-Za-z]/.test(value)) return 1;
  if (/\d/.test(value)) return 2;
  return 3;
}

function getSortIndicator(field) {
  if (exhibitionDetailState.workSortField !== field) return '↕';
  return exhibitionDetailState.workSortDirection === 'asc' ? '↕' : '↕';
}

function toggleWorkSort(field) {
  if (exhibitionDetailState.workSortField === field) {
    exhibitionDetailState.workSortDirection = exhibitionDetailState.workSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    exhibitionDetailState.workSortField = field;
    exhibitionDetailState.workSortDirection = 'asc';
  }
  renderWorkRows();
}

function getSalesSortIndicator(field) {
  if (exhibitionDetailState.salesSortField !== field) return '↕';
  return exhibitionDetailState.salesSortDirection === 'asc' ? '↕' : '↕';
}

function toggleSalesSort(field) {
  if (exhibitionDetailState.salesSortField === field) {
    exhibitionDetailState.salesSortDirection = exhibitionDetailState.salesSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    exhibitionDetailState.salesSortField = field;
    exhibitionDetailState.salesSortDirection = 'asc';
  }
  switchTab('sales');
}

function exportAccountingToExcel() {
  const exhibition = getCurrentExhibition();
  const exportData = exhibitionDetailDependencies.exportModel.buildAccountingExport({
    exhibition,
    expenseItems: getExhibitionExpenseItems(),
    revenueItems: getExhibitionRevenueItems(),
    formatAmount: formatAccountingAmount,
    getExpenseEffectiveAmount,
    parseAmount: parseAccountingAmount
  });
  downloadBlobFile(
    new Blob([exportData.content], { type: exportData.mimeType }),
    exportData.filename
  );
}

function exportWorksToExcel() {
  const exportData = exhibitionDetailDependencies.exportModel.buildWorksExport({
    title: exhibitionDetailState.exhibition?.title,
    works: getSortedWorks()
  });
  downloadBlobFile(
    new Blob([exportData.content], { type: exportData.mimeType }),
    exportData.filename
  );
}

function toggleWorkListExpanded() {
  exhibitionDetailState.workListExpanded = !exhibitionDetailState.workListExpanded;
  switchTab(getCurrentInventoryListTabName());
}

function toggleWorkAdvanced() {
  exhibitionDetailState.workAdvanced = !exhibitionDetailState.workAdvanced;
  if (!exhibitionDetailState.workAdvanced) {
    exhibitionDetailState.workFilters = {
      title: '',
      artist: '',
      price: '',
      materials: '',
      size: '',
      year: '',
      category: ''
    };
    document.getElementById('work-search').value = exhibitionDetailState.workSearch;
  }
  switchTab(getCurrentInventoryListTabName());
}

function handleWorkSearchInput(value) {
  exhibitionDetailState.workSearch = value;
  exhibitionDetailState.workAdvanced = false;
  renderWorkRows();
}

function handleAdvancedFilter(field, value) {
  exhibitionDetailState.workFilters[field] = value;
}

function applyWorkFilters() {
  exhibitionDetailState.workSearch = '';
  renderWorkRows();
}

function resetWorkFilters() {
  exhibitionDetailState.workFilters = {
    title: '',
    artist: '',
    price: '',
    materials: '',
    size: '',
    year: '',
    category: ''
  };
  exhibitionDetailState.workSearch = '';
  document.getElementById('work-search').value = '';
  ['filter-title','filter-artist','filter-price','filter-materials','filter-size','filter-year','filter-category'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderWorkRows();
}

function toggleSalesAdvanced() {
  exhibitionDetailState.salesAdvanced = !exhibitionDetailState.salesAdvanced;
  if (!exhibitionDetailState.salesAdvanced) {
    exhibitionDetailState.salesFilters = {
      manualNumber: '',
      title: '',
      author: '',
      soldDateFrom: '',
      soldDateTo: '',
      buyerName: '',
      buyerPhone: '',
      paymentMethod: ''
    };
  }
  switchTab('sales');
}

function handleSalesSearchInput(value) {
  exhibitionDetailState.salesSearch = value;
  exhibitionDetailState.salesAdvanced = false;
  renderSoldWorkRows();
}

function handleSalesAdvancedFilter(field, value) {
  exhibitionDetailState.salesFilters[field] = value;
}

function applySalesFilters() {
  exhibitionDetailState.salesSearch = '';
  renderSoldWorkRows();
}

function resetSalesFilters() {
  exhibitionDetailState.salesFilters = {
    manualNumber: '',
    title: '',
    author: '',
    soldDateFrom: '',
    soldDateTo: '',
    buyerName: '',
    buyerPhone: '',
    paymentMethod: ''
  };
  exhibitionDetailState.salesSearch = '';
  const searchInput = document.getElementById('sales-search');
  if (searchInput) searchInput.value = '';
  [
    'sales-filter-manualNumber',
    'sales-filter-title',
    'sales-filter-author',
    'sales-filter-soldDateFrom',
    'sales-filter-soldDateTo',
    'sales-filter-buyerName',
    'sales-filter-buyerPhone',
    'sales-filter-paymentMethod'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderSoldWorkRows();
}

function filterSoldWorks(soldWorks) {
  return exhibitionDetailDependencies.salesModel.filterSoldWorks(soldWorks, {
    advanced: exhibitionDetailState.salesAdvanced,
    filters: exhibitionDetailState.salesFilters,
    search: exhibitionDetailState.salesSearch
  });
}

function filterWorks(works) {
  return exhibitionDetailDependencies.inventoryModel.filterWorks(works, {
    advanced: exhibitionDetailState.workAdvanced,
    filters: exhibitionDetailState.workFilters,
    search: exhibitionDetailState.workSearch
  });
}

function stripTransientPhotoUploadFieldsFromItem(item) {
  if (!item || typeof item !== 'object') return;
  TRANSIENT_WORK_PHOTO_FIELDS.forEach((field) => {
    if (field in item) {
      delete item[field];
    }
  });
}

function stripTransientPhotoUploadFieldsFromExhibition(exhibition) {
  if (!exhibition || typeof exhibition !== 'object') return;

  ['works', 'artWorks', 'goods', 'soldWorks', 'artSoldWorks', 'soldGoods'].forEach((field) => {
    const list = Array.isArray(exhibition[field]) ? exhibition[field] : [];
    list.forEach((item) => stripTransientPhotoUploadFieldsFromItem(item));
  });
}

function saveExhibition() {
  const exhibitions = exhibitionDetailDependencies.repository.loadExhibitions();
  const exhibition = exhibitionDetailState.exhibition || getCurrentExhibition();
  const targetId = Number.isFinite(exhibitionDetailState.exhibitionId) && exhibitionDetailState.exhibitionId > 0
    ? exhibitionDetailState.exhibitionId
    : (Number.isFinite(exhibition.id) && exhibition.id > 0 ? exhibition.id : null);

  if (!targetId) {
    console.error('Failed to save exhibition data: missing exhibition id.');
    return false;
  }

  initializeInventoryData(exhibition);
  persistActiveInventoryUiState();

  if (exhibitionDetailState.inventoryMode === 'goods') {
    exhibition.goods = Array.isArray(exhibition.works) ? exhibition.works : exhibition.goods;
    exhibition.soldGoods = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.soldGoods;
  } else {
    exhibition.artWorks = Array.isArray(exhibition.works) ? exhibition.works : exhibition.artWorks;
    exhibition.artSoldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.artSoldWorks;
  }

  const storageCopy = JSON.parse(JSON.stringify(exhibition));
  stripTransientPhotoUploadFieldsFromExhibition(storageCopy);
  storageCopy.works = Array.isArray(storageCopy.artWorks) ? storageCopy.artWorks : [];
  storageCopy.soldWorks = Array.isArray(storageCopy.artSoldWorks) ? storageCopy.artSoldWorks : [];

  const index = exhibitions.findIndex(e => e.id === targetId);
  const previousExhibition = index !== -1 ? exhibitions[index] : null;
  const allowLargeDrop = exhibitionDetailState.allowLargeInventoryDropOnce === true;
  exhibitionDetailState.allowLargeInventoryDropOnce = false;

  if (!allowLargeDrop && isLargeUnexpectedInventoryDrop(previousExhibition, storageCopy)) {
    alert('목록 데이터가 대량으로 사라지는 저장이 감지되어 자동 차단했습니다. 새로고침 후 다시 확인해주세요.');
    console.error('Blocked suspicious large inventory drop save.', {
      previous: getInventoryListCounts(previousExhibition),
      next: getInventoryListCounts(storageCopy)
    });
    return false;
  }

  updateInventoryResetMarker(storageCopy);
  storageCopy.updatedAt = new Date().toISOString();

  if (index !== -1) {
    exhibitions[index] = storageCopy;
  } else {
    storageCopy.id = targetId;
    exhibitions.push(storageCopy);
  }

  const saved = exhibitionDetailDependencies.repository.saveExhibitionsSafely(exhibitions);
  if (saved) {
    persistInventoryBackup(storageCopy);
    return true;
  }
  console.error('Failed to save exhibition data: storage write failed.');
  notifyExhibitionSaveFailure();
  return false;
}

function notifyExhibitionSaveFailure() {
  const now = Date.now();
  const lastAlertAt = Number(exhibitionDetailState.lastSaveFailureAlertAt) || 0;
  if (now - lastAlertAt < 3500) return;

  exhibitionDetailState.lastSaveFailureAlertAt = now;
  alert('저장 공간이 부족하여 판매/작품 데이터 저장에 실패했습니다. 이미지 또는 파일 용량을 줄인 뒤 다시 저장해주세요.');
}

function formatPriceInput(value) {
  if (isWorkNotForSale(value)) {
    return '미판매';
  }
  // Remove non-numeric characters
  const numericOnly = value.replace(/[^\d]/g, '');
  if (!numericOnly) return '';
  
  // Add commas every 3 digits
  return numericOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPriceForSave(value) {
  if (isWorkNotForSale(value)) {
    return '미판매';
  }
  // Remove commas and any existing symbols
  const numericOnly = value.replace(/[^\d]/g, '');
  if (!numericOnly) return '';
  
  // Add ₩ symbol and commas
  return '₩' + numericOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function handlePriceInput(workId, event) {
  const formatted = formatPriceInput(event.target.value);
  event.target.value = formatted;
}

function isWorkNotForSale(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return normalized === '미판매' || normalized === 'not for sale';
}

function setWorkNotForSale(workId, buttonEl) {
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) {
    alert('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
    return;
  }

  ensureWorkEditUndoSnapshot(workId);

  work.price = '미판매';
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();

  const row = buttonEl && typeof buttonEl.closest === 'function'
    ? buttonEl.closest('tr')
    : document.querySelector(`tr[data-work-id="${workId}"]`);
  const priceInput = row ? row.querySelector('input[data-field="price"]') : null;
  if (priceInput) {
    priceInput.value = '미판매';
    priceInput.classList.remove('required-missing');
  }
}

function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  if (target.closest('[contenteditable="true"]')) return true;
  return Boolean(target.closest('input, textarea, select'));
}

function createGridNavigationController() {
  return exhibitionDetailDependencies.gridNavigationModule.create({
    state: exhibitionDetailState,
    document,
    startCellEditFromEnter
  });
}

function isNavigableListTbodyId(tbodyId) {
  return gridNavigationController.isNavigableListTbodyId(tbodyId);
}

function getGridCellFromElement(element) {
  return gridNavigationController.getGridCellFromElement(element);
}

function getGridMetaFromCell(cell) {
  return gridNavigationController.getGridMetaFromCell(cell);
}

function updateGridNavAnchorFromCell(cell) {
  return gridNavigationController.updateGridNavAnchorFromCell(cell);
}

function getGridEntryControl(cell) {
  return gridNavigationController.getGridEntryControl(cell);
}

function focusGridCell(cell, preferEntry) {
  return gridNavigationController.focusGridCell(cell, preferEntry);
}

function findGridCellByAnchor(anchor) {
  return gridNavigationController.findGridCellByAnchor(anchor);
}

function getCurrentGridCell(targetElement) {
  return gridNavigationController.getCurrentGridCell(targetElement);
}

function getGridRowsFromCell(cell) {
  return gridNavigationController.getGridRowsFromCell(cell);
}

function getAdjacentGridCell(cell, key) {
  return gridNavigationController.getAdjacentGridCell(cell, key);
}

function setPendingGridFocus(tbodyId, rowId, colIndex) {
  return gridNavigationController.setPendingGridFocus(tbodyId, rowId, colIndex);
}

function applyPendingGridFocusForTbody(tbodyId) {
  return gridNavigationController.applyPendingGridFocusForTbody(tbodyId);
}

function refreshGridKeyboardNavigation(tbodyId) {
  return gridNavigationController.refreshGridKeyboardNavigation(tbodyId);
}

function startCellEditFromEnter(cell) {
  const meta = getGridMetaFromCell(cell);
  if (!meta) return;

  const existingControl = getGridEntryControl(cell);
  if (existingControl) {
    focusGridCell(cell, true);
    return;
  }

  if (meta.tbodyId === 'works-tbody') {
    const workId = Number(meta.rowId);
    if (!Number.isFinite(workId)) return;
    const exhibition = getCurrentExhibition();
    const work = (exhibition.works || []).find((item) => Number(item.id) === workId);
    if (!work || !work.saved || !canCurrentUserModifyOwnedRow(work)) return;
    setPendingGridFocus('works-tbody', workId, meta.colIndex);
    toggleWorkEdit(workId);
    return;
  }

  if (meta.tbodyId === 'sold-works-tbody') {
    const soldId = Number(meta.rowId);
    if (!Number.isFinite(soldId)) return;
    const soldWorks = ensureSoldWorksArray();
    const sold = soldWorks.find((item) => Number(item.id) === soldId);
    if (!sold || !sold.saved || !canCurrentUserModifyOwnedRow(sold)) return;
    setPendingGridFocus('sold-works-tbody', soldId, meta.colIndex);
    toggleSoldWorkEdit(soldId);
  }
}

function handleGridKeyboardNavigation(event) {
  return gridNavigationController.handleGridKeyboardNavigation(event);
}

function handleGridCellClick(event) {
  return gridNavigationController.handleGridCellClick(event);
}

function handleGridCellFocusIn(event) {
  return gridNavigationController.handleGridCellFocusIn(event);
}

function handleGlobalUndoShortcut(event) {
  const isUndoCombo = (event.metaKey || event.ctrlKey) && !event.shiftKey && (event.key === 'z' || event.key === 'Z');
  if (!isUndoCombo) return;

  // Preserve native undo behavior while typing in form controls.
  if (isEditableTarget(event.target)) return;

  const isWorksView = exhibitionDetailState.currentTab === 'inventory-list';

  if (isWorksView) {
    const canUndoWorks = exhibitionDetailState.workUndoStack.length > 0;
    if (!canUndoWorks) return;
    event.preventDefault();
    undoWorkChanges();
    return;
  }

  const isSalesView = exhibitionDetailState.currentTab === 'inventory-sales';

  if (isSalesView) {
    const canUndoSales = exhibitionDetailState.salesUndoStack.length > 0;
    if (!canUndoSales) return;
    event.preventDefault();
    undoSalesChanges();
  }
}

function initializeExhibitionDetailControllers() {
  if (certificateController) return;

  exhibitionDetailDependencies = resolveExhibitionDetailDependencies();
  certificateController = createCertificateController();
  inventoryStateController = createInventoryStateController();
  worksEditorController = createWorksEditorController();
  TRANSIENT_WORK_PHOTO_FIELDS = worksEditorController.TRANSIENT_WORK_PHOTO_FIELDS;
  worksView = createWorksView();
  salesViewController = createSalesViewController();
  accountingViewController = createAccountingViewController();
  backupController = createBackupController();
  infoController = createInfoController();
  staffController = createStaffController();
  filesController = createFilesController();
  salesAddController = createSalesAddController();
  gridNavigationController = createGridNavigationController();
}

let exhibitionDetailStartupStarted = false;

window.exhibitionDetailReady = new Promise((resolve, reject) => {
  function startExhibitionDetailPage() {
    if (exhibitionDetailStartupStarted) return;
    exhibitionDetailStartupStarted = true;
    initializeExhibitionDetailControllers();
    initDetailPage().then(resolve, reject);
  }

  if (document.getElementById('exhibition-title')) {
    startExhibitionDetailPage();
  }
});
window.addEventListener('keydown', handleGlobalUndoShortcut);
window.addEventListener('keydown', handleGridKeyboardNavigation, true);
window.addEventListener('click', handleGridCellClick, true);
window.addEventListener('focusin', handleGridCellFocusIn, true);
window.addEventListener('click', (event) => {
  const inviteModal = document.getElementById('invite-modal');
  const deleteModal = document.getElementById('delete-modal');
  const salesAddModal = document.getElementById('sales-add-modal');
  const artistSalesSummaryModal = document.getElementById('artist-sales-summary-modal');
  const fileUploadModal = document.getElementById('file-upload-modal');
  if (event.target === inviteModal) {
    closeInviteModal();
  }
  if (event.target === deleteModal) {
    closeDeleteWorkModal();
  }
  if (event.target === salesAddModal) {
    closeSalesAddModal();
  }
  if (event.target === artistSalesSummaryModal) {
    closeArtistSalesSummaryModal();
  }
  if (event.target === fileUploadModal) {
    closeFileUploadModal();
  }
});

