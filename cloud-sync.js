(function () {
  const SYNCED_KEYS = new Set(['users', 'exhibitions']);
  const PUSH_DEBOUNCE_MS = 1500;
  const META_KEY = '__sync_updated_at__';
  const SESSION_META_KEY = '__sync_updated_at_session__';
  const REMOTE_META_KEY = '__sync_remote_updated_at__';
  const SESSION_REMOTE_META_KEY = '__sync_remote_updated_at_session__';
  const CLIENT_ID_KEY = '__cloud_sync_client_id__';
  const STATE_PULL_ETAG_KEY = '__cloud_sync_state_pull_etags__';
  const READY_EVENT = 'cloud-sync:ready';
  const STATE_APPLIED_EVENT = 'cloud-sync:state-applied';
  const REMOTE_DROP_MIN_PREVIOUS_TOTAL = 20;
  const REMOTE_DROP_MIN_ABSOLUTE = 15;
  const REMOTE_DROP_RATIO = 0.7;
  const PREVIEW_DATA_URL_SAFE_LENGTH = 280000;
  const EXHIBITION_IMAGE_LIST_FIELDS = ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'];

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const pendingTimers = new Map();
  const lastSyncedStateSignatures = new Map();

  const activeSyncKeys = resolveActiveSyncKeys();
  const activeSyncKeySet = new Set(activeSyncKeys);

  let applyingRemoteState = false;
  let resolveCloudSyncReady = null;

  const cloudSyncStatus = {
    ready: false,
    activeKeys: activeSyncKeys.slice(),
    remoteReachable: false,
    hadRemoteData: {
      users: false,
      exhibitions: false
    },
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

  function getCurrentPageName() {
    if (typeof window === 'undefined' || !window.location) {
      return '';
    }

    const pathname = String(window.location.pathname || '').trim();
    if (!pathname) return '';
    const segments = pathname.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1].toLowerCase() : '';
  }

  function resolveActiveSyncKeys() {
    const page = getCurrentPageName();
    if (!page) {
      return Array.from(SYNCED_KEYS);
    }

    if (page === 'login.html' || page === 'users.html' || page === 'pottery-master-calendar.html') {
      return ['users'];
    }

    if (page === 'gallery-lounge.html') {
      return [];
    }

    if (page === 'inventory.html') {
      return [];
    }

    if (page === 'exhibitions.html') {
      return ['exhibitions'];
    }

    if (page === 'exhibition-detail.html') {
      return ['users', 'exhibitions'];
    }

    return Array.from(SYNCED_KEYS);
  }

  function isKeyEnabled(key) {
    return activeSyncKeySet.has(String(key || '').trim());
  }

  function getRequestedSyncKeys() {
    return activeSyncKeys.slice();
  }

  function getExhibitionId(exhibition) {
    const id = Number(exhibition?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  }

  function buildStateSignature(value) {
    if (typeof value === 'string') {
      return `str:${value}`;
    }
    return `json:${safeStringify(value)}`;
  }

  function isSameValue(a, b) {
    return safeStringify(a) === safeStringify(b);
  }

  function normalizeHttpUrl(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      return normalized;
    }
    return '';
  }

  function isDataUrl(value) {
    return /^data:[^;]+;base64,/i.test(typeof value === 'string' ? value.trim() : '');
  }

  function toTransferSafeImageItem(item) {
    if (!item || typeof item !== 'object') return item;

    const next = { ...item };
    const fullUrl = normalizeHttpUrl(next.photoUrl) || normalizeHttpUrl(next.photoDataUrl);
    const previewUrl = normalizeHttpUrl(next.photoPreviewUrl) || normalizeHttpUrl(next.photoPreviewDataUrl);

    if (fullUrl && !normalizeHttpUrl(next.photoUrl)) {
      next.photoUrl = fullUrl;
    }
    if (previewUrl && !normalizeHttpUrl(next.photoPreviewUrl)) {
      next.photoPreviewUrl = previewUrl;
    }

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
        const list = exhibition[field];
        if (!Array.isArray(list)) return;
        exhibition[field] = list.map((item) => toTransferSafeImageItem(item));
      });
    });

    return cloned;
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
      if (id !== null) {
        previousById.set(id, item);
      }
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
      if (!previous || !isSameValue(previous, item)) {
        changed.push(item);
      }
    });

    const removedIds = [];
    previousById.forEach((_, id) => {
      if (!nextById.has(id)) {
        removedIds.push(id);
      }
    });

    return {
      changed,
      removedIds
    };
  }

  function normalizeUserIdentityPart(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getUserIdentity(user) {
    const id = Number(user?.id);
    if (Number.isFinite(id) && id > 0) {
      return `id:${id}`;
    }

    const username = normalizeUserIdentityPart(user?.username);
    if (username) {
      return `username:${username}`;
    }

    const email = normalizeUserIdentityPart(user?.email);
    if (email) {
      return `email:${email}`;
    }

    const name = normalizeUserIdentityPart(user?.name);
    if (name) {
      return `name:${name}`;
    }

    return '';
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
      if (!identity || previousByIdentity.has(identity)) return;
      previousByIdentity.set(identity, user);
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
      if (!previous || !isSameValue(previous, user)) {
        changed.push(user);
      }
    });

    const removedIds = [];
    previousByIdentity.forEach((user, identity) => {
      if (nextByIdentity.has(identity)) return;
      const id = Number(user?.id);
      if (Number.isFinite(id) && id > 0) {
        removedIds.push(id);
      }
    });

    return {
      changed,
      removedIds: Array.from(new Set(removedIds))
    };
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

  function hasAnyPhotoPreviewInList(list) {
    if (!Array.isArray(list)) return false;
    return list.some((item) => {
      if (!item || typeof item !== 'object') return false;
      return Boolean(
        normalizeHttpUrl(item.photoPreviewUrl)
          || normalizeHttpUrl(item.photoUrl)
          ||
        (typeof item.photoPreviewDataUrl === 'string' && item.photoPreviewDataUrl.length > 0)
          || (typeof item.photoDataUrl === 'string' && item.photoDataUrl.length > 0)
      );
    });
  }

  function hasAnyPhotoPreviewInExhibitions(exhibitions) {
    if (!Array.isArray(exhibitions)) return false;
    return exhibitions.some((exhibition) => {
      if (!exhibition || typeof exhibition !== 'object') return false;
      return hasAnyPhotoPreviewInList(exhibition.artWorks)
        || hasAnyPhotoPreviewInList(exhibition.goods)
        || hasAnyPhotoPreviewInList(exhibition.artSoldWorks)
        || hasAnyPhotoPreviewInList(exhibition.soldGoods)
        || hasAnyPhotoPreviewInList(exhibition.works)
        || hasAnyPhotoPreviewInList(exhibition.soldWorks);
    });
  }

  function hasPhotoPreview(item) {
    if (!item || typeof item !== 'object') return false;
    return Boolean(
      normalizeHttpUrl(item.photoPreviewUrl)
      || normalizeHttpUrl(item.photoUrl)
      ||
      (typeof item.photoPreviewDataUrl === 'string' && item.photoPreviewDataUrl.length > 0)
      || (typeof item.photoDataUrl === 'string' && item.photoDataUrl.length > 0)
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

  function mergeItemPreservingPreview(localItem, remoteItem) {
    if (!remoteItem || typeof remoteItem !== 'object') return remoteItem;
    if (hasPhotoPreview(remoteItem)) return remoteItem;
    if (!hasPhotoPreview(localItem)) return remoteItem;

    const merged = { ...remoteItem };
    if ((!normalizeHttpUrl(merged.photoPreviewUrl))
      && normalizeHttpUrl(localItem?.photoPreviewUrl)) {
      merged.photoPreviewUrl = localItem.photoPreviewUrl;
    }

    if ((!normalizeHttpUrl(merged.photoUrl))
      && normalizeHttpUrl(localItem?.photoUrl)) {
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
      const key = getPreviewIdentity(item);
      if (!key || !hasPhotoPreview(item)) return;
      if (!localByIdentity.has(key)) {
        localByIdentity.set(key, item);
      }
    });

    return remoteList.map((item) => {
      const key = getPreviewIdentity(item);
      if (!key) return item;
      return mergeItemPreservingPreview(localByIdentity.get(key), item);
    });
  }

  function mergeExhibitionPreservingPreview(localExhibition, remoteExhibition) {
    if (!remoteExhibition || typeof remoteExhibition !== 'object') return remoteExhibition;
    if (!localExhibition || typeof localExhibition !== 'object') return remoteExhibition;

    const merged = { ...remoteExhibition };
    ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'].forEach((field) => {
      if (Array.isArray(remoteExhibition[field])) {
        merged[field] = mergeListPreservingPreview(localExhibition[field], remoteExhibition[field]);
      }
    });

    return merged;
  }

  function mergeExhibitionsPreservingPreview(localExhibitions, remoteExhibitions) {
    if (!Array.isArray(remoteExhibitions)) return remoteExhibitions;
    if (!Array.isArray(localExhibitions) || localExhibitions.length === 0) return remoteExhibitions;

    const localById = new Map(
      localExhibitions
        .filter((exhibition) => exhibition && typeof exhibition === 'object')
        .map((exhibition) => [Number(exhibition.id), exhibition])
    );

    return remoteExhibitions.map((remoteExhibition) => {
      const id = Number(remoteExhibition?.id);
      if (!Number.isFinite(id) || id <= 0) return remoteExhibition;
      return mergeExhibitionPreservingPreview(localById.get(id), remoteExhibition);
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

  function hasExplicitInventoryClearMarker(exhibition) {
    return Boolean(exhibition && typeof exhibition.inventoryExplicitlyClearedAt === 'string' && exhibition.inventoryExplicitlyClearedAt.trim());
  }

  function getInventoryListCount(exhibition) {
    if (!exhibition || typeof exhibition !== 'object') return 0;
    const artCount = Array.isArray(exhibition.artWorks)
      ? exhibition.artWorks.length
      : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
    const goodsCount = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;
    return artCount + goodsCount;
  }

  function isSuspiciousRemoteExhibitionsDrop(localValue, remoteValue) {
    if (!Array.isArray(localValue) || !Array.isArray(remoteValue)) return false;

    const remoteById = new Map(
      remoteValue
        .filter((item) => item && typeof item === 'object')
        .map((item) => [Number(item.id), item])
    );

    return localValue.some((localExhibition) => {
      if (!localExhibition || typeof localExhibition !== 'object') return false;
      const localId = Number(localExhibition.id);
      if (!Number.isFinite(localId) || localId <= 0) return false;

      const localCount = getInventoryListCount(localExhibition);
      if (localCount < REMOTE_DROP_MIN_PREVIOUS_TOTAL) return false;

      const remoteExhibition = remoteById.get(localId);
      const remoteCount = getInventoryListCount(remoteExhibition);
      const dropped = localCount - remoteCount;
      if (dropped < REMOTE_DROP_MIN_ABSOLUTE) return false;
      if (dropped / localCount < REMOTE_DROP_RATIO) return false;

      // Allow remote to clear inventory only when it carries an explicit clear marker.
      if (hasExplicitInventoryClearMarker(remoteExhibition)) {
        return false;
      }

      return remoteCount <= Math.floor(localCount * 0.3);
    });
  }

  function shouldPreferRemoteExhibitions(localValue, remoteValue) {
    if (!Array.isArray(localValue) || !Array.isArray(remoteValue)) return false;

    const localCount = countInventoryRowsInExhibitions(localValue);
    const remoteCount = countInventoryRowsInExhibitions(remoteValue);
    if (remoteCount <= localCount) return false;

    // If local looks sparse compared to remote, recover from remote even when timestamps are ambiguous.
    if (localCount === 0 && remoteCount > 0) return true;
    return (remoteCount - localCount) >= 10;
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
        const parsedLocal = key === 'exhibitions' ? parseJsonSafe(localRaw) : null;

        if (typeof remoteValue !== 'undefined') {
          const remoteTime = getEpochMs(remoteUpdatedAt);
          const localTime = getEpochMs(localUpdatedAt);
          let mergedRemoteValue = remoteValue;
          let shouldHealRemotePreviews = false;

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
