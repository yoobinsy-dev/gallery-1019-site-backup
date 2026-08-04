(function () {
  const SYNCED_KEYS = new Set(['users', 'exhibitions']);
  const PUSH_DEBOUNCE_MS = 500;
  const META_KEY = '__sync_updated_at__';
  const SESSION_META_KEY = '__sync_updated_at_session__';
  const READY_EVENT = 'cloud-sync:ready';
  const STATE_APPLIED_EVENT = 'cloud-sync:state-applied';
  const REMOTE_DROP_MIN_PREVIOUS_TOTAL = 20;
  const REMOTE_DROP_MIN_ABSOLUTE = 15;
  const REMOTE_DROP_RATIO = 0.7;
  const PREVIEW_DATA_URL_SAFE_LENGTH = 280000;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const pendingTimers = new Map();

  let applyingRemoteState = false;
  let resolveCloudSyncReady = null;

  const cloudSyncStatus = {
    ready: false,
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

  function hasAnyPhotoPreviewInList(list) {
    if (!Array.isArray(list)) return false;
    return list.some((item) => {
      if (!item || typeof item !== 'object') return false;
      return Boolean(
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
    if (!SYNCED_KEYS.has(key)) return;
    const meta = getSyncMeta();
    meta[key] = updatedAtIso || new Date().toISOString();
    setSyncMeta(meta);
  }

  function canUseRemoteState() {
    return typeof window !== 'undefined' && window.location && !window.location.protocol.startsWith('file');
  }

  function schedulePush(key, value) {
    if (!canUseRemoteState()) return;
    if (!SYNCED_KEYS.has(key)) return;

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

        await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
      } catch (error) {
        console.error('Cloud sync push failed for key:', key, error);
      }
    }, PUSH_DEBOUNCE_MS);

    pendingTimers.set(key, timer);
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);

    if (SYNCED_KEYS.has(key) && !applyingRemoteState) {
      markLocalUpdate(key);
    }

    if (applyingRemoteState || !SYNCED_KEYS.has(key)) {
      return;
    }

    try {
      const parsedValue = JSON.parse(value);
      schedulePush(key, parsedValue);
    } catch (error) {
      schedulePush(key, value);
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem.call(this, key);

    if (SYNCED_KEYS.has(key) && !applyingRemoteState) {
      markLocalUpdate(key);
    }

    if (applyingRemoteState || !SYNCED_KEYS.has(key)) {
      return;
    }

    schedulePush(key, null);
  };

  async function pullRemoteState() {
    if (!canUseRemoteState()) {
      finalizeCloudSyncReady();
      return;
    }

    try {
      const response = await fetch('/api/state?keys=users,exhibitions');
      if (!response.ok) return;
      cloudSyncStatus.remoteReachable = true;

      const payload = await response.json();
      if (!payload || !payload.ok || !payload.data) return;

      const remoteData = payload.data;
      const remoteMeta = payload.meta || {};
      const localMeta = getSyncMeta();
      const appliedRemoteKeys = [];
      applyingRemoteState = true;

      ['users', 'exhibitions'].forEach((key) => {
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
              schedulePush(key, JSON.parse(localRaw));
            } catch (error) {
              schedulePush(key, parsedLocal || localRaw);
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
            schedulePush(key, JSON.parse(localRaw));
          } catch (error) {
            schedulePush(key, localRaw);
          }
          return;
        }

        if (localRaw) {
          try {
            schedulePush(key, JSON.parse(localRaw));
          } catch (error) {
            schedulePush(key, localRaw);
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
