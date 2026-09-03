(function (root, factory) {
  const api = factory();
  root.MasterCalendarMonthView = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      dayNames,
      monthRows,
      monthRowHeight,
      getWeekStart,
      addDays,
      formatDateInput,
      isSameCalendarDate,
      isExhibitionKind,
      getEventsForDate,
      isAllDayKind,
      timeToSlot,
      kindToClass,
      getEventDisplayTitle,
      canManageEventOccurrence,
      setRoleLockedMessage,
      openQuickEditEventModal,
      syncCalendarHeaderScrollbarGap
    } = dependencies;

    function render(dayHeader, body, wrap) {
      if (!dayHeader || !body) return;
      dayHeader.innerHTML = '';
      body.innerHTML = '';

      if (wrap) wrap.classList.add('is-month-mode');
      dayHeader.classList.add('month-header');
      body.classList.add('month-body');

      dayNames.forEach((name) => {
        const header = document.createElement('div');
        header.className = 'month-day-header';
        header.textContent = name;
        dayHeader.appendChild(header);
      });

      const monthGrid = document.createElement('div');
      monthGrid.className = 'month-grid';
      monthGrid.style.setProperty('--month-row-height', `${monthRowHeight}px`);

      const gridStart = getWeekStart(state.monthStart);
      const gridEnd = addDays(gridStart, monthRows * 7 - 1);
      const currentMonth = state.monthStart.getMonth();
      const dateCellMap = new Map();
      const today = new Date();

      for (let i = 0; i < monthRows * 7; i += 1) {
        const dayDate = addDays(gridStart, i);
        const dateKey = formatDateInput(dayDate);
        const cell = document.createElement('div');
        cell.className = 'month-day-cell';
        if (dayDate.getMonth() !== currentMonth) {
          cell.classList.add('is-outside-month');
        }
        if (isSameCalendarDate(dayDate, today)) {
          cell.classList.add('is-today');
        }

        const dayNum = document.createElement('div');
        dayNum.className = 'month-day-number';
        dayNum.textContent = String(dayDate.getDate());
        if (isSameCalendarDate(dayDate, today)) {
          const badge = document.createElement('em');
          badge.className = 'today-badge';
          badge.textContent = '오늘';
          dayNum.appendChild(document.createTextNode(' '));
          dayNum.appendChild(badge);
        }
        cell.appendChild(dayNum);

        const timedStack = document.createElement('div');
        timedStack.className = 'month-events-stack';
        cell.appendChild(timedStack);

        monthGrid.appendChild(cell);
        dateCellMap.set(dateKey, { timedStack, cell });
      }

      const spanOverlay = document.createElement('div');
      spanOverlay.className = 'month-span-overlay';
      monthGrid.appendChild(spanOverlay);

      const exhibitions = state.events
        .filter((event) => event && event.id && isExhibitionKind(event.kind) && event.date)
        .map((event) => {
          const start = new Date(`${event.date}T00:00:00`);
          const end = new Date(`${(event.endDate || event.date)}T00:00:00`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
          return {
            event,
            start,
            end: end < start ? start : end
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aLen = Math.floor((a.end - a.start) / 86400000);
          const bLen = Math.floor((b.end - b.start) / 86400000);
          if (aLen !== bLen) return bLen - aLen;
          return a.start - b.start;
        });

      const rowLaneEnds = Array.from({ length: monthRows }, () => []);
      const spanLayouts = [];
      const daySpanLaneDepth = new Map();

      exhibitions.forEach((entry) => {
        if (entry.end < gridStart || entry.start > gridEnd) return;
        let cursor = entry.start < gridStart ? gridStart : entry.start;
        const finalEnd = entry.end > gridEnd ? gridEnd : entry.end;

        while (cursor <= finalEnd) {
          const row = Math.floor((cursor - gridStart) / (7 * 86400000));
          const rowStart = addDays(gridStart, row * 7);
          const rowEnd = addDays(rowStart, 6);
          const segStart = cursor;
          const segEnd = finalEnd < rowEnd ? finalEnd : rowEnd;
          const startCol = Math.max(0, Math.floor((segStart - rowStart) / 86400000));
          const endCol = Math.max(startCol, Math.floor((segEnd - rowStart) / 86400000));
          const spanDays = Math.max(1, endCol - startCol + 1);

          const laneEnds = rowLaneEnds[row] || [];
          let lane = 0;
          while (lane < laneEnds.length && startCol <= laneEnds[lane]) {
            lane += 1;
          }
          if (lane === laneEnds.length) laneEnds.push(endCol);
          else laneEnds[lane] = endCol;
          rowLaneEnds[row] = laneEnds;

          for (let col = startCol; col <= endCol; col += 1) {
            const dayKey = formatDateInput(addDays(rowStart, col));
            const currentDepth = Number(daySpanLaneDepth.get(dayKey) || 0);
            daySpanLaneDepth.set(dayKey, Math.max(currentDepth, lane + 1));
          }

          spanLayouts.push({
            eventId: entry.event.id,
            title: entry.event.title || '전시회',
            kind: entry.event.kind,
            row,
            lane,
            startCol,
            spanDays
          });

          cursor = addDays(segEnd, 1);
        }
      });

      for (let i = 0; i < monthRows * 7; i += 1) {
        const date = formatDateInput(addDays(gridStart, i));
        const refs = dateCellMap.get(date);
        if (!refs) continue;

        const spanDepth = Number(daySpanLaneDepth.get(date) || 0);
        refs.timedStack.style.paddingTop = `${2 + spanDepth * 18}px`;

        const events = (getEventsForDate(date) || [])
          .slice()
          .sort((a, b) => {
            const aAllDay = isAllDayKind(a.kind) ? 0 : 1;
            const bAllDay = isAllDayKind(b.kind) ? 0 : 1;
            if (aAllDay !== bAllDay) return aAllDay - bAllDay;

            if (aAllDay === 0 && bAllDay === 0) {
              const aStart = new Date(`${a.date}T00:00:00`);
              const aEnd = new Date(`${(a.endDate || a.date)}T00:00:00`);
              const bStart = new Date(`${b.date}T00:00:00`);
              const bEnd = new Date(`${(b.endDate || b.date)}T00:00:00`);
              const aLen = Math.max(0, Math.floor((aEnd - aStart) / 86400000));
              const bLen = Math.max(0, Math.floor((bEnd - bStart) / 86400000));
              if (aLen !== bLen) return bLen - aLen;
            }

            const slotDiff = timeToSlot(a.start) - timeToSlot(b.start);
            if (slotDiff !== 0) return slotDiff;
            const aOther = a.kind === '기타' ? 1 : 0;
            const bOther = b.kind === '기타' ? 1 : 0;
            if (aOther !== bOther) return aOther - bOther;
            return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
          });

        events.forEach((event) => {
          if (!event || !event.id) return;

          if (isExhibitionKind(event.kind)) {
            return;
          }

          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `month-mini-pill ${kindToClass(event.kind)}`;
          const start = event.start || '';
          const label = `${start ? `${start} ` : ''}${getEventDisplayTitle(event, '새 일정')}`;
          pill.textContent = label;
          if (!canManageEventOccurrence(event, date)) {
            setRoleLockedMessage(pill);
          }
          pill.addEventListener('click', () => {
            if (!canManageEventOccurrence(event, date)) return;
            openQuickEditEventModal(event.id, date);
          });
          refs.timedStack.appendChild(pill);
        });
      }

      spanLayouts.forEach((layout) => {
        const span = document.createElement('button');
        span.type = 'button';
        span.className = `month-span-pill ${kindToClass(layout.kind)}`;
        span.textContent = layout.title;
        span.style.left = `calc(${(layout.startCol / 7) * 100}% + 4px)`;
        span.style.width = `calc(${(layout.spanDays / 7) * 100}% - 8px)`;
        span.style.top = `${layout.row * monthRowHeight + 22 + layout.lane * 18}px`;
        const spanEvent = state.events.find((item) => item && item.id === layout.eventId);
        if (!canManageEventOccurrence(spanEvent, spanEvent?.date || '')) {
          setRoleLockedMessage(span);
        }
        span.addEventListener('click', () => {
          if (!canManageEventOccurrence(spanEvent, spanEvent?.date || '')) return;
          openQuickEditEventModal(layout.eventId, spanEvent?.date || '');
        });
        spanOverlay.appendChild(span);
      });

      body.appendChild(monthGrid);
      syncCalendarHeaderScrollbarGap();
    }

    return { render };
  }

  return { create };
});