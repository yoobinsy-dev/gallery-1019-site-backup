(function (root, factory) {
  const api = factory();
  root.MasterCalendarQuickCreateController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
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
    } = dependencies;

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

    return {
      startMasterCreate,
      moveMasterCreate,
      finalizeMasterCreate,
      resetMasterCreateState,
      updateMasterCreatePreview,
      removeMasterCreatePreview
    };
  }

  return { create };
});