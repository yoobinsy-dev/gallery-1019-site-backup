(function (root, factory) {
  const api = factory();
  root.MasterCalendarRecurringEventController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      commandPlanner,
      canManageEventOccurrence,
      openModal,
      closeModal,
      saveState,
      renderCalendar,
      refreshWorkshopUsageUi,
      applyClassEventBaseMetadata,
      createEventId
    } = dependencies;

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
      const plan = commandPlanner.planRecurringDelete({
        scope: 'following', event: eventItem, occurrenceDate
      });
      finishRecurringDeletePlan(plan, eventId, eventItem);
    }

    function applyRecurringDeletePlan(scope) {
      const eventId = String(state.recurringDelete.eventId || '');
      const occurrenceDate = String(state.recurringDelete.occurrenceDate || '');
      const eventItem = state.events.find((item) => item && item.id === eventId);
      const plan = commandPlanner.planRecurringDelete({ scope, event: eventItem, occurrenceDate });
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
      const plan = commandPlanner.planRecurringMove({
        scope,
        event: eventItem,
        occurrenceDate,
        nextDate,
        nextStart,
        nextEnd,
        nextClassType,
        nextInstructor,
        nextBaseRuleId,
        createEventId
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

    return {
      requestDeleteEvent,
      handleDeleteConfirmOk,
      handleDeleteRecurringOne,
      handleDeleteRecurringFollowing,
      applyRecurringDeletePlan,
      finishRecurringDeletePlan,
      handleMoveRecurringOne,
      handleMoveRecurringFollowing,
      applyRecurringMovePlan,
      resetRecurringMoveState
    };
  }

  return { create };
});