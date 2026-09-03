(function (root, factory) {
  const api = factory();
  root.MasterCalendarBaseEditController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      loadStudioInstructors,
      populateInstructorOptions,
      slotToTime,
      timeToSlot,
      openModal,
      closeModal,
      alert,
      confirm,
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
    } = dependencies;

    function syncClassNameVisibility(prefix) {
      const type = document.getElementById(`${prefix}-type`).value;
      const classInput = document.getElementById(`${prefix}-class-name`);
      const classRow = document.getElementById(`${prefix}-class-row`);
      const instructorInput = document.getElementById(`${prefix}-instructor`);
      const instructorRow = document.getElementById(`${prefix}-instructor-row`);

      if (classRow) {
        classRow.style.display = type === '수업시간' ? '' : 'none';
      }
      if (instructorRow) {
        instructorRow.style.display = type === '수업시간' ? '' : 'none';
      }

      if (classInput) {
        classInput.disabled = type !== '수업시간';
        if (type !== '수업시간') classInput.value = '';
      }

      if (instructorInput) {
        instructorInput.disabled = type !== '수업시간';
        if (type !== '수업시간') {
          instructorInput.value = '';
        } else {
          loadStudioInstructors();
          populateInstructorOptions(`${prefix}-instructor`);
        }
      }
    }

    function syncBaseClassNameVisibility() {
      syncClassNameVisibility('base');
    }

    function syncEditBaseClassNameVisibility() {
      syncClassNameVisibility('edit-base');
    }

    function openBaseEditModal(rule) {
      if (!rule) return;
      state.editBaseRuleId = rule.id;

      loadStudioInstructors();
      populateInstructorOptions('edit-base-instructor', rule.instructor || '');

      document.getElementById('edit-base-type').value = rule.type || '수업시간';
      document.getElementById('edit-base-class-name').value = rule.className || '';
      document.getElementById('edit-base-instructor').value = rule.instructor || '';
      document.getElementById('edit-base-day').value = String(rule.day);
      document.getElementById('edit-base-start').value = slotToTime(rule.startSlot);
      document.getElementById('edit-base-end').value = slotToTime(rule.endSlot);

      syncEditBaseClassNameVisibility();
      openModal('base-edit-modal');
    }

    function saveBaseEditFromModal() {
      const editRuleId = String(state.editBaseRuleId || '');
      if (!editRuleId) {
        closeModal('base-edit-modal');
        return;
      }

      const type = document.getElementById('edit-base-type').value;
      const className = document.getElementById('edit-base-class-name').value;
      const instructor = String(document.getElementById('edit-base-instructor')?.value || '').trim();
      const day = Number(document.getElementById('edit-base-day').value);
      const start = document.getElementById('edit-base-start').value;
      const end = document.getElementById('edit-base-end').value;

      if (!start || !end) {
        alert('시작/종료 시간을 입력해주세요.');
        return;
      }

      const startSlot = timeToSlot(start);
      const endSlot = timeToSlot(end);
      if (endSlot <= startSlot) {
        alert('종료 시간은 시작 시간보다 늦어야 합니다.');
        return;
      }

      if (type === '수업시간' && !className) {
        alert('수업시간은 수업명을 선택해주세요.');
        return;
      }
      if (type === '수업시간' && !instructor) {
        alert('수업시간은 강사를 선택해주세요.');
        return;
      }

      const weekStart = getBaseEditorWeekStart();
      const baseWeekRules = getRulesForWeek(weekStart);
      const baseRule = baseWeekRules.find((item) => item.id === editRuleId);
      const oldDay = Number(baseRule?.day ?? day);
      const oldStart = Number(baseRule?.startSlot ?? startSlot);
      const oldEnd = Number(baseRule?.endSlot ?? endSlot);

      const scope = getBaseEditScope();
      executeBaseChangeWithScopeAndEventPrompt(
        scope,
        () => {
          const dayShift = day - oldDay;
          const slotShift = startSlot - oldStart;
          const affectedEvents = collectBaseRangeEventOccurrences(oldDay, oldStart, oldEnd, weekStart);
          const movePlan = buildBaseEventMovePlan(affectedEvents, dayShift, slotShift);
          return {
            ruleId: editRuleId,
            day,
            startSlot,
            endSlot,
            type,
            className,
            instructor,
            weekStart,
            affectedEvents,
            askEventFollow: dayShift !== 0 || slotShift !== 0,
            movePlan
          };
        },
        (payload) => {
          const targetRules = payload.scope === 'all'
            ? getEditableBaseRulesForAllMode(payload.weekStart)
            : getRulesByScope(payload.scope || getBaseEditScope(), payload.weekStart);
          let rule = targetRules.find((item) => item.id === payload.ruleId);
          if (!rule) {
            rule = {
              id: payload.ruleId,
              day: payload.day,
              startSlot: payload.startSlot,
              endSlot: payload.endSlot,
              type: payload.type,
              className: '',
              instructor: ''
            };
            targetRules.push(rule);
          }

          rule.type = payload.type;
          rule.className = payload.type === '수업시간' ? payload.className : '';
          rule.instructor = payload.type === '수업시간' ? payload.instructor : '';
          rule.day = payload.day;
          rule.startSlot = payload.startSlot;
          rule.endSlot = payload.endSlot;
          applyMovedRuleOverride(targetRules, rule);
          if (payload.moveEvents) {
            applyBaseEventMovePlan(payload.movePlan);
          }
        }
      );

      closeModal('base-edit-modal');
    }

    function deleteBaseEditFromModal() {
      const editRuleId = String(state.editBaseRuleId || '');
      if (!editRuleId) return;
      if (!confirm('이 베이스 블록을 삭제하시겠습니까?')) {
        return;
      }
      const scope = getBaseEditScope();
      withBaseScope(scope, (resolvedScope) => {
        const targetRules = resolvedScope === 'all'
          ? getEditableBaseRulesForAllMode(getBaseEditorWeekStart())
          : getRulesByScope(resolvedScope, getBaseEditorWeekStart());
        const next = targetRules.filter((item) => item.id !== editRuleId);
        targetRules.length = 0;
        next.forEach((item) => targetRules.push(item));
        if (resolvedScope !== 'all') {
          state.baseWeekOverrides[getBaseWeekKey(getBaseEditorWeekStart())] = next;
        }
      });
      closeModal('base-edit-modal');
    }

    return {
      syncBaseClassNameVisibility,
      syncEditBaseClassNameVisibility,
      openBaseEditModal,
      saveBaseEditFromModal,
      deleteBaseEditFromModal
    };
  }

  return { create };
});