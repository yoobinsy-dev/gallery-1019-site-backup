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

          if (remoteUpdatedAt) {
            markKnownRemoteVersion(key, remoteUpdatedAt);
          }

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
