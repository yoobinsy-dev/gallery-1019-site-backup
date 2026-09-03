(function initializeMasterCalendarCommands(root) {
  'use strict';

  function invalid(reason) {
    return { ok: false, reason };
  }

  function planEventCreation(draft = {}, policies = {}) {
    const kind = draft.kind;
    const user = draft.user;
    const customTitle = String(draft.customTitle || '').trim();
    const kilnCategory = draft.kilnCategory;
    const isExhibition = policies.isExhibitionKind(kind);
    const isKiln = policies.isKilnKind(kind);
    const isAllDay = policies.isAllDayKind(kind);
    const isOther = kind === '기타';

    if (isOther || isExhibition) {
      if (!customTitle) return invalid('제목을 입력해주세요.');
    } else if (isKiln && !kilnCategory) {
      return invalid('가마 소성 구분을 선택해주세요.');
    } else if (!isAllDay && !user) {
      return invalid('이용자를 선택해주세요.');
    }

    if (isExhibition) {
      if (!draft.rangeStart || !draft.rangeEnd) return invalid('전시회 시작/종료 날짜를 입력해주세요.');
      if (new Date(`${draft.rangeEnd}T00:00:00`) < new Date(`${draft.rangeStart}T00:00:00`)) {
        return invalid('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
      }
    }

    if ((!isExhibition && !draft.date) || (!isAllDay && (!draft.start || !draft.end))) {
      return invalid('날짜와 시간 정보를 모두 입력해주세요.');
    }

    const eventDate = isExhibition ? draft.rangeStart : draft.date;
    const eventEndDate = isExhibition ? draft.rangeEnd : '';
    const normalizedStart = isAllDay ? '00:00' : draft.start;
    const normalizedEnd = isAllDay ? '24:00' : draft.end;
    const effectiveTitle = (isOther || isExhibition)
      ? customTitle
      : (isKiln ? '가마 소성' : user);

    if (policies.isStudioArtist && kind === '개인작업') {
      if (!policies.personalUsers.includes(policies.activeStudioUserName)) {
        return invalid('개인작업 일정은 개인작업 관리에 등록된 이용자만 생성할 수 있습니다. 먼저 개인작업 관리 페이지에 본인을 추가해주세요.');
      }
    }
    if (!policies.canManagePlacement(kind, eventDate, normalizedStart, normalizedEnd, effectiveTitle)) {
      return invalid(policies.roleLockMessage);
    }

    const startSlot = policies.timeToSlot(normalizedStart);
    const endSlot = policies.timeToSlot(normalizedEnd);
    if (endSlot <= startSlot) return invalid('종료 시간은 시작 시간보다 늦어야 합니다.');

    const dayIndex = policies.getDayIndexFromDateString(eventDate);
    if (!policies.isPlacementAllowed(kind, dayIndex, startSlot, endSlot)) {
      return invalid('선택한 시간은 현재 일정 종류로 예약할 수 없습니다.');
    }

    const capacity = isAllDay ? 1 : Math.max(1, Math.min(3, Number(draft.capacity || 1)));
    if (!isOther && !isAllDay && !policies.hasCapacity(eventDate, startSlot, endSlot, capacity)) {
      return invalid('선택한 시간대의 남은 자리가 부족합니다.');
    }

    const classRule = kind === '수강'
      ? policies.getClassRule(eventDate, normalizedStart, normalizedEnd)
      : null;
    if (kind === '수강' && !classRule) {
      return invalid('수강 일정은 하나의 수업시간 블록과 정확히 일치해야 합니다.');
    }
    if (draft.weeklyRepeat && !isOther && !isAllDay
      && !policies.isBaseRangeRepeatingWeekly(eventDate, normalizedStart, normalizedEnd)) {
      return invalid('선택한 베이스 블록은 매주 반복되지 않습니다. 매주 반복으로 등록할 수 없습니다.');
    }

    return {
      ok: true,
      event: {
        id: policies.createEventId(),
        kind,
        title: (isOther || isExhibition)
          ? customTitle
          : (isKiln ? policies.buildKilnEventTitle(kilnCategory) : user),
        date: eventDate,
        endDate: eventEndDate,
        start: normalizedStart,
        end: normalizedEnd,
        classType: classRule ? String(classRule.className || '수업시간') : '',
        instructor: classRule ? String(classRule.instructor || '').trim() : '',
        baseRuleId: classRule ? String(classRule.id || '') : '',
        kilnCategory: isKiln ? kilnCategory : '',
        capacity,
        repeatWeekly: Boolean(draft.weeklyRepeat)
      }
    };
  }

  function planPointerEdit(options = {}) {
    const edit = options.edit;
    const event = options.event;
    const target = options.target;
    if (!event || !edit?.validPreview || !target) return { action: 'none' };
    if (!Number.isInteger(target.dayIndex)
      || !Number.isInteger(target.startSlot)
      || !Number.isInteger(target.endSlot)
      || target.endSlot <= target.startSlot) {
      return { action: 'none' };
    }

    const changed = String(options.originalDate || '') !== String(target.date || '')
      || String(options.originalStart || '') !== String(target.start || '')
      || String(options.originalEnd || '') !== String(target.end || '');
    if (changed && event.repeatWeekly && options.viewMode === 'week' && edit.pointerMoved) {
      return {
        action: 'prompt-recurring',
        recurringMove: {
          eventId: String(event.id || ''),
          occurrenceDate: String(edit.occurrenceDate || target.date),
          nextDate: target.date,
          nextStart: target.start,
          nextEnd: target.end,
          nextClassType: String(options.nextClassRule?.className || event.classType || ''),
          nextInstructor: String(options.nextClassRule?.instructor || event.instructor || '').trim(),
          nextBaseRuleId: String(options.nextClassRule?.id || event.baseRuleId || '')
        }
      };
    }

    return {
      action: 'update',
      patch: { date: target.date, start: target.start, end: target.end }
    };
  }

  function planRecurringDelete(options = {}) {
    const event = options.event;
    const occurrenceDate = String(options.occurrenceDate || '');
    if (!event || !occurrenceDate) return { action: 'none' };

    if (options.scope === 'one') {
      const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
      if (!repeatSkipDates.includes(occurrenceDate)) {
        repeatSkipDates.push(occurrenceDate);
        repeatSkipDates.sort();
      }
      return { action: 'update', patch: { repeatSkipDates } };
    }

    const seriesStart = new Date(`${event.date}T00:00:00`);
    const occurrence = new Date(`${occurrenceDate}T00:00:00`);
    if (Number.isNaN(seriesStart.getTime()) || Number.isNaN(occurrence.getTime())) {
      return { action: 'none' };
    }
    if (occurrence <= seriesStart) return { action: 'remove' };

    occurrence.setDate(occurrence.getDate() - 7);
    const repeatEndDate = formatDate(occurrence);
    const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
    return {
      action: 'update',
      patch: {
        repeatEndDate,
        repeatSkipDates: repeatSkipDates.filter((date) => date <= repeatEndDate)
      }
    };
  }

  function planRecurringMove(options = {}) {
    const event = options.event;
    const occurrenceDate = String(options.occurrenceDate || '');
    const nextDate = String(options.nextDate || '');
    const nextStart = String(options.nextStart || '');
    const nextEnd = String(options.nextEnd || '');
    if (!event || !occurrenceDate || !nextDate || !nextStart || !nextEnd) return { action: 'none' };

    const movedFields = {
      date: nextDate,
      start: nextStart,
      end: nextEnd,
      classType: String(options.nextClassType || event.classType || ''),
      instructor: String(options.nextInstructor || event.instructor || '').trim(),
      baseRuleId: String(options.nextBaseRuleId || event.baseRuleId || '')
    };
    if (options.scope === 'one') {
      const repeatSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
      if (!repeatSkipDates.includes(occurrenceDate)) {
        repeatSkipDates.push(occurrenceDate);
        repeatSkipDates.sort();
      }
      return {
        action: 'append',
        patch: { repeatSkipDates },
        event: buildMovedEvent(event, movedFields, options.createEventId(), false, '')
      };
    }

    const seriesStart = new Date(`${event.date}T00:00:00`);
    const occurrence = new Date(`${occurrenceDate}T00:00:00`);
    if (Number.isNaN(seriesStart.getTime()) || Number.isNaN(occurrence.getTime())) {
      return { action: 'none' };
    }
    if (occurrence <= seriesStart) {
      const patch = { ...movedFields };
      if (Array.isArray(event.repeatSkipDates)) {
        patch.repeatSkipDates = event.repeatSkipDates.filter((date) => date >= nextDate);
      }
      return { action: 'update', patch };
    }

    occurrence.setDate(occurrence.getDate() - 7);
    const repeatEndDate = formatDate(occurrence);
    const oldSkipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates.slice() : [];
    return {
      action: 'split',
      patch: {
        repeatEndDate,
        repeatSkipDates: oldSkipDates.filter((date) => date <= repeatEndDate)
      },
      event: buildMovedEvent(
        event,
        movedFields,
        options.createEventId(),
        true,
        String(event.repeatEndDate || '')
      )
    };
  }

  function buildMovedEvent(event, fields, id, repeatWeekly, repeatEndDate) {
    return {
      id,
      kind: event.kind,
      title: event.title,
      date: fields.date,
      endDate: '',
      start: fields.start,
      end: fields.end,
      classType: fields.classType,
      instructor: fields.instructor,
      baseRuleId: fields.baseRuleId,
      capacity: Math.max(1, Math.min(3, Number(event.capacity || 1))),
      repeatWeekly,
      ...(repeatWeekly ? { repeatEndDate, repeatSkipDates: [] } : {})
    };
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = Object.freeze({
    planEventCreation,
    planPointerEdit,
    planRecurringDelete,
    planRecurringMove
  });
  root.MasterCalendarCommands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);