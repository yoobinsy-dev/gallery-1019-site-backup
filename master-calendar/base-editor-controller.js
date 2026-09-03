(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseEditorController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      setTimeout,
      clearTimeout,
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
      alert,
      escapeHtml
    } = dependencies;

    function renderBaseEditorGrid(options) {
      const forceDefaultViewport = Boolean(options && options.forceDefaultViewport);
      const root = document.getElementById('base-editor-grid');
      if (!root) return;
      const previousScrollTop = root.scrollTop;

      const grid = document.createElement('div');
      grid.className = 'base-grid-inner';
      state.dragBase.gridEl = grid;
      state.moveBase.gridEl = grid;
      state.resizeBase.gridEl = grid;

      const head = document.createElement('div');
      head.className = 'base-time base-head-cell';
      head.textContent = '시간';
      grid.appendChild(head);

      const editorWeekStart = getBaseEditorWeekStart();
      const displayRules = getBaseEditorDisplayRules();
      for (let day = 0; day < 7; day += 1) {
        const dayDate = addDays(editorWeekStart, day);
        const dayHead = document.createElement('div');
        dayHead.className = 'base-time base-head-cell';
        dayHead.textContent = `${DAY_NAMES[day]} (${formatMonthDate(dayDate)})`;
        if (isSameCalendarDate(dayDate, new Date())) {
          dayHead.classList.add('is-today');
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dayHead.appendChild(document.createTextNode(' '));
          dayHead.appendChild(badge);
        }
        grid.appendChild(dayHead);
      }

      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
        const time = document.createElement('div');
        time.className = 'base-time';
        time.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        grid.appendChild(time);

        for (let day = 0; day < 7; day += 1) {
          const rule = getRuleForSlotFromRules(displayRules, day, slot);
          const cell = document.createElement('div');
          cell.className = `base-cell ${baseTypeToClass(rule ? rule.type : '')}`;
          cell.dataset.day = String(day);
          cell.dataset.slot = String(slot);
          if (rule && rule.id) cell.dataset.ruleId = String(rule.id);

          if (rule) {
            const prev = slot > 0 ? getRuleForSlotFromRules(displayRules, day, slot - 1) : null;
            const next = slot < SLOTS_PER_DAY - 1 ? getRuleForSlotFromRules(displayRules, day, slot + 1) : null;
            const isStart = !prev || prev.id !== rule.id;
            const isEnd = !next || next.id !== rule.id;
            if (isStart) cell.classList.add('base-block-start');
            if (!isStart) cell.classList.add('base-block-continued');
            if (isEnd) cell.classList.add('base-block-end');
            if (!isStart && !isEnd) cell.classList.add('base-block-middle');
            if (isStart) {
              const label = document.createElement('span');
              label.className = 'base-cell-label';
              label.textContent = getBaseLabelText(rule);
              cell.appendChild(label);
            }
          }

          cell.addEventListener('mousedown', (event) => onBaseCellMouseDown(event, day, slot, rule, cell));
          cell.addEventListener('mouseenter', () => onBaseCellMouseEnter(day, slot));
          cell.addEventListener('mouseup', () => onBaseCellMouseUp(day, slot));
          grid.appendChild(cell);
        }
      }

      root.innerHTML = '';
      root.appendChild(grid);
      root.scrollTop = forceDefaultViewport
        ? Math.max(0, (BASE_EDITOR_START_SLOT - 1) * 20)
        : previousScrollTop;
    }

    function onBaseCellMouseDown(event, day, slot, rule, cell) {
      if (event) event.preventDefault();
      clearMoveTimer();
      const resizeEdge = getResizeEdgeFromEvent(event, cell, rule);
      if (resizeEdge && rule) {
        startBaseResize(rule, resizeEdge);
        return;
      }
      if (rule) {
        const duration = Math.max(1, Number(rule.endSlot) - Number(rule.startSlot));
        state.moveBase.timerId = setTimeout(() => {
          document.body.classList.add('is-dragging-base');
          state.moveBase.ruleType = rule.type || '';
          state.moveBase.ruleLabel = getBaseLabelText(rule);
          state.moveBase.originDay = Number(rule.day);
          state.moveBase.active = true;
          state.moveBase.ruleId = rule.id;
          state.moveBase.dayIndex = Number(rule.day);
          state.moveBase.duration = duration;
          state.moveBase.originStartSlot = rule.startSlot;
          state.moveBase.previewStartSlot = Math.min(Number(rule.startSlot), SLOTS_PER_DAY - duration);
          state.moveBase.previewEndSlot = state.moveBase.previewStartSlot + duration;
          state.moveBase.moved = false;
          hideOriginRuleCells(state.moveBase.ruleId);
          showMoveGhost();
          updateMoveGhost();
        }, HOLD_TO_MOVE_MS);
        return;
      }
      if (!isBaseCreateControlsVisible()) {
        alert('+ 블록 추가를 눌러 블록 유형을 선택한 뒤 드래그로 추가해주세요.');
        return;
      }
      startBaseDrag(day, slot);
    }

    function onBaseCellMouseEnter(day, slot) {
      if (state.resizeBase.active) {
        updateBaseResizePreview(day, slot);
        return;
      }
      if (state.moveBase.active) {
        state.moveBase.dayIndex = day;
        const start = Math.min(slot, SLOTS_PER_DAY - state.moveBase.duration);
        state.moveBase.previewStartSlot = Math.max(0, start);
        state.moveBase.previewEndSlot = state.moveBase.previewStartSlot + state.moveBase.duration;
        state.moveBase.moved = true;
        updateMoveGhost();
        return;
      }
      moveBaseDrag(day, slot);
    }

    function onBaseCellMouseUp(day, slot) {
      if (state.resizeBase.active) return finalizeBaseResize();
      if (state.moveBase.active) return finalizeBaseMove();
      if (state.dragBase.active) return endBaseDrag(day, slot);
      const hadTimer = Boolean(state.moveBase.timerId);
      clearMoveTimer();
      if (!hadTimer) return;
      const rule = getRuleForSlotFromRules(getBaseEditorDisplayRules(), day, slot);
      if (rule) openBaseEditModal(rule);
    }

    function clearMoveTimer() {
      if (state.moveBase.timerId) {
        clearTimeout(state.moveBase.timerId);
        state.moveBase.timerId = null;
      }
    }

    function handleBaseEditorGlobalMouseUp() {
      if (state.eventSelection.dragging) {
        state.eventSelection.dragging = false;
        state.eventSelection.mode = '';
      }
      clearEventSelectionMoveTimer();
      if (state.resizeBase.active) return finalizeBaseResize();
      if (state.moveBase.active) return finalizeBaseMove();
      if (state.dragBase.active) return finalizeBaseAdd();
      clearMoveTimer();
    }

    function handleBaseEditorGlobalMouseMove(event) {
      if (!state.dragBase.active && !state.moveBase.active && !state.resizeBase.active) return;
      if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        autoScrollBaseEditor(event.clientY);
        syncPointerDrivenPreview(event.clientX, event.clientY);
      }
    }

    function handleBaseEditorUndoShortcut(event) {
      if (!event || String(event.key || '').toLowerCase() !== 'z') return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (!isBaseModalOpen()) return;
      event.preventDefault();
      undoBaseChange();
    }

    function isBaseModalOpen() {
      const modal = document.getElementById('base-modal');
      return Boolean(modal && modal.classList.contains('open'));
    }

    function autoScrollBaseEditor(pointerClientY) {
      const root = document.getElementById('base-editor-grid');
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const nearTop = pointerClientY - rect.top;
      const nearBottom = rect.bottom - pointerClientY;
      if (nearTop <= BASE_EDITOR_SCROLL_EDGE_PX) {
        root.scrollTop = Math.max(0, root.scrollTop - BASE_EDITOR_SCROLL_STEP);
      } else if (nearBottom <= BASE_EDITOR_SCROLL_EDGE_PX) {
        root.scrollTop = Math.min(root.scrollHeight, root.scrollTop + BASE_EDITOR_SCROLL_STEP);
      }
    }

    function syncPointerDrivenPreview(clientX, clientY) {
      const hovered = document.elementFromPoint(clientX, clientY);
      const directCell = hovered ? hovered.closest('.base-cell') : null;
      const pointerTarget = directCell
        ? { day: Number(directCell.dataset.day), slot: Number(directCell.dataset.slot) }
        : getPointerTargetDaySlot(clientX, clientY);
      if (!pointerTarget) return;
      const day = Number(pointerTarget.day);
      const slot = Number(pointerTarget.slot);
      if (!Number.isInteger(day) || !Number.isInteger(slot)) return;
      if (state.resizeBase.active) return updateBaseResizePreview(day, slot);
      if (state.moveBase.active) return onBaseCellMouseEnter(day, slot);
      if (state.dragBase.active) moveBaseDrag(state.dragBase.dayIndex, slot);
    }

    function getPointerTargetDaySlot(clientX, clientY) {
      const root = document.getElementById('base-editor-grid');
      const grid = getActiveBaseGrid();
      if (!root || !grid) return null;
      const rect = root.getBoundingClientRect();
      const timeColumnWidth = 56;
      const rowHeight = 20;
      const dayWidth = (grid.clientWidth - timeColumnWidth) / 7;
      if (!Number.isFinite(dayWidth) || dayWidth <= 0) return null;
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top + root.scrollTop;
      const day = Math.max(0, Math.min(6, Math.floor((relativeX - timeColumnWidth) / dayWidth)));
      const slot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor((relativeY - rowHeight) / rowHeight)));
      return { day, slot };
    }

    function getActiveBaseGrid() {
      return state.dragBase.gridEl || state.moveBase.gridEl || state.resizeBase.gridEl
        || document.querySelector('#base-editor-grid .base-grid-inner');
    }

    function finalizeBaseMove() {
      const move = state.moveBase;
      if (!move.active || !move.ruleId) {
        resetMoveState();
        return;
      }
      const ruleId = String(move.ruleId || '');
      const nextDay = Number(move.dayIndex);
      const nextStart = Number(move.previewStartSlot);
      const nextEnd = Number(move.previewEndSlot);
      const weekStart = getBaseEditorWeekStart();
      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(scope, () => {
        const dayShift = nextDay - move.originDay;
        const slotShift = nextStart - move.originStartSlot;
        const affectedEvents = collectBaseRangeEventOccurrences(move.originDay, move.originStartSlot, move.originStartSlot + move.duration, weekStart);
        const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
        return { ruleId, nextDay, nextStart, nextEnd, weekStart, affectedEvents, askEventFollow: dayShift !== 0 || slotShift !== 0, movePlan };
      }, (payload) => {
        const targetRules = payload.scope === 'all'
          ? getEditableBaseRulesForAllMode(payload.weekStart)
          : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
        const rule = targetRules.find((item) => item.id === payload.ruleId);
        if (!rule) return;
        rule.day = payload.nextDay;
        rule.startSlot = payload.nextStart;
        rule.endSlot = payload.nextEnd;
        applyMovedRuleOverride(targetRules, rule);
        if (payload.moveEvents) applyBaseEventMovePlan(payload.movePlan);
      });
      resetMoveState();
    }

    function resetMoveState() {
      clearMoveTimer();
      document.body.classList.remove('is-dragging-base');
      clearOriginRuleCells();
      removeMoveGhost();
      Object.assign(state.moveBase, {
        active: false, ruleId: null, ruleType: '', ruleLabel: '', originDay: null,
        dayIndex: null, duration: 1, originStartSlot: 0, previewStartSlot: 0,
        previewEndSlot: 1, gridEl: null, ghostEl: null, moved: false
      });
    }

    function getResizeEdgeFromEvent(event, cell, rule) {
      if (!event || !cell || !rule) return '';
      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      const height = Number(rect.height || cell.clientHeight || 0);
      if (cell.classList.contains('base-block-start') && y <= BASE_RESIZE_EDGE_PX) return 'start';
      if (cell.classList.contains('base-block-end') && y >= Math.max(0, height - BASE_RESIZE_EDGE_PX)) return 'end';
      return '';
    }

    function handleBaseGridHoverCursor(event) {
      if (state.dragBase.active || state.moveBase.active || state.resizeBase.active) return;
      clearBaseGridHoverCursor();
      const target = event && event.target ? event.target : null;
      const cell = target && typeof target.closest === 'function' ? target.closest('.base-cell') : null;
      if (!cell || !cell.dataset.ruleId) return;
      const rect = cell.getBoundingClientRect();
      const y = Number(event.clientY - rect.top);
      const nearTop = cell.classList.contains('base-block-start') && y <= BASE_RESIZE_EDGE_PX;
      const nearBottom = cell.classList.contains('base-block-end') && y >= Math.max(0, rect.height - BASE_RESIZE_EDGE_PX);
      if (nearTop) cell.classList.add('edge-resize-top');
      else if (nearBottom) cell.classList.add('edge-resize-bottom');
    }

    function clearBaseGridHoverCursor() {
      document.querySelectorAll('.base-cell.edge-resize-top, .base-cell.edge-resize-bottom').forEach((cell) => {
        cell.classList.remove('edge-resize-top', 'edge-resize-bottom');
      });
    }

    function startBaseResize(rule, edge) {
      document.body.classList.add('is-dragging-base');
      Object.assign(state.resizeBase, {
        active: true, ruleId: rule.id, ruleType: rule.type || '', ruleLabel: getBaseLabelText(rule),
        dayIndex: Number(rule.day), edge, originStartSlot: Number(rule.startSlot),
        originEndSlot: Number(rule.endSlot), previewStartSlot: Number(rule.startSlot),
        previewEndSlot: Number(rule.endSlot)
      });
      hideOriginRuleCells(state.resizeBase.ruleId);
      showResizeGhost();
      updateResizeGhost();
    }

    function updateBaseResizePreview(day, slot) {
      if (!state.resizeBase.active || day !== state.resizeBase.dayIndex) return;
      if (state.resizeBase.edge === 'start') {
        state.resizeBase.previewStartSlot = Math.max(0, Math.min(slot, state.resizeBase.previewEndSlot - 1));
      } else if (state.resizeBase.edge === 'end') {
        state.resizeBase.previewEndSlot = Math.min(SLOTS_PER_DAY, Math.max(slot + 1, state.resizeBase.previewStartSlot + 1));
      }
      updateResizeGhost();
    }

    function finalizeBaseResize() {
      if (!state.resizeBase.active || !state.resizeBase.ruleId) {
        resetBaseResizeState();
        return;
      }
      const ruleId = String(state.resizeBase.ruleId || '');
      const nextStart = Number(state.resizeBase.previewStartSlot);
      const nextEnd = Number(state.resizeBase.previewEndSlot);
      const weekStart = getBaseEditorWeekStart();
      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(scope, () => {
        const dayShift = 0;
        const slotShift = nextStart - state.resizeBase.originStartSlot;
        const affectedEvents = collectBaseRangeEventOccurrences(state.resizeBase.dayIndex, state.resizeBase.originStartSlot, state.resizeBase.originEndSlot, weekStart);
        const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
        return { ruleId, day: state.resizeBase.dayIndex, nextStart, nextEnd, weekStart, affectedEvents, askEventFollow: slotShift !== 0, movePlan };
      }, (payload) => {
        const targetRules = payload.scope === 'all'
          ? getEditableBaseRulesForAllMode(payload.weekStart)
          : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
        const rule = targetRules.find((item) => item.id === payload.ruleId);
        if (!rule) return;
        rule.startSlot = payload.nextStart;
        rule.endSlot = payload.nextEnd;
        if (payload.moveEvents) applyBaseEventMovePlan(payload.movePlan);
      });
      resetBaseResizeState();
    }

    function resetBaseResizeState() {
      document.body.classList.remove('is-dragging-base');
      clearOriginRuleCells();
      removeResizeGhost();
      Object.assign(state.resizeBase, {
        active: false, ruleId: null, ruleType: '', ruleLabel: '', dayIndex: null,
        edge: null, originStartSlot: 0, originEndSlot: 1, previewStartSlot: 0,
        previewEndSlot: 1, gridEl: null, ghostEl: null
      });
    }

    function showResizeGhost() {
      const grid = state.resizeBase.gridEl;
      if (!grid) return;
      removeResizeGhost();
      const ghost = document.createElement('div');
      ghost.className = `base-resize-ghost ${baseTypeToClass(state.resizeBase.ruleType)}`;
      ghost.innerHTML = `<span>${escapeHtml(state.resizeBase.ruleLabel || state.resizeBase.ruleType || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.resizeBase.ghostEl = ghost;
    }

    function updateResizeGhost() {
      const ghost = state.resizeBase.ghostEl;
      const grid = state.resizeBase.gridEl;
      if (!ghost || !grid) return;
      positionGhost(ghost, grid, state.resizeBase.dayIndex, state.resizeBase.previewStartSlot,
        state.resizeBase.previewEndSlot - state.resizeBase.previewStartSlot);
    }

    function removeResizeGhost() {
      removeGhost(state.resizeBase);
    }

    function hideOriginRuleCells(ruleId) {
      if (!ruleId) return;
      document.querySelectorAll(`.base-cell[data-rule-id="${ruleId}"]`).forEach((cell) => {
        cell.classList.add('base-cell-origin-hidden');
      });
    }

    function clearOriginRuleCells() {
      document.querySelectorAll('.base-cell.base-cell-origin-hidden').forEach((cell) => {
        cell.classList.remove('base-cell-origin-hidden');
      });
    }

    function showMoveGhost() {
      const grid = state.moveBase.gridEl;
      if (!grid) return;
      removeMoveGhost();
      const ghost = document.createElement('div');
      ghost.className = `base-drag-ghost ${baseTypeToClass(state.moveBase.ruleType)}`;
      ghost.innerHTML = `<span>${escapeHtml(state.moveBase.ruleLabel || state.moveBase.ruleType || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.moveBase.ghostEl = ghost;
    }

    function updateMoveGhost() {
      const ghost = state.moveBase.ghostEl;
      const grid = state.moveBase.gridEl;
      if (!ghost || !grid) return;
      positionGhost(ghost, grid, state.moveBase.dayIndex, state.moveBase.previewStartSlot, state.moveBase.duration);
    }

    function removeMoveGhost() {
      removeGhost(state.moveBase);
    }

    function positionGhost(ghost, grid, dayIndex, startSlot, duration) {
      const timeColumnWidth = 56;
      const rowHeight = 20;
      const dayWidth = (grid.clientWidth - timeColumnWidth) / 7;
      ghost.style.left = `${timeColumnWidth + (dayIndex * dayWidth) + 2}px`;
      ghost.style.top = `${rowHeight + (startSlot * rowHeight) + 2}px`;
      ghost.style.width = `${Math.max(12, dayWidth - 4)}px`;
      ghost.style.height = `${Math.max(18, (duration * rowHeight) - 4)}px`;
    }

    function removeGhost(interactionState) {
      if (interactionState.ghostEl && interactionState.ghostEl.parentNode) {
        interactionState.ghostEl.parentNode.removeChild(interactionState.ghostEl);
      }
      interactionState.ghostEl = null;
    }

    function clearMovePreview() {
      document.querySelectorAll('.base-cell.moving').forEach((cell) => cell.classList.remove('moving'));
    }

    function startBaseDrag(day, slot) {
      document.body.classList.add('is-dragging-base');
      state.dragBase.active = true;
      state.dragBase.dayIndex = day;
      state.dragBase.startSlot = slot;
      state.dragBase.endSlot = slot;
      showAddGhost();
      updateAddGhost();
    }

    function moveBaseDrag(day, slot) {
      if (!state.dragBase.active || state.dragBase.dayIndex !== day) return;
      state.dragBase.endSlot = slot;
      updateAddGhost();
    }

    function endBaseDrag(day, slot) {
      if (!state.dragBase.active) return;
      if (state.dragBase.dayIndex !== day) {
        cancelBaseDrag();
        return;
      }
      state.dragBase.endSlot = slot;
      finalizeBaseAdd();
    }

    function finalizeBaseAdd() {
      if (!state.dragBase.active) return;
      const start = Math.min(state.dragBase.startSlot, state.dragBase.endSlot);
      const end = Math.max(state.dragBase.startSlot, state.dragBase.endSlot) + 1;
      const applied = applyBaseRule(state.dragBase.dayIndex, start, end);
      if (!applied) return;
      cancelBaseDrag();
    }

    function cancelBaseDrag() {
      if (!state.dragBase.active) return;
      document.body.classList.remove('is-dragging-base');
      state.dragBase.active = false;
      state.dragBase.dayIndex = null;
      state.dragBase.startSlot = null;
      state.dragBase.endSlot = null;
      removeAddGhost();
      state.dragBase.gridEl = null;
      state.dragBase.ghostEl = null;
    }

    function showAddGhost() {
      const grid = state.dragBase.gridEl || document.querySelector('#base-editor-grid .base-grid-inner');
      if (!grid) return;
      state.dragBase.gridEl = grid;
      removeAddGhost();
      const type = document.getElementById('base-type')?.value || '';
      const className = document.getElementById('base-class-name')?.value || '';
      const label = type === '수업시간' ? (className || '수업시간') : type;
      const ghost = document.createElement('div');
      ghost.className = `base-add-ghost ${baseTypeToClass(type)}`;
      ghost.innerHTML = `<span>${escapeHtml(label || '베이스 블록')}</span>`;
      grid.appendChild(ghost);
      state.dragBase.ghostEl = ghost;
    }

    function updateAddGhost() {
      if (!state.dragBase.active) return;
      const ghost = state.dragBase.ghostEl;
      const grid = state.dragBase.gridEl || document.querySelector('#base-editor-grid .base-grid-inner');
      if (!ghost || !grid) return;
      const start = Math.min(state.dragBase.startSlot, state.dragBase.endSlot);
      const end = Math.max(state.dragBase.startSlot, state.dragBase.endSlot) + 1;
      positionGhost(ghost, grid, state.dragBase.dayIndex, start, end - start);
    }

    function removeAddGhost() {
      removeGhost(state.dragBase);
    }

    return {
      renderBaseEditorGrid, onBaseCellMouseDown, onBaseCellMouseEnter, onBaseCellMouseUp,
      clearMoveTimer, handleBaseEditorGlobalMouseUp, handleBaseEditorGlobalMouseMove,
      handleBaseEditorUndoShortcut, isBaseModalOpen, autoScrollBaseEditor,
      syncPointerDrivenPreview, getPointerTargetDaySlot, getActiveBaseGrid, finalizeBaseMove,
      resetMoveState, getResizeEdgeFromEvent, handleBaseGridHoverCursor, clearBaseGridHoverCursor,
      startBaseResize, updateBaseResizePreview, finalizeBaseResize, resetBaseResizeState,
      showResizeGhost, updateResizeGhost, removeResizeGhost, hideOriginRuleCells,
      clearOriginRuleCells, showMoveGhost, updateMoveGhost, removeMoveGhost, clearMovePreview,
      startBaseDrag, moveBaseDrag, endBaseDrag, finalizeBaseAdd, cancelBaseDrag,
      showAddGhost, updateAddGhost, removeAddGhost
    };
  }

  return { create };
});