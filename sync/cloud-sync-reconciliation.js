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