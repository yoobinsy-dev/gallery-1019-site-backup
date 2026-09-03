(function (root, factory) {
  const api = factory();
  root.MasterCalendarQuickEditController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      slotsPerDay,
      kilnCategoryOptions,
      roleLockMessage,
      canManageEventOccurrence,
      loadStudioUsers,
      isExhibitionKind,
      isKilnKind,
      isAllDayKind,
      populateEventUserOptions,
      isStudioArtist,
      getActiveStudioUserName,
      escapeHtml,
      setRoleLockedMessage,
      normalizeKilnCategory,
      extractKilnCategoryFromTitle,
      formatDateInput,
      openModal,
      closeModal,
      timeToSlot,
      canManageEventPlacementByRole,
      getDayIndexFromDateString,
      isEventPlacementAllowed,
      buildDailyOccupancyMap,
      hasEnoughCapacityForRange,
      getClassBaseRuleForRange,
      buildKilnEventTitle,
      applyClassEventBaseMetadata,
      saveState,
      renderCalendar,
      refreshWorkshopUsageUi,
      alert
    } = dependencies;

    function openQuickEditEventModal(eventId, occurrenceDate) {
      const eventItem = state.events.find((item) => item && item.id === eventId);
      if (!eventItem) return;
      const targetDate = String(occurrenceDate || eventItem.date || '').trim();
      if (!canManageEventOccurrence(eventItem, targetDate)) {
        return;
      }

      const modal = document.getElementById('event-quick-edit-modal');
      if (!modal) return;

      loadStudioUsers();

      const kind = String(eventItem.kind || '');
      const isOther = kind === '기타';
      const isExhibition = isExhibitionKind(kind);
      const isKiln = isKilnKind(kind);
      const isAllDay = isAllDayKind(kind);

      const kindEl = document.getElementById('quick-edit-kind');
      const userRow = document.getElementById('quick-edit-user-row');
      const titleRow = document.getElementById('quick-edit-title-row');
      const kilnCategoryRow = document.getElementById('quick-edit-kiln-category-row');
      const dateRow = document.getElementById('quick-edit-date-row');
      const rangeRow = document.getElementById('quick-edit-range-row');
      const timeRow = document.getElementById('quick-edit-time-row');
      const userInput = document.getElementById('quick-edit-user');
      const titleInput = document.getElementById('quick-edit-title');
      const kilnCategoryInput = document.getElementById('quick-edit-kiln-category');
      const dateInput = document.getElementById('quick-edit-date');
      const rangeStart = document.getElementById('quick-edit-range-start');
      const rangeEnd = document.getElementById('quick-edit-range-end');
      const startInput = document.getElementById('quick-edit-start');
      const endInput = document.getElementById('quick-edit-end');

      modal.dataset.eventId = String(eventId);

      if (kindEl) kindEl.textContent = kind || '-';

      if (userInput) {
        const currentUserName = (!isOther && !isExhibition && !isKiln) ? String(eventItem.title || '').trim() : '';
        populateEventUserOptions(currentUserName, 'quick-edit-user');
        userInput.value = currentUserName;
        if (isStudioArtist()) {
          const me = getActiveStudioUserName();
          userInput.innerHTML = me
            ? `<option value="${escapeHtml(me)}">${escapeHtml(me)}</option>`
            : '<option value="">이용자 선택</option>';
          userInput.value = me;
          userInput.disabled = true;
          setRoleLockedMessage(userInput);
        } else {
          userInput.disabled = false;
          userInput.classList.remove('role-locked');
          userInput.removeAttribute('data-locked-message');
          userInput.removeAttribute('aria-disabled');
        }
      }

      if (titleInput) {
        titleInput.value = String(eventItem.title || '');
      }
      if (kilnCategoryInput) {
        const inferredCategory = normalizeKilnCategory(eventItem.kilnCategory)
          || extractKilnCategoryFromTitle(eventItem.title)
          || kilnCategoryOptions[0];
        kilnCategoryInput.value = inferredCategory;
      }

      if (dateInput) {
        dateInput.value = eventItem.date || formatDateInput(state.weekStart);
      }
      if (rangeStart) {
        rangeStart.value = eventItem.date || formatDateInput(state.weekStart);
      }
      if (rangeEnd) {
        rangeEnd.value = eventItem.endDate || eventItem.date || formatDateInput(state.weekStart);
      }

      if (startInput) startInput.value = isAllDay ? '' : (eventItem.start || '10:00');
      if (endInput) endInput.value = isAllDay ? '' : (eventItem.end || '10:30');

      if (userRow) userRow.style.display = (!isOther && !isExhibition && !isKiln) ? '' : 'none';
      if (titleRow) titleRow.style.display = (isOther || isExhibition) ? '' : 'none';
      if (kilnCategoryRow) kilnCategoryRow.style.display = isKiln ? '' : 'none';
      if (dateRow) dateRow.style.display = isExhibition ? 'none' : '';
      if (rangeRow) rangeRow.style.display = isExhibition ? '' : 'none';
      if (timeRow) timeRow.style.display = isAllDay ? 'none' : '';

      openModal('event-quick-edit-modal');
    }

    function saveQuickEditEventFromModal() {
      const modal = document.getElementById('event-quick-edit-modal');
      if (!modal) return;
      const eventId = String(modal.dataset.eventId || '');
      if (!eventId) return;

      const eventItem = state.events.find((item) => item && item.id === eventId);
      if (!eventItem) {
        closeModal('event-quick-edit-modal');
        return;
      }

      const kind = String(eventItem.kind || '');
      const isOther = kind === '기타';
      const isExhibition = isExhibitionKind(kind);
      const isKiln = isKilnKind(kind);
      const isAllDay = isAllDayKind(kind);

      const nextUser = String(document.getElementById('quick-edit-user')?.value || '').trim();
      const nextTitle = String(document.getElementById('quick-edit-title')?.value || '').trim();
      const nextDate = String(document.getElementById('quick-edit-date')?.value || '').trim();
      const nextRangeStart = String(document.getElementById('quick-edit-range-start')?.value || '').trim();
      const nextRangeEnd = String(document.getElementById('quick-edit-range-end')?.value || '').trim();
      const nextStart = String(document.getElementById('quick-edit-start')?.value || '').trim();
      const nextEnd = String(document.getElementById('quick-edit-end')?.value || '').trim();
      const nextKilnCategory = normalizeKilnCategory(document.getElementById('quick-edit-kiln-category')?.value || '');

      if (isExhibition) {
        if (!nextTitle) {
          alert('제목을 입력해주세요.');
          return;
        }
        if (!nextRangeStart || !nextRangeEnd) {
          alert('전시회 시작/종료 날짜를 입력해주세요.');
          return;
        }
        if (new Date(`${nextRangeEnd}T00:00:00`) < new Date(`${nextRangeStart}T00:00:00`)) {
          alert('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
          return;
        }

        eventItem.title = nextTitle;
        eventItem.date = nextRangeStart;
        eventItem.endDate = nextRangeEnd;
        eventItem.start = '00:00';
        eventItem.end = '24:00';
        saveState();
        closeModal('event-quick-edit-modal');
        renderCalendar();
        refreshWorkshopUsageUi();
        return;
      }

      if (!nextDate) {
        alert('날짜를 입력해주세요.');
        return;
      }

      let finalStart = '00:00';
      let finalEnd = '24:00';
      let startSlot = 0;
      let endSlot = slotsPerDay;

      if (!isAllDay) {
        if (!nextStart || !nextEnd) {
          alert('시작/종료 시간을 입력해주세요.');
          return;
        }
        startSlot = timeToSlot(nextStart);
        endSlot = timeToSlot(nextEnd);
        if (endSlot <= startSlot) {
          alert('종료 시간은 시작 시간보다 늦어야 합니다.');
          return;
        }
        finalStart = nextStart;
        finalEnd = nextEnd;
      }

      const effectiveTitleForPermission = isOther
        ? nextTitle
        : (isKiln ? '가마 소성' : nextUser);
      if (!canManageEventPlacementByRole(kind, nextDate, finalStart, finalEnd, effectiveTitleForPermission)) {
        alert(roleLockMessage);
        return;
      }

      const dayIndex = getDayIndexFromDateString(nextDate);
      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
        alert('선택한 시간은 현재 일정 종류로 예약할 수 없습니다.');
        return;
      }

      if (kind !== '기타' && !isAllDay) {
        const occupancyMap = buildDailyOccupancyMap(nextDate, eventId);
        const capacity = Math.max(1, Math.min(3, Number(eventItem.capacity || 1)));
        if (!hasEnoughCapacityForRange(occupancyMap, startSlot, endSlot, capacity)) {
          alert('선택한 시간대의 남은 자리가 부족합니다.');
          return;
        }
      }

      if (kind === '수강' && !getClassBaseRuleForRange(nextDate, finalStart, finalEnd)) {
        alert('수강 일정은 하나의 수업시간 블록과 정확히 일치해야 합니다.');
        return;
      }

      if (isOther) {
        if (!nextTitle) {
          alert('제목을 입력해주세요.');
          return;
        }
        eventItem.title = nextTitle;
        eventItem.kilnCategory = '';
      } else if (isKiln) {
        if (!nextKilnCategory) {
          alert('가마 소성 구분을 선택해주세요.');
          return;
        }
        eventItem.kilnCategory = nextKilnCategory;
        eventItem.title = buildKilnEventTitle(nextKilnCategory);
      } else {
        if (!nextUser) {
          alert('이용자를 선택해주세요.');
          return;
        }
        eventItem.title = nextUser;
        eventItem.kilnCategory = '';
      }

      eventItem.date = nextDate;
      eventItem.endDate = isAllDay ? '' : (eventItem.endDate || '');
      eventItem.start = finalStart;
      eventItem.end = finalEnd;
      applyClassEventBaseMetadata(eventItem, nextDate);

      saveState();
      closeModal('event-quick-edit-modal');
      renderCalendar();
      refreshWorkshopUsageUi();
    }

    return {
      openQuickEditEventModal,
      saveQuickEditEventFromModal
    };
  }

  return { create };
});