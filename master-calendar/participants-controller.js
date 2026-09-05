(function (root, factory) {
  const api = factory();
  root.MasterCalendarParticipantsController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      document,
      repository,
      scheduleProjectionsModule,
      occurrencesModule,
      formatDateInput,
      addDays,
      timeToSlot,
      slotMinutes,
      getActiveStudioUserName,
      getEffectiveSiteAccess,
      getEffectiveStudioRole,
      escapeHtml,
      renderEventSelectorGrid
    } = dependencies;

    function loadStudioUsers() {
      try {
        const rawStudents = repository.loadStudents();
        const studentNames = rawStudents
          .map((student) => String(student?.name || '').trim())
          .filter(Boolean);

        let personalNames = [];
        try {
          const rawPersonal = repository.loadPersonalWorkEntries();
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
        const rawStudents = repository.loadStudents();
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
        const rawPersonal = repository.loadPersonalWorkEntries();
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
        const rawPersonal = repository.loadPersonalWorkEntries();
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
      return scheduleProjectionsModule.addMonthKeepDay(date, diff);
    }

    function getPersonalWorkCycleRangeForDate(startDateStr, referenceDate) {
      return scheduleProjectionsModule.getPersonalWorkCycleRangeForDate(
        startDateStr,
        referenceDate,
        { formatDateInput, addMonthKeepDay }
      );
    }

    function getPersonalWorkUsageHoursForCycle(userName, cycleStart, cycleEnd) {
      return scheduleProjectionsModule.getPersonalWorkUsageHoursForCycle({
        events: state.events,
        userName,
        cycleStart,
        cycleEnd,
        now: new Date(),
        formatDateInput,
        addDays,
        timeToSlot,
        slotMinutes,
        expandOccurrences(options) {
          return occurrencesModule.expandOccurrences(options);
        }
      });
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
        const parsedUsers = repository.loadUsers();
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

    return {
      loadStudioUsers,
      getStudentUsersForEvents,
      getPersonalUsersForEvents,
      getActivePersonalWorkEntries,
      getActivePersonalWorkEntryByUserName,
      addMonthKeepDay,
      getPersonalWorkCycleRangeForDate,
      getPersonalWorkUsageHoursForCycle,
      formatHourValue,
      formatWonAmount,
      renderMyWorkshopUsagePanel,
      renderEventPersonalUserInfo,
      getEventUsersByKind,
      loadStudioInstructors,
      populateInstructorOptions,
      populateEventUserOptions,
      handleEventUserSelectChange,
      handleQuickEditUserSelectChange
    };
  }

  return { create };
});