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

const worksEditorController = globalThis.ExhibitionDetailWorksEditorController.create({
  state: exhibitionDetailState,
  document,
  window,
  fetchImpl: (...args) => fetch(...args),
  FileReaderImpl: FileReader,
  ImageImpl: Image,
  createCanvas: () => document.createElement('canvas'),
  inventoryModel: globalThis.ExhibitionInventoryModel,
  imageLifecycle: globalThis.ExhibitionImageLifecycle,
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

const worksView = globalThis.ExhibitionDetailWorksView.create({
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
  inventoryRenderer: globalThis.ExhibitionInventoryRenderer,
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

const salesViewController = globalThis.ExhibitionDetailSalesViewController.create({
  state: exhibitionDetailState,
  document,
  openSalesAddModal,
  toggleSelectAllSalesFromButton,
  saveAllSoldWorks,
  deleteAllSoldWorks,
  deleteSelectedSoldWorks,
  editSelectedSoldWorks,
  undoSalesChanges,
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
  renderSoldStatsTicker,
  updateSalesActionButtons
});

const accountingViewController = globalThis.ExhibitionDetailAccountingViewController.create({
  state: exhibitionDetailState,
  ExhibitionAccountingProjection: globalThis.ExhibitionAccountingProjection,
  canManageAccountingData,
  getFirstAllowedTab,
  switchTab,
  getCurrentExhibition,
  getExhibitionExpenseItems,
  getExhibitionRevenueItems,
  getExpenseEffectiveAmount,
  escapeAccountingHtml,
  formatAccountingAmount,
  updateAccountingActionButtons
});

const backupController = globalThis.ExhibitionDetailBackupController.create({
  state: exhibitionDetailState,
  document,
  fetchImpl: (...args) => fetch(...args),
  snapshotClient: globalThis.ExhibitionSnapshotClient,
  exhibitionsRepository: globalThis.ExhibitionsRepository.repository,
  getCurrentExhibition,
  getCurrentUser,
  getExhibitionAccessRole,
  getFirstAllowedTab,
  switchTab,
  escapeHtml: escapeAccountingHtml,
  alertImpl: (...args) => alert(...args),
  confirmImpl: (...args) => confirm(...args)
});

const infoController = globalThis.ExhibitionDetailInfoController.create({
  state: exhibitionDetailState,
  document,
  loadUsers: () => globalThis.ExhibitionDetailRepository.repository.loadUsers(),
  getCurrentExhibition: () => getCurrentExhibition(),
  escapeHtml: (value) => escapeAccountingHtml(value),
  saveExhibition: () => saveExhibition(),
  switchTab: (tabName) => switchTab(tabName)
});

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
  globalThis.ExhibitionDetailTabsController.applyTabVisibilityByPermission({
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
  return globalThis.ExhibitionInventoryBackupModel.cloneJson(value, fallback);
}

function stripLargePayloadFields(value) {
  return globalThis.ExhibitionInventoryBackupModel.stripLargePayloadFields(value);
}

function getInventoryBackupStorageKey(exhibitionId) {
  return globalThis.ExhibitionInventoryBackupModel.getInventoryBackupStorageKey(exhibitionId);
}

function getInventoryListCounts(exhibition) {
  return globalThis.ExhibitionInventoryBackupModel.getInventoryListCounts(exhibition);
}

function normalizeInventoryBackupSnapshot(exhibition) {
  return globalThis.ExhibitionInventoryBackupModel.normalizeInventoryBackupSnapshot(exhibition);
}

function loadInventoryBackup(exhibitionId) {
  const key = getInventoryBackupStorageKey(exhibitionId);
  if (!key) return null;
  return globalThis.ExhibitionDetailRepository.repository.loadInventoryBackup(key);
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
  return globalThis.ExhibitionDetailRepository.repository.saveInventoryBackupSafely(key, backup);
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

  const restoredSaved = globalThis.ExhibitionsRepository.repository.saveExhibitionsSafely(exhibitions);

  if (!restoredSaved) return false;

  console.warn('Recovered exhibition inventory from local backup due to likely data loss.');
  return true;
}

function isLargeUnexpectedInventoryDrop(previousExhibition, nextExhibition) {
  return globalThis.ExhibitionInventoryBackupModel.isLargeUnexpectedInventoryDrop(
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
  const value = globalThis.ExhibitionDetailRepository.repository.loadPreference(key);
  return value ? normalizeTabForAccess(value) : '';
}

function saveLastViewedExhibitionTab(tabName) {
  const key = getExhibitionLastTabStorageKey();
  if (!key) return;
  const normalized = normalizeTabForAccess(tabName);
  if (!normalized) return;
  globalThis.ExhibitionDetailRepository.repository.savePreference(key, normalized);
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

  const exhibitions = globalThis.ExhibitionsRepository.repository.loadExhibitions();
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
  return globalThis.ExhibitionDetailTabsController.switchTab(tabName, {
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

const filesController = globalThis.ExhibitionDetailFilesController.create({
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
  return globalThis.ExhibitionAccountingProjection.parseAmount(value);
}

function formatAccountingAmount(value) {
  return globalThis.ExhibitionAccountingProjection.formatAmount(value);
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
  return globalThis.ExhibitionAccountingProjection.buildRevenueItems({
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
  return globalThis.ExhibitionAccountingProjection.getExpenseEffectiveAmount(item, revenueTotals);
}

function buildAccountingTableRows(items, options = {}) {
  return accountingViewController.buildAccountingTableRows(items, options);
}

function renderExhibitionAccounting(container) {
  return accountingViewController.renderExhibitionAccounting(container);
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
  return globalThis.ExhibitionSalesModel.normalizeSoldItemType(sold);
}

function parseSoldQuantity(value) {
  return globalThis.ExhibitionSalesModel.parseSoldQuantity(value);
}

function parseStockQuantity(value) {
  return globalThis.ExhibitionSalesModel.parseStockQuantity(value);
}

function getGoodsSoldQuantity(goodsId) {
  return globalThis.ExhibitionSalesModel.getGoodsSoldQuantity(getSalesMasterRecords(), goodsId);
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
  return globalThis.ExhibitionSalesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatCurrencyKrw(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

function getArtistSalesSummary() {
  return globalThis.ExhibitionSalesModel.getArtistSalesSummary(ensureSoldWorksArray(), isWorkNotForSale);
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
  return salesViewController.renderSoldWorkRows();
}

function getSoldQuantityForItemType(itemType, value) {
  return globalThis.ExhibitionSalesModel.getSoldQuantityForItemType(itemType, value);
}

function getSalesSearchResults(query) {
  const exhibition = getCurrentExhibition();
  return globalThis.ExhibitionSalesModel.getSalesSearchResults({
    artWorks: exhibition.artWorks,
    works: exhibition.works,
    goods: exhibition.goods,
    query
  });
}

const salesAddController = globalThis.ExhibitionDetailSalesAddController.create({
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
  formatCurrencyKrw
});

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
      photoUrl: item.photoUrl || '',
      photoPreviewUrl: item.photoPreviewUrl || '',
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

function getPhotoPreviewDataUrl(item) {
  return globalThis.ExhibitionImageLifecycle.getPhotoPreviewSource(item);
}

function getPhotoDataUrl(item) {
  return globalThis.ExhibitionImageLifecycle.getPhotoSource(item);
}

const certificateController = globalThis.ExhibitionDetailCertificateController.create({
  ExhibitionCertificateModel: globalThis.ExhibitionCertificateModel,
  ExhibitionImageLifecycle: globalThis.ExhibitionImageLifecycle,
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
  getSourceArtworkForSold: (sold) => globalThis.ExhibitionCertificateModel.getSourceArtwork(getCurrentExhibition(), sold),
  saveExhibition,
  renderSalesManagement: renderSoldWorkRows,
  setStateSoldWorks(soldWorks) {
    if (exhibitionDetailState.exhibition) exhibitionDetailState.exhibition.soldWorks = soldWorks;
  },
  alert,
  console
});

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
    sold.photoUrl = match.photoUrl || '';
    sold.photoPreviewUrl = match.photoPreviewUrl || match.photoUrl || '';
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
    sold.photoUrl = '';
    sold.photoPreviewUrl = '';
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

function ensureSalesEditUndoSnapshot(soldId) {
  if (exhibitionDetailState.salesEditSnapshotIds.includes(soldId)) return;
  pushSalesUndoSnapshot();
  exhibitionDetailState.salesEditSnapshotIds.push(soldId);
}

function getInviteRoleLabel(role) {
  if (role === 'planners') return '기획자';
  if (role === 'artists') return '작가';
  if (role === 'staffs') return '스탭';
  return '관계자';
}

function renderLegacyWorksManagement(container) {
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

  const users = globalThis.ExhibitionDetailRepository.repository.loadUsers();
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
  const users = globalThis.ExhibitionDetailRepository.repository.loadUsers();

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
  const users = globalThis.ExhibitionDetailRepository.repository.loadUsers();
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

const TRANSIENT_WORK_PHOTO_FIELDS = worksEditorController.TRANSIENT_WORK_PHOTO_FIELDS;

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
  return globalThis.ExhibitionSalesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatWonAmount(amount) {
  return `₩${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}`;
}

function getSoldStatsForWorksTicker() {
  return globalThis.ExhibitionSalesModel.getSoldStats({
    records: ensureSoldWorksArray(),
    selectedIds: exhibitionDetailState.selectedWorkIds,
    idField: 'workId',
    selectedLabel: '선택된 작품',
    allLabel: '전체 작품 기준 판매 통계',
    isNotForSale: isWorkNotForSale
  });
}

function getSoldStatsForSalesTicker() {
  return globalThis.ExhibitionSalesModel.getSoldStats({
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
  return globalThis.ExhibitionInventoryModel.getSortedWorks({
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
  return globalThis.ExhibitionInventoryModel.getWorkSortValue(work, field, {
    parseStockQuantity,
    getGoodsSoldQuantity,
    soldWorkIdSet
  });
}

function getSortedSoldWorks() {
  return globalThis.ExhibitionSalesModel.getSortedSoldWorks({
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
  const exportData = globalThis.ExhibitionExportModel.buildSalesExport({
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
  return globalThis.ExhibitionSalesModel.getSoldSortValue(sold, field, isWorkNotForSale);
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
  const exportData = globalThis.ExhibitionExportModel.buildAccountingExport({
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
  const exportData = globalThis.ExhibitionExportModel.buildWorksExport({
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
  return globalThis.ExhibitionSalesModel.filterSoldWorks(soldWorks, {
    advanced: exhibitionDetailState.salesAdvanced,
    filters: exhibitionDetailState.salesFilters,
    search: exhibitionDetailState.salesSearch
  });
}

function filterWorks(works) {
  return globalThis.ExhibitionInventoryModel.filterWorks(works, {
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
  const exhibitions = globalThis.ExhibitionsRepository.repository.loadExhibitions();
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

  const saved = globalThis.ExhibitionsRepository.repository.saveExhibitionsSafely(exhibitions);
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

const gridNavigationController = globalThis.ExhibitionDetailGridNavigation.create({
  state: exhibitionDetailState,
  document,
  startCellEditFromEnter
});

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
