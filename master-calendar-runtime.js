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

/* storage/master-calendar-repository.js */
(function initializeMasterCalendarRepository(root) {
  'use strict';

  const KEYS = Object.freeze({
    calendar: 'studio-calendar-state-v1',
    students: 'pottery-students-v1',
    personalWork: 'pottery-personal-work-v1',
    users: 'users'
  });

  function createMasterCalendarRepository(storage) {
    function readJson(key, fallbackText) {
      return JSON.parse(storage.read(key) || fallbackText);
    }

    function readArray(key) {
      const value = readJson(key, '[]');
      return Array.isArray(value) ? value : [];
    }

    return Object.freeze({
      loadCalendarState() {
        const value = readJson(KEYS.calendar, '{}');
        return value && typeof value === 'object' ? value : {};
      },
      loadStudents() {
        return readArray(KEYS.students);
      },
      loadPersonalWorkEntries() {
        return readArray(KEYS.personalWork);
      },
      loadUsers() {
        return readArray(KEYS.users);
      },
      saveCalendarState(state) {
        return storage.write(KEYS.calendar, JSON.stringify(state));
      }
    });
  }

  function createDeferredMasterCalendarRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Master calendar storage adapter is unavailable.');
      return createMasterCalendarRepository(storage);
    }
    return Object.freeze({
      loadCalendarState: () => repository().loadCalendarState(),
      loadStudents: () => repository().loadStudents(),
      loadPersonalWorkEntries: () => repository().loadPersonalWorkEntries(),
      loadUsers: () => repository().loadUsers(),
      saveCalendarState: (state) => repository().saveCalendarState(state)
    });
  }

  const api = Object.freeze({
    KEYS,
    createMasterCalendarRepository,
    createDeferredMasterCalendarRepository,
    repository: createDeferredMasterCalendarRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.MasterCalendarRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/date-time.js */
(function initializeMasterCalendarDateTime(root) {
  'use strict';

  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;

  function getWeekStart(date) {
    const base = new Date(date);
    const day = base.getDay();
    const delta = day === 0 ? -6 : 1 - day;
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + delta);
    return base;
  }

  function getMonthStart(date) {
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    base.setDate(1);
    return base;
  }

  function addDays(date, diff) {
    const next = new Date(date);
    next.setDate(next.getDate() + diff);
    return next;
  }

  function addMonths(date, diff) {
    const current = new Date(date);
    const day = current.getDate();
    current.setDate(1);
    current.setMonth(current.getMonth() + diff);
    const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    current.setDate(Math.min(day, lastDay));
    return getMonthStart(current);
  }

  function slotToTime(slot) {
    const bounded = Math.max(0, Math.min(SLOTS_PER_DAY, slot));
    const hour = Math.floor((bounded * SLOT_MINUTES) / 60);
    const minute = (bounded * SLOT_MINUTES) % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function timeToSlot(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(SLOTS_PER_DAY, Math.floor((h * 60 + m) / SLOT_MINUTES)));
  }

  function formatDateInput(date) {
    const normalized = new Date(date);
    return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`;
  }

  function getDayIndexFromDateString(date) {
    const normalized = new Date(`${date}T00:00:00`);
    if (Number.isNaN(normalized.getTime())) return -1;
    const jsDay = normalized.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  const api = Object.freeze({
    addDays,
    addMonths,
    formatDateInput,
    getDayIndexFromDateString,
    getMonthStart,
    getWeekStart,
    slotToTime,
    timeToSlot
  });
  root.MasterCalendarDateTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/occurrences.js */
(function initializeMasterCalendarOccurrences(root) {
  'use strict';

  function expandOccurrences(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const rangeStart = parseDate(options?.rangeStart);
    const rangeEnd = parseDate(options?.rangeEnd);
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return [];

    const occurrences = [];
    events.forEach((event) => {
      if (!event || typeof event !== 'object' || !event.date) return;
      if (options?.includeRangeEvents && typeof options?.isRangeEvent === 'function' && options.isRangeEvent(event)) {
        const eventStart = parseDate(event.date);
        const eventEnd = parseDate(event.endDate || event.date);
        if (!eventStart || !eventEnd) return;
        let cursor = new Date(eventStart > rangeStart ? eventStart : rangeStart);
        const last = eventEnd < rangeEnd ? eventEnd : rangeEnd;
        while (cursor <= last) {
          occurrences.push({ event, date: formatDate(cursor) });
          cursor = addDays(cursor, 1);
        }
        return;
      }

      const baseDate = parseDate(event.date);
      if (!baseDate) return;
      if (!event.repeatWeekly) {
        if (baseDate >= rangeStart && baseDate <= rangeEnd) {
          occurrences.push({ event, date: formatDate(baseDate) });
        }
        return;
      }

      let repeatEnd = null;
      if (event.repeatEndDate) {
        repeatEnd = parseDate(event.repeatEndDate);
        if (!repeatEnd && options?.invalidRepeatEnd === 'exclude') return;
      }
      const last = repeatEnd && repeatEnd < rangeEnd ? repeatEnd : rangeEnd;
      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      const maxWeeklyIterations = Number.isInteger(options?.maxWeeklyIterations)
        ? Math.max(0, options.maxWeeklyIterations)
        : Infinity;
      let cursor = new Date(baseDate);
      let weeklyIterations = 0;
      while (cursor < rangeStart && weeklyIterations < maxWeeklyIterations) {
        cursor = addDays(cursor, 7);
        weeklyIterations += 1;
      }
      while (cursor <= last && weeklyIterations < maxWeeklyIterations) {
        const date = formatDate(cursor);
        if (!skipDates.includes(date)) occurrences.push({ event, date });
        cursor = addDays(cursor, 7);
        weeklyIterations += 1;
      }
    });
    return occurrences;
  }

  function getEventsForDate(options) {
    return expandOccurrences({
      ...options,
      rangeStart: options?.date,
      rangeEnd: options?.date
    }).map((occurrence) => occurrence.event);
  }

  function parseDate(value) {
    const date = new Date(`${String(value || '').trim()}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = Object.freeze({ expandOccurrences, getEventsForDate });
  root.MasterCalendarOccurrences = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/occupancy.js */
(function initializeMasterCalendarOccupancy(root) {
  'use strict';

  const LANE_COUNT = 3;
  const DEFAULT_SLOT_COUNT = 48;

  function createEmptyDailyOccupancy(slotCount = DEFAULT_SLOT_COUNT) {
    return Array.from({ length: slotCount }, () => Array(LANE_COUNT).fill(false));
  }

  function cloneDailyOccupancy(occupancy, slotCount = DEFAULT_SLOT_COUNT) {
    return Array.from({ length: slotCount }, (_unused, slot) => {
      const row = Array.isArray(occupancy?.[slot]) ? occupancy[slot] : [];
      return [Boolean(row[0]), Boolean(row[1]), Boolean(row[2])];
    });
  }

  function canPlaceInLane(occupancy, startSlot, endSlot, need, lane) {
    if (!Array.isArray(occupancy)) return false;
    if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) return false;
    if (!Number.isInteger(need) || need < 1 || need > LANE_COUNT) return false;
    if (!Number.isInteger(lane) || lane < 0 || lane + need > LANE_COUNT) return false;

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      if (!Array.isArray(occupancy[slot])) return false;
      for (let currentLane = lane; currentLane < lane + need; currentLane += 1) {
        if (occupancy[slot][currentLane]) return false;
      }
    }
    return true;
  }

  function findLane(occupancy, startSlot, endSlot, need) {
    for (let lane = 0; lane <= LANE_COUNT - need; lane += 1) {
      if (canPlaceInLane(occupancy, startSlot, endSlot, need, lane)) return lane;
    }
    return -1;
  }

  function markLaneOccupancy(occupancy, startSlot, endSlot, lane, need) {
    for (let slot = startSlot; slot < endSlot; slot += 1) {
      for (let currentLane = lane; currentLane < lane + need; currentLane += 1) {
        occupancy[slot][currentLane] = true;
      }
    }
  }

  function buildDailyOccupancy(options = {}) {
    const occupancy = createEmptyDailyOccupancy(options.slotCount);
    const events = Array.isArray(options.events) ? options.events : [];
    const excludeEventId = options.excludeEventId;
    const timeToSlot = options.timeToSlot;
    const isIgnoredKind = options.isIgnoredKind;

    events.forEach((event) => {
      if (excludeEventId && event && event.id === excludeEventId) return;
      if (event && typeof isIgnoredKind === 'function' && isIgnoredKind(event.kind)) return;
      const startSlot = timeToSlot(event.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
      const need = Math.max(1, Math.min(LANE_COUNT, Number(event.capacity || 1)));
      const lane = findLane(occupancy, startSlot, endSlot, need);
      if (lane < 0) return;
      markLaneOccupancy(occupancy, startSlot, endSlot, lane, need);
    });

    return occupancy;
  }

  function getRuleForSlot(rules, dayIndex, slot) {
    let resolved = null;
    (Array.isArray(rules) ? rules : []).forEach((rule) => {
      if (rule.day === dayIndex && slot >= rule.startSlot && slot < rule.endSlot) resolved = rule;
    });
    return resolved;
  }

  function isPlacementAllowed(options = {}) {
    const kind = options.kind;
    const dayIndex = options.dayIndex;
    const startSlot = options.startSlot;
    const endSlot = options.endSlot;
    if (dayIndex < 0 || endSlot <= startSlot) return false;
    if (kind === '기타' || (typeof options.isAllDayKind === 'function' && options.isAllDayKind(kind))) return true;

    if (kind === '수강') {
      const startRule = getRuleForSlot(options.rules, dayIndex, startSlot);
      const endRule = getRuleForSlot(options.rules, dayIndex, endSlot - 1);
      if (!startRule || !endRule || startRule.id !== endRule.id) return false;
      return startRule.type === '수업시간'
        && Number(startRule.startSlot) === Number(startSlot)
        && Number(startRule.endSlot) === Number(endSlot);
    }

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getRuleForSlot(options.rules, dayIndex, slot);
      if (kind === '개인작업' && (!rule || rule.type !== '개인작업 시간')) return false;
      if (kind === '강사 지도 하 개인작업' && (!rule || rule.type !== '수업시간')) return false;
    }
    return true;
  }

  const api = Object.freeze({
    buildDailyOccupancy,
    canPlaceInLane,
    cloneDailyOccupancy,
    createEmptyDailyOccupancy,
    findLane,
    hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need) {
      return findLane(occupancy, startSlot, endSlot, need) >= 0;
    },
    isPlacementAllowed,
    markLaneOccupancy
  });

  root.MasterCalendarOccupancy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/base-rules.js */
(function initializeMasterCalendarBaseRules(root) {
  'use strict';

  function create(dependencies) {
    const { state, getWeekStart, formatDateInput, createBaseRuleId } = dependencies;

    function getBaseEditorWeekStart() {
      return getWeekStart(state.baseEditorWeekStart || state.weekStart || new Date());
    }

    function getBaseWeekKey(weekStartDate) {
      return formatDateInput(getWeekStart(weekStartDate || new Date()));
    }

    function cloneBaseRules(rules) {
      return (rules || []).map((rule) => ({ ...rule }));
    }

    function cloneBaseRuleTimeline(timeline) {
      return (timeline || []).map((entry) => ({
        weekKey: String(entry?.weekKey || ''),
        rules: cloneBaseRules(entry?.rules)
      })).filter((entry) => entry.weekKey);
    }

    function normalizeBaseRule(rule) {
      return {
        ...rule,
        day: Number(rule?.day || 0),
        startSlot: Number(rule?.startSlot || 0),
        endSlot: Number(rule?.endSlot || 1),
        className: String(rule?.className || '').trim(),
        instructor: String(rule?.instructor || '').trim()
      };
    }

    function getTemplateRulesForWeek(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      let resolved = null;
      (state.baseRuleTimeline || []).forEach((entry) => {
        const key = String(entry?.weekKey || '');
        if (!key || key > weekKey) return;
        if (!resolved || key > resolved.weekKey) {
          resolved = { weekKey: key, rules: entry.rules };
        }
      });
      if (resolved) return resolved.rules;
      return state.baseRules;
    }

    function getRulesForWeek(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      const override = state.baseWeekOverrides[weekKey];
      if (Array.isArray(override)) return override;
      return getTemplateRulesForWeek(weekStartDate || state.weekStart);
    }

    function hasWeekOverride(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      return Array.isArray(state.baseWeekOverrides[weekKey]);
    }

    function ensureWeekOverrideRules(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      if (!Array.isArray(state.baseWeekOverrides[weekKey])) {
        state.baseWeekOverrides[weekKey] = cloneBaseRules(getTemplateRulesForWeek(weekStartDate || state.weekStart));
      }
      return state.baseWeekOverrides[weekKey];
    }

    function getRulesByScope(scope, weekStartDate) {
      if (scope === 'all') return getTemplateRulesForWeek(weekStartDate || getBaseEditorWeekStart());
      return ensureWeekOverrideRules(weekStartDate || getBaseEditorWeekStart());
    }

    function getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot) {
      const timeline = Array.isArray(snapshot?.baseRuleTimeline) ? snapshot.baseRuleTimeline : [];
      let resolved = null;
      timeline.forEach((entry) => {
        const key = String(entry?.weekKey || '');
        if (!key || key > weekKey) return;
        if (!resolved || key > resolved.weekKey) {
          resolved = { weekKey: key, rules: entry.rules };
        }
      });
      if (resolved) return cloneBaseRules(resolved.rules);
      return cloneBaseRules(snapshot?.baseRules);
    }

    function setTemplateRulesForWeekFrom(weekStartDate, nextRules) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
        .filter((entry) => String(entry.weekKey || '') !== weekKey);
      timeline.push({ weekKey, rules: cloneBaseRules(nextRules) });
      timeline.sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
      state.baseRuleTimeline = timeline;
    }

    function getRuleComparableSignature(rule) {
      const day = Number(rule?.day || 0);
      const startSlot = Number(rule?.startSlot || 0);
      const endSlot = Number(rule?.endSlot || 1);
      const type = String(rule?.type || '');
      const className = String(rule?.className || '').trim();
      const instructor = String(rule?.instructor || '').trim();
      return `${day}|${startSlot}|${endSlot}|${type}|${className}|${instructor}`;
    }

    function areRuleSetsEquivalent(left, right) {
      const leftRules = Array.isArray(left) ? left : [];
      const rightRules = Array.isArray(right) ? right : [];
      if (leftRules.length !== rightRules.length) return false;
      const leftSignatures = leftRules.map((rule) => getRuleComparableSignature(rule)).sort();
      const rightSignatures = rightRules.map((rule) => getRuleComparableSignature(rule)).sort();
      for (let index = 0; index < leftSignatures.length; index += 1) {
        if (leftSignatures[index] !== rightSignatures[index]) return false;
      }
      return true;
    }

    function normalizeTemplateTimeline() {
      const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
        .sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
      const normalized = [];
      let previousRules = cloneBaseRules(state.baseRules);
      timeline.forEach((entry) => {
        if (!areRuleSetsEquivalent(entry.rules, previousRules)) {
          normalized.push({
            weekKey: String(entry.weekKey),
            rules: cloneBaseRules(entry.rules)
          });
          previousRules = cloneBaseRules(entry.rules);
        }
      });
      state.baseRuleTimeline = normalized;
    }

    function reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey) {
      Object.entries(state.baseWeekOverrides || {}).forEach(([weekKey, rules]) => {
        if (!Array.isArray(rules)) return;
        if (startWeekKey && weekKey < startWeekKey) return;
        const previousTemplate = getTemplateRulesFromSnapshotForWeekKey(weekKey, templateSnapshot);
        if (areRuleSetsEquivalent(rules, previousTemplate)) {
          delete state.baseWeekOverrides[weekKey];
        }
      });
    }

    function rangesOverlap(startA, endA, startB, endB) {
      return Math.max(startA, startB) < Math.min(endA, endB);
    }

    function applyMovedRuleOverride(targetRules, movedRule) {
      if (!Array.isArray(targetRules) || !movedRule) return;

      const movedDay = Number(movedRule.day);
      const movedStart = Number(movedRule.startSlot);
      const movedEnd = Number(movedRule.endSlot);
      const movedId = String(movedRule.id || '');
      if (!Number.isInteger(movedDay) || movedEnd <= movedStart || !movedId) return;

      const nextRules = [];
      targetRules.forEach((rule) => {
        if (!rule || String(rule.id || '') === movedId) return;
        const day = Number(rule.day);
        const start = Number(rule.startSlot);
        const end = Number(rule.endSlot);
        if (day !== movedDay || !rangesOverlap(movedStart, movedEnd, start, end)) {
          nextRules.push(rule);
          return;
        }
        if (start < movedStart) {
          const leftEnd = Math.min(end, movedStart);
          if (leftEnd > start) {
            nextRules.push({ ...rule, id: createBaseRuleId(), startSlot: start, endSlot: leftEnd });
          }
        }
        if (end > movedEnd) {
          const rightStart = Math.max(start, movedEnd);
          if (end > rightStart) {
            nextRules.push({ ...rule, id: createBaseRuleId(), startSlot: rightStart, endSlot: end });
          }
        }
      });
      nextRules.push(movedRule);
      targetRules.length = 0;
      nextRules.forEach((rule) => targetRules.push(rule));
    }

    return Object.freeze({
      getBaseWeekKey,
      cloneBaseRules,
      cloneBaseRuleTimeline,
      normalizeBaseRule,
      getRulesForWeek,
      hasWeekOverride,
      ensureWeekOverrideRules,
      getRulesByScope,
      getTemplateRulesFromSnapshotForWeekKey,
      getTemplateRulesForWeek,
      setTemplateRulesForWeekFrom,
      normalizeTemplateTimeline,
      reconcileWeekOverridesAfterTemplateChange,
      getRuleComparableSignature,
      areRuleSetsEquivalent,
      rangesOverlap,
      applyMovedRuleOverride
    });
  }

  const api = Object.freeze({ create });
  root.MasterCalendarBaseRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/base-transaction-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseTransactionController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      document,
      SLOTS_PER_DAY,
      baseRulesDomain,
      getWeekStart,
      formatDateInput,
      addDays,
      timeToSlot,
      slotToTime,
      getEventsForDate,
      isAllDayKind,
      openModal,
      closeModal,
      saveState,
      renderAll,
      applyClassEventBaseMetadata,
      alert,
      now,
      random
    } = dependencies;

    function getBaseEditorWeekStart() {
      return getWeekStart(state.baseEditorWeekStart || state.weekStart || new Date());
    }

    function cloneBaseWeekOverrides(overrides) {
      const result = {};
      Object.entries(overrides || {}).forEach(([key, rules]) => {
        if (!Array.isArray(rules)) return;
        result[key] = baseRulesDomain.cloneBaseRules(rules);
      });
      return result;
    }

    function getBaseEditScope() {
      return state.baseEditMode === 'week' ? 'week' : 'all';
    }

    function isEditFromCurrentWeekEnabled() {
      const checkbox = document.getElementById('base-edit-from-current-week');
      return state.baseEditMode === 'base' && Boolean(checkbox?.checked);
    }

    function requestBaseEventFollowChoice(affectedCount, onResolve) {
      state.baseEventFollowPrompt.pending = onResolve;
      const message = document.getElementById('base-event-follow-message');
      if (message) {
        if (affectedCount > 1) {
          message.textContent = `해당 베이스 시간표 위에 이벤트 ${affectedCount}건이 있습니다. 이벤트도 같이 옮길까요?`;
        } else {
          message.textContent = '해당 베이스 시간표 위에 이벤트가 있습니다. 이벤트도 같이 옮길까요?';
        }
      }
      openModal('base-event-follow-modal');
    }

    function resolveBaseEventFollowPrompt(choice) {
      const pending = state.baseEventFollowPrompt.pending;
      state.baseEventFollowPrompt.pending = null;
      closeModal('base-event-follow-modal');
      if (typeof pending === 'function') {
        pending(choice);
      }
    }

    function executeBaseChangeWithScopeAndEventPrompt(scopeOrResolver, buildPayload, applyChange) {
      const resolvedScope = scopeOrResolver;
      const payload = buildPayload(resolvedScope);
      const affectedEvents = Array.isArray(payload?.affectedEvents) ? payload.affectedEvents : [];
      const askEventFollow = Boolean(payload?.askEventFollow) && resolvedScope === 'week';

      const commit = (moveEvents) => {
        const templateSnapshot = resolvedScope === 'all'
          ? {
              baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
              baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline)
            }
          : null;
        const fromCurrent = resolvedScope === 'all' && isEditFromCurrentWeekEnabled();
        const startWeekKey = fromCurrent ? baseRulesDomain.getBaseWeekKey(getBaseEditorWeekStart()) : null;
        pushBaseUndoState();
        applyChange({ ...payload, scope: resolvedScope, moveEvents: Boolean(moveEvents) });
        if (templateSnapshot) {
          baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
          baseRulesDomain.normalizeTemplateTimeline();
        }
        saveState();
        renderAll();
      };

      if (!askEventFollow || affectedEvents.length === 0) {
        commit(false);
        return;
      }

      requestBaseEventFollowChoice(affectedEvents.length, (choice) => {
        if (choice === 'cancel') return;
        commit(choice === 'yes');
      });
    }

    function withBaseScope(scopeOrResolver, mutationFn) {
      const scope = scopeOrResolver;
      const templateSnapshot = scope === 'all'
        ? {
            baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
            baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline)
          }
        : null;
      const fromCurrent = scope === 'all' && isEditFromCurrentWeekEnabled();
      const startWeekKey = fromCurrent ? baseRulesDomain.getBaseWeekKey(getBaseEditorWeekStart()) : null;
      pushBaseUndoState();
      mutationFn(scope);
      if (templateSnapshot) {
        baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
        baseRulesDomain.normalizeTemplateTimeline();
      }
      saveState();
      renderAll();
    }

    function getEditableBaseRulesForAllMode(weekStartDate) {
      const editorWeekStart = getWeekStart(weekStartDate || getBaseEditorWeekStart());
      const seedRules = baseRulesDomain.cloneBaseRules(baseRulesDomain.getTemplateRulesForWeek(editorWeekStart));
      if (isEditFromCurrentWeekEnabled()) {
        baseRulesDomain.setTemplateRulesForWeekFrom(editorWeekStart, seedRules);
        return baseRulesDomain.getRulesByScope('all', editorWeekStart);
      }
      state.baseRules = seedRules;
      state.baseRuleTimeline = [];
      return state.baseRules;
    }

    function resetBaseApplyWeeklyCheckbox() {
      const checkbox = document.getElementById('base-apply-weekly');
      if (checkbox) checkbox.checked = false;
    }

    function collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate) {
      if (!Number.isInteger(day) || endSlot <= startSlot) return [];
      const date = formatDateInput(addDays(getWeekStart(weekStartDate || new Date()), day));
      const events = getEventsForDate(date);
      const seen = new Set();
      const affected = [];

      events.forEach((eventItem) => {
        if (!eventItem || isAllDayKind(eventItem.kind)) return;
        const eventStart = timeToSlot(eventItem.start);
        const eventEnd = Math.max(eventStart + 1, timeToSlot(eventItem.end));
        if (!baseRulesDomain.rangesOverlap(startSlot, endSlot, eventStart, eventEnd)) return;
        const key = `${String(eventItem.id || '')}|${date}`;
        if (seen.has(key)) return;
        seen.add(key);
        affected.push({ eventId: String(eventItem.id || ''), occurrenceDate: date });
      });

      return affected;
    }

    function buildBaseEventMovePlan(affectedEvents, dayShift, slotShift) {
      if (!Array.isArray(affectedEvents) || affectedEvents.length === 0) return [];
      return affectedEvents.map((item) => ({
        eventId: String(item.eventId || ''),
        occurrenceDate: String(item.occurrenceDate || ''),
        dayShift: Number(dayShift || 0),
        slotShift: Number(slotShift || 0)
      })).filter((item) => item.eventId && item.occurrenceDate);
    }

    function applyBaseEventMovePlan(movePlan) {
      (movePlan || []).forEach((plan) => {
        const eventItem = state.events.find((item) => item && String(item.id || '') === String(plan.eventId || ''));
        if (!eventItem) return;

        const occurrenceDate = String(plan.occurrenceDate || '');
        const currentOccurrenceDate = new Date(`${occurrenceDate}T00:00:00`);
        if (Number.isNaN(currentOccurrenceDate.getTime())) return;

        const nextDate = formatDateInput(addDays(currentOccurrenceDate, Number(plan.dayShift || 0)));
        const startSlot = timeToSlot(eventItem.start);
        const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem.end));
        const duration = Math.max(1, endSlot - startSlot);
        const shiftedStart = Math.max(0, Math.min(SLOTS_PER_DAY - duration, startSlot + Number(plan.slotShift || 0)));
        const shiftedEnd = shiftedStart + duration;
        const nextStart = slotToTime(shiftedStart);
        const nextEnd = slotToTime(shiftedEnd);

        if (eventItem.repeatWeekly) {
          const skipDates = Array.isArray(eventItem.repeatSkipDates) ? eventItem.repeatSkipDates.slice() : [];
          if (!skipDates.includes(occurrenceDate)) {
            skipDates.push(occurrenceDate);
            skipDates.sort();
          }
          eventItem.repeatSkipDates = skipDates;

          const movedOccurrence = {
            id: `evt-${now()}-${random().toString(36).slice(2, 8)}`,
            kind: eventItem.kind,
            title: eventItem.title,
            date: nextDate,
            endDate: eventItem.endDate || '',
            start: nextStart,
            end: nextEnd,
            classType: eventItem.classType || '',
            instructor: eventItem.instructor || '',
            baseRuleId: eventItem.baseRuleId || '',
            capacity: Math.max(1, Math.min(3, Number(eventItem.capacity || 1))),
            repeatWeekly: false,
            repeatEndDate: '',
            repeatSkipDates: []
          };
          if (String(movedOccurrence.kind || '') === '수강') {
            applyClassEventBaseMetadata(movedOccurrence, nextDate);
          }
          state.events.push(movedOccurrence);
          return;
        }

        eventItem.date = nextDate;
        eventItem.start = nextStart;
        eventItem.end = nextEnd;
        if (String(eventItem.kind || '') === '수강') {
          applyClassEventBaseMetadata(eventItem, nextDate);
        }
      });
    }

    function createBaseRuleId() {
      return `base-${now()}-${random().toString(36).slice(2, 8)}`;
    }

    function applyBaseRule(day, startSlot, endSlot) {
      const type = document.getElementById('base-type').value;
      const className = document.getElementById('base-class-name').value;
      const instructor = String(document.getElementById('base-instructor')?.value || '').trim();
      if (!type) {
        alert('유형을 먼저 선택해주세요.');
        return false;
      }

      if (type === '수업시간' && !className) {
        alert('수업시간은 수업명을 입력해주세요.');
        return false;
      }
      if (type === '수업시간' && !instructor) {
        alert('수업시간은 강사를 선택해주세요.');
        return false;
      }

      const scope = getBaseEditScope();
      withBaseScope(scope, (resolvedScope) => {
        let targetRules = null;
        if (resolvedScope === 'all') {
          targetRules = getEditableBaseRulesForAllMode(getBaseEditorWeekStart());
        } else {
          targetRules = baseRulesDomain.getRulesByScope(resolvedScope, getBaseEditorWeekStart());
        }
        targetRules.push({
          id: `base-${now()}-${random().toString(36).slice(2, 8)}`,
          day,
          startSlot,
          endSlot,
          type,
          className: type === '수업시간' ? className : '',
          instructor: type === '수업시간' ? instructor : ''
        });
      });

      resetBaseApplyWeeklyCheckbox();
      return true;
    }

    function cloneEventsForUndo(events) {
      return (events || []).map((eventItem) => ({
        ...eventItem,
        repeatSkipDates: Array.isArray(eventItem?.repeatSkipDates) ? eventItem.repeatSkipDates.slice() : []
      }));
    }

    function pushBaseUndoState() {
      state.baseUndoStack.push({
        events: cloneEventsForUndo(state.events),
        baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
        baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline),
        baseWeekOverrides: cloneBaseWeekOverrides(state.baseWeekOverrides)
      });
      if (state.baseUndoStack.length > 100) {
        state.baseUndoStack.shift();
      }
      updateUndoButtonState();
    }

    function undoBaseChange() {
      if (state.baseUndoStack.length === 0) return;
      const previous = state.baseUndoStack.pop();
      if (Array.isArray(previous)) {
        state.baseRules = baseRulesDomain.cloneBaseRules(previous);
        state.baseRuleTimeline = [];
        state.baseWeekOverrides = {};
      } else {
        if (Array.isArray(previous?.events)) {
          state.events = cloneEventsForUndo(previous.events);
        }
        state.baseRules = baseRulesDomain.cloneBaseRules(previous?.baseRules);
        state.baseRuleTimeline = baseRulesDomain.cloneBaseRuleTimeline(previous?.baseRuleTimeline);
        state.baseWeekOverrides = cloneBaseWeekOverrides(previous?.baseWeekOverrides);
      }
      saveState();
      renderAll();
    }

    function updateUndoButtonState() {
      const button = document.getElementById('undo-base-btn');
      if (!button) return;
      button.disabled = state.baseUndoStack.length === 0;
    }

    return {
      getBaseEditorWeekStart,
      cloneBaseWeekOverrides,
      getBaseEditScope,
      isEditFromCurrentWeekEnabled,
      requestBaseEventFollowChoice,
      resolveBaseEventFollowPrompt,
      executeBaseChangeWithScopeAndEventPrompt,
      withBaseScope,
      getEditableBaseRulesForAllMode,
      resetBaseApplyWeeklyCheckbox,
      collectBaseRangeEventOccurrences,
      buildBaseEventMovePlan,
      applyBaseEventMovePlan,
      createBaseRuleId,
      applyBaseRule,
      cloneEventsForUndo,
      pushBaseUndoState,
      undoBaseChange,
      updateUndoButtonState
    };
  }

  return { create };
});

/* master-calendar/quick-create-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarQuickCreateController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      document,
      SLOT_HEIGHT,
      canCreateFromBaseRule,
      getBaseRuleForSlot,
      formatDateInput,
      addDays,
      slotToTime,
      buildDailyOccupancyMap,
      findLane,
      openEventModal
    } = dependencies;

    function startMasterCreate(event, dayIndex, slot, baseRule) {
      if (event && event.button !== 0) return;
      if (state.masterEdit.active) return;
      const type = String(baseRule?.type || '');
      if (!type) return;
      if (!canCreateFromBaseRule(baseRule)) {
        if (event) event.preventDefault();
        return;
      }

      if (event) {
        event.preventDefault();
      }

      if (type === '수업시간' && baseRule) {
        state.masterCreate.active = true;
        state.masterCreate.mode = 'class';
        state.masterCreate.dayIndex = dayIndex;
        state.masterCreate.anchorSlot = Number(baseRule.startSlot);
        state.masterCreate.startSlot = Number(baseRule.startSlot);
        state.masterCreate.endSlot = Number(baseRule.endSlot);
        return;
      }

      if (type.includes('개인작업')) {
        state.masterCreate.active = true;
        state.masterCreate.mode = 'personal';
        state.masterCreate.dayIndex = dayIndex;
        state.masterCreate.anchorSlot = slot;
        state.masterCreate.startSlot = slot;
        state.masterCreate.endSlot = slot + 1;
        updateMasterCreatePreview();
      }
    }

    function moveMasterCreate(dayIndex, slot) {
      if (!state.masterCreate.active) return;
      if (state.masterCreate.mode !== 'personal') return;
      if (state.masterCreate.dayIndex !== dayIndex) return;

      const rule = getBaseRuleForSlot(dayIndex, slot, state.weekStart);
      const type = String(rule?.type || '');
      if (!type.includes('개인작업')) return;

      const anchor = Number(state.masterCreate.anchorSlot);
      state.masterCreate.startSlot = Math.min(anchor, slot);
      state.masterCreate.endSlot = Math.max(anchor, slot) + 1;
      updateMasterCreatePreview();
    }

    function finalizeMasterCreate() {
      if (!state.masterCreate.active) return;

      const dayIndex = Number(state.masterCreate.dayIndex);
      const startSlot = Number(state.masterCreate.startSlot);
      const endSlot = Number(state.masterCreate.endSlot);
      const mode = state.masterCreate.mode;

      resetMasterCreateState();

      if (!Number.isInteger(dayIndex) || endSlot <= startSlot) return;
      const date = formatDateInput(addDays(state.weekStart, dayIndex));

      if (mode === 'class') {
        openEventModal({
          date,
          start: slotToTime(startSlot),
          end: slotToTime(endSlot),
          kind: '수강'
        });
        return;
      }

      if (mode === 'personal') {
        openEventModal({
          date,
          start: slotToTime(startSlot),
          end: slotToTime(endSlot),
          kind: '개인작업'
        });
      }
    }

    function resetMasterCreateState() {
      removeMasterCreatePreview();
      state.masterCreate.active = false;
      state.masterCreate.mode = '';
      state.masterCreate.dayIndex = null;
      state.masterCreate.anchorSlot = null;
      state.masterCreate.startSlot = null;
      state.masterCreate.endSlot = null;
      state.masterCreate.overlayEl = null;
      state.masterCreate.previewEl = null;
    }

    function updateMasterCreatePreview() {
      if (!state.masterCreate.active || state.masterCreate.mode !== 'personal') {
        removeMasterCreatePreview();
        return;
      }

      const overlay = state.masterCreate.overlayEl || document.querySelector('#calendar-body .events-overlay');
      if (!overlay) return;

      const dayIndex = Number(state.masterCreate.dayIndex);
      const startSlot = Number(state.masterCreate.startSlot);
      const endSlot = Number(state.masterCreate.endSlot);
      if (!Number.isInteger(dayIndex) || !Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) {
        removeMasterCreatePreview();
        return;
      }

      const date = formatDateInput(addDays(state.weekStart, dayIndex));
      const occupancy = buildDailyOccupancyMap(date);
      const lane = Math.max(0, findLane(occupancy, startSlot, endSlot, 1));

      let bubble = state.masterCreate.previewEl;
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'event-bubble kind-personal master-preview-bubble';
        bubble.innerHTML = '<strong>새 일정</strong>';
        state.masterCreate.previewEl = bubble;
      }

      bubble.style.top = `${startSlot * SLOT_HEIGHT + 1}px`;
      bubble.style.height = `${Math.max(SLOT_HEIGHT - 2, (endSlot - startSlot) * SLOT_HEIGHT - 2)}px`;
      bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
      bubble.style.width = `${((1 / 3) / 7) * 100}%`;

      if (!bubble.parentNode) {
        overlay.appendChild(bubble);
      }
    }

    function removeMasterCreatePreview() {
      const bubble = state.masterCreate.previewEl;
      if (bubble && bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }

    return {
      startMasterCreate,
      moveMasterCreate,
      finalizeMasterCreate,
      resetMasterCreateState,
      updateMasterCreatePreview,
      removeMasterCreatePreview
    };
  }

  return { create };
});

/* master-calendar/schedule-projections.js */
(function initializeMasterCalendarScheduleProjections(root) {
  'use strict';

  const SLOT_MINUTES = 30;

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDaysStandard(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function timeToSlotStandard(value) {
    const parts = String(value || '').split(':').map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return 0;
    return Math.max(0, Math.min(48, Math.floor(((parts[0] * 60) + parts[1]) / SLOT_MINUTES)));
  }

  function addMonthKeepDay(date, diff) {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + diff);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate, deps = {}) {
    const formatDateInput = deps.formatDateInput || formatDate;
    const addMonth = deps.addMonthKeepDay || addMonthKeepDay;
    const anchor = new Date(`${String(startDateStr || '').trim()}T00:00:00`);
    const ref = referenceDate instanceof Date ? new Date(referenceDate) : new Date();

    if (Number.isNaN(anchor.getTime())) {
      const fallbackStart = new Date(ref);
      fallbackStart.setHours(0, 0, 0, 0);
      return {
        start: formatDateInput(fallbackStart),
        end: formatDateInput(addMonth(fallbackStart, 1))
      };
    }

    let cycleStart = new Date(anchor);
    let cycleEnd = addMonth(cycleStart, 1);
    while (ref >= cycleEnd) {
      cycleStart = cycleEnd;
      cycleEnd = addMonth(cycleStart, 1);
    }

    return {
      start: formatDateInput(cycleStart),
      end: formatDateInput(cycleEnd)
    };
  }

  function getPersonalWorkUsageHoursForCycle(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const now = options?.now instanceof Date ? new Date(options.now) : new Date();
    const formatDateInput = options?.formatDateInput || formatDate;
    const addDays = options?.addDays || addDaysStandard;
    const timeToSlot = options?.timeToSlot || timeToSlotStandard;
    const expandOccurrences = options?.expandOccurrences;
    const slotMinutes = Number(options?.slotMinutes ?? SLOT_MINUTES);
    const from = new Date(`${String(options?.cycleStart || '').trim()}T00:00:00`);
    const to = new Date(`${String(options?.cycleEnd || '').trim()}T00:00:00`);
    const todayKey = formatDateInput(now);
    const targetName = String(options?.userName || '').trim();
    const personalKinds = new Set(['개인작업', '강사 지도 하 개인작업']);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !targetName) return 0;

    let total = 0;
    const addOccurrence = (eventItem, dateKey) => {
      const startAt = new Date(`${dateKey}T${String(eventItem?.start || '00:00')}:00`);
      if (Number.isNaN(startAt.getTime())) return;

      const startSlot = timeToSlot(eventItem?.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem?.end));
      const endAt = new Date(new Date(`${dateKey}T00:00:00`).getTime() + (endSlot * slotMinutes * 60 * 1000));
      if (Number.isNaN(endAt.getTime())) return;
      const occurrenceKey = formatDateInput(new Date(`${dateKey}T00:00:00`));
      if (endAt > now && occurrenceKey !== todayKey) return;
      if (startAt < from || startAt >= to) return;

      total += ((endSlot - startSlot) * slotMinutes) / 60;
    };

    const personalEvents = events.filter((eventItem) => {
      const kind = String(eventItem?.kind || '').trim();
      return eventItem
        && personalKinds.has(kind)
        && String(eventItem.title || '').trim() === targetName;
    });
    expandOccurrences({
      events: personalEvents,
      rangeStart: formatDateInput(from),
      rangeEnd: formatDateInput(addDays(to, -1)),
      invalidRepeatEnd: 'ignore',
      maxWeeklyIterations: 520
    }).forEach((occurrence) => {
      const repeatEnd = occurrence.event.repeatEndDate
        ? new Date(`${occurrence.event.repeatEndDate}T00:00:00`)
        : null;
      if (occurrence.event.repeatWeekly && repeatEnd && !Number.isNaN(repeatEnd.getTime())) {
        const occurrenceDate = new Date(`${occurrence.date}T00:00:00`);
        if (occurrenceDate >= repeatEnd) return;
      }
      addOccurrence(occurrence.event, occurrence.date);
    });

    return Math.round(total * 10) / 10;
  }

  function buildClassTeachingLog(options) {
    const events = Array.isArray(options?.events) ? options.events : [];
    const today = options?.now instanceof Date ? new Date(options.now) : new Date();
    const formatDateInput = options?.formatDateInput || formatDate;
    const addDays = options?.addDays || addDaysStandard;
    const expandOccurrences = options?.expandOccurrences;
    const getEventClassMetadataForDate = options?.getEventClassMetadataForDate;
    today.setHours(0, 0, 0, 0);
    const horizon = addDays(today, 365);

    const records = [];
    const seenKeys = new Set();

    const pushOccurrence = (eventItem, occurrenceDate) => {
      const meta = getEventClassMetadataForDate(eventItem, occurrenceDate);
      const key = `${String(eventItem.id || '')}|${occurrenceDate}|${String(eventItem.start || '')}|${String(eventItem.end || '')}|${String(eventItem.title || '')}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      records.push({
        key,
        eventId: String(eventItem.id || ''),
        date: occurrenceDate,
        start: String(eventItem.start || ''),
        end: String(eventItem.end || ''),
        studentName: String(eventItem.title || '').trim(),
        classType: meta.classType,
        instructor: meta.instructor,
        baseRuleId: meta.baseRuleId,
        repeatWeekly: Boolean(eventItem.repeatWeekly)
      });
    };

    const classEvents = events.filter((eventItem) => {
      return eventItem && String(eventItem.kind || '') === '수강';
    });
    const rangeStart = classEvents.reduce((earliest, eventItem) => {
      const startDate = new Date(`${String(eventItem.date || '')}T00:00:00`);
      if (Number.isNaN(startDate.getTime())) return earliest;
      return !earliest || startDate < earliest ? startDate : earliest;
    }, null);
    if (rangeStart) {
      expandOccurrences({
        events: classEvents,
        rangeStart: formatDateInput(rangeStart),
        rangeEnd: formatDateInput(horizon),
        invalidRepeatEnd: 'ignore',
        maxWeeklyIterations: 500
      }).forEach((occurrence) => pushOccurrence(occurrence.event, occurrence.date));
    }

    records.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      const startCompare = String(a.start || '').localeCompare(String(b.start || ''));
      if (startCompare !== 0) return startCompare;
      return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ko');
    });

    return records;
  }

  const api = Object.freeze({
    addMonthKeepDay,
    getPersonalWorkCycleRangeForDate,
    getPersonalWorkUsageHoursForCycle,
    buildClassTeachingLog
  });
  root.MasterCalendarScheduleProjections = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/state-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarStateController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      repository,
      normalizeBaseRule,
      isKilnKind,
      normalizeKilnCategory,
      extractKilnCategoryFromTitle,
      buildKilnEventTitle,
      loadStudioInstructors,
      rebuildClassTeachingLog,
      now,
      random
    } = dependencies;

    function saveState() {
      loadStudioInstructors();
      rebuildClassTeachingLog();
      repository.saveCalendarState({
        events: state.events,
        baseRules: state.baseRules,
        baseRuleTimeline: state.baseRuleTimeline,
        baseWeekOverrides: state.baseWeekOverrides,
        studioUsers: state.studioUsers,
        instructors: state.instructors,
        classTeachingLog: state.classTeachingLog
      });
    }

    function loadState() {
      try {
        const parsed = repository.loadCalendarState();
        state.events = Array.isArray(parsed.events)
          ? parsed.events.map((event) => {
              const kind = String(event?.kind || '').trim();
              const kilnCategory = isKilnKind(kind)
                ? (normalizeKilnCategory(event?.kilnCategory)
                  || extractKilnCategoryFromTitle(event?.title)
                  || '')
                : '';

              return {
                id: String(event?.id || `evt-${now()}-${random().toString(36).slice(2, 8)}`),
                kind,
                title: isKilnKind(kind)
                  ? buildKilnEventTitle(kilnCategory)
                  : String(event?.title || ''),
                kilnCategory,
                date: String(event?.date || ''),
                endDate: String(event?.endDate || ''),
                start: String(event?.start || ''),
                end: String(event?.end || ''),
                capacity: Math.max(1, Math.min(3, Number(event?.capacity || 1))),
                classType: String(event?.classType || '').trim(),
                instructor: String(event?.instructor || '').trim(),
                baseRuleId: String(event?.baseRuleId || '').trim(),
                repeatWeekly: Boolean(event?.repeatWeekly),
                repeatSkipDates: Array.isArray(event?.repeatSkipDates) ? event.repeatSkipDates.slice() : [],
                repeatEndDate: String(event?.repeatEndDate || '')
              };
            })
          : [];
        state.baseRules = Array.isArray(parsed.baseRules)
          ? parsed.baseRules.map((rule) => normalizeBaseRule(rule))
          : [];
        state.baseRuleTimeline = Array.isArray(parsed.baseRuleTimeline)
          ? parsed.baseRuleTimeline
              .map((entry) => ({
                weekKey: String(entry?.weekKey || '').trim(),
                rules: Array.isArray(entry?.rules) ? entry.rules.map((rule) => normalizeBaseRule(rule)) : []
              }))
              .filter((entry) => entry.weekKey)
          : [];
        state.baseWeekOverrides = {};
        if (parsed.baseWeekOverrides && typeof parsed.baseWeekOverrides === 'object') {
          Object.entries(parsed.baseWeekOverrides).forEach(([weekKey, rules]) => {
            if (!Array.isArray(rules)) return;
            state.baseWeekOverrides[weekKey] = rules.map((rule) => normalizeBaseRule(rule));
          });
        }
        state.studioUsers = Array.isArray(parsed.studioUsers) ? parsed.studioUsers : [];
        state.instructors = Array.isArray(parsed.instructors) ? parsed.instructors : [];
        state.classTeachingLog = Array.isArray(parsed.classTeachingLog) ? parsed.classTeachingLog : [];
      } catch (error) {
        state.events = [];
        state.baseRules = [];
        state.baseRuleTimeline = [];
        state.baseWeekOverrides = {};
        state.studioUsers = [];
        state.instructors = [];
        state.classTeachingLog = [];
      }

      loadStudioInstructors();
      rebuildClassTeachingLog();
    }

    return Object.freeze({
      loadState,
      saveState
    });
  }

  return Object.freeze({ create });
});

/* master-calendar/participants-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarParticipantsController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      document,
      repository,
      scheduleProjectionsModule,
      occurrencesModule,
      formatDateInput,
      addDays,
      timeToSlot,
      slotMinutes,
      getActiveStudioUserName,
      getEffectiveSiteAccess,
      getEffectiveStudioRole,
      escapeHtml,
      renderEventSelectorGrid
    } = dependencies;

    function loadStudioUsers() {
      try {
        const rawStudents = repository.loadStudents();
        const studentNames = rawStudents
          .map((student) => String(student?.name || '').trim())
          .filter(Boolean);

        let personalNames = [];
        try {
          const rawPersonal = repository.loadPersonalWorkEntries();
          personalNames = rawPersonal
            .filter((entry) => !entry?.isDormant)
            .map((entry) => String(entry?.userName || '').trim())
            .filter(Boolean);
        } catch (error) {
          personalNames = [];
        }

        state.studioUsers = Array.from(new Set([...studentNames, ...personalNames]))
          .sort((a, b) => a.localeCompare(b, 'ko'));
      } catch (error) {
        state.studioUsers = [];
      }
    }

    function getStudentUsersForEvents() {
      try {
        const rawStudents = repository.loadStudents();
        return Array.from(new Set(
          rawStudents
            .map((student) => String(student?.name || '').trim())
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'ko'));
      } catch (error) {
        return [];
      }
    }

    function getPersonalUsersForEvents() {
      try {
        const rawPersonal = repository.loadPersonalWorkEntries();
        return Array.from(new Set(
          rawPersonal
            .filter((entry) => !entry?.isDormant)
            .map((entry) => String(entry?.userName || '').trim())
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'ko'));
      } catch (error) {
        return [];
      }
    }

    function getActivePersonalWorkEntries() {
      try {
        const rawPersonal = repository.loadPersonalWorkEntries();
        return rawPersonal
          .filter((entry) => !entry?.isDormant)
          .map((entry) => {
            const userName = String(entry?.userName || '').trim();
            const startDate = String(entry?.startDate || '').trim();
            const maxHours = Number(entry?.maxHours || 0);
            if (!userName || !startDate || !Number.isFinite(maxHours) || maxHours <= 0) return null;
            return {
              userName,
              startDate,
              maxHours,
              monthlyFee: Number(entry?.monthlyFee || 0),
              lastPaymentDate: String(entry?.lastPaymentDate || '').trim()
            };
          })
          .filter(Boolean);
      } catch (error) {
        return [];
      }
    }

    function getActivePersonalWorkEntryByUserName(userName) {
      const key = String(userName || '').trim();
      if (!key) return null;
      const entries = getActivePersonalWorkEntries();
      return entries.find((entry) => entry.userName === key) || null;
    }

    function addMonthKeepDay(date, diff) {
      return scheduleProjectionsModule.addMonthKeepDay(date, diff);
    }

    function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate) {
      return scheduleProjectionsModule.getPersonalWorkCycleRangeForDate(
        startDateStr,
        referenceDate,
        { formatDateInput, addMonthKeepDay }
      );
    }

    function getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd) {
      return scheduleProjectionsModule.getPersonalWorkUsageHoursForCycle({
        events: state.events,
        userName,
        cycleStart,
        cycleEnd,
        now: new Date(),
        formatDateInput,
        addDays,
        timeToSlot,
        slotMinutes,
        expandOccurrences(options) {
          return occurrencesModule.expandOccurrences(options);
        }
      });
    }

    function formatHourValue(hours) {
      const rounded = Math.round(Number(hours || 0) * 10) / 10;
      if (Number.isInteger(rounded)) return String(rounded);
      return rounded.toFixed(1);
    }

    function formatWonAmount(value) {
      const raw = Number(value);
      if (!Number.isFinite(raw)) return '-';
      if (raw === 0) return '0원';
      if (raw < 0) return '-';
      const num = Math.round(raw);
      return `${Math.round(num).toLocaleString('ko-KR')}원`;
    }

    function renderMyWorkshopUsagePanel() {
      const panel = document.getElementById('my-workshop-panel');
      if (!panel) return;

      const cycleEl = document.getElementById('my-workshop-cycle');
      const feeEl = document.getElementById('my-workshop-fee');
      const paymentEl = document.getElementById('my-workshop-payment');
      const usedEl = document.getElementById('my-workshop-used');
      const remainEl = document.getElementById('my-workshop-remain');
      if (!cycleEl || !feeEl || !paymentEl || !usedEl || !remainEl) return;

      const me = getActiveStudioUserName();
      const myEntry = getActivePersonalWorkEntryByUserName(me);
      if (!myEntry) {
        panel.hidden = true;
        return;
      }

      const cycle = getPersonalWorkCycleRangeForDate(myEntry.startDate, new Date());
      const usedHours = getPersonalWorkUsageHoursForCycle(me, cycle.start, cycle.end);
      const remainHours = Math.max(0, Math.round((myEntry.maxHours - usedHours) * 10) / 10);

      cycleEl.textContent = `${cycle.start} ~ ${cycle.end}`;
      feeEl.textContent = formatWonAmount(myEntry.monthlyFee);
      paymentEl.textContent = Number(myEntry.monthlyFee || 0) <= 0 ? '-' : (myEntry.lastPaymentDate || '-');
      usedEl.textContent = `${formatHourValue(usedHours)}시간`;
      remainEl.textContent = `${formatHourValue(remainHours)}시간`;
      panel.hidden = false;
    }

    function renderEventPersonalUserInfo() {
      const box = document.getElementById('event-personal-user-info');
      const cycleEl = document.getElementById('event-personal-cycle');
      const hoursEl = document.getElementById('event-personal-hours');
      if (!box || !cycleEl || !hoursEl) return;

      const kind = String(document.getElementById('event-kind')?.value || '').trim();
      const selectedUser = String(document.getElementById('event-user')?.value || '').trim();
      if (kind !== '개인작업' || !selectedUser) {
        box.hidden = true;
        return;
      }

      const entry = getActivePersonalWorkEntryByUserName(selectedUser);
      if (!entry) {
        box.hidden = true;
        return;
      }

      const refDateValue = String(document.getElementById('event-date')?.value || '').trim();
      const refDate = refDateValue ? new Date(`${refDateValue}T00:00:00`) : new Date();
      const cycle = getPersonalWorkCycleRangeForDate(entry.startDate, refDate);
      const usedHours = getPersonalWorkUsageHoursForCycle(selectedUser, cycle.start, cycle.end);
      const remainHours = Math.max(0, Math.round((entry.maxHours - usedHours) * 10) / 10);

      cycleEl.textContent = `${cycle.start} ~ ${cycle.end}`;
      hoursEl.textContent = `사용 ${formatHourValue(usedHours)}시간 / 남은 ${formatHourValue(remainHours)}시간`;
      box.hidden = false;
    }

    function getEventUsersByKind(kind) {
      const normalizedKind = String(kind || '').trim();
      const studentUsers = getStudentUsersForEvents();
      const personalUsers = getPersonalUsersForEvents();

      if (normalizedKind === '수강') {
        return studentUsers;
      }
      if (normalizedKind === '개인작업') {
        return personalUsers;
      }
      if (normalizedKind === '강사 지도 하 개인작업') {
        return Array.from(new Set([...studentUsers, ...personalUsers]))
          .sort((a, b) => a.localeCompare(b, 'ko'));
      }

      return Array.from(new Set([...studentUsers, ...personalUsers]))
        .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function loadStudioInstructors() {
      let fromUsers = [];
      try {
        const parsedUsers = repository.loadUsers();
        fromUsers = parsedUsers
          .filter((user) => {
            if (!user || user.approved === false) return false;
            const access = getEffectiveSiteAccess(user);
            if (access !== 'pottery' && access !== 'both') return false;
            const role = getEffectiveStudioRole(user);
            return role === '강사' || role === '어드민';
          })
          .map((user) => String(user?.name || user?.username || '').trim())
          .filter(Boolean);
      } catch (error) {
        fromUsers = [];
      }

      const fromBaseRules = (state.baseRules || [])
        .filter((rule) => String(rule?.type || '') === '수업시간')
        .map((rule) => String(rule?.instructor || '').trim())
        .filter(Boolean);

      const fromOverrideRules = Object.values(state.baseWeekOverrides || {})
        .flatMap((rules) => (Array.isArray(rules) ? rules : []))
        .filter((rule) => String(rule?.type || '') === '수업시간')
        .map((rule) => String(rule?.instructor || '').trim())
        .filter(Boolean);

      const fromEvents = (state.events || [])
        .filter((event) => String(event?.kind || '') === '수강')
        .map((event) => String(event?.instructor || '').trim())
        .filter(Boolean);

      state.instructors = Array.from(new Set([...fromUsers, ...fromBaseRules, ...fromOverrideRules, ...fromEvents]))
        .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function populateInstructorOptions(selectId, selected) {
      const select = document.getElementById(selectId);
      if (!select) return;

      const current = String(selected || select.value || '').trim();
      const options = ['<option value="">강사 선택</option>'];
      (state.instructors || []).forEach((name) => {
        options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
      });

      select.innerHTML = options.join('');
      if (current) {
        select.value = current;
      }
    }

    function populateEventUserOptions(selected, selectId = 'event-user', forcedKind) {
      const select = document.getElementById(selectId);
      if (!select) return;

      const current = String(selected || select.value || '').trim();
      const kind = String(
        forcedKind
        || (selectId === 'quick-edit-user'
          ? (document.getElementById('quick-edit-kind')?.textContent || '')
          : (document.getElementById('event-kind')?.value || ''))
      ).trim();
      const optionsUsers = getEventUsersByKind(kind);

      const options = ['<option value="">이용자 선택</option>'];
      optionsUsers.forEach((name) => {
        options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
      });
      if (current && !optionsUsers.includes(current)) {
        options.push(`<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>`);
      }
      select.innerHTML = options.join('');

      if (current) {
        select.value = current;
      }
    }

    function handleEventUserSelectChange() {
      renderEventPersonalUserInfo();
      renderEventSelectorGrid();
    }

    function handleQuickEditUserSelectChange() {
      // No-op: quick-edit dropdown is restricted to students managed in 수강생 관리.
    }

    return {
      loadStudioUsers,
      getStudentUsersForEvents,
      getPersonalUsersForEvents,
      getActivePersonalWorkEntries,
      getActivePersonalWorkEntryByUserName,
      addMonthKeepDay,
      getPersonalWorkCycleRangeForDate,
      getPersonalWorkUsageHoursForCycle,
      formatHourValue,
      formatWonAmount,
      renderMyWorkshopUsagePanel,
      renderEventPersonalUserInfo,
      getEventUsersByKind,
      loadStudioInstructors,
      populateInstructorOptions,
      populateEventUserOptions,
      handleEventUserSelectChange,
      handleQuickEditUserSelectChange
    };
  }

  return { create };
});

/* master-calendar/commands.js */
(function initializeMasterCalendarCommands(root) {
  'use strict';

  function invalid(reason) {
    return { ok: false, reason };
  }

  function planEventCreation(draft = {}, policies = {}) {
    const kind = draft.kind;
    const user = draft.user;
    const customTitle = String(draft.customTitle || '').trim();
    const kilnCategory = draft.kilnCategory;
    const isExhibition = policies.isExhibitionKind(kind);
    const isKiln = policies.isKilnKind(kind);
    const isAllDay = policies.isAllDayKind(kind);
    const isOther = kind === '기타';

    if (isOther || isExhibition) {
      if (!customTitle) return invalid('제목을 입력해주세요.');
    } else if (isKiln && !kilnCategory) {
      return invalid('가마 소성 구분을 선택해주세요.');
    } else if (!isAllDay && !user) {
      return invalid('이용자를 선택해주세요.');
    }

    if (isExhibition) {
      if (!draft.rangeStart || !draft.rangeEnd) return invalid('전시회 시작/종료 날짜를 입력해주세요.');
      if (new Date(`${draft.rangeEnd}T00:00:00`) < new Date(`${draft.rangeStart}T00:00:00`)) {
        return invalid('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
      }
    }

    if ((!isExhibition && !draft.date) || (!isAllDay && (!draft.start || !draft.end))) {
      return invalid('날짜와 시간 정보를 모두 입력해주세요.');
    }

    const eventDate = isExhibition ? draft.rangeStart : draft.date;
    const eventEndDate = isExhibition ? draft.rangeEnd : '';
    const normalizedStart = isAllDay ? '00:00' : draft.start;
    const normalizedEnd = isAllDay ? '24:00' : draft.end;
    const effectiveTitle = (isOther || isExhibition)
      ? customTitle
      : (isKiln ? '가마 소성' : user);

    if (policies.isStudioArtist && kind === '개인작업') {
      if (!policies.personalUsers.includes(policies.activeStudioUserName)) {
        return invalid('개인작업 일정은 개인작업 관리에 등록된 이용자만 생성할 수 있습니다. 먼저 개인작업 관리 페이지에 본인을 추가해주세요.');
      }
    }
    if (!policies.canManagePlacement(kind, eventDate, normalizedStart, normalizedEnd, effectiveTitle)) {
      return invalid(policies.roleLockMessage);
    }

    const startSlot = policies.timeToSlot(normalizedStart);
    const endSlot = policies.timeToSlot(normalizedEnd);
    if (endSlot <= startSlot) return invalid('종료 시간은 시작 시간보다 늦어야 합니다.');

    const dayIndex = policies.getDayIndexFromDateString(eventDate);
    if (!policies.isPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
      return invalid('선택한 시간은 현재 일정 종류로 예약할 수 없습니다.');
    }

    const capacity = isAllDay ? 1 : Math.max(1, Math.min(3, Number(draft.capacity || 1)));
    if (!isOther && !isAllDay && !policies.hasCapacity(eventDate, startSlot, endSlot, capacity)) {
      return invalid('선택한 시간대의 남은 자리가 부족합니다.');
    }

    const classRule = kind === '수강'
      ? policies.getClassRule(eventDate, normalizedStart, normalizedEnd)
      : null;
    if (kind === '수강' && !classRule) {
      return invalid('수강 일정은 하나의 수업시간 블록과 정확히 일치해야 합니다.');
    }
    if (draft.weeklyRepeat && !isOther && !isAllDay
      && !policies.isBaseRangeRepeatingWeekly(eventDate, normalizedStart, normalizedEnd)) {
      return invalid('선택한 베이스 블록은 매주 반복되지 않습니다. 매주 반복으로 등록할 수 없습니다.');
    }

    return {
      ok: true,
      event: {
        id: policies.createEventId(),
        kind,
        title: (isOther || isExhibition)
          ? customTitle
          : (isKiln ? policies.buildKilnEventTitle(kilnCategory) : user),
        date: eventDate,
        endDate: eventEndDate,
        start: normalizedStart,
        end: normalizedEnd,
        classType: classRule ? String(classRule.className || '수업시간') : '',
        instructor: classRule ? String(classRule.instructor || '').trim() : '',
        baseRuleId: classRule ? String(classRule.id || '') : '',
        kilnCategory: isKiln ? kilnCategory : '',
        capacity,
        repeatWeekly: Boolean(draft.weeklyRepeat)
      }
    };
  }

  function planPointerEdit(options = {}) {
    const edit = options.edit;
    const event = options.event;
    const target = options.target;
    if (!event || !edit?.validPreview || !target) return { action: 'none' };
    if (!Number.isInteger(target.dayIndex)
      || !Number.isInteger(target.startSlot)
      || !Number.isInteger(target.endSlot)
      || target.endSlot <= target.startSlot) {
      return { action: 'none' };
    }

    const changed = String(options.originalDate || '') !== String(target.date || '')
      || String(options.originalStart || '') !== String(target.start || '')
      || String(options.originalEnd || '') !== String(target.end || '');
    if (changed && event.repeatWeekly && options.viewMode === 'week' && edit.pointerMoved) {
      return {
        action: 'prompt-recurring',
        recurringMove: {
          eventId: String(event.id || ''),
          occurrenceDate: String(edit.occurrenceDate || target.date),
          nextDate: target.date,
          nextStart: target.start,
          nextEnd: target.end,
          nextClassType: String(options.nextClassRule?.className || event.classType || ''),
          nextInstructor: String(options.nextClassRule?.instructor || event.instructor || '').trim(),
          nextBaseRuleId: String(options.nextClassRule?.id || event.baseRuleId || '')
        }
      };
    }

    return {
      action: 'update',
      patch: { date: target.date, start: target.start, end: target.end }
    };
  }

  function planRecurringDelete(options = {}) {
    const event = options.event;
    const occurrenceDate = String(options.occurrenceDate || '');
    if (!event || !occurrenceDate) return { action: 'none' };

    if (options.scope === 'one') {
      const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
      if (!repeatSkipDates.includes(occurrenceDate)) {
        repeatSkipDates.push(occurrenceDate);
        repeatSkipDates.sort();
      }
      return { action: 'update', patch: { repeatSkipDates } };
    }

    const seriesStart = new Date(`${event.date}T00:00:00`);
    const occurrence = new Date(`${occurrenceDate}T00:00:00`);
    if (Number.isNaN(seriesStart.getTime()) || Number.isNaN(occurrence.getTime())) {
      return { action: 'none' };
    }
    if (occurrence <= seriesStart) return { action: 'remove' };

    occurrence.setDate(occurrence.getDate() - 7);
    const repeatEndDate = formatDate(occurrence);
    const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
    return {
      action: 'update',
      patch: {
        repeatEndDate,
        repeatSkipDates: repeatSkipDates.filter((date) => date <= repeatEndDate)
      }
    };
  }

  function planRecurringMove(options = {}) {
    const event = options.event;
    const occurrenceDate = String(options.occurrenceDate || '');
    const nextDate = String(options.nextDate || '');
    const nextStart = String(options.nextStart || '');
    const nextEnd = String(options.nextEnd || '');
    if (!event || !occurrenceDate || !nextDate || !nextStart || !nextEnd) return { action: 'none' };

    const movedFields = {
      date: nextDate,
      start: nextStart,
      end: nextEnd,
      classType: String(options.nextClassType || event.classType || ''),
      instructor: String(options.nextInstructor || event.instructor || '').trim(),
      baseRuleId: String(options.nextBaseRuleId || event.baseRuleId || '')
    };
    if (options.scope === 'one') {
      const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
      if (!repeatSkipDates.includes(occurrenceDate)) {
        repeatSkipDates.push(occurrenceDate);
        repeatSkipDates.sort();
      }
      return {
        action: 'append',
        patch: { repeatSkipDates },
        event: buildMovedEvent(event, movedFields, options.createEventId(), false, '')
      };
    }

    const seriesStart = new Date(`${event.date}T00:00:00`);
    const occurrence = new Date(`${occurrenceDate}T00:00:00`);
    if (Number.isNaN(seriesStart.getTime()) || Number.isNaN(occurrence.getTime())) {
      return { action: 'none' };
    }
    if (occurrence <= seriesStart) {
      const patch = { ...movedFields };
      if (Array.isArray(event.repeatSkipDates)) {
        patch.repeatSkipDates = event.repeatSkipDates.filter((date) => date >= nextDate);
      }
      return { action: 'update', patch };
    }

    occurrence.setDate(occurrence.getDate() - 7);
    const repeatEndDate = formatDate(occurrence);
    const oldSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
    return {
      action: 'split',
      patch: {
        repeatEndDate,
        repeatSkipDates: oldSkipDates.filter((date) => date <= repeatEndDate)
      },
      event: buildMovedEvent(
        event,
        movedFields,
        options.createEventId(),
        true,
        String(event.repeatEndDate || '')
      )
    };
  }

  function buildMovedEvent(event, fields, id, repeatWeekly, repeatEndDate) {
    return {
      id,
      kind: event.kind,
      title: event.title,
      date: fields.date,
      endDate: '',
      start: fields.start,
      end: fields.end,
      classType: fields.classType,
      instructor: fields.instructor,
      baseRuleId: fields.baseRuleId,
      capacity: Math.max(1, Math.min(3, Number(event.capacity || 1))),
      repeatWeekly,
      ...(repeatWeekly ? { repeatEndDate, repeatSkipDates: [] } : {})
    };
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = Object.freeze({
    planEventCreation,
    planPointerEdit,
    planRecurringDelete,
    planRecurringMove
  });
  root.MasterCalendarCommands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* master-calendar/pointer-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarPointerController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      slotsPerDay,
      slotHeight,
      resizeEdgePx,
      canManageEventOccurrence,
      getCalendarZoomFactor,
      getBaseRuleForSlot,
      formatDateInput,
      addDays,
      slotToTime,
      canManageEventPlacementByRole,
      isEventPlacementAllowed,
      buildDailyOccupancyMap,
      occupancy,
      commandPlanner,
      getClassBaseRuleForRange,
      applyClassEventBaseMetadata,
      saveState,
      refreshWorkshopUsageUi,
      openQuickEditEventModal,
      openModal,
      resetMasterCreateState,
      finalizeMasterCreate,
      renderCalendar
    } = dependencies;

    function getMasterPointerDaySlot(clientX, clientY) {
      const pointed = document.elementFromPoint(clientX, clientY);
      const slotEl = pointed && typeof pointed.closest === 'function'
        ? pointed.closest('.day-slot')
        : null;

      if (slotEl) {
        const day = Number(slotEl.dataset.dayIndex);
        const slot = Number(slotEl.dataset.slot);
        if (Number.isInteger(day) && Number.isInteger(slot)) {
          return { day, slot };
        }
      }

      const body = document.getElementById('calendar-body');
      if (!body) return null;
      const rect = body.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
      }

      const totalWidth = rect.width - 64;
      if (totalWidth <= 0) return null;

      const allDayRow = body.querySelector('.calendar-all-day-row');
      const allDayOffset = allDayRow ? allDayRow.offsetHeight : 0;

      const x = clientX - rect.left - 64;
      const y = clientY - rect.top + body.scrollTop - allDayOffset;
      const day = Math.max(0, Math.min(6, Math.floor((x / totalWidth) * 7)));
      const slot = Math.max(0, Math.min(slotsPerDay - 1, Math.floor(y / (slotHeight * getCalendarZoomFactor()))));
      return { day, slot };
    }

    function buildMasterEditOccupancySnapshot(excludeEventId) {
      const snapshot = {};
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(state.weekStart, dayIndex));
        snapshot[date] = occupancy.createEmptyDailyOccupancy(slotsPerDay);
      }

      const bubbles = Array.from(document.querySelectorAll('#calendar-body .events-overlay .event-bubble[data-event-id]'));
      bubbles.forEach((bubble) => {
        const eventId = String(bubble?.dataset?.eventId || '');
        if (!eventId || (excludeEventId && eventId === excludeEventId)) return;

        const date = String(bubble?.dataset?.date || '').trim();
        if (!date || !snapshot[date]) return;

        const startSlot = Number(bubble?.dataset?.startSlot);
        const endSlot = Number(bubble?.dataset?.endSlot);
        const lane = Number(bubble?.dataset?.lane);
        const need = Math.max(1, Math.min(3, Number(bubble?.dataset?.need || 1)));

        if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) return;
        if (!occupancy.canPlaceInLane(snapshot[date], startSlot, endSlot, need, lane)) return;

        occupancy.markLaneOccupancy(snapshot[date], startSlot, endSlot, lane, need);
      });

      return snapshot;
    }

    function getMasterEditOccupancyMap(date) {
      const key = String(date || '').trim();
      const snapshot = state.masterEdit.occupancySnapshot;
      const saved = snapshot && snapshot[key];
      if (saved) {
        return occupancy.cloneDailyOccupancy(saved, slotsPerDay);
      }
      return buildDailyOccupancyMap(key, state.masterEdit.eventId);
    }

    function startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble) {
      if (!event) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!item) return;
      if (!canManageEventOccurrence(item, occurrenceDate)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resetMasterCreateState();

      const edge = item.kind === '수강' ? '' : getMasterEventResizeEdge(event, bubble);
      const pointer = getMasterPointerDaySlot(event.clientX, event.clientY);

      state.masterEdit.active = true;
      state.masterEdit.eventId = item.id;
      state.masterEdit.occurrenceDate = String(occurrenceDate || '');
      state.masterEdit.mode = edge ? 'resize' : 'move';
      state.masterEdit.edge = edge || '';
      state.masterEdit.dayIndex = dayIndex;
      state.masterEdit.startSlot = startSlot;
      state.masterEdit.endSlot = endSlot;
      state.masterEdit.duration = Math.max(1, endSlot - startSlot);
      state.masterEdit.capacity = Math.max(1, Math.min(3, Number(item.capacity || 1)));
      state.masterEdit.originLane = Number.isInteger(lane) ? lane : 0;
      state.masterEdit.kind = String(item.kind || '');
      state.masterEdit.title = String(item.title || '');
      state.masterEdit.repeatWeekly = Boolean(item.repeatWeekly);
      state.masterEdit.anchorOffset = pointer ? Math.max(0, pointer.slot - startSlot) : 0;
      state.masterEdit.pointerDownX = Number(event.clientX || 0);
      state.masterEdit.pointerDownY = Number(event.clientY || 0);
      state.masterEdit.pointerId = event.pointerType === 'touch'
        ? null
        : (Number.isFinite(event.pointerId) ? Number(event.pointerId) : null);
      state.masterEdit.touchIdentifier = event.pointerType === 'touch' && Number.isFinite(event.touchIdentifier)
        ? Number(event.touchIdentifier)
        : null;
      state.masterEdit.pointerMoved = false;
      state.masterEdit.bubbleEl = bubble;
      state.masterEdit.occupancySnapshot = buildMasterEditOccupancySnapshot(item.id);
      state.masterEdit.validPreview = true;
      state.masterEdit.targetDayIndex = dayIndex;
      state.masterEdit.targetStartSlot = startSlot;
      state.masterEdit.targetEndSlot = endSlot;
      state.masterEdit.targetLane = Number.isInteger(lane) ? lane : 0;

      if (bubble) {
        bubble.classList.add('editing');
        if (state.masterEdit.pointerId !== null && typeof bubble.setPointerCapture === 'function') {
          try {
            bubble.setPointerCapture(state.masterEdit.pointerId);
          } catch (_error) {
            // Ignore capture errors for unsupported environments.
          }
        }
      }
      document.body.classList.add('is-dragging-base');
    }

    function getMasterEventResizeEdge(event, bubble) {
      if (!event || !bubble) return '';
      const rect = bubble.getBoundingClientRect();
      const edgePx = event.pointerType === 'touch'
        ? Math.max(resizeEdgePx, 14)
        : resizeEdgePx;
      const y = Number(event.clientY - rect.top);
      if (y <= edgePx) return 'start';
      if (y >= Math.max(0, rect.height - edgePx)) return 'end';
      return '';
    }

    function handleMasterCalendarPointerMove(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.pointerId !== null && Number(event.pointerId) !== state.masterEdit.pointerId) return;
      applyMasterCalendarEditMove(event?.clientX, event?.clientY, event);
    }

    function applyMasterCalendarEditMove(clientX, clientY, sourceEvent) {
      if (!state.masterEdit.active) return;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
      if (sourceEvent && sourceEvent.cancelable) sourceEvent.preventDefault();

      if (
        Math.abs(clientX - state.masterEdit.pointerDownX) > 3
        || Math.abs(clientY - state.masterEdit.pointerDownY) > 3
      ) {
        state.masterEdit.pointerMoved = true;
      }

      const pointer = getMasterPointerDaySlot(clientX, clientY);
      if (!pointer) return;

      let nextDay = state.masterEdit.dayIndex;
      let nextStart = state.masterEdit.startSlot;
      let nextEnd = state.masterEdit.endSlot;

      if (state.masterEdit.mode === 'move') {
        if (state.masterEdit.kind === '수강') {
          const classRule = getBaseRuleForSlot(pointer.day, pointer.slot);
          if (!classRule || classRule.type !== '수업시간') {
            state.masterEdit.validPreview = false;
            return;
          }
          nextDay = pointer.day;
          nextStart = Number(classRule.startSlot);
          nextEnd = Number(classRule.endSlot);
        } else {
          nextDay = pointer.day;
          nextStart = Math.max(0, Math.min(pointer.slot - state.masterEdit.anchorOffset, slotsPerDay - state.masterEdit.duration));
          nextEnd = nextStart + state.masterEdit.duration;
        }
      } else if (state.masterEdit.mode === 'resize') {
        nextDay = state.masterEdit.dayIndex;
        if (state.masterEdit.edge === 'start') {
          nextStart = Math.max(0, Math.min(pointer.slot, state.masterEdit.endSlot - 1));
          nextEnd = state.masterEdit.endSlot;
        } else if (state.masterEdit.edge === 'end') {
          nextStart = state.masterEdit.startSlot;
          nextEnd = Math.min(slotsPerDay, Math.max(pointer.slot + 1, state.masterEdit.startSlot + 1));
        }
      }

      const placement = getMasterEditPlacement(nextDay, nextStart, nextEnd, {
        preferredLane: state.masterEdit.originLane,
        requirePreferredLane: state.masterEdit.mode === 'resize'
      });
      if (!placement) {
        state.masterEdit.validPreview = false;
        return;
      }

      state.masterEdit.validPreview = true;
      state.masterEdit.targetDayIndex = nextDay;
      state.masterEdit.targetStartSlot = nextStart;
      state.masterEdit.targetEndSlot = nextEnd;
      state.masterEdit.targetLane = placement.lane;
      applyMasterEditPreview();
    }

    function getMasterEditPlacement(dayIndex, startSlot, endSlot, options) {
      const kind = state.masterEdit.kind;
      const cap = state.masterEdit.capacity;
      if (!kind || endSlot <= startSlot) return null;

      const date = formatDateInput(addDays(state.weekStart, dayIndex));
      const start = slotToTime(startSlot);
      const end = slotToTime(endSlot);
      if (!canManageEventPlacementByRole(kind, date, start, end, state.masterEdit.title)) return null;
      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) return null;

      const occupancyMap = getMasterEditOccupancyMap(date);
      const preferredLaneRaw = Number(options?.preferredLane);
      const preferredLane = Number.isInteger(preferredLaneRaw) ? preferredLaneRaw : null;
      const requirePreferredLane = Boolean(options?.requirePreferredLane);

      if (preferredLane !== null && occupancy.canPlaceInLane(occupancyMap, startSlot, endSlot, cap, preferredLane)) {
        return { lane: preferredLane };
      }
      if (requirePreferredLane) return null;

      const lane = occupancy.findLane(occupancyMap, startSlot, endSlot, cap);
      if (lane < 0) return null;
      return { lane };
    }

    function applyMasterEditPreview() {
      const bubble = state.masterEdit.bubbleEl;
      if (!bubble || !state.masterEdit.validPreview) return;

      const dayIndex = Number(state.masterEdit.targetDayIndex);
      const startSlot = Number(state.masterEdit.targetStartSlot);
      const endSlot = Number(state.masterEdit.targetEndSlot);
      const lane = Number(state.masterEdit.targetLane || 0);
      const cap = Number(state.masterEdit.capacity || 1);

      bubble.style.top = `${startSlot * slotHeight + 1}px`;
      bubble.style.height = `${Math.max(slotHeight - 2, (endSlot - startSlot) * slotHeight - 2)}px`;
      bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
      bubble.style.width = `${((cap / 3) / 7) * 100}%`;
    }

    function handleMasterCalendarPointerUp(event) {
      if (!event) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.active && state.masterEdit.pointerId !== null && Number(event.pointerId) !== state.masterEdit.pointerId) {
        return;
      }
      finalizeMasterCalendarEdit(event.clientX, event.clientY);
    }

    function finalizeMasterCalendarEdit(clientX, clientY) {
      if (state.masterEdit.active) {
        const edit = state.masterEdit;
        const editEventId = edit.eventId;
        const shouldOpenQuickEdit = Boolean(editEventId) && !edit.pointerMoved;

        if (edit.kind === '수강' && typeof clientX === 'number' && typeof clientY === 'number') {
          const pointer = getMasterPointerDaySlot(clientX, clientY);
          if (pointer) {
            const classRule = getBaseRuleForSlot(pointer.day, pointer.slot);
            if (classRule && classRule.type === '수업시간') {
              const snapStart = Number(classRule.startSlot);
              const snapEnd = Number(classRule.endSlot);
              const placement = getMasterEditPlacement(pointer.day, snapStart, snapEnd, {
                preferredLane: edit.originLane
              });
              if (placement) {
                edit.validPreview = true;
                edit.targetDayIndex = pointer.day;
                edit.targetStartSlot = snapStart;
                edit.targetEndSlot = snapEnd;
                edit.targetLane = placement.lane;
              } else {
                edit.validPreview = false;
              }
            } else {
              edit.validPreview = false;
            }
          }
        }

        const eventItem = state.events.find((item) => item.id === edit.eventId);
        if (eventItem && edit.validPreview) {
          const nextDate = formatDateInput(addDays(state.weekStart, edit.targetDayIndex));
          const nextStart = slotToTime(edit.targetStartSlot);
          const nextEnd = slotToTime(edit.targetEndSlot);
          const nextClassRule = eventItem.kind === '수강'
            ? getClassBaseRuleForRange(nextDate, nextStart, nextEnd)
            : null;
          const plan = commandPlanner.planPointerEdit({
            edit,
            event: eventItem,
            viewMode: state.viewMode,
            originalDate: String(edit.occurrenceDate || formatDateInput(addDays(state.weekStart, edit.dayIndex || 0)) || ''),
            originalStart: slotToTime(Number(edit.startSlot || 0)),
            originalEnd: slotToTime(Number(edit.endSlot || 1)),
            target: {
              dayIndex: edit.targetDayIndex,
              startSlot: edit.targetStartSlot,
              endSlot: edit.targetEndSlot,
              date: nextDate,
              start: nextStart,
              end: nextEnd
            },
            nextClassRule
          });

          if (plan.action === 'prompt-recurring') {
            Object.assign(state.recurringMove, plan.recurringMove);

            resetMasterEditState();
            renderCalendar();
            openModal('recurring-move-modal');
            return;
          }

          if (plan.action === 'update') {
            Object.assign(eventItem, plan.patch);
            applyClassEventBaseMetadata(eventItem, nextDate);
            saveState();
          }
        }

        resetMasterEditState();
        renderCalendar();
        refreshWorkshopUsageUi();

        if (shouldOpenQuickEdit) {
          openQuickEditEventModal(editEventId, edit.occurrenceDate || '');
        }
        return;
      }

      if (state.masterCreate.active) {
        finalizeMasterCreate();
      }
    }

    function handleMasterCalendarPointerCancel(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.pointerId !== null && Number(event?.pointerId) !== state.masterEdit.pointerId) return;
      resetMasterEditState();
      renderCalendar();
    }

    function getTrackedMasterTouch(event) {
      const tracked = state.masterEdit.touchIdentifier;
      if (!Number.isFinite(tracked)) return null;
      const changed = Array.from(event?.changedTouches || []);
      const active = Array.from(event?.touches || []);
      const allTouches = changed.concat(active);
      return allTouches.find((touch) => Number(touch.identifier) === Number(tracked)) || null;
    }

    function handleMasterCalendarTouchMove(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      const touch = getTrackedMasterTouch(event);
      if (!touch) return;
      applyMasterCalendarEditMove(touch.clientX, touch.clientY, event);
    }

    function handleMasterCalendarTouchEnd(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      const touch = getTrackedMasterTouch(event);
      if (touch) {
        finalizeMasterCalendarEdit(touch.clientX, touch.clientY);
        return;
      }
      finalizeMasterCalendarEdit();
    }

    function handleMasterCalendarTouchCancel() {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      resetMasterEditState();
      renderCalendar();
    }

    function resetMasterEditState() {
      const bubble = state.masterEdit.bubbleEl;
      const pointerId = state.masterEdit.pointerId;
      if (bubble) {
        bubble.classList.remove('editing');
        if (pointerId !== null && typeof bubble.hasPointerCapture === 'function' && typeof bubble.releasePointerCapture === 'function') {
          try {
            if (bubble.hasPointerCapture(pointerId)) {
              bubble.releasePointerCapture(pointerId);
            }
          } catch (_error) {
            // Ignore release errors for unsupported environments.
          }
        }
      }
      document.body.classList.remove('is-dragging-base');
      state.masterEdit.active = false;
      state.masterEdit.eventId = null;
      state.masterEdit.occurrenceDate = '';
      state.masterEdit.mode = '';
      state.masterEdit.edge = '';
      state.masterEdit.dayIndex = null;
      state.masterEdit.startSlot = null;
      state.masterEdit.endSlot = null;
      state.masterEdit.duration = 1;
      state.masterEdit.capacity = 1;
      state.masterEdit.originLane = 0;
      state.masterEdit.kind = '';
      state.masterEdit.title = '';
      state.masterEdit.repeatWeekly = false;
      state.masterEdit.anchorOffset = 0;
      state.masterEdit.bubbleEl = null;
      state.masterEdit.occupancySnapshot = null;
      state.masterEdit.validPreview = false;
      state.masterEdit.targetDayIndex = null;
      state.masterEdit.targetStartSlot = null;
      state.masterEdit.targetEndSlot = null;
      state.masterEdit.targetLane = 0;
      state.masterEdit.pointerDownX = 0;
      state.masterEdit.pointerDownY = 0;
      state.masterEdit.pointerId = null;
      state.masterEdit.touchIdentifier = null;
      state.masterEdit.pointerMoved = false;
      state.masterEdit.suppressClickUntil = Date.now() + 220;
    }

    return {
      getMasterPointerDaySlot,
      buildMasterEditOccupancySnapshot,
      getMasterEditOccupancyMap,
      startMasterEventEdit,
      getMasterEventResizeEdge,
      handleMasterCalendarPointerMove,
      applyMasterCalendarEditMove,
      getMasterEditPlacement,
      applyMasterEditPreview,
      handleMasterCalendarPointerUp,
      finalizeMasterCalendarEdit,
      handleMasterCalendarPointerCancel,
      getTrackedMasterTouch,
      handleMasterCalendarTouchMove,
      handleMasterCalendarTouchEnd,
      handleMasterCalendarTouchCancel,
      resetMasterEditState
    };
  }

  return { create };
});

/* master-calendar/modal-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarModalController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      kilnCategoryOptions,
      baseEditorStartSlot,
      eventSelectorRowHeight,
      getWeekStart,
      formatDateInput,
      isStudioArtist,
      isStudioInstructor,
      getActiveStudioUserName,
      setRoleLockedMessage,
      loadStudioUsers,
      populateEventUserOptions,
      syncEventInputMode,
      syncEventSelectionFromInputs,
      clearEventSelectionMoveTimer,
      openModal,
      renderEventSelectorGrid,
      requestAnimationFrame,
      timeToSlot,
      escapeHtml
    } = dependencies;

    function openEventModal(preset) {
      const activeWeekMonday = state.weekStart instanceof Date ? state.weekStart : getWeekStart(new Date());
      const date = preset?.date || formatDateInput(activeWeekMonday);
      const start = preset?.start || '10:00';
      const end = preset?.end || '10:30';
      const presetKind = String(preset?.kind || '').trim();

      const kindSelect = document.getElementById('event-kind');
      const userSelect = document.getElementById('event-user');
      if (kindSelect && !state.eventKindOptionsHtml) {
        state.eventKindOptionsHtml = kindSelect.innerHTML;
      }

      if (kindSelect) {
        if (isStudioArtist()) {
          kindSelect.innerHTML = '<option value="개인작업">개인작업</option>';
        } else if (isStudioInstructor()) {
          kindSelect.innerHTML = [
            '<option value="수강">수강</option>',
            '<option value="개인작업">개인작업</option>',
            '<option value="강사 지도 하 개인작업">강사 지도 하 개인작업</option>'
          ].join('');
        } else if (state.eventKindOptionsHtml) {
          kindSelect.innerHTML = state.eventKindOptionsHtml;
        }
        kindSelect.value = presetKind || (isStudioArtist() ? '개인작업' : '수강');
      }

      document.getElementById('event-user').value = '';
      document.getElementById('event-title').value = '';
      document.getElementById('event-date').value = date;
      document.getElementById('event-range-start').value = date;
      document.getElementById('event-range-end').value = date;
      document.getElementById('event-start').value = start;
      document.getElementById('event-end').value = end;
      document.getElementById('event-capacity').value = '1';
      document.getElementById('event-weekly-repeat').checked = false;
      const kilnCategoryInput = document.getElementById('event-kiln-category');
      if (kilnCategoryInput) kilnCategoryInput.value = kilnCategoryOptions[0];

      resetEventSelectionState();

      loadStudioUsers();
      if (isStudioArtist() && userSelect) {
        const me = getActiveStudioUserName();
        userSelect.innerHTML = me
          ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
          : '<option value="">이용자 선택</option>';
        userSelect.value = me;
        userSelect.disabled = true;
        setRoleLockedMessage(userSelect);
      } else if (userSelect) {
        userSelect.disabled = false;
        userSelect.classList.remove('role-locked');
        userSelect.removeAttribute('data-locked-message');
        userSelect.removeAttribute('aria-disabled');
        populateEventUserOptions();
      }

      if (kindSelect) {
        if (isStudioArtist()) {
          kindSelect.disabled = true;
          setRoleLockedMessage(kindSelect);
        } else {
          kindSelect.disabled = false;
          kindSelect.classList.remove('role-locked');
          kindSelect.removeAttribute('data-locked-message');
          kindSelect.removeAttribute('aria-disabled');
        }
      }

      syncEventInputMode();
      if (preset && preset.date && preset.start && preset.end) {
        syncEventSelectionFromInputs();
      }
      openModal('event-modal');

      renderEventSelectorGrid();
      requestAnimationFrame(() => {
        renderEventSelectorGrid();

        const modalContent = document.querySelector('#event-modal .studio-modal-content');
        if (modalContent) {
          modalContent.scrollTop = 0;
        }

        const selectorRoot = document.getElementById('event-selector-grid');
        if (selectorRoot) {
          const targetSlot = preset && preset.start
            ? Math.max(0, timeToSlot(preset.start) - 2)
            : Math.max(0, baseEditorStartSlot - 1);
          selectorRoot.scrollTop = targetSlot * eventSelectorRowHeight;
        }
      });
    }

    function resetEventSelectionState() {
      state.eventSelection.active = false;
      state.eventSelection.dragging = false;
      state.eventSelection.mode = '';
      state.eventSelection.dayIndex = null;
      state.eventSelection.startSlot = null;
      state.eventSelection.endSlot = null;
      state.eventSelection.anchorSlot = null;
      state.eventSelection.resizeEdge = '';
      state.eventSelection.moveDuration = 1;
      clearEventSelectionMoveTimer();
    }

    return {
      openEventModal,
      resetEventSelectionState
    };
  }

  return { create };
});

/* master-calendar/event-modal-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarEventModalController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      modalController,
      commandPlanner,
      slotsPerDay,
      baseResizeEdgePx,
      eventSelectorRowHeight,
      eventSelectorTimeColWidth,
      holdToMoveMs,
      dayNames,
      kilnCategoryOptions,
      roleLockMessage,
      isStudioArtist,
      getActiveStudioUserName,
      setRoleLockedMessage,
      populateEventUserOptions,
      renderEventPersonalUserInfo,
      isAllDayKind,
      isKilnKind,
      isExhibitionKind,
      normalizeKilnCategory,
      buildKilnEventTitle,
      canManageEventPlacementByRole,
      getPersonalUsersForEvents,
      getClassBaseRuleForRange,
      getDayIndexFromDateString,
      isBaseRangeRepeatingWeekly,
      isEventPlacementAllowed,
      getBaseRuleForSlot,
      getRulesForWeek,
      getBaseLabelText,
      baseTypeToClass,
      buildDailyOccupancyMap,
      hasEnoughCapacityForRange,
      getEventsForDate,
      findLane,
      getEventDisplayTitle,
      kindToClass,
      getWeekStart,
      addDays,
      formatDateInput,
      formatMonthDate,
      timeToSlot,
      slotToTime,
      escapeHtml,
      saveState,
      renderCalendar,
      refreshWorkshopUsageUi,
      closeModal,
      alert,
      setTimeout,
      clearTimeout
    } = dependencies;

    function openEventModal(preset) {
      modalController.openEventModal(preset);
    }

    function resetEventSelectionState() {
      modalController.resetEventSelectionState();
    }

    function saveEventFromModal() {
      const draft = {
        kind: document.getElementById('event-kind').value,
        user: document.getElementById('event-user').value,
        customTitle: document.getElementById('event-title')?.value || '',
        kilnCategory: normalizeKilnCategory(document.getElementById('event-kiln-category')?.value || ''),
        date: document.getElementById('event-date').value,
        rangeStart: document.getElementById('event-range-start')?.value || '',
        rangeEnd: document.getElementById('event-range-end')?.value || '',
        start: document.getElementById('event-start').value,
        end: document.getElementById('event-end').value,
        weeklyRepeat: Boolean(document.getElementById('event-weekly-repeat').checked),
        capacity: document.getElementById('event-capacity').value || 1
      };
      const studioArtist = isStudioArtist();
      const result = commandPlanner.planEventCreation(draft, {
        activeStudioUserName: getActiveStudioUserName(),
        buildKilnEventTitle,
        canManagePlacement: canManageEventPlacementByRole,
        createEventId: () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        getClassRule: getClassBaseRuleForRange,
        getDayIndexFromDateString,
        hasCapacity(eventDate, startSlot, endSlot, capacity) {
          return hasEnoughCapacityForRange(buildDailyOccupancyMap(eventDate), startSlot, endSlot, capacity);
        },
        isAllDayKind,
        isBaseRangeRepeatingWeekly,
        isExhibitionKind,
        isKilnKind,
        isPlacementAllowed: isEventPlacementAllowed,
        isStudioArtist: studioArtist,
        personalUsers: studioArtist && draft.kind === '개인작업' ? getPersonalUsersForEvents() : [],
        roleLockMessage,
        timeToSlot
      });
      if (!result.ok) {
        alert(result.reason);
        return;
      }

      state.events.push(result.event);
      saveState();
      closeModal('event-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    function syncEventInputMode() {
      const kind = document.getElementById('event-kind')?.value || '';
      const disableManual = kind === '수강' || kind === '강사 지도 하 개인작업' || isAllDayKind(kind);
      const startInput = document.getElementById('event-start');
      const endInput = document.getElementById('event-end');
      const row = document.getElementById('event-time-row');
      const hint = document.getElementById('event-selector-hint');
      const userRow = document.getElementById('event-user-row');
      const titleRow = document.getElementById('event-title-row');
      const dateWrap = document.getElementById('event-date-wrap');
      const rangeRow = document.getElementById('event-range-row');
      const kilnCategoryRow = document.getElementById('event-kiln-category-row');
      const repeatRow = document.getElementById('event-weekly-repeat')?.closest('.checkbox-row');
      const capacityWrap = document.getElementById('event-capacity-wrap');
      const capacitySelect = document.getElementById('event-capacity');
      const userInput = document.getElementById('event-user');
      const titleInput = document.getElementById('event-title');
      const isOther = kind === '기타';
      const isKiln = isKilnKind(kind);
      const isExhibition = isExhibitionKind(kind);

      if (userRow) userRow.style.display = (isOther || isKiln || isExhibition) ? 'none' : '';
      if (titleRow) titleRow.style.display = (isOther || isExhibition) ? '' : 'none';
      if (kilnCategoryRow) kilnCategoryRow.style.display = isKiln ? '' : 'none';
      if (dateWrap) dateWrap.style.display = isExhibition ? 'none' : '';
      if (rangeRow) rangeRow.style.display = isExhibition ? '' : 'none';
      if (repeatRow) repeatRow.style.display = (isKiln || isExhibition) ? 'none' : '';
      if (capacityWrap) capacityWrap.style.display = (isKiln || isExhibition) ? 'none' : '';
      if (userInput) userInput.disabled = isOther || isKiln || isExhibition;
      if (titleInput) titleInput.disabled = !(isOther || isExhibition);
      if (capacitySelect) {
        capacitySelect.disabled = isKiln || isExhibition;
        if (isKiln || isExhibition) capacitySelect.value = '1';
      }

      if (startInput) startInput.disabled = disableManual;
      if (endInput) endInput.disabled = disableManual;
      if (row) row.classList.toggle('disabled', disableManual);

      if (isAllDayKind(kind)) {
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        resetEventSelectionState();
      }

      if (hint) {
        if (kind === '수강') {
          hint.textContent = '수강: 수업시간(초록) 블록만 선택할 수 있습니다. 블록을 클릭해 선택하세요.';
        } else if (kind === '개인작업') {
          hint.textContent = '개인작업: 개인작업 시간(파랑) 범위만 드래그로 선택할 수 있습니다.';
        } else if (isExhibitionKind(kind)) {
          hint.textContent = '전시회: 종일 일정으로 시작/종료 날짜를 지정하면 상단 고정 영역에 기간으로 표시됩니다.';
        } else if (isKilnKind(kind)) {
          hint.textContent = '가마 소성: 종일 일정으로만 등록되며, 상단 고정 영역에 표시됩니다.';
        } else if (kind === '기타') {
          hint.textContent = '기타: 위치/길이 제한 없이 어디든 자유롭게 선택할 수 있으며, 겹칠 경우 다른 일정 위에 표시됩니다.';
        } else {
          hint.textContent = '강사 지도 하 개인작업: 수업시간(초록) 범위에서만 선택 가능하며, 모든 슬롯에 자리가 남아 있어야 합니다.';
        }
      }

      if (isStudioArtist()) {
        if (kind !== '개인작업') {
          const kindSelect = document.getElementById('event-kind');
          if (kindSelect) kindSelect.value = '개인작업';
        }
        if (userInput) {
          const me = getActiveStudioUserName();
          userInput.innerHTML = me
            ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
            : '<option value="">이용자 선택</option>';
          userInput.value = me;
          userInput.disabled = true;
          setRoleLockedMessage(userInput);
        }
      } else if (userInput) {
        const previous = String(userInput.value || '').trim();
        populateEventUserOptions(previous, 'event-user', kind);
      }

      renderEventPersonalUserInfo();
    }

    function syncEventSelectionFromInputs() {
      const date = document.getElementById('event-date')?.value;
      const start = document.getElementById('event-start')?.value;
      const end = document.getElementById('event-end')?.value;
      if (!date || !start || !end) return;

      const dayIndex = getDayIndexFromDateString(date);
      const startSlot = timeToSlot(start);
      const endSlot = timeToSlot(end);
      if (dayIndex < 0 || endSlot <= startSlot) return;

      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = startSlot;
      state.eventSelection.endSlot = endSlot;
    }

    function renderEventSelectorGrid() {
      const root = document.getElementById('event-selector-grid');
      if (!root) return;

      const date = document.getElementById('event-date')?.value;
      const kind = document.getElementById('event-kind')?.value;
      if (!date || !kind) {
        root.innerHTML = '';
        return;
      }

      if (isAllDayKind(kind)) {
        root.innerHTML = '';
        return;
      }

      const weekStart = getEventSelectorWeekStartDate();
      if (!weekStart) {
        root.innerHTML = '';
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'base-grid-inner event-selector-inner';

      const timeHeader = document.createElement('div');
      timeHeader.className = 'base-time base-head-cell';
      timeHeader.textContent = '시간';
      grid.appendChild(timeHeader);

      const occupancyByDay = {};
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const headerDate = addDays(weekStart, dayIndex);
        const headerDateStr = formatDateInput(headerDate);
        const dayHeader = document.createElement('div');
        dayHeader.className = 'base-time base-head-cell';
        dayHeader.textContent = `${dayNames[dayIndex]} (${formatMonthDate(headerDate)})`;
        grid.appendChild(dayHeader);
        occupancyByDay[dayIndex] = buildDailyOccupancyMap(headerDateStr);
      }

      for (let slot = 0; slot < slotsPerDay; slot += 1) {
        const timeCell = document.createElement('div');
        timeCell.className = 'base-time';
        timeCell.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        grid.appendChild(timeCell);

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
          const dayDate = formatDateInput(addDays(weekStart, dayIndex));
          const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
          const cell = document.createElement('div');
          cell.className = `base-cell event-select-cell ${baseTypeToClass(rule ? rule.type : '')}`;
          cell.dataset.slot = String(slot);
          cell.dataset.day = String(dayIndex);
          cell.dataset.date = dayDate;
          if (rule && rule.id) cell.dataset.ruleId = String(rule.id);

          let isBlockStart = false;
          if (rule) {
            const previousRule = slot > 0 ? getBaseRuleForSlot(dayIndex, slot - 1, weekStart) : null;
            const nextRule = slot < slotsPerDay - 1 ? getBaseRuleForSlot(dayIndex, slot + 1, weekStart) : null;
            const isStart = !previousRule || previousRule.id !== rule.id;
            const isEnd = !nextRule || nextRule.id !== rule.id;

            if (isStart) cell.classList.add('base-block-start');
            if (isEnd) cell.classList.add('base-block-end');
            if (!isStart) cell.classList.add('base-block-continued');
            if (!isStart && !isEnd) cell.classList.add('base-block-middle');
            isBlockStart = isStart;

            if (isStart) {
              const label = document.createElement('span');
              label.className = 'base-cell-label';
              label.textContent = getBaseLabelText(rule);
              cell.appendChild(label);
            }
          }

          const dayOccupancy = occupancyByDay[dayIndex] || Array.from({ length: slotsPerDay }, () => [false, false, false]);
          const ruleType = String(rule?.type || '');
          const isBluePersonal = ruleType.includes('개인작업');
          const isGreenClass = ruleType === '수업시간';

          if (isBluePersonal) {
            const used = dayOccupancy[slot].filter(Boolean).length;
            const capacity = document.createElement('span');
            capacity.className = 'event-slot-capacity';
            capacity.textContent = `${used}/3`;
            cell.appendChild(capacity);
          } else if (isGreenClass && isBlockStart) {
            const capacity = document.createElement('span');
            capacity.className = 'event-slot-capacity block-capacity';
            capacity.textContent = getBlockCapacityLabel(rule, dayOccupancy);
            cell.appendChild(capacity);
          }

          cell.addEventListener('mousedown', (event) => startEventSelection(event, dayIndex, slot));
          cell.addEventListener('mouseenter', () => moveEventSelection(dayIndex, slot));
          cell.addEventListener('mouseup', () => endEventSelection(dayIndex, slot));

          grid.appendChild(cell);
        }
      }

      root.innerHTML = '';
      const stage = document.createElement('div');
      stage.className = 'event-selector-stage';
      stage.appendChild(grid);
      root.appendChild(stage);
      renderEventSelectorBubbles(stage, grid, weekStart);
    }

    function renderEventSelectorBubbles(stage, grid, weekStart) {
      if (!stage || !grid || !weekStart) return;

      const kind = document.getElementById('event-kind')?.value || '';
      const user = document.getElementById('event-user')?.value || '';
      const inputTitle = String(document.getElementById('event-title')?.value || '').trim();
      const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
      const overlay = document.createElement('div');
      overlay.className = 'event-selector-overlay';

      const gridWidth = grid.getBoundingClientRect().width;
      if (!gridWidth) {
        stage.appendChild(overlay);
        return;
      }
      const dayWidth = Math.max(0, (gridWidth - eventSelectorTimeColWidth) / 7);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(weekStart, dayIndex));
        const dayEvents = getEventsForDate(date)
          .slice()
          .sort((first, second) => timeToSlot(first.start) - timeToSlot(second.start));
        const occupancy = Array.from({ length: slotsPerDay }, () => [false, false, false]);
        const layouts = [];

        dayEvents.forEach((eventItem) => {
          if (!eventItem || isAllDayKind(eventItem.kind)) return;
          const startSlot = timeToSlot(eventItem.start);
          const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem.end));
          const isOther = eventItem.kind === '기타';
          const need = isOther ? 3 : Math.max(1, Math.min(3, Number(eventItem.capacity || 1)));
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane < 0) return;

          if (!isOther) {
            for (let slot = startSlot; slot < endSlot; slot += 1) {
              for (let laneIndex = lane; laneIndex < lane + need; laneIndex += 1) {
                occupancy[slot][laneIndex] = true;
              }
            }
          }

          layouts.push({
            kind: eventItem.kind,
            title: getEventDisplayTitle(eventItem, '제목 없음'),
            start: eventItem.start,
            end: eventItem.end,
            startSlot,
            endSlot,
            lane,
            need,
            preview: false
          });
        });

        if (
          state.eventSelection.active
          && state.eventSelection.dayIndex === dayIndex
          && state.eventSelection.startSlot != null
          && state.eventSelection.endSlot != null
          && kind
        ) {
          const startSlot = Number(state.eventSelection.startSlot);
          const endSlot = Number(state.eventSelection.endSlot);
          const isOther = kind === '기타';
          const need = isOther ? 3 : capacity;
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane >= 0) {
            layouts.push({
              kind,
              title: kind === '기타'
                ? (inputTitle || '새 일정')
                : (isKilnKind(kind)
                  ? buildKilnEventTitle(normalizeKilnCategory(document.getElementById('event-kiln-category')?.value || '') || kilnCategoryOptions[0])
                  : (user || '새 일정')),
              start: slotToTime(startSlot),
              end: slotToTime(endSlot),
              startSlot,
              endSlot,
              lane,
              need,
              preview: true
            });
          }
        }

        layouts.forEach((item) => {
          const bubble = document.createElement('div');
          bubble.className = `event-bubble event-selector-bubble ${kindToClass(item.kind)}${item.preview ? ' is-preview' : ''}`;
          bubble.style.top = `${eventSelectorRowHeight + item.startSlot * eventSelectorRowHeight + 1}px`;
          bubble.style.height = `${Math.max(eventSelectorRowHeight - 2, (item.endSlot - item.startSlot) * eventSelectorRowHeight - 2)}px`;
          bubble.style.left = `${eventSelectorTimeColWidth + dayIndex * dayWidth + (item.lane * (dayWidth / 3)) + 1}px`;
          bubble.style.width = `${Math.max(10, (item.need * (dayWidth / 3)) - 2)}px`;
          bubble.innerHTML = `<strong>${escapeHtml(item.title || '이용자 없음')}</strong>`;
          overlay.appendChild(bubble);
        });
      }

      stage.appendChild(overlay);
    }

    function startEventSelection(event, dayIndex, slot) {
      if (event) event.preventDefault();

      const kind = document.getElementById('event-kind')?.value;
      const date = getEventSelectorDateForDay(dayIndex);
      if (!kind || !date) return;

      const isInsideCurrent = state.eventSelection.active
        && state.eventSelection.dayIndex === dayIndex
        && slot >= state.eventSelection.startSlot
        && slot < state.eventSelection.endSlot;

      if (isInsideCurrent && kind !== '수강') {
        const edge = getEventSelectionResizeEdge(event, dayIndex, slot);
        if (edge) {
          state.eventSelection.dragging = true;
          state.eventSelection.mode = 'resize';
          state.eventSelection.resizeEdge = edge;
          state.eventSelection.anchorSlot = edge === 'start'
            ? state.eventSelection.endSlot
            : state.eventSelection.startSlot;
          return;
        }

        state.eventSelection.anchorSlot = slot;
        state.eventSelection.moveDuration = Math.max(1, state.eventSelection.endSlot - state.eventSelection.startSlot);
        clearEventSelectionMoveTimer();
        state.eventSelection.moveTimerId = setTimeout(() => {
          state.eventSelection.dragging = true;
          state.eventSelection.mode = 'move';
        }, holdToMoveMs);
        return;
      }

      const selectorWeekStart = getEventSelectorWeekStartDate() || state.weekStart;
      const cellRule = getBaseRuleForSlot(dayIndex, slot, selectorWeekStart);
      if (kind === '수강') {
        if (!cellRule || cellRule.type !== '수업시간') return;
        if (!isEventPlacementAllowed(kind, dayIndex, cellRule.startSlot, cellRule.endSlot)) return;

        const occupancy = buildDailyOccupancyMap(date);
        const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
        if (!hasEnoughCapacityForRange(occupancy, cellRule.startSlot, cellRule.endSlot, capacity)) {
          alert('선택한 수업시간 블록은 남은 자리가 부족합니다.');
          return;
        }

        applyEventSelection(dayIndex, cellRule.startSlot, cellRule.endSlot);
        renderEventSelectorGrid();
        return;
      }

      state.eventSelection.dragging = true;
      state.eventSelection.mode = 'create';
      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = slot;
      state.eventSelection.endSlot = slot + 1;
      state.eventSelection.anchorSlot = slot;
      renderEventSelectorGrid();
    }

    function moveEventSelection(dayIndex, slot) {
      if (state.eventSelection.mode === 'move' && state.eventSelection.dragging) {
        const duration = Math.max(1, state.eventSelection.moveDuration);
        const start = Math.max(0, Math.min(slot, slotsPerDay - duration));
        const end = start + duration;
        applyEventSelection(dayIndex, start, end, true);
        renderEventSelectorGrid();
        return;
      }

      if (state.eventSelection.mode === 'resize' && state.eventSelection.dragging) {
        const base = state.eventSelection.anchorSlot;
        const start = state.eventSelection.resizeEdge === 'start'
          ? Math.min(slot, base - 1)
          : base;
        const end = state.eventSelection.resizeEdge === 'start'
          ? base
          : Math.max(base + 1, slot + 1);
        applyEventSelection(dayIndex, Math.max(0, start), Math.min(slotsPerDay, end), true);
        renderEventSelectorGrid();
        return;
      }

      if (!state.eventSelection.dragging) return;
      if (state.eventSelection.dayIndex !== dayIndex) return;
      if (state.eventSelection.mode !== 'create') return;

      const start = Math.min(state.eventSelection.startSlot, slot);
      const end = Math.max(state.eventSelection.startSlot, slot) + 1;
      applyEventSelection(dayIndex, start, end, true);
      renderEventSelectorGrid();
    }

    function endEventSelection(dayIndex, slot) {
      const wasDragging = state.eventSelection.dragging;
      const mode = state.eventSelection.mode;
      clearEventSelectionMoveTimer();

      if (!wasDragging) {
        state.eventSelection.mode = '';
        return;
      }

      state.eventSelection.dragging = false;
      state.eventSelection.mode = '';

      let start = state.eventSelection.startSlot;
      let end = state.eventSelection.endSlot;

      if (mode === 'create') {
        start = Math.min(state.eventSelection.startSlot, slot);
        end = Math.max(state.eventSelection.startSlot, slot) + 1;
      } else if (mode === 'move') {
        const duration = Math.max(1, state.eventSelection.moveDuration);
        start = Math.max(0, Math.min(slot, slotsPerDay - duration));
        end = start + duration;
      } else if (mode === 'resize') {
        const base = state.eventSelection.anchorSlot;
        start = state.eventSelection.resizeEdge === 'start'
          ? Math.min(slot, base - 1)
          : base;
        end = state.eventSelection.resizeEdge === 'start'
          ? base
          : Math.max(base + 1, slot + 1);
        start = Math.max(0, start);
        end = Math.min(slotsPerDay, end);
      }

      const ok = applyEventSelection(dayIndex, start, end, false);
      if (!ok) {
        state.eventSelection.active = false;
        state.eventSelection.startSlot = null;
        state.eventSelection.endSlot = null;
      }
      renderEventSelectorGrid();
    }

    function clearEventSelectionMoveTimer() {
      if (state.eventSelection.moveTimerId) {
        clearTimeout(state.eventSelection.moveTimerId);
        state.eventSelection.moveTimerId = null;
      }
    }

    function getEventSelectionResizeEdge(event, dayIndex, slot) {
      if (!event || !state.eventSelection.active) return '';
      if (state.eventSelection.dayIndex !== dayIndex) return '';
      const cell = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('.event-select-cell')
        : null;
      if (!cell) return '';

      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      if (slot === state.eventSelection.startSlot && y <= baseResizeEdgePx) {
        return 'start';
      }
      if (slot === state.eventSelection.endSlot - 1 && y >= Math.max(0, rect.height - baseResizeEdgePx)) {
        return 'end';
      }
      return '';
    }

    function applyEventSelection(dayIndex, startSlot, endSlot, silent) {
      const kind = document.getElementById('event-kind')?.value;
      const date = getEventSelectorDateForDay(dayIndex);
      const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
      if (!kind || !date) return false;

      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
        if (!silent) alert('선택한 일정 종류로는 해당 구간을 선택할 수 없습니다.');
        return false;
      }

      if (kind !== '기타' && !isAllDayKind(kind)) {
        const occupancy = buildDailyOccupancyMap(date);
        if (!hasEnoughCapacityForRange(occupancy, startSlot, endSlot, capacity)) {
          if (!silent) alert('선택한 구간에 남은 자리가 부족합니다.');
          return false;
        }
      }

      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = startSlot;
      state.eventSelection.endSlot = endSlot;

      document.getElementById('event-date').value = date;
      document.getElementById('event-start').value = slotToTime(startSlot);
      document.getElementById('event-end').value = slotToTime(endSlot);
      return true;
    }

    function getEventSelectorWeekStartDate() {
      const date = document.getElementById('event-date')?.value;
      if (!date) return null;
      const parsedDate = new Date(`${date}T00:00:00`);
      if (Number.isNaN(parsedDate.getTime())) return null;
      return getWeekStart(parsedDate);
    }

    function getEventSelectorDateForDay(dayIndex) {
      const weekStart = getEventSelectorWeekStartDate();
      if (!weekStart) return '';
      return formatDateInput(addDays(weekStart, dayIndex));
    }

    function getBlockCapacityLabel(rule, dayOccupancy) {
      if (!rule || !dayOccupancy) return '0/3';
      let maxUsed = 0;
      for (let slot = Number(rule.startSlot); slot < Number(rule.endSlot); slot += 1) {
        const used = (dayOccupancy[slot] || []).filter(Boolean).length;
        if (used > maxUsed) maxUsed = used;
      }
      return `${maxUsed}/3`;
    }

    function handleEventSelectorHoverCursor(event) {
      if (state.eventSelection.dragging) return;

      clearEventSelectorHoverCursor();
      const target = event && event.target ? event.target : null;
      const cell = target && typeof target.closest === 'function' ? target.closest('.event-select-cell') : null;
      if (!cell || !state.eventSelection.active) return;

      const slot = Number(cell.dataset.slot);
      const day = Number(cell.dataset.day);
      if (!Number.isInteger(slot) || !Number.isInteger(day)) return;
      if (day !== state.eventSelection.dayIndex) return;

      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      if (slot === state.eventSelection.startSlot && y <= baseResizeEdgePx) {
        cell.classList.add('event-edge-resize-top');
      } else if (slot === state.eventSelection.endSlot - 1 && y >= Math.max(0, rect.height - baseResizeEdgePx)) {
        cell.classList.add('event-edge-resize-bottom');
      }
    }

    function clearEventSelectorHoverCursor() {
      document.querySelectorAll('.event-select-cell.event-edge-resize-top, .event-select-cell.event-edge-resize-bottom').forEach((cell) => {
        cell.classList.remove('event-edge-resize-top', 'event-edge-resize-bottom');
      });
    }

    return {
      openEventModal,
      resetEventSelectionState,
      saveEventFromModal,
      syncEventInputMode,
      syncEventSelectionFromInputs,
      renderEventSelectorGrid,
      renderEventSelectorBubbles,
      startEventSelection,
      moveEventSelection,
      endEventSelection,
      clearEventSelectionMoveTimer,
      getEventSelectionResizeEdge,
      applyEventSelection,
      getEventSelectorWeekStartDate,
      getEventSelectorDateForDay,
      getBlockCapacityLabel,
      handleEventSelectorHoverCursor,
      clearEventSelectorHoverCursor
    };
  }

  return { create };
});

/* master-calendar/recurring-event-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarRecurringEventController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      commandPlanner,
      canManageEventOccurrence,
      openModal,
      closeModal,
      saveState,
      renderCalendar,
      refreshWorkshopUsageUi,
      applyClassEventBaseMetadata,
      createEventId
    } = dependencies;

    function requestDeleteEvent(eventId, occurrenceDate) {
      const eventItem = state.events.find((item) => item && item.id === eventId);
      if (!eventItem) return;
      if (!canManageEventOccurrence(eventItem, occurrenceDate || eventItem.date || '')) {
        return;
      }

      if (eventItem.repeatWeekly && state.viewMode === 'week' && occurrenceDate) {
        state.recurringDelete.eventId = String(eventId);
        state.recurringDelete.occurrenceDate = String(occurrenceDate);
        openModal('recurring-delete-modal');
        return;
      }

      state.deleteConfirm.eventId = String(eventId);
      openModal('delete-confirm-modal');
    }

    function handleDeleteConfirmOk() {
      const eventId = String(state.deleteConfirm.eventId || '');
      if (!eventId) {
        closeModal('delete-confirm-modal');
        return;
      }

      state.events = state.events.filter((item) => item.id !== eventId);
      state.deleteConfirm.eventId = '';
      saveState();
      closeModal('delete-confirm-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    function handleDeleteRecurringOne() {
      applyRecurringDeletePlan('one');
    }

    function handleDeleteRecurringFollowing() {
      const eventId = String(state.recurringDelete.eventId || '');
      const occurrenceDate = String(state.recurringDelete.occurrenceDate || '');
      const eventItem = state.events.find((item) => item && item.id === eventId);
      const plan = commandPlanner.planRecurringDelete({
        scope: 'following', event: eventItem, occurrenceDate
      });
      finishRecurringDeletePlan(plan, eventId, eventItem);
    }

    function applyRecurringDeletePlan(scope) {
      const eventId = String(state.recurringDelete.eventId || '');
      const occurrenceDate = String(state.recurringDelete.occurrenceDate || '');
      const eventItem = state.events.find((item) => item && item.id === eventId);
      const plan = commandPlanner.planRecurringDelete({ scope, event: eventItem, occurrenceDate });
      finishRecurringDeletePlan(plan, eventId, eventItem);
    }

    function finishRecurringDeletePlan(plan, eventId, eventItem) {
      if (plan.action === 'none') {
        closeModal('recurring-delete-modal');
        return;
      }
      if (plan.action === 'remove') state.events = state.events.filter((item) => item.id !== eventId);
      else Object.assign(eventItem, plan.patch);

      saveState();
      closeModal('recurring-delete-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    function handleMoveRecurringOne() {
      applyRecurringMovePlan('one');
    }

    function handleMoveRecurringFollowing() {
      applyRecurringMovePlan('following');
    }

    function applyRecurringMovePlan(scope) {
      const eventId = String(state.recurringMove.eventId || '');
      const occurrenceDate = String(state.recurringMove.occurrenceDate || '');
      const nextDate = String(state.recurringMove.nextDate || '');
      const nextStart = String(state.recurringMove.nextStart || '');
      const nextEnd = String(state.recurringMove.nextEnd || '');
      const eventItem = state.events.find((item) => item && item.id === eventId);
      const nextClassType = String(state.recurringMove.nextClassType || eventItem?.classType || '');
      const nextInstructor = String(state.recurringMove.nextInstructor || eventItem?.instructor || '').trim();
      const nextBaseRuleId = String(state.recurringMove.nextBaseRuleId || eventItem?.baseRuleId || '');
      const plan = commandPlanner.planRecurringMove({
        scope,
        event: eventItem,
        occurrenceDate,
        nextDate,
        nextStart,
        nextEnd,
        nextClassType,
        nextInstructor,
        nextBaseRuleId,
        createEventId
      });
      if (plan.action === 'none') {
        resetRecurringMoveState();
        closeModal('recurring-move-modal');
        return;
      }
      Object.assign(eventItem, plan.patch);
      const movedEvent = plan.event;
      if (movedEvent) state.events.push(movedEvent);
      applyClassEventBaseMetadata(movedEvent || eventItem, nextDate);

      saveState();
      resetRecurringMoveState();
      closeModal('recurring-move-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    function resetRecurringMoveState() {
      state.recurringMove.eventId = '';
      state.recurringMove.occurrenceDate = '';
      state.recurringMove.nextDate = '';
      state.recurringMove.nextStart = '';
      state.recurringMove.nextEnd = '';
      state.recurringMove.nextClassType = '';
      state.recurringMove.nextInstructor = '';
      state.recurringMove.nextBaseRuleId = '';
    }

    return {
      requestDeleteEvent,
      handleDeleteConfirmOk,
      handleDeleteRecurringOne,
      handleDeleteRecurringFollowing,
      applyRecurringDeletePlan,
      finishRecurringDeletePlan,
      handleMoveRecurringOne,
      handleMoveRecurringFollowing,
      applyRecurringMovePlan,
      resetRecurringMoveState
    };
  }

  return { create };
});

/* master-calendar/navigation-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarNavigationController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      minCalendarZoom,
      maxCalendarZoom,
      dayNames,
      slotHeight,
      slotsPerDay,
      allDayRowHeight,
      monthRows,
      monthRowHeight,
      getWeekStart,
      getMonthStart,
      addDays,
      addMonths,
      formatDateDisplay,
      formatMonthDate,
      isSameCalendarDate,
      formatDateInput,
      weekViewModule,
      monthViewModule,
      isAllDayKind,
      isExhibitionKind,
      getAllDayPriority,
      canManageEventOccurrence,
      kindToClass,
      escapeHtml,
      getEventDisplayTitle,
      requestDeleteEvent,
      setRoleLockedMessage,
      openQuickEditEventModal,
      slotToTime,
      getBaseRuleForSlot,
      baseTypeToClass,
      canCreateFromBaseRule,
      startMasterCreate,
      moveMasterCreate,
      finalizeMasterCreate,
      isBaseLabelStart,
      getBaseLabelText,
      getEventsForDate,
      timeToSlot,
      findLane,
      startMasterEventEdit
    } = dependencies;

    let weekView = null;
    let monthView = null;

    function getCalendarZoomFactor() {
      const zoom = Number(state.calendarZoom);
      if (!Number.isFinite(zoom)) return 1;
      return Math.max(minCalendarZoom, Math.min(maxCalendarZoom, zoom));
    }

    function applyCalendarZoomStyles() {
      const viewport = document.getElementById('calendar-viewport');
      if (!viewport) return;
      const zoom = getCalendarZoomFactor();
      viewport.style.zoom = String(zoom);
      viewport.style.transformOrigin = 'top left';
    }

    function setCalendarZoom(nextZoom) {
      const numeric = Number(nextZoom);
      if (!Number.isFinite(numeric)) return;
      state.calendarZoom = Math.max(minCalendarZoom, Math.min(maxCalendarZoom, Math.round(numeric * 10) / 10));
      updateCalendarZoomButtons();
      renderCalendar();
    }

    function updateCalendarZoomButtons() {
      const zoomInBtn = document.getElementById('zoom-in-btn');
      const zoomOutBtn = document.getElementById('zoom-out-btn');
      if (!zoomInBtn || !zoomOutBtn) return;
      zoomInBtn.disabled = state.calendarZoom >= maxCalendarZoom;
      zoomOutBtn.disabled = state.calendarZoom <= minCalendarZoom;
    }

    function setCalendarToToday() {
      const now = new Date();
      state.weekStart = getWeekStart(now);
      state.monthStart = getMonthStart(now);
    }

    function renderWeekLabel() {
      const prevBtn = document.getElementById('prev-week-btn');
      const nextBtn = document.getElementById('next-week-btn');
      const labelEl = document.getElementById('week-label');
      if (!prevBtn || !nextBtn || !labelEl) return;

      if (state.viewMode === 'month') {
        prevBtn.textContent = '이전 달';
        nextBtn.textContent = '다음 달';
        labelEl.textContent = `${state.monthStart.getFullYear()}년 ${String(state.monthStart.getMonth() + 1).padStart(2, '0')}월`;
        return;
      }

      prevBtn.textContent = '이전 주';
      nextBtn.textContent = '다음 주';
      const start = state.weekStart;
      const end = addDays(start, 6);
      labelEl.textContent = `${formatDateDisplay(start)} ~ ${formatDateDisplay(end)}`;
    }

    function setViewMode(mode) {
      if (mode !== 'week' && mode !== 'month') return;
      state.viewMode = mode;
      if (mode === 'week') {
        state.weekStart = getWeekStart(state.weekStart || new Date());
        return;
      }
      state.monthStart = getMonthStart(state.weekStart || state.monthStart || new Date());
      state.weekStart = getWeekStart(state.monthStart);
    }

    function shiftCurrentRange(direction) {
      if (state.viewMode === 'month') {
        state.monthStart = addMonths(state.monthStart, direction);
        state.weekStart = getWeekStart(state.monthStart);
        return;
      }
      state.weekStart = addDays(state.weekStart, direction * 7);
    }

    function syncViewToggleButtons() {
      const weekBtn = document.getElementById('week-view-btn');
      const monthBtn = document.getElementById('month-view-btn');
      if (!weekBtn || !monthBtn) return;
      const isWeek = state.viewMode === 'week';
      weekBtn.classList.toggle('is-active', isWeek);
      monthBtn.classList.toggle('is-active', !isWeek);
    }

    function renderCalendar() {
      const dayHeader = document.getElementById('calendar-day-header');
      const body = document.getElementById('calendar-body');
      const wrap = body ? body.closest('.studio-calendar-wrap') : null;
      applyCalendarZoomStyles();
      if (state.viewMode === 'month') {
        renderMonthCalendar(dayHeader, body, wrap);
        return;
      }
      renderWeekCalendar(dayHeader, body, wrap);
    }

    function renderWeekCalendar(dayHeader, body, wrap) {
      if (!weekView) {
        weekView = weekViewModule.create({
          document,
          state,
          dayNames,
          slotHeight,
          slotsPerDay,
          allDayRowHeight,
          addDays,
          formatMonthDate,
          isSameCalendarDate,
          formatDateInput,
          isAllDayKind,
          isExhibitionKind,
          getAllDayPriority,
          canManageEventOccurrence,
          kindToClass,
          escapeHtml,
          getEventDisplayTitle,
          requestDeleteEvent,
          setRoleLockedMessage,
          openQuickEditEventModal,
          slotToTime,
          getBaseRuleForSlot,
          baseTypeToClass,
          canCreateFromBaseRule,
          startMasterCreate,
          moveMasterCreate,
          finalizeMasterCreate,
          isBaseLabelStart,
          getBaseLabelText,
          getEventsForDate,
          timeToSlot,
          findLane,
          startMasterEventEdit,
          syncCalendarHeaderScrollbarGap
        });
      }
      weekView.render(dayHeader, body, wrap);
    }

    function renderMonthCalendar(dayHeader, body, wrap) {
      if (!monthView) {
        monthView = monthViewModule.create({
          document,
          state,
          dayNames,
          monthRows,
          monthRowHeight,
          getWeekStart,
          addDays,
          formatDateInput,
          isSameCalendarDate,
          isExhibitionKind,
          getEventsForDate,
          isAllDayKind,
          timeToSlot,
          kindToClass,
          getEventDisplayTitle,
          canManageEventOccurrence,
          setRoleLockedMessage,
          openQuickEditEventModal,
          syncCalendarHeaderScrollbarGap
        });
      }
      monthView.render(dayHeader, body, wrap);
    }

    function syncCalendarHeaderScrollbarGap() {
      const body = document.getElementById('calendar-body');
      if (!body) return;
      const wrap = body.closest('.studio-calendar-wrap');
      if (!wrap) return;
      if (state.viewMode === 'month') {
        wrap.style.setProperty('--calendar-scrollbar-gap', '0px');
        return;
      }
      const scrollbarGap = Math.max(0, body.offsetWidth - body.clientWidth);
      wrap.style.setProperty('--calendar-scrollbar-gap', `${scrollbarGap}px`);
    }

    return {
      getCalendarZoomFactor,
      applyCalendarZoomStyles,
      setCalendarZoom,
      updateCalendarZoomButtons,
      setCalendarToToday,
      renderWeekLabel,
      setViewMode,
      shiftCurrentRange,
      syncViewToggleButtons,
      renderCalendar,
      renderWeekCalendar,
      renderMonthCalendar,
      syncCalendarHeaderScrollbarGap
    };
  }

  return { create };
});

/* master-calendar/bindings-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarBindingsController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      window,
      state,
      CALENDAR_ZOOM_STEP,
      alert,
      toggleMobileInfoPanels,
      setCalendarZoom,
      shiftCurrentRange,
      renderAll,
      setViewMode,
      setCalendarToToday,
      isStudioAdmin,
      isStudioInstructor,
      isStudioArtist,
      isArtistRegisteredForPersonalWork,
      openEventModal,
      openModal,
      getWeekStart,
      setBaseCreateControlsVisible,
      loadStudioInstructors,
      populateInstructorOptions,
      renderBaseEditorGrid,
      renderBaseEditorWeekLabel,
      renderBaseEditModeToggle,
      syncBaseClassNameVisibility,
      updateUndoButtonState,
      addDays,
      getBaseEditorWeekStart,
      hasWeekOverride,
      saveEventFromModal,
      saveQuickEditEventFromModal,
      handleDeleteRecurringOne,
      handleDeleteRecurringFollowing,
      closeModal,
      handleMoveRecurringOne,
      handleMoveRecurringFollowing,
      resetRecurringMoveState,
      handleDeleteConfirmOk,
      canUseEventKindByRole,
      resetEventSelectionState,
      syncEventInputMode,
      renderEventSelectorGrid,
      syncEventSelectionFromInputs,
      renderEventPersonalUserInfo,
      handleEventUserSelectChange,
      handleQuickEditUserSelectChange,
      syncEditBaseClassNameVisibility,
      saveBaseEditFromModal,
      deleteBaseEditFromModal,
      resolveBaseEventFollowPrompt,
      undoBaseChange,
      handleBaseEditorGlobalMouseUp,
      handleBaseEditorGlobalMouseMove,
      handleMasterCalendarPointerMove,
      handleMasterCalendarPointerUp,
      handleMasterCalendarPointerCancel,
      handleBaseEditorUndoShortcut,
      handleBaseGridHoverCursor,
      clearBaseGridHoverCursor,
      handleEventSelectorHoverCursor,
      clearEventSelectorHoverCursor,
      syncCalendarHeaderScrollbarGap,
      syncMobileInfoPanelsState,
      applyStudioRoleUiLocks
    } = dependencies;

    function bindEvents() {
      const mobileInfoToggleBtn = document.getElementById('mobile-info-toggle-btn');
      if (mobileInfoToggleBtn) {
        mobileInfoToggleBtn.addEventListener('click', toggleMobileInfoPanels);
      }

      document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
        setCalendarZoom(state.calendarZoom + CALENDAR_ZOOM_STEP);
      });

      document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
        setCalendarZoom(state.calendarZoom - CALENDAR_ZOOM_STEP);
      });

      document.getElementById('prev-week-btn').addEventListener('click', () => {
        shiftCurrentRange(-1);
        renderAll();
      });

      document.getElementById('next-week-btn').addEventListener('click', () => {
        shiftCurrentRange(1);
        renderAll();
      });

      document.getElementById('week-view-btn').addEventListener('click', () => {
        setViewMode('week');
        renderAll();
      });

      document.getElementById('month-view-btn').addEventListener('click', () => {
        setViewMode('month');
        renderAll();
      });

      document.getElementById('go-today-btn').addEventListener('click', () => {
        setCalendarToToday();
        renderAll();
      });

      document.getElementById('open-add-event-btn').addEventListener('click', () => {
        if (!isStudioAdmin() && !isStudioInstructor() && !isStudioArtist()) {
          return;
        }
        if (isStudioArtist() && !isArtistRegisteredForPersonalWork()) {
          alert('개인작업 일정은 개인작업 관리에 등록된 이용자만 생성할 수 있습니다. 먼저 개인작업 관리 페이지에 본인을 추가해주세요.');
          return;
        }
        openEventModal();
      });

      document.getElementById('open-base-editor-btn').addEventListener('click', () => {
        if (!isStudioAdmin()) {
          return;
        }
        openModal('base-modal');
        state.baseEditorWeekStart = getWeekStart(state.weekStart || new Date());
        state.baseEditMode = 'base';
        document.getElementById('base-type').value = '';
        document.getElementById('base-class-name').value = '';
        document.getElementById('base-instructor').value = '';
        document.getElementById('base-apply-weekly').checked = false;
        document.getElementById('base-edit-from-current-week').checked = false;
        setBaseCreateControlsVisible(false);
        loadStudioInstructors();
        populateInstructorOptions('base-instructor');
        renderBaseEditorGrid({ forceDefaultViewport: true });
        renderBaseEditorWeekLabel();
        renderBaseEditModeToggle();
        syncBaseClassNameVisibility();
        updateUndoButtonState();
      });

      document.getElementById('base-add-block-btn').addEventListener('click', () => {
        setBaseCreateControlsVisible(true);
        document.getElementById('base-type')?.focus();
      });

      document.getElementById('base-cancel-add-block-btn').addEventListener('click', () => {
        setBaseCreateControlsVisible(false);
      });

      document.getElementById('base-prev-week-btn').addEventListener('click', () => {
        state.baseEditorWeekStart = addDays(getBaseEditorWeekStart(), -7);
        state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
        renderBaseEditorWeekLabel();
        renderBaseEditModeToggle();
        renderBaseEditorGrid({ forceDefaultViewport: true });
        updateUndoButtonState();
      });

      document.getElementById('base-next-week-btn').addEventListener('click', () => {
        state.baseEditorWeekStart = addDays(getBaseEditorWeekStart(), 7);
        state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
        renderBaseEditorWeekLabel();
        renderBaseEditModeToggle();
        renderBaseEditorGrid({ forceDefaultViewport: true });
        updateUndoButtonState();
      });

      document.getElementById('base-go-today-btn').addEventListener('click', () => {
        state.baseEditorWeekStart = getWeekStart(new Date());
        state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
        renderBaseEditorWeekLabel();
        renderBaseEditModeToggle();
        renderBaseEditorGrid({ forceDefaultViewport: true });
        updateUndoButtonState();
      });

      document.getElementById('base-edit-mode-switch').addEventListener('change', (event) => {
        if (hasWeekOverride(getBaseEditorWeekStart())) {
          state.baseEditMode = 'week';
          renderBaseEditModeToggle();
          renderBaseEditorGrid();
          updateUndoButtonState();
          return;
        }
        const checked = Boolean(event?.target?.checked);
        state.baseEditMode = checked ? 'week' : 'base';
        renderBaseEditModeToggle();
        renderBaseEditorGrid();
        updateUndoButtonState();
      });

      document.getElementById('save-event-btn').addEventListener('click', saveEventFromModal);
      document.getElementById('save-event-quick-edit-btn').addEventListener('click', saveQuickEditEventFromModal);
      document.getElementById('delete-recurring-one-btn').addEventListener('click', handleDeleteRecurringOne);
      document.getElementById('delete-recurring-following-btn').addEventListener('click', handleDeleteRecurringFollowing);
      document.getElementById('delete-recurring-cancel-btn').addEventListener('click', () => closeModal('recurring-delete-modal'));
      document.getElementById('move-recurring-one-btn').addEventListener('click', handleMoveRecurringOne);
      document.getElementById('move-recurring-following-btn').addEventListener('click', handleMoveRecurringFollowing);
      document.getElementById('move-recurring-cancel-btn').addEventListener('click', () => {
        resetRecurringMoveState();
        closeModal('recurring-move-modal');
      });
      document.getElementById('delete-confirm-ok-btn').addEventListener('click', handleDeleteConfirmOk);
      document.getElementById('delete-confirm-cancel-btn').addEventListener('click', () => closeModal('delete-confirm-modal'));
      document.getElementById('event-kind').addEventListener('change', () => {
        const kindSelect = document.getElementById('event-kind');
        const nextKind = String(kindSelect?.value || '').trim();
        if (!canUseEventKindByRole(nextKind)) {
          if (isStudioArtist() && kindSelect) {
            kindSelect.value = '개인작업';
          } else if (isStudioInstructor() && kindSelect) {
            kindSelect.value = '수강';
          }
        }
        resetEventSelectionState();
        syncEventInputMode();
        renderEventSelectorGrid();
      });
      document.getElementById('event-date').addEventListener('change', () => {
        syncEventSelectionFromInputs();
        renderEventPersonalUserInfo();
        renderEventSelectorGrid();
      });
      document.getElementById('event-range-start').addEventListener('change', () => {
        renderEventSelectorGrid();
      });
      document.getElementById('event-range-end').addEventListener('change', () => {
        renderEventSelectorGrid();
      });
      document.getElementById('event-user').addEventListener('change', handleEventUserSelectChange);
      document.getElementById('quick-edit-user').addEventListener('change', handleQuickEditUserSelectChange);
      document.getElementById('event-title').addEventListener('input', () => {
        renderEventSelectorGrid();
      });
      document.getElementById('event-capacity').addEventListener('change', () => {
        renderEventSelectorGrid();
      });
      document.getElementById('event-start').addEventListener('change', syncEventSelectionFromInputs);
      document.getElementById('event-end').addEventListener('change', syncEventSelectionFromInputs);
      document.getElementById('base-type').addEventListener('change', syncBaseClassNameVisibility);
      document.getElementById('edit-base-type').addEventListener('change', syncEditBaseClassNameVisibility);
      document.getElementById('save-base-edit-btn').addEventListener('click', saveBaseEditFromModal);
      document.getElementById('delete-base-edit-btn').addEventListener('click', deleteBaseEditFromModal);
      document.getElementById('base-event-follow-yes-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('yes'));
      document.getElementById('base-event-follow-no-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('no'));
      document.getElementById('base-event-follow-cancel-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('cancel'));
      document.getElementById('undo-base-btn').addEventListener('click', undoBaseChange);
      document.addEventListener('mouseup', handleBaseEditorGlobalMouseUp);
      document.addEventListener('mousemove', handleBaseEditorGlobalMouseMove);
      document.addEventListener('pointermove', handleMasterCalendarPointerMove);
      document.addEventListener('pointerup', handleMasterCalendarPointerUp);
      document.addEventListener('pointercancel', handleMasterCalendarPointerCancel);
      document.addEventListener('keydown', handleBaseEditorUndoShortcut);

      const baseGridRoot = document.getElementById('base-editor-grid');
      if (baseGridRoot) {
        baseGridRoot.addEventListener('mousemove', handleBaseGridHoverCursor);
        baseGridRoot.addEventListener('mouseleave', clearBaseGridHoverCursor);
      }

      const eventSelectorRoot = document.getElementById('event-selector-grid');
      if (eventSelectorRoot) {
        eventSelectorRoot.addEventListener('mousemove', handleEventSelectorHoverCursor);
        eventSelectorRoot.addEventListener('mouseleave', clearEventSelectorHoverCursor);
      }

      document.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
      });

      document.querySelectorAll('.studio-modal').forEach((modal) => {
        modal.addEventListener('click', (event) => {
          if (event.target === modal) {
            if (modal.id === 'base-event-follow-modal') {
              resolveBaseEventFollowPrompt('cancel');
              return;
            }
            closeModal(modal.id);
          }
        });
      });

      window.addEventListener('resize', syncCalendarHeaderScrollbarGap);
      window.addEventListener('resize', syncMobileInfoPanelsState);

      applyStudioRoleUiLocks();
      syncMobileInfoPanelsState();
    }

    return { bindEvents };
  }

  return { create };
});

/* master-calendar/quick-edit-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarQuickEditController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      slotsPerDay,
      kilnCategoryOptions,
      roleLockMessage,
      canManageEventOccurrence,
      loadStudioUsers,
      isExhibitionKind,
      isKilnKind,
      isAllDayKind,
      populateEventUserOptions,
      isStudioArtist,
      getActiveStudioUserName,
      escapeHtml,
      setRoleLockedMessage,
      normalizeKilnCategory,
      extractKilnCategoryFromTitle,
      formatDateInput,
      openModal,
      closeModal,
      timeToSlot,
      canManageEventPlacementByRole,
      getDayIndexFromDateString,
      isEventPlacementAllowed,
      buildDailyOccupancyMap,
      hasEnoughCapacityForRange,
      getClassBaseRuleForRange,
      buildKilnEventTitle,
      applyClassEventBaseMetadata,
      saveState,
      renderCalendar,
      refreshWorkshopUsageUi,
      alert
    } = dependencies;

    function openQuickEditEventModal(eventId, occurrenceDate) {
      const eventItem = state.events.find((item) => item && item.id === eventId);
      if (!eventItem) return;
      const targetDate = String(occurrenceDate || eventItem.date || '').trim();
      if (!canManageEventOccurrence(eventItem, targetDate)) {
        return;
      }

      const modal = document.getElementById('event-quick-edit-modal');
      if (!modal) return;

      loadStudioUsers();

      const kind = String(eventItem.kind || '');
      const isOther = kind === '기타';
      const isExhibition = isExhibitionKind(kind);
      const isKiln = isKilnKind(kind);
      const isAllDay = isAllDayKind(kind);

      const kindEl = document.getElementById('quick-edit-kind');
      const userRow = document.getElementById('quick-edit-user-row');
      const titleRow = document.getElementById('quick-edit-title-row');
      const kilnCategoryRow = document.getElementById('quick-edit-kiln-category-row');
      const dateRow = document.getElementById('quick-edit-date-row');
      const rangeRow = document.getElementById('quick-edit-range-row');
      const timeRow = document.getElementById('quick-edit-time-row');
      const userInput = document.getElementById('quick-edit-user');
      const titleInput = document.getElementById('quick-edit-title');
      const kilnCategoryInput = document.getElementById('quick-edit-kiln-category');
      const dateInput = document.getElementById('quick-edit-date');
      const rangeStart = document.getElementById('quick-edit-range-start');
      const rangeEnd = document.getElementById('quick-edit-range-end');
      const startInput = document.getElementById('quick-edit-start');
      const endInput = document.getElementById('quick-edit-end');

      modal.dataset.eventId = String(eventId);

      if (kindEl) kindEl.textContent = kind || '-';

      if (userInput) {
        const currentUserName = (!isOther && !isExhibition && !isKiln) ? String(eventItem.title || '').trim() : '';
        populateEventUserOptions(currentUserName, 'quick-edit-user');
        userInput.value = currentUserName;
        if (isStudioArtist()) {
          const me = getActiveStudioUserName();
          userInput.innerHTML = me
            ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
            : '<option value="">이용자 선택</option>';
          userInput.value = me;
          userInput.disabled = true;
          setRoleLockedMessage(userInput);
        } else {
          userInput.disabled = false;
          userInput.classList.remove('role-locked');
          userInput.removeAttribute('data-locked-message');
          userInput.removeAttribute('aria-disabled');
        }
      }

      if (titleInput) {
        titleInput.value = String(eventItem.title || '');
      }
      if (kilnCategoryInput) {
        const inferredCategory = normalizeKilnCategory(eventItem.kilnCategory)
          || extractKilnCategoryFromTitle(eventItem.title)
          || kilnCategoryOptions[0];
        kilnCategoryInput.value = inferredCategory;
      }

      if (dateInput) {
        dateInput.value = eventItem.date || formatDateInput(state.weekStart);
      }
      if (rangeStart) {
        rangeStart.value = eventItem.date || formatDateInput(state.weekStart);
      }
      if (rangeEnd) {
        rangeEnd.value = eventItem.endDate || eventItem.date || formatDateInput(state.weekStart);
      }

      if (startInput) startInput.value = isAllDay ? '' : (eventItem.start || '10:00');
      if (endInput) endInput.value = isAllDay ? '' : (eventItem.end || '10:30');

      if (userRow) userRow.style.display = (!isOther && !isExhibition && !isKiln) ? '' : 'none';
      if (titleRow) titleRow.style.display = (isOther || isExhibition) ? '' : 'none';
      if (kilnCategoryRow) kilnCategoryRow.style.display = isKiln ? '' : 'none';
      if (dateRow) dateRow.style.display = isExhibition ? 'none' : '';
      if (rangeRow) rangeRow.style.display = isExhibition ? '' : 'none';
      if (timeRow) timeRow.style.display = isAllDay ? 'none' : '';

      openModal('event-quick-edit-modal');
    }

    function saveQuickEditEventFromModal() {
      const modal = document.getElementById('event-quick-edit-modal');
      if (!modal) return;
      const eventId = String(modal.dataset.eventId || '');
      if (!eventId) return;

      const eventItem = state.events.find((item) => item && item.id === eventId);
      if (!eventItem) {
        closeModal('event-quick-edit-modal');
        return;
      }

      const kind = String(eventItem.kind || '');
      const isOther = kind === '기타';
      const isExhibition = isExhibitionKind(kind);
      const isKiln = isKilnKind(kind);
      const isAllDay = isAllDayKind(kind);

      const nextUser = String(document.getElementById('quick-edit-user')?.value || '').trim();
      const nextTitle = String(document.getElementById('quick-edit-title')?.value || '').trim();
      const nextDate = String(document.getElementById('quick-edit-date')?.value || '').trim();
      const nextRangeStart = String(document.getElementById('quick-edit-range-start')?.value || '').trim();
      const nextRangeEnd = String(document.getElementById('quick-edit-range-end')?.value || '').trim();
      const nextStart = String(document.getElementById('quick-edit-start')?.value || '').trim();
      const nextEnd = String(document.getElementById('quick-edit-end')?.value || '').trim();
      const nextKilnCategory = normalizeKilnCategory(document.getElementById('quick-edit-kiln-category')?.value || '');

      if (isExhibition) {
        if (!nextTitle) {
          alert('제목을 입력해주세요.');
          return;
        }
        if (!nextRangeStart || !nextRangeEnd) {
          alert('전시회 시작/종료 날짜를 입력해주세요.');
          return;
        }
        if (new Date(`${nextRangeEnd}T00:00:00`) < new Date(`${nextRangeStart}T00:00:00`)) {
          alert('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
          return;
        }

        eventItem.title = nextTitle;
        eventItem.date = nextRangeStart;
        eventItem.endDate = nextRangeEnd;
        eventItem.start = '00:00';
        eventItem.end = '24:00';
        saveState();
        closeModal('event-quick-edit-modal');
        renderCalendar();
        refreshWorkshopUsageUi();
        return;
      }

      if (!nextDate) {
        alert('날짜를 입력해주세요.');
        return;
      }

      let finalStart = '00:00';
      let finalEnd = '24:00';
      let startSlot = 0;
      let endSlot = slotsPerDay;

      if (!isAllDay) {
        if (!nextStart || !nextEnd) {
          alert('시작/종료 시간을 입력해주세요.');
          return;
        }
        startSlot = timeToSlot(nextStart);
        endSlot = timeToSlot(nextEnd);
        if (endSlot <= startSlot) {
          alert('종료 시간은 시작 시간보다 늦어야 합니다.');
          return;
        }
        finalStart = nextStart;
        finalEnd = nextEnd;
      }

      const effectiveTitleForPermission = isOther
        ? nextTitle
        : (isKiln ? '가마 소성' : nextUser);
      if (!canManageEventPlacementByRole(kind, nextDate, finalStart, finalEnd, effectiveTitleForPermission)) {
        alert(roleLockMessage);
        return;
      }

      const dayIndex = getDayIndexFromDateString(nextDate);
      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
        alert('선택한 시간은 현재 일정 종류로 예약할 수 없습니다.');
        return;
      }

      if (kind !== '기타' && !isAllDay) {
        const occupancyMap = buildDailyOccupancyMap(nextDate, eventId);
        const capacity = Math.max(1, Math.min(3, Number(eventItem.capacity || 1)));
        if (!hasEnoughCapacityForRange(occupancyMap, startSlot, endSlot, capacity)) {
          alert('선택한 시간대의 남은 자리가 부족합니다.');
          return;
        }
      }

      if (kind === '수강' && !getClassBaseRuleForRange(nextDate, finalStart, finalEnd)) {
        alert('수강 일정은 하나의 수업시간 블록과 정확히 일치해야 합니다.');
        return;
      }

      if (isOther) {
        if (!nextTitle) {
          alert('제목을 입력해주세요.');
          return;
        }
        eventItem.title = nextTitle;
        eventItem.kilnCategory = '';
      } else if (isKiln) {
        if (!nextKilnCategory) {
          alert('가마 소성 구분을 선택해주세요.');
          return;
        }
        eventItem.kilnCategory = nextKilnCategory;
        eventItem.title = buildKilnEventTitle(nextKilnCategory);
      } else {
        if (!nextUser) {
          alert('이용자를 선택해주세요.');
          return;
        }
        eventItem.title = nextUser;
        eventItem.kilnCategory = '';
      }

      eventItem.date = nextDate;
      eventItem.endDate = isAllDay ? '' : (eventItem.endDate || '');
      eventItem.start = finalStart;
      eventItem.end = finalEnd;
      applyClassEventBaseMetadata(eventItem, nextDate);

      saveState();
      closeModal('event-quick-edit-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    return {
      openQuickEditEventModal,
      saveQuickEditEventFromModal
    };
  }

  return { create };
});

/* master-calendar/base-edit-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseEditController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      loadStudioInstructors,
      populateInstructorOptions,
      slotToTime,
      timeToSlot,
      openModal,
      closeModal,
      alert,
      confirm,
      getBaseEditorWeekStart,
      getRulesForWeek,
      getBaseEditScope,
      executeBaseChangeWithScopeAndEventPrompt,
      collectBaseRangeEventOccurrences,
      buildBaseEventMovePlan,
      getEditableBaseRulesForAllMode,
      getRulesByScope,
      applyMovedRuleOverride,
      applyBaseEventMovePlan,
      withBaseScope,
      getBaseWeekKey
    } = dependencies;

    function syncClassNameVisibility(prefix) {
      const type = document.getElementById(`${prefix}-type`).value;
      const classInput = document.getElementById(`${prefix}-class-name`);
      const classRow = document.getElementById(`${prefix}-class-row`);
      const instructorInput = document.getElementById(`${prefix}-instructor`);
      const instructorRow = document.getElementById(`${prefix}-instructor-row`);

      if (classRow) {
        classRow.style.display = type === '수업시간' ? '' : 'none';
      }
      if (instructorRow) {
        instructorRow.style.display = type === '수업시간' ? '' : 'none';
      }

      if (classInput) {
        classInput.disabled = type !== '수업시간';
        if (type !== '수업시간') classInput.value = '';
      }

      if (instructorInput) {
        instructorInput.disabled = type !== '수업시간';
        if (type !== '수업시간') {
          instructorInput.value = '';
        } else {
          loadStudioInstructors();
          populateInstructorOptions(`${prefix}-instructor`);
        }
      }
    }

    function syncBaseClassNameVisibility() {
      syncClassNameVisibility('base');
    }

    function syncEditBaseClassNameVisibility() {
      syncClassNameVisibility('edit-base');
    }

    function openBaseEditModal(rule) {
      if (!rule) return;
      state.editBaseRuleId = rule.id;

      loadStudioInstructors();
      populateInstructorOptions('edit-base-instructor', rule.instructor || '');

      document.getElementById('edit-base-type').value = rule.type || '수업시간';
      document.getElementById('edit-base-class-name').value = rule.className || '';
      document.getElementById('edit-base-instructor').value = rule.instructor || '';
      document.getElementById('edit-base-day').value = String(rule.day);
      document.getElementById('edit-base-start').value = slotToTime(rule.startSlot);
      document.getElementById('edit-base-end').value = slotToTime(rule.endSlot);

      syncEditBaseClassNameVisibility();
      openModal('base-edit-modal');
    }

    function saveBaseEditFromModal() {
      const editRuleId = String(state.editBaseRuleId || '');
      if (!editRuleId) {
        closeModal('base-edit-modal');
        return;
      }

      const type = document.getElementById('edit-base-type').value;
      const className = document.getElementById('edit-base-class-name').value;
      const instructor = String(document.getElementById('edit-base-instructor')?.value || '').trim();
      const day = Number(document.getElementById('edit-base-day').value);
      const start = document.getElementById('edit-base-start').value;
      const end = document.getElementById('edit-base-end').value;

      if (!start || !end) {
        alert('시작/종료 시간을 입력해주세요.');
        return;
      }

      const startSlot = timeToSlot(start);
      const endSlot = timeToSlot(end);
      if (endSlot <= startSlot) {
        alert('종료 시간은 시작 시간보다 늦어야 합니다.');
        return;
      }

      if (type === '수업시간' && !className) {
        alert('수업시간은 수업명을 선택해주세요.');
        return;
      }
      if (type === '수업시간' && !instructor) {
        alert('수업시간은 강사를 선택해주세요.');
        return;
      }

      const weekStart = getBaseEditorWeekStart();
      const baseWeekRules = getRulesForWeek(weekStart);
      const baseRule = baseWeekRules.find((item) => item.id === editRuleId);
      const oldDay = Number(baseRule?.day ?? day);
      const oldStart = Number(baseRule?.startSlot ?? startSlot);
      const oldEnd = Number(baseRule?.endSlot ?? endSlot);

      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(
        scope,
        () => {
          const dayShift = day - oldDay;
          const slotShift = startSlot - oldStart;
          const affectedEvents = collectBaseRangeEventOccurrences(oldDay, oldStart, oldEnd, weekStart);
          const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
          return {
            ruleId: editRuleId,
            day,
            startSlot,
            endSlot,
            type,
            className,
            instructor,
            weekStart,
            affectedEvents,
            askEventFollow: dayShift !== 0 || slotShift !== 0,
            movePlan
          };
        },
        (payload) => {
          const targetRules = payload.scope === 'all'
            ? getEditableBaseRulesForAllMode(payload.weekStart)
            : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
          let rule = targetRules.find((item) => item.id === payload.ruleId);
          if (!rule) {
            rule = {
              id: payload.ruleId,
              day: payload.day,
              startSlot: payload.startSlot,
              endSlot: payload.endSlot,
              type: payload.type,
              className: '',
              instructor: ''
            };
            targetRules.push(rule);
          }

          rule.type = payload.type;
          rule.className = payload.type === '수업시간' ? payload.className : '';
          rule.instructor = payload.type === '수업시간' ? payload.instructor : '';
          rule.day = payload.day;
          rule.startSlot = payload.startSlot;
          rule.endSlot = payload.endSlot;
          applyMovedRuleOverride(targetRules, rule);
          if (payload.moveEvents) {
            applyBaseEventMovePlan(payload.movePlan);
          }
        }
      );

      closeModal('base-edit-modal');
    }

    function deleteBaseEditFromModal() {
      const editRuleId = String(state.editBaseRuleId || '');
      if (!editRuleId) return;
      if (!confirm('이 베이스 블록을 삭제하시겠습니까?')) {
        return;
      }
      const scope = getBaseEditScope();
      withBaseScope(scope, (resolvedScope) => {
        const targetRules = resolvedScope === 'all'
          ? getEditableBaseRulesForAllMode(getBaseEditorWeekStart())
          : getRulesByScope(resolvedScope, getBaseEditorWeekStart());
        const next = targetRules.filter((item) => item.id !== editRuleId);
        targetRules.length = 0;
        next.forEach((item) => targetRules.push(item));
        if (resolvedScope !== 'all') {
          state.baseWeekOverrides[getBaseWeekKey(getBaseEditorWeekStart())] = next;
        }
      });
      closeModal('base-edit-modal');
    }

    return {
      syncBaseClassNameVisibility,
      syncEditBaseClassNameVisibility,
      openBaseEditModal,
      saveBaseEditFromModal,
      deleteBaseEditFromModal
    };
  }

  return { create };
});

/* master-calendar/base-editor-controller.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseEditorController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      setTimeout,
      clearTimeout,
      SLOTS_PER_DAY,
      BASE_EDITOR_START_SLOT,
      HOLD_TO_MOVE_MS,
      BASE_EDITOR_SCROLL_EDGE_PX,
      BASE_EDITOR_SCROLL_STEP,
      BASE_RESIZE_EDGE_PX,
      DAY_NAMES,
      getBaseEditorWeekStart,
      getBaseEditorDisplayRules,
      getRuleForSlotFromRules,
      getBaseLabelText,
      baseTypeToClass,
      formatMonthDate,
      addDays,
      slotToTime,
      isSameCalendarDate,
      isBaseCreateControlsVisible,
      applyBaseRule,
      getBaseEditScope,
      executeBaseChangeWithScopeAndEventPrompt,
      collectBaseRangeEventOccurrences,
      buildBaseEventMovePlan,
      getEditableBaseRulesForAllMode,
      getRulesByScope,
      applyMovedRuleOverride,
      applyBaseEventMovePlan,
      openBaseEditModal,
      undoBaseChange,
      clearEventSelectionMoveTimer,
      alert,
      escapeHtml
    } = dependencies;

    function renderBaseEditorGrid(options) {
      const forceDefaultViewport = Boolean(options && options.forceDefaultViewport);
      const root = document.getElementById('base-editor-grid');
      if (!root) return;
      const previousScrollTop = root.scrollTop;

      const grid = document.createElement('div');
      grid.className = 'base-grid-inner';
      state.dragBase.gridEl = grid;
      state.moveBase.gridEl = grid;
      state.resizeBase.gridEl = grid;

      const head = document.createElement('div');
      head.className = 'base-time base-head-cell';
      head.textContent = '시간';
      grid.appendChild(head);

      const editorWeekStart = getBaseEditorWeekStart();
      const displayRules = getBaseEditorDisplayRules();
      for (let day = 0; day < 7; day += 1) {
        const dayDate = addDays(editorWeekStart, day);
        const dayHead = document.createElement('div');
        dayHead.className = 'base-time base-head-cell';
        dayHead.textContent = `${DAY_NAMES[day]} (${formatMonthDate(dayDate)})`;
        if (isSameCalendarDate(dayDate, new Date())) {
          dayHead.classList.add('is-today');
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dayHead.appendChild(document.createTextNode(' '));
          dayHead.appendChild(badge);
        }
        grid.appendChild(dayHead);
      }

      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
        const time = document.createElement('div');
        time.className = 'base-time';
        time.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        grid.appendChild(time);

        for (let day = 0; day < 7; day += 1) {
          const rule = getRuleForSlotFromRules(displayRules, day, slot);
          const cell = document.createElement('div');
          cell.className = `base-cell ${baseTypeToClass(rule ? rule.type : '')}`;
          cell.dataset.day = String(day);
          cell.dataset.slot = String(slot);
          if (rule && rule.id) cell.dataset.ruleId = String(rule.id);

          if (rule) {
            const prev = slot > 0 ? getRuleForSlotFromRules(displayRules, day, slot - 1) : null;
            const next = slot < SLOTS_PER_DAY - 1 ? getRuleForSlotFromRules(displayRules, day, slot + 1) : null;
            const isStart = !prev || prev.id !== rule.id;
            const isEnd = !next || next.id !== rule.id;
            if (isStart) cell.classList.add('base-block-start');
            if (!isStart) cell.classList.add('base-block-continued');
            if (isEnd) cell.classList.add('base-block-end');
            if (!isStart && !isEnd) cell.classList.add('base-block-middle');
            if (isStart) {
              const label = document.createElement('span');
              label.className = 'base-cell-label';
              label.textContent = getBaseLabelText(rule);
              cell.appendChild(label);
            }
          }

          cell.addEventListener('mousedown', (event) => onBaseCellMouseDown(event, day, slot, rule, cell));
          cell.addEventListener('mouseenter', () => onBaseCellMouseEnter(day, slot));
          cell.addEventListener('mouseup', () => onBaseCellMouseUp(day, slot));
          grid.appendChild(cell);
        }
      }

      root.innerHTML = '';
      root.appendChild(grid);
      root.scrollTop = forceDefaultViewport
        ? Math.max(0, (BASE_EDITOR_START_SLOT - 1) * 20)
        : previousScrollTop;
    }

    function onBaseCellMouseDown(event, day, slot, rule, cell) {
      if (event) event.preventDefault();
      clearMoveTimer();
      const resizeEdge = getResizeEdgeFromEvent(event, cell, rule);
      if (resizeEdge && rule) {
        startBaseResize(rule, resizeEdge);
        return;
      }
      if (rule) {
        const duration = Math.max(1, Number(rule.endSlot) - Number(rule.startSlot));
        state.moveBase.timerId = setTimeout(() => {
          document.body.classList.add('is-dragging-base');
          state.moveBase.ruleType = rule.type || '';
          state.moveBase.ruleLabel = getBaseLabelText(rule);
          state.moveBase.originDay = Number(rule.day);
          state.moveBase.active = true;
          state.moveBase.ruleId = rule.id;
          state.moveBase.dayIndex = Number(rule.day);
          state.moveBase.duration = duration;
          state.moveBase.originStartSlot = rule.startSlot;
          state.moveBase.previewStartSlot = Math.min(Number(rule.startSlot), SLOTS_PER_DAY - duration);
          state.moveBase.previewEndSlot = state.moveBase.previewStartSlot + duration;
          state.moveBase.moved = false;
          hideOriginRuleCells(state.moveBase.ruleId);
          showMoveGhost();
          updateMoveGhost();
        }, HOLD_TO_MOVE_MS);
        return;
      }
      if (!isBaseCreateControlsVisible()) {
        alert('+ 블록 추가를 눌러 블록 유형을 선택한 뒤 드래그로 추가해주세요.');
        return;
      }
      startBaseDrag(day, slot);
    }

    function onBaseCellMouseEnter(day, slot) {
      if (state.resizeBase.active) {
        updateBaseResizePreview(day, slot);
        return;
      }
      if (state.moveBase.active) {
        state.moveBase.dayIndex = day;
        const start = Math.min(slot, SLOTS_PER_DAY - state.moveBase.duration);
        state.moveBase.previewStartSlot = Math.max(0, start);
        state.moveBase.previewEndSlot = state.moveBase.previewStartSlot + state.moveBase.duration;
        state.moveBase.moved = true;
        updateMoveGhost();
        return;
      }
      moveBaseDrag(day, slot);
    }

    function onBaseCellMouseUp(day, slot) {
      if (state.resizeBase.active) return finalizeBaseResize();
      if (state.moveBase.active) return finalizeBaseMove();
      if (state.dragBase.active) return endBaseDrag(day, slot);
      const hadTimer = Boolean(state.moveBase.timerId);
      clearMoveTimer();
      if (!hadTimer) return;
      const rule = getRuleForSlotFromRules(getBaseEditorDisplayRules(), day, slot);
      if (rule) openBaseEditModal(rule);
    }

    function clearMoveTimer() {
      if (state.moveBase.timerId) {
        clearTimeout(state.moveBase.timerId);
        state.moveBase.timerId = null;
      }
    }

    function handleBaseEditorGlobalMouseUp() {
      if (state.eventSelection.dragging) {
        state.eventSelection.dragging = false;
        state.eventSelection.mode = '';
      }
      clearEventSelectionMoveTimer();
      if (state.resizeBase.active) return finalizeBaseResize();
      if (state.moveBase.active) return finalizeBaseMove();
      if (state.dragBase.active) return finalizeBaseAdd();
      clearMoveTimer();
    }

    function handleBaseEditorGlobalMouseMove(event) {
      if (!state.dragBase.active && !state.moveBase.active && !state.resizeBase.active) return;
      if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        autoScrollBaseEditor(event.clientY);
        syncPointerDrivenPreview(event.clientX, event.clientY);
      }
    }

    function handleBaseEditorUndoShortcut(event) {
      if (!event || String(event.key || '').toLowerCase() !== 'z') return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (!isBaseModalOpen()) return;
      event.preventDefault();
      undoBaseChange();
    }

    function isBaseModalOpen() {
      const modal = document.getElementById('base-modal');
      return Boolean(modal && modal.classList.contains('open'));
    }

    function autoScrollBaseEditor(pointerClientY) {
      const root = document.getElementById('base-editor-grid');
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const nearTop = pointerClientY - rect.top;
      const nearBottom = rect.bottom - pointerClientY;
      if (nearTop <= BASE_EDITOR_SCROLL_EDGE_PX) {
        root.scrollTop = Math.max(0, root.scrollTop - BASE_EDITOR_SCROLL_STEP);
      } else if (nearBottom <= BASE_EDITOR_SCROLL_EDGE_PX) {
        root.scrollTop = Math.min(root.scrollHeight, root.scrollTop + BASE_EDITOR_SCROLL_STEP);
      }
    }

    function syncPointerDrivenPreview(clientX, clientY) {
      const hovered = document.elementFromPoint(clientX, clientY);
      const directCell = hovered ? hovered.closest('.base-cell') : null;
      const pointerTarget = directCell
        ? { day: Number(directCell.dataset.day), slot: Number(directCell.dataset.slot) }
        : getPointerTargetDaySlot(clientX, clientY);
      if (!pointerTarget) return;
      const day = Number(pointerTarget.day);
      const slot = Number(pointerTarget.slot);
      if (!Number.isInteger(day) || !Number.isInteger(slot)) return;
      if (state.resizeBase.active) return updateBaseResizePreview(day, slot);
      if (state.moveBase.active) return onBaseCellMouseEnter(day, slot);
      if (state.dragBase.active) moveBaseDrag(state.dragBase.dayIndex, slot);
    }

    function getPointerTargetDaySlot(clientX, clientY) {
      const root = document.getElementById('base-editor-grid');
      const grid = getActiveBaseGrid();
      if (!root || !grid) return null;
      const rect = root.getBoundingClientRect();
      const timeColumnWidth = 56;
      const rowHeight = 20;
      const dayWidth = (grid.clientWidth - timeColumnWidth) / 7;
      if (!Number.isFinite(dayWidth) || dayWidth <= 0) return null;
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top + root.scrollTop;
      const day = Math.max(0, Math.min(6, Math.floor((relativeX - timeColumnWidth) / dayWidth)));
      const slot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor((relativeY - rowHeight) / rowHeight)));
      return { day, slot };
    }

    function getActiveBaseGrid() {
      return state.dragBase.gridEl || state.moveBase.gridEl || state.resizeBase.gridEl
        || document.querySelector('#base-editor-grid .base-grid-inner');
    }

    function finalizeBaseMove() {
      const move = state.moveBase;
      if (!move.active || !move.ruleId) {
        resetMoveState();
        return;
      }
      const ruleId = String(move.ruleId || '');
      const nextDay = Number(move.dayIndex);
      const nextStart = Number(move.previewStartSlot);
      const nextEnd = Number(move.previewEndSlot);
      const weekStart = getBaseEditorWeekStart();
      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(scope, () => {
        const dayShift = nextDay - move.originDay;
        const slotShift = nextStart - move.originStartSlot;
        const affectedEvents = collectBaseRangeEventOccurrences(move.originDay, move.originStartSlot, move.originStartSlot + move.duration, weekStart);
        const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
        return { ruleId, nextDay, nextStart, nextEnd, weekStart, affectedEvents, askEventFollow: dayShift !== 0 || slotShift !== 0, movePlan };
      }, (payload) => {
        const targetRules = payload.scope === 'all'
          ? getEditableBaseRulesForAllMode(payload.weekStart)
          : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
        const rule = targetRules.find((item) => item.id === payload.ruleId);
        if (!rule) return;
        rule.day = payload.nextDay;
        rule.startSlot = payload.nextStart;
        rule.endSlot = payload.nextEnd;
        applyMovedRuleOverride(targetRules, rule);
        if (payload.moveEvents) applyBaseEventMovePlan(payload.movePlan);
      });
      resetMoveState();
    }

    function resetMoveState() {
      clearMoveTimer();
      document.body.classList.remove('is-dragging-base');
      clearOriginRuleCells();
      removeMoveGhost();
      Object.assign(state.moveBase, {
        active: false, ruleId: null, ruleType: '', ruleLabel: '', originDay: null,
        dayIndex: null, duration: 1, originStartSlot: 0, previewStartSlot: 0,
        previewEndSlot: 1, gridEl: null, ghostEl: null, moved: false
      });
    }

    function getResizeEdgeFromEvent(event, cell, rule) {
      if (!event || !cell || !rule) return '';
      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      const height = Number(rect.height || cell.clientHeight || 0);
      if (cell.classList.contains('base-block-start') && y <= BASE_RESIZE_EDGE_PX) return 'start';
      if (cell.classList.contains('base-block-end') && y >= Math.max(0, height - BASE_RESIZE_EDGE_PX)) return 'end';
      return '';
    }

    function handleBaseGridHoverCursor(event) {
      if (state.dragBase.active || state.moveBase.active || state.resizeBase.active) return;
      clearBaseGridHoverCursor();
      const target = event && event.target ? event.target : null;
      const cell = target && typeof target.closest === 'function' ? target.closest('.base-cell') : null;
      if (!cell || !cell.dataset.ruleId) return;
      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      const nearTop = cell.classList.contains('base-block-start') && y <= BASE_RESIZE_EDGE_PX;
      const nearBottom = cell.classList.contains('base-block-end') && y >= Math.max(0, rect.height - BASE_RESIZE_EDGE_PX);
      if (nearTop) cell.classList.add('edge-resize-top');
      else if (nearBottom) cell.classList.add('edge-resize-bottom');
    }

    function clearBaseGridHoverCursor() {
      document.querySelectorAll('.base-cell.edge-resize-top, .base-cell.edge-resize-bottom').forEach((cell) => {
        cell.classList.remove('edge-resize-top', 'edge-resize-bottom');
      });
    }

    function startBaseResize(rule, edge) {
      document.body.classList.add('is-dragging-base');
      Object.assign(state.resizeBase, {
        active: true, ruleId: rule.id, ruleType: rule.type || '', ruleLabel: getBaseLabelText(rule),
        dayIndex: Number(rule.day), edge, originStartSlot: Number(rule.startSlot),
        originEndSlot: Number(rule.endSlot), previewStartSlot: Number(rule.startSlot),
        previewEndSlot: Number(rule.endSlot)
      });
      hideOriginRuleCells(state.resizeBase.ruleId);
      showResizeGhost();
      updateResizeGhost();
    }

    function updateBaseResizePreview(day, slot) {
      if (!state.resizeBase.active || day !== state.resizeBase.dayIndex) return;
      if (state.resizeBase.edge === 'start') {
        state.resizeBase.previewStartSlot = Math.max(0, Math.min(slot, state.resizeBase.previewEndSlot - 1));
      } else if (state.resizeBase.edge === 'end') {
        state.resizeBase.previewEndSlot = Math.min(SLOTS_PER_DAY, Math.max(slot + 1, state.resizeBase.previewStartSlot + 1));
      }
      updateResizeGhost();
    }

    function finalizeBaseResize() {
      if (!state.resizeBase.active || !state.resizeBase.ruleId) {
        resetBaseResizeState();
        return;
      }
      const ruleId = String(state.resizeBase.ruleId || '');
      const nextStart = Number(state.resizeBase.previewStartSlot);
      const nextEnd = Number(state.resizeBase.previewEndSlot);
      const weekStart = getBaseEditorWeekStart();
      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(scope, () => {
        const dayShift = 0;
        const slotShift = nextStart - state.resizeBase.originStartSlot;
        const affectedEvents = collectBaseRangeEventOccurrences(state.resizeBase.dayIndex, state.resizeBase.originStartSlot, state.resizeBase.originEndSlot, weekStart);
        const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
        return { ruleId, day: state.resizeBase.dayIndex, nextStart, nextEnd, weekStart, affectedEvents, askEventFollow: slotShift !== 0, movePlan };
      }, (payload) => {
        const targetRules = payload.scope === 'all'
          ? getEditableBaseRulesForAllMode(payload.weekStart)
          : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
        const rule = targetRules.find((item) => item.id === payload.ruleId);
        if (!rule) return;
        rule.startSlot = payload.nextStart;
        rule.endSlot = payload.nextEnd;
        if (payload.moveEvents) applyBaseEventMovePlan(payload.movePlan);
      });
      resetBaseResizeState();
    }

    function resetBaseResizeState() {
      document.body.classList.remove('is-dragging-base');
      clearOriginRuleCells();
      removeResizeGhost();
      Object.assign(state.resizeBase, {
        active: false, ruleId: null, ruleType: '', ruleLabel: '', dayIndex: null,
        edge: null, originStartSlot: 0, originEndSlot: 1, previewStartSlot: 0,
        previewEndSlot: 1, gridEl: null, ghostEl: null
      });
    }

    function showResizeGhost() {
      const grid = state.resizeBase.gridEl;
      if (!grid) return;
      removeResizeGhost();
      const ghost = document.createElement('div');
      ghost.className = `base-resize-ghost ${baseTypeToClass(state.resizeBase.ruleType)}`;
      ghost.innerHTML = `<span>${escapeHtml(state.resizeBase.ruleLabel || state.resizeBase.ruleType || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.resizeBase.ghostEl = ghost;
    }

    function updateResizeGhost() {
      const ghost = state.resizeBase.ghostEl;
      const grid = state.resizeBase.gridEl;
      if (!ghost || !grid) return;
      positionGhost(ghost, grid, state.resizeBase.dayIndex, state.resizeBase.previewStartSlot,
        state.resizeBase.previewEndSlot - state.resizeBase.previewStartSlot);
    }

    function removeResizeGhost() {
      removeGhost(state.resizeBase);
    }

    function hideOriginRuleCells(ruleId) {
      if (!ruleId) return;
      document.querySelectorAll(`.base-cell[data-rule-id="${ruleId}"]`).forEach((cell) => {
        cell.classList.add('base-cell-origin-hidden');
      });
    }

    function clearOriginRuleCells() {
      document.querySelectorAll('.base-cell.base-cell-origin-hidden').forEach((cell) => {
        cell.classList.remove('base-cell-origin-hidden');
      });
    }

    function showMoveGhost() {
      const grid = state.moveBase.gridEl;
      if (!grid) return;
      removeMoveGhost();
      const ghost = document.createElement('div');
      ghost.className = `base-drag-ghost ${baseTypeToClass(state.moveBase.ruleType)}`;
      ghost.innerHTML = `<span>${escapeHtml(state.moveBase.ruleLabel || state.moveBase.ruleType || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.moveBase.ghostEl = ghost;
    }

    function updateMoveGhost() {
      const ghost = state.moveBase.ghostEl;
      const grid = state.moveBase.gridEl;
      if (!ghost || !grid) return;
      positionGhost(ghost, grid, state.moveBase.dayIndex, state.moveBase.previewStartSlot, state.moveBase.duration);
    }

    function removeMoveGhost() {
      removeGhost(state.moveBase);
    }

    function positionGhost(ghost, grid, dayIndex, startSlot, duration) {
      const timeColumnWidth = 56;
      const rowHeight = 20;
      const dayWidth = (grid.clientWidth - timeColumnWidth) / 7;
      ghost.style.left = `${timeColumnWidth + (dayIndex * dayWidth) + 2}px`;
      ghost.style.top = `${rowHeight + (startSlot * rowHeight) + 2}px`;
      ghost.style.width = `${Math.max(12, dayWidth - 4)}px`;
      ghost.style.height = `${Math.max(18, (duration * rowHeight) - 4)}px`;
    }

    function removeGhost(interactionState) {
      if (interactionState.ghostEl && interactionState.ghostEl.parentNode) {
        interactionState.ghostEl.parentNode.removeChild(interactionState.ghostEl);
      }
      interactionState.ghostEl = null;
    }

    function clearMovePreview() {
      document.querySelectorAll('.base-cell.moving').forEach((cell) => cell.classList.remove('moving'));
    }

    function startBaseDrag(day, slot) {
      document.body.classList.add('is-dragging-base');
      state.dragBase.active = true;
      state.dragBase.dayIndex = day;
      state.dragBase.startSlot = slot;
      state.dragBase.endSlot = slot;
      showAddGhost();
      updateAddGhost();
    }

    function moveBaseDrag(day, slot) {
      if (!state.dragBase.active || state.dragBase.dayIndex !== day) return;
      state.dragBase.endSlot = slot;
      updateAddGhost();
    }

    function endBaseDrag(day, slot) {
      if (!state.dragBase.active) return;
      if (state.dragBase.dayIndex !== day) {
        cancelBaseDrag();
        return;
      }
      state.dragBase.endSlot = slot;
      finalizeBaseAdd();
    }

    function finalizeBaseAdd() {
      if (!state.dragBase.active) return;
      const start = Math.min(state.dragBase.startSlot, state.dragBase.endSlot);
      const end = Math.max(state.dragBase.startSlot, state.dragBase.endSlot) + 1;
      const applied = applyBaseRule(state.dragBase.dayIndex, start, end);
      if (!applied) return;
      cancelBaseDrag();
    }

    function cancelBaseDrag() {
      if (!state.dragBase.active) return;
      document.body.classList.remove('is-dragging-base');
      state.dragBase.active = false;
      state.dragBase.dayIndex = null;
      state.dragBase.startSlot = null;
      state.dragBase.endSlot = null;
      removeAddGhost();
      state.dragBase.gridEl = null;
      state.dragBase.ghostEl = null;
    }

    function showAddGhost() {
      const grid = state.dragBase.gridEl || document.querySelector('#base-editor-grid .base-grid-inner');
      if (!grid) return;
      state.dragBase.gridEl = grid;
      removeAddGhost();
      const type = document.getElementById('base-type')?.value || '';
      const className = document.getElementById('base-class-name')?.value || '';
      const label = type === '수업시간' ? (className || '수업시간') : type;
      const ghost = document.createElement('div');
      ghost.className = `base-add-ghost ${baseTypeToClass(type)}`;
      ghost.innerHTML = `<span>${escapeHtml(label || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.dragBase.ghostEl = ghost;
    }

    function updateAddGhost() {
      if (!state.dragBase.active) return;
      const ghost = state.dragBase.ghostEl;
      const grid = state.dragBase.gridEl || document.querySelector('#base-editor-grid .base-grid-inner');
      if (!ghost || !grid) return;
      const start = Math.min(state.dragBase.startSlot, state.dragBase.endSlot);
      const end = Math.max(state.dragBase.startSlot, state.dragBase.endSlot) + 1;
      positionGhost(ghost, grid, state.dragBase.dayIndex, start, end - start);
    }

    function removeAddGhost() {
      removeGhost(state.dragBase);
    }

    return {
      renderBaseEditorGrid, onBaseCellMouseDown, onBaseCellMouseEnter, onBaseCellMouseUp,
      clearMoveTimer, handleBaseEditorGlobalMouseUp, handleBaseEditorGlobalMouseMove,
      handleBaseEditorUndoShortcut, isBaseModalOpen, autoScrollBaseEditor,
      syncPointerDrivenPreview, getPointerTargetDaySlot, getActiveBaseGrid, finalizeBaseMove,
      resetMoveState, getResizeEdgeFromEvent, handleBaseGridHoverCursor, clearBaseGridHoverCursor,
      startBaseResize, updateBaseResizePreview, finalizeBaseResize, resetBaseResizeState,
      showResizeGhost, updateResizeGhost, removeResizeGhost, hideOriginRuleCells,
      clearOriginRuleCells, showMoveGhost, updateMoveGhost, removeMoveGhost, clearMovePreview,
      startBaseDrag, moveBaseDrag, endBaseDrag, finalizeBaseAdd, cancelBaseDrag,
      showAddGhost, updateAddGhost, removeAddGhost
    };
  }

  return { create };
});

/* master-calendar/week-view.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarWeekView = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      dayNames,
      slotHeight,
      slotsPerDay,
      allDayRowHeight,
      addDays,
      formatMonthDate,
      isSameCalendarDate,
      formatDateInput,
      isAllDayKind,
      isExhibitionKind,
      getAllDayPriority,
      canManageEventOccurrence,
      kindToClass,
      escapeHtml,
      getEventDisplayTitle,
      requestDeleteEvent,
      setRoleLockedMessage,
      openQuickEditEventModal,
      slotToTime,
      getBaseRuleForSlot,
      baseTypeToClass,
      canCreateFromBaseRule,
      startMasterCreate,
      moveMasterCreate,
      finalizeMasterCreate,
      isBaseLabelStart,
      getBaseLabelText,
      getEventsForDate,
      timeToSlot,
      findLane,
      startMasterEventEdit,
      syncCalendarHeaderScrollbarGap
    } = dependencies;

    function render(dayHeader, body, wrap) {
      dayHeader.innerHTML = '';
      body.innerHTML = '';
      if (wrap) wrap.classList.remove('is-month-mode');
      dayHeader.classList.remove('month-header');
      body.classList.remove('month-body');

      const timeHead = document.createElement('div');
      timeHead.className = 'time-head';
      timeHead.textContent = '시간';
      dayHeader.appendChild(timeHead);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = addDays(state.weekStart, dayIndex);
        const header = document.createElement('div');
        header.className = 'day-header';
        const dayName = document.createElement('div');
        dayName.textContent = dayNames[dayIndex];

        const dateLine = document.createElement('span');
        dateLine.textContent = formatMonthDate(date);

        if (isSameCalendarDate(date, new Date())) {
          header.classList.add('is-today');
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dateLine.appendChild(document.createTextNode(' '));
          dateLine.appendChild(badge);
        }

        header.appendChild(dayName);
        header.appendChild(dateLine);
        dayHeader.appendChild(header);
      }

      const rows = document.createElement('div');
      rows.className = 'calendar-rows';

      const allDayRow = document.createElement('div');
      allDayRow.className = 'calendar-all-day-row';

      const allDayTime = document.createElement('div');
      allDayTime.className = 'all-day-time-cell';
      allDayTime.textContent = '종일';
      allDayRow.appendChild(allDayTime);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'all-day-day-cell';
        allDayRow.appendChild(cell);
      }

      body.appendChild(allDayRow);

      const allDayOverlay = document.createElement('div');
      allDayOverlay.className = 'all-day-events-overlay';
      allDayRow.appendChild(allDayOverlay);

      const weekStartDate = new Date(`${formatDateInput(state.weekStart)}T00:00:00`);
      const weekEndDate = addDays(weekStartDate, 6);

      const layouts = state.events
        .filter((event) => event && isAllDayKind(event.kind) && event.date)
        .map((event) => {
          const eventStart = new Date(`${event.date}T00:00:00`);
          const rawEnd = isExhibitionKind(event.kind) ? (event.endDate || event.date) : event.date;
          const eventEnd = new Date(`${rawEnd}T00:00:00`);
          if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) return null;
          if (eventEnd < weekStartDate || eventStart > weekEndDate) return null;

          const clampedStart = eventStart < weekStartDate ? weekStartDate : eventStart;
          const clampedEnd = eventEnd > weekEndDate ? weekEndDate : eventEnd;

          const startDay = Math.max(0, Math.min(6, Math.floor((clampedStart - weekStartDate) / 86400000)));
          const endDay = Math.max(startDay, Math.min(6, Math.floor((clampedEnd - weekStartDate) / 86400000)));

          return {
            event,
            startDay,
            endDay,
            lane: 0
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const priorityDiff = getAllDayPriority(a.event.kind) - getAllDayPriority(b.event.kind);
          if (priorityDiff !== 0) return priorityDiff;
          if (a.startDay !== b.startDay) return a.startDay - b.startDay;
          return (b.endDay - b.startDay) - (a.endDay - a.startDay);
        });

      const laneEnds = [];
      layouts.forEach((item) => {
        let lane = 0;
        while (lane < laneEnds.length && item.startDay <= laneEnds[lane]) {
          lane += 1;
        }
        if (lane === laneEnds.length) laneEnds.push(item.endDay);
        else laneEnds[lane] = item.endDay;
        item.lane = lane;
      });

      const allDayLanes = Math.max(1, laneEnds.length);
      allDayRow.style.setProperty('--all-day-lanes', String(allDayLanes));

      layouts.forEach((item) => {
        const { event, startDay, endDay, lane } = item;
        const span = Math.max(1, endDay - startDay + 1);
        const canManageOccurrence = canManageEventOccurrence(event, event.date || '');
        const pill = document.createElement('div');
        pill.className = `all-day-pill ${kindToClass(event.kind)}`;
        pill.style.left = `calc(64px + (((100% - 64px) * ${startDay}) / 7) + 2px)`;
        pill.style.width = `calc((((100% - 64px) * ${span}) / 7) - 4px)`;
        pill.style.top = `${2 + lane * 24}px`;

        const fallbackTitle = isExhibitionKind(event.kind) ? '전시회' : '가마 소성';
        pill.innerHTML = `<strong>${escapeHtml(getEventDisplayTitle(event, fallbackTitle))}</strong>`;

        if (canManageOccurrence) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'all-day-pill-delete';
          deleteBtn.setAttribute('aria-label', '일정 삭제');
          deleteBtn.innerHTML = '<span aria-hidden="true">×</span>';
          deleteBtn.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            requestDeleteEvent(event.id, event.date || '');
          });
          pill.appendChild(deleteBtn);
        } else {
          setRoleLockedMessage(pill);
        }

        pill.addEventListener('click', (clickEvent) => {
          if (clickEvent.target && typeof clickEvent.target.closest === 'function' && clickEvent.target.closest('.all-day-pill-delete')) {
            return;
          }
          if (Date.now() < state.masterEdit.suppressClickUntil) return;
          if (!canManageOccurrence) return;
          openQuickEditEventModal(event.id);
        });

        allDayOverlay.appendChild(pill);
      });

      for (let slot = 0; slot < slotsPerDay; slot += 1) {
        const timeCell = document.createElement('div');
        timeCell.className = 'time-cell';
        timeCell.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        rows.appendChild(timeCell);

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
          const date = addDays(state.weekStart, dayIndex);
          const baseRule = getBaseRuleForSlot(dayIndex, slot, state.weekStart);
          const slotEl = document.createElement('button');
          slotEl.type = 'button';
          slotEl.className = `day-slot ${baseTypeToClass(baseRule ? baseRule.type : '')}`;
          slotEl.dataset.dayIndex = String(dayIndex);
          slotEl.dataset.slot = String(slot);
          if (baseRule && !canCreateFromBaseRule(baseRule)) {
            setRoleLockedMessage(slotEl);
          }
          slotEl.addEventListener('mousedown', (event) => {
            startMasterCreate(event, dayIndex, slot, baseRule);
          });
          slotEl.addEventListener('mouseenter', () => {
            moveMasterCreate(dayIndex, slot);
          });
          slotEl.addEventListener('mouseup', () => {
            finalizeMasterCreate();
          });

          if (isBaseLabelStart(dayIndex, slot, baseRule, state.weekStart)) {
            const baseLabel = document.createElement('span');
            baseLabel.className = 'base-slot-label';
            baseLabel.textContent = getBaseLabelText(baseRule);
            slotEl.appendChild(baseLabel);
          }

          rows.appendChild(slotEl);
        }
      }

      body.appendChild(rows);

      const overlay = document.createElement('div');
      overlay.className = 'events-overlay';
      overlay.style.top = `${Math.max(allDayRowHeight, allDayRow.offsetHeight || allDayRowHeight)}px`;
      body.appendChild(overlay);
      state.masterCreate.overlayEl = overlay;
      renderEventBubbles(overlay);
      syncCalendarHeaderScrollbarGap();
      requestAnimationFrame(syncCalendarHeaderScrollbarGap);
    }

    function renderEventBubbles(overlay) {
      if (!overlay) return;
      overlay.innerHTML = '';

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(state.weekStart, dayIndex));
        const events = getEventsForDate(date)
          .sort((a, b) => timeToSlot(a.start) - timeToSlot(b.start));

        const occupancy = Array.from({ length: slotsPerDay }, () => [false, false, false]);

        events.forEach((event) => {
          if (!event || isAllDayKind(event.kind)) return;
          const canManageOccurrence = canManageEventOccurrence(event, date);
          const startSlot = timeToSlot(event.start);
          const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
          const isOther = event.kind === '기타';
          const need = isOther ? 3 : Math.max(1, Math.min(3, Number(event.capacity || 1)));
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane === -1) return;

          if (!isOther) {
            for (let slot = startSlot; slot < endSlot; slot += 1) {
              for (let laneIndex = lane; laneIndex < lane + need; laneIndex += 1) {
                occupancy[slot][laneIndex] = true;
              }
            }
          }

          const bubble = document.createElement('button');
          bubble.type = 'button';
          bubble.className = `event-bubble ${kindToClass(event.kind)}`;
          if (canManageOccurrence) {
            bubble.classList.add('has-delete');
          } else {
            setRoleLockedMessage(bubble);
          }
          bubble.style.top = `${startSlot * slotHeight + 1}px`;
          bubble.style.height = `${Math.max(slotHeight - 2, (endSlot - startSlot) * slotHeight - 2)}px`;
          bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
          bubble.style.width = `${((need / 3) / 7) * 100}%`;
          bubble.title = getEventDisplayTitle(event, '이용자 없음');
          bubble.innerHTML = `<strong>${escapeHtml(getEventDisplayTitle(event, '이용자 없음'))}</strong>`;

          if (canManageOccurrence) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'event-bubble-delete';
            deleteBtn.setAttribute('aria-label', '일정 삭제');
            deleteBtn.innerHTML = '<span aria-hidden="true">×</span>';
            deleteBtn.addEventListener('pointerdown', (pointerEvent) => {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
            });
            deleteBtn.addEventListener('touchstart', (touchEvent) => {
              touchEvent.preventDefault();
              touchEvent.stopPropagation();
            }, { passive: false });
            deleteBtn.addEventListener('click', (clickEvent) => {
              clickEvent.preventDefault();
              clickEvent.stopPropagation();
              requestDeleteEvent(event.id, date);
            });
            bubble.appendChild(deleteBtn);
          }
          bubble.dataset.eventId = String(event.id || '');
          bubble.dataset.dayIndex = String(dayIndex);
          bubble.dataset.date = date;
          bubble.dataset.startSlot = String(startSlot);
          bubble.dataset.endSlot = String(endSlot);
          bubble.dataset.need = String(need);
          bubble.dataset.lane = String(lane);
          if (canManageOccurrence) {
            bubble.classList.add('editable');
            bubble.addEventListener('pointerdown', (pointerEvent) => {
              if (String(pointerEvent?.pointerType || 'mouse') !== 'mouse') {
                return;
              }
              startMasterEventEdit(pointerEvent, event, dayIndex, date, startSlot, endSlot, lane, need, bubble);
            });
            bubble.addEventListener('click', (clickEvent) => {
              if (clickEvent.target && typeof clickEvent.target.closest === 'function' && clickEvent.target.closest('.event-bubble-delete')) {
                return;
              }
              if (Date.now() < state.masterEdit.suppressClickUntil) {
                return;
              }
              openQuickEditEventModal(event.id, date);
            });
          }
          overlay.appendChild(bubble);
        });
      }
    }

    return { render };
  }

  return { create };
});

/* master-calendar/month-view.js */
(function (root, factory) {
  const api = factory();
  root.MasterCalendarMonthView = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      dayNames,
      monthRows,
      monthRowHeight,
      getWeekStart,
      addDays,
      formatDateInput,
      isSameCalendarDate,
      isExhibitionKind,
      getEventsForDate,
      isAllDayKind,
      timeToSlot,
      kindToClass,
      getEventDisplayTitle,
      canManageEventOccurrence,
      setRoleLockedMessage,
      openQuickEditEventModal,
      syncCalendarHeaderScrollbarGap
    } = dependencies;

    function render(dayHeader, body, wrap) {
      if (!dayHeader || !body) return;
      dayHeader.innerHTML = '';
      body.innerHTML = '';

      if (wrap) wrap.classList.add('is-month-mode');
      dayHeader.classList.add('month-header');
      body.classList.add('month-body');

      dayNames.forEach((name) => {
        const header = document.createElement('div');
        header.className = 'month-day-header';
        header.textContent = name;
        dayHeader.appendChild(header);
      });

      const monthGrid = document.createElement('div');
      monthGrid.className = 'month-grid';
      monthGrid.style.setProperty('--month-row-height', `${monthRowHeight}px`);

      const gridStart = getWeekStart(state.monthStart);
      const gridEnd = addDays(gridStart, monthRows * 7 - 1);
      const currentMonth = state.monthStart.getMonth();
      const dateCellMap = new Map();
      const today = new Date();

      for (let i = 0; i < monthRows * 7; i += 1) {
        const dayDate = addDays(gridStart, i);
        const dateKey = formatDateInput(dayDate);
        const cell = document.createElement('div');
        cell.className = 'month-day-cell';
        if (dayDate.getMonth() !== currentMonth) {
          cell.classList.add('is-outside-month');
        }
        if (isSameCalendarDate(dayDate, today)) {
          cell.classList.add('is-today');
        }

        const dayNum = document.createElement('div');
        dayNum.className = 'month-day-number';
        dayNum.textContent = String(dayDate.getDate());
        if (isSameCalendarDate(dayDate, today)) {
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dayNum.appendChild(document.createTextNode(' '));
          dayNum.appendChild(badge);
        }
        cell.appendChild(dayNum);

        const timedStack = document.createElement('div');
        timedStack.className = 'month-events-stack';
        cell.appendChild(timedStack);

        monthGrid.appendChild(cell);
        dateCellMap.set(dateKey, { timedStack, cell });
      }

      const spanOverlay = document.createElement('div');
      spanOverlay.className = 'month-span-overlay';
      monthGrid.appendChild(spanOverlay);

      const exhibitions = state.events
        .filter((event) => event && event.id && isExhibitionKind(event.kind) && event.date)
        .map((event) => {
          const start = new Date(`${event.date}T00:00:00`);
          const end = new Date(`${(event.endDate || event.date)}T00:00:00`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
          return {
            event,
            start,
            end: end < start ? start : end
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aLen = Math.floor((a.end - a.start) / 86400000);
          const bLen = Math.floor((b.end - b.start) / 86400000);
          if (aLen !== bLen) return bLen - aLen;
          return a.start - b.start;
        });

      const rowLaneEnds = Array.from({ length: monthRows }, () => []);
      const spanLayouts = [];
      const daySpanLaneDepth = new Map();

      exhibitions.forEach((entry) => {
        if (entry.end < gridStart || entry.start > gridEnd) return;
        let cursor = entry.start < gridStart ? gridStart : entry.start;
        const finalEnd = entry.end > gridEnd ? gridEnd : entry.end;

        while (cursor <= finalEnd) {
          const row = Math.floor((cursor - gridStart) / (7 * 86400000));
          const rowStart = addDays(gridStart, row * 7);
          const rowEnd = addDays(rowStart, 6);
          const segStart = cursor;
          const segEnd = finalEnd < rowEnd ? finalEnd : rowEnd;
          const startCol = Math.max(0, Math.floor((segStart - rowStart) / 86400000));
          const endCol = Math.max(startCol, Math.floor((segEnd - rowStart) / 86400000));
          const spanDays = Math.max(1, endCol - startCol + 1);

          const laneEnds = rowLaneEnds[row] || [];
          let lane = 0;
          while (lane < laneEnds.length && startCol <= laneEnds[lane]) {
            lane += 1;
          }
          if (lane === laneEnds.length) laneEnds.push(endCol);
          else laneEnds[lane] = endCol;
          rowLaneEnds[row] = laneEnds;

          for (let col = startCol; col <= endCol; col += 1) {
            const dayKey = formatDateInput(addDays(rowStart, col));
            const currentDepth = Number(daySpanLaneDepth.get(dayKey) || 0);
            daySpanLaneDepth.set(dayKey, Math.max(currentDepth, lane + 1));
          }

          spanLayouts.push({
            eventId: entry.event.id,
            title: entry.event.title || '전시회',
            kind: entry.event.kind,
            row,
            lane,
            startCol,
            spanDays
          });

          cursor = addDays(segEnd, 1);
        }
      });

      for (let i = 0; i < monthRows * 7; i += 1) {
        const date = formatDateInput(addDays(gridStart, i));
        const refs = dateCellMap.get(date);
        if (!refs) continue;

        const spanDepth = Number(daySpanLaneDepth.get(date) || 0);
        refs.timedStack.style.paddingTop = `${2 + spanDepth * 18}px`;

        const events = (getEventsForDate(date) || [])
          .slice()
          .sort((a, b) => {
            const aAllDay = isAllDayKind(a.kind) ? 0 : 1;
            const bAllDay = isAllDayKind(b.kind) ? 0 : 1;
            if (aAllDay !== bAllDay) return aAllDay - bAllDay;

            if (aAllDay === 0 && bAllDay === 0) {
              const aStart = new Date(`${a.date}T00:00:00`);
              const aEnd = new Date(`${(a.endDate || a.date)}T00:00:00`);
              const bStart = new Date(`${b.date}T00:00:00`);
              const bEnd = new Date(`${(b.endDate || b.date)}T00:00:00`);
              const aLen = Math.max(0, Math.floor((aEnd - aStart) / 86400000));
              const bLen = Math.max(0, Math.floor((bEnd - bStart) / 86400000));
              if (aLen !== bLen) return bLen - aLen;
            }

            const slotDiff = timeToSlot(a.start) - timeToSlot(b.start);
            if (slotDiff !== 0) return slotDiff;
            const aOther = a.kind === '기타' ? 1 : 0;
            const bOther = b.kind === '기타' ? 1 : 0;
            if (aOther !== bOther) return aOther - bOther;
            return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
          });

        events.forEach((event) => {
          if (!event || !event.id) return;

          if (isExhibitionKind(event.kind)) {
            return;
          }

          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `month-mini-pill ${kindToClass(event.kind)}`;
          const start = event.start || '';
          const label = `${start ? `${start} ` : ''}${getEventDisplayTitle(event, '새 일정')}`;
          pill.textContent = label;
          if (!canManageEventOccurrence(event, date)) {
            setRoleLockedMessage(pill);
          }
          pill.addEventListener('click', () => {
            if (!canManageEventOccurrence(event, date)) return;
            openQuickEditEventModal(event.id, date);
          });
          refs.timedStack.appendChild(pill);
        });
      }

      spanLayouts.forEach((layout) => {
        const span = document.createElement('button');
        span.type = 'button';
        span.className = `month-span-pill ${kindToClass(layout.kind)}`;
        span.textContent = layout.title;
        span.style.left = `calc(${(layout.startCol / 7) * 100}% + 4px)`;
        span.style.width = `calc(${(layout.spanDays / 7) * 100}% - 8px)`;
        span.style.top = `${layout.row * monthRowHeight + 22 + layout.lane * 18}px`;
        const spanEvent = state.events.find((item) => item && item.id === layout.eventId);
        if (!canManageEventOccurrence(spanEvent, spanEvent?.date || '')) {
          setRoleLockedMessage(span);
        }
        span.addEventListener('click', () => {
          if (!canManageEventOccurrence(spanEvent, spanEvent?.date || '')) return;
          openQuickEditEventModal(layout.eventId, spanEvent?.date || '');
        });
        spanOverlay.appendChild(span);
      });

      body.appendChild(monthGrid);
      syncCalendarHeaderScrollbarGap();
    }

    return { render };
  }

  return { create };
});

/* master-calendar/display-policy.js */
(function initializeMasterCalendarDisplayPolicy(root) {
  'use strict';

  function getBaseLabelText(rule) {
    if (!rule) return '';
    if (rule.type === '수업시간') {
      const className = String(rule.className || '수업시간').trim();
      const instructor = String(rule.instructor || '').trim();
      return instructor ? `${className} · ${instructor}` : className;
    }
    return rule.type;
  }

  function baseTypeToClass(type) {
    if (type === '수업시간') return 'base-class';
    if (type === '개인작업 시간') return 'base-personal';
    if (type === '이용 불가') return 'base-closed';
    return '';
  }

  function isExhibitionKind(kind) {
    const value = String(kind || '').trim();
    return value === '전시회' || value.includes('전시');
  }

  function isKilnKind(kind) {
    const value = String(kind || '').trim();
    return value === '가마 소성' || value === '가마 관련' || value.includes('가마');
  }

  function kindToClass(kind) {
    if (kind === '수강') return 'kind-class';
    if (kind === '개인작업') return 'kind-personal';
    if (kind === '강사 지도 하 개인작업') return 'kind-guided';
    if (isExhibitionKind(kind)) return 'kind-exhibition';
    if (kind === '기타') return 'kind-other';
    if (isKilnKind(kind)) return 'kind-kiln';
    return 'kind-personal';
  }

  function isAllDayKind(kind) {
    return isKilnKind(kind) || isExhibitionKind(kind);
  }

  function getAllDayPriority(kind) {
    if (isKilnKind(kind)) return 0;
    if (isExhibitionKind(kind)) return 1;
    return 2;
  }

  function normalizeKilnCategory(value, categoryOptions) {
    const text = String(value || '').trim();
    return categoryOptions.includes(text) ? text : '';
  }

  function extractKilnCategoryFromTitle(title, categoryOptions) {
    const text = String(title || '').trim();
    const matched = text.match(/^가마\s*소성\s*\(([^)]+)\)$/);
    if (!matched) return '';
    return normalizeKilnCategory(matched[1], categoryOptions);
  }

  function buildKilnEventTitle(category, categoryOptions) {
    const normalized = normalizeKilnCategory(category, categoryOptions);
    return normalized ? `가마 소성 (${normalized})` : '가마 소성';
  }

  function getEventDisplayTitle(eventItem, fallbackTitle, categoryOptions) {
    const fallback = String(fallbackTitle || '새 일정');
    if (!eventItem) return fallback;

    if (isKilnKind(eventItem.kind)) {
      const fromCategory = normalizeKilnCategory(eventItem.kilnCategory, categoryOptions);
      if (fromCategory) {
        return buildKilnEventTitle(fromCategory, categoryOptions);
      }

      const fromTitle = String(eventItem.title || '').trim();
      return fromTitle || '가마 소성';
    }

    const title = String(eventItem.title || '').trim();
    return title || fallback;
  }

  const api = Object.freeze({
    getBaseLabelText,
    baseTypeToClass,
    kindToClass,
    isExhibitionKind,
    isAllDayKind,
    getAllDayPriority,
    isKilnKind,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    buildKilnEventTitle,
    getEventDisplayTitle
  });
  root.MasterCalendarDisplayPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* pottery-master-calendar.js */
(function () {
  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;
  const STORAGE_KEY = 'studio-calendar-state-v1';
  const STUDENT_STORAGE_KEY = 'pottery-students-v1';
  const PERSONAL_WORK_STORAGE_KEY = 'pottery-personal-work-v1';
  const SLOT_HEIGHT = 28;
  const BASE_EDITOR_START_SLOT = 20; // 10:00
  const BASE_EDITOR_END_SLOT = 36; // 18:00
  const HOLD_TO_MOVE_MS = 280;
  const BASE_EDITOR_SCROLL_EDGE_PX = 26;
  const BASE_EDITOR_SCROLL_STEP = 14;
  const BASE_RESIZE_EDGE_PX = 6;
  const ALL_DAY_ROW_HEIGHT = 28;
  const EVENT_SELECTOR_ROW_HEIGHT = 20;
  const EVENT_SELECTOR_TIME_COL_WIDTH = 56;
  const MONTH_ROWS = 6;
  const MONTH_ROW_HEIGHT = 128;
  const MIN_CALENDAR_ZOOM = 0.7;
  const MAX_CALENDAR_ZOOM = 1.5;
  const CALENDAR_ZOOM_STEP = 0.1;
  const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
  const ROLE_LOCK_MESSAGE = '계정 등급으로 인해 선택 불가능';
  const KILN_CATEGORY_OPTIONS = ['초벌', '재벌'];
  const displayPolicy = globalThis.MasterCalendarDisplayPolicy;
  let studioPageInitialized = false;
  let studioPageStartupStarted = false;
  let resolveMasterCalendarReady;
  let rejectMasterCalendarReady;
  const pendingExternalStateKeys = new Set();

  const state = {
    weekStart: getWeekStart(new Date()),
    monthStart: getMonthStart(new Date()),
    viewMode: 'week',
    baseUndoStack: [],
    events: [],
    baseRules: [],
    baseRuleTimeline: [],
    baseWeekOverrides: {},
    baseEditorWeekStart: getWeekStart(new Date()),
    baseEditMode: 'base',
    studioUsers: [],
    instructors: [],
    classTeachingLog: [],
    eventSelection: {
      active: false,
      dragging: false,
      mode: '',
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      anchorSlot: null,
      resizeEdge: '',
      moveTimerId: null,
      moveDuration: 1
    },
    dragBase: {
      active: false,
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      gridEl: null,
      ghostEl: null
    },
    moveBase: {
      active: false,
      ruleId: null,
      ruleType: '',
      ruleLabel: '',
      originDay: null,
      dayIndex: null,
      duration: 1,
      originStartSlot: 0,
      previewStartSlot: 0,
      previewEndSlot: 1,
      gridEl: null,
      ghostEl: null,
      timerId: null,
      moved: false
    },
    resizeBase: {
      active: false,
      ruleId: null,
      ruleType: '',
      ruleLabel: '',
      dayIndex: null,
      edge: null,
      originStartSlot: 0,
      originEndSlot: 1,
      previewStartSlot: 0,
      previewEndSlot: 1,
      gridEl: null,
      ghostEl: null
    },
    editBaseRuleId: null,
    masterCreate: {
      active: false,
      mode: '',
      dayIndex: null,
      anchorSlot: null,
      startSlot: null,
      endSlot: null,
      overlayEl: null,
      previewEl: null
    },
    masterEdit: {
      active: false,
      eventId: null,
      occurrenceDate: '',
      mode: '',
      edge: '',
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      duration: 1,
      capacity: 1,
      originLane: 0,
      kind: '',
      title: '',
      repeatWeekly: false,
      anchorOffset: 0,
      bubbleEl: null,
      occupancySnapshot: null,
      validPreview: false,
      targetDayIndex: null,
      targetStartSlot: null,
      targetEndSlot: null,
      targetLane: 0,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerId: null,
      touchIdentifier: null,
      pointerMoved: false,
      suppressClickUntil: 0
    },
    recurringDelete: {
      eventId: '',
      occurrenceDate: ''
    },
    recurringMove: {
      eventId: '',
      occurrenceDate: '',
      nextDate: '',
      nextStart: '',
      nextEnd: '',
      nextClassType: '',
      nextInstructor: '',
      nextBaseRuleId: ''
    },
    deleteConfirm: {
      eventId: ''
    },
    baseEventFollowPrompt: {
      pending: null
    },
    access: {
      userName: '',
      studioRole: ''
    },
    eventKindOptionsHtml: '',
    calendarZoom: 1
  };

  const baseRulesDomain = globalThis.MasterCalendarBaseRules.create({
    state,
    getWeekStart,
    formatDateInput,
    createBaseRuleId
  });

  const baseTransactionController = globalThis.MasterCalendarBaseTransactionController.create({
    state,
    document,
    SLOTS_PER_DAY,
    baseRulesDomain,
    getWeekStart,
    formatDateInput,
    addDays,
    timeToSlot,
    slotToTime,
    getEventsForDate,
    isAllDayKind,
    openModal,
    closeModal,
    saveState,
    renderAll,
    applyClassEventBaseMetadata,
    alert: (message) => alert(message),
    now: () => Date.now(),
    random: () => Math.random()
  });

  const quickCreateController = globalThis.MasterCalendarQuickCreateController.create({
    state,
    document,
    SLOT_HEIGHT,
    canCreateFromBaseRule,
    getBaseRuleForSlot,
    formatDateInput,
    addDays,
    slotToTime,
    buildDailyOccupancyMap,
    findLane,
    openEventModal
  });

  const navigationController = globalThis.MasterCalendarNavigationController.create({
    document,
    state,
    minCalendarZoom: MIN_CALENDAR_ZOOM,
    maxCalendarZoom: MAX_CALENDAR_ZOOM,
    dayNames: DAY_NAMES,
    slotHeight: SLOT_HEIGHT,
    slotsPerDay: SLOTS_PER_DAY,
    allDayRowHeight: ALL_DAY_ROW_HEIGHT,
    monthRows: MONTH_ROWS,
    monthRowHeight: MONTH_ROW_HEIGHT,
    getWeekStart,
    getMonthStart,
    addDays,
    addMonths,
    formatDateDisplay,
    formatMonthDate,
    isSameCalendarDate,
    formatDateInput,
    weekViewModule: globalThis.MasterCalendarWeekView,
    monthViewModule: globalThis.MasterCalendarMonthView,
    isAllDayKind,
    isExhibitionKind,
    getAllDayPriority,
    canManageEventOccurrence,
    kindToClass,
    escapeHtml,
    getEventDisplayTitle,
    requestDeleteEvent,
    setRoleLockedMessage,
    openQuickEditEventModal,
    slotToTime,
    getBaseRuleForSlot,
    baseTypeToClass,
    canCreateFromBaseRule,
    startMasterCreate,
    moveMasterCreate,
    finalizeMasterCreate,
    isBaseLabelStart,
    getBaseLabelText,
    getEventsForDate,
    timeToSlot,
    findLane,
    startMasterEventEdit
  });

  const bindingsController = globalThis.MasterCalendarBindingsController.create({
    document,
    window,
    state,
    CALENDAR_ZOOM_STEP,
    alert,
    toggleMobileInfoPanels,
    setCalendarZoom,
    shiftCurrentRange,
    renderAll,
    setViewMode,
    setCalendarToToday,
    isStudioAdmin,
    isStudioInstructor,
    isStudioArtist,
    isArtistRegisteredForPersonalWork,
    openEventModal,
    openModal,
    getWeekStart,
    setBaseCreateControlsVisible,
    loadStudioInstructors,
    populateInstructorOptions,
    renderBaseEditorGrid,
    renderBaseEditorWeekLabel,
    renderBaseEditModeToggle,
    syncBaseClassNameVisibility,
    updateUndoButtonState,
    addDays,
    getBaseEditorWeekStart,
    hasWeekOverride,
    saveEventFromModal,
    saveQuickEditEventFromModal,
    handleDeleteRecurringOne,
    handleDeleteRecurringFollowing,
    closeModal,
    handleMoveRecurringOne,
    handleMoveRecurringFollowing,
    resetRecurringMoveState,
    handleDeleteConfirmOk,
    canUseEventKindByRole,
    resetEventSelectionState,
    syncEventInputMode,
    renderEventSelectorGrid,
    syncEventSelectionFromInputs,
    renderEventPersonalUserInfo,
    handleEventUserSelectChange,
    handleQuickEditUserSelectChange,
    syncEditBaseClassNameVisibility,
    saveBaseEditFromModal,
    deleteBaseEditFromModal,
    resolveBaseEventFollowPrompt,
    undoBaseChange,
    handleBaseEditorGlobalMouseUp,
    handleBaseEditorGlobalMouseMove,
    handleMasterCalendarPointerMove,
    handleMasterCalendarPointerUp,
    handleMasterCalendarPointerCancel,
    handleBaseEditorUndoShortcut,
    handleBaseGridHoverCursor,
    clearBaseGridHoverCursor,
    handleEventSelectorHoverCursor,
    clearEventSelectorHoverCursor,
    syncCalendarHeaderScrollbarGap,
    syncMobileInfoPanelsState,
    applyStudioRoleUiLocks
  });

  window.masterCalendarReady = new Promise((resolve, reject) => {
    resolveMasterCalendarReady = resolve;
    rejectMasterCalendarReady = reject;
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (!keys.length) return;

    if (!studioPageInitialized) {
      keys.forEach((key) => pendingExternalStateKeys.add(key));
      return;
    }

    if (keys.includes(STORAGE_KEY)) {
      loadState();
      renderAll();
      return;
    }

    if (keys.includes(PERSONAL_WORK_STORAGE_KEY) || keys.includes('users')) {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }
  });

  window.addEventListener('storage', (event) => {
    const changedKey = String(event?.key || '');
    if (!changedKey) return;

    if (!studioPageInitialized) {
      pendingExternalStateKeys.add(changedKey);
      return;
    }

    if (changedKey === STORAGE_KEY) {
      loadState();
      renderAll();
      return;
    }

    if (changedKey === PERSONAL_WORK_STORAGE_KEY || changedKey === 'users') {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }
  });

  function waitForCloudSyncReady(timeoutMs = 4000) {
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

  async function initializeStudioPage() {
    if (!enforceStudioAccess()) return;
    await waitForCloudSyncReady();
    loadState();
    setCalendarToToday();
    bindEvents();
    renderAll();
    startWorkshopUsageTicker();
    studioPageInitialized = true;
    pendingExternalStateKeys.clear();
  }

  function startWorkshopUsageTicker() {
    setInterval(() => {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }, 60 * 1000);
  }

  function setCalendarToToday() {
    return navigationController.setCalendarToToday();
  }

  function enforceStudioAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }

    const siteAccess = normalizeSiteAccess(currentUser.siteAccess);
    if (siteAccess !== 'pottery' && siteAccess !== 'both') {
      alert('도예공방 10.19 접근 권한이 없습니다.');
      window.location.href = 'index.html';
      return false;
    }

    const studioRole = getEffectiveStudioRole(currentUser);
    if (studioRole !== '어드민' && studioRole !== '강사' && studioRole !== '작가' && studioRole !== '수강생') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }
    if (studioRole === '수강생') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }

    state.access.userName = String(currentUser?.name || currentUser?.username || '').trim();
    state.access.studioRole = studioRole;

    return true;
  }

  function normalizeSiteAccess(access) {
    const raw = String(access || '').trim().toLowerCase();
    if (raw === 'both' || raw === 'all') return 'both';
    if (raw === 'pottery' || raw === 'studio') return 'pottery';
    if (raw === 'gallery') return 'gallery';
    return '';
  }

  function getActiveStudioRole() {
    return String(state.access.studioRole || '').trim();
  }

  function getActiveStudioUserName() {
    return String(state.access.userName || '').trim();
  }

  function isStudioAdmin() {
    return getActiveStudioRole() === '어드민';
  }

  function isStudioInstructor() {
    return getActiveStudioRole() === '강사';
  }

  function isStudioArtist() {
    return getActiveStudioRole() === '작가';
  }

  function setRoleLockedMessage(el) {
    if (!el) return;
    el.classList.add('role-locked');
    el.setAttribute('title', ROLE_LOCK_MESSAGE);
    el.setAttribute('data-locked-message', ROLE_LOCK_MESSAGE);
    el.setAttribute('aria-disabled', 'true');
  }

  function clearRoleLockedMessage(el) {
    if (!el) return;
    el.classList.remove('role-locked');
    el.removeAttribute('data-locked-message');
    el.removeAttribute('aria-disabled');
    el.removeAttribute('title');
  }

  function isArtistRegisteredForPersonalWork() {
    if (!isStudioArtist()) return true;
    const me = getActiveStudioUserName();
    if (!me) return false;
    return getPersonalUsersForEvents().includes(me);
  }

  function canUseEventKindByRole(kind) {
    if (isStudioAdmin()) return true;
    if (isStudioArtist()) return kind === '개인작업';
    if (isStudioInstructor()) {
      return kind === '수강' || kind === '개인작업' || kind === '강사 지도 하 개인작업';
    }
    return false;
  }

  function isPersonalBaseRange(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      if (!rule || String(rule.type || '') !== '개인작업 시간') return false;
    }
    return true;
  }

  function isInstructorOwnedClassRange(date, startTime, endTime, requireExactClassBlock) {
    const instructorName = getActiveStudioUserName();
    if (!instructorName) return false;

    if (requireExactClassBlock) {
      const rule = getClassBaseRuleForRange(date, startTime, endTime);
      if (!rule) return false;
      return String(rule.instructor || '').trim() === instructorName;
    }

    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      if (!rule || String(rule.type || '') !== '수업시간') return false;
      if (String(rule.instructor || '').trim() !== instructorName) return false;
    }

    return true;
  }

  function canManageEventPlacementByRole(kind, date, startTime, endTime, title) {
    if (isStudioAdmin()) return true;
    if (!kind || !date || !startTime || !endTime) return false;
    if (!canUseEventKindByRole(kind)) return false;

    if (isStudioArtist()) {
      const owner = String(title || '').trim();
      const activeUserName = getActiveStudioUserName();
      if (!getPersonalUsersForEvents().includes(activeUserName)) {
        return false;
      }
      return owner === activeUserName && isPersonalBaseRange(date, startTime, endTime);
    }

    if (isStudioInstructor()) {
      if (kind === '개인작업') {
        return isPersonalBaseRange(date, startTime, endTime);
      }
      if (kind === '수강') {
        return isInstructorOwnedClassRange(date, startTime, endTime, true);
      }
      if (kind === '강사 지도 하 개인작업') {
        return isInstructorOwnedClassRange(date, startTime, endTime, false);
      }
      return false;
    }

    return false;
  }

  function canManageEventOccurrence(eventItem, occurrenceDate) {
    if (!eventItem) return false;
    if (isStudioAdmin()) return true;

    const kind = String(eventItem.kind || '');
    if (isAllDayKind(kind)) return false;

    const date = String(occurrenceDate || eventItem.date || '').trim();
    const start = String(eventItem.start || '').trim();
    const end = String(eventItem.end || '').trim();
    const title = String(eventItem.title || '').trim();
    return canManageEventPlacementByRole(kind, date, start, end, title);
  }

  function canCreateFromBaseRule(baseRule) {
    const type = String(baseRule?.type || '').trim();
    if (!type) return false;
    if (isStudioAdmin()) return true;

    if (isStudioArtist()) {
      return type === '개인작업 시간';
    }

    if (isStudioInstructor()) {
      if (type === '개인작업 시간') return true;
      if (type === '수업시간') {
        return String(baseRule?.instructor || '').trim() === getActiveStudioUserName();
      }
      return false;
    }

    return false;
  }

  function bindEvents() {
    return bindingsController.bindEvents();
  }

  function isMobileViewport() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) return true;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return window.innerWidth <= 980;
  }

  function syncMobileInfoPanelsState() {
    const toggleBtn = document.getElementById('mobile-info-toggle-btn');
    const sidebar = document.querySelector('.studio-sidebar');
    const infoPanels = document.getElementById('studio-mobile-info-panels');
    if (!toggleBtn || !sidebar || !infoPanels) return;

    const mobile = isMobileViewport();
    if (!mobile) {
      sidebar.classList.remove('mobile-info-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = '범례 및 개인작업 현황 보기';
      infoPanels.hidden = false;
      return;
    }

    const opened = sidebar.classList.contains('mobile-info-open');
    infoPanels.hidden = !opened;
    toggleBtn.setAttribute('aria-expanded', opened ? 'true' : 'false');
    toggleBtn.textContent = opened ? '범례 및 개인작업 현황 닫기' : '범례 및 개인작업 현황 보기';
  }

  function toggleMobileInfoPanels() {
    const sidebar = document.querySelector('.studio-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-info-open');
    syncMobileInfoPanelsState();
  }

  function getCalendarSlotHeight() {
    return SLOT_HEIGHT;
  }

  function getCalendarZoomFactor() {
    return navigationController.getCalendarZoomFactor();
  }

  function applyCalendarZoomStyles() {
    return navigationController.applyCalendarZoomStyles();
  }

  function setCalendarZoom(nextZoom) {
    return navigationController.setCalendarZoom(nextZoom);
  }

  function updateCalendarZoomButtons() {
    return navigationController.updateCalendarZoomButtons();
  }

  function applyStudioRoleUiLocks() {
    const baseBtn = document.getElementById('open-base-editor-btn');
    if (baseBtn && !isStudioAdmin()) {
      baseBtn.disabled = false;
      setRoleLockedMessage(baseBtn);
    } else if (baseBtn) {
      clearRoleLockedMessage(baseBtn);
    }

    const addBtn = document.getElementById('open-add-event-btn');
    if (!addBtn) return;

    if (!isStudioAdmin() && !isStudioInstructor() && !isStudioArtist()) {
      addBtn.disabled = false;
      setRoleLockedMessage(addBtn);
      return;
    }

    if (isStudioArtist() && !isArtistRegisteredForPersonalWork()) {
      addBtn.disabled = true;
      addBtn.classList.add('role-locked');
      addBtn.setAttribute('title', '개인작업 관리에 등록된 이용자만 일정 추가가 가능합니다.');
      addBtn.setAttribute('data-locked-message', '개인작업 관리에 등록된 이용자만 일정 추가가 가능합니다.');
      addBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    addBtn.disabled = false;
    clearRoleLockedMessage(addBtn);
  }

  function renderAll() {
    applyStudioRoleUiLocks();
    syncMobileInfoPanelsState();
    updateCalendarZoomButtons();
    renderMyWorkshopUsagePanel();
    syncViewToggleButtons();
    renderWeekLabel();
    renderCalendar();
    renderBaseEditorWeekLabel();
    renderBaseEditModeToggle();
    renderBaseEditorGrid();
    updateUndoButtonState();
  }

  function refreshWorkshopUsageUi() {
    renderMyWorkshopUsagePanel();
    renderEventPersonalUserInfo();
  }

  function renderWeekLabel() {
    return navigationController.renderWeekLabel();
  }

  function renderBaseEditorWeekLabel() {
    const labelEl = document.getElementById('base-week-label');
    if (!labelEl) return;
    const start = getBaseEditorWeekStart();
    const end = addDays(start, 6);
    labelEl.textContent = `${formatDateDisplay(start)} ~ ${formatDateDisplay(end)}`;
  }

  function renderBaseEditModeToggle() {
    const switchEl = document.getElementById('base-edit-mode-switch');
    const labelEl = document.getElementById('base-edit-mode-label');
    const gridEl = document.getElementById('base-editor-grid');
    const fromCurrentCheckbox = document.getElementById('base-edit-from-current-week');
    const overrideHintEl = document.getElementById('base-override-week-hint');
    const isOverrideWeek = hasWeekOverride(getBaseEditorWeekStart());
    if (isOverrideWeek) {
      state.baseEditMode = 'week';
    }
    const isWeek = state.baseEditMode === 'week';

    if (switchEl) {
      switchEl.checked = isWeek;
      switchEl.disabled = isOverrideWeek;
    }
    if (overrideHintEl) {
      overrideHintEl.hidden = !isOverrideWeek;
    }
    if (labelEl) {
      labelEl.textContent = isWeek ? '1주 시간표 수정 모드' : '기본 시간표 수정 모드';
      labelEl.classList.toggle('is-week', isWeek);
    }
    if (gridEl) {
      gridEl.classList.toggle('is-week-edit-mode', isWeek);
    }
    if (fromCurrentCheckbox) {
      fromCurrentCheckbox.disabled = isWeek;
      if (isWeek) fromCurrentCheckbox.checked = false;
      const row = fromCurrentCheckbox.closest('.base-from-week-row');
      if (row) row.classList.toggle('is-disabled', isWeek);
    }
  }

  function setBaseCreateControlsVisible(visible) {
    const controls = document.getElementById('base-create-controls');
    const addBtn = document.getElementById('base-add-block-btn');
    if (!controls || !addBtn) return;

    controls.classList.toggle('is-hidden', !visible);
    addBtn.style.display = visible ? 'none' : '';
    if (!visible) {
      document.getElementById('base-type').value = '';
      document.getElementById('base-class-name').value = '';
      document.getElementById('base-instructor').value = '';
      document.getElementById('base-apply-weekly').checked = false;
      syncBaseClassNameVisibility();
    }
  }

  function isBaseCreateControlsVisible() {
    const controls = document.getElementById('base-create-controls');
    if (!controls) return false;
    return !controls.classList.contains('is-hidden');
  }

  function setViewMode(mode) {
    return navigationController.setViewMode(mode);
  }

  function shiftCurrentRange(direction) {
    return navigationController.shiftCurrentRange(direction);
  }

  function syncViewToggleButtons() {
    return navigationController.syncViewToggleButtons();
  }

  function renderCalendar() {
    return navigationController.renderCalendar();
  }

  let pointerController = null;

  function getPointerController() {
    if (!pointerController) {
      pointerController = globalThis.MasterCalendarPointerController.create({
        document,
        state,
        slotsPerDay: SLOTS_PER_DAY,
        slotHeight: SLOT_HEIGHT,
        resizeEdgePx: BASE_RESIZE_EDGE_PX,
        canManageEventOccurrence,
        getCalendarZoomFactor,
        getBaseRuleForSlot,
        formatDateInput,
        addDays,
        slotToTime,
        canManageEventPlacementByRole,
        isEventPlacementAllowed,
        buildDailyOccupancyMap,
        occupancy: globalThis.MasterCalendarOccupancy,
        commandPlanner: globalThis.MasterCalendarCommands,
        getClassBaseRuleForRange,
        applyClassEventBaseMetadata,
        saveState,
        refreshWorkshopUsageUi,
        openQuickEditEventModal,
        openModal,
        resetMasterCreateState,
        finalizeMasterCreate,
        renderCalendar
      });
    }
    return pointerController;
  }

  function renderWeekCalendar(dayHeader, body, wrap) {
    return navigationController.renderWeekCalendar(dayHeader, body, wrap);
  }

  function renderMonthCalendar(dayHeader, body, wrap) {
    return navigationController.renderMonthCalendar(dayHeader, body, wrap);
  }

  function syncCalendarHeaderScrollbarGap() {
    return navigationController.syncCalendarHeaderScrollbarGap();
  }

  function startMasterCreate(event, dayIndex, slot, baseRule) {
    return quickCreateController.startMasterCreate(event, dayIndex, slot, baseRule);
  }

  function moveMasterCreate(dayIndex, slot) {
    return quickCreateController.moveMasterCreate(dayIndex, slot);
  }

  function finalizeMasterCreate() {
    return quickCreateController.finalizeMasterCreate();
  }

  function resetMasterCreateState() {
    return quickCreateController.resetMasterCreateState();
  }

  function updateMasterCreatePreview() {
    return quickCreateController.updateMasterCreatePreview();
  }

  function removeMasterCreatePreview() {
    return quickCreateController.removeMasterCreatePreview();
  }

  function startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble) {
    return getPointerController().startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble);
  }

  function getMasterEventResizeEdge(event, bubble) {
    return getPointerController().getMasterEventResizeEdge(event, bubble);
  }

  function handleMasterCalendarPointerMove(event) {
    return getPointerController().handleMasterCalendarPointerMove(event);
  }

  function applyMasterCalendarEditMove(clientX, clientY, sourceEvent) {
    return getPointerController().applyMasterCalendarEditMove(clientX, clientY, sourceEvent);
  }

  function getMasterEditPlacement(dayIndex, startSlot, endSlot, options) {
    return getPointerController().getMasterEditPlacement(dayIndex, startSlot, endSlot, options);
  }

  function applyMasterEditPreview() {
    return getPointerController().applyMasterEditPreview();
  }

  function handleMasterCalendarPointerUp(event) {
    return getPointerController().handleMasterCalendarPointerUp(event);
  }

  function finalizeMasterCalendarEdit(clientX, clientY) {
    return getPointerController().finalizeMasterCalendarEdit(clientX, clientY);
  }

  function handleMasterCalendarPointerCancel(event) {
    return getPointerController().handleMasterCalendarPointerCancel(event);
  }

  function getTrackedMasterTouch(event) {
    return getPointerController().getTrackedMasterTouch(event);
  }

  function handleMasterCalendarTouchMove(event) {
    return getPointerController().handleMasterCalendarTouchMove(event);
  }

  function handleMasterCalendarTouchEnd(event) {
    return getPointerController().handleMasterCalendarTouchEnd(event);
  }

  function handleMasterCalendarTouchCancel() {
    return getPointerController().handleMasterCalendarTouchCancel();
  }

  function resetMasterEditState() {
    return getPointerController().resetMasterEditState();
  }

  const quickEditController = globalThis.MasterCalendarQuickEditController.create({
    document,
    state,
    slotsPerDay: SLOTS_PER_DAY,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    roleLockMessage: ROLE_LOCK_MESSAGE,
    canManageEventOccurrence,
    loadStudioUsers,
    isExhibitionKind,
    isKilnKind,
    isAllDayKind,
    populateEventUserOptions,
    isStudioArtist,
    getActiveStudioUserName,
    escapeHtml,
    setRoleLockedMessage,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    formatDateInput,
    openModal,
    closeModal,
    timeToSlot,
    canManageEventPlacementByRole,
    getDayIndexFromDateString,
    isEventPlacementAllowed,
    buildDailyOccupancyMap,
    hasEnoughCapacityForRange,
    getClassBaseRuleForRange,
    buildKilnEventTitle,
    applyClassEventBaseMetadata,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    alert: (message) => alert(message)
  });

  function openQuickEditEventModal(eventId, occurrenceDate) {
    quickEditController.openQuickEditEventModal(eventId, occurrenceDate);
  }

  function saveQuickEditEventFromModal() {
    quickEditController.saveQuickEditEventFromModal();
  }

  function getMasterPointerDaySlot(clientX, clientY) {
    return getPointerController().getMasterPointerDaySlot(clientX, clientY);
  }

  function findLane(occupancy, startSlot, endSlot, need) {
    return globalThis.MasterCalendarOccupancy.findLane(occupancy, startSlot, endSlot, need);
  }

  function canPlaceInLane(occupancy, startSlot, endSlot, need, lane) {
    return globalThis.MasterCalendarOccupancy.canPlaceInLane(occupancy, startSlot, endSlot, need, lane);
  }

  function createEmptyDailyOccupancy() {
    return globalThis.MasterCalendarOccupancy.createEmptyDailyOccupancy(SLOTS_PER_DAY);
  }

  function cloneDailyOccupancy(occupancy) {
    return globalThis.MasterCalendarOccupancy.cloneDailyOccupancy(occupancy, SLOTS_PER_DAY);
  }

  function markLaneOccupancy(occupancy, startSlot, endSlot, lane, need) {
    globalThis.MasterCalendarOccupancy.markLaneOccupancy(occupancy, startSlot, endSlot, lane, need);
  }

  function buildMasterEditOccupancySnapshot(excludeEventId) {
    return getPointerController().buildMasterEditOccupancySnapshot(excludeEventId);
  }

  function getMasterEditOccupancyMap(date) {
    return getPointerController().getMasterEditOccupancyMap(date);
  }

  const modalController = globalThis.MasterCalendarModalController.create({
    document,
    state,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    baseEditorStartSlot: BASE_EDITOR_START_SLOT,
    eventSelectorRowHeight: EVENT_SELECTOR_ROW_HEIGHT,
    getWeekStart,
    formatDateInput,
    isStudioArtist,
    isStudioInstructor,
    getActiveStudioUserName,
    setRoleLockedMessage,
    loadStudioUsers,
    populateEventUserOptions,
    syncEventInputMode,
    syncEventSelectionFromInputs,
    clearEventSelectionMoveTimer,
    openModal,
    renderEventSelectorGrid,
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    timeToSlot,
    escapeHtml
  });

  const eventModalController = globalThis.MasterCalendarEventModalController.create({
    document,
    state,
    modalController,
    commandPlanner: globalThis.MasterCalendarCommands,
    slotsPerDay: SLOTS_PER_DAY,
    baseResizeEdgePx: BASE_RESIZE_EDGE_PX,
    eventSelectorRowHeight: EVENT_SELECTOR_ROW_HEIGHT,
    eventSelectorTimeColWidth: EVENT_SELECTOR_TIME_COL_WIDTH,
    holdToMoveMs: HOLD_TO_MOVE_MS,
    dayNames: DAY_NAMES,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    roleLockMessage: ROLE_LOCK_MESSAGE,
    isStudioArtist,
    getActiveStudioUserName,
    setRoleLockedMessage,
    populateEventUserOptions,
    renderEventPersonalUserInfo,
    isAllDayKind,
    isKilnKind,
    isExhibitionKind,
    normalizeKilnCategory,
    buildKilnEventTitle,
    canManageEventPlacementByRole,
    getPersonalUsersForEvents,
    getClassBaseRuleForRange,
    getDayIndexFromDateString,
    isBaseRangeRepeatingWeekly,
    isEventPlacementAllowed,
    getBaseRuleForSlot,
    getRulesForWeek,
    getBaseLabelText,
    baseTypeToClass,
    buildDailyOccupancyMap,
    hasEnoughCapacityForRange,
    getEventsForDate,
    findLane,
    getEventDisplayTitle,
    kindToClass,
    getWeekStart,
    addDays,
    formatDateInput,
    formatMonthDate,
    timeToSlot,
    slotToTime,
    escapeHtml,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    closeModal,
    alert: (message) => alert(message),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timerId) => clearTimeout(timerId)
  });

  const participantsController = globalThis.MasterCalendarParticipantsController.create({
    state,
    document,
    repository: globalThis.MasterCalendarRepository?.repository,
    scheduleProjectionsModule: globalThis.MasterCalendarScheduleProjections,
    occurrencesModule: globalThis.MasterCalendarOccurrences,
    formatDateInput,
    addDays,
    timeToSlot,
    slotMinutes: SLOT_MINUTES,
    getActiveStudioUserName,
    getEffectiveSiteAccess,
    getEffectiveStudioRole,
    escapeHtml,
    renderEventSelectorGrid
  });

  const recurringEventController = globalThis.MasterCalendarRecurringEventController.create({
    state,
    commandPlanner: globalThis.MasterCalendarCommands,
    canManageEventOccurrence,
    openModal,
    closeModal,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    applyClassEventBaseMetadata,
    createEventId: () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  function openEventModal(preset) {
    eventModalController.openEventModal(preset);
  }

  function resetEventSelectionState() {
    eventModalController.resetEventSelectionState();
  }

  function saveEventFromModal() {
    return eventModalController.saveEventFromModal();
  }

  function getEventsForDate(date) {
    return globalThis.MasterCalendarOccurrences.getEventsForDate({
      events: state.events,
      date,
      includeRangeEvents: true,
      isRangeEvent: (event) => isExhibitionKind(event.kind)
    });
  }

  function requestDeleteEvent(eventId, occurrenceDate) {
    return recurringEventController.requestDeleteEvent(eventId, occurrenceDate);
  }

  function handleDeleteConfirmOk() {
    return recurringEventController.handleDeleteConfirmOk();
  }

  function handleDeleteRecurringOne() {
    return recurringEventController.handleDeleteRecurringOne();
  }

  function handleDeleteRecurringFollowing() {
    return recurringEventController.handleDeleteRecurringFollowing();
  }

  function applyRecurringDeletePlan(scope) {
    return recurringEventController.applyRecurringDeletePlan(scope);
  }

  function finishRecurringDeletePlan(plan, eventId, eventItem) {
    return recurringEventController.finishRecurringDeletePlan(plan, eventId, eventItem);
  }

  function handleMoveRecurringOne() {
    return recurringEventController.handleMoveRecurringOne();
  }

  function handleMoveRecurringFollowing() {
    return recurringEventController.handleMoveRecurringFollowing();
  }

  function applyRecurringMovePlan(scope) {
    return recurringEventController.applyRecurringMovePlan(scope);
  }

  function resetRecurringMoveState() {
    return recurringEventController.resetRecurringMoveState();
  }

  function buildDailyOccupancyMap(date, excludeEventId) {
    return globalThis.MasterCalendarOccupancy.buildDailyOccupancy({
      events: getEventsForDate(date),
      excludeEventId,
      slotCount: SLOTS_PER_DAY,
      timeToSlot,
      isIgnoredKind(kind) {
        return kind === '기타' || isAllDayKind(kind);
      }
    });
  }

  function hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need) {
    return globalThis.MasterCalendarOccupancy.hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need);
  }

  function getDayIndexFromDateString(date) {
    return globalThis.MasterCalendarDateTime.getDayIndexFromDateString(date);
  }

  function getClassBaseRuleForRange(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return null;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));
    const startRule = getBaseRuleForSlot(dayIndex, startSlot, weekStart);
    const endRule = getBaseRuleForSlot(dayIndex, endSlot - 1, weekStart);
    if (!startRule || !endRule) return null;
    if (startRule.id !== endRule.id) return null;
    if (String(startRule.type || '') !== '수업시간') return null;
    if (Number(startRule.startSlot) !== Number(startSlot)) return null;
    if (Number(startRule.endSlot) !== Number(endSlot)) return null;
    return startRule;
  }

  function isClassBlockRepeatingWeekly(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekRule = getClassBaseRuleForRange(date, startTime, endTime);
    if (!weekRule) return false;

    const templateRule = (state.baseRules || []).find((rule) => {
      return String(rule?.type || '') === '수업시간'
        && Number(rule?.day) === Number(dayIndex)
        && Number(rule?.startSlot) === Number(startSlot)
        && Number(rule?.endSlot) === Number(endSlot);
    });
    if (!templateRule) return false;

    return String(templateRule.className || '').trim() === String(weekRule.className || '').trim()
      && String(templateRule.instructor || '').trim() === String(weekRule.instructor || '').trim();
  }

  function getTemplateBaseRuleForSlot(dayIndex, slot) {
    return (state.baseRules || []).find((rule) => {
      return Number(rule?.day) === Number(dayIndex)
        && Number(rule?.startSlot) <= Number(slot)
        && Number(rule?.endSlot) > Number(slot);
    }) || null;
  }

  function isBaseRangeRepeatingWeekly(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));
    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const weekRule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      const templateRule = getTemplateBaseRuleForSlot(dayIndex, slot);
      if (!weekRule || !templateRule) return false;
      if (String(weekRule.type || '') !== String(templateRule.type || '')) return false;

      if (String(weekRule.type || '') === '수업시간') {
        const sameClassName = String(weekRule.className || '').trim() === String(templateRule.className || '').trim();
        const sameInstructor = String(weekRule.instructor || '').trim() === String(templateRule.instructor || '').trim();
        if (!sameClassName || !sameInstructor) return false;
      }
    }

    return true;
  }

  function applyClassEventBaseMetadata(eventItem, targetDate) {
    if (!eventItem || String(eventItem.kind || '') !== '수강') return;
    const date = String(targetDate || eventItem.date || '').trim();
    if (!date) return;

    const rule = getClassBaseRuleForRange(date, eventItem.start, eventItem.end);
    if (!rule) return;

    eventItem.classType = String(rule.className || '수업시간');
    eventItem.instructor = String(rule.instructor || '').trim();
    eventItem.baseRuleId = String(rule.id || '');
  }

  function normalizeStudioRole(role) {
    const value = String(role || '').trim();
    const allowed = ['어드민', '강사', '수강생', '작가'];
    return allowed.includes(value) ? value : '';
  }

  function normalizeInstructorSiteAccess(access) {
    const raw = String(access || '').trim().toLowerCase();
    if (raw === 'both' || raw === 'all') return 'both';
    if (raw === 'pottery' || raw === 'studio') return 'pottery';
    if (raw === 'gallery') return 'gallery';
    return '';
  }

  function getEffectiveSiteAccess(user) {
    const direct = normalizeInstructorSiteAccess(user?.siteAccess);
    if (direct) return direct;
    return 'gallery';
  }

  function getEffectiveStudioRole(user) {
    const direct = normalizeStudioRole(user?.studioRole);
    if (direct) return direct;

    const accountType = String(user?.accountType || '').trim();
    const access = getEffectiveSiteAccess(user);
    if (accountType === '강사') {
      return '강사';
    }
    if ((access === 'pottery' || access === 'both') && accountType === '어드민') {
      return '어드민';
    }

    return '';
  }

  function loadStudioUsers() {
    return participantsController.loadStudioUsers();
  }

  function getStudentUsersForEvents() {
    return participantsController.getStudentUsersForEvents();
  }

  function getPersonalUsersForEvents() {
    return participantsController.getPersonalUsersForEvents();
  }

  function getActivePersonalWorkEntries() {
    return participantsController.getActivePersonalWorkEntries();
  }

  function getActivePersonalWorkEntryByUserName(userName) {
    return participantsController.getActivePersonalWorkEntryByUserName(userName);
  }

  function addMonthKeepDay(date, diff) {
    return participantsController.addMonthKeepDay(date, diff);
  }

  function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate) {
    return participantsController.getPersonalWorkCycleRangeForDate(startDateStr, referenceDate);
  }

  function getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd) {
    return participantsController.getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd);
  }

  function formatHourValue(hours) {
    return participantsController.formatHourValue(hours);
  }

  function formatWonAmount(value) {
    return participantsController.formatWonAmount(value);
  }

  function renderMyWorkshopUsagePanel() {
    return participantsController.renderMyWorkshopUsagePanel();
  }

  function renderEventPersonalUserInfo() {
    return participantsController.renderEventPersonalUserInfo();
  }

  function getEventUsersByKind(kind) {
    return participantsController.getEventUsersByKind(kind);
  }

  function loadStudioInstructors() {
    return participantsController.loadStudioInstructors();
  }

  function populateInstructorOptions(selectId, selected) {
    return participantsController.populateInstructorOptions(selectId, selected);
  }

  function getEventClassMetadataForDate(eventItem, occurrenceDate) {
    const rule = getClassBaseRuleForRange(occurrenceDate, eventItem.start, eventItem.end);
    return {
      classType: String(rule?.className || eventItem.classType || '수업시간'),
      instructor: String(rule?.instructor || eventItem.instructor || '').trim(),
      baseRuleId: String(rule?.id || eventItem.baseRuleId || '')
    };
  }

  function rebuildClassTeachingLog() {
    state.classTeachingLog = globalThis.MasterCalendarScheduleProjections.buildClassTeachingLog({
      events: state.events,
      now: new Date(),
      getEventClassMetadataForDate,
      formatDateInput,
      addDays,
      expandOccurrences(options) {
        return globalThis.MasterCalendarOccurrences.expandOccurrences(options);
      }
    });
  }

  function populateEventUserOptions(selected, selectId = 'event-user', forcedKind) {
    return participantsController.populateEventUserOptions(selected, selectId, forcedKind);
  }

  function handleEventUserSelectChange() {
    return participantsController.handleEventUserSelectChange();
  }

  function handleQuickEditUserSelectChange() {
    return participantsController.handleQuickEditUserSelectChange();
  }

  function syncEventInputMode() {
    return eventModalController.syncEventInputMode();
  }

  function syncEventSelectionFromInputs() {
    return eventModalController.syncEventSelectionFromInputs();
  }

  function renderEventSelectorGrid() {
    return eventModalController.renderEventSelectorGrid();
  }

  function renderEventSelectorBubbles(stage, grid, weekStart) {
    return eventModalController.renderEventSelectorBubbles(stage, grid, weekStart);
  }

  function startEventSelection(event, dayIndex, slot) {
    return eventModalController.startEventSelection(event, dayIndex, slot);
  }

  function moveEventSelection(dayIndex, slot) {
    return eventModalController.moveEventSelection(dayIndex, slot);
  }

  function endEventSelection(dayIndex, slot) {
    return eventModalController.endEventSelection(dayIndex, slot);
  }

  function clearEventSelectionMoveTimer() {
    return eventModalController.clearEventSelectionMoveTimer();
  }

  function getEventSelectionResizeEdge(event, dayIndex, slot) {
    return eventModalController.getEventSelectionResizeEdge(event, dayIndex, slot);
  }

  function applyEventSelection(dayIndex, startSlot, endSlot, silent) {
    return eventModalController.applyEventSelection(dayIndex, startSlot, endSlot, silent);
  }

  function getEventSelectorWeekStartDate() {
    return eventModalController.getEventSelectorWeekStartDate();
  }

  function getEventSelectorDateForDay(dayIndex) {
    return eventModalController.getEventSelectorDateForDay(dayIndex);
  }

  function isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot) {
    const weekStart = getEventSelectorWeekStartDate() || state.weekStart;
    return globalThis.MasterCalendarOccupancy.isPlacementAllowed({
      kind,
      dayIndex,
      startSlot,
      endSlot,
      rules: getRulesForWeek(weekStart),
      isAllDayKind
    });
  }

  function getBlockCapacityLabel(rule, dayOcc) {
    return eventModalController.getBlockCapacityLabel(rule, dayOcc);
  }

  function renderBaseEditorGrid(...args) {
    return baseEditorController.renderBaseEditorGrid(...args);
  }

  function onBaseCellMouseDown(...args) {
    return baseEditorController.onBaseCellMouseDown(...args);
  }

  function onBaseCellMouseEnter(...args) {
    return baseEditorController.onBaseCellMouseEnter(...args);
  }

  function onBaseCellMouseUp(...args) {
    return baseEditorController.onBaseCellMouseUp(...args);
  }

  function clearMoveTimer(...args) {
    return baseEditorController.clearMoveTimer(...args);
  }

  function handleBaseEditorGlobalMouseUp(...args) {
    return baseEditorController.handleBaseEditorGlobalMouseUp(...args);
  }

  function handleBaseEditorGlobalMouseMove(...args) {
    return baseEditorController.handleBaseEditorGlobalMouseMove(...args);
  }

  function handleBaseEditorUndoShortcut(...args) {
    return baseEditorController.handleBaseEditorUndoShortcut(...args);
  }

  function isBaseModalOpen(...args) {
    return baseEditorController.isBaseModalOpen(...args);
  }

  function autoScrollBaseEditor(...args) {
    return baseEditorController.autoScrollBaseEditor(...args);
  }

  function syncPointerDrivenPreview(...args) {
    return baseEditorController.syncPointerDrivenPreview(...args);
  }

  function getPointerTargetDaySlot(...args) {
    return baseEditorController.getPointerTargetDaySlot(...args);
  }

  function getActiveBaseGrid(...args) {
    return baseEditorController.getActiveBaseGrid(...args);
  }

  function finalizeBaseMove(...args) {
    return baseEditorController.finalizeBaseMove(...args);
  }

  function resetMoveState(...args) {
    return baseEditorController.resetMoveState(...args);
  }

  function getResizeEdgeFromEvent(...args) {
    return baseEditorController.getResizeEdgeFromEvent(...args);
  }

  function handleBaseGridHoverCursor(...args) {
    return baseEditorController.handleBaseGridHoverCursor(...args);
  }

  function clearBaseGridHoverCursor(...args) {
    return baseEditorController.clearBaseGridHoverCursor(...args);
  }

  function handleEventSelectorHoverCursor(event) {
    return eventModalController.handleEventSelectorHoverCursor(event);
  }

  function clearEventSelectorHoverCursor() {
    return eventModalController.clearEventSelectorHoverCursor();
  }

  function startBaseResize(...args) {
    return baseEditorController.startBaseResize(...args);
  }

  function updateBaseResizePreview(...args) {
    return baseEditorController.updateBaseResizePreview(...args);
  }

  function finalizeBaseResize(...args) {
    return baseEditorController.finalizeBaseResize(...args);
  }

  function resetBaseResizeState(...args) {
    return baseEditorController.resetBaseResizeState(...args);
  }

  function showResizeGhost(...args) {
    return baseEditorController.showResizeGhost(...args);
  }

  function updateResizeGhost(...args) {
    return baseEditorController.updateResizeGhost(...args);
  }

  function removeResizeGhost(...args) {
    return baseEditorController.removeResizeGhost(...args);
  }

  function hideOriginRuleCells(...args) {
    return baseEditorController.hideOriginRuleCells(...args);
  }

  function clearOriginRuleCells(...args) {
    return baseEditorController.clearOriginRuleCells(...args);
  }

  function showMoveGhost(...args) {
    return baseEditorController.showMoveGhost(...args);
  }

  function updateMoveGhost(...args) {
    return baseEditorController.updateMoveGhost(...args);
  }

  function removeMoveGhost(...args) {
    return baseEditorController.removeMoveGhost(...args);
  }

  function clearMovePreview(...args) {
    return baseEditorController.clearMovePreview(...args);
  }

  function startBaseDrag(...args) {
    return baseEditorController.startBaseDrag(...args);
  }

  function moveBaseDrag(...args) {
    return baseEditorController.moveBaseDrag(...args);
  }

  function endBaseDrag(...args) {
    return baseEditorController.endBaseDrag(...args);
  }

  function finalizeBaseAdd(...args) {
    return baseEditorController.finalizeBaseAdd(...args);
  }

  function cancelBaseDrag(...args) {
    return baseEditorController.cancelBaseDrag(...args);
  }

  function showAddGhost(...args) {
    return baseEditorController.showAddGhost(...args);
  }

  function updateAddGhost(...args) {
    return baseEditorController.updateAddGhost(...args);
  }

  function removeAddGhost(...args) {
    return baseEditorController.removeAddGhost(...args);
  }

  function getBaseEditorWeekStart() {
    return baseTransactionController.getBaseEditorWeekStart();
  }

  function getBaseWeekKey(weekStartDate) {
    return baseRulesDomain.getBaseWeekKey(weekStartDate);
  }

  function cloneBaseWeekOverrides(overrides) {
    return baseTransactionController.cloneBaseWeekOverrides(overrides);
  }

  function cloneBaseRuleTimeline(timeline) {
    return baseRulesDomain.cloneBaseRuleTimeline(timeline);
  }

  function normalizeBaseRule(rule) {
    return baseRulesDomain.normalizeBaseRule(rule);
  }

  function getRulesForWeek(weekStartDate) {
    return baseRulesDomain.getRulesForWeek(weekStartDate);
  }

  function hasWeekOverride(weekStartDate) {
    return baseRulesDomain.hasWeekOverride(weekStartDate);
  }

  function ensureWeekOverrideRules(weekStartDate) {
    return baseRulesDomain.ensureWeekOverrideRules(weekStartDate);
  }

  function getRulesByScope(scope, weekStartDate) {
    return baseRulesDomain.getRulesByScope(scope, weekStartDate);
  }

  function getBaseEditScope() {
    return baseTransactionController.getBaseEditScope();
  }

  function isEditFromCurrentWeekEnabled() {
    return baseTransactionController.isEditFromCurrentWeekEnabled();
  }

  function getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot) {
    return baseRulesDomain.getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot);
  }

  function getTemplateRulesForWeek(weekStartDate) {
    return baseRulesDomain.getTemplateRulesForWeek(weekStartDate);
  }

  function setTemplateRulesForWeekFrom(weekStartDate, nextRules) {
    return baseRulesDomain.setTemplateRulesForWeekFrom(weekStartDate, nextRules);
  }

  function normalizeTemplateTimeline() {
    return baseRulesDomain.normalizeTemplateTimeline();
  }

  function reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey) {
    return baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
  }

  function getRuleComparableSignature(rule) {
    return baseRulesDomain.getRuleComparableSignature(rule);
  }

  function areRuleSetsEquivalent(left, right) {
    return baseRulesDomain.areRuleSetsEquivalent(left, right);
  }

  function requestBaseEventFollowChoice(affectedCount, onResolve) {
    return baseTransactionController.requestBaseEventFollowChoice(affectedCount, onResolve);
  }

  function resolveBaseEventFollowPrompt(choice) {
    return baseTransactionController.resolveBaseEventFollowPrompt(choice);
  }

  function executeBaseChangeWithScopeAndEventPrompt(scopeOrResolver, buildPayload, applyChange) {
    return baseTransactionController.executeBaseChangeWithScopeAndEventPrompt(
      scopeOrResolver,
      buildPayload,
      applyChange
    );
  }

  function withBaseScope(scopeOrResolver, mutationFn) {
    return baseTransactionController.withBaseScope(scopeOrResolver, mutationFn);
  }

  function getEditableBaseRulesForAllMode(weekStartDate) {
    return baseTransactionController.getEditableBaseRulesForAllMode(weekStartDate);
  }

  function resetBaseApplyWeeklyCheckbox() {
    return baseTransactionController.resetBaseApplyWeeklyCheckbox();
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return baseRulesDomain.rangesOverlap(startA, endA, startB, endB);
  }

  function collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate) {
    return baseTransactionController.collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate);
  }

  function buildBaseEventMovePlan(affectedEvents, dayShift, slotShift) {
    return baseTransactionController.buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
  }

  function applyBaseEventMovePlan(movePlan) {
    return baseTransactionController.applyBaseEventMovePlan(movePlan);
  }

  function createBaseRuleId() {
    return baseTransactionController.createBaseRuleId();
  }

  function applyMovedRuleOverride(targetRules, movedRule) {
    return baseRulesDomain.applyMovedRuleOverride(targetRules, movedRule);
  }

  function applyBaseRule(day, startSlot, endSlot) {
    return baseTransactionController.applyBaseRule(day, startSlot, endSlot);
  }

  function getRuleForSlotFromRules(rules, day, slot) {
    let resolved = null;
    (rules || []).forEach((rule) => {
      if (rule.day === day && slot >= rule.startSlot && slot < rule.endSlot) {
        resolved = rule;
      }
    });
    return resolved;
  }

  function getBaseEditorDisplayRules() {
    // Keep the visible week stable regardless of edit mode; toggle should change scope, not current view.
    return getRulesForWeek(getBaseEditorWeekStart());
  }

  function getBaseRuleForSlot(day, slot, weekStartDate) {
    const rules = getRulesForWeek(weekStartDate || state.weekStart);
    return getRuleForSlotFromRules(rules, day, slot);
  }

  function getBaseLabelText(rule) {
    return displayPolicy.getBaseLabelText(rule);
  }

  function isBaseLabelStart(day, slot, rule, weekStartDate) {
    if (!rule) return false;
    if (slot === 0) return true;

    const prevRule = getBaseRuleForSlot(day, slot - 1, weekStartDate || state.weekStart);
    if (!prevRule) return true;
    if (prevRule.id !== rule.id) return true;
    return false;
  }

  function getBaseTypeForSlot(day, slot, weekStartDate) {
    const rule = getBaseRuleForSlot(day, slot, weekStartDate || state.weekStart);
    return rule ? rule.type : '';
  }

  function baseTypeToClass(type) {
    return displayPolicy.baseTypeToClass(type);
  }

  function kindToClass(kind) {
    return displayPolicy.kindToClass(kind);
  }

  function isExhibitionKind(kind) {
    return displayPolicy.isExhibitionKind(kind);
  }

  function isAllDayKind(kind) {
    return displayPolicy.isAllDayKind(kind);
  }

  function getAllDayPriority(kind) {
    return displayPolicy.getAllDayPriority(kind);
  }

  function isKilnKind(kind) {
    return displayPolicy.isKilnKind(kind);
  }

  function normalizeKilnCategory(value) {
    return displayPolicy.normalizeKilnCategory(value, KILN_CATEGORY_OPTIONS);
  }

  function extractKilnCategoryFromTitle(title) {
    return displayPolicy.extractKilnCategoryFromTitle(title, KILN_CATEGORY_OPTIONS);
  }

  function buildKilnEventTitle(category) {
    return displayPolicy.buildKilnEventTitle(category, KILN_CATEGORY_OPTIONS);
  }

  function getEventDisplayTitle(eventItem, fallbackTitle) {
    return displayPolicy.getEventDisplayTitle(eventItem, fallbackTitle, KILN_CATEGORY_OPTIONS);
  }

  const baseEditController = globalThis.MasterCalendarBaseEditController.create({
    document,
    state,
    loadStudioInstructors,
    populateInstructorOptions,
    slotToTime,
    timeToSlot,
    openModal,
    closeModal,
    alert: (message) => alert(message),
    confirm: (message) => confirm(message),
    getBaseEditorWeekStart,
    getRulesForWeek,
    getBaseEditScope,
    executeBaseChangeWithScopeAndEventPrompt,
    collectBaseRangeEventOccurrences,
    buildBaseEventMovePlan,
    getEditableBaseRulesForAllMode,
    getRulesByScope,
    applyMovedRuleOverride,
    applyBaseEventMovePlan,
    withBaseScope,
    getBaseWeekKey
  });

  const baseEditorController = globalThis.MasterCalendarBaseEditorController.create({
    document,
    state,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timerId) => clearTimeout(timerId),
    SLOTS_PER_DAY,
    BASE_EDITOR_START_SLOT,
    HOLD_TO_MOVE_MS,
    BASE_EDITOR_SCROLL_EDGE_PX,
    BASE_EDITOR_SCROLL_STEP,
    BASE_RESIZE_EDGE_PX,
    DAY_NAMES,
    getBaseEditorWeekStart,
    getBaseEditorDisplayRules,
    getRuleForSlotFromRules,
    getBaseLabelText,
    baseTypeToClass,
    formatMonthDate,
    addDays,
    slotToTime,
    isSameCalendarDate,
    isBaseCreateControlsVisible,
    applyBaseRule,
    getBaseEditScope,
    executeBaseChangeWithScopeAndEventPrompt,
    collectBaseRangeEventOccurrences,
    buildBaseEventMovePlan,
    getEditableBaseRulesForAllMode,
    getRulesByScope,
    applyMovedRuleOverride,
    applyBaseEventMovePlan,
    openBaseEditModal,
    undoBaseChange,
    clearEventSelectionMoveTimer,
    alert: (message) => alert(message),
    escapeHtml
  });

  function syncBaseClassNameVisibility() {
    baseEditController.syncBaseClassNameVisibility();
  }

  function syncEditBaseClassNameVisibility() {
    baseEditController.syncEditBaseClassNameVisibility();
  }

  function openBaseEditModal(rule) {
    baseEditController.openBaseEditModal(rule);
  }

  function saveBaseEditFromModal() {
    baseEditController.saveBaseEditFromModal();
  }

  function deleteBaseEditFromModal() {
    baseEditController.deleteBaseEditFromModal();
  }

  function cloneBaseRules(rules) {
    return baseRulesDomain.cloneBaseRules(rules);
  }

  function cloneEventsForUndo(events) {
    return baseTransactionController.cloneEventsForUndo(events);
  }

  function pushBaseUndoState() {
    return baseTransactionController.pushBaseUndoState();
  }

  function undoBaseChange() {
    return baseTransactionController.undoBaseChange();
  }

  function updateUndoButtonState() {
    return baseTransactionController.updateUndoButtonState();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  const stateController = globalThis.MasterCalendarStateController.create({
    state,
    repository: globalThis.MasterCalendarRepository.repository,
    normalizeBaseRule,
    isKilnKind,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    buildKilnEventTitle,
    loadStudioInstructors,
    rebuildClassTeachingLog,
    now: () => Date.now(),
    random: () => Math.random()
  });

  function saveState() {
    return stateController.saveState();
  }

  function loadState() {
    return stateController.loadState();
  }

  function getWeekStart(date) {
    return globalThis.MasterCalendarDateTime.getWeekStart(date);
  }

  function getMonthStart(date) {
    return globalThis.MasterCalendarDateTime.getMonthStart(date);
  }

  function addDays(date, diff) {
    return globalThis.MasterCalendarDateTime.addDays(date, diff);
  }

  function addMonths(date, diff) {
    return globalThis.MasterCalendarDateTime.addMonths(date, diff);
  }

  function slotToTime(slot) {
    return globalThis.MasterCalendarDateTime.slotToTime(slot);
  }

  function timeToSlot(timeStr) {
    return globalThis.MasterCalendarDateTime.timeToSlot(timeStr);
  }

  function formatDateInput(date) {
    return globalThis.MasterCalendarDateTime.formatDateInput(date);
  }

  function formatDateDisplay(date) {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatMonthDate(date) {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function isSameCalendarDate(left, right) {
    if (!(left instanceof Date) || !(right instanceof Date)) return false;
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function startMasterCalendarPage() {
    if (studioPageStartupStarted) return;
    studioPageStartupStarted = true;
    initializeStudioPage().then(resolveMasterCalendarReady, rejectMasterCalendarReady);
  }

  if (document.getElementById('calendar-body')) {
    startMasterCalendarPage();
  }
})();

