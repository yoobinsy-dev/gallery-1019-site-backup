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
