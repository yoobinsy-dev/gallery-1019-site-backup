(function (root, factory) {
  const api = factory();
  root.MasterCalendarWeekView = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      dayNames,
      slotHeight,
      slotsPerDay,
      allDayRowHeight,
      addDays,
      formatMonthDate,
      isSameCalendarDate,
      formatDateInput,
      isAllDayKind,
      isExhibitionKind,
      getAllDayPriority,
      canManageEventOccurrence,
      kindToClass,
      escapeHtml,
      getEventDisplayTitle,
      requestDeleteEvent,
      setRoleLockedMessage,
      openQuickEditEventModal,
      slotToTime,
      getBaseRuleForSlot,
      baseTypeToClass,
      canCreateFromBaseRule,
      startMasterCreate,
      moveMasterCreate,
      finalizeMasterCreate,
      isBaseLabelStart,
      getBaseLabelText,
      getEventsForDate,
      timeToSlot,
      findLane,
      startMasterEventEdit,
      syncCalendarHeaderScrollbarGap
    } = dependencies;

    function render(dayHeader, body, wrap) {
      dayHeader.innerHTML = '';
      body.innerHTML = '';
      if (wrap) wrap.classList.remove('is-month-mode');
      dayHeader.classList.remove('month-header');
      body.classList.remove('month-body');

      const timeHead = document.createElement('div');
      timeHead.className = 'time-head';
      timeHead.textContent = '시간';
      dayHeader.appendChild(timeHead);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = addDays(state.weekStart, dayIndex);
        const header = document.createElement('div');
        header.className = 'day-header';
        const dayName = document.createElement('div');
        dayName.textContent = dayNames[dayIndex];

        const dateLine = document.createElement('span');
        dateLine.textContent = formatMonthDate(date);

        if (isSameCalendarDate(date, new Date())) {
          header.classList.add('is-today');
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dateLine.appendChild(document.createTextNode(' '));
          dateLine.appendChild(badge);
        }

        header.appendChild(dayName);
        header.appendChild(dateLine);
        dayHeader.appendChild(header);
      }

      const rows = document.createElement('div');
      rows.className = 'calendar-rows';

      const allDayRow = document.createElement('div');
      allDayRow.className = 'calendar-all-day-row';

      const allDayTime = document.createElement('div');
      allDayTime.className = 'all-day-time-cell';
      allDayTime.textContent = '종일';
      allDayRow.appendChild(allDayTime);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'all-day-day-cell';
        allDayRow.appendChild(cell);
      }

      body.appendChild(allDayRow);

      const allDayOverlay = document.createElement('div');
      allDayOverlay.className = 'all-day-events-overlay';
      allDayRow.appendChild(allDayOverlay);

      const weekStartDate = new Date(`${formatDateInput(state.weekStart)}T00:00:00`);
      const weekEndDate = addDays(weekStartDate, 6);

      const layouts = state.events
        .filter((event) => event && isAllDayKind(event.kind) && event.date)
        .map((event) => {
          const eventStart = new Date(`${event.date}T00:00:00`);
          const rawEnd = isExhibitionKind(event.kind) ? (event.endDate || event.date) : event.date;
          const eventEnd = new Date(`${rawEnd}T00:00:00`);
          if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) return null;
          if (eventEnd < weekStartDate || eventStart > weekEndDate) return null;

          const clampedStart = eventStart < weekStartDate ? weekStartDate : eventStart;
          const clampedEnd = eventEnd > weekEndDate ? weekEndDate : eventEnd;

          const startDay = Math.max(0, Math.min(6, Math.floor((clampedStart - weekStartDate) / 86400000)));
          const endDay = Math.max(startDay, Math.min(6, Math.floor((clampedEnd - weekStartDate) / 86400000)));

          return {
            event,
            startDay,
            endDay,
            lane: 0
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const priorityDiff = getAllDayPriority(a.event.kind) - getAllDayPriority(b.event.kind);
          if (priorityDiff !== 0) return priorityDiff;
          if (a.startDay !== b.startDay) return a.startDay - b.startDay;
          return (b.endDay - b.startDay) - (a.endDay - a.startDay);
        });

      const laneEnds = [];
      layouts.forEach((item) => {
        let lane = 0;
        while (lane < laneEnds.length && item.startDay <= laneEnds[lane]) {
          lane += 1;
        }
        if (lane === laneEnds.length) laneEnds.push(item.endDay);
        else laneEnds[lane] = item.endDay;
        item.lane = lane;
      });

      const allDayLanes = Math.max(1, laneEnds.length);
      allDayRow.style.setProperty('--all-day-lanes', String(allDayLanes));

      layouts.forEach((item) => {
        const { event, startDay, endDay, lane } = item;
        const span = Math.max(1, endDay - startDay + 1);
        const canManageOccurrence = canManageEventOccurrence(event, event.date || '');
        const pill = document.createElement('div');
        pill.className = `all-day-pill ${kindToClass(event.kind)}`;
        pill.style.left = `calc(64px + (((100% - 64px) * ${startDay}) / 7) + 2px)`;
        pill.style.width = `calc((((100% - 64px) * ${span}) / 7) - 4px)`;
        pill.style.top = `${2 + lane * 24}px`;

        const fallbackTitle = isExhibitionKind(event.kind) ? '전시회' : '가마 소성';
        pill.innerHTML = `<strong>${escapeHtml(getEventDisplayTitle(event, fallbackTitle))}</strong>`;

        if (canManageOccurrence) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'all-day-pill-delete';
          deleteBtn.setAttribute('aria-label', '일정 삭제');
          deleteBtn.innerHTML = '<span aria-hidden="true">×</span>';
          deleteBtn.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            requestDeleteEvent(event.id, event.date || '');
          });
          pill.appendChild(deleteBtn);
        } else {
          setRoleLockedMessage(pill);
        }

        pill.addEventListener('click', (clickEvent) => {
          if (clickEvent.target && typeof clickEvent.target.closest === 'function' && clickEvent.target.closest('.all-day-pill-delete')) {
            return;
          }
          if (Date.now() < state.masterEdit.suppressClickUntil) return;
          if (!canManageOccurrence) return;
          openQuickEditEventModal(event.id);
        });

        allDayOverlay.appendChild(pill);
      });

      for (let slot = 0; slot < slotsPerDay; slot += 1) {
        const timeCell = document.createElement('div');
        timeCell.className = 'time-cell';
        timeCell.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
        rows.appendChild(timeCell);

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
          const date = addDays(state.weekStart, dayIndex);
          const baseRule = getBaseRuleForSlot(dayIndex, slot, state.weekStart);
          const slotEl = document.createElement('button');
          slotEl.type = 'button';
          slotEl.className = `day-slot ${baseTypeToClass(baseRule ? baseRule.type : '')}`;
          slotEl.dataset.dayIndex = String(dayIndex);
          slotEl.dataset.slot = String(slot);
          if (baseRule && !canCreateFromBaseRule(baseRule)) {
            setRoleLockedMessage(slotEl);
          }
          slotEl.addEventListener('mousedown', (event) => {
            startMasterCreate(event, dayIndex, slot, baseRule);
          });
          slotEl.addEventListener('mouseenter', () => {
            moveMasterCreate(dayIndex, slot);
          });
          slotEl.addEventListener('mouseup', () => {
            finalizeMasterCreate();
          });

          if (isBaseLabelStart(dayIndex, slot, baseRule, state.weekStart)) {
            const baseLabel = document.createElement('span');
            baseLabel.className = 'base-slot-label';
            baseLabel.textContent = getBaseLabelText(baseRule);
            slotEl.appendChild(baseLabel);
          }

          rows.appendChild(slotEl);
        }
      }

      body.appendChild(rows);

      const overlay = document.createElement('div');
      overlay.className = 'events-overlay';
      overlay.style.top = `${Math.max(allDayRowHeight, allDayRow.offsetHeight || allDayRowHeight)}px`;
      body.appendChild(overlay);
      state.masterCreate.overlayEl = overlay;
      renderEventBubbles(overlay);
      syncCalendarHeaderScrollbarGap();
      requestAnimationFrame(syncCalendarHeaderScrollbarGap);
    }

    function renderEventBubbles(overlay) {
      if (!overlay) return;
      overlay.innerHTML = '';

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(state.weekStart, dayIndex));
        const events = getEventsForDate(date)
          .sort((a, b) => timeToSlot(a.start) - timeToSlot(b.start));

        const occupancy = Array.from({ length: slotsPerDay }, () => [false, false, false]);

        events.forEach((event) => {
          if (!event || isAllDayKind(event.kind)) return;
          const canManageOccurrence = canManageEventOccurrence(event, date);
          const startSlot = timeToSlot(event.start);
          const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
          const isOther = event.kind === '기타';
          const need = isOther ? 3 : Math.max(1, Math.min(3, Number(event.capacity || 1)));
          const lane = isOther ? 0 : findLane(occupancy, startSlot, endSlot, need);
          if (lane === -1) return;

          if (!isOther) {
            for (let slot = startSlot; slot < endSlot; slot += 1) {
              for (let laneIndex = lane; laneIndex < lane + need; laneIndex += 1) {
                occupancy[slot][laneIndex] = true;
              }
            }
          }

          const bubble = document.createElement('button');
          bubble.type = 'button';
          bubble.className = `event-bubble ${kindToClass(event.kind)}`;
          if (canManageOccurrence) {
            bubble.classList.add('has-delete');
          } else {
            setRoleLockedMessage(bubble);
          }
          bubble.style.top = `${startSlot * slotHeight + 1}px`;
          bubble.style.height = `${Math.max(slotHeight - 2, (endSlot - startSlot) * slotHeight - 2)}px`;
          bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
          bubble.style.width = `${((need / 3) / 7) * 100}%`;
          bubble.title = getEventDisplayTitle(event, '이용자 없음');
          bubble.innerHTML = `<strong>${escapeHtml(getEventDisplayTitle(event, '이용자 없음'))}</strong>`;

          if (canManageOccurrence) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'event-bubble-delete';
            deleteBtn.setAttribute('aria-label', '일정 삭제');
            deleteBtn.innerHTML = '<span aria-hidden="true">×</span>';
            deleteBtn.addEventListener('pointerdown', (pointerEvent) => {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
            });
            deleteBtn.addEventListener('touchstart', (touchEvent) => {
              touchEvent.preventDefault();
              touchEvent.stopPropagation();
            }, { passive: false });
            deleteBtn.addEventListener('click', (clickEvent) => {
              clickEvent.preventDefault();
              clickEvent.stopPropagation();
              requestDeleteEvent(event.id, date);
            });
            bubble.appendChild(deleteBtn);
          }
          bubble.dataset.eventId = String(event.id || '');
          bubble.dataset.dayIndex = String(dayIndex);
          bubble.dataset.date = date;
          bubble.dataset.startSlot = String(startSlot);
          bubble.dataset.endSlot = String(endSlot);
          bubble.dataset.need = String(need);
          bubble.dataset.lane = String(lane);
          if (canManageOccurrence) {
            bubble.classList.add('editable');
            bubble.addEventListener('pointerdown', (pointerEvent) => {
              if (String(pointerEvent?.pointerType || 'mouse') !== 'mouse') {
                return;
              }
              startMasterEventEdit(pointerEvent, event, dayIndex, date, startSlot, endSlot, lane, need, bubble);
            });
            bubble.addEventListener('click', (clickEvent) => {
              if (clickEvent.target && typeof clickEvent.target.closest === 'function' && clickEvent.target.closest('.event-bubble-delete')) {
                return;
              }
              if (Date.now() < state.masterEdit.suppressClickUntil) {
                return;
              }
              openQuickEditEventModal(event.id, date);
            });
          }
          overlay.appendChild(bubble);
        });
      }
    }

    return { render };
  }

  return { create };
});