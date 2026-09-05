(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseTransactionController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
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
      alert,
      now,
      random
    } = dependencies;

    function getBaseEditorWeekStart() {
      return getWeekStart(state.baseEditorWeekStart || state.weekStart || new Date());
    }

    function cloneBaseWeekOverrides(overrides) {
      const result = {};
      Object.entries(overrides || {}).forEach(([key, rules]) => {
        if (!Array.isArray(rules)) return;
        result[key] = baseRulesDomain.cloneBaseRules(rules);
      });
      return result;
    }

    function getBaseEditScope() {
      return state.baseEditMode === 'week' ? 'week' : 'all';
    }

    function isEditFromCurrentWeekEnabled() {
      const checkbox = document.getElementById('base-edit-from-current-week');
      return state.baseEditMode === 'base' && Boolean(checkbox?.checked);
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
              baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
              baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline)
            }
          : null;
        const fromCurrent = resolvedScope === 'all' && isEditFromCurrentWeekEnabled();
        const startWeekKey = fromCurrent ? baseRulesDomain.getBaseWeekKey(getBaseEditorWeekStart()) : null;
        pushBaseUndoState();
        applyChange({ ...payload, scope: resolvedScope, moveEvents: Boolean(moveEvents) });
        if (templateSnapshot) {
          baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
          baseRulesDomain.normalizeTemplateTimeline();
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
            baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
            baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline)
          }
        : null;
      const fromCurrent = scope === 'all' && isEditFromCurrentWeekEnabled();
      const startWeekKey = fromCurrent ? baseRulesDomain.getBaseWeekKey(getBaseEditorWeekStart()) : null;
      pushBaseUndoState();
      mutationFn(scope);
      if (templateSnapshot) {
        baseRulesDomain.reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey);
        baseRulesDomain.normalizeTemplateTimeline();
      }
      saveState();
      renderAll();
    }

    function getEditableBaseRulesForAllMode(weekStartDate) {
      const editorWeekStart = getWeekStart(weekStartDate || getBaseEditorWeekStart());
      const seedRules = baseRulesDomain.cloneBaseRules(baseRulesDomain.getTemplateRulesForWeek(editorWeekStart));
      if (isEditFromCurrentWeekEnabled()) {
        baseRulesDomain.setTemplateRulesForWeekFrom(editorWeekStart, seedRules);
        return baseRulesDomain.getRulesByScope('all', editorWeekStart);
      }
      state.baseRules = seedRules;
      state.baseRuleTimeline = [];
      return state.baseRules;
    }

    function resetBaseApplyWeeklyCheckbox() {
      const checkbox = document.getElementById('base-apply-weekly');
      if (checkbox) checkbox.checked = false;
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
        if (!baseRulesDomain.rangesOverlap(startSlot, endSlot, eventStart, eventEnd)) return;
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
            id: `evt-${now()}-${random().toString(36).slice(2, 8)}`,
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
      return `base-${now()}-${random().toString(36).slice(2, 8)}`;
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
          targetRules = baseRulesDomain.getRulesByScope(resolvedScope, getBaseEditorWeekStart());
        }
        targetRules.push({
          id: `base-${now()}-${random().toString(36).slice(2, 8)}`,
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

    function cloneEventsForUndo(events) {
      return (events || []).map((eventItem) => ({
        ...eventItem,
        repeatSkipDates: Array.isArray(eventItem?.repeatSkipDates) ? eventItem.repeatSkipDates.slice() : []
      }));
    }

    function pushBaseUndoState() {
      state.baseUndoStack.push({
        events: cloneEventsForUndo(state.events),
        baseRules: baseRulesDomain.cloneBaseRules(state.baseRules),
        baseRuleTimeline: baseRulesDomain.cloneBaseRuleTimeline(state.baseRuleTimeline),
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
        state.baseRules = baseRulesDomain.cloneBaseRules(previous);
        state.baseRuleTimeline = [];
        state.baseWeekOverrides = {};
      } else {
        if (Array.isArray(previous?.events)) {
          state.events = cloneEventsForUndo(previous.events);
        }
        state.baseRules = baseRulesDomain.cloneBaseRules(previous?.baseRules);
        state.baseRuleTimeline = baseRulesDomain.cloneBaseRuleTimeline(previous?.baseRuleTimeline);
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

    return {
      getBaseEditorWeekStart,
      cloneBaseWeekOverrides,
      getBaseEditScope,
      isEditFromCurrentWeekEnabled,
      requestBaseEventFollowChoice,
      resolveBaseEventFollowPrompt,
      executeBaseChangeWithScopeAndEventPrompt,
      withBaseScope,
      getEditableBaseRulesForAllMode,
      resetBaseApplyWeeklyCheckbox,
      collectBaseRangeEventOccurrences,
      buildBaseEventMovePlan,
      applyBaseEventMovePlan,
      createBaseRuleId,
      applyBaseRule,
      cloneEventsForUndo,
      pushBaseUndoState,
      undoBaseChange,
      updateUndoButtonState
    };
  }

  return { create };
});
