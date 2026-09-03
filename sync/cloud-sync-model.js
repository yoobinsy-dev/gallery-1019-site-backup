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