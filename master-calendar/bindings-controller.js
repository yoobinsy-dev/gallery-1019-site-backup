(function (root, factory) {
  const api = factory();
  root.MasterCalendarBindingsController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
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
    } = dependencies;

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

    return { bindEvents };
  }

  return { create };
});