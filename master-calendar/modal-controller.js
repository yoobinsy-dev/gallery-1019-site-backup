(function (root, factory) {
  const api = factory();
  root.MasterCalendarModalController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      kilnCategoryOptions,
      baseEditorStartSlot,
      eventSelectorRowHeight,
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
      requestAnimationFrame,
      timeToSlot,
      escapeHtml
    } = dependencies;

    function openEventModal(preset) {
      const activeWeekMonday = state.weekStart instanceof Date ? state.weekStart : getWeekStart(new Date());
      const date = preset?.date || formatDateInput(activeWeekMonday);
      const start = preset?.start || '10:00';
      const end = preset?.end || '10:30';
      const presetKind = String(preset?.kind || '').trim();

      const kindSelect = document.getElementById('event-kind');
      const userSelect = document.getElementById('event-user');
      if (kindSelect && !state.eventKindOptionsHtml) {
        state.eventKindOptionsHtml = kindSelect.innerHTML;
      }

      if (kindSelect) {
        if (isStudioArtist()) {
          kindSelect.innerHTML = '<option value="개인작업">개인작업</option>';
        } else if (isStudioInstructor()) {
          kindSelect.innerHTML = [
            '<option value="수강">수강</option>',
            '<option value="개인작업">개인작업</option>',
            '<option value="강사 지도 하 개인작업">강사 지도 하 개인작업</option>'
          ].join('');
        } else if (state.eventKindOptionsHtml) {
          kindSelect.innerHTML = state.eventKindOptionsHtml;
        }
        kindSelect.value = presetKind || (isStudioArtist() ? '개인작업' : '수강');
      }

      document.getElementById('event-user').value = '';
      document.getElementById('event-title').value = '';
      document.getElementById('event-date').value = date;
      document.getElementById('event-range-start').value = date;
      document.getElementById('event-range-end').value = date;
      document.getElementById('event-start').value = start;
      document.getElementById('event-end').value = end;
      document.getElementById('event-capacity').value = '1';
      document.getElementById('event-weekly-repeat').checked = false;
      const kilnCategoryInput = document.getElementById('event-kiln-category');
      if (kilnCategoryInput) kilnCategoryInput.value = kilnCategoryOptions[0];

      resetEventSelectionState();

      loadStudioUsers();
      if (isStudioArtist() && userSelect) {
        const me = getActiveStudioUserName();
        userSelect.innerHTML = me
          ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
          : '<option value="">이용자 선택</option>';
        userSelect.value = me;
        userSelect.disabled = true;
        setRoleLockedMessage(userSelect);
      } else if (userSelect) {
        userSelect.disabled = false;
        userSelect.classList.remove('role-locked');
        userSelect.removeAttribute('data-locked-message');
        userSelect.removeAttribute('aria-disabled');
        populateEventUserOptions();
      }

      if (kindSelect) {
        if (isStudioArtist()) {
          kindSelect.disabled = true;
          setRoleLockedMessage(kindSelect);
        } else {
          kindSelect.disabled = false;
          kindSelect.classList.remove('role-locked');
          kindSelect.removeAttribute('data-locked-message');
          kindSelect.removeAttribute('aria-disabled');
        }
      }

      syncEventInputMode();
      if (preset && preset.date && preset.start && preset.end) {
        syncEventSelectionFromInputs();
      }
      openModal('event-modal');

      renderEventSelectorGrid();
      requestAnimationFrame(() => {
        renderEventSelectorGrid();

        const modalContent = document.querySelector('#event-modal .studio-modal-content');
        if (modalContent) {
          modalContent.scrollTop = 0;
        }

        const selectorRoot = document.getElementById('event-selector-grid');
        if (selectorRoot) {
          const targetSlot = preset && preset.start
            ? Math.max(0, timeToSlot(preset.start) - 2)
            : Math.max(0, baseEditorStartSlot - 1);
          selectorRoot.scrollTop = targetSlot * eventSelectorRowHeight;
        }
      });
    }

    function resetEventSelectionState() {
      state.eventSelection.active = false;
      state.eventSelection.dragging = false;
      state.eventSelection.mode = '';
      state.eventSelection.dayIndex = null;
      state.eventSelection.startSlot = null;
      state.eventSelection.endSlot = null;
      state.eventSelection.anchorSlot = null;
      state.eventSelection.resizeEdge = '';
      state.eventSelection.moveDuration = 1;
      clearEventSelectionMoveTimer();
    }

    return {
      openEventModal,
      resetEventSelectionState
    };
  }

  return { create };
});