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
  document.querySelectorAll('.tab-button').forEach((btn) => {
    const tab = btn.getAttribute('data-tab') || '';
    btn.style.display = canAccessTab(tab) ? '' : 'none';
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
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return fallback;
  }
}

function stripLargePayloadFields(value) {
  if (!value || typeof value !== 'object') return;

  const heavyFields = ['photoDataUrl', 'imageDataUrl', 'photoPreviewDataUrl', 'fileDataUrl', 'previewDataUrl'];
  heavyFields.forEach((field) => {
    if (typeof value[field] === 'string' && value[field].length > 0) {
      value[field] = '';
    }
  });

  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (Array.isArray(child)) {
      child.forEach((item) => stripLargePayloadFields(item));
      return;
    }
    if (child && typeof child === 'object') {
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
  if (!exhibition || typeof exhibition !== 'object') {
    return { art: 0, goods: 0, total: 0 };
  }

  const art = Array.isArray(exhibition.artWorks)
    ? exhibition.artWorks.length
    : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
  const goods = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;

  return {
    art,
    goods,
    total: art + goods
  };
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

function loadInventoryBackup(exhibitionId) {
  const key = getInventoryBackupStorageKey(exhibitionId);
  if (!key) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.snapshot || typeof parsed.snapshot !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function persistInventoryBackup(exhibition) {
  const key = getInventoryBackupStorageKey(exhibition?.id);
  if (!key) return false;

  const snapshot = normalizeInventoryBackupSnapshot(exhibition);
  if (!snapshot) return false;

  const payload = JSON.stringify({
    updatedAt: new Date().toISOString(),
    counts: getInventoryListCounts(snapshot),
    snapshot
  });

  if (typeof safeSetLocalStorageItem === 'function') {
    return safeSetLocalStorageItem(key, payload);
  }

  try {
    localStorage.setItem(key, payload);
    return true;
  } catch (error) {
    return false;
  }
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

  const serialized = JSON.stringify(exhibitions);
  let restoredSaved = false;
  if (typeof safeSetLocalStorageItem === 'function') {
    restoredSaved = safeSetLocalStorageItem('exhibitions', serialized);
  } else {
    try {
      localStorage.setItem('exhibitions', serialized);
      restoredSaved = true;
    } catch (error) {
      return false;
    }
  }

  if (!restoredSaved) return false;

  console.warn('Recovered exhibition inventory from local backup due to likely data loss.');
  return true;
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
  try {
    const value = localStorage.getItem(key) || '';
    return value ? normalizeTabForAccess(value) : '';
  } catch (error) {
    return '';
  }
}

function saveLastViewedExhibitionTab(tabName) {
  const key = getExhibitionLastTabStorageKey();
  if (!key) return;
  const normalized = normalizeTabForAccess(tabName);
  if (!normalized) return;
  try {
    localStorage.setItem(key, normalized);
  } catch (error) {
    // Ignore storage failures (private mode/quota) and continue.
  }
}

function goBack() {
  window.location.href = 'exhibitions.html';
}

async function initDetailPage() {
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

  const exhibitions = JSON.parse(localStorage.getItem('exhibitions')) || [];
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

  if (!exhibitionDetailState.inventoryUiStateByMode.art) {
    exhibitionDetailState.inventoryUiStateByMode.art = cloneInventoryUiState(getDefaultInventoryUiState());
  }
  if (!exhibitionDetailState.inventoryUiStateByMode.goods) {
    exhibitionDetailState.inventoryUiStateByMode.goods = cloneInventoryUiState(getDefaultInventoryUiState());
  }
}

function persistActiveInventoryUiState() {
  const mode = exhibitionDetailState.inventoryMode;
  if (!mode) return;
  const target = {
    workSearch: exhibitionDetailState.workSearch,
    workAdvanced: exhibitionDetailState.workAdvanced,
    salesSearch: exhibitionDetailState.salesSearch,
    salesAdvanced: exhibitionDetailState.salesAdvanced,
    workListExpanded: exhibitionDetailState.workListExpanded,
    selectedWorkIds: exhibitionDetailState.selectedWorkIds,
    selectedSalesIds: exhibitionDetailState.selectedSalesIds,
    salesUndoStack: exhibitionDetailState.salesUndoStack,
    workUndoStack: exhibitionDetailState.workUndoStack,
    salesEditSnapshotIds: exhibitionDetailState.salesEditSnapshotIds,
    salesSearchQuery: exhibitionDetailState.salesSearchQuery,
    salesSearchResults: exhibitionDetailState.salesSearchResults,
    salesAddBuffer: exhibitionDetailState.salesAddBuffer,
    salesSearchHighlightIndex: exhibitionDetailState.salesSearchHighlightIndex,
    workSortField: exhibitionDetailState.workSortField,
    workSortDirection: exhibitionDetailState.workSortDirection,
    salesSortField: exhibitionDetailState.salesSortField,
    salesSortDirection: exhibitionDetailState.salesSortDirection,
    unsavedWorkCount: exhibitionDetailState.unsavedWorkCount,
    workEditSnapshotIds: exhibitionDetailState.workEditSnapshotIds,
    lastWorkCheckboxIndex: exhibitionDetailState.lastWorkCheckboxIndex,
    lastSalesCheckboxIndex: exhibitionDetailState.lastSalesCheckboxIndex,
    workFilters: exhibitionDetailState.workFilters,
    salesFilters: exhibitionDetailState.salesFilters
  };
  exhibitionDetailState.inventoryUiStateByMode[mode] = cloneInventoryUiState(target);
}

function restoreInventoryUiState(mode) {
  const snapshot = exhibitionDetailState.inventoryUiStateByMode[mode]
    || cloneInventoryUiState(getDefaultInventoryUiState());
  exhibitionDetailState.workSearch = snapshot.workSearch;
  exhibitionDetailState.workAdvanced = snapshot.workAdvanced;
  exhibitionDetailState.salesSearch = snapshot.salesSearch;
  exhibitionDetailState.salesAdvanced = snapshot.salesAdvanced;
  exhibitionDetailState.workListExpanded = snapshot.workListExpanded;
  exhibitionDetailState.selectedWorkIds = snapshot.selectedWorkIds;
  exhibitionDetailState.selectedSalesIds = snapshot.selectedSalesIds;
  exhibitionDetailState.salesUndoStack = snapshot.salesUndoStack;
  exhibitionDetailState.workUndoStack = snapshot.workUndoStack;
  exhibitionDetailState.salesEditSnapshotIds = snapshot.salesEditSnapshotIds;
  exhibitionDetailState.salesSearchQuery = snapshot.salesSearchQuery;
  exhibitionDetailState.salesSearchResults = snapshot.salesSearchResults;
  exhibitionDetailState.salesAddBuffer = snapshot.salesAddBuffer;
  exhibitionDetailState.salesSearchHighlightIndex = snapshot.salesSearchHighlightIndex;
  exhibitionDetailState.workSortField = snapshot.workSortField;
  exhibitionDetailState.workSortDirection = snapshot.workSortDirection;
  exhibitionDetailState.salesSortField = snapshot.salesSortField;
  exhibitionDetailState.salesSortDirection = snapshot.salesSortDirection;
  exhibitionDetailState.unsavedWorkCount = snapshot.unsavedWorkCount;
  exhibitionDetailState.workEditSnapshotIds = snapshot.workEditSnapshotIds;
  exhibitionDetailState.lastWorkCheckboxIndex = snapshot.lastWorkCheckboxIndex;
  exhibitionDetailState.lastSalesCheckboxIndex = snapshot.lastSalesCheckboxIndex;
  exhibitionDetailState.workFilters = snapshot.workFilters;
  exhibitionDetailState.salesFilters = snapshot.salesFilters;
}

function syncInventoryMode(mode) {
  const exhibition = getCurrentExhibition();
  initializeInventoryData(exhibition);
  persistActiveInventoryUiState();

  if (exhibitionDetailState.inventoryMode === 'goods') {
    exhibition.goods = Array.isArray(exhibition.works) ? exhibition.works : exhibition.goods;
    exhibition.soldGoods = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.soldGoods;
  } else {
    exhibition.artWorks = Array.isArray(exhibition.works) ? exhibition.works : exhibition.artWorks;
    exhibition.artSoldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : exhibition.artSoldWorks;
  }

  exhibitionDetailState.inventoryMode = mode;

  if (mode === 'goods') {
    exhibition.works = exhibition.goods;
    exhibition.soldWorks = exhibition.soldGoods;
  } else {
    exhibition.works = exhibition.artWorks;
    exhibition.soldWorks = exhibition.artSoldWorks;
  }

  restoreInventoryUiState(mode);
}

function switchTab(tabName) {
  if (!canAccessTab(tabName)) {
    applyTabVisibilityByPermission();
    const fallbackTab = getFirstAllowedTab();
    if (!fallbackTab) {
      alert('이 전시에 접근할 권한이 없습니다.');
      window.location.href = 'exhibitions.html';
      return;
    }
    tabName = fallbackTab;
  }

  if (tabName === 'works') {
    exhibitionDetailState.currentTab = 'inventory-list';
    exhibitionDetailState.inventoryListView = 'art';
    syncInventoryMode('art');
  } else if (tabName === 'goods') {
    exhibitionDetailState.currentTab = 'inventory-list';
    exhibitionDetailState.inventoryListView = 'goods';
    syncInventoryMode('goods');
  } else if (tabName === 'sales' || tabName === 'inventory-sales') {
    exhibitionDetailState.currentTab = 'inventory-sales';
    syncInventoryMode('art');
  } else if (tabName === 'inventory-list') {
    exhibitionDetailState.currentTab = 'inventory-list';
    if (!['art', 'goods'].includes(exhibitionDetailState.inventoryListView)) {
      exhibitionDetailState.inventoryListView = 'art';
    }
    syncInventoryMode(exhibitionDetailState.inventoryListView);
  } else {
    exhibitionDetailState.currentTab = tabName;
  }

  if (exhibitionDetailState.currentTab === 'inventory-list') {
    saveLastViewedExhibitionTab(getCurrentInventoryListTabName());
  } else {
    saveLastViewedExhibitionTab(exhibitionDetailState.currentTab);
  }

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === exhibitionDetailState.currentTab);
  });

  const content = document.getElementById('tab-content');
  if (!content) return;
  content.innerHTML = '';

  if (tabName === 'staff') {
    renderStaffManagement(content);
  } else if (tabName === 'exhibition-info') {
    renderExhibitionInfo(content);
  } else if (tabName === 'works' || tabName === 'goods' || tabName === 'inventory-list') {
    renderInventoryListManagement(content);
  } else if (tabName === 'sales' || tabName === 'inventory-sales') {
    renderInventorySalesManagement(content);
  } else if (tabName === 'exhibition-files') {
    renderExhibitionFiles(content);
  } else if (tabName === 'exhibition-accounting') {
    renderExhibitionAccounting(content);
  } else if (tabName === 'exhibition-backup') {
    renderExhibitionBackup(content);
  }
}

function getBackupExhibitionId() {
  const id = Number(exhibitionDetailState.exhibitionId || getCurrentExhibition()?.id);
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
    exhibitionDetailState.backupError = '전시 ID를 찾을 수 없습니다.';
    return;
  }

  exhibitionDetailState.backupLoading = true;
  exhibitionDetailState.backupError = '';
  switchTab('exhibition-backup');

  try {
    const response = await fetch(`/api/exhibition-snapshots?exhibitionId=${encodeURIComponent(exhibitionId)}&limit=100`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      exhibitionDetailState.backupError = payload?.error || '스냅샷 목록을 불러오지 못했습니다.';
      exhibitionDetailState.backupSnapshots = [];
      exhibitionDetailState.backupCanUndo = false;
      return;
    }

    exhibitionDetailState.backupSnapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
    exhibitionDetailState.backupCanUndo = Boolean(payload.canUndo);
  } catch (error) {
    exhibitionDetailState.backupError = '네트워크 오류로 스냅샷 목록을 불러오지 못했습니다.';
    exhibitionDetailState.backupSnapshots = [];
    exhibitionDetailState.backupCanUndo = false;
  } finally {
    exhibitionDetailState.backupLoading = false;
    switchTab('exhibition-backup');
  }
}

function getBackupSnapshotRowsHtml() {
  const rows = exhibitionDetailState.backupSnapshots || [];
  if (rows.length === 0) {
    return '<tr><td colspan="6" class="no-users">저장된 전시 스냅샷이 없습니다.</td></tr>';
  }

  return rows.map((snapshot) => {
    const snapshotId = Number(snapshot.id);
    const restoredTag = snapshot.restored_at
      ? `<div style="font-size:12px;color:#2f6f3e;margin-top:4px;">복원됨: ${escapeAccountingHtml(formatBackupDate(snapshot.restored_at))}</div>`
      : '';

    return `
      <tr>
        <td>
          <strong>#${snapshotId}</strong>
          <div style="font-size:12px;color:#666;">${escapeAccountingHtml(snapshot.snapshot_type || '')}</div>
        </td>
        <td>${escapeAccountingHtml(String(snapshot.works_goods_count ?? 0))}</td>
        <td>${escapeAccountingHtml(String(snapshot.sold_items_count ?? 0))}</td>
        <td>${escapeAccountingHtml(formatBackupDate(snapshot.created_at))}${restoredTag}</td>
        <td>${escapeAccountingHtml(snapshot.note || '-')}</td>
        <td>
          <button type="button" class="action-btn approve-btn" onclick="restoreExhibitionSnapshot(${snapshotId})">restore</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderExhibitionBackup(container) {
  if (getExhibitionAccessRole() !== 'admin') {
    const fallbackTab = getFirstAllowedTab() || 'exhibition-info';
    switchTab(fallbackTab);
    return;
  }

  const loadingNotice = exhibitionDetailState.backupLoading
    ? '<p class="accounting-description">스냅샷 목록을 불러오는 중입니다...</p>'
    : '';
  const errorNotice = exhibitionDetailState.backupError
    ? `<p class="accounting-description" style="color:#b23b3b;">${escapeAccountingHtml(exhibitionDetailState.backupError)}</p>`
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
        <button type="button" class="works-action-btn works-action-btn-secondary" onclick="undoExhibitionSnapshotRestore()" ${exhibitionDetailState.backupCanUndo ? '' : 'disabled'}>되돌리기</button>
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

  if (!exhibitionDetailState.backupLoading && exhibitionDetailState.backupSnapshots.length === 0 && !exhibitionDetailState.backupError) {
    fetchExhibitionBackupSnapshots();
  }
}

async function createManualExhibitionSnapshot() {
  if (getExhibitionAccessRole() !== 'admin') {
    alert('어드민 계정만 스냅샷을 생성할 수 있습니다.');
    return;
  }

  const exhibitionId = getBackupExhibitionId();
  if (!exhibitionId) {
    alert('전시 ID를 찾을 수 없습니다.');
    return;
  }

  const currentUser = getCurrentUser();
  const actorName = (currentUser?.name || '').toString().trim() || 'admin';
  const note = `manual backup by ${actorName}`;

  try {
    const response = await fetch('/api/exhibition-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'capture-now',
        exhibitionId,
        note
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      alert(payload?.error || '스냅샷 생성에 실패했습니다.');
      return;
    }

    alert('스냅샷이 생성되었습니다.');
    await fetchExhibitionBackupSnapshots();
  } catch (error) {
    alert('스냅샷 생성 요청 중 오류가 발생했습니다.');
  }
}

async function refreshExhibitionStateFromServer(exhibitionId) {
  const targetId = Number(exhibitionId);
  if (!Number.isFinite(targetId) || targetId <= 0) return false;

  try {
    const response = await fetch('/api/state?keys=exhibitions');
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.data) return false;

    const remoteExhibitions = Array.isArray(payload.data.exhibitions) ? payload.data.exhibitions : [];
    const serialized = JSON.stringify(remoteExhibitions);
    if (typeof safeSetLocalStorageItem === 'function') {
      safeSetLocalStorageItem('exhibitions', serialized);
    } else {
      localStorage.setItem('exhibitions', serialized);
    }

    const index = remoteExhibitions.findIndex((item) => Number(item?.id) === targetId);
    if (index !== -1) {
      exhibitionDetailState.exhibition = remoteExhibitions[index];
    }

    return true;
  } catch (error) {
    return false;
  }
}

async function restoreExhibitionSnapshot(snapshotId) {
  if (getExhibitionAccessRole() !== 'admin') {
    alert('어드민 계정만 복원할 수 있습니다.');
    return;
  }

  if (!confirm('이 스냅샷으로 전시 데이터를 복원하시겠습니까?')) {
    return;
  }

  const exhibitionId = getBackupExhibitionId();
  if (!exhibitionId) {
    alert('전시 ID를 찾을 수 없습니다.');
    return;
  }

  try {
    const response = await fetch('/api/exhibition-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'restore',
        exhibitionId,
        snapshotId
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      alert(payload?.error || '복원에 실패했습니다.');
      return;
    }

    await refreshExhibitionStateFromServer(exhibitionId);

    alert('복원이 완료되었습니다.');
    await fetchExhibitionBackupSnapshots();
  } catch (error) {
    alert('복원 요청 중 오류가 발생했습니다.');
  }
}

async function undoExhibitionSnapshotRestore() {
  if (getExhibitionAccessRole() !== 'admin') {
    alert('어드민 계정만 되돌릴 수 있습니다.');
    return;
  }

  const exhibitionId = getBackupExhibitionId();
  if (!exhibitionId) {
    alert('전시 ID를 찾을 수 없습니다.');
    return;
  }

  if (!confirm('마지막 복원을 되돌리시겠습니까?')) {
    return;
  }

  try {
    const response = await fetch('/api/exhibition-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'undo-restore',
        exhibitionId
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      alert(payload?.error || '되돌리기에 실패했습니다.');
      return;
    }

    await refreshExhibitionStateFromServer(exhibitionId);

    alert('되돌리기가 완료되었습니다.');
    await fetchExhibitionBackupSnapshots();
  } catch (error) {
    alert('되돌리기 요청 중 오류가 발생했습니다.');
  }
}

function ensureExhibitionInfoData() {
  const exhibition = getCurrentExhibition();
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
      const users = JSON.parse(localStorage.getItem('users')) || [];
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
          <span class="artist-instagram-name">${escapeAccountingHtml(artistName)}</span>
          <input
            type="text"
            class="artist-instagram-input"
            data-artist-name="${escapeAccountingHtml(artistName)}"
            value="${escapeAccountingHtml(value)}"
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
          <strong class="exhibition-info-value">${escapeAccountingHtml(exhibition.title || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 기간</span>
          <strong class="exhibition-info-value">${escapeAccountingHtml(`${exhibition.startDate || ''} ~ ${exhibition.endDate || ''}`.trim() || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">전시 유형</span>
          <strong class="exhibition-info-value">${escapeAccountingHtml(exhibition.type || '-')}</strong>
        </div>
        <div class="exhibition-info-card">
          <span class="exhibition-info-label">참여 작가</span>
          <strong class="exhibition-info-value">${escapeAccountingHtml(participantText)}</strong>
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
        >${escapeAccountingHtml(exhibition.artistNote || '')}</textarea>
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
        >${escapeAccountingHtml(exhibition.invitationText || '')}</textarea>
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

    if (exhibitionDetailState.exhibition) {
      exhibitionDetailState.exhibition.artistInstagramMap = exhibition.artistInstagramMap;
      exhibitionDetailState.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
    }

    saveExhibition();
    switchTab('exhibition-info');
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

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.artistNote = exhibition.artistNote;
    exhibitionDetailState.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
    exhibitionDetailState.exhibition.invitationText = exhibition.invitationText;
    exhibitionDetailState.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
  }

  saveExhibition();
  switchTab('exhibition-info');
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

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.artistInstagramSaved = exhibition.artistInstagramSaved;
    exhibitionDetailState.exhibition.artistNoteSaved = exhibition.artistNoteSaved;
    exhibitionDetailState.exhibition.invitationTextSaved = exhibition.invitationTextSaved;
  }

  saveExhibition();
  switchTab('exhibition-info');
}

function ensureExhibitionFilesData() {
  const exhibition = getCurrentExhibition();
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
  exhibitionDetailState.filesView = view === 'promo' ? 'promo' : 'docs';
  switchTab('exhibition-files');
}

function renderExhibitionFiles(container) {
  const view = exhibitionDetailState.filesView === 'promo' ? 'promo' : 'docs';
  const activeFiles = getFilesForView(view);

  const cardsHtml = activeFiles.map((fileItem) => {
    const isPdf = isPdfLikeFile(fileItem.mimeType || '', fileItem.fileName || '', fileItem.fileDataUrl || fileItem.previewDataUrl || '') || fileItem.previewKind === 'pdf';
    const pdfSource = fileItem.fileDataUrl || fileItem.previewDataUrl || '';
    const canDeleteFile = canCurrentUserModifyOwnedRow(fileItem);
    const previewHtml = isPdf && pdfSource
      ? `<embed src="${pdfSource}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="exhibition-file-preview-pdf" />`
      : `<img src="${fileItem.previewDataUrl}" alt="${escapeAccountingHtml(fileItem.title || fileItem.fileName || '파일 미리보기')}" class="exhibition-file-preview-image">`;

    return `
    <article class="exhibition-file-card" title="${escapeAccountingHtml(fileItem.fileName || '')}">
      <div class="exhibition-file-preview-wrap">
        ${previewHtml}
      </div>
      <p class="exhibition-file-name">${escapeAccountingHtml(fileItem.title || fileItem.fileName || '제목 없음')}</p>
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
  if (!canCurrentUserModifyOwnedRow(target)) {
    alert('다른 사용자가 추가한 파일은 삭제할 수 없습니다.');
    return;
  }
  const next = targetList.filter((item) => item.id !== fileId);
  if (targetView === 'promo') {
    exhibition.filesPromo = next;
  } else {
    exhibition.filesDocs = next;
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.filesDocs = exhibition.filesDocs;
    exhibitionDetailState.exhibition.filesPromo = exhibition.filesPromo;
  }

  saveExhibition();
  switchTab('exhibition-files');
}

function deleteAllExhibitionFiles(view) {
  const targetView = view === 'promo' ? 'promo' : 'docs';
  const exhibition = ensureExhibitionFilesData();
  const currentList = targetView === 'promo' ? exhibition.filesPromo : exhibition.filesDocs;
  if (currentList.length === 0) return;

  let nextList = [];
  if (isArtistScopedUser()) {
    nextList = currentList.filter((item) => !canCurrentUserModifyOwnedRow(item));
    if (nextList.length === currentList.length) {
      alert('삭제할 수 있는 파일이 없습니다.');
      return;
    }
  }

  if (targetView === 'promo') {
    exhibition.filesPromo = isArtistScopedUser() ? nextList : [];
  } else {
    exhibition.filesDocs = isArtistScopedUser() ? nextList : [];
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.filesDocs = exhibition.filesDocs;
    exhibitionDetailState.exhibition.filesPromo = exhibition.filesPromo;
  }

  saveExhibition();
  switchTab('exhibition-files');
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
  exhibitionDetailState.fileUploadTarget = targetView === 'promo' ? 'promo' : 'docs';
  setPendingUploadEntries(Array.isArray(droppedFiles) ? droppedFiles : []);

  const modal = document.getElementById('file-upload-modal');
  const modalTitle = document.getElementById('file-upload-modal-title');
  const modalDesc = document.getElementById('file-upload-modal-description');
  const input = document.getElementById('file-upload-input');

  if (modalTitle) modalTitle.textContent = `${getFilesViewLabel(exhibitionDetailState.fileUploadTarget)} 업로드`;
  if (modalDesc) modalDesc.textContent = `${getFilesViewLabel(exhibitionDetailState.fileUploadTarget)} 탭에 저장됩니다.`;
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

  const count = exhibitionDetailState.pendingUploadEntries.length;
  if (count === 0) {
    info.textContent = '선택된 파일이 없습니다.';
    renderFileUploadPreviewList();
    return;
  }

  info.textContent = `${count}개 파일 선택됨`;
  renderFileUploadPreviewList();
}

function clearPendingUploadEntries() {
  (exhibitionDetailState.pendingUploadEntries || []).forEach((entry) => {
    if (entry && entry.objectUrl) {
      try {
        URL.revokeObjectURL(entry.objectUrl);
      } catch (error) {
        // Ignore revoke errors for stale object URLs.
      }
    }
  });
  exhibitionDetailState.pendingUploadEntries = [];
  exhibitionDetailState.pendingUploadFiles = [];
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
  exhibitionDetailState.pendingUploadFiles = files;
  exhibitionDetailState.pendingUploadEntries = files.map((file, index) => createPendingUploadEntry(file, index));
}

function updatePendingUploadTitle(index, value) {
  const entry = exhibitionDetailState.pendingUploadEntries[index];
  if (!entry) return;
  entry.title = value;
}

function renderFileUploadPreviewList() {
  const list = document.getElementById('file-upload-preview-list');
  if (!list) return;

  const entries = exhibitionDetailState.pendingUploadEntries || [];
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
          <input type="text" class="auth-input file-upload-title-input" value="${escapeAccountingHtml(entry.title || '')}" placeholder="제목 입력" oninput="updatePendingUploadTitle(${index}, this.value)">
          <p class="file-upload-preview-filename">원본 파일명: ${escapeAccountingHtml(entry.file.name || '파일')}</p>
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
  openFileUploadModal(exhibitionDetailState.filesView, files);
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
    const compact = await buildCompactPhotoPreview(file);
    return {
      previewDataUrl: compact.dataUrl,
      fileDataUrl: compact.dataUrl,
      previewKind: 'image',
      mimeType: compact.mimeType || file.type || '',
      byteSize: compact.byteSize || file.size || 0
    };
  }

  if (isPdf) {
    const fileDataUrl = await readFileAsDataUrl(file);
    return {
      previewDataUrl: fileDataUrl,
      fileDataUrl,
      previewKind: 'pdf',
      mimeType: file.type || '',
      byteSize: Number.isFinite(file.size) ? file.size : 0
    };
  }

  const fileDataUrl = await readFileAsDataUrl(file);

  return {
    previewDataUrl: buildGenericFilePreviewDataUrl(file.name || ''),
    fileDataUrl,
    previewKind: 'generic',
    mimeType: file.type || '',
    byteSize: Number.isFinite(file.size) ? file.size : 0
  };
}

async function confirmFileUploadModal() {
  const entries = exhibitionDetailState.pendingUploadEntries || [];
  if (entries.length === 0) {
    alert('업로드할 파일을 먼저 선택해주세요.');
    return;
  }

  const targetView = exhibitionDetailState.fileUploadTarget === 'promo' ? 'promo' : 'docs';

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
      createdByUserId: getCurrentUserId(),
      createdAt: new Date().toISOString()
    });
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.filesDocs = exhibition.filesDocs;
    exhibitionDetailState.exhibition.filesPromo = exhibition.filesPromo;
  }

  saveExhibition();
  clearPendingUploadEntries();
  closeFileUploadModal();
  switchTab('exhibition-files');
}

function parseAccountingAmount(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return n;
}

function formatAccountingAmount(value) {
  const amount = parseAccountingAmount(value);
  return `₩ ${amount.toLocaleString('ko-KR')}`;
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
  const soldWorks = ensureSoldWorksArray();
  let artTotal = 0;
  let goodsTotal = 0;

  soldWorks.forEach((sold) => {
    const itemType = normalizeSoldItemType(sold);
    const unitAmount = parseAccountingAmount(sold.price);
    const quantity = getSoldQuantityForItemType(itemType, sold.soldQuantity);
    const rowAmount = unitAmount * quantity;

    if (itemType === '굿즈') {
      goodsTotal += rowAmount;
    } else {
      artTotal += rowAmount;
    }
  });

  const manualRevenueItems = getExhibitionManualRevenueItems();
  const manualRows = manualRevenueItems.map((item) => ({
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

function getExhibitionManualRevenueItems() {
  const exhibition = getCurrentExhibition();
  if (!Array.isArray(exhibition.manualRevenueItems)) {
    exhibition.manualRevenueItems = [];
  }
  return exhibition.manualRevenueItems;
}

function getExpenseEffectiveAmount(item, revenueTotals) {
  if (!item) return 0;
  if (item.code === 'commission-art') {
    return (revenueTotals.art || 0) * 0.6;
  }
  if (item.code === 'commission-goods') {
    return (revenueTotals.goods || 0) * 0.8;
  }
  return parseAccountingAmount(item.amount);
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
              ? `<span class="accounting-cell-text">${escapeAccountingHtml(String(item.division || ''))}</span>`
              : `<input
                  id="revenue-division-${item.id}"
                  type="text"
                  class="accounting-text-input"
                  value="${escapeAccountingHtml(String(item.division || ''))}"
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
                  value="${escapeAccountingHtml(String(item.amount || ''))}"
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
            ? `<span class="accounting-cell-text">${escapeAccountingHtml(String(item.division || ''))}</span>`
            : `<input
                id="expense-division-${item.id}"
                type="text"
                class="accounting-text-input"
                value="${escapeAccountingHtml(String(item.division || ''))}"
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
                value="${escapeAccountingHtml(String(item.amount || ''))}"
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
  const revenueTotals = {
    art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
    goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
  };

  exhibitionDetailState.selectedExpenseIds = exhibitionDetailState.selectedExpenseIds
    .filter((id) => expenseItems.some((item) => item.id === id));
  exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds
    .filter((id) => expenseItems.some((item) => item.id === id));
  exhibitionDetailState.selectedRevenueIds = exhibitionDetailState.selectedRevenueIds
    .filter((id) => revenueItems.some((item) => item.id === id));
  exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds
    .filter((id) => revenueItems.some((item) => item.id === id));

  const expenseTotal = expenseItems.reduce((sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals), 0);
  const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAccountingAmount(item.amount), 0);
  const profitTotal = revenueTotal - expenseTotal;

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
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return `₩ ${n.toLocaleString('ko-KR')}`;
}

function addExpenseItem() {
  if (!canManageAccountingData()) {
    alert('전시 회계 수정 권한이 없습니다.');
    return;
  }

  pushExpenseUndoSnapshot();
  const newId = Date.now() + Math.floor(Math.random() * 1000);
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
  const newId = `revenue-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
  if (!sold) return '작품';
  return sold.itemType === '굿즈' ? '굿즈' : '작품';
}

function parseSoldQuantity(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function parseStockQuantity(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function getGoodsSoldQuantity(goodsId) {
  const records = getSalesMasterRecords();
  return records
    .filter((sold) => normalizeSoldItemType(sold) === '굿즈' && sold.workId === goodsId)
    .reduce((sum, sold) => sum + parseSoldQuantity(sold.soldQuantity), 0);
}

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
    <button type="button" class="works-sales-toggle-btn${exhibitionDetailState.inventoryListView === 'art' ? ' active' : ''}" onclick="switchTab('works')">작품 목록</button>
    <button type="button" class="works-sales-toggle-btn${exhibitionDetailState.inventoryListView === 'goods' ? ' active' : ''}" onclick="switchTab('goods')">굿즈 목록</button>
  `;
  wrapper.appendChild(toggleBar);

  const innerContent = document.createElement('div');
  innerContent.className = 'works-sales-subcontent';
  wrapper.appendChild(innerContent);

  container.appendChild(wrapper);

  renderWorksManagement(innerContent);
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
      <input id="sales-search" type="text" class="works-search" placeholder="번호, 제목, 작가, 구매자, 결제방법 등 검색" value="${exhibitionDetailState.salesSearch}" oninput="handleSalesSearchInput(this.value)">
      <button class="modal-btn modal-approve" onclick="toggleSalesAdvanced()">${exhibitionDetailState.salesAdvanced ? '간단 검색' : '고급 검색'}</button>
    </div>
    <div id="sales-advanced-search-panel" class="advanced-search-panel ${exhibitionDetailState.salesAdvanced ? 'active' : ''}">
      <div class="advanced-search-grid">
        <label>번호 <input type="text" id="sales-filter-manualNumber" value="${exhibitionDetailState.salesFilters.manualNumber}" onchange="handleSalesAdvancedFilter('manualNumber', this.value)"></label>
        <label>제목 <input type="text" id="sales-filter-title" value="${exhibitionDetailState.salesFilters.title}" onchange="handleSalesAdvancedFilter('title', this.value)"></label>
        <label>작가 <input type="text" id="sales-filter-author" value="${exhibitionDetailState.salesFilters.author}" onchange="handleSalesAdvancedFilter('author', this.value)"></label>
        <div class="sales-date-range-row">
          <label class="sales-date-range-label">판매일</label>
          <div class="sales-date-range">
            <input type="date" id="sales-filter-soldDateFrom" value="${exhibitionDetailState.salesFilters.soldDateFrom}" onchange="handleSalesAdvancedFilter('soldDateFrom', this.value)">
            <span class="sales-date-range-sep">~</span>
            <input type="date" id="sales-filter-soldDateTo" value="${exhibitionDetailState.salesFilters.soldDateTo}" onchange="handleSalesAdvancedFilter('soldDateTo', this.value)">
          </div>
        </div>
        <label>구매자 성함 <input type="text" id="sales-filter-buyerName" value="${exhibitionDetailState.salesFilters.buyerName}" onchange="handleSalesAdvancedFilter('buyerName', this.value)"></label>
        <label>구매자 연락처 <input type="text" id="sales-filter-buyerPhone" value="${exhibitionDetailState.salesFilters.buyerPhone}" onchange="handleSalesAdvancedFilter('buyerPhone', this.value)"></label>
        <label>결제방법 <input type="text" id="sales-filter-paymentMethod" value="${exhibitionDetailState.salesFilters.paymentMethod}" onchange="handleSalesAdvancedFilter('paymentMethod', this.value)"></label>
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
  addSoldButton.onclick = () => openSalesAddModal();
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
  if (isArtistScopedUser()) {
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
  exportButton.onclick = () => exportSalesToExcel();

  const allCertificatesButton = document.createElement('button');
  allCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
  allCertificatesButton.textContent = '모든 보증서 다운 받기';
  allCertificatesButton.onclick = () => handleDownloadAllCertificatesAction();

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
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleSalesSort('manualNumber')">${getSalesSortIndicator('manualNumber')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>분류</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'itemType' ? ' active' : ''}" onclick="toggleSalesSort('itemType')">${getSalesSortIndicator('itemType')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>카테고리</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'category' ? ' active' : ''}" onclick="toggleSalesSort('category')">${getSalesSortIndicator('category')}</button>
          </div>
        </th>
        <th>사진</th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>제목</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'title' ? ' active' : ''}" onclick="toggleSalesSort('title')">${getSalesSortIndicator('title')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>작가</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'author' ? ' active' : ''}" onclick="toggleSalesSort('author')">${getSalesSortIndicator('author')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>가격</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'price' ? ' active' : ''}" onclick="toggleSalesSort('price')">${getSalesSortIndicator('price')}</button>
          </div>
        </th>
        <th>수량</th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>판매일시</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'soldAtKst' ? ' active' : ''}" onclick="toggleSalesSort('soldAtKst')">${getSalesSortIndicator('soldAtKst')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>구매자 성함</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'buyerName' ? ' active' : ''}" onclick="toggleSalesSort('buyerName')">${getSalesSortIndicator('buyerName')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>구매자 연락처</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'buyerPhone' ? ' active' : ''}" onclick="toggleSalesSort('buyerPhone')">${getSalesSortIndicator('buyerPhone')}</button>
          </div>
        </th>
        <th class="sortable-header">
          <div class="header-with-sort">
            <span>결제방법</span>
            <button type="button" class="header-sort-btn${exhibitionDetailState.salesSortField === 'paymentMethod' ? ' active' : ''}" onclick="toggleSalesSort('paymentMethod')">${getSalesSortIndicator('paymentMethod')}</button>
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
  bottomAddSoldButton.onclick = () => openSalesAddModal();
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
  if (isArtistScopedUser()) {
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
  bottomExportButton.onclick = () => exportSalesToExcel();

  const bottomAllCertificatesButton = document.createElement('button');
  bottomAllCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
  bottomAllCertificatesButton.textContent = '모든 보증서 다운 받기';
  bottomAllCertificatesButton.onclick = () => handleDownloadAllCertificatesAction();

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

function isArtistSalesSummaryEnabled() {
  const type = (getCurrentExhibition().type || '').toString().trim();
  return type === '2인전' || type === '3인전' || type === '단체전';
}

function parsePriceToNumber(value) {
  if (isWorkNotForSale(value)) return 0;
  const numeric = Number(String(value || '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function formatCurrencyKrw(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

function getArtistSalesSummary() {
  const soldWorks = ensureSoldWorksArray();
  const summaryMap = new Map();

  soldWorks.forEach((sold) => {
    const author = (sold.author || '').toString().trim() || '작가 미지정';
    const qty = getSoldQuantityForItemType(normalizeSoldItemType(sold), sold.soldQuantity);
    const revenue = parsePriceToNumber(sold.price) * qty;
    const existing = summaryMap.get(author) || { author, soldCount: 0, totalRevenue: 0 };
    existing.soldCount += qty;
    existing.totalRevenue += revenue;
    summaryMap.set(author, existing);
  });

  return Array.from(summaryMap.values())
    .sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      if (b.soldCount !== a.soldCount) return b.soldCount - a.soldCount;
      return a.author.localeCompare(b.author, 'ko');
    });
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
  return JSON.parse(JSON.stringify(records || []));
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
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  exhibitionDetailState.salesUndoStack.push(cloneSalesRecords(soldWorks));
  if (exhibitionDetailState.salesUndoStack.length > 30) {
    exhibitionDetailState.salesUndoStack.shift();
  }
}

function updateSalesActionButtons() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const selectedCount = exhibitionDetailState.selectedSalesIds.length;
  const unsavedCount = soldWorks.filter(item => !item.saved).length;

  const allSelected = soldWorks.length > 0 && soldWorks.every(item => exhibitionDetailState.selectedSalesIds.includes(item.id));
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

  const canUndo = exhibitionDetailState.salesUndoStack.length > 0;
  ['sales-undo-btn', 'sales-undo-btn-bottom'].forEach((buttonId) => {
    const undoButton = document.getElementById(buttonId);
    if (undoButton) {
      undoButton.disabled = !canUndo;
      undoButton.style.opacity = canUndo ? '1' : '0.5';
      undoButton.style.cursor = canUndo ? 'pointer' : 'not-allowed';
    }
  });

  refreshGridKeyboardNavigation('sold-works-tbody');
}

function renderSoldWorkRows() {
  const tbody = document.getElementById('sold-works-tbody');
  if (!tbody) {
    renderSoldStatsTicker('sales');
    updateSalesActionButtons();
    return;
  }

  const exhibition = getCurrentExhibition();
  const soldWorksAll = ensureSoldWorksArray();
  const soldWorks = getSortedSoldWorks();
  const sourceWorks = getSalesSearchResults('__all__');
  tbody.innerHTML = '';

  if (soldWorksAll.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="16" class="no-users">등록된 판매 작품이 없습니다.</td>';
    tbody.appendChild(emptyRow);
    renderSoldStatsTicker('sales');
    updateSalesActionButtons();
    return;
  }

  if (soldWorks.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="16" class="no-users">검색 결과가 없습니다.</td>';
    tbody.appendChild(emptyRow);
    renderSoldStatsTicker('sales');
    updateSalesActionButtons();
    return;
  }

  soldWorks.forEach((sold, index) => {
    const row = document.createElement('tr');
    row.setAttribute('data-sold-id', String(sold.id));
    const isSelected = exhibitionDetailState.selectedSalesIds.includes(sold.id);
    const isSaved = !!sold.saved;
    const canModifySold = canCurrentUserModifyOwnedRow(sold);
    const isReadonlyRow = isSaved || !canModifySold;
    const actionButton = !canModifySold
      ? ''
      : (isSaved
        ? `<button class="action-btn edit-btn" onclick="toggleSoldWorkEdit(${sold.id})">수정</button>`
        : `<button class="action-btn approve-btn" onclick="saveSoldWork(${sold.id}, this)">저장</button>`);
    const soldPreviewDataUrl = getPhotoPreviewDataUrl(sold);
    const previewCell = soldPreviewDataUrl
      ? `<img src="${soldPreviewDataUrl}" alt="${(sold.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewBySoldId(${sold.id}, event)">`
      : `<span class="saved-photo">${sold.photoName || '사진 없음'}</span>`;
    const soldItemType = normalizeSoldItemType(sold);
    const sourceMatch = sourceWorks.find((work) => work.id === sold.workId && work.itemType === soldItemType);
    const categoryText = sold.category || sourceMatch?.category || '';
    const soldQuantityValue = getSoldQuantityForItemType(soldItemType, sold.soldQuantity);
    const isCertificateReady = hasGeneratedCertificate(sold);
    const certificateButtonHtml = soldItemType === '작품'
      ? `<button class="action-btn ${isCertificateReady ? 'approve-btn' : 'edit-btn'}" onclick="handleSoldCertificateAction(${sold.id})">${isCertificateReady ? '보증서 다운로드' : '보증서 만들기'}</button>`
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
        : `<td><input type="datetime-local" data-field="soldAtKst" value="${soldKstToInputValue(sold.soldAtKst)}" onchange="handleSoldFieldChange(${sold.id}, 'soldAtKst', soldInputValueToKst(this.value))"></td>`}
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
    const allSelected = soldWorksAll.length > 0 && soldWorksAll.every(item => exhibitionDetailState.selectedSalesIds.includes(item.id));
    selectAll.checked = allSelected;
  }

  renderSoldStatsTicker('sales');
  updateSalesActionButtons();
}

function getSoldQuantityForItemType(itemType, value) {
  return itemType === '굿즈' ? parseSoldQuantity(value) : 1;
}

function getSalesSearchResults(query) {
  const exhibition = getCurrentExhibition();
  const artWorks = Array.isArray(exhibition.artWorks) ? exhibition.artWorks : (exhibition.works || []);
  const goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
  const works = [
    ...artWorks.map((work) => ({ ...work, itemType: '작품' })),
    ...goods.map((work) => ({ ...work, itemType: '굿즈' }))
  ];
  const q = (query || '').trim().toLowerCase();
  if (query === '__all__') return works;
  if (!q) return [];

  return works
    .filter(work => {
      const number = (work.manualNumber || '').toString().toLowerCase();
      const title = (work.title || '').toString().toLowerCase();
      return number.includes(q) || title.includes(q);
    })
    .slice(0, 20);
}

function resetSalesAddCommonBuyerState() {
  exhibitionDetailState.salesAddApplyCommonBuyer = false;
  exhibitionDetailState.salesAddCommonBuyerName = '';
  exhibitionDetailState.salesAddCommonBuyerPhone = '';
  exhibitionDetailState.salesAddCommonPaymentMethod = '';
}

function renderSalesAddCommonBuyerSection() {
  const checkbox = document.getElementById('sales-add-apply-common-buyer');
  const fieldsSection = document.getElementById('sales-add-common-buyer-fields');
  const buyerNameInput = document.getElementById('sales-add-common-buyer-name');
  const buyerPhoneInput = document.getElementById('sales-add-common-buyer-phone');
  const paymentMethodSelect = document.getElementById('sales-add-common-payment-method');

  const enabled = !!exhibitionDetailState.salesAddApplyCommonBuyer;

  if (checkbox) checkbox.checked = enabled;
  if (fieldsSection) fieldsSection.hidden = !enabled;
  if (buyerNameInput) buyerNameInput.value = exhibitionDetailState.salesAddCommonBuyerName || '';
  if (buyerPhoneInput) buyerPhoneInput.value = exhibitionDetailState.salesAddCommonBuyerPhone || '';
  if (paymentMethodSelect) paymentMethodSelect.value = exhibitionDetailState.salesAddCommonPaymentMethod || '';
}

function handleSalesAddCommonBuyerToggle(checked) {
  exhibitionDetailState.salesAddApplyCommonBuyer = !!checked;
  renderSalesAddCommonBuyerSection();
}

function handleSalesAddCommonBuyerFieldChange(field, value) {
  if (field === 'buyerPhone') {
    const formatted = formatKoreanPhone(value);
    exhibitionDetailState.salesAddCommonBuyerPhone = formatted;
    const phoneInput = document.getElementById('sales-add-common-buyer-phone');
    if (phoneInput && phoneInput.value !== formatted) {
      phoneInput.value = formatted;
    }
    return;
  }

  if (field === 'buyerName') {
    exhibitionDetailState.salesAddCommonBuyerName = value || '';
    return;
  }

  if (field === 'paymentMethod') {
    exhibitionDetailState.salesAddCommonPaymentMethod = value || '';
  }
}

function openSalesAddModal() {
  exhibitionDetailState.salesSearchQuery = '';
  exhibitionDetailState.salesSearchResults = [];
  exhibitionDetailState.salesAddBuffer = [];
  resetSalesAddCommonBuyerState();
  renderSalesAddSearchResults();
  renderSalesAddBuffer();
  renderSalesAddCommonBuyerSection();

  const input = document.getElementById('sales-add-search-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 0);
  }

  const modal = document.getElementById('sales-add-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSalesAddModal() {
  const modal = document.getElementById('sales-add-modal');
  if (modal) modal.style.display = 'none';
  exhibitionDetailState.salesSearchQuery = '';
  exhibitionDetailState.salesSearchResults = [];
  exhibitionDetailState.salesAddBuffer = [];
  resetSalesAddCommonBuyerState();
}

function handleSalesAddSearchInput(value) {
  exhibitionDetailState.salesSearchQuery = value;
  exhibitionDetailState.salesSearchResults = getSalesSearchResults(value);
  exhibitionDetailState.salesSearchHighlightIndex = -1;
  renderSalesAddSearchResults();
}

function handleSalesAddSearchKeydown(event) {
  const results = exhibitionDetailState.salesSearchResults;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (results.length === 0) return;
    const dir = event.key === 'ArrowDown' ? 1 : -1;
    let next = exhibitionDetailState.salesSearchHighlightIndex;
    do {
      next += dir;
    } while (next >= 0 && next < results.length && !!getSalesPopupWorkDisabledReason(results[next]));
    exhibitionDetailState.salesSearchHighlightIndex = Math.max(-1, Math.min(results.length - 1, next));
    renderSalesAddSearchResults();
    return;
  }

  if (event.key !== 'Enter') return;
  event.preventDefault();

  const hi = exhibitionDetailState.salesSearchHighlightIndex;
  if (hi >= 0 && hi < results.length && !getSalesPopupWorkDisabledReason(results[hi])) {
    addWorkToSalesBuffer(results[hi]);
    return;
  }

  const query = (exhibitionDetailState.salesSearchQuery || '').trim().toLowerCase();
  if (!query || results.length === 0) return;

  const exact = results.find(work => {
    const number = (work.manualNumber || '').toString().trim().toLowerCase();
    const title = (work.title || '').toString().trim().toLowerCase();
    return (number === query || title === query) && !getSalesPopupWorkDisabledReason(work);
  });
  const firstAvailable = results.find(work => !getSalesPopupWorkDisabledReason(work));
  addWorkToSalesBuffer(exact || firstAvailable);
}

function addWorkToSalesBuffer(work) {
  if (!work) return;
  if (getSalesPopupWorkDisabledReason(work)) return;
  const exists = exhibitionDetailState.salesAddBuffer.some(item => item.workId === work.id && item.itemType === work.itemType);
  if (exists) return;

  exhibitionDetailState.salesAddBuffer.push({
    bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    workId: work.id,
    itemType: work.itemType || '작품',
    manualNumber: work.manualNumber || '',
    category: work.category || '',
    photoName: work.photoName || '',
    photoDataUrl: work.photoDataUrl || '',
    photoPreviewDataUrl: work.photoPreviewDataUrl || getPhotoPreviewDataUrl(work),
    title: work.title || '',
    author: work.author || '',
    price: work.price || '',
    soldQuantity: work.itemType === '굿즈' ? 1 : 1,
    madeToOrder: false
  });

  exhibitionDetailState.salesSearchQuery = '';
  exhibitionDetailState.salesSearchResults = [];
  exhibitionDetailState.salesSearchHighlightIndex = -1;
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
  const disabledReason = getSalesPopupWorkDisabledReason(work);
  if (!disabledReason) return;

  exhibitionDetailState.salesAddBuffer.push({
    bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    workId: work.id,
    itemType: work.itemType || '작품',
    manualNumber: work.manualNumber || '',
    category: work.category || '',
    photoName: work.photoName || '',
    photoDataUrl: work.photoDataUrl || '',
    photoPreviewDataUrl: work.photoPreviewDataUrl || getPhotoPreviewDataUrl(work),
    title: work.title || '',
    author: work.author || '',
    price: work.price || '',
    soldQuantity: work.itemType === '굿즈' ? 1 : 1,
    madeToOrder: true
  });

  exhibitionDetailState.salesSearchQuery = '';
  exhibitionDetailState.salesSearchResults = [];
  exhibitionDetailState.salesSearchHighlightIndex = -1;
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
  const results = exhibitionDetailState.salesSearchResults || [];
  const work = results.find((item) => item.id === workId && (item.itemType || '작품') === itemType)
    || getSalesSearchResults('__all__').find((item) => item.id === workId && (item.itemType || '작품') === itemType);
  if (!work) return;
  addMadeToOrderWorkToSalesBuffer(work);
}

function renderSalesAddSearchResults() {
  const container = document.getElementById('sales-add-search-results');
  if (!container) return;

  const query = (exhibitionDetailState.salesSearchQuery || '').trim();
  const results = exhibitionDetailState.salesSearchResults;
  container.innerHTML = '';

  if (!query) {
    container.innerHTML = '<p class="empty-state">작품/굿즈 번호 또는 제목으로 검색하세요.</p>';
    return;
  }

  if (results.length === 0) {
    container.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
    return;
  }

  const hi = exhibitionDetailState.salesSearchHighlightIndex;
  results.forEach((work, idx) => {
    const disabledReason = getSalesPopupWorkDisabledReason(work);
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

  // Scroll highlighted row into view
  if (hi >= 0) {
    const highlighted = container.querySelector('.sales-search-result-highlighted');
    if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
  }
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
  const container = document.getElementById('sales-add-selected-list');
  const countEl = document.getElementById('sales-add-selected-count');
  const tickerEl = document.getElementById('sales-add-selected-ticker');
  if (!container || !countEl) return;

  const items = exhibitionDetailState.salesAddBuffer;
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
        ${item.itemType === '굿즈' ? `<input type="number" min="1" value="${parseSoldQuantity(item.soldQuantity)}" onchange="updateSalesBufferQuantity('${rowKey}', this.value)" style="width:88px;padding:4px 8px;border:1px solid #ddd;border-radius:8px;">` : ''}
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
    const unitPrice = parsePriceToNumber(item?.price);
    const quantity = normalizeSoldItemType(item) === '굿즈' ? parseSoldQuantity(item?.soldQuantity) : 1;
    return sum + (unitPrice * quantity);
  }, 0);

  targetTicker.textContent = `선택 ${safeItems.length}건 · 합계 ${formatCurrencyKrw(totalAmount)}`;
}

function updateSalesBufferQuantity(bufferKey, value) {
  const target = exhibitionDetailState.salesAddBuffer.find((item) => {
    const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
    return itemKey === bufferKey;
  });
  if (!target) return;
  target.soldQuantity = parseSoldQuantity(value);
  updateSalesAddSelectedTicker(exhibitionDetailState.salesAddBuffer);
}

function removeWorkFromSalesBuffer(bufferKey) {
  exhibitionDetailState.salesAddBuffer = exhibitionDetailState.salesAddBuffer.filter((item) => {
    const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
    return itemKey !== bufferKey;
  });
  renderSalesAddBuffer();
}

function confirmSalesAddModal() {
  const items = exhibitionDetailState.salesAddBuffer;
  if (!items || items.length === 0) {
    closeSalesAddModal();
    return;
  }

  const applyCommonBuyer = !!exhibitionDetailState.salesAddApplyCommonBuyer;
  const commonBuyerName = applyCommonBuyer
    ? (exhibitionDetailState.salesAddCommonBuyerName || '').trim()
    : '';
  const commonBuyerPhone = applyCommonBuyer
    ? formatKoreanPhone((exhibitionDetailState.salesAddCommonBuyerPhone || '').trim())
    : '';
  const commonPaymentMethod = applyCommonBuyer
    ? (exhibitionDetailState.salesAddCommonPaymentMethod || '').trim()
    : '';

  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  pushSalesUndoSnapshot();
  const soldAtKst = getCurrentKstDateTimeString();

  items.forEach(item => {
    soldWorks.push({
      id: Date.now() + Math.floor(Math.random() * 100000),
      createdByUserId: getCurrentUserId(),
      workId: item.workId,
      itemType: item.itemType || '작품',
      manualNumber: item.manualNumber,
      category: item.category || '',
      photoName: item.photoName,
      photoDataUrl: item.photoDataUrl,
      photoPreviewDataUrl: item.photoPreviewDataUrl || getPhotoPreviewDataUrl(item),
      title: item.title,
      author: item.author,
      price: item.price,
      soldQuantity: parseSoldQuantity(item.soldQuantity),
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

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  closeSalesAddModal();
  if (exhibitionDetailState.currentTab === 'exhibition-accounting') {
    switchTab('exhibition-accounting');
  } else {
    renderSoldWorkRows();
  }
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
    const el = row.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    el.classList.toggle('sales-required-missing', missingFields.includes(field));
  });
}

function saveSoldWork(soldId, triggerButton) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  if (!sold) return;
  if (!canCurrentUserModifyOwnedRow(sold)) {
    alert('다른 사용자가 추가한 판매 항목은 수정할 수 없습니다.');
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

  sold.soldQuantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), sold.soldQuantity);
  markMissingSoldFields(row, []);
  sold.saved = true;
  exhibitionDetailState.salesEditSnapshotIds = exhibitionDetailState.salesEditSnapshotIds.filter(id => id !== soldId);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function saveAllSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();

  for (const sold of soldWorks) {
    if (sold.saved) continue;
    if (!canCurrentUserModifyOwnedRow(sold)) continue;
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
      if (!canCurrentUserModifyOwnedRow(sold)) return;
      sold.soldQuantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), sold.soldQuantity);
      sold.saved = true;
      exhibitionDetailState.salesEditSnapshotIds = exhibitionDetailState.salesEditSnapshotIds.filter(id => id !== sold.id);
    }
  });

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function toggleSoldWorkEdit(soldId) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  if (!sold) return;
  if (!canCurrentUserModifyOwnedRow(sold)) {
    alert('다른 사용자가 추가한 판매 항목은 수정할 수 없습니다.');
    return;
  }

  if (sold.saved) {
    ensureSalesEditUndoSnapshot(soldId);
  }

  sold.saved = false;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
  scrollRowToViewportCenter(`tr[data-sold-id="${soldId}"]`);
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
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const target = soldWorks.find((item) => item.id === soldId);
  if (!target) return;
  if (!canCurrentUserModifyOwnedRow(target)) {
    alert('다른 사용자가 추가한 판매 항목은 삭제할 수 없습니다.');
    return;
  }
  if (!window.confirm('이 판매 기록을 삭제하시겠습니까?')) return;

  pushSalesUndoSnapshot();
  exhibition.soldWorks = soldWorks.filter(item => item.id !== soldId);
  exhibitionDetailState.selectedSalesIds = exhibitionDetailState.selectedSalesIds.filter(id => id !== soldId);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
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

const CERT_TEMPLATE_PATHS = [
  'Templates/certificate-template.xlsx',
  'Templates/작품보증서%20양식.xlsx'
];
let certTemplateArrayBufferPromise = null;

async function fetchCertificateTemplateArrayBuffer() {
  const failures = [];

  for (const path of CERT_TEMPLATE_PATHS) {
    try {
      const res = await fetch(path);
      if (!res.ok) {
        failures.push(`${path} (${res.status})`);
        continue;
      }
      return res.arrayBuffer();
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
  const exhibition = getCurrentExhibition();
  const artWorks = Array.isArray(exhibition.artWorks) ? exhibition.artWorks : (Array.isArray(exhibition.works) ? exhibition.works : []);
  return artWorks.find((work) => work.id === sold.workId) || null;
}

function hasGeneratedCertificate(sold) {
  return !!(sold && sold.certificateReady === true && sold.certificateVersion === 2);
}

function normalizeCertificateDateText(soldAtKst) {
  const text = (soldAtKst || '').toString().trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return text;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function safeCertificateFileName(baseTitle) {
  const clean = String(baseTitle || '작품').replace(/[\\/:*?"<>|]/g, '_').trim() || '작품';
  return `${clean}-보증서.xlsx`;
}

function getPhotoPreviewDataUrl(item) {
  return (item?.photoPreviewDataUrl || item?.photoDataUrl || '').toString().trim();
}

function getCertificateImageDataUrl(sold, work) {
  return getPhotoPreviewDataUrl(work) || getPhotoPreviewDataUrl(sold);
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function blobToUint8Array(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read blob as ArrayBuffer.'));
        return;
      }
      resolve(new Uint8Array(result));
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

async function buildCertificatePngBytesFromDataUrl(imageDataUrl) {
  const source = (imageDataUrl || '').toString().trim();
  if (!source) {
    throw new Error('Missing artwork image data URL.');
  }

  const image = await loadImageElement(source);
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) {
    throw new Error('Invalid artwork image dimensions.');
  }

  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
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

const EMU_PER_PIXEL = 9525;

function excelColumnWidthToPixels(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 64;
  return Math.floor(((256 * w + Math.floor(128 / 7)) / 256) * 7);
}

function excelRowHeightToPixels(heightPt) {
  const h = Number(heightPt);
  if (!Number.isFinite(h) || h <= 0) return 20;
  return Math.floor(h * 96 / 72);
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
    if (!min || !max) return;
    colRanges.push({ min, max, width });
  });

  const rowHeightByIndex = new Map();
  const rowTagRegex = /<row\b([^>]*)>/g;
  let rowMatch;
  while ((rowMatch = rowTagRegex.exec(sheetXml))) {
    const attrs = rowMatch[1] || '';
    const rowNumber = Number((attrs.match(/\br="(\d+)"/) || [])[1] || 0);
    const rowHeight = Number((attrs.match(/\bht="([\d.]+)"/) || [])[1] || 0);
    if (!rowNumber || !Number.isFinite(rowHeight) || rowHeight <= 0) continue;
    rowHeightByIndex.set(rowNumber - 1, rowHeight);
  }

  function getColumnWidthPx(colIndexZeroBased) {
    const colIndex1Based = colIndexZeroBased + 1;
    const matched = colRanges.find((range) => colIndex1Based >= range.min && colIndex1Based <= range.max);
    const width = matched ? matched.width : defaultColWidth;
    return excelColumnWidthToPixels(width);
  }

  function getRowHeightPx(rowIndexZeroBased) {
    const height = rowHeightByIndex.get(rowIndexZeroBased) || defaultRowHeight;
    return excelRowHeightToPixels(height);
  }

  return {
    getColumnWidthPx,
    getRowHeightPx
  };
}

function sumAxisPixels(startIndex, endExclusive, sizeFn) {
  let sum = 0;
  for (let i = startIndex; i < endExclusive; i += 1) {
    sum += sizeFn(i);
  }
  return sum;
}

function positionPxToCellOffset(startIndex, endExclusive, positionPx, sizeFn) {
  const totalPx = sumAxisPixels(startIndex, endExclusive, sizeFn);
  if (positionPx <= 0) {
    return { index: startIndex, offsetPx: 0 };
  }
  if (positionPx >= totalPx) {
    return { index: endExclusive, offsetPx: 0 };
  }

  let remaining = positionPx;
  for (let i = startIndex; i < endExclusive; i += 1) {
    const segment = sizeFn(i);
    if (remaining < segment) {
      return { index: i, offsetPx: remaining };
    }
    remaining -= segment;
  }

  return { index: endExclusive, offsetPx: 0 };
}

const CERTIFICATE_BLOCK_START_ROW = 2;
const CERTIFICATE_BLOCK_END_ROW = 45;
const CERTIFICATE_BLOCK_HEIGHT = CERTIFICATE_BLOCK_END_ROW - CERTIFICATE_BLOCK_START_ROW + 1;

function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
  const bounds = {
    fromCol: 2,
    toCol: 7,
    fromRow: 4 + rowOffset,
    toRow: 22 + rowOffset
  };

  const boxWidthPx = sumAxisPixels(bounds.fromCol, bounds.toCol, metrics.getColumnWidthPx);
  const boxHeightPx = sumAxisPixels(bounds.fromRow, bounds.toRow, metrics.getRowHeightPx);

  const safeImageWidth = Math.max(1, Number(imageWidthPx) || 1);
  const safeImageHeight = Math.max(1, Number(imageHeightPx) || 1);

  const imageRatio = safeImageWidth / safeImageHeight;
  const boxRatio = boxWidthPx / boxHeightPx;

  let fittedWidthPx;
  let fittedHeightPx;
  if (imageRatio > boxRatio) {
    fittedWidthPx = boxWidthPx;
    fittedHeightPx = boxWidthPx / imageRatio;
  } else {
    fittedHeightPx = boxHeightPx;
    fittedWidthPx = boxHeightPx * imageRatio;
  }

  const startXPx = (boxWidthPx - fittedWidthPx) / 2;
  const startYPx = (boxHeightPx - fittedHeightPx) / 2;
  const endXPx = startXPx + fittedWidthPx;
  const endYPx = startYPx + fittedHeightPx;

  const fromX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, startXPx, metrics.getColumnWidthPx);
  const toX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, endXPx, metrics.getColumnWidthPx);
  const fromY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, startYPx, metrics.getRowHeightPx);
  const toY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, endYPx, metrics.getRowHeightPx);

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

function enforceWorksheetPageSetupXml(sheetXml, options = {}) {
  if (!sheetXml) return sheetXml;
  let nextXml = sheetXml;
  const fitToWidth = String(options.fitToWidth ?? 1);
  const fitToHeight = String(options.fitToHeight ?? 1);
  const fitToPage = String(options.fitToPage ?? 1);

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

function upsertWorksheetRowBreaksXml(sheetXml, breakRows) {
  if (!sheetXml) return sheetXml;

  let nextXml = sheetXml
    .replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/g, '')
    .replace(/<rowBreaks\b[^>]*\/>/g, '');

  const rows = Array.isArray(breakRows)
    ? breakRows
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  if (rows.length === 0) {
    return nextXml;
  }

  const uniqueRows = Array.from(new Set(rows)).sort((a, b) => a - b);
  const breaksBody = uniqueRows.map((row) => `<brk id="${Math.round(row)}" max="16383" man="1"/>`).join('');
  const rowBreaksTag = `<rowBreaks count="${uniqueRows.length}" manualBreakCount="${uniqueRows.length}">${breaksBody}</rowBreaks>`;

  if (nextXml.includes('<drawing ')) {
    return nextXml.replace(/<drawing\b/, `${rowBreaksTag}<drawing`);
  }
  if (nextXml.includes('</worksheet>')) {
    return nextXml.replace('</worksheet>', `${rowBreaksTag}</worksheet>`);
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

  if (printAreaRegex.test(workbookXml)) {
    return workbookXml.replace(printAreaRegex, printAreaTag);
  }

  if (workbookXml.includes('<definedNames>')) {
    return workbookXml.replace('</definedNames>', `${printAreaTag}</definedNames>`);
  }

  if (workbookXml.includes('</sheets>')) {
    return workbookXml.replace('</sheets>', `</sheets><definedNames>${printAreaTag}</definedNames>`);
  }

  if (workbookXml.includes('<calcPr')) {
    return workbookXml.replace('<calcPr', `<definedNames>${printAreaTag}</definedNames><calcPr`);
  }

  return workbookXml.replace('</workbook>', `<definedNames>${printAreaTag}</definedNames></workbook>`);
}

function parseXmlDocumentOrThrow(xmlText, label) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const parseErrors = xmlDoc.getElementsByTagName('parsererror');
  if (parseErrors && parseErrors.length > 0) {
    throw new Error(`Failed to parse ${label || 'XML'}.`);
  }
  return xmlDoc;
}

function getElementsByLocalName(node, localName) {
  if (!node) return [];
  return Array.from(node.getElementsByTagNameNS('*', localName));
}

function splitCellReference(cellRef) {
  const match = String(cellRef || '').trim().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    column: match[1],
    row: Number(match[2])
  };
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
  while (cellElement.firstChild) {
    cellElement.removeChild(cellElement.firstChild);
  }
  cellElement.setAttribute('t', 'inlineStr');
  const mainNs = xmlDoc.documentElement ? xmlDoc.documentElement.namespaceURI : null;
  const inlineStringNode = xmlDoc.createElementNS(mainNs, 'is');
  const textNode = xmlDoc.createElementNS(mainNs, 't');
  const text = String(textValue == null ? '' : textValue);
  if (/^\s|\s$/.test(text) || text.includes('\n')) {
    textNode.setAttribute('xml:space', 'preserve');
  }
  textNode.textContent = text;
  inlineStringNode.appendChild(textNode);
  cellElement.appendChild(inlineStringNode);
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
    .replace(
      /(<xdr:from>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:from>)/,
      (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`
    )
    .replace(
      /(<xdr:to>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:to>)/,
      (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`
    );
}

function duplicateTemplateDrawingAnchorsForPages(drawingXml, pageCount) {
  const totalPages = Number(pageCount || 0);
  if (totalPages <= 1 || !drawingXml) return drawingXml;

  const anchorBlocks = Array.from(String(drawingXml).matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)).map((match) => match[0]);
  if (anchorBlocks.length === 0) return drawingXml;

  const blockStartZeroBased = CERTIFICATE_BLOCK_START_ROW - 1;
  const blockEndZeroBased = CERTIFICATE_BLOCK_END_ROW - 1;

  const templateAnchors = anchorBlocks.filter((anchorXml) => {
    const fromRow = getDrawingAnchorFromRowIndex(anchorXml);
    if (!Number.isFinite(fromRow)) return false;
    return fromRow >= blockStartZeroBased && fromRow <= blockEndZeroBased;
  });

  if (templateAnchors.length === 0) return drawingXml;

  let nextPicId = (() => {
    const picIdNumbers = Array.from(String(drawingXml).matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
    return picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
  })();

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
  const siNodes = getElementsByLocalName(doc, 'si');
  return siNodes.map((siNode) => {
    const textNodes = getElementsByLocalName(siNode, 't');
    return textNodes.map((node) => node.textContent || '').join('');
  });
}

function getTemplateInstagramPattern(sheetDoc, sharedStringsXml) {
  const sharedTexts = parseSharedStringsText(sharedStringsXml);
  const cellNodes = getElementsByLocalName(sheetDoc, 'c');
  const instagramCell = cellNodes.find((cell) => (cell.getAttribute('r') || '') === 'A45');
  if (!instagramCell) return 'instagram_handle_name';

  const valueNode = getElementsByLocalName(instagramCell, 'v')[0];
  const type = (instagramCell.getAttribute('t') || '').toLowerCase();
  if (type === 's' && valueNode) {
    const index = Number(valueNode.textContent || 0);
    const sharedText = sharedTexts[index] || '';
    if (sharedText.includes('instagram_handle_name')) {
      return sharedText;
    }
  }
  return 'instagram_handle_name';
}

function setInlineCellValueByRef(cellMap, ref, value, xmlDoc) {
  const cellElement = cellMap.get(ref);
  if (!cellElement) return;
  setSheetCellInlineText(cellElement, value, xmlDoc);
}

async function applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip is unavailable');
  }

  const zip = await JSZip.loadAsync(workbookBlob);
  const pngImage = await buildCertificatePngBytesFromDataUrl(imageDataUrl);
  const pngBytes = pngImage.bytes;
  const drawingPath = 'xl/drawings/drawing1.xml';
  const drawingRelsPath = 'xl/drawings/_rels/drawing1.xml.rels';
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const workbookPath = 'xl/workbook.xml';

  const drawingFile = zip.file(drawingPath);
  const drawingRelsFile = zip.file(drawingRelsPath);
  const sheetFile = zip.file(sheetPath);
  const workbookFile = zip.file(workbookPath);
  if (!drawingFile || !drawingRelsFile) {
    throw new Error('Template drawing files were not found.');
  }

  const drawingXml = await drawingFile.async('string');
  const drawingRelsXml = await drawingRelsFile.async('string');
  const sheetXml = sheetFile ? await sheetFile.async('string') : '';
  const workbookXml = workbookFile ? await workbookFile.async('string') : '';

  const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((m) => Number(m[1]) || 0);
  const nextRelIdNum = relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1;
  const nextRelId = `rId${nextRelIdNum}`;

  const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((m) => Number(m[1]) || 0);
  const nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;

  const mediaPath = 'xl/media/certificate-artwork.png';
  zip.file(mediaPath, pngBytes);

  const insertedRel = `<Relationship Id="${nextRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork.png"/>`;
  const newDrawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);

  const defaultAnchor = {
    fromCol: 2,
    fromColOff: 0,
    fromRow: 4,
    fromRowOff: 0,
    toCol: 7,
    toColOff: 0,
    toRow: 22,
    toRowOff: 0
  };

  const imageAnchor = sheetXml
    ? computeContainedImageAnchor(parseWorksheetMetrics(sheetXml), pngImage.width, pngImage.height)
    : defaultAnchor;

  const artworkAnchor = buildArtworkAnchorXml(imageAnchor, nextPicId, nextRelId);
  const newDrawingXml = drawingXml.replace('</xdr:wsDr>', `${artworkAnchor}</xdr:wsDr>`);
  const newSheetXml = enforceWorksheetPageSetupXml(sheetXml, { fitToWidth: 1, fitToHeight: 1, fitToPage: 1 });
  const printAreaFormula = buildWorkbookPrintAreaFormula(workbookXml);
  const newWorkbookXml = upsertWorkbookPrintArea(workbookXml, printAreaFormula);

  zip.file(drawingRelsPath, newDrawingRelsXml);
  zip.file(drawingPath, newDrawingXml);
  if (sheetFile) {
    zip.file(sheetPath, newSheetXml);
  }
  if (workbookFile) {
    zip.file(workbookPath, newWorkbookXml);
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeArtistNameKey(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getArtistInstagramForCertificate(sold, work) {
  const exhibition = ensureExhibitionInfoData();
  const map = exhibition.artistInstagramMap || {};
  const author = (work?.author || sold?.author || '').toString().trim();
  if (!author) return '';

  const direct = (map[author] || '').toString().trim();
  if (direct) return direct;

  const normalizedAuthor = normalizeArtistNameKey(author);
  const fallbackKey = Object.keys(map).find((name) => normalizeArtistNameKey(name) === normalizedAuthor);
  return fallbackKey ? (map[fallbackKey] || '').toString().trim() : '';
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
  if (typeof JSZip === 'undefined') {
    return workbookBlob;
  }

  const placeholder = 'instagram_handle_name';
  const replacement = escapeXmlText((instagramTag || '').toString().trim());
  const zip = await JSZip.loadAsync(workbookBlob);
  let changed = false;

  const sharedStringsPath = 'xl/sharedStrings.xml';
  const sharedStringsFile = zip.file(sharedStringsPath);
  if (sharedStringsFile) {
    const sharedXml = await sharedStringsFile.async('text');
    const replacedSharedXml = sharedXml.split(placeholder).join(replacement);
    if (replacedSharedXml !== sharedXml) {
      zip.file(sharedStringsPath, replacedSharedXml);
      changed = true;
    }
  }

  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetFile = zip.file(sheetPath);
  if (sheetFile) {
    const sheetXml = await sheetFile.async('text');
    const replacedSheetXml = sheetXml.split(placeholder).join(replacement);
    if (replacedSheetXml !== sheetXml) {
      zip.file(sheetPath, replacedSheetXml);
      changed = true;
    }
  }

  if (!changed) {
    return workbookBlob;
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

function applyCertificateArtistInstagram(sheet, instagramTag) {
  const value = (instagramTag || '').toString().trim();
  if (!sheet) return;

  const placeholder = 'instagram_handle_name';
  const fixedCells = ['A45', 'B45', 'C45'];
  let applied = false;

  fixedCells.forEach((address) => {
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
  applied = false;

  try {
    const usedRange = sheet.usedRange();
    if (usedRange) {
      const startCell = usedRange.startCell();
      const startRow = startCell.rowNumber();
      const startCol = startCell.columnNumber();
      const values = usedRange.value();
      if (Array.isArray(values)) {
        for (let r = 0; r < values.length && !applied; r += 1) {
          const row = values[r];
          if (!Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c += 1) {
            const text = (row[c] == null ? '' : String(row[c])).trim();
            if (!labelRegex.test(text)) continue;
            sheet.cell(startRow + r, startCol + c + 1).value(value);
            applied = true;
            break;
          }
        }
      }
    }
  } catch (error) {
    applied = false;
  }

  if (!applied) {
    // Fallback cell for templates without detectable Instagram label text.
    sheet.cell('F36').value(value);
  }
}

async function buildCertificateWorkbookBlob(sold, work) {
  if (typeof XlsxPopulate === 'undefined') {
    throw new Error('XlsxPopulate is unavailable');
  }

  const templateBuffer = await getCertificateTemplateArrayBuffer();
  const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
  const sheet = workbook.sheet(0);

  const artist = (work?.author || sold.author || '').toString();
  const title = (work?.title || sold.title || '').toString();
  const materials = (work?.materials || '').toString();
  const size = (work?.size || '').toString();
  const year = (work?.year || '').toString();
  const edition = '';
  const soldDate = normalizeCertificateDateText(sold.soldAtKst || '');
  const photoText = (work?.photoName || sold.photoName || '').toString();
  const artistInstagram = getArtistInstagramForCertificate(sold, work);

  // Template fixed data cells (validated from workbook structure).
  sheet.cell('F24').value(artist);
  sheet.cell('F26').value(title);
  sheet.cell('F28').value(materials);
  sheet.cell('F30').value(size);
  sheet.cell('F32').value(year);
  sheet.cell('F34').value(edition);

  if (soldDate) {
    sheet.cell('B3').value(`Date ${soldDate}`);
  }
  if (photoText) {
    sheet.cell('C22').value('');
  }

  let workbookBlob = await workbook.outputAsync();
  workbookBlob = await applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, artistInstagram);
  const imageDataUrl = getCertificateImageDataUrl(sold, work);
  if (!imageDataUrl) {
    throw new Error('Artwork image not found for certificate.');
  }
  return applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl);
}

function buildAllCertificatesDownloadFileName() {
  const exhibition = getCurrentExhibition() || {};
  const exhibitionName = (exhibition.title || exhibition.name || '전시').toString().trim() || '전시';
  const safeName = exhibitionName.replace(/[\\/:*?"<>|]/g, '_');
  return `${safeName}-모든보증서.xlsx`;
}

async function buildAllCertificatesWorkbookBlob(entries) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip is unavailable');
  }

  const certificateEntries = Array.isArray(entries) ? entries : [];
  if (certificateEntries.length === 0) {
    throw new Error('No generated certificates to export.');
  }

  const templateBuffer = await getCertificateTemplateArrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

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
  if (!sheetData) {
    throw new Error('Template sheetData was not found.');
  }

  const rowElements = getElementsByLocalName(sheetData, 'row');
  const templateRows = rowElements
    .filter((rowEl) => {
      const rowIndex = Number(rowEl.getAttribute('r') || 0);
      return rowIndex >= CERTIFICATE_BLOCK_START_ROW && rowIndex <= CERTIFICATE_BLOCK_END_ROW;
    })
    .map((rowEl) => rowEl.cloneNode(true));

  if (templateRows.length === 0) {
    throw new Error('Template certificate row block was not found.');
  }

  const mergeCellsNode = getElementsByLocalName(sheetDoc, 'mergeCells')[0] || null;
  const templateMergeRefs = mergeCellsNode
    ? getElementsByLocalName(mergeCellsNode, 'mergeCell')
      .map((mergeCell) => (mergeCell.getAttribute('ref') || '').trim())
      .filter(Boolean)
    : [];

  while (sheetData.firstChild) {
    sheetData.removeChild(sheetData.firstChild);
  }

  const cellMap = new Map();
  certificateEntries.forEach((entry, pageIndex) => {
    const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
    templateRows.forEach((templateRow) => {
      const rowClone = templateRow.cloneNode(true);
      const originalRow = Number(rowClone.getAttribute('r') || 0);
      const shiftedRow = originalRow + rowOffset;
      rowClone.setAttribute('r', String(shiftedRow));

      const rowCells = getElementsByLocalName(rowClone, 'c');
      rowCells.forEach((cell) => {
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
    if (sheetData.nextSibling) {
      sheetData.parentNode.insertBefore(resolvedMergeCellsNode, sheetData.nextSibling);
    } else {
      sheetData.parentNode.appendChild(resolvedMergeCellsNode);
    }
  }

  while (resolvedMergeCellsNode.firstChild) {
    resolvedMergeCellsNode.removeChild(resolvedMergeCellsNode.firstChild);
  }

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
    const soldDate = normalizeCertificateDateText(sold.soldAtKst || '');
    const artistInstagram = getArtistInstagramForCertificate(sold, work);

    const artist = (work.author || sold.author || '').toString();
    const title = (work.title || sold.title || '').toString();
    const materials = (work.materials || '').toString();
    const size = (work.size || '').toString();
    const year = (work.year || '').toString();
    const edition = '';

    setInlineCellValueByRef(cellMap, `F${24 + rowOffset}`, artist, sheetDoc);
    setInlineCellValueByRef(cellMap, `F${26 + rowOffset}`, title, sheetDoc);
    setInlineCellValueByRef(cellMap, `F${28 + rowOffset}`, materials, sheetDoc);
    setInlineCellValueByRef(cellMap, `F${30 + rowOffset}`, size, sheetDoc);
    setInlineCellValueByRef(cellMap, `F${32 + rowOffset}`, year, sheetDoc);
    setInlineCellValueByRef(cellMap, `F${34 + rowOffset}`, edition, sheetDoc);
    setInlineCellValueByRef(cellMap, `B${3 + rowOffset}`, soldDate ? `Date ${soldDate}` : '', sheetDoc);

    const instagramText = artistInstagram
      ? (instagramPattern.includes('instagram_handle_name')
        ? instagramPattern.split('instagram_handle_name').join(artistInstagram)
        : artistInstagram)
      : '';
    setInlineCellValueByRef(cellMap, `A${45 + rowOffset}`, instagramText, sheetDoc);
  });

  const finalEndRow = CERTIFICATE_BLOCK_END_ROW + (certificateEntries.length - 1) * CERTIFICATE_BLOCK_HEIGHT;
  const dimensionNode = getElementsByLocalName(sheetDoc, 'dimension')[0];
  if (dimensionNode) {
    dimensionNode.setAttribute('ref', `A${CERTIFICATE_BLOCK_START_ROW}:I${finalEndRow}`);
  }

  let newSheetXml = new XMLSerializer().serializeToString(sheetDoc);
  newSheetXml = enforceWorksheetPageSetupXml(newSheetXml, { fitToWidth: 1, fitToHeight: 0, fitToPage: 1 });

  const pageBreakRows = [];
  for (let i = 0; i < certificateEntries.length - 1; i += 1) {
    pageBreakRows.push(CERTIFICATE_BLOCK_END_ROW + i * CERTIFICATE_BLOCK_HEIGHT);
  }
  newSheetXml = upsertWorksheetRowBreaksXml(newSheetXml, pageBreakRows);

  drawingXml = duplicateTemplateDrawingAnchorsForPages(drawingXml, certificateEntries.length);

  const metrics = parseWorksheetMetrics(newSheetXml);

  let nextRelIdNum = (() => {
    const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((m) => Number(m[1]) || 0);
    return relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1;
  })();

  let nextPicId = (() => {
    const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((m) => Number(m[1]) || 0);
    return picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
  })();

  for (let i = 0; i < certificateEntries.length; i += 1) {
    const entry = certificateEntries[i];
    const pngImage = await buildCertificatePngBytesFromDataUrl(entry.imageDataUrl);
    const mediaPath = `xl/media/certificate-artwork-${i + 1}.png`;
    zip.file(mediaPath, pngImage.bytes);

    const relId = `rId${nextRelIdNum}`;
    nextRelIdNum += 1;
    const picId = nextPicId;
    nextPicId += 1;

    const insertedRel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork-${i + 1}.png"/>`;
    drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);

    const rowOffset = i * CERTIFICATE_BLOCK_HEIGHT;
    const imageAnchor = computeContainedImageAnchor(metrics, pngImage.width, pngImage.height, rowOffset);
    const artworkAnchor = buildArtworkAnchorXml(imageAnchor, picId, relId);
    drawingXml = drawingXml.replace('</xdr:wsDr>', `${artworkAnchor}</xdr:wsDr>`);
  }

  const printAreaFormula = buildWorkbookPrintAreaFormula(workbookXml, finalEndRow);
  const newWorkbookXml = upsertWorkbookPrintArea(workbookXml, printAreaFormula);

  zip.file(sheetPath, newSheetXml);
  zip.file(workbookPath, newWorkbookXml);
  zip.file(drawingPath, drawingXml);
  zip.file(drawingRelsPath, drawingRelsXml);

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

async function handleDownloadAllCertificatesAction() {
  if (typeof JSZip === 'undefined') {
    alert('보증서 생성 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const soldWorks = ensureSoldWorksArray();
  const generatedSales = soldWorks.filter((sold) => normalizeSoldItemType(sold) === '작품' && hasGeneratedCertificate(sold));
  if (generatedSales.length === 0) {
    alert('생성된 보증서가 없습니다. 먼저 판매 항목에서 보증서를 생성해주세요.');
    return;
  }

  const entries = [];
  const missingImageSales = [];

  generatedSales.forEach((sold) => {
    const work = getSourceArtworkForSold(sold) || null;
    const imageDataUrl = getCertificateImageDataUrl(sold, work);
    if (!imageDataUrl) {
      missingImageSales.push(sold);
      return;
    }
    entries.push({ sold, work, imageDataUrl });
  });

  if (missingImageSales.length > 0) {
    alert(`이미지가 누락된 보증서 ${missingImageSales.length}건이 있어 전체 보증서를 생성할 수 없습니다. 판매 목록에서 이미지 상태를 확인해주세요.`);
    return;
  }

  try {
    const workbookBlob = await buildAllCertificatesWorkbookBlob(entries);
    downloadBlobFile(workbookBlob, buildAllCertificatesDownloadFileName());
  } catch (error) {
    console.error('all certificates generation failed', error);
    alert('모든 보증서 다운로드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

async function handleSoldCertificateAction(soldId) {
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find((item) => item.id === soldId);
  if (!sold) return;
  if (normalizeSoldItemType(sold) !== '작품') return;

  if (!sold.saved) {
    alert('보증서 생성을 위해 판매 항목을 먼저 저장해주세요.');
    return;
  }

  const work = getSourceArtworkForSold(sold);
  if (!work) {
    alert('작품 목록에서 해당 작품 정보를 찾을 수 없습니다. 작품 목록 데이터를 확인해주세요.');
    return;
  }

  if (typeof XlsxPopulate === 'undefined' || typeof JSZip === 'undefined') {
    alert('보증서 생성을 위한 라이브러리를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.');
    return;
  }

  const imageDataUrl = getCertificateImageDataUrl(sold, work);
  if (!imageDataUrl) {
    alert('작품 이미지가 없어 보증서를 생성할 수 없습니다. 작품 목록에서 사진을 먼저 등록해주세요.');
    return;
  }

  const certificateFileName = sold.certificateFileName || safeCertificateFileName(work?.title || sold.title || '작품');

  if (hasGeneratedCertificate(sold)) {
    try {
      const blob = await buildCertificateWorkbookBlob(sold, work);
      downloadBlobFile(blob, certificateFileName);
    } catch (error) {
      console.error('certificate download failed', error);
      alert('보증서 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    return;
  }

  try {
    await buildCertificateWorkbookBlob(sold, work);
    sold.certificateFileName = certificateFileName;
    sold.certificateCreatedAt = new Date().toISOString();
    sold.certificateReady = true;
    sold.certificateVersion = 2;

    if (exhibitionDetailState.exhibition) {
      exhibitionDetailState.exhibition.soldWorks = soldWorks;
    }
    saveExhibition();
    renderSoldWorkRows();
  } catch (error) {
    console.error('certificate generation failed', error);
    alert('보증서 생성에 실패했습니다. 템플릿 파일과 네트워크 상태를 확인해주세요.');
  }
}

function handleSoldFieldChange(soldId, field, value) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  if (!sold) return;
  if (!canCurrentUserModifyOwnedRow(sold)) return;

  ensureSalesEditUndoSnapshot(soldId);

  if (field === 'soldQuantity') {
    if (sold.saved) {
      return;
    }
    sold.soldQuantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), value);
  } else {
    sold[field] = (value || '').trim();
  }
  if (field === 'paymentMethodEtc' && sold.paymentMethod !== '기타') {
    sold.paymentMethodEtc = '';
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
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

  if (soldAtInput) {
    sold.soldAtKst = soldInputValueToKst(soldAtInput.value);
  }
  if (buyerNameInput) {
    sold.buyerName = buyerNameInput.value.trim();
  }
  if (buyerPhoneInput) {
    sold.buyerPhone = buyerPhoneInput.value.trim();
  }
  if (noteInput) {
    sold.note = noteInput.value.trim();
  }
  if (paymentMethodSelect) {
    sold.paymentMethod = paymentMethodSelect.value;
  }
  if (paymentMethodEtcInput) {
    sold.paymentMethodEtc = paymentMethodEtcInput.value.trim();
  } else if (sold.paymentMethod !== '기타') {
    sold.paymentMethodEtc = '';
  }
  if (soldQuantityInput) {
    sold.soldQuantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), soldQuantityInput.value);
  }
}

function formatKoreanPhone(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function handleSoldPhoneInput(soldId, event) {
  const formatted = formatKoreanPhone(event.target.value);
  event.target.value = formatted;
  handleSoldFieldChange(soldId, 'buyerPhone', formatted);
}

function handleSoldPaymentMethodChange(soldId, value) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  if (!sold) return;
  if (!canCurrentUserModifyOwnedRow(sold)) return;

  ensureSalesEditUndoSnapshot(soldId);

  sold.paymentMethod = value;
  if (value !== '기타') {
    sold.paymentMethodEtc = '';
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function addSoldWorkRow() {
  openSalesAddModal();
}

function handleSoldWorkSearchChange(soldId, field, value) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  if (!sold) return;
  if (!canCurrentUserModifyOwnedRow(sold)) return;
  pushSalesUndoSnapshot();

  const query = (value || '').trim();
  sold[field] = query;

  const sourceWorks = getSalesSearchResults('__all__');
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
    sold.photoDataUrl = match.photoDataUrl || '';
    sold.photoPreviewDataUrl = match.photoPreviewDataUrl || getPhotoPreviewDataUrl(match);
    sold.author = match.author || '';
    sold.price = match.price || '';
    sold.soldQuantity = sold.itemType === '굿즈' ? parseSoldQuantity(sold.soldQuantity) : 1;
  } else {
    sold.workId = null;
    sold.itemType = '작품';
    sold.category = '';
    sold.photoName = '';
    sold.photoDataUrl = '';
    sold.photoPreviewDataUrl = '';
    sold.author = '';
    sold.price = '';
  }

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function toggleSalesSelection(soldId, isChecked) {
  const soldWorks = getSortedSoldWorks();
  const currentIndex = typeof arguments[3] === 'number'
    ? arguments[3]
    : soldWorks.findIndex(item => item.id === soldId);
  const event = arguments[2];
  const isShiftRange = Boolean(event && event.shiftKey && exhibitionDetailState.lastSalesCheckboxIndex !== null && currentIndex !== -1);

  if (isShiftRange) {
    const start = Math.min(exhibitionDetailState.lastSalesCheckboxIndex, currentIndex);
    const end = Math.max(exhibitionDetailState.lastSalesCheckboxIndex, currentIndex);
    const rangeIds = soldWorks.slice(start, end + 1).map(item => item.id);

    if (isChecked) {
      exhibitionDetailState.selectedSalesIds = Array.from(new Set([...exhibitionDetailState.selectedSalesIds, ...rangeIds]));
    } else {
      exhibitionDetailState.selectedSalesIds = exhibitionDetailState.selectedSalesIds.filter(id => !rangeIds.includes(id));
    }
  } else if (isChecked) {
    exhibitionDetailState.selectedSalesIds = Array.from(new Set([...exhibitionDetailState.selectedSalesIds, soldId]));
  } else {
    exhibitionDetailState.selectedSalesIds = exhibitionDetailState.selectedSalesIds.filter(id => id !== soldId);
  }

  if (currentIndex !== -1) {
    exhibitionDetailState.lastSalesCheckboxIndex = currentIndex;
  }

  renderSoldWorkRows();
}

function toggleSelectAllSales(source) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const ids = soldWorks.map(item => item.id);
  exhibitionDetailState.selectedSalesIds = source.checked ? ids : [];
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  renderSoldWorkRows();
}

function toggleSelectAllSalesFromButton() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const ids = soldWorks.map(item => item.id);
  const allSelected = soldWorks.length > 0 && soldWorks.every(item => exhibitionDetailState.selectedSalesIds.includes(item.id));
  exhibitionDetailState.selectedSalesIds = allSelected ? [] : ids;
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  renderSoldWorkRows();
}

function deleteAllSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  if (soldWorks.length === 0) return;
  if (!window.confirm('모든 판매 기록을 삭제하시겠습니까?')) return;

  pushSalesUndoSnapshot();
  exhibition.soldWorks = [];
  exhibitionDetailState.selectedSalesIds = [];
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function deleteSelectedSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  if (exhibitionDetailState.selectedSalesIds.length === 0) return;
  if (!window.confirm('선택된 판매 기록을 삭제하시겠습니까?')) return;

  pushSalesUndoSnapshot();
  exhibition.soldWorks = soldWorks.filter(item => !exhibitionDetailState.selectedSalesIds.includes(item.id));
  exhibitionDetailState.selectedSalesIds = [];
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function undoSalesChanges() {
  const exhibition = getCurrentExhibition();
  if (exhibitionDetailState.salesUndoStack.length === 0) return;

  const previous = exhibitionDetailState.salesUndoStack.pop();
  exhibition.soldWorks = cloneSalesRecords(previous);
  exhibitionDetailState.salesEditSnapshotIds = [];
  exhibitionDetailState.selectedSalesIds = [];
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function ensureSalesEditUndoSnapshot(soldId) {
  if (exhibitionDetailState.salesEditSnapshotIds.includes(soldId)) return;
  pushSalesUndoSnapshot();
  exhibitionDetailState.salesEditSnapshotIds.push(soldId);
}

function openImagePreviewBySoldId(soldId, event) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  const previewDataUrl = getPhotoPreviewDataUrl(sold);
  if (!sold || !previewDataUrl) return;

  // Reuse existing preview popover behavior with sales record payload.
  if (event) event.stopPropagation();
  closeImagePreview();

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
    if (!popover.contains(clickEvent.target)) {
      closeImagePreview();
    }
  };

  setTimeout(() => {
    if (imagePreviewOutsideClickHandler) {
      document.addEventListener('click', imagePreviewOutsideClickHandler);
    }
  }, 0);
}

function renderStaffManagement(container) {
  if (!canManageStaffRoles()) {
    const fallbackTab = getFirstAllowedTab() || 'exhibition-info';
    switchTab(fallbackTab);
    return;
  }

  const exhibition = getCurrentExhibition();
  const planners = exhibition.staff?.planners || [];
  const artists = exhibition.staff?.artists || [];
  const staffs = exhibition.staff?.staffs || [];

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const candidates = users.filter(user => user.approved && normalizeAccountType(getEffectiveGalleryRole(user)) === '기획자/작가');

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

function getInviteRoleLabel(role) {
  if (role === 'planners') return '기획자';
  if (role === 'artists') return '작가';
  if (role === 'staffs') return '스탭';
  return '관계자';
}

function openInviteModal(role) {
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  exhibitionDetailState.inviteRole = role;
  const exhibition = getCurrentExhibition();
  const users = JSON.parse(localStorage.getItem('users')) || [];

  document.getElementById('invite-modal-title').textContent = `${getInviteRoleLabel(role)} 초대`;
  document.getElementById('invite-modal-description').textContent = '모든 사용자 중에서 전시에 참여자를 선택하세요.';

  const listContainer = document.getElementById('invite-user-list');
  listContainer.innerHTML = '';

  const assignedIds = new Set(exhibition.staff?.[role] || []);

  exhibitionDetailState.inviteSearch = '';
  renderInviteUserList(users, assignedIds);
  document.getElementById('invite-search').value = '';
  document.getElementById('invite-modal').style.display = 'flex';
}

function closeInviteModal() {
  document.getElementById('invite-modal').style.display = 'none';
  exhibitionDetailState.inviteRole = null;
  exhibitionDetailState.inviteSearch = '';
}

function filterInviteUsers() {
  exhibitionDetailState.inviteSearch = document.getElementById('invite-search').value.trim().toLowerCase();
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const exhibition = getCurrentExhibition();
  const assignedIds = new Set(exhibition.staff?.[exhibitionDetailState.inviteRole] || []);
  renderInviteUserList(users, assignedIds);
}

function renderInviteUserList(users, assignedIds) {
  const listContainer = document.getElementById('invite-user-list');
  listContainer.innerHTML = '';
  const search = exhibitionDetailState.inviteSearch;

  if (users.length === 0) {
    listContainer.innerHTML = '<p class="empty-state">등록된 사용자가 없습니다.</p>';
    return;
  }

  let renderedCount = 0;

  users.forEach(user => {
    const label = normalizeAccountType(getEffectiveGalleryRole(user)) || '미지정';
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
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  const role = exhibitionDetailState.inviteRole;
  if (!role) return;

  const checkboxes = Array.from(document.querySelectorAll('#invite-user-list input[type="checkbox"]'));
  const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.value));

  const exhibition = getCurrentExhibition();
  exhibition.staff = exhibition.staff || { planners: [], artists: [], staffs: [] };
  exhibition.staff[role] = Array.from(new Set(selectedIds));
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.staff = exhibition.staff;
  }
  saveExhibition();
  closeInviteModal();
  switchTab('staff');
}

function removeStaffMember(role, userId) {
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  const exhibition = getCurrentExhibition();
  exhibition.staff[role] = (exhibition.staff[role] || []).filter(id => id !== userId);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.staff = exhibition.staff;
  }
  saveExhibition();
  switchTab('staff');
}

function renderWorksManagement(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'works-wrapper';
  const exhibition = getCurrentExhibition();
  const isGoodsMode = exhibitionDetailState.inventoryMode === 'goods';

  const searchBar = document.createElement('div');
  searchBar.className = 'works-search-bar';
  searchBar.innerHTML = `
    <div class="works-search-row">
      <input id="work-search" type="text" class="works-search" placeholder="작품명, 작가, 재료 등 검색" value="${exhibitionDetailState.workSearch}" oninput="handleWorkSearchInput(this.value)">
      <button class="modal-btn modal-approve" onclick="toggleWorkAdvanced()">${exhibitionDetailState.workAdvanced ? '간단 검색' : '고급 검색'}</button>
    </div>
    <div id="advanced-search-panel" class="advanced-search-panel ${exhibitionDetailState.workAdvanced ? 'active' : ''}">
      <div class="advanced-search-grid">
        <label>제목 <input type="text" id="filter-title" value="${exhibitionDetailState.workFilters.title}" onchange="handleAdvancedFilter('title', this.value)"></label>
        <label>작가 <input type="text" id="filter-artist" value="${exhibitionDetailState.workFilters.artist}" onchange="handleAdvancedFilter('artist', this.value)"></label>
        <label>가격 <input type="text" id="filter-price" value="${exhibitionDetailState.workFilters.price}" onchange="handleAdvancedFilter('price', this.value)"></label>
        <label>재료 <input type="text" id="filter-materials" value="${exhibitionDetailState.workFilters.materials}" onchange="handleAdvancedFilter('materials', this.value)"></label>
        <label>크기 <input type="text" id="filter-size" value="${exhibitionDetailState.workFilters.size}" onchange="handleAdvancedFilter('size', this.value)"></label>
        <label>연도 <input type="text" id="filter-year" value="${exhibitionDetailState.workFilters.year}" onchange="handleAdvancedFilter('year', this.value)"></label>
        <label>카테고리 <input type="text" id="filter-category" value="${exhibitionDetailState.workFilters.category}" onchange="handleAdvancedFilter('category', this.value)"></label>
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
  addButton.onclick = () => addWorkRow();
  actionsRow.appendChild(addButton);

  const actionGroup = document.createElement('div');
  actionGroup.className = 'works-action-group';

  const selectAllButton = document.createElement('button');
  selectAllButton.className = 'works-action-btn works-action-btn-secondary';
  selectAllButton.id = 'work-select-all-btn';
  const visibleWorks = getVisibleWorks();
  const allVisibleSelected = visibleWorks.length > 0 && visibleWorks.every(work => exhibitionDetailState.selectedWorkIds.includes(work.id));
  selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
  selectAllButton.onclick = () => toggleSelectAllVisibleWorks();
  actionGroup.appendChild(selectAllButton);

  const deleteAllButton = document.createElement('button');
  deleteAllButton.className = 'works-action-btn works-action-btn-danger';
  deleteAllButton.textContent = '전체 삭제';
  deleteAllButton.onclick = () => deleteAllWorks();
  if (isArtistScopedUser()) {
    deleteAllButton.style.display = 'none';
  }
  actionGroup.appendChild(deleteAllButton);

  const deleteSelectedButton = document.createElement('button');
  deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
  deleteSelectedButton.id = 'work-delete-selected-btn';
  deleteSelectedButton.textContent = '선택된 항목만 삭제';
  deleteSelectedButton.onclick = () => deleteSelectedWorks();
  deleteSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  actionGroup.appendChild(deleteSelectedButton);

  const editSelectedButton = document.createElement('button');
  editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
  editSelectedButton.id = 'work-edit-selected-btn';
  editSelectedButton.textContent = '선택된 항목 수정';
  editSelectedButton.onclick = () => editSelectedWorks();
  editSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  actionGroup.appendChild(editSelectedButton);

  const exportButton = document.createElement('button');
  exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
  exportButton.textContent = '엑셀 파일로 다운 받기';
  exportButton.onclick = () => exportWorksToExcel();

  const saveAllButton = document.createElement('button');
  saveAllButton.className = 'works-action-btn works-action-btn-secondary';
  saveAllButton.textContent = '전체 저장';
  saveAllButton.id = 'save-all-btn';
  saveAllButton.style.display = 'none';
  saveAllButton.onclick = () => saveAllWorks();
  actionGroup.appendChild(saveAllButton);

  const undoButton = document.createElement('button');
  undoButton.className = 'works-action-btn works-action-btn-secondary';
  undoButton.id = 'work-undo-btn';
  undoButton.textContent = '되돌리기';
  undoButton.onclick = () => undoWorkChanges();
  actionGroup.appendChild(undoButton);

  actionsRow.appendChild(actionGroup);
  actionsRow.appendChild(exportButton);
  wrapper.appendChild(actionsRow);

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'works-table-wrapper' + (exhibitionDetailState.workListExpanded ? ' expanded' : ' collapsed');
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
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleWorkSort('manualNumber')">${getSortIndicator('manualNumber')}</button>
            </div>
          </th>
          <th>사진</th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>제품 이름</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'title' ? ' active' : ''}" onclick="toggleWorkSort('title')">${getSortIndicator('title')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>가격</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'price' ? ' active' : ''}" onclick="toggleWorkSort('price')">${getSortIndicator('price')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'quantity' ? ' active' : ''}" onclick="toggleWorkSort('quantity')">${getSortIndicator('quantity')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>판매된 수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'soldQuantity' ? ' active' : ''}" onclick="toggleWorkSort('soldQuantity')">${getSortIndicator('soldQuantity')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>남은 수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'remainingQuantity' ? ' active' : ''}" onclick="toggleWorkSort('remainingQuantity')">${getSortIndicator('remainingQuantity')}</button>
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
                ${key !== 'photoName' ? `<button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === key ? ' active' : ''}" onclick="toggleWorkSort('${key}')">${getSortIndicator(key)}</button>` : ''}
              </div>
            </th>
          `).join('')}
          <th class="sortable-header work-status-cell">
            <div class="header-with-sort">
              <span>상태</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'status' ? ' active' : ''}" onclick="toggleWorkSort('status')">${getSortIndicator('status')}</button>
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

  const ticker = document.createElement('div');
  ticker.className = 'stats-ticker';
  ticker.id = 'works-sold-stats-ticker';
  wrapper.appendChild(ticker);

  container.appendChild(wrapper);
  updateWorksUndoButton();
  renderWorkRows();
}

function updateSaveAllButtonVisibility() {
  ['save-all-btn', 'save-all-btn-bottom'].forEach((buttonId) => {
    const saveAllBtn = document.getElementById(buttonId);
    if (saveAllBtn) {
      saveAllBtn.style.display = exhibitionDetailState.unsavedWorkCount >= 2 ? 'inline-block' : 'none';
    }
  });
}

function renderWorkRows() {
  const tbody = document.getElementById('works-tbody');
  const exhibition = getCurrentExhibition();
  const isGoodsMode = exhibitionDetailState.inventoryMode === 'goods';
  let works = exhibition.works || [];
  tbody.innerHTML = '';

  works = getSortedWorks();
  
  exhibitionDetailState.unsavedWorkCount = works.filter(w => !w.saved).length;
  updateSaveAllButtonVisibility();
  updateWorkSelectionActionButtons(works);

  if (works.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="12" class="no-users">등록된 작품이 없습니다.</td>';
    tbody.appendChild(emptyRow);
    refreshGridKeyboardNavigation('works-tbody');
    renderSoldStatsTicker('works');
    return;
  }

  const soldWorkIdSet = new Set(ensureSoldWorksArray().map(item => item.workId));

  const selectAllCheckbox = document.getElementById('select-all-works');
  if (selectAllCheckbox) {
    const allVisibleSelected = works.length > 0 && works.every(work => exhibitionDetailState.selectedWorkIds.includes(work.id));
    selectAllCheckbox.checked = allVisibleSelected;
  }

  works.forEach((work, index) => {
    const row = document.createElement('tr');
    row.setAttribute('data-work-id', String(work.id));
    const isSelected = exhibitionDetailState.selectedWorkIds.includes(work.id);
    const canModifyWork = canCurrentUserModifyOwnedRow(work);
    const actionButton = !canModifyWork
      ? ''
      : (work.saved
        ? `<button class="action-btn edit-btn" onclick="toggleWorkEdit(${work.id})">수정</button>`
        : `<button class="action-btn approve-btn" onclick="saveWork(${work.id}, this)">저장</button>`);
    const duplicateButton = canModifyWork
      ? `<button class="action-btn approve-btn" onclick="duplicateWorkRow(${work.id})">복사</button>`
      : '';

    const authorText = work.author || '';
    const authorInput = exhibition.type === '개인전'
      ? `<input type="text" data-field="author" value="${authorText}" disabled>`
      : `<input type="text" data-field="author" value="${authorText}" onchange="handleWorkChange(${work.id}, 'author', this.value)">`;
    const { width, height } = parseSizeParts(work.size);

    const workPreviewDataUrl = getPhotoPreviewDataUrl(work);
    const savedPhotoCell = workPreviewDataUrl
      ? `<img src="${workPreviewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `<span class="saved-photo">${work.photoName || '사진 없음'}</span>`;
    const isUnsold = isWorkNotForSale(work.price);
    const savedPriceCell = isUnsold
      ? `<span class="price-not-for-sale">미판매</span>`
      : `${work.price || ''}`;
    const statusCell = soldWorkIdSet.has(work.id)
      ? `<button type="button" class="work-status-badge sold" onclick="jumpToSoldWork(${work.id})">SOLD</button>`
      : '';

    if (work.saved) {
      row.className = 'work-saved-row';
      row.innerHTML = `
        <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
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
          <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
        </td>
      `;
    } else {
      const editPhotoPreview = workPreviewDataUrl
        ? `<img src="${workPreviewDataUrl}" alt="미리보기" class="photo-preview-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
        : `${work.photoName || '사진 없음'}`;

      row.innerHTML = `
        <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
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
            <input type="text" data-field="sizeWidth" value="${width}" class="size-dimension-input" placeholder="가로" oninput="handleWorkSizeChange(${work.id}, 'width', this.value)">
            <span class="size-unit">cm x</span>
            <input type="text" data-field="sizeHeight" value="${height}" class="size-dimension-input" placeholder="세로" oninput="handleWorkSizeChange(${work.id}, 'height', this.value)">
            <span class="size-unit">cm</span>
          </div>
        </td>
        <td><input type="text" data-field="year" value="${work.year || ''}" onchange="handleWorkChange(${work.id}, 'year', this.value)"></td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
        </td>
      `;
    }
    tbody.appendChild(row);
  });

  refreshGridKeyboardNavigation('works-tbody');
  renderSoldStatsTicker('works');
}

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
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const ids = soldWorks.map(item => item.id);
  exhibitionDetailState.selectedSalesIds = source.checked ? ids : [];
  renderSoldWorkRows();
}

function toggleSelectAllSalesFromButton() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const ids = soldWorks.map(item => item.id);
  const allSelected = soldWorks.length > 0 && soldWorks.every(item => exhibitionDetailState.selectedSalesIds.includes(item.id));
  exhibitionDetailState.selectedSalesIds = allSelected ? [] : ids;
  renderSoldWorkRows();
}

function editSelectedSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  if (exhibitionDetailState.selectedSalesIds.length === 0) return;

  const selectedSet = new Set(exhibitionDetailState.selectedSalesIds);
  const editableSoldWorks = soldWorks.filter((item) => selectedSet.has(item.id) && canCurrentUserModifyOwnedRow(item));

  if (editableSoldWorks.length === 0) {
    alert('수정할 수 있는 판매 기록이 없습니다.');
    return;
  }

  editableSoldWorks.forEach((item) => {
    if (item.saved) {
      ensureSalesEditUndoSnapshot(item.id);
    }
    item.saved = false;
  });

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
  }

  exhibitionDetailState.selectedSalesIds = [];
  exhibitionDetailState.lastSalesCheckboxIndex = null;
  saveExhibition();
  renderSoldWorkRows();
}

function deleteAllSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  if (soldWorks.length === 0) return;
  if (!window.confirm('모든 판매 기록을 삭제하시겠습니까?')) return;

  let nextSoldWorks = [];
  if (isArtistScopedUser()) {
    nextSoldWorks = soldWorks.filter((item) => !canCurrentUserModifyOwnedRow(item));
    if (nextSoldWorks.length === soldWorks.length) {
      alert('삭제할 수 있는 판매 기록이 없습니다.');
      return;
    }
  }

  pushSalesUndoSnapshot();
  exhibition.soldWorks = isArtistScopedUser() ? nextSoldWorks : [];
  exhibitionDetailState.selectedSalesIds = exhibitionDetailState.selectedSalesIds.filter((id) => {
    const item = soldWorks.find((sold) => sold.id === id);
    return item && !canCurrentUserModifyOwnedRow(item);
  });
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function deleteSelectedSoldWorks() {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  if (exhibitionDetailState.selectedSalesIds.length === 0) return;
  if (!window.confirm('선택된 판매 기록을 삭제하시겠습니까?')) return;

  const selectedSet = new Set(exhibitionDetailState.selectedSalesIds);
  const deletableIds = soldWorks
    .filter((item) => selectedSet.has(item.id) && canCurrentUserModifyOwnedRow(item))
    .map((item) => item.id);
  if (deletableIds.length === 0) {
    alert('삭제할 수 있는 판매 기록이 없습니다.');
    return;
  }

  pushSalesUndoSnapshot();
  exhibition.soldWorks = soldWorks.filter(item => !deletableIds.includes(item.id));
  exhibitionDetailState.selectedSalesIds = [];
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function undoSalesChanges() {
  const exhibition = getCurrentExhibition();
  if (exhibitionDetailState.salesUndoStack.length === 0) return;

  const previous = exhibitionDetailState.salesUndoStack.pop();
  exhibition.soldWorks = cloneSalesRecords(previous);
  exhibitionDetailState.selectedSalesIds = [];
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
  }
  saveExhibition();
  renderSoldWorkRows();
}

function openImagePreviewBySoldId(soldId, event) {
  const exhibition = getCurrentExhibition();
  const soldWorks = ensureSoldWorksArray();
  const sold = soldWorks.find(item => item.id === soldId);
  const previewDataUrl = getPhotoPreviewDataUrl(sold);
  if (!sold || !previewDataUrl) return;

  // Reuse existing preview popover behavior with sales record payload.
  if (event) event.stopPropagation();
  closeImagePreview();

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
    if (!popover.contains(clickEvent.target)) {
      closeImagePreview();
    }
  };

  setTimeout(() => {
    if (imagePreviewOutsideClickHandler) {
      document.addEventListener('click', imagePreviewOutsideClickHandler);
    }
  }, 0);
}

function renderStaffManagement(container) {
  if (!canManageStaffRoles()) {
    const fallbackTab = getFirstAllowedTab() || 'exhibition-info';
    switchTab(fallbackTab);
    return;
  }

  const exhibition = getCurrentExhibition();
  const planners = exhibition.staff?.planners || [];
  const artists = exhibition.staff?.artists || [];
  const staffs = exhibition.staff?.staffs || [];

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const candidates = users.filter(user => user.approved && normalizeAccountType(getEffectiveGalleryRole(user)) === '기획자/작가');

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
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  exhibitionDetailState.inviteRole = role;
  const exhibition = getCurrentExhibition();
  const users = JSON.parse(localStorage.getItem('users')) || [];

  document.getElementById('invite-modal-title').textContent = `${getInviteRoleLabel(role)} 초대`;
  document.getElementById('invite-modal-description').textContent = '모든 사용자 중에서 전시에 참여자를 선택하세요.';

  const listContainer = document.getElementById('invite-user-list');
  listContainer.innerHTML = '';

  const assignedIds = new Set(exhibition.staff?.[role] || []);

  exhibitionDetailState.inviteSearch = '';
  renderInviteUserList(users, assignedIds);
  document.getElementById('invite-search').value = '';
  document.getElementById('invite-modal').style.display = 'flex';
}

function closeInviteModal() {
  document.getElementById('invite-modal').style.display = 'none';
  exhibitionDetailState.inviteRole = null;
  exhibitionDetailState.inviteSearch = '';
}

function filterInviteUsers() {
  exhibitionDetailState.inviteSearch = document.getElementById('invite-search').value.trim().toLowerCase();
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const exhibition = getCurrentExhibition();
  const assignedIds = new Set(exhibition.staff?.[exhibitionDetailState.inviteRole] || []);
  renderInviteUserList(users, assignedIds);
}

function renderInviteUserList(users, assignedIds) {
  const listContainer = document.getElementById('invite-user-list');
  listContainer.innerHTML = '';
  const search = exhibitionDetailState.inviteSearch;

  if (users.length === 0) {
    listContainer.innerHTML = '<p class="empty-state">등록된 사용자가 없습니다.</p>';
    return;
  }

  let renderedCount = 0;

  users.forEach(user => {
    const label = normalizeAccountType(getEffectiveGalleryRole(user)) || '미지정';
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
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  const role = exhibitionDetailState.inviteRole;
  if (!role) return;

  const checkboxes = Array.from(document.querySelectorAll('#invite-user-list input[type="checkbox"]'));
  const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.value));

  const exhibition = getCurrentExhibition();
  exhibition.staff = exhibition.staff || { planners: [], artists: [], staffs: [] };
  exhibition.staff[role] = Array.from(new Set(selectedIds));
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.staff = exhibition.staff;
  }
  saveExhibition();
  closeInviteModal();
  switchTab('staff');
}

function removeStaffMember(role, userId) {
  if (!canManageStaffRoles()) {
    alert('전시 관계자 관리 권한이 없습니다.');
    return;
  }

  const exhibition = getCurrentExhibition();
  exhibition.staff[role] = (exhibition.staff[role] || []).filter(id => id !== userId);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.staff = exhibition.staff;
  }
  saveExhibition();
  switchTab('staff');
}

function renderWorksManagement(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'works-wrapper';
  const exhibition = getCurrentExhibition();
  const isGoodsMode = exhibitionDetailState.inventoryMode === 'goods';

  const searchBar = document.createElement('div');
  searchBar.className = 'works-search-bar';
  searchBar.innerHTML = `
    <div class="works-search-row">
      <input id="work-search" type="text" class="works-search" placeholder="작품명, 작가, 재료 등 검색" value="${exhibitionDetailState.workSearch}" oninput="handleWorkSearchInput(this.value)">
      <button class="modal-btn modal-approve" onclick="toggleWorkAdvanced()">${exhibitionDetailState.workAdvanced ? '간단 검색' : '고급 검색'}</button>
    </div>
    <div id="advanced-search-panel" class="advanced-search-panel ${exhibitionDetailState.workAdvanced ? 'active' : ''}">
      <div class="advanced-search-grid">
        <label>제목 <input type="text" id="filter-title" value="${exhibitionDetailState.workFilters.title}" onchange="handleAdvancedFilter('title', this.value)"></label>
        <label>작가 <input type="text" id="filter-artist" value="${exhibitionDetailState.workFilters.artist}" onchange="handleAdvancedFilter('artist', this.value)"></label>
        <label>가격 <input type="text" id="filter-price" value="${exhibitionDetailState.workFilters.price}" onchange="handleAdvancedFilter('price', this.value)"></label>
        <label>재료 <input type="text" id="filter-materials" value="${exhibitionDetailState.workFilters.materials}" onchange="handleAdvancedFilter('materials', this.value)"></label>
        <label>크기 <input type="text" id="filter-size" value="${exhibitionDetailState.workFilters.size}" onchange="handleAdvancedFilter('size', this.value)"></label>
        <label>연도 <input type="text" id="filter-year" value="${exhibitionDetailState.workFilters.year}" onchange="handleAdvancedFilter('year', this.value)"></label>
        <label>카테고리 <input type="text" id="filter-category" value="${exhibitionDetailState.workFilters.category}" onchange="handleAdvancedFilter('category', this.value)"></label>
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
  addButton.onclick = () => addWorkRow();
  actionsRow.appendChild(addButton);

  const actionGroup = document.createElement('div');
  actionGroup.className = 'works-action-group';

  const selectAllButton = document.createElement('button');
  selectAllButton.className = 'works-action-btn works-action-btn-secondary';
  selectAllButton.id = 'work-select-all-btn';
  const visibleWorks = getVisibleWorks();
  const allVisibleSelected = visibleWorks.length > 0 && visibleWorks.every(work => exhibitionDetailState.selectedWorkIds.includes(work.id));
  selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
  selectAllButton.onclick = () => toggleSelectAllVisibleWorks();
  actionGroup.appendChild(selectAllButton);

  const deleteAllButton = document.createElement('button');
  deleteAllButton.className = 'works-action-btn works-action-btn-danger';
  deleteAllButton.textContent = '전체 삭제';
  deleteAllButton.onclick = () => deleteAllWorks();
  if (isArtistScopedUser()) {
    deleteAllButton.style.display = 'none';
  }
  actionGroup.appendChild(deleteAllButton);

  const deleteSelectedButton = document.createElement('button');
  deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
  deleteSelectedButton.id = 'work-delete-selected-btn';
  deleteSelectedButton.textContent = '선택된 항목만 삭제';
  deleteSelectedButton.onclick = () => deleteSelectedWorks();
  deleteSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  actionGroup.appendChild(deleteSelectedButton);

  const editSelectedButton = document.createElement('button');
  editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
  editSelectedButton.id = 'work-edit-selected-btn';
  editSelectedButton.textContent = '선택된 항목 수정';
  editSelectedButton.onclick = () => editSelectedWorks();
  editSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  actionGroup.appendChild(editSelectedButton);

  const exportButton = document.createElement('button');
  exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
  exportButton.textContent = '엑셀 파일로 다운 받기';
  exportButton.onclick = () => exportWorksToExcel();

  const saveAllButton = document.createElement('button');
  saveAllButton.className = 'works-action-btn works-action-btn-secondary';
  saveAllButton.textContent = '전체 저장';
  saveAllButton.id = 'save-all-btn';
  saveAllButton.style.display = 'none';
  saveAllButton.onclick = () => saveAllWorks();
  actionGroup.appendChild(saveAllButton);

  const undoButton = document.createElement('button');
  undoButton.className = 'works-action-btn works-action-btn-secondary';
  undoButton.id = 'work-undo-btn';
  undoButton.textContent = '되돌리기';
  undoButton.onclick = () => undoWorkChanges();
  actionGroup.appendChild(undoButton);

  actionsRow.appendChild(actionGroup);
  actionsRow.appendChild(exportButton);
  wrapper.appendChild(actionsRow);

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'works-table-wrapper' + (exhibitionDetailState.workListExpanded ? ' expanded' : ' collapsed');
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
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleWorkSort('manualNumber')">${getSortIndicator('manualNumber')}</button>
            </div>
          </th>
          <th>사진</th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>제품 이름</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'title' ? ' active' : ''}" onclick="toggleWorkSort('title')">${getSortIndicator('title')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>가격</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'price' ? ' active' : ''}" onclick="toggleWorkSort('price')">${getSortIndicator('price')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'quantity' ? ' active' : ''}" onclick="toggleWorkSort('quantity')">${getSortIndicator('quantity')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>판매된 수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'soldQuantity' ? ' active' : ''}" onclick="toggleWorkSort('soldQuantity')">${getSortIndicator('soldQuantity')}</button>
            </div>
          </th>
          <th class="sortable-header">
            <div class="header-with-sort">
              <span>남은 수량</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'remainingQuantity' ? ' active' : ''}" onclick="toggleWorkSort('remainingQuantity')">${getSortIndicator('remainingQuantity')}</button>
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
                ${key !== 'photoName' ? `<button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === key ? ' active' : ''}" onclick="toggleWorkSort('${key}')">${getSortIndicator(key)}</button>` : ''}
              </div>
            </th>
          `).join('')}
          <th class="sortable-header work-status-cell">
            <div class="header-with-sort">
              <span>상태</span>
              <button type="button" class="header-sort-btn${exhibitionDetailState.workSortField === 'status' ? ' active' : ''}" onclick="toggleWorkSort('status')">${getSortIndicator('status')}</button>
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
  bottomAddButton.onclick = () => addWorkRow();
  bottomActionsRow.appendChild(bottomAddButton);

  const bottomActionGroup = document.createElement('div');
  bottomActionGroup.className = 'works-action-group';

  const bottomSelectAllButton = document.createElement('button');
  bottomSelectAllButton.className = 'works-action-btn works-action-btn-secondary';
  bottomSelectAllButton.id = 'work-select-all-btn-bottom';
  bottomSelectAllButton.onclick = () => toggleSelectAllVisibleWorks();
  bottomActionGroup.appendChild(bottomSelectAllButton);

  const bottomDeleteAllButton = document.createElement('button');
  bottomDeleteAllButton.className = 'works-action-btn works-action-btn-danger';
  bottomDeleteAllButton.textContent = '전체 삭제';
  bottomDeleteAllButton.onclick = () => deleteAllWorks();
  if (isArtistScopedUser()) {
    bottomDeleteAllButton.style.display = 'none';
  }
  bottomActionGroup.appendChild(bottomDeleteAllButton);

  const bottomDeleteSelectedButton = document.createElement('button');
  bottomDeleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
  bottomDeleteSelectedButton.id = 'work-delete-selected-btn-bottom';
  bottomDeleteSelectedButton.textContent = '선택된 항목만 삭제';
  bottomDeleteSelectedButton.onclick = () => deleteSelectedWorks();
  bottomDeleteSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  bottomActionGroup.appendChild(bottomDeleteSelectedButton);

  const bottomEditSelectedButton = document.createElement('button');
  bottomEditSelectedButton.className = 'works-action-btn works-action-btn-secondary';
  bottomEditSelectedButton.id = 'work-edit-selected-btn-bottom';
  bottomEditSelectedButton.textContent = '선택된 항목 수정';
  bottomEditSelectedButton.onclick = () => editSelectedWorks();
  bottomEditSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
  bottomActionGroup.appendChild(bottomEditSelectedButton);

  const bottomSaveAllButton = document.createElement('button');
  bottomSaveAllButton.className = 'works-action-btn works-action-btn-secondary';
  bottomSaveAllButton.textContent = '전체 저장';
  bottomSaveAllButton.id = 'save-all-btn-bottom';
  bottomSaveAllButton.style.display = 'none';
  bottomSaveAllButton.onclick = () => saveAllWorks();
  bottomActionGroup.appendChild(bottomSaveAllButton);

  const bottomUndoButton = document.createElement('button');
  bottomUndoButton.className = 'works-action-btn works-action-btn-secondary';
  bottomUndoButton.id = 'work-undo-btn-bottom';
  bottomUndoButton.textContent = '되돌리기';
  bottomUndoButton.onclick = () => undoWorkChanges();
  bottomActionGroup.appendChild(bottomUndoButton);

  const bottomExportButton = document.createElement('button');
  bottomExportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
  bottomExportButton.textContent = '엑셀 파일로 다운 받기';
  bottomExportButton.onclick = () => exportWorksToExcel();

  bottomActionsRow.appendChild(bottomActionGroup);
  bottomActionsRow.appendChild(bottomExportButton);
  wrapper.appendChild(bottomActionsRow);

  container.appendChild(wrapper);
  updateWorksUndoButton();
  renderWorkRows();
}

function updateSaveAllButtonVisibility() {
  ['save-all-btn', 'save-all-btn-bottom'].forEach((buttonId) => {
    const saveAllBtn = document.getElementById(buttonId);
    if (saveAllBtn) {
      saveAllBtn.style.display = exhibitionDetailState.unsavedWorkCount >= 2 ? 'inline-block' : 'none';
    }
  });
}

function renderWorkRows() {
  const tbody = document.getElementById('works-tbody');
  const exhibition = getCurrentExhibition();
  const isGoodsMode = exhibitionDetailState.inventoryMode === 'goods';
  let works = exhibition.works || [];
  tbody.innerHTML = '';

  works = getSortedWorks();
  
  exhibitionDetailState.unsavedWorkCount = works.filter(w => !w.saved).length;
  updateSaveAllButtonVisibility();
  updateWorkSelectionActionButtons(works);

  if (works.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="${isGoodsMode ? 9 : 12}" class="no-users">등록된 ${isGoodsMode ? '굿즈가' : '작품이'} 없습니다.</td>`;
    tbody.appendChild(emptyRow);
    refreshGridKeyboardNavigation('works-tbody');
    return;
  }

  const soldWorkIdSet = new Set(ensureSoldWorksArray().filter(item => normalizeSoldItemType(item) === '작품').map(item => item.workId));

  const selectAllCheckbox = document.getElementById('select-all-works');
  if (selectAllCheckbox) {
    const allVisibleSelected = works.length > 0 && works.every(work => exhibitionDetailState.selectedWorkIds.includes(work.id));
    selectAllCheckbox.checked = allVisibleSelected;
  }

  works.forEach((work, index) => {
    const row = document.createElement('tr');
    row.setAttribute('data-work-id', String(work.id));
    const isSelected = exhibitionDetailState.selectedWorkIds.includes(work.id);
    const canModifyWork = canCurrentUserModifyOwnedRow(work);
    const actionButton = !canModifyWork
      ? ''
      : (work.saved
        ? `<button class="action-btn edit-btn" onclick="toggleWorkEdit(${work.id})">수정</button>`
        : `<button class="action-btn approve-btn" onclick="saveWork(${work.id}, this)">저장</button>`);
    const duplicateButton = canModifyWork
      ? `<button class="action-btn approve-btn" onclick="duplicateWorkRow(${work.id})">복사</button>`
      : '';

    const authorText = work.author || '';
    const authorInput = exhibition.type === '개인전'
      ? `<input type="text" data-field="author" value="${authorText}" disabled>`
      : `<input type="text" data-field="author" value="${authorText}" onchange="handleWorkChange(${work.id}, 'author', this.value)">`;
    const { width, height } = parseSizeParts(work.size);

    const workPreviewDataUrl = getPhotoPreviewDataUrl(work);
    const savedPhotoCell = workPreviewDataUrl
      ? `<img src="${workPreviewDataUrl}" alt="${(work.title || '작품').replace(/"/g, '&quot;')}" class="saved-photo-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
      : `<span class="saved-photo">${work.photoName || '사진 없음'}</span>`;
    const isUnsold = isWorkNotForSale(work.price);
    const savedPriceCell = isUnsold
      ? `<span class="price-not-for-sale">미판매</span>`
      : `${work.price || ''}`;
    const statusCell = soldWorkIdSet.has(work.id)
      ? `<button type="button" class="work-status-badge sold" onclick="jumpToSoldWork(${work.id})">SOLD</button>`
      : '';

    if (isGoodsMode) {
      const soldQty = getGoodsSoldQuantity(work.id);
      const stockQty = parseStockQuantity(work.quantity || 0);
      const remainingQty = Math.max(0, stockQty - soldQty);

      if (work.saved || !canModifyWork) {
        row.className = 'work-saved-row';
        row.innerHTML = `
          <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
          <td>${work.manualNumber || ''}</td>
          <td>${savedPhotoCell}</td>
          <td>${work.title || ''}</td>
          <td>${savedPriceCell}</td>
          <td>${stockQty}</td>
          <td>${soldQty}</td>
          <td>${remainingQty}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            ${canModifyWork ? `<button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>` : ''}
          </td>
        `;
      } else {
        const editPhotoPreview = workPreviewDataUrl
          ? `<img src="${workPreviewDataUrl}" alt="미리보기" class="photo-preview-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
          : `${work.photoName || '사진 없음'}`;

        row.innerHTML = `
          <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
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
          <td><input data-field="quantity" type="number" min="0" value="${stockQty}" onchange="handleWorkChange(${work.id}, 'quantity', this.value)"></td>
          <td>${soldQty}</td>
          <td>${remainingQty}</td>
          <td>
            ${actionButton}
            ${duplicateButton}
            <button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>
          </td>
        `;
      }
      tbody.appendChild(row);
      return;
    }

    if (work.saved || !canModifyWork) {
      row.className = 'work-saved-row';
      row.innerHTML = `
        <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
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
          ${canModifyWork ? `<button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>` : ''}
        </td>
      `;
    } else {
      const editPhotoPreview = workPreviewDataUrl
        ? `<img src="${workPreviewDataUrl}" alt="미리보기" class="photo-preview-image" onclick="openImagePreviewByWorkId(${work.id}, event)">`
        : `${work.photoName || '사진 없음'}`;

      row.innerHTML = `
        <td class="checkbox-col"><input type="checkbox" class="work-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleWorkSelection(${work.id}, this.checked, event, ${index})"></td>
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
            <input type="text" data-field="sizeWidth" value="${width}" class="size-dimension-input" placeholder="가로" oninput="handleWorkSizeChange(${work.id}, 'width', this.value)">
            <span class="size-unit">cm x</span>
            <input type="text" data-field="sizeHeight" value="${height}" class="size-dimension-input" placeholder="세로" oninput="handleWorkSizeChange(${work.id}, 'height', this.value)">
            <span class="size-unit">cm</span>
          </div>
        </td>
        <td><input type="text" data-field="year" value="${work.year || ''}" onchange="handleWorkChange(${work.id}, 'year', this.value)"></td>
        <td class="work-status-cell">${statusCell}</td>
        <td>
          ${actionButton}
          ${duplicateButton}
          ${canModifyWork ? `<button class="action-btn delete-btn" onclick="openDeleteWorkModal(${work.id})">삭제</button>` : ''}
        </td>
      `;
    }
    tbody.appendChild(row);
  });

  refreshGridKeyboardNavigation('works-tbody');
}

function addWorkRow() {
  const exhibition = getCurrentExhibition();
  exhibition.works = exhibition.works || [];
  pushWorkUndoSnapshot();
  const author = exhibition.type === '개인전' ? (exhibition.participants?.[0] || '') : '';
  exhibition.works.push({
    id: Date.now(),
    createdByUserId: getCurrentUserId(),
    manualNumber: '',
    photoName: '',
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
    quantity: exhibitionDetailState.inventoryMode === 'goods' ? '0' : '',
    wasSaved: false,
    saved: false
  });
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  renderWorkRows();
  updateSaveAllButtonVisibility();

  requestAnimationFrame(() => {
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
  const exhibition = getCurrentExhibition();
  exhibition.works = exhibition.works || [];
  const source = exhibition.works.find((w) => w.id === workId);
  if (!source) return;
  if (!canCurrentUserModifyOwnedRow(source)) {
    alert('다른 사용자가 추가한 항목은 복사할 수 없습니다.');
    return;
  }

  pushWorkUndoSnapshot();

  const duplicated = {
    id: Date.now() + Math.floor(Math.random() * 100000),
    createdByUserId: getCurrentUserId(),
    manualNumber: source.manualNumber || '',
    photoName: source.photoName || '',
    photoDataUrl: source.photoDataUrl || '',
    photoPreviewDataUrl: source.photoPreviewDataUrl || getPhotoPreviewDataUrl(source),
    photoMimeType: source.photoMimeType || '',
    photoByteSize: Number(source.photoByteSize) || 0,
    title: source.title || '',
    author: source.author || '',
    price: source.price || '',
    materials: source.materials || '',
    size: source.size || '',
    year: source.year || '',
    category: source.category || '',
    quantity: source.quantity ?? (exhibitionDetailState.inventoryMode === 'goods' ? '0' : ''),
    wasSaved: false,
    saved: false
  };

  exhibition.works.push(duplicated);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  renderWorkRows();
  updateSaveAllButtonVisibility();

  requestAnimationFrame(() => {
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
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) {
    alert('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
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
    alert('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
    return;
  }

  markMissingRequiredFields(row, []);
  
  // Format price with ₩ symbol and commas
  if (work.price) {
    work.price = formatPriceForSave(work.price);
  }
  
  work.saved = true;
  work.wasSaved = true;
  delete work.editOriginalManualNumber;
  delete work.editOriginalTitle;
  exhibitionDetailState.workEditSnapshotIds = exhibitionDetailState.workEditSnapshotIds.filter(id => id !== workId);
  syncWorkToSalesRecords(work);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  renderWorkRows();
}

function saveAllWorks() {
  const exhibition = getCurrentExhibition();
  const works = exhibition.works || [];
  let saveCount = 0;
  const pendingWorks = [];

  for (const work of works) {
    if (work.saved) continue;
    if (!canCurrentUserModifyOwnedRow(work)) continue;
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
    alert('번호는 작품 목록/굿즈 목록 전체에서 중복 없이 저장해야 합니다.');
    return;
  }

  works.forEach(work => {
    if (!work.saved) {
      if (!canCurrentUserModifyOwnedRow(work)) return;
      // Format price with ₩ symbol and commas
      if (work.price) {
        work.price = formatPriceForSave(work.price);
      }
      work.saved = true;
      work.wasSaved = true;
      delete work.editOriginalManualNumber;
      delete work.editOriginalTitle;
      exhibitionDetailState.workEditSnapshotIds = exhibitionDetailState.workEditSnapshotIds.filter(id => id !== work.id);
      syncWorkToSalesRecords(work);
      saveCount++;
    }
  });
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  renderWorkRows();
}

// Propagate saved work field changes to any matching soldWorks snapshot records.
function syncWorkToSalesRecords(work) {
  const exhibition = getCurrentExhibition();
  const soldWorks = exhibition.soldWorks;
  if (!soldWorks || soldWorks.length === 0) return;
  const expectedType = exhibitionDetailState.inventoryMode === 'goods' ? '굿즈' : '작품';
  let changed = false;
  soldWorks.forEach(sold => {
    if (sold.workId !== work.id) return;
    if (normalizeSoldItemType(sold) !== expectedType) return;
    sold.manualNumber = work.manualNumber || sold.manualNumber;
    sold.category = work.category || sold.category;
    sold.title = work.title || sold.title;
    sold.author = work.author || sold.author;
    sold.price = work.price || sold.price;
    sold.photoName = work.photoName || sold.photoName;
    sold.photoDataUrl = work.photoDataUrl || sold.photoDataUrl;
    sold.photoPreviewDataUrl = work.photoPreviewDataUrl || getPhotoPreviewDataUrl(work) || sold.photoPreviewDataUrl;
    changed = true;
  });
  if (changed && exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.soldWorks = soldWorks;
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

  if (manualNumberInput) {
    work.manualNumber = manualNumberInput.value.trim();
  }
  if (categoryInput) {
    work.category = categoryInput.value.trim();
  }
  if (titleInput) {
    work.title = titleInput.value.trim();
  }
  if (authorInput) {
    work.author = authorInput.value.trim();
  }
  if (priceInput) {
    work.price = priceInput.value.trim();
  }
  if (materialsInput) {
    work.materials = materialsInput.value.trim();
  }
  if (yearInput) {
    work.year = yearInput.value.trim();
  }
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
  if (quantityInput) {
    work.quantity = quantityInput.value.trim();
  }
}

function normalizeManualNumber(value) {
  return (value || '').toString().trim().toLowerCase();
}

function normalizeTitle(value) {
  return (value || '').toString().trim().toLowerCase();
}

function shouldValidateManualNumberUniqueness(work) {
  if (!work) return false;
  const current = normalizeManualNumber(work.manualNumber);
  if (!current) return false;
  if (work.wasSaved === undefined) return false;
  if (!work.wasSaved) return true;
  const original = normalizeManualNumber(work.editOriginalManualNumber);
  return current !== original;
}

function shouldValidateTitleUniqueness(work) {
  if (!work) return false;
  const current = normalizeTitle(work.title);
  if (!current) return false;
  if (work.wasSaved === undefined) return false;
  if (!work.wasSaved) return true;
  const original = normalizeTitle(work.editOriginalTitle);
  return current !== original;
}

function getAllInventoryWorks(exhibition) {
  if (!exhibition) return [];
  initializeInventoryData(exhibition);
  const artWorks = Array.isArray(exhibition.artWorks) ? exhibition.artWorks : [];
  const goods = Array.isArray(exhibition.goods) ? exhibition.goods : [];
  return [...artWorks, ...goods];
}

function findSavedManualNumberConflict(work, allWorks) {
  const targetNumber = normalizeManualNumber(work?.manualNumber);
  if (!targetNumber) return null;
  return allWorks.find((candidate) => {
    if (!candidate || candidate.id === work.id) return false;
    if (!candidate.saved) return false;
    return normalizeManualNumber(candidate.manualNumber) === targetNumber;
  }) || null;
}

function findSavedTitleConflict(work, allWorks) {
  const targetTitle = normalizeTitle(work?.title);
  if (!targetTitle) return null;
  return allWorks.find((candidate) => {
    if (!candidate || candidate.id === work.id) return false;
    if (!candidate.saved) return false;
    return normalizeTitle(candidate.title) === targetTitle;
  }) || null;
}

function getBulkManualNumberConflicts(allWorks, pendingWorks) {
  const conflictIds = new Set();
  const pendingIds = new Set(
    pendingWorks
      .filter((work) => shouldValidateManualNumberUniqueness(work))
      .map((work) => work.id)
  );
  const savedByNumber = new Map();

  allWorks.forEach((work) => {
    if (!work || !work.saved || pendingIds.has(work.id)) return;
    const normalized = normalizeManualNumber(work.manualNumber);
    if (!normalized) return;
    if (!savedByNumber.has(normalized)) {
      savedByNumber.set(normalized, work.id);
    }
  });

  const pendingByNumber = new Map();
  pendingWorks.forEach((work) => {
    if (!shouldValidateManualNumberUniqueness(work)) return;
    const normalized = normalizeManualNumber(work.manualNumber);
    if (!normalized) return;

    if (savedByNumber.has(normalized)) {
      conflictIds.add(work.id);
    }

    const ids = pendingByNumber.get(normalized) || [];
    ids.push(work.id);
    pendingByNumber.set(normalized, ids);
  });

  pendingByNumber.forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id) => conflictIds.add(id));
    }
  });

  return conflictIds;
}

function getBulkTitleConflicts(allWorks, pendingWorks) {
  const conflictIds = new Set();
  const pendingIds = new Set(
    pendingWorks
      .filter((work) => shouldValidateTitleUniqueness(work))
      .map((work) => work.id)
  );
  const savedByTitle = new Map();

  allWorks.forEach((work) => {
    if (!work || !work.saved || pendingIds.has(work.id)) return;
    const normalized = normalizeTitle(work.title);
    if (!normalized) return;
    if (!savedByTitle.has(normalized)) {
      savedByTitle.set(normalized, work.id);
    }
  });

  const pendingByTitle = new Map();
  pendingWorks.forEach((work) => {
    if (!shouldValidateTitleUniqueness(work)) return;
    const normalized = normalizeTitle(work.title);
    if (!normalized) return;

    if (savedByTitle.has(normalized)) {
      conflictIds.add(work.id);
    }

    const ids = pendingByTitle.get(normalized) || [];
    ids.push(work.id);
    pendingByTitle.set(normalized, ids);
  });

  pendingByTitle.forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id) => conflictIds.add(id));
    }
  });

  return conflictIds;
}

function getMissingRequiredWorkFields(work) {
  const missing = [];
  if (!(work.manualNumber || '').toString().trim()) {
    missing.push('manualNumber');
  }
  if (!(work.title || '').toString().trim()) {
    missing.push('title');
  }
  if (!(work.price || '').toString().trim()) {
    missing.push('price');
  }
  return missing;
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
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) {
    alert('다른 사용자가 추가한 항목은 수정할 수 없습니다.');
    return;
  }
  if (work.saved) {
    ensureWorkEditUndoSnapshot(workId);
    work.wasSaved = true;
    work.editOriginalManualNumber = work.manualNumber || '';
    work.editOriginalTitle = work.title || '';
  }
  work.saved = false;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
  renderWorkRows();
  scrollRowToViewportCenter(`tr[data-work-id="${workId}"]`);
}

function openDeleteWorkModal(workId) {
  const exhibition = getCurrentExhibition();
  const work = (exhibition.works || []).find((item) => item.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) {
    alert('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
    return;
  }
  exhibitionDetailState.pendingDeleteWorkId = workId;
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteWorkModal() {
  exhibitionDetailState.pendingDeleteWorkId = null;
  document.getElementById('delete-modal').style.display = 'none';
}

function confirmDeleteWork() {
  const workId = exhibitionDetailState.pendingDeleteWorkId;
  if (workId === null) return;
  deleteWork(workId);
  closeDeleteWorkModal();
}

function handleWorkChange(workId, field, value) {
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) return;
  if (field === 'author' && exhibition.type === '개인전') {
    return;
  }
  ensureWorkEditUndoSnapshot(workId);
  work[field] = value;
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
}

const MAX_PHOTO_PREVIEW_DATA_URL_LENGTH = 360000;
const PHOTO_PREVIEW_MAX_DIMENSION = 1280;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
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

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  if (mimeType === 'image/png') {
    return canvas.toDataURL(mimeType);
  }
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
          return {
            dataUrl: pngDataUrl,
            mimeType,
            byteSize: Math.round((pngDataUrl.length * 3) / 4)
          };
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
          return {
            dataUrl: encoded,
            mimeType,
            byteSize: Math.round((encoded.length * 3) / 4)
          };
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
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) return;

  ensureWorkEditUndoSnapshot(workId);

  if (!file) {
    work.photoName = '';
    work.photoDataUrl = '';
    work.photoPreviewDataUrl = '';
    work.photoMimeType = '';
    work.photoByteSize = 0;
    if (exhibitionDetailState.exhibition) {
      exhibitionDetailState.exhibition.works = exhibition.works;
    }
    saveExhibition();
    renderWorkRows();
    return;
  }

  try {
    const compactPhoto = await buildCompactPhotoPreview(file);
    const lightweightPreview = await buildLightweightPhotoPreview(compactPhoto.dataUrl);
    work.photoName = file.name;
    work.photoDataUrl = compactPhoto.dataUrl;
    work.photoPreviewDataUrl = lightweightPreview;
    work.photoMimeType = compactPhoto.mimeType;
    work.photoByteSize = compactPhoto.byteSize;
    if (exhibitionDetailState.exhibition) {
      exhibitionDetailState.exhibition.works = exhibition.works;
    }
    saveExhibition();
    renderWorkRows();
  } catch (error) {
    console.error('Failed to process photo preview:', error);
    renderWorkRows();
  }
}

function parseSizeParts(sizeText) {
  const text = (sizeText || '').toString().trim();
  if (!text) {
    return { width: '', height: '' };
  }

  const normalized = text.replace(/\s+/g, ' ').replace(/×/g, 'x');
  const fullMatch = normalized.match(/([\d.]+)\s*cm?\s*x\s*([\d.]+)\s*cm?/i)
    || normalized.match(/([\d.]+)\s*x\s*([\d.]+)/i);
  if (fullMatch) {
    return { width: fullMatch[1] || '', height: fullMatch[2] || '' };
  }

  const widthOnlyMatch = normalized.match(/^([\d.]+)\s*cm?\s*x?\s*$/i)
    || normalized.match(/^([\d.]+)\s*x\s*$/i);
  if (widthOnlyMatch) {
    return { width: widthOnlyMatch[1] || '', height: '' };
  }

  const heightOnlyMatch = normalized.match(/^x\s*([\d.]+)\s*cm?$/i)
    || normalized.match(/^x\s*([\d.]+)$/i);
  if (heightOnlyMatch) {
    return { width: '', height: heightOnlyMatch[1] || '' };
  }

  return { width: '', height: '' };
}

function handleWorkSizeChange(workId, part, value) {
  const exhibition = getCurrentExhibition();
  const work = exhibition.works.find(w => w.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) return;

  ensureWorkEditUndoSnapshot(workId);

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

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  saveExhibition();
}

let imagePreviewOutsideClickHandler = null;

function openImagePreviewByWorkId(workId, event) {
  const exhibition = getCurrentExhibition();
  const work = (exhibition.works || []).find(w => w.id === workId);
  const previewDataUrl = getPhotoPreviewDataUrl(work);
  if (!work || !previewDataUrl) return;

  if (event) {
    event.stopPropagation();
  }

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
    if (!popover.contains(clickEvent.target)) {
      closeImagePreview();
    }
  };

  setTimeout(() => {
    if (imagePreviewOutsideClickHandler) {
      document.addEventListener('click', imagePreviewOutsideClickHandler);
    }
  }, 0);
}

function closeImagePreview() {
  const popover = document.getElementById('image-preview-popover');
  if (popover) {
    popover.remove();
  }
  if (imagePreviewOutsideClickHandler) {
    document.removeEventListener('click', imagePreviewOutsideClickHandler);
    imagePreviewOutsideClickHandler = null;
  }
}

function deleteWork(workId) {
  const exhibition = getCurrentExhibition();
  const work = (exhibition.works || []).find((item) => item.id === workId);
  if (!work) return;
  if (!canCurrentUserModifyOwnedRow(work)) {
    alert('다른 사용자가 추가한 항목은 삭제할 수 없습니다.');
    return;
  }
  pushWorkUndoSnapshot();
  exhibition.works = exhibition.works.filter(w => w.id !== workId);
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => id !== workId);
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  saveExhibition();
  renderWorkRows();
}

function toggleSelectAllWorks(source) {
  const visibleWorks = getVisibleWorks();
  const visibleIds = visibleWorks.map(work => work.id);
  if (source.checked) {
    exhibitionDetailState.selectedWorkIds = Array.from(new Set([...exhibitionDetailState.selectedWorkIds, ...visibleIds]));
  } else {
    exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => !visibleIds.includes(id));
  }
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  switchTab(getCurrentInventoryListTabName());
}

function updateWorkSelectionActionButtons(visibleWorks) {
  const scopedWorks = Array.isArray(visibleWorks) ? visibleWorks : getVisibleWorks();
  const allVisibleSelected = scopedWorks.length > 0 && scopedWorks.every((work) => exhibitionDetailState.selectedWorkIds.includes(work.id));

  ['work-select-all-btn', 'work-select-all-btn-bottom'].forEach((buttonId) => {
    const selectAllButton = document.getElementById(buttonId);
    if (selectAllButton) {
      selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
    }
  });

  ['work-delete-selected-btn', 'work-delete-selected-btn-bottom'].forEach((buttonId) => {
    const deleteSelectedButton = document.getElementById(buttonId);
    if (deleteSelectedButton) {
      deleteSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
    }
  });

  ['work-edit-selected-btn', 'work-edit-selected-btn-bottom'].forEach((buttonId) => {
    const editSelectedButton = document.getElementById(buttonId);
    if (editSelectedButton) {
      editSelectedButton.style.display = exhibitionDetailState.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
    }
  });

  const selectAllCheckbox = document.getElementById('select-all-works');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allVisibleSelected;
    selectAllCheckbox.indeterminate = !allVisibleSelected && exhibitionDetailState.selectedWorkIds.length > 0;
  }

  refreshGridKeyboardNavigation('works-tbody');
}

function toggleWorkSelection(workId, isChecked, event, rowIndex) {
  const visibleWorks = getVisibleWorks();
  const currentIndex = typeof rowIndex === 'number'
    ? rowIndex
    : visibleWorks.findIndex(work => work.id === workId);
  const isShiftRange = Boolean(event && event.shiftKey && exhibitionDetailState.lastWorkCheckboxIndex !== null && currentIndex !== -1);

  if (isShiftRange) {
    const start = Math.min(exhibitionDetailState.lastWorkCheckboxIndex, currentIndex);
    const end = Math.max(exhibitionDetailState.lastWorkCheckboxIndex, currentIndex);
    const rangeIds = visibleWorks.slice(start, end + 1).map(work => work.id);

    if (isChecked) {
      exhibitionDetailState.selectedWorkIds = Array.from(new Set([...exhibitionDetailState.selectedWorkIds, ...rangeIds]));
    } else {
      exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => !rangeIds.includes(id));
    }
  } else if (isChecked) {
    exhibitionDetailState.selectedWorkIds = Array.from(new Set([...exhibitionDetailState.selectedWorkIds, workId]));
  } else {
    exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => id !== workId);
  }

  if (currentIndex !== -1) {
    exhibitionDetailState.lastWorkCheckboxIndex = currentIndex;
  }

  switchTab(getCurrentInventoryListTabName());
}

function toggleSelectAllVisibleWorks() {
  const visibleWorks = getVisibleWorks();
  const visibleIds = visibleWorks.map(work => work.id);
  const allSelected = visibleWorks.length > 0 && visibleIds.every(id => exhibitionDetailState.selectedWorkIds.includes(id));
  if (allSelected) {
    exhibitionDetailState.selectedWorkIds = exhibitionDetailState.selectedWorkIds.filter(id => !visibleIds.includes(id));
  } else {
    exhibitionDetailState.selectedWorkIds = Array.from(new Set([...exhibitionDetailState.selectedWorkIds, ...visibleIds]));
  }
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  switchTab(getCurrentInventoryListTabName());
}

function deleteAllWorks() {
  if (!window.confirm('모든 작품을 삭제하시겠습니까?')) return;
  const exhibition = getCurrentExhibition();

  let nextWorks = [];
  if (isArtistScopedUser()) {
    nextWorks = (exhibition.works || []).filter((work) => !canCurrentUserModifyOwnedRow(work));
    if (nextWorks.length === (exhibition.works || []).length) {
      alert('삭제할 수 있는 항목이 없습니다.');
      return;
    }
  }

  pushWorkUndoSnapshot();
  exhibition.works = isArtistScopedUser() ? nextWorks : [];
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  exhibitionDetailState.selectedWorkIds = [];
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  exhibitionDetailState.allowLargeInventoryDropOnce = true;
  saveExhibition();
  switchTab(getCurrentInventoryListTabName());
}

function deleteSelectedWorks() {
  if (exhibitionDetailState.selectedWorkIds.length === 0) return;
  if (!window.confirm('선택된 작품을 삭제하시겠습니까?')) return;
  const exhibition = getCurrentExhibition();
  const selectedSet = new Set(exhibitionDetailState.selectedWorkIds);
  const deletableIds = (exhibition.works || [])
    .filter((work) => selectedSet.has(work.id) && canCurrentUserModifyOwnedRow(work))
    .map((work) => work.id);
  if (deletableIds.length === 0) {
    alert('삭제할 수 있는 항목이 없습니다.');
    return;
  }
  pushWorkUndoSnapshot();
  exhibition.works = (exhibition.works || []).filter(work => !deletableIds.includes(work.id));
  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }
  exhibitionDetailState.selectedWorkIds = [];
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  exhibitionDetailState.allowLargeInventoryDropOnce = true;
  saveExhibition();
  switchTab(getCurrentInventoryListTabName());
}

function editSelectedWorks() {
  if (exhibitionDetailState.selectedWorkIds.length === 0) return;

  const exhibition = getCurrentExhibition();
  const selectedSet = new Set(exhibitionDetailState.selectedWorkIds);
  const editableWorks = (exhibition.works || []).filter((work) => selectedSet.has(work.id) && canCurrentUserModifyOwnedRow(work));

  if (editableWorks.length === 0) {
    alert('수정할 수 있는 항목이 없습니다.');
    return;
  }

  editableWorks.forEach((work) => {
    if (work.saved) {
      ensureWorkEditUndoSnapshot(work.id);
      work.wasSaved = true;
      work.editOriginalManualNumber = work.manualNumber || '';
      work.editOriginalTitle = work.title || '';
    }
    work.saved = false;
  });

  if (exhibitionDetailState.exhibition) {
    exhibitionDetailState.exhibition.works = exhibition.works;
  }

  exhibitionDetailState.selectedWorkIds = [];
  exhibitionDetailState.lastWorkCheckboxIndex = null;
  saveExhibition();
  switchTab(getCurrentInventoryListTabName());
}

function parseSoldPriceAmount(value) {
  if (isWorkNotForSale(value)) return 0;
  const numericText = (value || '').toString().replace(/[^\d.-]/g, '');
  const amount = Number(numericText);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function formatWonAmount(amount) {
  return `₩${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}`;
}

function getSoldStatsForWorksTicker() {
  const soldWorks = ensureSoldWorksArray();
  const selectedIds = exhibitionDetailState.selectedWorkIds;
  const selectedSet = new Set(selectedIds);
  const scopedSales = selectedIds.length > 0
    ? soldWorks.filter(item => selectedSet.has(item.workId))
    : soldWorks;

  return {
    basisLabel: selectedIds.length > 0
      ? `선택된 작품 ${selectedIds.length}개 기준 판매 통계`
      : '전체 작품 기준 판매 통계',
    soldCount: scopedSales.length,
    totalAmount: scopedSales.reduce((sum, item) => sum + parseSoldPriceAmount(item.price), 0)
  };
}

function getSoldStatsForSalesTicker() {
  const soldWorks = ensureSoldWorksArray();
  const selectedIds = exhibitionDetailState.selectedSalesIds;
  const selectedSet = new Set(selectedIds);
  const scopedSales = selectedIds.length > 0
    ? soldWorks.filter(item => selectedSet.has(item.id))
    : soldWorks;

  return {
    basisLabel: selectedIds.length > 0
      ? `선택된 판매 ${selectedIds.length}개 기준 판매 통계`
      : '전체 판매 기준 판매 통계',
    soldCount: scopedSales.length,
    totalAmount: scopedSales.reduce((sum, item) => sum + parseSoldPriceAmount(item.price), 0)
  };
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
  let works = filterWorks(exhibition.works || []);
  if (!exhibitionDetailState.workSortField) return works;

  const direction = exhibitionDetailState.workSortDirection === 'desc' ? -1 : 1;
  return [...works].sort((a, b) => {
    const valueA = getWorkSortValue(a, exhibitionDetailState.workSortField);
    const valueB = getWorkSortValue(b, exhibitionDetailState.workSortField);
    return compareWorkValues(valueA, valueB, exhibitionDetailState.workSortField) * direction;
  });
}

function getWorkSortValue(work, field) {
  const soldWorkIdSet = new Set(
    ensureSoldWorksArray()
      .filter((item) => normalizeSoldItemType(item) === '작품')
      .map(item => item.workId)
  );
  switch (field) {
    case 'manualNumber':
      return work.manualNumber || '';
    case 'photoName':
      return work.photoName || '';
    case 'title':
      return work.title || '';
    case 'author':
      return work.author || '';
    case 'price':
      return work.price || '';
    case 'materials':
      return work.materials || '';
    case 'size':
      return work.size || '';
    case 'year':
      return work.year || '';
    case 'category':
      return work.category || '';
    case 'quantity':
      return String(parseStockQuantity(work.quantity || 0));
    case 'soldQuantity':
      return String(getGoodsSoldQuantity(work.id));
    case 'remainingQuantity': {
      const stockQty = parseStockQuantity(work.quantity || 0);
      const soldQty = getGoodsSoldQuantity(work.id);
      return String(Math.max(0, stockQty - soldQty));
    }
    case 'status':
      return soldWorkIdSet.has(work.id) ? 'sold' : '';
    default:
      return '';
  }
}

function getSortedSoldWorks() {
  const soldWorks = filterSoldWorks(ensureSoldWorksArray());
  if (!exhibitionDetailState.salesSortField) return soldWorks;

  const direction = exhibitionDetailState.salesSortDirection === 'desc' ? -1 : 1;
  return [...soldWorks].sort((a, b) => {
    const valueA = getSoldSortValue(a, exhibitionDetailState.salesSortField);
    const valueB = getSoldSortValue(b, exhibitionDetailState.salesSortField);
    return compareWorkValues(valueA, valueB, exhibitionDetailState.salesSortField) * direction;
  });
}

function exportSalesToExcel() {
  const soldWorks = getSortedSoldWorks();

  const headers = ['번호', '사진', '제목', '작가', '가격', '판매일시', '구매자 성함', '구매자 연락처', '결제방법', '비고'];

  const escapeHtml = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const headerRow = headers.map(h => `<th style="background:#f0f0f0;font-weight:bold;border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(h)}</th>`).join('');

  const dataRows = soldWorks.map(sold => {
    const paymentDisplay = sold.paymentMethod === '기타'
      ? `기타${sold.paymentMethodEtc ? ` (${sold.paymentMethodEtc})` : ''}`
      : (sold.paymentMethod || '');

    const soldPreviewDataUrl = getPhotoPreviewDataUrl(sold);
    const photoCell = soldPreviewDataUrl
      ? `<td style="border:1px solid #ccc;padding:4px;text-align:center"><img src="${soldPreviewDataUrl}" width="80" height="80" style="object-fit:contain"></td>`
      : `<td style="border:1px solid #ccc;padding:6px 10px">${escapeHtml(sold.photoName || '')}</td>`;

    const cells = [
      sold.manualNumber || '',
      null, // photo handled separately
      sold.title || '',
      sold.author || '',
      sold.price || '',
      sold.soldAtKst || '',
      sold.buyerName || '',
      sold.buyerPhone || '',
      paymentDisplay,
      sold.note || ''
    ];

    const tdCells = cells.map((v, i) => {
      if (i === 1) return photoCell;
      return `<td style="border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(v)}</td>`;
    }).join('');

    return `<tr>${tdCells}</tr>`;
  }).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>table{border-collapse:collapse}td,th{font-family:Arial,sans-serif;font-size:12px}</style>
</head><body>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(exhibitionDetailState.exhibition?.title || 'exhibition').replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}-sales.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getSoldSortValue(sold, field) {
  switch (field) {
    case 'manualNumber':
      return sold.manualNumber || '';
    case 'itemType':
      return normalizeSoldItemType(sold);
    case 'category':
      return sold.category || '';
    case 'title':
      return sold.title || '';
    case 'author':
      return sold.author || '';
    case 'price': {
      const amount = parseSoldPriceAmount(sold.price);
      return amount > 0 ? String(amount) : '';
    }
    case 'soldAtKst':
      return sold.soldAtKst || '';
    case 'buyerName':
      return sold.buyerName || '';
    case 'buyerPhone':
      return sold.buyerPhone || '';
    case 'paymentMethod':
      return sold.paymentMethod || '';
    default:
      return '';
  }
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
  const expenseItems = getExhibitionExpenseItems();
  const revenueItems = getExhibitionRevenueItems();
  const revenueTotals = {
    art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
    goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
  };

  const expenseRows = expenseItems.map((item) => ({
    division: item.division || '',
    amount: formatAccountingAmount(getExpenseEffectiveAmount(item, revenueTotals))
  }));

  const revenueRows = revenueItems.map((item) => ({
    division: item.division || '',
    amount: formatAccountingAmount(item.amount)
  }));

  const expenseTotal = expenseItems.reduce((sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals), 0);
  const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAccountingAmount(item.amount), 0);
  const profitTotal = revenueTotal - expenseTotal;

  const escapeHtml = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const buildRows = (rows) => rows.map((row) => `
    <tr>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.division)}</td>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.amount)}</td>
    </tr>
  `).join('');

  const html = `
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
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAccountingAmount(expenseTotal))}</td>
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
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAccountingAmount(revenueTotal))}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">총이익</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">${escapeHtml(formatAccountingAmount(profitTotal))}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(exhibition.title || 'exhibition').replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}-accounting.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportWorksToExcel() {
  const works = getSortedWorks();
  const rows = [
    ['번호', '사진', '제목', '작가', '가격', '재료', '크기', '연도', '분류']
  ];

  works.forEach(work => {
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

  const escapeXml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const sheetRows = rows.map(row => {
    const cells = row.map(value => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      <Worksheet ss:Name="Sheet1">
        <Table>${sheetRows}</Table>
      </Worksheet>
    </Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(exhibitionDetailState.exhibition?.title || 'exhibition').replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}-works.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  if (exhibitionDetailState.salesAdvanced) {
    const filters = exhibitionDetailState.salesFilters;
    return soldWorks.filter((sold) => {
      const soldDate = (sold.soldAtKst || '').slice(0, 10);
      const from = (filters.soldDateFrom || '').trim();
      const to = (filters.soldDateTo || '').trim();
      if (from && (!soldDate || soldDate < from)) return false;
      if (to && (!soldDate || soldDate > to)) return false;

      const textFields = ['manualNumber', 'title', 'author', 'buyerName', 'buyerPhone', 'paymentMethod'];
      return textFields.every((key) => {
        const value = (filters[key] || '').trim().toLowerCase();
        if (!value) return true;
        const field = (sold[key] || '').toString().toLowerCase();
        return field.includes(value);
      });
    });
  }

  const search = (exhibitionDetailState.salesSearch || '').trim().toLowerCase();
  if (!search) return soldWorks;

  return soldWorks.filter((sold) => {
    const paymentDisplay = sold.paymentMethod === '기타'
      ? `기타 ${sold.paymentMethodEtc || ''}`
      : (sold.paymentMethod || '');
    const text = `${sold.manualNumber || ''} ${normalizeSoldItemType(sold)} ${sold.title || ''} ${sold.author || ''} ${sold.price || ''} ${sold.soldQuantity || ''} ${sold.soldAtKst || ''} ${sold.buyerName || ''} ${sold.buyerPhone || ''} ${paymentDisplay} ${sold.note || ''}`.toLowerCase();
    return text.includes(search);
  });
}

function filterWorks(works) {
  if (exhibitionDetailState.workAdvanced) {
    return works.filter(work => {
      const filters = exhibitionDetailState.workFilters;
      return Object.keys(filters).every(key => {
        const value = filters[key].trim().toLowerCase();
        if (!value) return true;
        const field = (work[key] || '').toString().toLowerCase();
        return field.includes(value);
      });
    });
  }

  const search = exhibitionDetailState.workSearch.trim().toLowerCase();
  if (!search) return works;

  return works.filter(work => {
    const text = `${work.manualNumber || ''} ${work.title || ''} ${work.author || ''} ${work.price || ''} ${work.materials || ''} ${work.size || ''} ${work.year || ''} ${work.category || ''}`.toLowerCase();
    return text.includes(search);
  });
}

function saveExhibition() {
  const exhibitions = JSON.parse(localStorage.getItem('exhibitions')) || [];
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

  const payload = JSON.stringify(exhibitions);
  if (typeof safeSetLocalStorageItem === 'function') {
    const saved = safeSetLocalStorageItem('exhibitions', payload);
    if (!saved) {
      console.error('Failed to save exhibition data: storage write failed.');
      notifyExhibitionSaveFailure();
    } else {
      persistInventoryBackup(storageCopy);
    }
    return saved;
  }

  try {
    localStorage.setItem('exhibitions', payload);
    persistInventoryBackup(storageCopy);
    return true;
  } catch (error) {
    console.error('Failed to save exhibition data:', error);
    notifyExhibitionSaveFailure();
    return false;
  }
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
  exhibitionDetailState.gridNavAnchor = meta;
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
  return findGridCellByAnchor(exhibitionDetailState.gridNavAnchor);
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
  exhibitionDetailState.pendingGridFocus = {
    tbodyId,
    rowId: String(rowId),
    colIndex: Number(colIndex) || 0
  };
}

function applyPendingGridFocusForTbody(tbodyId) {
  const pending = exhibitionDetailState.pendingGridFocus;
  if (!pending || pending.tbodyId !== tbodyId) return;
  const targetCell = findGridCellByAnchor(pending);
  if (!targetCell) return;
  exhibitionDetailState.pendingGridFocus = null;
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
    startCellEditFromEnter(cell);
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

window.addEventListener('DOMContentLoaded', initDetailPage);
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
