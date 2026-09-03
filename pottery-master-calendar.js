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

  document.addEventListener('DOMContentLoaded', () => {
    initializeStudioPage();
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (!keys.length) return;

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
  }

  function startWorkshopUsageTicker() {
    setInterval(() => {
      renderMyWorkshopUsagePanel();
      renderEventPersonalUserInfo();
    }, 60 * 1000);
  }

  function setCalendarToToday() {
    const now = new Date();
    state.weekStart = getWeekStart(now);
    state.monthStart = getMonthStart(now);
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
    const mobileInfoToggleBtn = document.getElementById('mobile-info-toggle-btn');
    if (mobileInfoToggleBtn) {
      mobileInfoToggleBtn.addEventListener('click', toggleMobileInfoPanels);
    }

    document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
      setCalendarZoom(state.calendarZoom + CALENDAR_ZOOM_STEP);
    });

    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
      setCalendarZoom(state.calendarZoom - CALENDAR_ZOOM_STEP);
    });

    document.getElementById('prev-week-btn').addEventListener('click', () => {
      shiftCurrentRange(-1);
      renderAll();
    });

    document.getElementById('next-week-btn').addEventListener('click', () => {
      shiftCurrentRange(1);
      renderAll();
    });

    document.getElementById('week-view-btn').addEventListener('click', () => {
      setViewMode('week');
      renderAll();
    });

    document.getElementById('month-view-btn').addEventListener('click', () => {
      setViewMode('month');
      renderAll();
    });

    document.getElementById('go-today-btn').addEventListener('click', () => {
      setCalendarToToday();
      renderAll();
    });

    document.getElementById('open-add-event-btn').addEventListener('click', () => {
      if (!isStudioAdmin() && !isStudioInstructor() && !isStudioArtist()) {
        return;
      }
      if (isStudioArtist() && !isArtistRegisteredForPersonalWork()) {
        alert('개인작업 일정은 개인작업 관리에 등록된 이용자만 생성할 수 있습니다. 먼저 개인작업 관리 페이지에 본인을 추가해주세요.');
        return;
      }
      openEventModal();
    });

    document.getElementById('open-base-editor-btn').addEventListener('click', () => {
      if (!isStudioAdmin()) {
        return;
      }
      openModal('base-modal');
      state.baseEditorWeekStart = getWeekStart(state.weekStart || new Date());
      state.baseEditMode = 'base';
      document.getElementById('base-type').value = '';
      document.getElementById('base-class-name').value = '';
      document.getElementById('base-instructor').value = '';
      document.getElementById('base-apply-weekly').checked = false;
      document.getElementById('base-edit-from-current-week').checked = false;
      setBaseCreateControlsVisible(false);
      loadStudioInstructors();
      populateInstructorOptions('base-instructor');
      renderBaseEditorGrid({ forceDefaultViewport: true });
      renderBaseEditorWeekLabel();
      renderBaseEditModeToggle();
      syncBaseClassNameVisibility();
      updateUndoButtonState();
    });

    document.getElementById('base-add-block-btn').addEventListener('click', () => {
      setBaseCreateControlsVisible(true);
      document.getElementById('base-type')?.focus();
    });

    document.getElementById('base-cancel-add-block-btn').addEventListener('click', () => {
      setBaseCreateControlsVisible(false);
    });

    document.getElementById('base-prev-week-btn').addEventListener('click', () => {
      state.baseEditorWeekStart = addDays(getBaseEditorWeekStart(), -7);
      state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
      renderBaseEditorWeekLabel();
      renderBaseEditModeToggle();
      renderBaseEditorGrid({ forceDefaultViewport: true });
      updateUndoButtonState();
    });

    document.getElementById('base-next-week-btn').addEventListener('click', () => {
      state.baseEditorWeekStart = addDays(getBaseEditorWeekStart(), 7);
      state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
      renderBaseEditorWeekLabel();
      renderBaseEditModeToggle();
      renderBaseEditorGrid({ forceDefaultViewport: true });
      updateUndoButtonState();
    });

    document.getElementById('base-go-today-btn').addEventListener('click', () => {
      state.baseEditorWeekStart = getWeekStart(new Date());
      state.baseEditMode = hasWeekOverride(state.baseEditorWeekStart) ? 'week' : 'base';
      renderBaseEditorWeekLabel();
      renderBaseEditModeToggle();
      renderBaseEditorGrid({ forceDefaultViewport: true });
      updateUndoButtonState();
    });

    document.getElementById('base-edit-mode-switch').addEventListener('change', (event) => {
      if (hasWeekOverride(getBaseEditorWeekStart())) {
        state.baseEditMode = 'week';
        renderBaseEditModeToggle();
        renderBaseEditorGrid();
        updateUndoButtonState();
        return;
      }
      const checked = Boolean(event?.target?.checked);
      state.baseEditMode = checked ? 'week' : 'base';
      renderBaseEditModeToggle();
      renderBaseEditorGrid();
      updateUndoButtonState();
    });

    document.getElementById('save-event-btn').addEventListener('click', saveEventFromModal);
    document.getElementById('save-event-quick-edit-btn').addEventListener('click', saveQuickEditEventFromModal);
    document.getElementById('delete-recurring-one-btn').addEventListener('click', handleDeleteRecurringOne);
    document.getElementById('delete-recurring-following-btn').addEventListener('click', handleDeleteRecurringFollowing);
    document.getElementById('delete-recurring-cancel-btn').addEventListener('click', () => closeModal('recurring-delete-modal'));
    document.getElementById('move-recurring-one-btn').addEventListener('click', handleMoveRecurringOne);
    document.getElementById('move-recurring-following-btn').addEventListener('click', handleMoveRecurringFollowing);
    document.getElementById('move-recurring-cancel-btn').addEventListener('click', () => {
      resetRecurringMoveState();
      closeModal('recurring-move-modal');
    });
    document.getElementById('delete-confirm-ok-btn').addEventListener('click', handleDeleteConfirmOk);
    document.getElementById('delete-confirm-cancel-btn').addEventListener('click', () => closeModal('delete-confirm-modal'));
    document.getElementById('event-kind').addEventListener('change', () => {
      const kindSelect = document.getElementById('event-kind');
      const nextKind = String(kindSelect?.value || '').trim();
      if (!canUseEventKindByRole(nextKind)) {
        if (isStudioArtist() && kindSelect) {
          kindSelect.value = '개인작업';
        } else if (isStudioInstructor() && kindSelect) {
          kindSelect.value = '수강';
        }
      }
      resetEventSelectionState();
      syncEventInputMode();
      renderEventSelectorGrid();
    });
    document.getElementById('event-date').addEventListener('change', () => {
      syncEventSelectionFromInputs();
      renderEventPersonalUserInfo();
      renderEventSelectorGrid();
    });
    document.getElementById('event-range-start').addEventListener('change', () => {
      renderEventSelectorGrid();
    });
    document.getElementById('event-range-end').addEventListener('change', () => {
      renderEventSelectorGrid();
    });
    document.getElementById('event-user').addEventListener('change', handleEventUserSelectChange);
    document.getElementById('quick-edit-user').addEventListener('change', handleQuickEditUserSelectChange);
    document.getElementById('event-title').addEventListener('input', () => {
      renderEventSelectorGrid();
    });
    document.getElementById('event-capacity').addEventListener('change', () => {
      renderEventSelectorGrid();
    });
    document.getElementById('event-start').addEventListener('change', syncEventSelectionFromInputs);
    document.getElementById('event-end').addEventListener('change', syncEventSelectionFromInputs);
    document.getElementById('base-type').addEventListener('change', syncBaseClassNameVisibility);
    document.getElementById('edit-base-type').addEventListener('change', syncEditBaseClassNameVisibility);
    document.getElementById('save-base-edit-btn').addEventListener('click', saveBaseEditFromModal);
    document.getElementById('delete-base-edit-btn').addEventListener('click', deleteBaseEditFromModal);
    document.getElementById('base-event-follow-yes-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('yes'));
    document.getElementById('base-event-follow-no-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('no'));
    document.getElementById('base-event-follow-cancel-btn').addEventListener('click', () => resolveBaseEventFollowPrompt('cancel'));
    document.getElementById('undo-base-btn').addEventListener('click', undoBaseChange);
    document.addEventListener('mouseup', handleBaseEditorGlobalMouseUp);
    document.addEventListener('mousemove', handleBaseEditorGlobalMouseMove);
    document.addEventListener('pointermove', handleMasterCalendarPointerMove);
    document.addEventListener('pointerup', handleMasterCalendarPointerUp);
    document.addEventListener('pointercancel', handleMasterCalendarPointerCancel);
    document.addEventListener('keydown', handleBaseEditorUndoShortcut);

    const baseGridRoot = document.getElementById('base-editor-grid');
    if (baseGridRoot) {
      baseGridRoot.addEventListener('mousemove', handleBaseGridHoverCursor);
      baseGridRoot.addEventListener('mouseleave', clearBaseGridHoverCursor);
    }

    const eventSelectorRoot = document.getElementById('event-selector-grid');
    if (eventSelectorRoot) {
      eventSelectorRoot.addEventListener('mousemove', handleEventSelectorHoverCursor);
      eventSelectorRoot.addEventListener('mouseleave', clearEventSelectorHoverCursor);
    }

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });

    document.querySelectorAll('.studio-modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          if (modal.id === 'base-event-follow-modal') {
            resolveBaseEventFollowPrompt('cancel');
            return;
          }
          closeModal(modal.id);
        }
      });
    });

    window.addEventListener('resize', syncCalendarHeaderScrollbarGap);
    window.addEventListener('resize', syncMobileInfoPanelsState);

    applyStudioRoleUiLocks();
    syncMobileInfoPanelsState();
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
    const zoom = Number(state.calendarZoom);
    if (!Number.isFinite(zoom)) return 1;
    return Math.max(MIN_CALENDAR_ZOOM, Math.min(MAX_CALENDAR_ZOOM, zoom));
  }

  function applyCalendarZoomStyles() {
    const viewport = document.getElementById('calendar-viewport');
    if (!viewport) return;
    const zoom = getCalendarZoomFactor();
    viewport.style.zoom = String(zoom);
    viewport.style.transformOrigin = 'top left';
  }

  function setCalendarZoom(nextZoom) {
    const numeric = Number(nextZoom);
    if (!Number.isFinite(numeric)) return;
    state.calendarZoom = Math.max(MIN_CALENDAR_ZOOM, Math.min(MAX_CALENDAR_ZOOM, Math.round(numeric * 10) / 10));
    updateCalendarZoomButtons();
    renderCalendar();
  }

  function updateCalendarZoomButtons() {
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (!zoomInBtn || !zoomOutBtn) return;
    zoomInBtn.disabled = state.calendarZoom >= MAX_CALENDAR_ZOOM;
    zoomOutBtn.disabled = state.calendarZoom <= MIN_CALENDAR_ZOOM;
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
    const prevBtn = document.getElementById('prev-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    const labelEl = document.getElementById('week-label');
    if (!prevBtn || !nextBtn || !labelEl) return;

    if (state.viewMode === 'month') {
      prevBtn.textContent = '이전 달';
      nextBtn.textContent = '다음 달';
      labelEl.textContent = `${state.monthStart.getFullYear()}년 ${String(state.monthStart.getMonth() + 1).padStart(2, '0')}월`;
      return;
    }

    prevBtn.textContent = '이전 주';
    nextBtn.textContent = '다음 주';
    const start = state.weekStart;
    const end = addDays(start, 6);
    labelEl.textContent = `${formatDateDisplay(start)} ~ ${formatDateDisplay(end)}`;
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
    if (mode !== 'week' && mode !== 'month') return;
    state.viewMode = mode;
    if (mode === 'week') {
      state.weekStart = getWeekStart(state.weekStart || new Date());
      return;
    }
    state.monthStart = getMonthStart(state.weekStart || state.monthStart || new Date());
    state.weekStart = getWeekStart(state.monthStart);
  }

  function shiftCurrentRange(direction) {
    if (state.viewMode === 'month') {
      state.monthStart = addMonths(state.monthStart, direction);
      state.weekStart = getWeekStart(state.monthStart);
      return;
    }
    state.weekStart = addDays(state.weekStart, direction * 7);
  }

  function syncViewToggleButtons() {
    const weekBtn = document.getElementById('week-view-btn');
    const monthBtn = document.getElementById('month-view-btn');
    if (!weekBtn || !monthBtn) return;
    const isWeek = state.viewMode === 'week';
    weekBtn.classList.toggle('is-active', isWeek);
    monthBtn.classList.toggle('is-active', !isWeek);
  }

  function renderCalendar() {
    const dayHeader = document.getElementById('calendar-day-header');
    const body = document.getElementById('calendar-body');
    const wrap = body ? body.closest('.studio-calendar-wrap') : null;
    applyCalendarZoomStyles();
    if (state.viewMode === 'month') {
      renderMonthCalendar(dayHeader, body, wrap);
      return;
    }
    renderWeekCalendar(dayHeader, body, wrap);
  }

  let weekView = null;
  let monthView = null;
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
        getMasterPointerDaySlot,
        getBaseRuleForSlot,
        buildMasterEditOccupancySnapshot,
        formatDateInput,
        addDays,
        slotToTime,
        canManageEventPlacementByRole,
        isEventPlacementAllowed,
        getMasterEditOccupancyMap,
        canPlaceInLane,
        findLane,
        resetMasterCreateState,
        finalizeMasterCalendarEdit,
        renderCalendar
      });
    }
    return pointerController;
  }

  function renderWeekCalendar(dayHeader, body, wrap) {
    if (!weekView) {
      weekView = globalThis.MasterCalendarWeekView.create({
        document,
        state,
        dayNames: DAY_NAMES,
        slotHeight: SLOT_HEIGHT,
        slotsPerDay: SLOTS_PER_DAY,
        allDayRowHeight: ALL_DAY_ROW_HEIGHT,
        addDays,
        formatMonthDate,
        isSameCalendarDate,
        formatDateInput,
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
        startMasterEventEdit,
        syncCalendarHeaderScrollbarGap
      });
    }
    weekView.render(dayHeader, body, wrap);
  }

  function renderMonthCalendar(dayHeader, body, wrap) {
    if (!monthView) {
      monthView = globalThis.MasterCalendarMonthView.create({
        document,
        state,
        dayNames: DAY_NAMES,
        monthRows: MONTH_ROWS,
        monthRowHeight: MONTH_ROW_HEIGHT,
        getWeekStart,
        addDays,
        formatDateInput,
        isSameCalendarDate,
        isExhibitionKind,
        getEventsForDate,
        isAllDayKind,
        timeToSlot,
        kindToClass,
        getEventDisplayTitle,
        canManageEventOccurrence,
        setRoleLockedMessage,
        openQuickEditEventModal,
        syncCalendarHeaderScrollbarGap
      });
    }
    monthView.render(dayHeader, body, wrap);
  }

  function syncCalendarHeaderScrollbarGap() {
    const body = document.getElementById('calendar-body');
    if (!body) return;
    const wrap = body.closest('.studio-calendar-wrap');
    if (!wrap) return;
    if (state.viewMode === 'month') {
      wrap.style.setProperty('--calendar-scrollbar-gap', '0px');
      return;
    }
    const scrollbarGap = Math.max(0, body.offsetWidth - body.clientWidth);
    wrap.style.setProperty('--calendar-scrollbar-gap', `${scrollbarGap}px`);
  }

  function startMasterCreate(event, dayIndex, slot, baseRule) {
    if (event && event.button !== 0) return;
    if (state.masterEdit.active) return;
    const type = String(baseRule?.type || '');
    if (!type) return;
    if (!canCreateFromBaseRule(baseRule)) {
      if (event) event.preventDefault();
      return;
    }

    if (event) {
      event.preventDefault();
    }

    if (type === '수업시간' && baseRule) {
      state.masterCreate.active = true;
      state.masterCreate.mode = 'class';
      state.masterCreate.dayIndex = dayIndex;
      state.masterCreate.anchorSlot = Number(baseRule.startSlot);
      state.masterCreate.startSlot = Number(baseRule.startSlot);
      state.masterCreate.endSlot = Number(baseRule.endSlot);
      return;
    }

    if (type.includes('개인작업')) {
      state.masterCreate.active = true;
      state.masterCreate.mode = 'personal';
      state.masterCreate.dayIndex = dayIndex;
      state.masterCreate.anchorSlot = slot;
      state.masterCreate.startSlot = slot;
      state.masterCreate.endSlot = slot + 1;
      updateMasterCreatePreview();
    }
  }

  function moveMasterCreate(dayIndex, slot) {
    if (!state.masterCreate.active) return;
    if (state.masterCreate.mode !== 'personal') return;
    if (state.masterCreate.dayIndex !== dayIndex) return;

    const rule = getBaseRuleForSlot(dayIndex, slot, state.weekStart);
    const type = String(rule?.type || '');
    if (!type.includes('개인작업')) return;

    const anchor = Number(state.masterCreate.anchorSlot);
    state.masterCreate.startSlot = Math.min(anchor, slot);
    state.masterCreate.endSlot = Math.max(anchor, slot) + 1;
    updateMasterCreatePreview();
  }

  function finalizeMasterCreate() {
    if (!state.masterCreate.active) return;

    const dayIndex = Number(state.masterCreate.dayIndex);
    const startSlot = Number(state.masterCreate.startSlot);
    const endSlot = Number(state.masterCreate.endSlot);
    const mode = state.masterCreate.mode;

    resetMasterCreateState();

    if (!Number.isInteger(dayIndex) || endSlot <= startSlot) return;
    const date = formatDateInput(addDays(state.weekStart, dayIndex));

    if (mode === 'class') {
      openEventModal({
        date,
        start: slotToTime(startSlot),
        end: slotToTime(endSlot),
        kind: '수강'
      });
      return;
    }

    if (mode === 'personal') {
      openEventModal({
        date,
        start: slotToTime(startSlot),
        end: slotToTime(endSlot),
        kind: '개인작업'
      });
    }
  }

  function resetMasterCreateState() {
    removeMasterCreatePreview();
    state.masterCreate.active = false;
    state.masterCreate.mode = '';
    state.masterCreate.dayIndex = null;
    state.masterCreate.anchorSlot = null;
    state.masterCreate.startSlot = null;
    state.masterCreate.endSlot = null;
    state.masterCreate.overlayEl = null;
    state.masterCreate.previewEl = null;
  }

  function updateMasterCreatePreview() {
    if (!state.masterCreate.active || state.masterCreate.mode !== 'personal') {
      removeMasterCreatePreview();
      return;
    }

    const overlay = state.masterCreate.overlayEl || document.querySelector('#calendar-body .events-overlay');
    if (!overlay) return;

    const dayIndex = Number(state.masterCreate.dayIndex);
    const startSlot = Number(state.masterCreate.startSlot);
    const endSlot = Number(state.masterCreate.endSlot);
    if (!Number.isInteger(dayIndex) || !Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) {
      removeMasterCreatePreview();
      return;
    }

    const date = formatDateInput(addDays(state.weekStart, dayIndex));
    const occupancy = buildDailyOccupancyMap(date);
    const lane = Math.max(0, findLane(occupancy, startSlot, endSlot, 1));

    let bubble = state.masterCreate.previewEl;
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'event-bubble kind-personal master-preview-bubble';
      bubble.innerHTML = '<strong>새 일정</strong>';
      state.masterCreate.previewEl = bubble;
    }

    bubble.style.top = `${startSlot * SLOT_HEIGHT + 1}px`;
    bubble.style.height = `${Math.max(SLOT_HEIGHT - 2, (endSlot - startSlot) * SLOT_HEIGHT - 2)}px`;
    bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
    bubble.style.width = `${((1 / 3) / 7) * 100}%`;

    if (!bubble.parentNode) {
      overlay.appendChild(bubble);
    }
  }

  function removeMasterCreatePreview() {
    const bubble = state.masterCreate.previewEl;
    if (bubble && bubble.parentNode) {
      bubble.parentNode.removeChild(bubble);
    }
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
    if (state.masterEdit.active) {
      const edit = state.masterEdit;
      const editEventId = edit.eventId;
      const shouldOpenQuickEdit = Boolean(editEventId) && !edit.pointerMoved;

      if (edit.kind === '수강' && typeof clientX === 'number' && typeof clientY === 'number') {
        const pointer = getMasterPointerDaySlot(clientX, clientY);
        if (pointer) {
          const classRule = getBaseRuleForSlot(pointer.day, pointer.slot);
          if (classRule && classRule.type === '수업시간') {
            const snapStart = Number(classRule.startSlot);
            const snapEnd = Number(classRule.endSlot);
            const placement = getMasterEditPlacement(pointer.day, snapStart, snapEnd, {
              preferredLane: edit.originLane
            });
            if (placement) {
              edit.validPreview = true;
              edit.targetDayIndex = pointer.day;
              edit.targetStartSlot = snapStart;
              edit.targetEndSlot = snapEnd;
              edit.targetLane = placement.lane;
            } else {
              edit.validPreview = false;
            }
          } else {
            edit.validPreview = false;
          }
        }
      }

      const eventItem = state.events.find((item) => item.id === edit.eventId);
      if (eventItem && edit.validPreview) {
        const nextDate = formatDateInput(addDays(state.weekStart, edit.targetDayIndex));
        const nextStart = slotToTime(edit.targetStartSlot);
        const nextEnd = slotToTime(edit.targetEndSlot);
        const nextClassRule = eventItem.kind === '수강'
          ? getClassBaseRuleForRange(nextDate, nextStart, nextEnd)
          : null;
        const plan = globalThis.MasterCalendarCommands.planPointerEdit({
          edit,
          event: eventItem,
          viewMode: state.viewMode,
          originalDate: String(edit.occurrenceDate || formatDateInput(addDays(state.weekStart, edit.dayIndex || 0)) || ''),
          originalStart: slotToTime(Number(edit.startSlot || 0)),
          originalEnd: slotToTime(Number(edit.endSlot || 1)),
          target: {
            dayIndex: edit.targetDayIndex,
            startSlot: edit.targetStartSlot,
            endSlot: edit.targetEndSlot,
            date: nextDate,
            start: nextStart,
            end: nextEnd
          },
          nextClassRule
        });

        if (plan.action === 'prompt-recurring') {
          Object.assign(state.recurringMove, plan.recurringMove);

          resetMasterEditState();
          renderCalendar();
          openModal('recurring-move-modal');
          return;
        }

        if (plan.action === 'update') {
          Object.assign(eventItem, plan.patch);
          applyClassEventBaseMetadata(eventItem, nextDate);
          saveState();
        }
      }

      resetMasterEditState();
      renderCalendar();
      refreshWorkshopUsageUi();

      if (shouldOpenQuickEdit) {
        openQuickEditEventModal(editEventId, edit.occurrenceDate || '');
      }
      return;
    }

    if (state.masterCreate.active) {
      finalizeMasterCreate();
    }
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
    const pointed = document.elementFromPoint(clientX, clientY);
    const slotEl = pointed && typeof pointed.closest === 'function'
      ? pointed.closest('.day-slot')
      : null;

    if (slotEl) {
      const day = Number(slotEl.dataset.dayIndex);
      const slot = Number(slotEl.dataset.slot);
      if (Number.isInteger(day) && Number.isInteger(slot)) {
        return { day, slot };
      }
    }

    const body = document.getElementById('calendar-body');
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }

    const totalWidth = rect.width - 64;
    if (totalWidth <= 0) return null;

    const allDayRow = body.querySelector('.calendar-all-day-row');
    const allDayOffset = allDayRow ? allDayRow.offsetHeight : 0;

    const x = clientX - rect.left - 64;
    const y = clientY - rect.top + body.scrollTop - allDayOffset;
    const day = Math.max(0, Math.min(6, Math.floor((x / totalWidth) * 7)));
    const slot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(y / (SLOT_HEIGHT * getCalendarZoomFactor()))));
    return { day, slot };
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
    const snapshot = {};
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = formatDateInput(addDays(state.weekStart, dayIndex));
      snapshot[date] = createEmptyDailyOccupancy();
    }

    const bubbles = Array.from(document.querySelectorAll('#calendar-body .events-overlay .event-bubble[data-event-id]'));
    bubbles.forEach((bubble) => {
      const eventId = String(bubble?.dataset?.eventId || '');
      if (!eventId || (excludeEventId && eventId === excludeEventId)) return;

      const date = String(bubble?.dataset?.date || '').trim();
      if (!date || !snapshot[date]) return;

      const startSlot = Number(bubble?.dataset?.startSlot);
      const endSlot = Number(bubble?.dataset?.endSlot);
      const lane = Number(bubble?.dataset?.lane);
      const need = Math.max(1, Math.min(3, Number(bubble?.dataset?.need || 1)));

      if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) return;
      if (!canPlaceInLane(snapshot[date], startSlot, endSlot, need, lane)) return;

      markLaneOccupancy(snapshot[date], startSlot, endSlot, lane, need);
    });

    return snapshot;
  }

  function getMasterEditOccupancyMap(date) {
    const key = String(date || '').trim();
    const snapshot = state.masterEdit.occupancySnapshot;
    const saved = snapshot && snapshot[key];
    if (saved) {
      return cloneDailyOccupancy(saved);
    }
    return buildDailyOccupancyMap(key, state.masterEdit.eventId);
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
    const eventItem = state.events.find((item) => item && item.id === eventId);
    if (!eventItem) return;
    if (!canManageEventOccurrence(eventItem, occurrenceDate || eventItem.date || '')) {
      return;
    }

    if (eventItem.repeatWeekly && state.viewMode === 'week' && occurrenceDate) {
      state.recurringDelete.eventId = String(eventId);
      state.recurringDelete.occurrenceDate = String(occurrenceDate);
      openModal('recurring-delete-modal');
      return;
    }

    state.deleteConfirm.eventId = String(eventId);
    openModal('delete-confirm-modal');
  }

  function handleDeleteConfirmOk() {
    const eventId = String(state.deleteConfirm.eventId || '');
    if (!eventId) {
      closeModal('delete-confirm-modal');
      return;
    }

    state.events = state.events.filter((item) => item.id !== eventId);
    state.deleteConfirm.eventId = '';
    saveState();
    closeModal('delete-confirm-modal');
    renderCalendar();
    refreshWorkshopUsageUi();
  }

  function handleDeleteRecurringOne() {
    applyRecurringDeletePlan('one');
  }

  function handleDeleteRecurringFollowing() {
    const eventId = String(state.recurringDelete.eventId || '');
    const occurrenceDate = String(state.recurringDelete.occurrenceDate || '');
    const eventItem = state.events.find((item) => item && item.id === eventId);
    const plan = globalThis.MasterCalendarCommands.planRecurringDelete({
      scope: 'following', event: eventItem, occurrenceDate
    });
    finishRecurringDeletePlan(plan, eventId, eventItem);
  }

  function applyRecurringDeletePlan(scope) {
    const eventId = String(state.recurringDelete.eventId || '');
    const occurrenceDate = String(state.recurringDelete.occurrenceDate || '');
    const eventItem = state.events.find((item) => item && item.id === eventId);
    const plan = globalThis.MasterCalendarCommands.planRecurringDelete({ scope, event: eventItem, occurrenceDate });
    finishRecurringDeletePlan(plan, eventId, eventItem);
  }

  function finishRecurringDeletePlan(plan, eventId, eventItem) {
    if (plan.action === 'none') {
      closeModal('recurring-delete-modal');
      return;
    }
    if (plan.action === 'remove') state.events = state.events.filter((item) => item.id !== eventId);
    else Object.assign(eventItem, plan.patch);

    saveState();
    closeModal('recurring-delete-modal');
    renderCalendar();
    refreshWorkshopUsageUi();
  }

  function handleMoveRecurringOne() {
    applyRecurringMovePlan('one');
  }

  function handleMoveRecurringFollowing() {
    applyRecurringMovePlan('following');
  }

  function applyRecurringMovePlan(scope) {
    const eventId = String(state.recurringMove.eventId || '');
    const occurrenceDate = String(state.recurringMove.occurrenceDate || '');
    const nextDate = String(state.recurringMove.nextDate || '');
    const nextStart = String(state.recurringMove.nextStart || '');
    const nextEnd = String(state.recurringMove.nextEnd || '');
    const eventItem = state.events.find((item) => item && item.id === eventId);
    const nextClassType = String(state.recurringMove.nextClassType || eventItem?.classType || '');
    const nextInstructor = String(state.recurringMove.nextInstructor || eventItem?.instructor || '').trim();
    const nextBaseRuleId = String(state.recurringMove.nextBaseRuleId || eventItem?.baseRuleId || '');
    const plan = globalThis.MasterCalendarCommands.planRecurringMove({
      scope,
      event: eventItem,
      occurrenceDate,
      nextDate,
      nextStart,
      nextEnd,
      nextClassType,
      nextInstructor,
      nextBaseRuleId,
      createEventId: () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
    if (plan.action === 'none') {
      resetRecurringMoveState();
      closeModal('recurring-move-modal');
      return;
    }
    Object.assign(eventItem, plan.patch);
    const movedEvent = plan.event;
    if (movedEvent) state.events.push(movedEvent);
    applyClassEventBaseMetadata(movedEvent || eventItem, nextDate);

    saveState();
    resetRecurringMoveState();
    closeModal('recurring-move-modal');
    renderCalendar();
    refreshWorkshopUsageUi();
  }

  function resetRecurringMoveState() {
    state.recurringMove.eventId = '';
    state.recurringMove.occurrenceDate = '';
    state.recurringMove.nextDate = '';
    state.recurringMove.nextStart = '';
    state.recurringMove.nextEnd = '';
    state.recurringMove.nextClassType = '';
    state.recurringMove.nextInstructor = '';
    state.recurringMove.nextBaseRuleId = '';
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
    try {
      const rawStudents = globalThis.MasterCalendarRepository.repository.loadStudents();
      const studentNames = rawStudents
        .map((student) => String(student?.name || '').trim())
        .filter(Boolean);

      let personalNames = [];
      try {
        const rawPersonal = globalThis.MasterCalendarRepository.repository.loadPersonalWorkEntries();
        personalNames = rawPersonal
          .filter((entry) => !entry?.isDormant)
          .map((entry) => String(entry?.userName || '').trim())
          .filter(Boolean);
      } catch (error) {
        personalNames = [];
      }

      state.studioUsers = Array.from(new Set([...studentNames, ...personalNames]))
        .sort((a, b) => a.localeCompare(b, 'ko'));
    } catch (error) {
      state.studioUsers = [];
    }
  }

  function getStudentUsersForEvents() {
    try {
      const rawStudents = globalThis.MasterCalendarRepository.repository.loadStudents();
      return Array.from(new Set(
        rawStudents
          .map((student) => String(student?.name || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ko'));
    } catch (error) {
      return [];
    }
  }

  function getPersonalUsersForEvents() {
    try {
      const rawPersonal = globalThis.MasterCalendarRepository.repository.loadPersonalWorkEntries();
      return Array.from(new Set(
        rawPersonal
          .filter((entry) => !entry?.isDormant)
          .map((entry) => String(entry?.userName || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ko'));
    } catch (error) {
      return [];
    }
  }

  function getActivePersonalWorkEntries() {
    try {
      const rawPersonal = globalThis.MasterCalendarRepository.repository.loadPersonalWorkEntries();
      return rawPersonal
        .filter((entry) => !entry?.isDormant)
        .map((entry) => {
          const userName = String(entry?.userName || '').trim();
          const startDate = String(entry?.startDate || '').trim();
          const maxHours = Number(entry?.maxHours || 0);
          if (!userName || !startDate || !Number.isFinite(maxHours) || maxHours <= 0) return null;
          return {
            userName,
            startDate,
            maxHours,
            monthlyFee: Number(entry?.monthlyFee || 0),
            lastPaymentDate: String(entry?.lastPaymentDate || '').trim()
          };
        })
        .filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  function getActivePersonalWorkEntryByUserName(userName) {
    const key = String(userName || '').trim();
    if (!key) return null;
    const entries = getActivePersonalWorkEntries();
    return entries.find((entry) => entry.userName === key) || null;
  }

  function addMonthKeepDay(date, diff) {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + diff);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate) {
    const anchor = new Date(`${String(startDateStr || '').trim()}T00:00:00`);
    const ref = referenceDate instanceof Date ? new Date(referenceDate) : new Date();

    if (Number.isNaN(anchor.getTime())) {
      const fallbackStart = new Date(ref);
      fallbackStart.setHours(0, 0, 0, 0);
      return {
        start: formatDateInput(fallbackStart),
        end: formatDateInput(addMonthKeepDay(fallbackStart, 1))
      };
    }

    let cycleStart = new Date(anchor);
    let cycleEnd = addMonthKeepDay(cycleStart, 1);
    while (ref >= cycleEnd) {
      cycleStart = cycleEnd;
      cycleEnd = addMonthKeepDay(cycleStart, 1);
    }

    return {
      start: formatDateInput(cycleStart),
      end: formatDateInput(cycleEnd)
    };
  }

  function getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd) {
    const from = new Date(`${String(cycleStart || '').trim()}T00:00:00`);
    const to = new Date(`${String(cycleEnd || '').trim()}T00:00:00`);
    const now = new Date();
    const todayKey = formatDateInput(now);
    const targetName = String(userName || '').trim();
    const personalKinds = new Set(['개인작업', '강사 지도 하 개인작업']);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !targetName) return 0;

    let total = 0;
    const addOccurrence = (eventItem, dateKey) => {
      const startAt = new Date(`${dateKey}T${String(eventItem?.start || '00:00')}:00`);
      if (Number.isNaN(startAt.getTime())) return;

      const startSlot = timeToSlot(eventItem?.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem?.end));
      const endAt = new Date(new Date(`${dateKey}T00:00:00`).getTime() + (endSlot * SLOT_MINUTES * 60 * 1000));
      if (Number.isNaN(endAt.getTime())) return;
      const occurrenceKey = formatDateInput(new Date(`${dateKey}T00:00:00`));
      if (endAt > now && occurrenceKey !== todayKey) return;
      if (startAt < from || startAt >= to) return;

      total += ((endSlot - startSlot) * SLOT_MINUTES) / 60;
    };

    const personalEvents = (state.events || []).filter((eventItem) => {
      const kind = String(eventItem?.kind || '').trim();
      return eventItem
        && personalKinds.has(kind)
        && String(eventItem.title || '').trim() === targetName;
    });
    globalThis.MasterCalendarOccurrences.expandOccurrences({
      events: personalEvents,
      rangeStart: formatDateInput(from),
      rangeEnd: formatDateInput(addDays(to, -1)),
      invalidRepeatEnd: 'ignore',
      maxWeeklyIterations: 520
    }).forEach((occurrence) => {
      const repeatEnd = occurrence.event.repeatEndDate
        ? new Date(`${occurrence.event.repeatEndDate}T00:00:00`)
        : null;
      if (occurrence.event.repeatWeekly && repeatEnd && !Number.isNaN(repeatEnd.getTime())) {
        const occurrenceDate = new Date(`${occurrence.date}T00:00:00`);
        if (occurrenceDate >= repeatEnd) return;
      }
      addOccurrence(occurrence.event, occurrence.date);
    });

    return Math.round(total * 10) / 10;
  }

  function formatHourValue(hours) {
    const rounded = Math.round(Number(hours || 0) * 10) / 10;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(1);
  }

  function formatWonAmount(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return '-';
    if (raw === 0) return '0원';
    if (raw < 0) return '-';
    const num = Math.round(raw);
    return `${Math.round(num).toLocaleString('ko-KR')}원`;
  }

  function renderMyWorkshopUsagePanel() {
    const panel = document.getElementById('my-workshop-panel');
    if (!panel) return;

    const cycleEl = document.getElementById('my-workshop-cycle');
    const feeEl = document.getElementById('my-workshop-fee');
    const paymentEl = document.getElementById('my-workshop-payment');
    const usedEl = document.getElementById('my-workshop-used');
    const remainEl = document.getElementById('my-workshop-remain');
    if (!cycleEl || !feeEl || !paymentEl || !usedEl || !remainEl) return;

    const me = getActiveStudioUserName();
    const myEntry = getActivePersonalWorkEntryByUserName(me);
    if (!myEntry) {
      panel.hidden = true;
      return;
    }

    const cycle = getPersonalWorkCycleRangeForDate(myEntry.startDate, new Date());
    const usedHours = getPersonalWorkUsageHoursForCycle(me, cycle.start, cycle.end);
    const remainHours = Math.max(0, Math.round((myEntry.maxHours - usedHours) * 10) / 10);

    cycleEl.textContent = `${cycle.start} ~ ${cycle.end}`;
    feeEl.textContent = formatWonAmount(myEntry.monthlyFee);
    paymentEl.textContent = Number(myEntry.monthlyFee || 0) <= 0 ? '-' : (myEntry.lastPaymentDate || '-');
    usedEl.textContent = `${formatHourValue(usedHours)}시간`;
    remainEl.textContent = `${formatHourValue(remainHours)}시간`;
    panel.hidden = false;
  }

  function renderEventPersonalUserInfo() {
    const box = document.getElementById('event-personal-user-info');
    const cycleEl = document.getElementById('event-personal-cycle');
    const hoursEl = document.getElementById('event-personal-hours');
    if (!box || !cycleEl || !hoursEl) return;

    const kind = String(document.getElementById('event-kind')?.value || '').trim();
    const selectedUser = String(document.getElementById('event-user')?.value || '').trim();
    if (kind !== '개인작업' || !selectedUser) {
      box.hidden = true;
      return;
    }

    const entry = getActivePersonalWorkEntryByUserName(selectedUser);
    if (!entry) {
      box.hidden = true;
      return;
    }

    const refDateValue = String(document.getElementById('event-date')?.value || '').trim();
    const refDate = refDateValue ? new Date(`${refDateValue}T00:00:00`) : new Date();
    const cycle = getPersonalWorkCycleRangeForDate(entry.startDate, refDate);
    const usedHours = getPersonalWorkUsageHoursForCycle(selectedUser, cycle.start, cycle.end);
    const remainHours = Math.max(0, Math.round((entry.maxHours - usedHours) * 10) / 10);

    cycleEl.textContent = `${cycle.start} ~ ${cycle.end}`;
    hoursEl.textContent = `사용 ${formatHourValue(usedHours)}시간 / 남은 ${formatHourValue(remainHours)}시간`;
    box.hidden = false;
  }

  function getEventUsersByKind(kind) {
    const normalizedKind = String(kind || '').trim();
    const studentUsers = getStudentUsersForEvents();
    const personalUsers = getPersonalUsersForEvents();

    if (normalizedKind === '수강') {
      return studentUsers;
    }
    if (normalizedKind === '개인작업') {
      return personalUsers;
    }
    if (normalizedKind === '강사 지도 하 개인작업') {
      return Array.from(new Set([...studentUsers, ...personalUsers]))
        .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    return Array.from(new Set([...studentUsers, ...personalUsers]))
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }

  function loadStudioInstructors() {
    let fromUsers = [];
    try {
      const parsedUsers = globalThis.MasterCalendarRepository.repository.loadUsers();
      fromUsers = parsedUsers
        .filter((user) => {
          if (!user || user.approved === false) return false;
          const access = getEffectiveSiteAccess(user);
          if (access !== 'pottery' && access !== 'both') return false;
          const role = getEffectiveStudioRole(user);
          return role === '강사' || role === '어드민';
        })
        .map((user) => String(user?.name || user?.username || '').trim())
        .filter(Boolean);
    } catch (error) {
      fromUsers = [];
    }

    const fromBaseRules = (state.baseRules || [])
      .filter((rule) => String(rule?.type || '') === '수업시간')
      .map((rule) => String(rule?.instructor || '').trim())
      .filter(Boolean);

    const fromOverrideRules = Object.values(state.baseWeekOverrides || {})
      .flatMap((rules) => (Array.isArray(rules) ? rules : []))
      .filter((rule) => String(rule?.type || '') === '수업시간')
      .map((rule) => String(rule?.instructor || '').trim())
      .filter(Boolean);

    const fromEvents = (state.events || [])
      .filter((event) => String(event?.kind || '') === '수강')
      .map((event) => String(event?.instructor || '').trim())
      .filter(Boolean);

    state.instructors = Array.from(new Set([...fromUsers, ...fromBaseRules, ...fromOverrideRules, ...fromEvents]))
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }

  function populateInstructorOptions(selectId, selected) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const current = String(selected || select.value || '').trim();
    const options = ['<option value="">강사 선택</option>'];
    (state.instructors || []).forEach((name) => {
      options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
    });

    select.innerHTML = options.join('');
    if (current) {
      select.value = current;
    }
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = addDays(today, 365);

    const records = [];
    const seenKeys = new Set();

    const pushOccurrence = (eventItem, occurrenceDate) => {
      const meta = getEventClassMetadataForDate(eventItem, occurrenceDate);
      const key = `${String(eventItem.id || '')}|${occurrenceDate}|${String(eventItem.start || '')}|${String(eventItem.end || '')}|${String(eventItem.title || '')}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      records.push({
        key,
        eventId: String(eventItem.id || ''),
        date: occurrenceDate,
        start: String(eventItem.start || ''),
        end: String(eventItem.end || ''),
        studentName: String(eventItem.title || '').trim(),
        classType: meta.classType,
        instructor: meta.instructor,
        baseRuleId: meta.baseRuleId,
        repeatWeekly: Boolean(eventItem.repeatWeekly)
      });
    };

    const classEvents = (state.events || []).filter((eventItem) => {
      return eventItem && String(eventItem.kind || '') === '수강';
    });
    const rangeStart = classEvents.reduce((earliest, eventItem) => {
      const startDate = new Date(`${String(eventItem.date || '')}T00:00:00`);
      if (Number.isNaN(startDate.getTime())) return earliest;
      return !earliest || startDate < earliest ? startDate : earliest;
    }, null);
    if (rangeStart) {
      globalThis.MasterCalendarOccurrences.expandOccurrences({
        events: classEvents,
        rangeStart: formatDateInput(rangeStart),
        rangeEnd: formatDateInput(horizon),
        invalidRepeatEnd: 'ignore',
        maxWeeklyIterations: 500
      }).forEach((occurrence) => pushOccurrence(occurrence.event, occurrence.date));
    }

    records.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      const startCompare = String(a.start || '').localeCompare(String(b.start || ''));
      if (startCompare !== 0) return startCompare;
      return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ko');
    });

    state.classTeachingLog = records;
  }

  function populateEventUserOptions(selected, selectId = 'event-user', forcedKind) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const current = String(selected || select.value || '').trim();
    const kind = String(
      forcedKind
      || (selectId === 'quick-edit-user'
        ? (document.getElementById('quick-edit-kind')?.textContent || '')
        : (document.getElementById('event-kind')?.value || ''))
    ).trim();
    const optionsUsers = getEventUsersByKind(kind);

    const options = ['<option value="">이용자 선택</option>'];
    optionsUsers.forEach((name) => {
      options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
    });
    if (current && !optionsUsers.includes(current)) {
      options.push(`<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>`);
    }
    select.innerHTML = options.join('');

    if (current) {
      select.value = current;
    }
  }

  function handleEventUserSelectChange() {
    renderEventPersonalUserInfo();
    renderEventSelectorGrid();
  }

  function handleQuickEditUserSelectChange() {
    // No-op: quick-edit dropdown is restricted to students managed in 수강생 관리.
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
    return getWeekStart(state.baseEditorWeekStart || state.weekStart || new Date());
  }

  function getBaseWeekKey(weekStartDate) {
    return formatDateInput(getWeekStart(weekStartDate || new Date()));
  }

  function cloneBaseWeekOverrides(overrides) {
    const result = {};
    Object.entries(overrides || {}).forEach(([key, rules]) => {
      if (!Array.isArray(rules)) return;
      result[key] = cloneBaseRules(rules);
    });
    return result;
  }

  function cloneBaseRuleTimeline(timeline) {
    return (timeline || []).map((entry) => ({
      weekKey: String(entry?.weekKey || ''),
      rules: cloneBaseRules(entry?.rules)
    })).filter((entry) => entry.weekKey);
  }

  function normalizeBaseRule(rule) {
    return {
      ...rule,
      day: Number(rule?.day || 0),
      startSlot: Number(rule?.startSlot || 0),
      endSlot: Number(rule?.endSlot || 1),
      className: String(rule?.className || '').trim(),
      instructor: String(rule?.instructor || '').trim()
    };
  }

  function getRulesForWeek(weekStartDate) {
    const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
    const override = state.baseWeekOverrides[weekKey];
    if (Array.isArray(override)) return override;
    return getTemplateRulesForWeek(weekStartDate || state.weekStart);
  }

  function hasWeekOverride(weekStartDate) {
    const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
    return Array.isArray(state.baseWeekOverrides[weekKey]);
  }

  function ensureWeekOverrideRules(weekStartDate) {
    const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
    if (!Array.isArray(state.baseWeekOverrides[weekKey])) {
      state.baseWeekOverrides[weekKey] = cloneBaseRules(getTemplateRulesForWeek(weekStartDate || state.weekStart));
    }
    return state.baseWeekOverrides[weekKey];
  }

  function getRulesByScope(scope, weekStartDate) {
    if (scope === 'all') return getTemplateRulesForWeek(weekStartDate || getBaseEditorWeekStart());
    return ensureWeekOverrideRules(weekStartDate || getBaseEditorWeekStart());
  }

  function getBaseEditScope() {
    return state.baseEditMode === 'week' ? 'week' : 'all';
  }

  function isEditFromCurrentWeekEnabled() {
    const checkbox = document.getElementById('base-edit-from-current-week');
    return state.baseEditMode === 'base' && Boolean(checkbox?.checked);
  }

  function getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot) {
    const timeline = Array.isArray(snapshot?.baseRuleTimeline) ? snapshot.baseRuleTimeline : [];
    let resolved = null;
    timeline.forEach((entry) => {
      const key = String(entry?.weekKey || '');
      if (!key || key > weekKey) return;
      if (!resolved || key > resolved.weekKey) {
        resolved = { weekKey: key, rules: entry.rules };
      }
    });
    if (resolved) return cloneBaseRules(resolved.rules);
    return cloneBaseRules(snapshot?.baseRules);
  }

  function getTemplateRulesForWeek(weekStartDate) {
    const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
    let resolved = null;
    (state.baseRuleTimeline || []).forEach((entry) => {
      const key = String(entry?.weekKey || '');
      if (!key || key > weekKey) return;
      if (!resolved || key > resolved.weekKey) {
        resolved = { weekKey: key, rules: entry.rules };
      }
    });
    if (resolved) return resolved.rules;
    return state.baseRules;
  }

  function setTemplateRulesForWeekFrom(weekStartDate, nextRules) {
    const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
    const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
      .filter((entry) => String(entry.weekKey || '') !== weekKey);
    timeline.push({ weekKey, rules: cloneBaseRules(nextRules) });
    timeline.sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
    state.baseRuleTimeline = timeline;
  }

  function normalizeTemplateTimeline() {
    const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
      .sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
    const normalized = [];
    let previousRules = cloneBaseRules(state.baseRules);
    timeline.forEach((entry) => {
      if (!areRuleSetsEquivalent(entry.rules, previousRules)) {
        normalized.push({
          weekKey: String(entry.weekKey),
          rules: cloneBaseRules(entry.rules)
        });
        previousRules = cloneBaseRules(entry.rules);
      }
    });
    state.baseRuleTimeline = normalized;
  }

  function reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey) {
    Object.entries(state.baseWeekOverrides || {}).forEach(([weekKey, rules]) => {
      if (!Array.isArray(rules)) return;
      if (startWeekKey && weekKey < startWeekKey) return;
      const previousTemplate = getTemplateRulesFromSnapshotForWeekKey(weekKey, templateSnapshot);
      if (areRuleSetsEquivalent(rules, previousTemplate)) {
        delete state.baseWeekOverrides[weekKey];
      }
    });
  }

  function getRuleComparableSignature(rule) {
    const day = Number(rule?.day || 0);
    const startSlot = Number(rule?.startSlot || 0);
    const endSlot = Number(rule?.endSlot || 1);
    const type = String(rule?.type || '');
    const className = String(rule?.className || '').trim();
    const instructor = String(rule?.instructor || '').trim();
    return `${day}|${startSlot}|${endSlot}|${type}|${className}|${instructor}`;
  }

  function areRuleSetsEquivalent(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (a.length !== b.length) return false;
    const aSig = a.map((rule) => getRuleComparableSignature(rule)).sort();
    const bSig = b.map((rule) => getRuleComparableSignature(rule)).sort();
    for (let i = 0; i < aSig.length; i += 1) {
      if (aSig[i] !== bSig[i]) return false;
    }
    return true;
  }

  function requestBaseEventFollowChoice(affectedCount, onResolve) {
    state.baseEventFollowPrompt.pending = onResolve;
    const message = document.getElementById('base-event-follow-message');
    if (message) {
      if (affectedCount > 1) {
        message.textContent = `해당 베이스 시간표 위에 이벤트 ${affectedCount}건이 있습니다. 이벤트도 같이 옮길까요?`;
      } else {
        message.textContent = '해당 베이스 시간표 위에 이벤트가 있습니다. 이벤트도 같이 옮길까요?';
      }
    }
    openModal('base-event-follow-modal');
  }

  function resolveBaseEventFollowPrompt(choice) {
    const pending = state.baseEventFollowPrompt.pending;
    state.baseEventFollowPrompt.pending = null;
    closeModal('base-event-follow-modal');
    if (typeof pending === 'function') {
      pending(choice);
    }
  }

  function executeBaseChangeWithScopeAndEventPrompt(scopeOrResolver, buildPayload, applyChange) {
    const resolvedScope = scopeOrResolver;
    const payload = buildPayload(resolvedScope);
    const affectedEvents = Array.isArray(payload?.affectedEvents) ? payload.affectedEvents : [];
    const askEventFollow = Boolean(payload?.askEventFollow) && resolvedScope === 'week';

    const commit = (moveEvents) => {
      const templateSnapshot = resolvedScope === 'all'
        ? {
            baseRules: cloneBaseRules(state.baseRules),
            baseRuleTimeline: cloneBaseRuleTimeline(state.baseRuleTimeline)
          }
        : null;
      const fromCurrent = resolvedScope === 'all' && isEditFromCurrentWeekEnabled();
      const startWeekKey = fromCurrent ? getBaseWeekKey(getBaseEditorWeekStart()) : null;
      pushBaseUndoState();
      applyChange({ ...payload, scope: resolvedScope, moveEvents: Boolean(moveEvents) });
      if (templateSnapshot) {
        reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
        normalizeTemplateTimeline();
      }
      saveState();
      renderAll();
    };

    if (!askEventFollow || affectedEvents.length === 0) {
      commit(false);
      return;
    }

    requestBaseEventFollowChoice(affectedEvents.length, (choice) => {
      if (choice === 'cancel') return;
      commit(choice === 'yes');
    });
  }

  function withBaseScope(scopeOrResolver, mutationFn) {
    const scope = scopeOrResolver;
    const templateSnapshot = scope === 'all'
      ? {
          baseRules: cloneBaseRules(state.baseRules),
          baseRuleTimeline: cloneBaseRuleTimeline(state.baseRuleTimeline)
        }
      : null;
    const fromCurrent = scope === 'all' && isEditFromCurrentWeekEnabled();
    const startWeekKey = fromCurrent ? getBaseWeekKey(getBaseEditorWeekStart()) : null;
    pushBaseUndoState();
    mutationFn(scope);
    if (templateSnapshot) {
      reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
      normalizeTemplateTimeline();
    }
    saveState();
    renderAll();
  }

  function getEditableBaseRulesForAllMode(weekStartDate) {
    const editorWeekStart = getWeekStart(weekStartDate || getBaseEditorWeekStart());
    const seedRules = cloneBaseRules(getTemplateRulesForWeek(editorWeekStart));
    if (isEditFromCurrentWeekEnabled()) {
      setTemplateRulesForWeekFrom(editorWeekStart, seedRules);
      return getRulesByScope('all', editorWeekStart);
    }
    state.baseRules = seedRules;
    state.baseRuleTimeline = [];
    return state.baseRules;
  }

  function resetBaseApplyWeeklyCheckbox() {
    const checkbox = document.getElementById('base-apply-weekly');
    if (checkbox) checkbox.checked = false;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  function collectBaseRangeEventOccurrences(day, startSlot, endSlot, weekStartDate) {
    if (!Number.isInteger(day) || endSlot <= startSlot) return [];
    const date = formatDateInput(addDays(getWeekStart(weekStartDate || new Date()), day));
    const events = getEventsForDate(date);
    const seen = new Set();
    const affected = [];

    events.forEach((eventItem) => {
      if (!eventItem || isAllDayKind(eventItem.kind)) return;
      const eventStart = timeToSlot(eventItem.start);
      const eventEnd = Math.max(eventStart + 1, timeToSlot(eventItem.end));
      if (!rangesOverlap(startSlot, endSlot, eventStart, eventEnd)) return;
      const key = `${String(eventItem.id || '')}|${date}`;
      if (seen.has(key)) return;
      seen.add(key);
      affected.push({ eventId: String(eventItem.id || ''), occurrenceDate: date });
    });

    return affected;
  }

  function buildBaseEventMovePlan(affectedEvents, dayShift, slotShift) {
    if (!Array.isArray(affectedEvents) || affectedEvents.length === 0) return [];
    return affectedEvents.map((item) => ({
      eventId: String(item.eventId || ''),
      occurrenceDate: String(item.occurrenceDate || ''),
      dayShift: Number(dayShift || 0),
      slotShift: Number(slotShift || 0)
    })).filter((item) => item.eventId && item.occurrenceDate);
  }

  function applyBaseEventMovePlan(movePlan) {
    (movePlan || []).forEach((plan) => {
      const eventItem = state.events.find((item) => item && String(item.id || '') === String(plan.eventId || ''));
      if (!eventItem) return;

      const occurrenceDate = String(plan.occurrenceDate || '');
      const currentOccurrenceDate = new Date(`${occurrenceDate}T00:00:00`);
      if (Number.isNaN(currentOccurrenceDate.getTime())) return;

      const nextDate = formatDateInput(addDays(currentOccurrenceDate, Number(plan.dayShift || 0)));
      const startSlot = timeToSlot(eventItem.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem.end));
      const duration = Math.max(1, endSlot - startSlot);
      const shiftedStart = Math.max(0, Math.min(SLOTS_PER_DAY - duration, startSlot + Number(plan.slotShift || 0)));
      const shiftedEnd = shiftedStart + duration;
      const nextStart = slotToTime(shiftedStart);
      const nextEnd = slotToTime(shiftedEnd);

      if (eventItem.repeatWeekly) {
        const skipDates = Array.isArray(eventItem.repeatSkipDates) ? eventItem.repeatSkipDates.slice() : [];
        if (!skipDates.includes(occurrenceDate)) {
          skipDates.push(occurrenceDate);
          skipDates.sort();
        }
        eventItem.repeatSkipDates = skipDates;

        const movedOccurrence = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: eventItem.kind,
          title: eventItem.title,
          date: nextDate,
          endDate: eventItem.endDate || '',
          start: nextStart,
          end: nextEnd,
          classType: eventItem.classType || '',
          instructor: eventItem.instructor || '',
          baseRuleId: eventItem.baseRuleId || '',
          capacity: Math.max(1, Math.min(3, Number(eventItem.capacity || 1))),
          repeatWeekly: false,
          repeatEndDate: '',
          repeatSkipDates: []
        };
        if (String(movedOccurrence.kind || '') === '수강') {
          applyClassEventBaseMetadata(movedOccurrence, nextDate);
        }
        state.events.push(movedOccurrence);
        return;
      }

      eventItem.date = nextDate;
      eventItem.start = nextStart;
      eventItem.end = nextEnd;
      if (String(eventItem.kind || '') === '수강') {
        applyClassEventBaseMetadata(eventItem, nextDate);
      }
    });
  }

  function createBaseRuleId() {
    return `base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function applyMovedRuleOverride(targetRules, movedRule) {
    if (!Array.isArray(targetRules) || !movedRule) return;

    const movedDay = Number(movedRule.day);
    const movedStart = Number(movedRule.startSlot);
    const movedEnd = Number(movedRule.endSlot);
    const movedId = String(movedRule.id || '');
    if (!Number.isInteger(movedDay) || movedEnd <= movedStart || !movedId) return;

    const nextRules = [];

    (targetRules || []).forEach((rule) => {
      if (!rule) return;
      if (String(rule.id || '') === movedId) return;

      const day = Number(rule.day);
      const start = Number(rule.startSlot);
      const end = Number(rule.endSlot);
      const sameDay = day === movedDay;

      if (!sameDay || !rangesOverlap(movedStart, movedEnd, start, end)) {
        nextRules.push(rule);
        return;
      }

      if (start < movedStart) {
        const leftEnd = Math.min(end, movedStart);
        if (leftEnd > start) {
          nextRules.push({
            ...rule,
            id: createBaseRuleId(),
            startSlot: start,
            endSlot: leftEnd
          });
        }
      }

      if (end > movedEnd) {
        const rightStart = Math.max(start, movedEnd);
        if (end > rightStart) {
          nextRules.push({
            ...rule,
            id: createBaseRuleId(),
            startSlot: rightStart,
            endSlot: end
          });
        }
      }
    });

    nextRules.push(movedRule);
    targetRules.length = 0;
    nextRules.forEach((rule) => targetRules.push(rule));
  }

  function applyBaseRule(day, startSlot, endSlot) {
    const type = document.getElementById('base-type').value;
    const className = document.getElementById('base-class-name').value;
    const instructor = String(document.getElementById('base-instructor')?.value || '').trim();
    if (!type) {
      alert('유형을 먼저 선택해주세요.');
      return false;
    }

    if (type === '수업시간' && !className) {
      alert('수업시간은 수업명을 입력해주세요.');
      return false;
    }
    if (type === '수업시간' && !instructor) {
      alert('수업시간은 강사를 선택해주세요.');
      return false;
    }

    const scope = getBaseEditScope();
    withBaseScope(scope, (resolvedScope) => {
      let targetRules = null;
      if (resolvedScope === 'all') {
        targetRules = getEditableBaseRulesForAllMode(getBaseEditorWeekStart());
      } else {
        targetRules = getRulesByScope(resolvedScope, getBaseEditorWeekStart());
      }
      targetRules.push({
        id: `base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        day,
        startSlot,
        endSlot,
        type,
        className: type === '수업시간' ? className : '',
        instructor: type === '수업시간' ? instructor : ''
      });
    });

    resetBaseApplyWeeklyCheckbox();
    return true;
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
    if (!rule) return '';
    if (rule.type === '수업시간') {
      const className = String(rule.className || '수업시간').trim();
      const instructor = String(rule.instructor || '').trim();
      return instructor ? `${className} · ${instructor}` : className;
    }
    return rule.type;
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
    if (type === '수업시간') return 'base-class';
    if (type === '개인작업 시간') return 'base-personal';
    if (type === '이용 불가') return 'base-closed';
    return '';
  }

  function kindToClass(kind) {
    if (kind === '수강') return 'kind-class';
    if (kind === '개인작업') return 'kind-personal';
    if (kind === '강사 지도 하 개인작업') return 'kind-guided';
    if (isExhibitionKind(kind)) return 'kind-exhibition';
    if (kind === '기타') return 'kind-other';
    if (isKilnKind(kind)) return 'kind-kiln';
    return 'kind-personal';
  }

  function isExhibitionKind(kind) {
    const value = String(kind || '').trim();
    return value === '전시회' || value.includes('전시');
  }

  function isAllDayKind(kind) {
    return isKilnKind(kind) || isExhibitionKind(kind);
  }

  function getAllDayPriority(kind) {
    if (isKilnKind(kind)) return 0;
    if (isExhibitionKind(kind)) return 1;
    return 2;
  }

  function isKilnKind(kind) {
    const value = String(kind || '').trim();
    return value === '가마 소성' || value === '가마 관련' || value.includes('가마');
  }

  function normalizeKilnCategory(value) {
    const text = String(value || '').trim();
    return KILN_CATEGORY_OPTIONS.includes(text) ? text : '';
  }

  function extractKilnCategoryFromTitle(title) {
    const text = String(title || '').trim();
    const matched = text.match(/^가마\s*소성\s*\(([^)]+)\)$/);
    if (!matched) return '';
    return normalizeKilnCategory(matched[1]);
  }

  function buildKilnEventTitle(category) {
    const normalized = normalizeKilnCategory(category);
    return normalized ? `가마 소성 (${normalized})` : '가마 소성';
  }

  function getEventDisplayTitle(eventItem, fallbackTitle) {
    const fallback = String(fallbackTitle || '새 일정');
    if (!eventItem) return fallback;

    if (isKilnKind(eventItem.kind)) {
      const fromCategory = normalizeKilnCategory(eventItem.kilnCategory);
      if (fromCategory) {
        return buildKilnEventTitle(fromCategory);
      }

      const fromTitle = String(eventItem.title || '').trim();
      return fromTitle || '가마 소성';
    }

    const title = String(eventItem.title || '').trim();
    return title || fallback;
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
    return (rules || []).map((rule) => ({ ...rule }));
  }

  function cloneEventsForUndo(events) {
    return (events || []).map((eventItem) => ({
      ...eventItem,
      repeatSkipDates: Array.isArray(eventItem?.repeatSkipDates) ? eventItem.repeatSkipDates.slice() : []
    }));
  }

  function pushBaseUndoState() {
    state.baseUndoStack.push({
      events: cloneEventsForUndo(state.events),
      baseRules: cloneBaseRules(state.baseRules),
      baseRuleTimeline: cloneBaseRuleTimeline(state.baseRuleTimeline),
      baseWeekOverrides: cloneBaseWeekOverrides(state.baseWeekOverrides)
    });
    if (state.baseUndoStack.length > 100) {
      state.baseUndoStack.shift();
    }
    updateUndoButtonState();
  }

  function undoBaseChange() {
    if (state.baseUndoStack.length === 0) return;
    const previous = state.baseUndoStack.pop();
    if (Array.isArray(previous)) {
      state.baseRules = cloneBaseRules(previous);
      state.baseRuleTimeline = [];
      state.baseWeekOverrides = {};
    } else {
      if (Array.isArray(previous?.events)) {
        state.events = cloneEventsForUndo(previous.events);
      }
      state.baseRules = cloneBaseRules(previous?.baseRules);
      state.baseRuleTimeline = cloneBaseRuleTimeline(previous?.baseRuleTimeline);
      state.baseWeekOverrides = cloneBaseWeekOverrides(previous?.baseWeekOverrides);
    }
    saveState();
    renderAll();
  }

  function updateUndoButtonState() {
    const button = document.getElementById('undo-base-btn');
    if (!button) return;
    button.disabled = state.baseUndoStack.length === 0;
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

  function saveState() {
    loadStudioInstructors();
    rebuildClassTeachingLog();
    globalThis.MasterCalendarRepository.repository.saveCalendarState({
      events: state.events,
      baseRules: state.baseRules,
      baseRuleTimeline: state.baseRuleTimeline,
      baseWeekOverrides: state.baseWeekOverrides,
      studioUsers: state.studioUsers,
      instructors: state.instructors,
      classTeachingLog: state.classTeachingLog
    });
  }

  function loadState() {
    try {
      const parsed = globalThis.MasterCalendarRepository.repository.loadCalendarState();
      state.events = Array.isArray(parsed.events)
        ? parsed.events.map((event) => {
            const kind = String(event?.kind || '').trim();
            const kilnCategory = isKilnKind(kind)
              ? (normalizeKilnCategory(event?.kilnCategory)
                || extractKilnCategoryFromTitle(event?.title)
                || '')
              : '';

            return {
              id: String(event?.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
              kind,
              title: isKilnKind(kind)
                ? buildKilnEventTitle(kilnCategory)
                : String(event?.title || ''),
              kilnCategory,
              date: String(event?.date || ''),
              endDate: String(event?.endDate || ''),
              start: String(event?.start || ''),
              end: String(event?.end || ''),
              capacity: Math.max(1, Math.min(3, Number(event?.capacity || 1))),
              classType: String(event?.classType || '').trim(),
              instructor: String(event?.instructor || '').trim(),
              baseRuleId: String(event?.baseRuleId || '').trim(),
              repeatWeekly: Boolean(event?.repeatWeekly),
              repeatSkipDates: Array.isArray(event?.repeatSkipDates) ? event.repeatSkipDates.slice() : [],
              repeatEndDate: String(event?.repeatEndDate || '')
            };
          })
        : [];
      state.baseRules = Array.isArray(parsed.baseRules)
        ? parsed.baseRules.map((rule) => normalizeBaseRule(rule))
        : [];
      state.baseRuleTimeline = Array.isArray(parsed.baseRuleTimeline)
        ? parsed.baseRuleTimeline
            .map((entry) => ({
              weekKey: String(entry?.weekKey || '').trim(),
              rules: Array.isArray(entry?.rules) ? entry.rules.map((rule) => normalizeBaseRule(rule)) : []
            }))
            .filter((entry) => entry.weekKey)
        : [];
      state.baseWeekOverrides = {};
      if (parsed.baseWeekOverrides && typeof parsed.baseWeekOverrides === 'object') {
        Object.entries(parsed.baseWeekOverrides).forEach(([weekKey, rules]) => {
          if (!Array.isArray(rules)) return;
          state.baseWeekOverrides[weekKey] = rules.map((rule) => normalizeBaseRule(rule));
        });
      }
      state.studioUsers = Array.isArray(parsed.studioUsers) ? parsed.studioUsers : [];
      state.instructors = Array.isArray(parsed.instructors) ? parsed.instructors : [];
      state.classTeachingLog = Array.isArray(parsed.classTeachingLog) ? parsed.classTeachingLog : [];
    } catch (error) {
      state.events = [];
      state.baseRules = [];
      state.baseRuleTimeline = [];
      state.baseWeekOverrides = {};
      state.studioUsers = [];
      state.instructors = [];
      state.classTeachingLog = [];
    }

    loadStudioInstructors();
    rebuildClassTeachingLog();
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
})();
