(function () {
  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;
  const STORAGE_KEY = 'studio-calendar-state-v1';
  const STUDENT_STORAGE_KEY = 'pottery-students-v1';
  const PERSONAL_WORK_STORAGE_KEY = 'pottery-personal-work-v1';
  const SLOT_HEIGHT = 28;
  const BASE_EDITOR_START_SLOT = 20; // 10:00
  const BASE_EDITOR_END_SLOT = 36; // 18:00
  const HOLD_TO_MOVE_MS = 280;
  const BASE_EDITOR_SCROLL_EDGE_PX = 26;
  const BASE_EDITOR_SCROLL_STEP = 14;
  const BASE_RESIZE_EDGE_PX = 6;
  const ALL_DAY_ROW_HEIGHT = 28;
  const EVENT_SELECTOR_ROW_HEIGHT = 20;
  const EVENT_SELECTOR_TIME_COL_WIDTH = 56;
  const MONTH_ROWS = 6;
  const MONTH_ROW_HEIGHT = 128;
  const MIN_CALENDAR_ZOOM = 0.7;
  const MAX_CALENDAR_ZOOM = 1.5;
  const CALENDAR_ZOOM_STEP = 0.1;
  const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
  const ROLE_LOCK_MESSAGE = '계정 등급으로 인해 선택 불가능';
  const KILN_CATEGORY_OPTIONS = ['초벌', '재벌'];
  const displayPolicy = globalThis.MasterCalendarDisplayPolicy;
  let studioPageInitialized = false;
  let studioPageStartupStarted = false;
  let resolveMasterCalendarReady;
  let rejectMasterCalendarReady;
  const pendingExternalStateKeys = new Set();

  const state = {
    weekStart: getWeekStart(new Date()),
    monthStart: getMonthStart(new Date()),
    viewMode: 'week',
    baseUndoStack: [],
    events: [],
    baseRules: [],
    baseRuleTimeline: [],
    baseWeekOverrides: {},
    baseEditorWeekStart: getWeekStart(new Date()),
    baseEditMode: 'base',
    studioUsers: [],
    instructors: [],
    classTeachingLog: [],
    eventSelection: {
      active: false,
      dragging: false,
      mode: '',
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      anchorSlot: null,
      resizeEdge: '',
      moveTimerId: null,
      moveDuration: 1
    },
    dragBase: {
      active: false,
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      gridEl: null,
      ghostEl: null
    },
    moveBase: {
      active: false,
      ruleId: null,
      ruleType: '',
      ruleLabel: '',
      originDay: null,
      dayIndex: null,
      duration: 1,
      originStartSlot: 0,
      previewStartSlot: 0,
      previewEndSlot: 1,
      gridEl: null,
      ghostEl: null,
      timerId: null,
      moved: false
    },
    resizeBase: {
      active: false,
      ruleId: null,
      ruleType: '',
      ruleLabel: '',
      dayIndex: null,
      edge: null,
      originStartSlot: 0,
      originEndSlot: 1,
      previewStartSlot: 0,
      previewEndSlot: 1,
      gridEl: null,
      ghostEl: null
    },
    editBaseRuleId: null,
    masterCreate: {
      active: false,
      mode: '',
      dayIndex: null,
      anchorSlot: null,
      startSlot: null,
      endSlot: null,
      overlayEl: null,
      previewEl: null
    },
    masterEdit: {
      active: false,
      eventId: null,
      occurrenceDate: '',
      mode: '',
      edge: '',
      dayIndex: null,
      startSlot: null,
      endSlot: null,
      duration: 1,
      capacity: 1,
      originLane: 0,
      kind: '',
      title: '',
      repeatWeekly: false,
      anchorOffset: 0,
      bubbleEl: null,
      occupancySnapshot: null,
      validPreview: false,
      targetDayIndex: null,
      targetStartSlot: null,
      targetEndSlot: null,
      targetLane: 0,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerId: null,
      touchIdentifier: null,
      pointerMoved: false,
      suppressClickUntil: 0
    },
    recurringDelete: {
      eventId: '',
      occurrenceDate: ''
    },
    recurringMove: {
      eventId: '',
      occurrenceDate: '',
      nextDate: '',
      nextStart: '',
      nextEnd: '',
      nextClassType: '',
      nextInstructor: '',
      nextBaseRuleId: ''
    },
    deleteConfirm: {
      eventId: ''
    },
    baseEventFollowPrompt: {
      pending: null
    },
    access: {
      userName: '',
      studioRole: ''
    },
    eventKindOptionsHtml: '',
    calendarZoom: 1
  };

  const baseRulesDomain = globalThis.MasterCalendarBaseRules.create({
    state,
    getWeekStart,
    formatDateInput,
    createBaseRuleId
  });

  const baseTransactionController = globalThis.MasterCalendarBaseTransactionController.create({
    state,
    document,
    SLOTS_PER_DAY,
    baseRulesDomain,
    getWeekStart,
    formatDateInput,
    addDays,
    timeToSlot,
    slotToTime,
    getEventsForDate,
    isAllDayKind,
    openModal,
    closeModal,
    saveState,
    renderAll,
    applyClassEventBaseMetadata,
    alert: (message) => alert(message),
    now: () => Date.now(),
    random: () => Math.random()
  });

  const quickCreateController = globalThis.MasterCalendarQuickCreateController.create({
    state,
    document,
    SLOT_HEIGHT,
    canCreateFromBaseRule,
    getBaseRuleForSlot,
    formatDateInput,
    addDays,
    slotToTime,
    buildDailyOccupancyMap,
    findLane,
    openEventModal
  });

  const navigationController = globalThis.MasterCalendarNavigationController.create({
    document,
    state,
    minCalendarZoom: MIN_CALENDAR_ZOOM,
    maxCalendarZoom: MAX_CALENDAR_ZOOM,
    dayNames: DAY_NAMES,
    slotHeight: SLOT_HEIGHT,
    slotsPerDay: SLOTS_PER_DAY,
    allDayRowHeight: ALL_DAY_ROW_HEIGHT,
    monthRows: MONTH_ROWS,
    monthRowHeight: MONTH_ROW_HEIGHT,
    getWeekStart,
    getMonthStart,
    addDays,
    addMonths,
    formatDateDisplay,
    formatMonthDate,
    isSameCalendarDate,
    formatDateInput,
    weekViewModule: globalThis.MasterCalendarWeekView,
    monthViewModule: globalThis.MasterCalendarMonthView,
    isAllDayKind,
    isExhibitionKind,
    getAllDayPriority,
    canManageEventOccurrence,
    kindToClass,
    escapeHtml,
    getEventDisplayTitle,
    requestDeleteEvent,
    setRoleLockedMessage,
    openQuickEditEventModal,
    slotToTime,
    getBaseRuleForSlot,
    baseTypeToClass,
    canCreateFromBaseRule,
    startMasterCreate,
    moveMasterCreate,
    finalizeMasterCreate,
    isBaseLabelStart,
    getBaseLabelText,
    getEventsForDate,
    timeToSlot,
    findLane,
    startMasterEventEdit
  });

  const bindingsController = globalThis.MasterCalendarBindingsController.create({
    document,
    window,
    state,
    CALENDAR_ZOOM_STEP,
    alert,
    toggleMobileInfoPanels,
    setCalendarZoom,
    shiftCurrentRange,
    renderAll,
    setViewMode,
    setCalendarToToday,
    isStudioAdmin,
    isStudioInstructor,
    isStudioArtist,
    isArtistRegisteredForPersonalWork,
    openEventModal,
    openModal,
    getWeekStart,
    setBaseCreateControlsVisible,
    loadStudioInstructors,
    populateInstructorOptions,
    renderBaseEditorGrid,
    renderBaseEditorWeekLabel,
    renderBaseEditModeToggle,
    syncBaseClassNameVisibility,
    updateUndoButtonState,
    addDays,
    getBaseEditorWeekStart,
    hasWeekOverride,
    saveEventFromModal,
    saveQuickEditEventFromModal,
    handleDeleteRecurringOne,
    handleDeleteRecurringFollowing,
    closeModal,
    handleMoveRecurringOne,
    handleMoveRecurringFollowing,
    resetRecurringMoveState,
    handleDeleteConfirmOk,
    canUseEventKindByRole,
    resetEventSelectionState,
    syncEventInputMode,
    renderEventSelectorGrid,
    syncEventSelectionFromInputs,
    renderEventPersonalUserInfo,
    handleEventUserSelectChange,
    handleQuickEditUserSelectChange,
    syncEditBaseClassNameVisibility,
    saveBaseEditFromModal,
    deleteBaseEditFromModal,
    resolveBaseEventFollowPrompt,
    undoBaseChange,
    handleBaseEditorGlobalMouseUp,
    handleBaseEditorGlobalMouseMove,
    handleMasterCalendarPointerMove,
    handleMasterCalendarPointerUp,
    handleMasterCalendarPointerCancel,
    handleBaseEditorUndoShortcut,
    handleBaseGridHoverCursor,
    clearBaseGridHoverCursor,
    handleEventSelectorHoverCursor,
    clearEventSelectorHoverCursor,
    syncCalendarHeaderScrollbarGap,
    syncMobileInfoPanelsState,
    applyStudioRoleUiLocks
  });

  window.masterCalendarReady = new Promise((resolve, reject) => {
    resolveMasterCalendarReady = resolve;
    rejectMasterCalendarReady = reject;
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (!keys.length) return;

    if (!studioPageInitialized) {
      keys.forEach((key) => pendingExternalStateKeys.add(key));
      return;
    }

    if (keys.includes(STORAGE_KEY)) {
      loadState();
      renderAll();
      return;
    }

    if (keys.includes(PERSONAL_WORK_STORAGE_KEY) || keys.includes('users')) {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }
  });

  window.addEventListener('storage', (event) => {
    const changedKey = String(event?.key || '');
    if (!changedKey) return;

    if (!studioPageInitialized) {
      pendingExternalStateKeys.add(changedKey);
      return;
    }

    if (changedKey === STORAGE_KEY) {
      loadState();
      renderAll();
      return;
    }

    if (changedKey === PERSONAL_WORK_STORAGE_KEY || changedKey === 'users') {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }
  });

  function waitForCloudSyncReady(timeoutMs = 4000) {
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

  async function initializeStudioPage() {
    if (!enforceStudioAccess()) return;
    await waitForCloudSyncReady();
    loadState();
    setCalendarToToday();
    bindEvents();
    renderAll();
    startWorkshopUsageTicker();
    studioPageInitialized = true;
    pendingExternalStateKeys.clear();
  }

  function startWorkshopUsageTicker() {
    setInterval(() => {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }, 60 * 1000);
  }

  function setCalendarToToday() {
    return navigationController.setCalendarToToday();
  }

  function enforceStudioAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }

    const siteAccess = normalizeSiteAccess(currentUser.siteAccess);
    if (siteAccess !== 'pottery' && siteAccess !== 'both') {
      alert('도예공방 10.19 접근 권한이 없습니다.');
      window.location.href = 'index.html';
      return false;
    }

    const studioRole = getEffectiveStudioRole(currentUser);
    if (studioRole !== '어드민' && studioRole !== '강사' && studioRole !== '작가' && studioRole !== '수강생') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }
    if (studioRole === '수강생') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }

    state.access.userName = String(currentUser?.name || currentUser?.username || '').trim();
    state.access.studioRole = studioRole;

    return true;
  }

  function normalizeSiteAccess(access) {
    const raw = String(access || '').trim().toLowerCase();
    if (raw === 'both' || raw === 'all') return 'both';
    if (raw === 'pottery' || raw === 'studio') return 'pottery';
    if (raw === 'gallery') return 'gallery';
    return '';
  }

  function getActiveStudioRole() {
    return String(state.access.studioRole || '').trim();
  }

  function getActiveStudioUserName() {
    return String(state.access.userName || '').trim();
  }

  function isStudioAdmin() {
    return getActiveStudioRole() === '어드민';
  }

  function isStudioInstructor() {
    return getActiveStudioRole() === '강사';
  }

  function isStudioArtist() {
    return getActiveStudioRole() === '작가';
  }

  function setRoleLockedMessage(el) {
    if (!el) return;
    el.classList.add('role-locked');
    el.setAttribute('title', ROLE_LOCK_MESSAGE);
    el.setAttribute('data-locked-message', ROLE_LOCK_MESSAGE);
    el.setAttribute('aria-disabled', 'true');
  }

  function clearRoleLockedMessage(el) {
    if (!el) return;
    el.classList.remove('role-locked');
    el.removeAttribute('data-locked-message');
    el.removeAttribute('aria-disabled');
    el.removeAttribute('title');
  }

  function isArtistRegisteredForPersonalWork() {
    if (!isStudioArtist()) return true;
    const me = getActiveStudioUserName();
    if (!me) return false;
    return getPersonalUsersForEvents().includes(me);
  }

  function canUseEventKindByRole(kind) {
    if (isStudioAdmin()) return true;
    if (isStudioArtist()) return kind === '개인작업';
    if (isStudioInstructor()) {
      return kind === '수강' || kind === '개인작업' || kind === '강사 지도 하 개인작업';
    }
    return false;
  }

  function isPersonalBaseRange(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      if (!rule || String(rule.type || '') !== '개인작업 시간') return false;
    }
    return true;
  }

  function isInstructorOwnedClassRange(date, startTime, endTime, requireExactClassBlock) {
    const instructorName = getActiveStudioUserName();
    if (!instructorName) return false;

    if (requireExactClassBlock) {
      const rule = getClassBaseRuleForRange(date, startTime, endTime);
      if (!rule) return false;
      return String(rule.instructor || '').trim() === instructorName;
    }

    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      if (!rule || String(rule.type || '') !== '수업시간') return false;
      if (String(rule.instructor || '').trim() !== instructorName) return false;
    }

    return true;
  }

  function canManageEventPlacementByRole(kind, date, startTime, endTime, title) {
    if (isStudioAdmin()) return true;
    if (!kind || !date || !startTime || !endTime) return false;
    if (!canUseEventKindByRole(kind)) return false;

    if (isStudioArtist()) {
      const owner = String(title || '').trim();
      const activeUserName = getActiveStudioUserName();
      if (!getPersonalUsersForEvents().includes(activeUserName)) {
        return false;
      }
      return owner === activeUserName && isPersonalBaseRange(date, startTime, endTime);
    }

    if (isStudioInstructor()) {
      if (kind === '개인작업') {
        return isPersonalBaseRange(date, startTime, endTime);
      }
      if (kind === '수강') {
        return isInstructorOwnedClassRange(date, startTime, endTime, true);
      }
      if (kind === '강사 지도 하 개인작업') {
        return isInstructorOwnedClassRange(date, startTime, endTime, false);
      }
      return false;
    }

    return false;
  }

  function canManageEventOccurrence(eventItem, occurrenceDate) {
    if (!eventItem) return false;
    if (isStudioAdmin()) return true;

    const kind = String(eventItem.kind || '');
    if (isAllDayKind(kind)) return false;

    const date = String(occurrenceDate || eventItem.date || '').trim();
    const start = String(eventItem.start || '').trim();
    const end = String(eventItem.end || '').trim();
    const title = String(eventItem.title || '').trim();
    return canManageEventPlacementByRole(kind, date, start, end, title);
  }

  function canCreateFromBaseRule(baseRule) {
    const type = String(baseRule?.type || '').trim();
    if (!type) return false;
    if (isStudioAdmin()) return true;

    if (isStudioArtist()) {
      return type === '개인작업 시간';
    }

    if (isStudioInstructor()) {
      if (type === '개인작업 시간') return true;
      if (type === '수업시간') {
        return String(baseRule?.instructor || '').trim() === getActiveStudioUserName();
      }
      return false;
    }

    return false;
  }

  function bindEvents() {
    return bindingsController.bindEvents();
  }

  function isMobileViewport() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) return true;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return window.innerWidth <= 980;
  }

  function syncMobileInfoPanelsState() {
    const toggleBtn = document.getElementById('mobile-info-toggle-btn');
    const sidebar = document.querySelector('.studio-sidebar');
    const infoPanels = document.getElementById('studio-mobile-info-panels');
    if (!toggleBtn || !sidebar || !infoPanels) return;

    const mobile = isMobileViewport();
    if (!mobile) {
      sidebar.classList.remove('mobile-info-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = '범례 및 개인작업 현황 보기';
      infoPanels.hidden = false;
      return;
    }

    const opened = sidebar.classList.contains('mobile-info-open');
    infoPanels.hidden = !opened;
    toggleBtn.setAttribute('aria-expanded', opened ? 'true' : 'false');
    toggleBtn.textContent = opened ? '범례 및 개인작업 현황 닫기' : '범례 및 개인작업 현황 보기';
  }

  function toggleMobileInfoPanels() {
    const sidebar = document.querySelector('.studio-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-info-open');
    syncMobileInfoPanelsState();
  }

  function getCalendarSlotHeight() {
    return SLOT_HEIGHT;
  }

  function getCalendarZoomFactor() {
    return navigationController.getCalendarZoomFactor();
  }

  function applyCalendarZoomStyles() {
    return navigationController.applyCalendarZoomStyles();
  }

  function setCalendarZoom(nextZoom) {
    return navigationController.setCalendarZoom(nextZoom);
  }

  function updateCalendarZoomButtons() {
    return navigationController.updateCalendarZoomButtons();
  }

  function applyStudioRoleUiLocks() {
    const baseBtn = document.getElementById('open-base-editor-btn');
    if (baseBtn && !isStudioAdmin()) {
      baseBtn.disabled = false;
      setRoleLockedMessage(baseBtn);
    } else if (baseBtn) {
      clearRoleLockedMessage(baseBtn);
    }

    const addBtn = document.getElementById('open-add-event-btn');
    if (!addBtn) return;

    if (!isStudioAdmin() && !isStudioInstructor() && !isStudioArtist()) {
      addBtn.disabled = false;
      setRoleLockedMessage(addBtn);
      return;
    }

    if (isStudioArtist() && !isArtistRegisteredForPersonalWork()) {
      addBtn.disabled = true;
      addBtn.classList.add('role-locked');
      addBtn.setAttribute('title', '개인작업 관리에 등록된 이용자만 일정 추가가 가능합니다.');
      addBtn.setAttribute('data-locked-message', '개인작업 관리에 등록된 이용자만 일정 추가가 가능합니다.');
      addBtn.setAttribute('aria-disabled', 'true');
      return;
    }

    addBtn.disabled = false;
    clearRoleLockedMessage(addBtn);
  }

  function renderAll() {
    applyStudioRoleUiLocks();
    syncMobileInfoPanelsState();
    updateCalendarZoomButtons();
    renderMyWorkshopUsagePanel();
    syncViewToggleButtons();
    renderWeekLabel();
    renderCalendar();
    renderBaseEditorWeekLabel();
    renderBaseEditModeToggle();
    renderBaseEditorGrid();
    updateUndoButtonState();
  }

  function refreshWorkshopUsageUi() {
    renderMyWorkshopUsagePanel();
    renderEventPersonalUserInfo();
  }

  function renderWeekLabel() {
    return navigationController.renderWeekLabel();
  }

  function renderBaseEditorWeekLabel() {
    const labelEl = document.getElementById('base-week-label');
    if (!labelEl) return;
    const start = getBaseEditorWeekStart();
    const end = addDays(start, 6);
    labelEl.textContent = `${formatDateDisplay(start)} ~ ${formatDateDisplay(end)}`;
  }

  function renderBaseEditModeToggle() {
    const switchEl = document.getElementById('base-edit-mode-switch');
    const labelEl = document.getElementById('base-edit-mode-label');
    const gridEl = document.getElementById('base-editor-grid');
    const fromCurrentCheckbox = document.getElementById('base-edit-from-current-week');
    const overrideHintEl = document.getElementById('base-override-week-hint');
    const isOverrideWeek = hasWeekOverride(getBaseEditorWeekStart());
    if (isOverrideWeek) {
      state.baseEditMode = 'week';
    }
    const isWeek = state.baseEditMode === 'week';

    if (switchEl) {
      switchEl.checked = isWeek;
      switchEl.disabled = isOverrideWeek;
    }
    if (overrideHintEl) {
      overrideHintEl.hidden = !isOverrideWeek;
    }
    if (labelEl) {
      labelEl.textContent = isWeek ? '1주 시간표 수정 모드' : '기본 시간표 수정 모드';
      labelEl.classList.toggle('is-week', isWeek);
    }
    if (gridEl) {
      gridEl.classList.toggle('is-week-edit-mode', isWeek);
    }
    if (fromCurrentCheckbox) {
      fromCurrentCheckbox.disabled = isWeek;
      if (isWeek) fromCurrentCheckbox.checked = false;
      const row = fromCurrentCheckbox.closest('.base-from-week-row');
      if (row) row.classList.toggle('is-disabled', isWeek);
    }
  }

  function setBaseCreateControlsVisible(visible) {
    const controls = document.getElementById('base-create-controls');
    const addBtn = document.getElementById('base-add-block-btn');
    if (!controls || !addBtn) return;

    controls.classList.toggle('is-hidden', !visible);
    addBtn.style.display = visible ? 'none' : '';
    if (!visible) {
      document.getElementById('base-type').value = '';
      document.getElementById('base-class-name').value = '';
      document.getElementById('base-instructor').value = '';
      document.getElementById('base-apply-weekly').checked = false;
      syncBaseClassNameVisibility();
    }
  }

  function isBaseCreateControlsVisible() {
    const controls = document.getElementById('base-create-controls');
    if (!controls) return false;
    return !controls.classList.contains('is-hidden');
  }

  function setViewMode(mode) {
    return navigationController.setViewMode(mode);
  }

  function shiftCurrentRange(direction) {
    return navigationController.shiftCurrentRange(direction);
  }

  function syncViewToggleButtons() {
    return navigationController.syncViewToggleButtons();
  }

  function renderCalendar() {
    return navigationController.renderCalendar();
  }

  let pointerController = null;

  function getPointerController() {
    if (!pointerController) {
      pointerController = globalThis.MasterCalendarPointerController.create({
        document,
        state,
        slotsPerDay: SLOTS_PER_DAY,
        slotHeight: SLOT_HEIGHT,
        resizeEdgePx: BASE_RESIZE_EDGE_PX,
        canManageEventOccurrence,
        getCalendarZoomFactor,
        getBaseRuleForSlot,
        formatDateInput,
        addDays,
        slotToTime,
        canManageEventPlacementByRole,
        isEventPlacementAllowed,
        buildDailyOccupancyMap,
        occupancy: globalThis.MasterCalendarOccupancy,
        commandPlanner: globalThis.MasterCalendarCommands,
        getClassBaseRuleForRange,
        applyClassEventBaseMetadata,
        saveState,
        refreshWorkshopUsageUi,
        openQuickEditEventModal,
        openModal,
        resetMasterCreateState,
        finalizeMasterCreate,
        renderCalendar
      });
    }
    return pointerController;
  }

  function renderWeekCalendar(dayHeader, body, wrap) {
    return navigationController.renderWeekCalendar(dayHeader, body, wrap);
  }

  function renderMonthCalendar(dayHeader, body, wrap) {
    return navigationController.renderMonthCalendar(dayHeader, body, wrap);
  }

  function syncCalendarHeaderScrollbarGap() {
    return navigationController.syncCalendarHeaderScrollbarGap();
  }

  function startMasterCreate(event, dayIndex, slot, baseRule) {
    return quickCreateController.startMasterCreate(event, dayIndex, slot, baseRule);
  }

  function moveMasterCreate(dayIndex, slot) {
    return quickCreateController.moveMasterCreate(dayIndex, slot);
  }

  function finalizeMasterCreate() {
    return quickCreateController.finalizeMasterCreate();
  }

  function resetMasterCreateState() {
    return quickCreateController.resetMasterCreateState();
  }

  function updateMasterCreatePreview() {
    return quickCreateController.updateMasterCreatePreview();
  }

  function removeMasterCreatePreview() {
    return quickCreateController.removeMasterCreatePreview();
  }

  function startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble) {
    return getPointerController().startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble);
  }

  function getMasterEventResizeEdge(event, bubble) {
    return getPointerController().getMasterEventResizeEdge(event, bubble);
  }

  function handleMasterCalendarPointerMove(event) {
    return getPointerController().handleMasterCalendarPointerMove(event);
  }

  function applyMasterCalendarEditMove(clientX, clientY, sourceEvent) {
    return getPointerController().applyMasterCalendarEditMove(clientX, clientY, sourceEvent);
  }

  function getMasterEditPlacement(dayIndex, startSlot, endSlot, options) {
    return getPointerController().getMasterEditPlacement(dayIndex, startSlot, endSlot, options);
  }

  function applyMasterEditPreview() {
    return getPointerController().applyMasterEditPreview();
  }

  function handleMasterCalendarPointerUp(event) {
    return getPointerController().handleMasterCalendarPointerUp(event);
  }

  function finalizeMasterCalendarEdit(clientX, clientY) {
    return getPointerController().finalizeMasterCalendarEdit(clientX, clientY);
  }

  function handleMasterCalendarPointerCancel(event) {
    return getPointerController().handleMasterCalendarPointerCancel(event);
  }

  function getTrackedMasterTouch(event) {
    return getPointerController().getTrackedMasterTouch(event);
  }

  function handleMasterCalendarTouchMove(event) {
    return getPointerController().handleMasterCalendarTouchMove(event);
  }

  function handleMasterCalendarTouchEnd(event) {
    return getPointerController().handleMasterCalendarTouchEnd(event);
  }

  function handleMasterCalendarTouchCancel() {
    return getPointerController().handleMasterCalendarTouchCancel();
  }

  function resetMasterEditState() {
    return getPointerController().resetMasterEditState();
  }

  const quickEditController = globalThis.MasterCalendarQuickEditController.create({
    document,
    state,
    slotsPerDay: SLOTS_PER_DAY,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    roleLockMessage: ROLE_LOCK_MESSAGE,
    canManageEventOccurrence,
    loadStudioUsers,
    isExhibitionKind,
    isKilnKind,
    isAllDayKind,
    populateEventUserOptions,
    isStudioArtist,
    getActiveStudioUserName,
    escapeHtml,
    setRoleLockedMessage,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    formatDateInput,
    openModal,
    closeModal,
    timeToSlot,
    canManageEventPlacementByRole,
    getDayIndexFromDateString,
    isEventPlacementAllowed,
    buildDailyOccupancyMap,
    hasEnoughCapacityForRange,
    getClassBaseRuleForRange,
    buildKilnEventTitle,
    applyClassEventBaseMetadata,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    alert: (message) => alert(message)
  });

  function openQuickEditEventModal(eventId, occurrenceDate) {
    quickEditController.openQuickEditEventModal(eventId, occurrenceDate);
  }

  function saveQuickEditEventFromModal() {
    quickEditController.saveQuickEditEventFromModal();
  }

  function getMasterPointerDaySlot(clientX, clientY) {
    return getPointerController().getMasterPointerDaySlot(clientX, clientY);
  }

  function findLane(occupancy, startSlot, endSlot, need) {
    return globalThis.MasterCalendarOccupancy.findLane(occupancy, startSlot, endSlot, need);
  }

  function canPlaceInLane(occupancy, startSlot, endSlot, need, lane) {
    return globalThis.MasterCalendarOccupancy.canPlaceInLane(occupancy, startSlot, endSlot, need, lane);
  }

  function createEmptyDailyOccupancy() {
    return globalThis.MasterCalendarOccupancy.createEmptyDailyOccupancy(SLOTS_PER_DAY);
  }

  function cloneDailyOccupancy(occupancy) {
    return globalThis.MasterCalendarOccupancy.cloneDailyOccupancy(occupancy, SLOTS_PER_DAY);
  }

  function markLaneOccupancy(occupancy, startSlot, endSlot, lane, need) {
    globalThis.MasterCalendarOccupancy.markLaneOccupancy(occupancy, startSlot, endSlot, lane, need);
  }

  function buildMasterEditOccupancySnapshot(excludeEventId) {
    return getPointerController().buildMasterEditOccupancySnapshot(excludeEventId);
  }

  function getMasterEditOccupancyMap(date) {
    return getPointerController().getMasterEditOccupancyMap(date);
  }

  const modalController = globalThis.MasterCalendarModalController.create({
    document,
    state,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    baseEditorStartSlot: BASE_EDITOR_START_SLOT,
    eventSelectorRowHeight: EVENT_SELECTOR_ROW_HEIGHT,
    getWeekStart,
    formatDateInput,
    isStudioArtist,
    isStudioInstructor,
    getActiveStudioUserName,
    setRoleLockedMessage,
    loadStudioUsers,
    populateEventUserOptions,
    syncEventInputMode,
    syncEventSelectionFromInputs,
    clearEventSelectionMoveTimer,
    openModal,
    renderEventSelectorGrid,
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    timeToSlot,
    escapeHtml
  });

  const eventModalController = globalThis.MasterCalendarEventModalController.create({
    document,
    state,
    modalController,
    commandPlanner: globalThis.MasterCalendarCommands,
    slotsPerDay: SLOTS_PER_DAY,
    baseResizeEdgePx: BASE_RESIZE_EDGE_PX,
    eventSelectorRowHeight: EVENT_SELECTOR_ROW_HEIGHT,
    eventSelectorTimeColWidth: EVENT_SELECTOR_TIME_COL_WIDTH,
    holdToMoveMs: HOLD_TO_MOVE_MS,
    dayNames: DAY_NAMES,
    kilnCategoryOptions: KILN_CATEGORY_OPTIONS,
    roleLockMessage: ROLE_LOCK_MESSAGE,
    isStudioArtist,
    getActiveStudioUserName,
    setRoleLockedMessage,
    populateEventUserOptions,
    renderEventPersonalUserInfo,
    isAllDayKind,
    isKilnKind,
    isExhibitionKind,
    normalizeKilnCategory,
    buildKilnEventTitle,
    canManageEventPlacementByRole,
    getPersonalUsersForEvents,
    getClassBaseRuleForRange,
    getDayIndexFromDateString,
    isBaseRangeRepeatingWeekly,
    isEventPlacementAllowed,
    getBaseRuleForSlot,
    getRulesForWeek,
    getBaseLabelText,
    baseTypeToClass,
    buildDailyOccupancyMap,
    hasEnoughCapacityForRange,
    getEventsForDate,
    findLane,
    getEventDisplayTitle,
    kindToClass,
    getWeekStart,
    addDays,
    formatDateInput,
    formatMonthDate,
    timeToSlot,
    slotToTime,
    escapeHtml,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    closeModal,
    alert: (message) => alert(message),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timerId) => clearTimeout(timerId)
  });

  const participantsController = globalThis.MasterCalendarParticipantsController.create({
    state,
    document,
    repository: globalThis.MasterCalendarRepository?.repository,
    scheduleProjectionsModule: globalThis.MasterCalendarScheduleProjections,
    occurrencesModule: globalThis.MasterCalendarOccurrences,
    formatDateInput,
    addDays,
    timeToSlot,
    slotMinutes: SLOT_MINUTES,
    getActiveStudioUserName,
    getEffectiveSiteAccess,
    getEffectiveStudioRole,
    escapeHtml,
    renderEventSelectorGrid
  });

  const recurringEventController = globalThis.MasterCalendarRecurringEventController.create({
    state,
    commandPlanner: globalThis.MasterCalendarCommands,
    canManageEventOccurrence,
    openModal,
    closeModal,
    saveState,
    renderCalendar,
    refreshWorkshopUsageUi,
    applyClassEventBaseMetadata,
    createEventId: () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  function openEventModal(preset) {
    eventModalController.openEventModal(preset);
  }

  function resetEventSelectionState() {
    eventModalController.resetEventSelectionState();
  }

  function saveEventFromModal() {
    return eventModalController.saveEventFromModal();
  }

  function getEventsForDate(date) {
    return globalThis.MasterCalendarOccurrences.getEventsForDate({
      events: state.events,
      date,
      includeRangeEvents: true,
      isRangeEvent: (event) => isExhibitionKind(event.kind)
    });
  }

  function requestDeleteEvent(eventId, occurrenceDate) {
    return recurringEventController.requestDeleteEvent(eventId, occurrenceDate);
  }

  function handleDeleteConfirmOk() {
    return recurringEventController.handleDeleteConfirmOk();
  }

  function handleDeleteRecurringOne() {
    return recurringEventController.handleDeleteRecurringOne();
  }

  function handleDeleteRecurringFollowing() {
    return recurringEventController.handleDeleteRecurringFollowing();
  }

  function applyRecurringDeletePlan(scope) {
    return recurringEventController.applyRecurringDeletePlan(scope);
  }

  function finishRecurringDeletePlan(plan, eventId, eventItem) {
    return recurringEventController.finishRecurringDeletePlan(plan, eventId, eventItem);
  }

  function handleMoveRecurringOne() {
    return recurringEventController.handleMoveRecurringOne();
  }

  function handleMoveRecurringFollowing() {
    return recurringEventController.handleMoveRecurringFollowing();
  }

  function applyRecurringMovePlan(scope) {
    return recurringEventController.applyRecurringMovePlan(scope);
  }

  function resetRecurringMoveState() {
    return recurringEventController.resetRecurringMoveState();
  }

  function buildDailyOccupancyMap(date, excludeEventId) {
    return globalThis.MasterCalendarOccupancy.buildDailyOccupancy({
      events: getEventsForDate(date),
      excludeEventId,
      slotCount: SLOTS_PER_DAY,
      timeToSlot,
      isIgnoredKind(kind) {
        return kind === '기타' || isAllDayKind(kind);
      }
    });
  }

  function hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need) {
    return globalThis.MasterCalendarOccupancy.hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need);
  }

  function getDayIndexFromDateString(date) {
    return globalThis.MasterCalendarDateTime.getDayIndexFromDateString(date);
  }

  function getClassBaseRuleForRange(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return null;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));
    const startRule = getBaseRuleForSlot(dayIndex, startSlot, weekStart);
    const endRule = getBaseRuleForSlot(dayIndex, endSlot - 1, weekStart);
    if (!startRule || !endRule) return null;
    if (startRule.id !== endRule.id) return null;
    if (String(startRule.type || '') !== '수업시간') return null;
    if (Number(startRule.startSlot) !== Number(startSlot)) return null;
    if (Number(startRule.endSlot) !== Number(endSlot)) return null;
    return startRule;
  }

  function isClassBlockRepeatingWeekly(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));
    const weekRule = getClassBaseRuleForRange(date, startTime, endTime);
    if (!weekRule) return false;

    const templateRule = (state.baseRules || []).find((rule) => {
      return String(rule?.type || '') === '수업시간'
        && Number(rule?.day) === Number(dayIndex)
        && Number(rule?.startSlot) === Number(startSlot)
        && Number(rule?.endSlot) === Number(endSlot);
    });
    if (!templateRule) return false;

    return String(templateRule.className || '').trim() === String(weekRule.className || '').trim()
      && String(templateRule.instructor || '').trim() === String(weekRule.instructor || '').trim();
  }

  function getTemplateBaseRuleForSlot(dayIndex, slot) {
    return (state.baseRules || []).find((rule) => {
      return Number(rule?.day) === Number(dayIndex)
        && Number(rule?.startSlot) <= Number(slot)
        && Number(rule?.endSlot) > Number(slot);
    }) || null;
  }

  function isBaseRangeRepeatingWeekly(date, startTime, endTime) {
    const dayIndex = getDayIndexFromDateString(date);
    if (dayIndex < 0) return false;

    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));
    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const weekRule = getBaseRuleForSlot(dayIndex, slot, weekStart);
      const templateRule = getTemplateBaseRuleForSlot(dayIndex, slot);
      if (!weekRule || !templateRule) return false;
      if (String(weekRule.type || '') !== String(templateRule.type || '')) return false;

      if (String(weekRule.type || '') === '수업시간') {
        const sameClassName = String(weekRule.className || '').trim() === String(templateRule.className || '').trim();
        const sameInstructor = String(weekRule.instructor || '').trim() === String(templateRule.instructor || '').trim();
        if (!sameClassName || !sameInstructor) return false;
      }
    }

    return true;
  }

  function applyClassEventBaseMetadata(eventItem, targetDate) {
    if (!eventItem || String(eventItem.kind || '') !== '수강') return;
    const date = String(targetDate || eventItem.date || '').trim();
    if (!date) return;

    const rule = getClassBaseRuleForRange(date, eventItem.start, eventItem.end);
    if (!rule) return;

    eventItem.classType = String(rule.className || '수업시간');
    eventItem.instructor = String(rule.instructor || '').trim();
    eventItem.baseRuleId = String(rule.id || '');
  }

  function normalizeStudioRole(role) {
    const value = String(role || '').trim();
    const allowed = ['어드민', '강사', '수강생', '작가'];
    return allowed.includes(value) ? value : '';
  }

  function normalizeInstructorSiteAccess(access) {
    const raw = String(access || '').trim().toLowerCase();
    if (raw === 'both' || raw === 'all') return 'both';
    if (raw === 'pottery' || raw === 'studio') return 'pottery';
    if (raw === 'gallery') return 'gallery';
    return '';
  }

  function getEffectiveSiteAccess(user) {
    const direct = normalizeInstructorSiteAccess(user?.siteAccess);
    if (direct) return direct;
    return 'gallery';
  }

  function getEffectiveStudioRole(user) {
    const direct = normalizeStudioRole(user?.studioRole);
    if (direct) return direct;

    const accountType = String(user?.accountType || '').trim();
    const access = getEffectiveSiteAccess(user);
    if (accountType === '강사') {
      return '강사';
    }
    if ((access === 'pottery' || access === 'both') && accountType === '어드민') {
      return '어드민';
    }

    return '';
  }

  function loadStudioUsers() {
    return participantsController.loadStudioUsers();
  }

  function getStudentUsersForEvents() {
    return participantsController.getStudentUsersForEvents();
  }

  function getPersonalUsersForEvents() {
    return participantsController.getPersonalUsersForEvents();
  }

  function getActivePersonalWorkEntries() {
    return participantsController.getActivePersonalWorkEntries();
  }

  function getActivePersonalWorkEntryByUserName(userName) {
    return participantsController.getActivePersonalWorkEntryByUserName(userName);
  }

  function addMonthKeepDay(date, diff) {
    return participantsController.addMonthKeepDay(date, diff);
  }

  function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate) {
    return participantsController.getPersonalWorkCycleRangeForDate(startDateStr, referenceDate);
  }

  function getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd) {
    return participantsController.getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd);
  }

  function formatHourValue(hours) {
    return participantsController.formatHourValue(hours);
  }

  function formatWonAmount(value) {
    return participantsController.formatWonAmount(value);
  }

  function renderMyWorkshopUsagePanel() {
    return participantsController.renderMyWorkshopUsagePanel();
  }

  function renderEventPersonalUserInfo() {
    return participantsController.renderEventPersonalUserInfo();
  }

  function getEventUsersByKind(kind) {
    return participantsController.getEventUsersByKind(kind);
  }

  function loadStudioInstructors() {
    return participantsController.loadStudioInstructors();
  }

  function populateInstructorOptions(selectId, selected) {
    return participantsController.populateInstructorOptions(selectId, selected);
  }

  function getEventClassMetadataForDate(eventItem, occurrenceDate) {
    const rule = getClassBaseRuleForRange(occurrenceDate, eventItem.start, eventItem.end);
    return {
      classType: String(rule?.className || eventItem.classType || '수업시간'),
      instructor: String(rule?.instructor || eventItem.instructor || '').trim(),
      baseRuleId: String(rule?.id || eventItem.baseRuleId || '')
    };
  }

  function rebuildClassTeachingLog() {
    state.classTeachingLog = globalThis.MasterCalendarScheduleProjections.buildClassTeachingLog({
      events: state.events,
      now: new Date(),
      getEventClassMetadataForDate,
      formatDateInput,
      addDays,
      expandOccurrences(options) {
        return globalThis.MasterCalendarOccurrences.expandOccurrences(options);
      }
    });
  }

  function populateEventUserOptions(selected, selectId = 'event-user', forcedKind) {
    return participantsController.populateEventUserOptions(selected, selectId, forcedKind);
  }

  function handleEventUserSelectChange() {
    return participantsController.handleEventUserSelectChange();
  }

  function handleQuickEditUserSelectChange() {
    return participantsController.handleQuickEditUserSelectChange();
  }

  function syncEventInputMode() {
    return eventModalController.syncEventInputMode();
  }

  function syncEventSelectionFromInputs() {
    return eventModalController.syncEventSelectionFromInputs();
  }

  function renderEventSelectorGrid() {
    return eventModalController.renderEventSelectorGrid();
  }

  function renderEventSelectorBubbles(stage, grid, weekStart) {
    return eventModalController.renderEventSelectorBubbles(stage, grid, weekStart);
  }

  function startEventSelection(event, dayIndex, slot) {
    return eventModalController.startEventSelection(event, dayIndex, slot);
  }

  function moveEventSelection(dayIndex, slot) {
    return eventModalController.moveEventSelection(dayIndex, slot);
  }

  function endEventSelection(dayIndex, slot) {
    return eventModalController.endEventSelection(dayIndex, slot);
  }

  function clearEventSelectionMoveTimer() {
    return eventModalController.clearEventSelectionMoveTimer();
  }

  function getEventSelectionResizeEdge(event, dayIndex, slot) {
    return eventModalController.getEventSelectionResizeEdge(event, dayIndex, slot);
  }

  function applyEventSelection(dayIndex, startSlot, endSlot, silent) {
    return eventModalController.applyEventSelection(dayIndex, startSlot, endSlot, silent);
  }

  function getEventSelectorWeekStartDate() {
    return eventModalController.getEventSelectorWeekStartDate();
  }

  function getEventSelectorDateForDay(dayIndex) {
    return eventModalController.getEventSelectorDateForDay(dayIndex);
  }

  function isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot) {
    const weekStart = getEventSelectorWeekStartDate() || state.weekStart;
    return globalThis.MasterCalendarOccupancy.isPlacementAllowed({
      kind,
      dayIndex,
      startSlot,
      endSlot,
      rules: getRulesForWeek(weekStart),
      isAllDayKind
    });
  }

  function getBlockCapacityLabel(rule, dayOcc) {
    return eventModalController.getBlockCapacityLabel(rule, dayOcc);
  }

  function renderBaseEditorGrid(...args) {
    return baseEditorController.renderBaseEditorGrid(...args);
  }

  function onBaseCellMouseDown(...args) {
    return baseEditorController.onBaseCellMouseDown(...args);
  }

  function onBaseCellMouseEnter(...args) {
    return baseEditorController.onBaseCellMouseEnter(...args);
  }

  function onBaseCellMouseUp(...args) {
    return baseEditorController.onBaseCellMouseUp(...args);
  }

  function clearMoveTimer(...args) {
    return baseEditorController.clearMoveTimer(...args);
  }

  function handleBaseEditorGlobalMouseUp(...args) {
    return baseEditorController.handleBaseEditorGlobalMouseUp(...args);
  }

  function handleBaseEditorGlobalMouseMove(...args) {
    return baseEditorController.handleBaseEditorGlobalMouseMove(...args);
  }

  function handleBaseEditorUndoShortcut(...args) {
    return baseEditorController.handleBaseEditorUndoShortcut(...args);
  }

  function isBaseModalOpen(...args) {
    return baseEditorController.isBaseModalOpen(...args);
  }

  function autoScrollBaseEditor(...args) {
    return baseEditorController.autoScrollBaseEditor(...args);
  }

  function syncPointerDrivenPreview(...args) {
    return baseEditorController.syncPointerDrivenPreview(...args);
  }

  function getPointerTargetDaySlot(...args) {
    return baseEditorController.getPointerTargetDaySlot(...args);
  }

  function getActiveBaseGrid(...args) {
    return baseEditorController.getActiveBaseGrid(...args);
  }

  function finalizeBaseMove(...args) {
    return baseEditorController.finalizeBaseMove(...args);
  }

  function resetMoveState(...args) {
    return baseEditorController.resetMoveState(...args);
  }

  function getResizeEdgeFromEvent(...args) {
    return baseEditorController.getResizeEdgeFromEvent(...args);
  }

  function handleBaseGridHoverCursor(...args) {
    return baseEditorController.handleBaseGridHoverCursor(...args);
  }

  function clearBaseGridHoverCursor(...args) {
    return baseEditorController.clearBaseGridHoverCursor(...args);
  }

  function handleEventSelectorHoverCursor(event) {
    return eventModalController.handleEventSelectorHoverCursor(event);
  }

  function clearEventSelectorHoverCursor() {
    return eventModalController.clearEventSelectorHoverCursor();
  }

  function startBaseResize(...args) {
    return baseEditorController.startBaseResize(...args);
  }

  function updateBaseResizePreview(...args) {
    return baseEditorController.updateBaseResizePreview(...args);
  }

  function finalizeBaseResize(...args) {
    return baseEditorController.finalizeBaseResize(...args);
  }

  function resetBaseResizeState(...args) {
    return baseEditorController.resetBaseResizeState(...args);
  }

  function showResizeGhost(...args) {
    return baseEditorController.showResizeGhost(...args);
  }

  function updateResizeGhost(...args) {
    return baseEditorController.updateResizeGhost(...args);
  }

  function removeResizeGhost(...args) {
    return baseEditorController.removeResizeGhost(...args);
  }

  function hideOriginRuleCells(...args) {
    return baseEditorController.hideOriginRuleCells(...args);
  }

  function clearOriginRuleCells(...args) {
    return baseEditorController.clearOriginRuleCells(...args);
  }

  function showMoveGhost(...args) {
    return baseEditorController.showMoveGhost(...args);
  }

  function updateMoveGhost(...args) {
    return baseEditorController.updateMoveGhost(...args);
  }

  function removeMoveGhost(...args) {
    return baseEditorController.removeMoveGhost(...args);
  }

  function clearMovePreview(...args) {
    return baseEditorController.clearMovePreview(...args);
  }

  function startBaseDrag(...args) {
    return baseEditorController.startBaseDrag(...args);
  }

  function moveBaseDrag(...args) {
    return baseEditorController.moveBaseDrag(...args);
  }

  function endBaseDrag(...args) {
    return baseEditorController.endBaseDrag(...args);
  }

  function finalizeBaseAdd(...args) {
    return baseEditorController.finalizeBaseAdd(...args);
  }

  function cancelBaseDrag(...args) {
    return baseEditorController.cancelBaseDrag(...args);
  }

  function showAddGhost(...args) {
    return baseEditorController.showAddGhost(...args);
  }

  function updateAddGhost(...args) {
    return baseEditorController.updateAddGhost(...args);
  }

  function removeAddGhost(...args) {
    return baseEditorController.removeAddGhost(...args);
  }

  function getBaseEditorWeekStart() {
    return baseTransactionController.getBaseEditorWeekStart();
  }

  function getBaseWeekKey(weekStartDate) {
    return baseRulesDomain.getBaseWeekKey(weekStartDate);
  }

  function cloneBaseWeekOverrides(overrides) {
    return baseTransactionController.cloneBaseWeekOverrides(overrides);
  }

  function cloneBaseRuleTimeline(timeline) {
    return baseRulesDomain.cloneBaseRuleTimeline(timeline);
  }

  function normalizeBaseRule(rule) {
    return baseRulesDomain.normalizeBaseRule(rule);
  }

  function getRulesForWeek(weekStartDate) {
    return baseRulesDomain.getRulesForWeek(weekStartDate);
  }

  function hasWeekOverride(weekStartDate) {
    return baseRulesDomain.hasWeekOverride(weekStartDate);
  }

  function ensureWeekOverrideRules(weekStartDate) {
    return baseRulesDomain.ensureWeekOverrideRules(weekStartDate);
  }

  function getRulesByScope(scope, weekStartDate) {
    return baseRulesDomain.getRulesByScope(scope, weekStartDate);
  }

  function getBaseEditScope() {
    return baseTransactionController.getBaseEditScope();
  }

  function isEditFromCurrentWeekEnabled() {
    return baseTransactionController.isEditFromCurrentWeekEnabled();
  }

  function getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot) {
    return baseRulesDomain.getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot);
  }

  function getTemplateRulesForWeek(weekStartDate) {
    return baseRulesDomain.getTemplateRulesForWeek(weekStartDate);
  }

  function setTemplateRulesForWeekFrom(weekStartDate, nextRules) {
    return baseRulesDomain.setTemplateRulesForWeekFrom(weekStartDate, nextRules);
  }

  function normalizeTemplateTimeline() {
    return baseRulesDomain.normalizeTemplateTimeline();
  }

  function reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey) {
    return baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
  }

  function getRuleComparableSignature(rule) {
    return baseRulesDomain.getRuleComparableSignature(rule);
  }

  function areRuleSetsEquivalent(left, right) {
    return baseRulesDomain.areRuleSetsEquivalent(left, right);
  }

  function requestBaseEventFollowChoice(affectedCount, onResolve) {
    return baseTransactionController.requestBaseEventFollowChoice(affectedCount, onResolve);
  }

  function resolveBaseEventFollowPrompt(choice) {
    return baseTransactionController.resolveBaseEventFollowPrompt(choice);
  }

  function executeBaseChangeWithScopeAndEventPrompt(scopeOrResolver, buildPayload, applyChange) {
    return baseTransactionController.executeBaseChangeWithScopeAndEventPrompt(
      scopeOrResolver,
      buildPayload,
      applyChange
    );
  }

  function withBaseScope(scopeOrResolver, mutationFn) {
    return baseTransactionController.withBaseScope(scopeOrResolver, mutationFn);
  }

  function getEditableBaseRulesForAllMode(weekStartDate) {
    return baseTransactionController.getEditableBaseRulesForAllMode(weekStartDate);
  }

  function resetBaseApplyWeeklyCheckbox() {
    return baseTransactionController.resetBaseApplyWeeklyCheckbox();
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return baseRulesDomain.rangesOverlap(startA, endA, startB, endB);
  }

  function collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate) {
    return baseTransactionController.collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate);
  }

  function buildBaseEventMovePlan(affectedEvents, dayShift, slotShift) {
    return baseTransactionController.buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
  }

  function applyBaseEventMovePlan(movePlan) {
    return baseTransactionController.applyBaseEventMovePlan(movePlan);
  }

  function createBaseRuleId() {
    return baseTransactionController.createBaseRuleId();
  }

  function applyMovedRuleOverride(targetRules, movedRule) {
    return baseRulesDomain.applyMovedRuleOverride(targetRules, movedRule);
  }

  function applyBaseRule(day, startSlot, endSlot) {
    return baseTransactionController.applyBaseRule(day, startSlot, endSlot);
  }

  function getRuleForSlotFromRules(rules, day, slot) {
    let resolved = null;
    (rules || []).forEach((rule) => {
      if (rule.day === day && slot >= rule.startSlot && slot < rule.endSlot) {
        resolved = rule;
      }
    });
    return resolved;
  }

  function getBaseEditorDisplayRules() {
    // Keep the visible week stable regardless of edit mode; toggle should change scope, not current view.
    return getRulesForWeek(getBaseEditorWeekStart());
  }

  function getBaseRuleForSlot(day, slot, weekStartDate) {
    const rules = getRulesForWeek(weekStartDate || state.weekStart);
    return getRuleForSlotFromRules(rules, day, slot);
  }

  function getBaseLabelText(rule) {
    return displayPolicy.getBaseLabelText(rule);
  }

  function isBaseLabelStart(day, slot, rule, weekStartDate) {
    if (!rule) return false;
    if (slot === 0) return true;

    const prevRule = getBaseRuleForSlot(day, slot - 1, weekStartDate || state.weekStart);
    if (!prevRule) return true;
    if (prevRule.id !== rule.id) return true;
    return false;
  }

  function getBaseTypeForSlot(day, slot, weekStartDate) {
    const rule = getBaseRuleForSlot(day, slot, weekStartDate || state.weekStart);
    return rule ? rule.type : '';
  }

  function baseTypeToClass(type) {
    return displayPolicy.baseTypeToClass(type);
  }

  function kindToClass(kind) {
    return displayPolicy.kindToClass(kind);
  }

  function isExhibitionKind(kind) {
    return displayPolicy.isExhibitionKind(kind);
  }

  function isAllDayKind(kind) {
    return displayPolicy.isAllDayKind(kind);
  }

  function getAllDayPriority(kind) {
    return displayPolicy.getAllDayPriority(kind);
  }

  function isKilnKind(kind) {
    return displayPolicy.isKilnKind(kind);
  }

  function normalizeKilnCategory(value) {
    return displayPolicy.normalizeKilnCategory(value, KILN_CATEGORY_OPTIONS);
  }

  function extractKilnCategoryFromTitle(title) {
    return displayPolicy.extractKilnCategoryFromTitle(title, KILN_CATEGORY_OPTIONS);
  }

  function buildKilnEventTitle(category) {
    return displayPolicy.buildKilnEventTitle(category, KILN_CATEGORY_OPTIONS);
  }

  function getEventDisplayTitle(eventItem, fallbackTitle) {
    return displayPolicy.getEventDisplayTitle(eventItem, fallbackTitle, KILN_CATEGORY_OPTIONS);
  }

  const baseEditController = globalThis.MasterCalendarBaseEditController.create({
    document,
    state,
    loadStudioInstructors,
    populateInstructorOptions,
    slotToTime,
    timeToSlot,
    openModal,
    closeModal,
    alert: (message) => alert(message),
    confirm: (message) => confirm(message),
    getBaseEditorWeekStart,
    getRulesForWeek,
    getBaseEditScope,
    executeBaseChangeWithScopeAndEventPrompt,
    collectBaseRangeEventOccurrences,
    buildBaseEventMovePlan,
    getEditableBaseRulesForAllMode,
    getRulesByScope,
    applyMovedRuleOverride,
    applyBaseEventMovePlan,
    withBaseScope,
    getBaseWeekKey
  });

  const baseEditorController = globalThis.MasterCalendarBaseEditorController.create({
    document,
    state,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timerId) => clearTimeout(timerId),
    SLOTS_PER_DAY,
    BASE_EDITOR_START_SLOT,
    HOLD_TO_MOVE_MS,
    BASE_EDITOR_SCROLL_EDGE_PX,
    BASE_EDITOR_SCROLL_STEP,
    BASE_RESIZE_EDGE_PX,
    DAY_NAMES,
    getBaseEditorWeekStart,
    getBaseEditorDisplayRules,
    getRuleForSlotFromRules,
    getBaseLabelText,
    baseTypeToClass,
    formatMonthDate,
    addDays,
    slotToTime,
    isSameCalendarDate,
    isBaseCreateControlsVisible,
    applyBaseRule,
    getBaseEditScope,
    executeBaseChangeWithScopeAndEventPrompt,
    collectBaseRangeEventOccurrences,
    buildBaseEventMovePlan,
    getEditableBaseRulesForAllMode,
    getRulesByScope,
    applyMovedRuleOverride,
    applyBaseEventMovePlan,
    openBaseEditModal,
    undoBaseChange,
    clearEventSelectionMoveTimer,
    alert: (message) => alert(message),
    escapeHtml
  });

  function syncBaseClassNameVisibility() {
    baseEditController.syncBaseClassNameVisibility();
  }

  function syncEditBaseClassNameVisibility() {
    baseEditController.syncEditBaseClassNameVisibility();
  }

  function openBaseEditModal(rule) {
    baseEditController.openBaseEditModal(rule);
  }

  function saveBaseEditFromModal() {
    baseEditController.saveBaseEditFromModal();
  }

  function deleteBaseEditFromModal() {
    baseEditController.deleteBaseEditFromModal();
  }

  function cloneBaseRules(rules) {
    return baseRulesDomain.cloneBaseRules(rules);
  }

  function cloneEventsForUndo(events) {
    return baseTransactionController.cloneEventsForUndo(events);
  }

  function pushBaseUndoState() {
    return baseTransactionController.pushBaseUndoState();
  }

  function undoBaseChange() {
    return baseTransactionController.undoBaseChange();
  }

  function updateUndoButtonState() {
    return baseTransactionController.updateUndoButtonState();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  const stateController = globalThis.MasterCalendarStateController.create({
    state,
    repository: globalThis.MasterCalendarRepository.repository,
    normalizeBaseRule,
    isKilnKind,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    buildKilnEventTitle,
    loadStudioInstructors,
    rebuildClassTeachingLog,
    now: () => Date.now(),
    random: () => Math.random()
  });

  function saveState() {
    return stateController.saveState();
  }

  function loadState() {
    return stateController.loadState();
  }

  function getWeekStart(date) {
    return globalThis.MasterCalendarDateTime.getWeekStart(date);
  }

  function getMonthStart(date) {
    return globalThis.MasterCalendarDateTime.getMonthStart(date);
  }

  function addDays(date, diff) {
    return globalThis.MasterCalendarDateTime.addDays(date, diff);
  }

  function addMonths(date, diff) {
    return globalThis.MasterCalendarDateTime.addMonths(date, diff);
  }

  function slotToTime(slot) {
    return globalThis.MasterCalendarDateTime.slotToTime(slot);
  }

  function timeToSlot(timeStr) {
    return globalThis.MasterCalendarDateTime.timeToSlot(timeStr);
  }

  function formatDateInput(date) {
    return globalThis.MasterCalendarDateTime.formatDateInput(date);
  }

  function formatDateDisplay(date) {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatMonthDate(date) {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function isSameCalendarDate(left, right) {
    if (!(left instanceof Date) || !(right instanceof Date)) return false;
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function startMasterCalendarPage() {
    if (studioPageStartupStarted) return;
    studioPageStartupStarted = true;
    initializeStudioPage().then(resolveMasterCalendarReady, rejectMasterCalendarReady);
  }

  if (document.getElementById('calendar-body')) {
    startMasterCalendarPage();
  }
})();
