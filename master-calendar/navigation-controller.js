(function (root, factory) {
  const api = factory();
  root.MasterCalendarNavigationController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      minCalendarZoom,
      maxCalendarZoom,
      dayNames,
      slotHeight,
      slotsPerDay,
      allDayRowHeight,
      monthRows,
      monthRowHeight,
      getWeekStart,
      getMonthStart,
      addDays,
      addMonths,
      formatDateDisplay,
      formatMonthDate,
      isSameCalendarDate,
      formatDateInput,
      weekViewModule,
      monthViewModule,
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
    } = dependencies;

    let weekView = null;
    let monthView = null;

    function getCalendarZoomFactor() {
      const zoom = Number(state.calendarZoom);
      if (!Number.isFinite(zoom)) return 1;
      return Math.max(minCalendarZoom, Math.min(maxCalendarZoom, zoom));
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
      state.calendarZoom = Math.max(minCalendarZoom, Math.min(maxCalendarZoom, Math.round(numeric * 10) / 10));
      updateCalendarZoomButtons();
      renderCalendar();
    }

    function updateCalendarZoomButtons() {
      const zoomInBtn = document.getElementById('zoom-in-btn');
      const zoomOutBtn = document.getElementById('zoom-out-btn');
      if (!zoomInBtn || !zoomOutBtn) return;
      zoomInBtn.disabled = state.calendarZoom >= maxCalendarZoom;
      zoomOutBtn.disabled = state.calendarZoom <= minCalendarZoom;
    }

    function setCalendarToToday() {
      const now = new Date();
      state.weekStart = getWeekStart(now);
      state.monthStart = getMonthStart(now);
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

    function renderWeekCalendar(dayHeader, body, wrap) {
      if (!weekView) {
        weekView = weekViewModule.create({
          document,
          state,
          dayNames,
          slotHeight,
          slotsPerDay,
          allDayRowHeight,
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
        monthView = monthViewModule.create({
          document,
          state,
          dayNames,
          monthRows,
          monthRowHeight,
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

    return {
      getCalendarZoomFactor,
      applyCalendarZoomStyles,
      setCalendarZoom,
      updateCalendarZoomButtons,
      setCalendarToToday,
      renderWeekLabel,
      setViewMode,
      shiftCurrentRange,
      syncViewToggleButtons,
      renderCalendar,
      renderWeekCalendar,
      renderMonthCalendar,
      syncCalendarHeaderScrollbarGap
    };
  }

  return { create };
});