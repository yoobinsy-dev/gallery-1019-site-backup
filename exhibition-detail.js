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

let certificateController = null;
let inventoryStateController = null;
let worksEditorController = null;
let worksView = null;
let collectionPickerController = null;
let salesViewController = null;
let accountingViewController = null;
let backupController = null;
let infoController = null;
let staffController = null;
let filesController = null;
let salesAddController = null;
let gridNavigationController = null;
let exhibitionDetailDependencies = null;
let certificateLibrariesPromise = null;

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load certificate dependency: ${source}`));
    document.head.appendChild(script);
  });
}

function ensureCertificateLibraries() {
  if (globalThis.XlsxPopulate && globalThis.JSZip) return Promise.resolve();
  if (!certificateLibrariesPromise) {
    certificateLibrariesPromise = Promise.all([
      globalThis.XlsxPopulate
        ? Promise.resolve()
        : loadClassicScript('/vendor/xlsx-populate-1.21.0/xlsx-populate.min.js'),
      globalThis.JSZip
        ? Promise.resolve()
        : loadClassicScript('/vendor/jszip-3.10.1/jszip.min.js')
    ]).then(() => {
      if (!globalThis.XlsxPopulate || !globalThis.JSZip) {
        throw new Error('Certificate dependencies did not initialize.');
      }
    });
  }
  return certificateLibrariesPromise;
}

function resolveExhibitionDetailDependencies() {
  const dependencies = {
    accountingProjection: globalThis.ExhibitionAccountingProjection,
    backupControllerModule: globalThis.ExhibitionDetailBackupController,
    certificateControllerModule: globalThis.ExhibitionDetailCertificateController,
    certificateModel: globalThis.ExhibitionCertificateModel,
    detailRepository: globalThis.ExhibitionDetailRepository?.repository,
    exportModel: globalThis.ExhibitionExportModel,
    filesControllerModule: globalThis.ExhibitionDetailFilesController,
    gridNavigationModule: globalThis.ExhibitionDetailGridNavigation,
    imageLifecycle: globalThis.ExhibitionImageLifecycle,
    infoControllerModule: globalThis.ExhibitionDetailInfoController,
    inventoryBackupModel: globalThis.ExhibitionInventoryBackupModel,
    inventoryModel: globalThis.ExhibitionInventoryModel,
    inventoryRenderer: globalThis.ExhibitionInventoryRenderer,
    inventoryStateControllerModule: globalThis.ExhibitionDetailInventoryStateController,
    artworkIdentity: globalThis.ArtworkIdentity,
    artworkRepository: globalThis.GalleryArtworksRepository?.repository,
    artworkSyncService: globalThis.ArtworkSyncService,
    workPickerControllerModule: globalThis.ArtworkWorkPickerController,
    repository: globalThis.ExhibitionsRepository?.repository,
    salesAddControllerModule: globalThis.ExhibitionDetailSalesAddController,
    salesModel: globalThis.ExhibitionSalesModel,
    salesViewControllerModule: globalThis.ExhibitionDetailSalesViewController,
    snapshotClient: globalThis.ExhibitionSnapshotClient,
    staffControllerModule: globalThis.ExhibitionDetailStaffController,
    tabsController: globalThis.ExhibitionDetailTabsController,
    worksEditorControllerModule: globalThis.ExhibitionDetailWorksEditorController,
    collectionPickerControllerModule: globalThis.ExhibitionDetailCollectionPickerController,
    worksViewModule: globalThis.ExhibitionDetailWorksView,
    accountingViewControllerModule: globalThis.ExhibitionDetailAccountingViewController
  };
  const optionalDependencies = new Set(['artworkIdentity', 'artworkRepository', 'artworkSyncService', 'workPickerControllerModule', 'collectionPickerControllerModule']);
  const missing = Object.entries(dependencies).find(([name, dependency]) => !dependency && !optionalDependencies.has(name));
  if (missing) throw new Error(`Exhibition detail dependency is unavailable: ${missing[0]}`);
  return Object.freeze(dependencies);
}

function createCertificateController() {
  return exhibitionDetailDependencies.certificateControllerModule.create({
    ExhibitionCertificateModel: exhibitionDetailDependencies.certificateModel,
    ExhibitionImageLifecycle: exhibitionDetailDependencies.imageLifecycle,
    ensureCertificateLibraries,
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
    getSourceArtworkForSold: (sold) => exhibitionDetailDependencies.certificateModel.getSourceArtwork(getCurrentExhibition(), sold),
    saveExhibition,
    renderSalesManagement: renderSoldWorkRows,
    setStateSoldWorks(soldWorks) {
      if (exhibitionDetailState.exhibition) exhibitionDetailState.exhibition.soldWorks = soldWorks;
    },
    alert,
    console
  });
}

function createInventoryStateController() {
  return exhibitionDetailDependencies.inventoryStateControllerModule.create({
    state: exhibitionDetailState,
    getCurrentExhibition
  });
}

function createWorksEditorController() {
  return exhibitionDetailDependencies.worksEditorControllerModule.create({
    state: exhibitionDetailState,
    document,
    window,
    fetchImpl: (...args) => fetch(...args),
    FileReaderImpl: FileReader,
    ImageImpl: Image,
    createCanvas: () => document.createElement('canvas'),
    inventoryModel: exhibitionDetailDependencies.inventoryModel,
    imageLifecycle: exhibitionDetailDependencies.imageLifecycle,
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
    synchronizeArtwork: synchronizeArtworkOccurrence,
    consoleImpl: console
  });
}

function synchronizeArtworkOccurrence(work) {
  if (exhibitionDetailState.inventoryMode === 'goods') return true;
  if (!exhibitionDetailDependencies.artworkRepository || !exhibitionDetailDependencies.artworkSyncService) return true;
  const exhibition = getCurrentExhibition();
  const artworks = exhibitionDetailDependencies.artworkRepository.loadArtworks();
  const exhibitions = exhibitionDetailDependencies.repository.loadExhibitions();
  const result = exhibitionDetailDependencies.artworkSyncService.synchronizeSavedOccurrence({
    artworks,
    exhibitions,
    exhibition,
    occurrence: work
  });
  if (result.status === 'ambiguous') {
    console.warn('Artwork identity requires explicit resolution.', { occurrenceId: work.id, candidateCount: result.candidates.length });
    return true;
  }
  return exhibitionDetailDependencies.artworkRepository.saveArtworksSafely(result.artworks);
}

function createWorksView() {
  return exhibitionDetailDependencies.worksViewModule.create({
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
    inventoryRenderer: exhibitionDetailDependencies.inventoryRenderer,
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
    openCollectionPicker: () => collectionPickerController.open(),
    toggleSelectAllVisibleWorks,
    deleteAllWorks,
    deleteSelectedWorks,
    editSelectedWorks,
    exportWorksToExcel,
    saveAllWorks,
    undoWorkChanges
  });
}

function createCollectionPickerController() {
  const picker = exhibitionDetailDependencies.workPickerControllerModule.create({ document });
  let occurrenceSequence = 0;
  return exhibitionDetailDependencies.collectionPickerControllerModule.create({
    picker,
    getArtworks: () => exhibitionDetailDependencies.artworkRepository.loadArtworks(),
    getCurrentExhibition,
    getCurrentUserId,
    createOccurrenceId: () => Date.now() * 100 + occurrenceSequence++,
    addOccurrences: (occurrences) => worksEditorController.addWorkOccurrences(occurrences)
  });
}

function createSalesViewController() {
  return exhibitionDetailDependencies.salesViewControllerModule.create({
    state: exhibitionDetailState,
    document,
    window,
    openSalesAddModal,
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
    soldInputValueToKst,
    formatKoreanPhone,
    parseSoldQuantity,
    saveExhibition,
    renderSoldStatsTicker,
    refreshGridKeyboardNavigation,
    scrollRowToViewportCenter,
    alert: (...args) => alert(...args),
    confirm: (...args) => confirm(...args)
  });
}

function createAccountingViewController() {
  return exhibitionDetailDependencies.accountingViewControllerModule.create({
  state: exhibitionDetailState,
  document,
  accountingProjection: exhibitionDetailDependencies.accountingProjection,
  canManageAccountingData,
  getFirstAllowedTab,
  switchTab,
  getCurrentExhibition,
  ensureSoldWorksArray,
  normalizeSoldItemType,
  getSoldQuantityForItemType,
  cloneSalesRecords,
  saveExhibition,
  escapeHtml: escapeAccountingHtml,
  alert: (...args) => alert(...args),
  now: () => Date.now(),
  random: () => Math.random()
  });
}

function createBackupController() {
  return exhibitionDetailDependencies.backupControllerModule.create({
  state: exhibitionDetailState,
  document,
  fetchImpl: (...args) => fetch(...args),
  snapshotClient: exhibitionDetailDependencies.snapshotClient,
  exhibitionsRepository: exhibitionDetailDependencies.repository,
  getCurrentExhibition,
  getCurrentUser,
  getExhibitionAccessRole,
  getFirstAllowedTab,
  switchTab,
  escapeHtml: escapeAccountingHtml,
  alertImpl: (...args) => alert(...args),
  confirmImpl: (...args) => confirm(...args)
  });
}

function createInfoController() {
  return exhibitionDetailDependencies.infoControllerModule.create({
  state: exhibitionDetailState,
  document,
  loadUsers: () => exhibitionDetailDependencies.detailRepository.loadUsers(),
  getCurrentExhibition: () => getCurrentExhibition(),
  escapeHtml: (value) => escapeAccountingHtml(value),
  saveExhibition: () => saveExhibition(),
  switchTab: (tabName) => switchTab(tabName)
  });
}

function createStaffController() {
  return exhibitionDetailDependencies.staffControllerModule.create({
  state: exhibitionDetailState,
  document,
  getCurrentExhibition: () => getCurrentExhibition(),
  canManageStaffRoles: () => canManageStaffRoles(),
  getFirstAllowedTab: () => getFirstAllowedTab(),
  getEffectiveGalleryRole: (user) => getEffectiveGalleryRole(user),
  normalizeAccountType: (type) => normalizeAccountType(type),
  loadUsers: () => exhibitionDetailDependencies.detailRepository.loadUsers(),
  saveExhibition: () => saveExhibition(),
  switchTab: (tabName) => switchTab(tabName),
  alert: (...args) => alert(...args)
  });
}

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
  exhibitionDetailDependencies.tabsController.applyTabVisibilityByPermission({
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
  return exhibitionDetailDependencies.inventoryBackupModel.cloneJson(value, fallback);
}

function stripLargePayloadFields(value) {
  return exhibitionDetailDependencies.inventoryBackupModel.stripLargePayloadFields(value);
}

function getInventoryBackupStorageKey(exhibitionId) {
  return exhibitionDetailDependencies.inventoryBackupModel.getInventoryBackupStorageKey(exhibitionId);
}

function getInventoryListCounts(exhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.getInventoryListCounts(exhibition);
}

function normalizeInventoryBackupSnapshot(exhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.normalizeInventoryBackupSnapshot(exhibition);
}

function loadInventoryBackup(exhibitionId) {
  const key = getInventoryBackupStorageKey(exhibitionId);
  if (!key) return null;
  return exhibitionDetailDependencies.detailRepository.loadInventoryBackup(key);
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
  return exhibitionDetailDependencies.detailRepository.saveInventoryBackupSafely(key, backup);
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

  const restoredSaved = exhibitionDetailDependencies.repository.saveExhibitionsSafely(exhibitions);

  if (!restoredSaved) return false;

  console.warn('Recovered exhibition inventory from local backup due to likely data loss.');
  return true;
}

function isLargeUnexpectedInventoryDrop(previousExhibition, nextExhibition) {
  return exhibitionDetailDependencies.inventoryBackupModel.isLargeUnexpectedInventoryDrop(
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
  const value = exhibitionDetailDependencies.detailRepository.loadPreference(key);
  return value ? normalizeTabForAccess(value) : '';
}

function saveLastViewedExhibitionTab(tabName) {
  const key = getExhibitionLastTabStorageKey();
  if (!key) return;
  const normalized = normalizeTabForAccess(tabName);
  if (!normalized) return;
  exhibitionDetailDependencies.detailRepository.savePreference(key, normalized);
}

function goBack() {
  window.location.href = 'exhibitions.html';
}

async function initDetailPage() {
  if (!certificateController || !salesViewController) {
    throw new Error('Exhibition detail controllers must be initialized before page startup.');
  }

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

  const exhibitions = exhibitionDetailDependencies.repository.loadExhibitions();
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
  return inventoryStateController.getDefaultInventoryUiState();
}

function cloneInventoryUiState(uiState) {
  return inventoryStateController.cloneInventoryUiState(uiState);
}

function initializeInventoryData(exhibition) {
  return inventoryStateController.initializeInventoryData(exhibition);
}

function persistActiveInventoryUiState() {
  return inventoryStateController.persistActiveInventoryUiState();
}

function restoreInventoryUiState(mode) {
  return inventoryStateController.restoreInventoryUiState(mode);
}

function syncInventoryMode(mode) {
  return inventoryStateController.syncInventoryMode(mode);
}

function switchTab(tabName) {
  return exhibitionDetailDependencies.tabsController.switchTab(tabName, {
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

function createFilesController() {
  return exhibitionDetailDependencies.filesControllerModule.create({
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
}

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
  return accountingViewController.parseAccountingAmount(value);
}

function formatAccountingAmount(value) {
  return accountingViewController.formatAccountingAmount(value);
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
  return accountingViewController.getExhibitionExpenseItems();
}

function getExhibitionRevenueItems() {
  return accountingViewController.getExhibitionRevenueItems();
}

function getExhibitionManualRevenueItems() {
  return accountingViewController.getExhibitionManualRevenueItems();
}

function getExpenseEffectiveAmount(item, revenueTotals) {
  return accountingViewController.getExpenseEffectiveAmount(item, revenueTotals);
}

function buildAccountingTableRows(items, options = {}) {
  return accountingViewController.buildAccountingTableRows(items, options);
}

function renderExhibitionAccounting(container) {
  return accountingViewController.renderExhibitionAccounting(container);
}

function formatAccountingInput(value) {
  return accountingViewController.formatAccountingInput(value);
}

function addExpenseItem() {
  return accountingViewController.addExpenseItem();
}

function handleExpenseFieldChange(expenseId, field, value) {
  return accountingViewController.handleExpenseFieldChange(expenseId, field, value);
}

function deleteSelectedExpenseItems() {
  return accountingViewController.deleteSelectedExpenseItems();
}

function pushExpenseUndoSnapshot() {
  return accountingViewController.pushExpenseUndoSnapshot();
}

function pushRevenueUndoSnapshot() {
  return accountingViewController.pushRevenueUndoSnapshot();
}

function toggleAccountingRowSelection(kind, id, checked) {
  return accountingViewController.toggleAccountingRowSelection(kind, id, checked);
}

function toggleAccountingSelectAll(kind, source) {
  return accountingViewController.toggleAccountingSelectAll(kind, source);
}

function toggleAccountingSelectAllFromButton(kind) {
  return accountingViewController.toggleAccountingSelectAllFromButton(kind);
}

function deleteAllAccountingItems(kind) {
  return accountingViewController.deleteAllAccountingItems(kind);
}

function undoExpenseAccountingChanges() {
  return accountingViewController.undoExpenseAccountingChanges();
}

function undoRevenueAccountingChanges() {
  return accountingViewController.undoRevenueAccountingChanges();
}

function deleteSelectedRevenueItems() {
  return accountingViewController.deleteSelectedRevenueItems();
}

function updateAccountingActionButtons() {
  return accountingViewController.updateAccountingActionButtons();
}

function addRevenueItem() {
  return accountingViewController.addRevenueItem();
}

function editAccountingRow(kind, rowId) {
  return accountingViewController.editAccountingRow(kind, rowId);
}

function saveExpenseRowEdit(rowId) {
  return accountingViewController.saveExpenseRowEdit(rowId);
}

function deleteAccountingRow(kind, rowId) {
  return accountingViewController.deleteAccountingRow(kind, rowId);
}

function deleteExpenseRowById(rowId) {
  return accountingViewController.deleteExpenseRowById(rowId);
}

function deleteRevenueRowByType(rowId) {
  return accountingViewController.deleteRevenueRowByType(rowId);
}

function saveRevenueRowEdit(rowId) {
  return accountingViewController.saveRevenueRowEdit(rowId);
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
  return exhibitionDetailDependencies.salesModel.normalizeSoldItemType(sold);
}

function parseSoldQuantity(value) {
  return exhibitionDetailDependencies.salesModel.parseSoldQuantity(value);
}

function parseStockQuantity(value) {
  return exhibitionDetailDependencies.salesModel.parseStockQuantity(value);
}

function getGoodsSoldQuantity(goodsId) {
  return exhibitionDetailDependencies.salesModel.getGoodsSoldQuantity(getSalesMasterRecords(), goodsId);
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
  return exhibitionDetailDependencies.salesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatCurrencyKrw(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

function getArtistSalesSummary() {
  return exhibitionDetailDependencies.salesModel.getArtistSalesSummary(ensureSoldWorksArray(), isWorkNotForSale);
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
  return salesViewController.cloneSalesRecords(records);
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
  return salesViewController.pushSalesUndoSnapshot();
}

function updateSalesActionButtons() {
  return salesViewController.updateSalesActionButtons();
}

function renderSoldWorkRows() {
  return salesViewController.renderSoldWorkRows();
}

function getSoldQuantityForItemType(itemType, value) {
  return exhibitionDetailDependencies.salesModel.getSoldQuantityForItemType(itemType, value);
}

function getSalesSearchResults(query) {
  const exhibition = getCurrentExhibition();
  return exhibitionDetailDependencies.salesModel.getSalesSearchResults({
    artWorks: exhibition.artWorks,
    works: exhibition.works,
    goods: exhibition.goods,
    query
  });
}

function createSalesAddController() {
  return exhibitionDetailDependencies.salesAddControllerModule.create({
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
    formatCurrencyKrw,
    getCurrentExhibition,
    ensureSoldWorksArray,
    pushSalesUndoSnapshot,
    getCurrentKstDateTimeString,
    getCurrentUserId,
    saveExhibition,
    getCurrentTab: () => exhibitionDetailState.currentTab,
    switchTab,
    renderSoldWorkRows,
    now: Date.now,
    random: Math.random
  });
}

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
  return salesAddController.confirmSalesAddModal();
}

function isValidKoreanPhone(value) {
  return salesViewController.isValidKoreanPhone(value);
}

function getMissingRequiredSoldFields(sold) {
  return salesViewController.getMissingRequiredSoldFields(sold);
}

function markMissingSoldFields(row, missingFields) {
  return salesViewController.markMissingSoldFields(row, missingFields);
}

function saveSoldWork(soldId, triggerButton) {
  return salesViewController.saveSoldWork(soldId, triggerButton);
}

function saveAllSoldWorks() {
  return salesViewController.saveAllSoldWorks();
}

function toggleSoldWorkEdit(soldId) {
  return salesViewController.toggleSoldWorkEdit(soldId);
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
  return salesViewController.deleteSoldWork(soldId);
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
  return exhibitionDetailDependencies.imageLifecycle.getPhotoPreviewSource(item);
}

function getPhotoDataUrl(item) {
  return exhibitionDetailDependencies.imageLifecycle.getPhotoSource(item);
}

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
  return salesViewController.handleSoldFieldChange(soldId, field, value);
}

function syncSoldFromRow(sold, row) {
  return salesViewController.syncSoldFromRow(sold, row);
}

function formatKoreanPhone(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function handleSoldPhoneInput(soldId, event) {
  return salesViewController.handleSoldPhoneInput(soldId, event);
}

function handleSoldPaymentMethodChange(soldId, value) {
  return salesViewController.handleSoldPaymentMethodChange(soldId, value);
}

function addSoldWorkRow() {
  openSalesAddModal();
}

function handleSoldWorkSearchChange(soldId, field, value) {
  return salesViewController.handleSoldWorkSearchChange(soldId, field, value);
}

function toggleSalesSelection(soldId, isChecked, event, rowIndex) {
  return salesViewController.toggleSalesSelection(soldId, isChecked, event, rowIndex);
}

function ensureSalesEditUndoSnapshot(soldId) {
  return salesViewController.ensureSalesEditUndoSnapshot(soldId);
}

function getInviteRoleLabel(role) { return staffController.getInviteRoleLabel(role); }

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
  return salesViewController.toggleSelectAllSales(source);
}

function toggleSelectAllSalesFromButton() {
  return salesViewController.toggleSelectAllSalesFromButton();
}

function editSelectedSoldWorks() {
  return salesViewController.editSelectedSoldWorks();
}

function deleteAllSoldWorks() {
  return salesViewController.deleteAllSoldWorks();
}

function deleteSelectedSoldWorks() {
  return salesViewController.deleteSelectedSoldWorks();
}

function undoSalesChanges() {
  return salesViewController.undoSalesChanges();
}

function openImagePreviewBySoldId(soldId, event) {
  return salesViewController.openImagePreviewBySoldId(soldId, event);
}

function renderStaffManagement(container) {
  return staffController.renderStaffManagement(container);
}

function openInviteModal(role) {
  return staffController.openInviteModal(role);
}

function closeInviteModal() {
  return staffController.closeInviteModal();
}

function filterInviteUsers() {
  return staffController.filterInviteUsers();
}

function renderInviteUserList(users, assignedIds) {
  return staffController.renderInviteUserList(users, assignedIds);
}

function confirmInvite() {
  return staffController.confirmInvite();
}

function removeStaffMember(role, userId) {
  return staffController.removeStaffMember(role, userId);
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

let TRANSIENT_WORK_PHOTO_FIELDS = [];

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
  return exhibitionDetailDependencies.salesModel.parseSoldPriceAmount(value, isWorkNotForSale);
}

function formatWonAmount(amount) {
  return `₩${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}`;
}

function getSoldStatsForWorksTicker() {
  return exhibitionDetailDependencies.salesModel.getSoldStats({
    records: ensureSoldWorksArray(),
    selectedIds: exhibitionDetailState.selectedWorkIds,
    idField: 'workId',
    selectedLabel: '선택된 작품',
    allLabel: '전체 작품 기준 판매 통계',
    isNotForSale: isWorkNotForSale
  });
}

function getSoldStatsForSalesTicker() {
  return exhibitionDetailDependencies.salesModel.getSoldStats({
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
  return exhibitionDetailDependencies.inventoryModel.getSortedWorks({
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
  return exhibitionDetailDependencies.inventoryModel.getWorkSortValue(work, field, {
    parseStockQuantity,
    getGoodsSoldQuantity,
    soldWorkIdSet
  });
}

function getSortedSoldWorks() {
  return exhibitionDetailDependencies.salesModel.getSortedSoldWorks({
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
  const exportData = exhibitionDetailDependencies.exportModel.buildSalesExport({
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
  return exhibitionDetailDependencies.salesModel.getSoldSortValue(sold, field, isWorkNotForSale);
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
  const exportData = exhibitionDetailDependencies.exportModel.buildAccountingExport({
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
  const exportData = exhibitionDetailDependencies.exportModel.buildWorksExport({
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
  return exhibitionDetailDependencies.salesModel.filterSoldWorks(soldWorks, {
    advanced: exhibitionDetailState.salesAdvanced,
    filters: exhibitionDetailState.salesFilters,
    search: exhibitionDetailState.salesSearch
  });
}

function filterWorks(works) {
  return exhibitionDetailDependencies.inventoryModel.filterWorks(works, {
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
  const exhibitions = exhibitionDetailDependencies.repository.loadExhibitions();
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

  const saved = exhibitionDetailDependencies.repository.saveExhibitionsSafely(exhibitions);
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

function createGridNavigationController() {
  return exhibitionDetailDependencies.gridNavigationModule.create({
    state: exhibitionDetailState,
    document,
    startCellEditFromEnter
  });
}

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

function initializeExhibitionDetailControllers() {
  if (certificateController) return;

  exhibitionDetailDependencies = resolveExhibitionDetailDependencies();
  certificateController = createCertificateController();
  inventoryStateController = createInventoryStateController();
  worksEditorController = createWorksEditorController();
  TRANSIENT_WORK_PHOTO_FIELDS = worksEditorController.TRANSIENT_WORK_PHOTO_FIELDS;
  collectionPickerController = exhibitionDetailDependencies.artworkRepository
    && exhibitionDetailDependencies.workPickerControllerModule
    && exhibitionDetailDependencies.collectionPickerControllerModule
    ? createCollectionPickerController()
    : Object.freeze({ open() {} });
  worksView = createWorksView();
  salesViewController = createSalesViewController();
  accountingViewController = createAccountingViewController();
  backupController = createBackupController();
  infoController = createInfoController();
  staffController = createStaffController();
  filesController = createFilesController();
  salesAddController = createSalesAddController();
  gridNavigationController = createGridNavigationController();
}

let exhibitionDetailStartupStarted = false;

window.exhibitionDetailReady = new Promise((resolve, reject) => {
  function startExhibitionDetailPage() {
    if (exhibitionDetailStartupStarted) return;
    exhibitionDetailStartupStarted = true;
    initializeExhibitionDetailControllers();
    initDetailPage().then(resolve, reject);
  }

  if (document.getElementById('exhibition-title')) {
    startExhibitionDetailPage();
  }
});
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
