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