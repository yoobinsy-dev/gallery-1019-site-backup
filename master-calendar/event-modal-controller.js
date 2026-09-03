(function (root, factory) {
  const api = factory();
  root.MasterCalendarEventModalController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      modalController,
      commandPlanner,
      slotsPerDay,
      baseResizeEdgePx,
      eventSelectorRowHeight,
      eventSelectorTimeColWidth,
      holdToMoveMs,
      dayNames,
      kilnCategoryOptions,
      roleLockMessage,
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
      alert,
      setTimeout,
      clearTimeout
    } = dependencies;

    function openEventModal(preset) {
      modalController.openEventModal(preset);
    }

    function resetEventSelectionState() {
      modalController.resetEventSelectionState();
    }

    function saveEventFromModal() {
      const draft = {
        kind: document.getElementById('event-kind').value,
        user: document.getElementById('event-user').value,
        customTitle: document.getElementById('event-title')?.value || '',
        kilnCategory: normalizeKilnCategory(document.getElementById('event-kiln-category')?.value || ''),
        date: document.getElementById('event-date').value,
        rangeStart: document.getElementById('event-range-start')?.value || '',
        rangeEnd: document.getElementById('event-range-end')?.value || '',
        start: document.getElementById('event-start').value,
        end: document.getElementById('event-end').value,
        weeklyRepeat: Boolean(document.getElementById('event-weekly-repeat').checked),
        capacity: document.getElementById('event-capacity').value || 1
      };
      const studioArtist = isStudioArtist();
      const result = commandPlanner.planEventCreation(draft, {
        activeStudioUserName: getActiveStudioUserName(),
        buildKilnEventTitle,
        canManagePlacement: canManageEventPlacementByRole,
        createEventId: () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        getClassRule: getClassBaseRuleForRange,
        getDayIndexFromDateString,
        hasCapacity(eventDate, startSlot, endSlot, capacity) {
          return hasEnoughCapacityForRange(buildDailyOccupancyMap(eventDate), startSlot, endSlot, capacity);
        },
        isAllDayKind,
        isBaseRangeRepeatingWeekly,
        isExhibitionKind,
        isKilnKind,
        isPlacementAllowed: isEventPlacementAllowed,
        isStudioArtist: studioArtist,
        personalUsers: studioArtist && draft.kind === '개인작업' ? getPersonalUsersForEvents() : [],
        roleLockMessage,
        timeToSlot
      });
      if (!result.ok) {
        alert(result.reason);
        return;
      }

      state.events.push(result.event);
      saveState();
      closeModal('event-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    function syncEventInputMode() {
      const kind = document.getElementById('event-kind')?.value || '';
      const disableManual = kind === '수강' || kind === '강사 지도 하 개인작업' || isAllDayKind(kind);
      const startInput = document.getElementById('event-start');
      const endInput = document.getElementById('event-end');
      const row = document.getElementById('event-time-row');
      const hint = document.getElementById('event-selector-hint');
      const userRow = document.getElementById('event-user-row');
      const titleRow = document.getElementById('event-title-row');
      const dateWrap = document.getElementById('event-date-wrap');
      const rangeRow = document.getElementById('event-range-row');
      const kilnCategoryRow = document.getElementById('event-kiln-category-row');
      const repeatRow = document.getElementById('event-weekly-repeat')?.closest('.checkbox-row');
      const capacityWrap = document.getElementById('event-capacity-wrap');
      const capacitySelect = document.getElementById('event-capacity');
      const userInput = document.getElementById('event-user');
      const titleInput = document.getElementById('event-title');
      const isOther = kind === '기타';
      const isKiln = isKilnKind(kind);
      const isExhibition = isExhibitionKind(kind);

      if (userRow) userRow.style.display = (isOther || isKiln || isExhibition) ? 'none' : '';
      if (titleRow) titleRow.style.display = (isOther || isExhibition) ? '' : 'none';
      if (kilnCategoryRow) kilnCategoryRow.style.display = isKiln ? '' : 'none';
      if (dateWrap) dateWrap.style.display = isExhibition ? 'none' : '';
      if (rangeRow) rangeRow.style.display = isExhibition ? '' : 'none';
      if (repeatRow) repeatRow.style.display = (isKiln || isExhibition) ? 'none' : '';
      if (capacityWrap) capacityWrap.style.display = (isKiln || isExhibition) ? 'none' : '';
      if (userInput) userInput.disabled = isOther || isKiln || isExhibition;
      if (titleInput) titleInput.disabled = !(isOther || isExhibition);
      if (capacitySelect) {
        capacitySelect.disabled = isKiln || isExhibition;
        if (isKiln || isExhibition) capacitySelect.value = '1';
      }

      if (startInput) startInput.disabled = disableManual;
      if (endInput) endInput.disabled = disableManual;
      if (row) row.classList.toggle('disabled', disableManual);

      if (isAllDayKind(kind)) {
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        resetEventSelectionState();
      }

      if (hint) {
        if (kind === '수강') {
          hint.textContent = '수강: 수업시간(초록) 블록만 선택할 수 있습니다. 블록을 클릭해 선택하세요.';
        } else if (kind === '개인작업') {
          hint.textContent = '개인작업: 개인작업 시간(파랑) 범위만 드래그로 선택할 수 있습니다.';
        } else if (isExhibitionKind(kind)) {
          hint.textContent = '전시회: 종일 일정으로 시작/종료 날짜를 지정하면 상단 고정 영역에 기간으로 표시됩니다.';
        } else if (isKilnKind(kind)) {
          hint.textContent = '가마 소성: 종일 일정으로만 등록되며, 상단 고정 영역에 표시됩니다.';
        } else if (kind === '기타') {
          hint.textContent = '기타: 위치/길이 제한 없이 어디든 자유롭게 선택할 수 있으며, 겹칠 경우 다른 일정 위에 표시됩니다.';
        } else {
          hint.textContent = '강사 지도 하 개인작업: 수업시간(초록) 범위에서만 선택 가능하며, 모든 슬롯에 자리가 남아 있어야 합니다.';
        }
      }

      if (isStudioArtist()) {
        if (kind !== '개인작업') {
          const kindSelect = document.getElementById('event-kind');
          if (kindSelect) kindSelect.value = '개인작업';
        }
        if (userInput) {
          const me = getActiveStudioUserName();
          userInput.innerHTML = me
            ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
            : '<option value="">이용자 선택</option>';
          userInput.value = me;
          userInput.disabled = true;
          setRoleLockedMessage(userInput);
        }
      } else if (userInput) {
        const previous = String(userInput.value || '').trim();
        populateEventUserOptions(previous, 'event-user', kind);
      }

      renderEventPersonalUserInfo();
    }

    function syncEventSelectionFromInputs() {
      const date = document.getElementById('event-date')?.value;
      const start = document.getElementById('event-start')?.value;
      const end = document.getElementById('event-end')?.value;
      if (!date || !start || !end) return;

      const dayIndex = getDayIndexFromDateString(date);
      const startSlot = timeToSlot(start);
      const endSlot = timeToSlot(end);
      if (dayIndex < 0 || endSlot <= startSlot) return;

      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = startSlot;
      state.eventSelection.endSlot = endSlot;
    }

    function renderEventSelectorGrid() {
      const root = document.getElementById('event-selector-grid');
      if (!root) return;

      const date = document.getElementById('event-date')?.value;
      const kind = document.getElementById('event-kind')?.value;
      if (!date || !kind) {
        root.innerHTML = '';
        return;
      }

      if (isAllDayKind(kind)) {
        root.innerHTML = '';
        return;
      }

      const weekStart = getEventSelectorWeekStartDate();
      if (!weekStart) {
        root.innerHTML = '';
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'base-grid-inner event-selector-inner';

      const timeHeader = document.createElement('div');
      timeHeader.className = 'base-time base-head-cell';
      timeHeader.textContent = '시간';
      grid.appendChild(timeHeader);

      const occupancyByDay = {};
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const headerDate = addDays(weekStart, dayIndex);
        const headerDateStr = formatDateInput(headerDate);
        const dayHeader = document.createElement('div');
        dayHeader.className = 'base-time base-head-cell';
        dayHeader.textContent = `${dayNames[dayIndex]} (${formatMonthDate(headerDate)})`;
        grid.appendChild(dayHeader);
        occupancyByDay[dayIndex] = buildDailyOccupancyMap(headerDateStr);
      }

      for (let slot = 0; slot < slotsPerDay; slot += 1) {
        const timeCell = document.createElement('div');
        timeCell.className = 'base-time';
        timeCell.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        grid.appendChild(timeCell);

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
          const dayDate = formatDateInput(addDays(weekStart, dayIndex));
          const rule = getBaseRuleForSlot(dayIndex, slot, weekStart);
          const cell = document.createElement('div');
          cell.className = `base-cell event-select-cell ${baseTypeToClass(rule ? rule.type : '')}`;
          cell.dataset.slot = String(slot);
          cell.dataset.day = String(dayIndex);
          cell.dataset.date = dayDate;
          if (rule && rule.id) cell.dataset.ruleId = String(rule.id);

          let isBlockStart = false;
          if (rule) {
            const previousRule = slot > 0 ? getBaseRuleForSlot(dayIndex, slot - 1, weekStart) : null;
            const nextRule = slot < slotsPerDay - 1 ? getBaseRuleForSlot(dayIndex, slot + 1, weekStart) : null;
            const isStart = !previousRule || previousRule.id !== rule.id;
            const isEnd = !nextRule || nextRule.id !== rule.id;

            if (isStart) cell.classList.add('base-block-start');
            if (isEnd) cell.classList.add('base-block-end');
            if (!isStart) cell.classList.add('base-block-continued');
            if (!isStart && !isEnd) cell.classList.add('base-block-middle');
            isBlockStart = isStart;

            if (isStart) {
              const label = document.createElement('span');
              label.className = 'base-cell-label';
              label.textContent = getBaseLabelText(rule);
              cell.appendChild(label);
            }
          }

          const dayOccupancy = occupancyByDay[dayIndex] || Array.from({ length: slotsPerDay }, () => [false, false, false]);
          const ruleType = String(rule?.type || '');
          const isBluePersonal = ruleType.includes('개인작업');
          const isGreenClass = ruleType === '수업시간';

          if (isBluePersonal) {
            const used = dayOccupancy[slot].filter(Boolean).length;
            const capacity = document.createElement('span');
            capacity.className = 'event-slot-capacity';
            capacity.textContent = `${used}/3`;
            cell.appendChild(capacity);
          } else if (isGreenClass && isBlockStart) {
            const capacity = document.createElement('span');
            capacity.className = 'event-slot-capacity block-capacity';
            capacity.textContent = getBlockCapacityLabel(rule, dayOccupancy);
            cell.appendChild(capacity);
          }

          cell.addEventListener('mousedown', (event) => startEventSelection(event, dayIndex, slot));
          cell.addEventListener('mouseenter', () => moveEventSelection(dayIndex, slot));
          cell.addEventListener('mouseup', () => endEventSelection(dayIndex, slot));

          grid.appendChild(cell);
        }
      }

      root.innerHTML = '';
      const stage = document.createElement('div');
      stage.className = 'event-selector-stage';
      stage.appendChild(grid);
      root.appendChild(stage);
      renderEventSelectorBubbles(stage, grid, weekStart);
    }

    function renderEventSelectorBubbles(stage, grid, weekStart) {
      if (!stage || !grid || !weekStart) return;

      const kind = document.getElementById('event-kind')?.value || '';
      const user = document.getElementById('event-user')?.value || '';
      const inputTitle = String(document.getElementById('event-title')?.value || '').trim();
      const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
      const overlay = document.createElement('div');
      overlay.className = 'event-selector-overlay';

      const gridWidth = grid.getBoundingClientRect().width;
      if (!gridWidth) {
        stage.appendChild(overlay);
        return;
      }
      const dayWidth = Math.max(0, (gridWidth - eventSelectorTimeColWidth) / 7);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(weekStart, dayIndex));
        const dayEvents = getEventsForDate(date)
          .slice()
          .sort((first, second) => timeToSlot(first.start) - timeToSlot(second.start));
        const occupancy = Array.from({ length: slotsPerDay }, () => [false, false, false]);
        const layouts = [];

        dayEvents.forEach((eventItem) => {
          if (!eventItem || isAllDayKind(eventItem.kind)) return;
          const startSlot = timeToSlot(eventItem.start);
          const endSlot = Math.max(startSlot + 1, timeToSlot(eventItem.end));
          const isOther = eventItem.kind === '기타';
          const need = isOther ? 3 : Math.max(1, Math.min(3, Number(eventItem.capacity || 1)));
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane < 0) return;

          if (!isOther) {
            for (let slot = startSlot; slot < endSlot; slot += 1) {
              for (let laneIndex = lane; laneIndex < lane + need; laneIndex += 1) {
                occupancy[slot][laneIndex] = true;
              }
            }
          }

          layouts.push({
            kind: eventItem.kind,
            title: getEventDisplayTitle(eventItem, '제목 없음'),
            start: eventItem.start,
            end: eventItem.end,
            startSlot,
            endSlot,
            lane,
            need,
            preview: false
          });
        });

        if (
          state.eventSelection.active
          && state.eventSelection.dayIndex === dayIndex
          && state.eventSelection.startSlot != null
          && state.eventSelection.endSlot != null
          && kind
        ) {
          const startSlot = Number(state.eventSelection.startSlot);
          const endSlot = Number(state.eventSelection.endSlot);
          const isOther = kind === '기타';
          const need = isOther ? 3 : capacity;
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane >= 0) {
            layouts.push({
              kind,
              title: kind === '기타'
                ? (inputTitle || '새 일정')
                : (isKilnKind(kind)
                  ? buildKilnEventTitle(normalizeKilnCategory(document.getElementById('event-kiln-category')?.value || '') || kilnCategoryOptions[0])
                  : (user || '새 일정')),
              start: slotToTime(startSlot),
              end: slotToTime(endSlot),
              startSlot,
              endSlot,
              lane,
              need,
              preview: true
            });
          }
        }

        layouts.forEach((item) => {
          const bubble = document.createElement('div');
          bubble.className = `event-bubble event-selector-bubble ${kindToClass(item.kind)}${item.preview ? ' is-preview' : ''}`;
          bubble.style.top = `${eventSelectorRowHeight + item.startSlot * eventSelectorRowHeight + 1}px`;
          bubble.style.height = `${Math.max(eventSelectorRowHeight - 2, (item.endSlot - item.startSlot) * eventSelectorRowHeight - 2)}px`;
          bubble.style.left = `${eventSelectorTimeColWidth + dayIndex * dayWidth + (item.lane * (dayWidth / 3)) + 1}px`;
          bubble.style.width = `${Math.max(10, (item.need * (dayWidth / 3)) - 2)}px`;
          bubble.innerHTML = `<strong>${escapeHtml(item.title || '이용자 없음')}</strong>`;
          overlay.appendChild(bubble);
        });
      }

      stage.appendChild(overlay);
    }

    function startEventSelection(event, dayIndex, slot) {
      if (event) event.preventDefault();

      const kind = document.getElementById('event-kind')?.value;
      const date = getEventSelectorDateForDay(dayIndex);
      if (!kind || !date) return;

      const isInsideCurrent = state.eventSelection.active
        && state.eventSelection.dayIndex === dayIndex
        && slot >= state.eventSelection.startSlot
        && slot < state.eventSelection.endSlot;

      if (isInsideCurrent && kind !== '수강') {
        const edge = getEventSelectionResizeEdge(event, dayIndex, slot);
        if (edge) {
          state.eventSelection.dragging = true;
          state.eventSelection.mode = 'resize';
          state.eventSelection.resizeEdge = edge;
          state.eventSelection.anchorSlot = edge === 'start'
            ? state.eventSelection.endSlot
            : state.eventSelection.startSlot;
          return;
        }

        state.eventSelection.anchorSlot = slot;
        state.eventSelection.moveDuration = Math.max(1, state.eventSelection.endSlot - state.eventSelection.startSlot);
        clearEventSelectionMoveTimer();
        state.eventSelection.moveTimerId = setTimeout(() => {
          state.eventSelection.dragging = true;
          state.eventSelection.mode = 'move';
        }, holdToMoveMs);
        return;
      }

      const selectorWeekStart = getEventSelectorWeekStartDate() || state.weekStart;
      const cellRule = getBaseRuleForSlot(dayIndex, slot, selectorWeekStart);
      if (kind === '수강') {
        if (!cellRule || cellRule.type !== '수업시간') return;
        if (!isEventPlacementAllowed(kind, dayIndex, cellRule.startSlot, cellRule.endSlot)) return;

        const occupancy = buildDailyOccupancyMap(date);
        const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
        if (!hasEnoughCapacityForRange(occupancy, cellRule.startSlot, cellRule.endSlot, capacity)) {
          alert('선택한 수업시간 블록은 남은 자리가 부족합니다.');
          return;
        }

        applyEventSelection(dayIndex, cellRule.startSlot, cellRule.endSlot);
        renderEventSelectorGrid();
        return;
      }

      state.eventSelection.dragging = true;
      state.eventSelection.mode = 'create';
      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = slot;
      state.eventSelection.endSlot = slot + 1;
      state.eventSelection.anchorSlot = slot;
      renderEventSelectorGrid();
    }

    function moveEventSelection(dayIndex, slot) {
      if (state.eventSelection.mode === 'move' && state.eventSelection.dragging) {
        const duration = Math.max(1, state.eventSelection.moveDuration);
        const start = Math.max(0, Math.min(slot, slotsPerDay - duration));
        const end = start + duration;
        applyEventSelection(dayIndex, start, end, true);
        renderEventSelectorGrid();
        return;
      }

      if (state.eventSelection.mode === 'resize' && state.eventSelection.dragging) {
        const base = state.eventSelection.anchorSlot;
        const start = state.eventSelection.resizeEdge === 'start'
          ? Math.min(slot, base - 1)
          : base;
        const end = state.eventSelection.resizeEdge === 'start'
          ? base
          : Math.max(base + 1, slot + 1);
        applyEventSelection(dayIndex, Math.max(0, start), Math.min(slotsPerDay, end), true);
        renderEventSelectorGrid();
        return;
      }

      if (!state.eventSelection.dragging) return;
      if (state.eventSelection.dayIndex !== dayIndex) return;
      if (state.eventSelection.mode !== 'create') return;

      const start = Math.min(state.eventSelection.startSlot, slot);
      const end = Math.max(state.eventSelection.startSlot, slot) + 1;
      applyEventSelection(dayIndex, start, end, true);
      renderEventSelectorGrid();
    }

    function endEventSelection(dayIndex, slot) {
      const wasDragging = state.eventSelection.dragging;
      const mode = state.eventSelection.mode;
      clearEventSelectionMoveTimer();

      if (!wasDragging) {
        state.eventSelection.mode = '';
        return;
      }

      state.eventSelection.dragging = false;
      state.eventSelection.mode = '';

      let start = state.eventSelection.startSlot;
      let end = state.eventSelection.endSlot;

      if (mode === 'create') {
        start = Math.min(state.eventSelection.startSlot, slot);
        end = Math.max(state.eventSelection.startSlot, slot) + 1;
      } else if (mode === 'move') {
        const duration = Math.max(1, state.eventSelection.moveDuration);
        start = Math.max(0, Math.min(slot, slotsPerDay - duration));
        end = start + duration;
      } else if (mode === 'resize') {
        const base = state.eventSelection.anchorSlot;
        start = state.eventSelection.resizeEdge === 'start'
          ? Math.min(slot, base - 1)
          : base;
        end = state.eventSelection.resizeEdge === 'start'
          ? base
          : Math.max(base + 1, slot + 1);
        start = Math.max(0, start);
        end = Math.min(slotsPerDay, end);
      }

      const ok = applyEventSelection(dayIndex, start, end, false);
      if (!ok) {
        state.eventSelection.active = false;
        state.eventSelection.startSlot = null;
        state.eventSelection.endSlot = null;
      }
      renderEventSelectorGrid();
    }

    function clearEventSelectionMoveTimer() {
      if (state.eventSelection.moveTimerId) {
        clearTimeout(state.eventSelection.moveTimerId);
        state.eventSelection.moveTimerId = null;
      }
    }

    function getEventSelectionResizeEdge(event, dayIndex, slot) {
      if (!event || !state.eventSelection.active) return '';
      if (state.eventSelection.dayIndex !== dayIndex) return '';
      const cell = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('.event-select-cell')
        : null;
      if (!cell) return '';

      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      if (slot === state.eventSelection.startSlot && y <= baseResizeEdgePx) {
        return 'start';
      }
      if (slot === state.eventSelection.endSlot - 1 && y >= Math.max(0, rect.height - baseResizeEdgePx)) {
        return 'end';
      }
      return '';
    }

    function applyEventSelection(dayIndex, startSlot, endSlot, silent) {
      const kind = document.getElementById('event-kind')?.value;
      const date = getEventSelectorDateForDay(dayIndex);
      const capacity = Math.max(1, Math.min(3, Number(document.getElementById('event-capacity')?.value || 1)));
      if (!kind || !date) return false;

      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
        if (!silent) alert('선택한 일정 종류로는 해당 구간을 선택할 수 없습니다.');
        return false;
      }

      if (kind !== '기타' && !isAllDayKind(kind)) {
        const occupancy = buildDailyOccupancyMap(date);
        if (!hasEnoughCapacityForRange(occupancy, startSlot, endSlot, capacity)) {
          if (!silent) alert('선택한 구간에 남은 자리가 부족합니다.');
          return false;
        }
      }

      state.eventSelection.active = true;
      state.eventSelection.dayIndex = dayIndex;
      state.eventSelection.startSlot = startSlot;
      state.eventSelection.endSlot = endSlot;

      document.getElementById('event-date').value = date;
      document.getElementById('event-start').value = slotToTime(startSlot);
      document.getElementById('event-end').value = slotToTime(endSlot);
      return true;
    }

    function getEventSelectorWeekStartDate() {
      const date = document.getElementById('event-date')?.value;
      if (!date) return null;
      const parsedDate = new Date(`${date}T00:00:00`);
      if (Number.isNaN(parsedDate.getTime())) return null;
      return getWeekStart(parsedDate);
    }

    function getEventSelectorDateForDay(dayIndex) {
      const weekStart = getEventSelectorWeekStartDate();
      if (!weekStart) return '';
      return formatDateInput(addDays(weekStart, dayIndex));
    }

    function getBlockCapacityLabel(rule, dayOccupancy) {
      if (!rule || !dayOccupancy) return '0/3';
      let maxUsed = 0;
      for (let slot = Number(rule.startSlot); slot < Number(rule.endSlot); slot += 1) {
        const used = (dayOccupancy[slot] || []).filter(Boolean).length;
        if (used > maxUsed) maxUsed = used;
      }
      return `${maxUsed}/3`;
    }

    function handleEventSelectorHoverCursor(event) {
      if (state.eventSelection.dragging) return;

      clearEventSelectorHoverCursor();
      const target = event && event.target ? event.target : null;
      const cell = target && typeof target.closest === 'function' ? target.closest('.event-select-cell') : null;
      if (!cell || !state.eventSelection.active) return;

      const slot = Number(cell.dataset.slot);
      const day = Number(cell.dataset.day);
      if (!Number.isInteger(slot) || !Number.isInteger(day)) return;
      if (day !== state.eventSelection.dayIndex) return;

      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      if (slot === state.eventSelection.startSlot && y <= baseResizeEdgePx) {
        cell.classList.add('event-edge-resize-top');
      } else if (slot === state.eventSelection.endSlot - 1 && y >= Math.max(0, rect.height - baseResizeEdgePx)) {
        cell.classList.add('event-edge-resize-bottom');
      }
    }

    function clearEventSelectorHoverCursor() {
      document.querySelectorAll('.event-select-cell.event-edge-resize-top, .event-select-cell.event-edge-resize-bottom').forEach((cell) => {
        cell.classList.remove('event-edge-resize-top', 'event-edge-resize-bottom');
      });
    }

    return {
      openEventModal,
      resetEventSelectionState,
      saveEventFromModal,
      syncEventInputMode,
      syncEventSelectionFromInputs,
      renderEventSelectorGrid,
      renderEventSelectorBubbles,
      startEventSelection,
      moveEventSelection,
      endEventSelection,
      clearEventSelectionMoveTimer,
      getEventSelectionResizeEdge,
      applyEventSelection,
      getEventSelectorWeekStartDate,
      getEventSelectorDateForDay,
      getBlockCapacityLabel,
      handleEventSelectorHoverCursor,
      clearEventSelectorHoverCursor
    };
  }

  return { create };
});