(function (root, factory) {
  const api = factory();
  root.MasterCalendarPointerController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      document,
      state,
      slotsPerDay,
      slotHeight,
      resizeEdgePx,
      canManageEventOccurrence,
      getCalendarZoomFactor,
      getBaseRuleForSlot,
      formatDateInput,
      addDays,
      slotToTime,
      canManageEventPlacementByRole,
      isEventPlacementAllowed,
      buildDailyOccupancyMap,
      occupancy,
      commandPlanner,
      getClassBaseRuleForRange,
      applyClassEventBaseMetadata,
      saveState,
      refreshWorkshopUsageUi,
      openQuickEditEventModal,
      openModal,
      resetMasterCreateState,
      finalizeMasterCreate,
      renderCalendar
    } = dependencies;

    function getMasterPointerDaySlot(clientX, clientY) {
      const pointed = document.elementFromPoint(clientX, clientY);
      const slotEl = pointed && typeof pointed.closest === 'function'
        ? pointed.closest('.day-slot')
        : null;

      if (slotEl) {
        const day = Number(slotEl.dataset.dayIndex);
        const slot = Number(slotEl.dataset.slot);
        if (Number.isInteger(day) && Number.isInteger(slot)) {
          return { day, slot };
        }
      }

      const body = document.getElementById('calendar-body');
      if (!body) return null;
      const rect = body.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
      }

      const totalWidth = rect.width - 64;
      if (totalWidth <= 0) return null;

      const allDayRow = body.querySelector('.calendar-all-day-row');
      const allDayOffset = allDayRow ? allDayRow.offsetHeight : 0;

      const x = clientX - rect.left - 64;
      const y = clientY - rect.top + body.scrollTop - allDayOffset;
      const day = Math.max(0, Math.min(6, Math.floor((x / totalWidth) * 7)));
      const slot = Math.max(0, Math.min(slotsPerDay - 1, Math.floor(y / (slotHeight * getCalendarZoomFactor()))));
      return { day, slot };
    }

    function buildMasterEditOccupancySnapshot(excludeEventId) {
      const snapshot = {};
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = formatDateInput(addDays(state.weekStart, dayIndex));
        snapshot[date] = occupancy.createEmptyDailyOccupancy(slotsPerDay);
      }

      const bubbles = Array.from(document.querySelectorAll('#calendar-body .events-overlay .event-bubble[data-event-id]'));
      bubbles.forEach((bubble) => {
        const eventId = String(bubble?.dataset?.eventId || '');
        if (!eventId || (excludeEventId && eventId === excludeEventId)) return;

        const date = String(bubble?.dataset?.date || '').trim();
        if (!date || !snapshot[date]) return;

        const startSlot = Number(bubble?.dataset?.startSlot);
        const endSlot = Number(bubble?.dataset?.endSlot);
        const lane = Number(bubble?.dataset?.lane);
        const need = Math.max(1, Math.min(3, Number(bubble?.dataset?.need || 1)));

        if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) return;
        if (!occupancy.canPlaceInLane(snapshot[date], startSlot, endSlot, need, lane)) return;

        occupancy.markLaneOccupancy(snapshot[date], startSlot, endSlot, lane, need);
      });

      return snapshot;
    }

    function getMasterEditOccupancyMap(date) {
      const key = String(date || '').trim();
      const snapshot = state.masterEdit.occupancySnapshot;
      const saved = snapshot && snapshot[key];
      if (saved) {
        return occupancy.cloneDailyOccupancy(saved, slotsPerDay);
      }
      return buildDailyOccupancyMap(key, state.masterEdit.eventId);
    }

    function startMasterEventEdit(event, item, dayIndex, occurrenceDate, startSlot, endSlot, lane, need, bubble) {
      if (!event) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!item) return;
      if (!canManageEventOccurrence(item, occurrenceDate)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resetMasterCreateState();

      const edge = item.kind === '수강' ? '' : getMasterEventResizeEdge(event, bubble);
      const pointer = getMasterPointerDaySlot(event.clientX, event.clientY);

      state.masterEdit.active = true;
      state.masterEdit.eventId = item.id;
      state.masterEdit.occurrenceDate = String(occurrenceDate || '');
      state.masterEdit.mode = edge ? 'resize' : 'move';
      state.masterEdit.edge = edge || '';
      state.masterEdit.dayIndex = dayIndex;
      state.masterEdit.startSlot = startSlot;
      state.masterEdit.endSlot = endSlot;
      state.masterEdit.duration = Math.max(1, endSlot - startSlot);
      state.masterEdit.capacity = Math.max(1, Math.min(3, Number(item.capacity || 1)));
      state.masterEdit.originLane = Number.isInteger(lane) ? lane : 0;
      state.masterEdit.kind = String(item.kind || '');
      state.masterEdit.title = String(item.title || '');
      state.masterEdit.repeatWeekly = Boolean(item.repeatWeekly);
      state.masterEdit.anchorOffset = pointer ? Math.max(0, pointer.slot - startSlot) : 0;
      state.masterEdit.pointerDownX = Number(event.clientX || 0);
      state.masterEdit.pointerDownY = Number(event.clientY || 0);
      state.masterEdit.pointerId = event.pointerType === 'touch'
        ? null
        : (Number.isFinite(event.pointerId) ? Number(event.pointerId) : null);
      state.masterEdit.touchIdentifier = event.pointerType === 'touch' && Number.isFinite(event.touchIdentifier)
        ? Number(event.touchIdentifier)
        : null;
      state.masterEdit.pointerMoved = false;
      state.masterEdit.bubbleEl = bubble;
      state.masterEdit.occupancySnapshot = buildMasterEditOccupancySnapshot(item.id);
      state.masterEdit.validPreview = true;
      state.masterEdit.targetDayIndex = dayIndex;
      state.masterEdit.targetStartSlot = startSlot;
      state.masterEdit.targetEndSlot = endSlot;
      state.masterEdit.targetLane = Number.isInteger(lane) ? lane : 0;

      if (bubble) {
        bubble.classList.add('editing');
        if (state.masterEdit.pointerId !== null && typeof bubble.setPointerCapture === 'function') {
          try {
            bubble.setPointerCapture(state.masterEdit.pointerId);
          } catch (_error) {
            // Ignore capture errors for unsupported environments.
          }
        }
      }
      document.body.classList.add('is-dragging-base');
    }

    function getMasterEventResizeEdge(event, bubble) {
      if (!event || !bubble) return '';
      const rect = bubble.getBoundingClientRect();
      const edgePx = event.pointerType === 'touch'
        ? Math.max(resizeEdgePx, 14)
        : resizeEdgePx;
      const y = Number(event.clientY - rect.top);
      if (y <= edgePx) return 'start';
      if (y >= Math.max(0, rect.height - edgePx)) return 'end';
      return '';
    }

    function handleMasterCalendarPointerMove(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.pointerId !== null && Number(event.pointerId) !== state.masterEdit.pointerId) return;
      applyMasterCalendarEditMove(event?.clientX, event?.clientY, event);
    }

    function applyMasterCalendarEditMove(clientX, clientY, sourceEvent) {
      if (!state.masterEdit.active) return;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
      if (sourceEvent && sourceEvent.cancelable) sourceEvent.preventDefault();

      if (
        Math.abs(clientX - state.masterEdit.pointerDownX) > 3
        || Math.abs(clientY - state.masterEdit.pointerDownY) > 3
      ) {
        state.masterEdit.pointerMoved = true;
      }

      const pointer = getMasterPointerDaySlot(clientX, clientY);
      if (!pointer) return;

      let nextDay = state.masterEdit.dayIndex;
      let nextStart = state.masterEdit.startSlot;
      let nextEnd = state.masterEdit.endSlot;

      if (state.masterEdit.mode === 'move') {
        if (state.masterEdit.kind === '수강') {
          const classRule = getBaseRuleForSlot(pointer.day, pointer.slot);
          if (!classRule || classRule.type !== '수업시간') {
            state.masterEdit.validPreview = false;
            return;
          }
          nextDay = pointer.day;
          nextStart = Number(classRule.startSlot);
          nextEnd = Number(classRule.endSlot);
        } else {
          nextDay = pointer.day;
          nextStart = Math.max(0, Math.min(pointer.slot - state.masterEdit.anchorOffset, slotsPerDay - state.masterEdit.duration));
          nextEnd = nextStart + state.masterEdit.duration;
        }
      } else if (state.masterEdit.mode === 'resize') {
        nextDay = state.masterEdit.dayIndex;
        if (state.masterEdit.edge === 'start') {
          nextStart = Math.max(0, Math.min(pointer.slot, state.masterEdit.endSlot - 1));
          nextEnd = state.masterEdit.endSlot;
        } else if (state.masterEdit.edge === 'end') {
          nextStart = state.masterEdit.startSlot;
          nextEnd = Math.min(slotsPerDay, Math.max(pointer.slot + 1, state.masterEdit.startSlot + 1));
        }
      }

      const placement = getMasterEditPlacement(nextDay, nextStart, nextEnd, {
        preferredLane: state.masterEdit.originLane,
        requirePreferredLane: state.masterEdit.mode === 'resize'
      });
      if (!placement) {
        state.masterEdit.validPreview = false;
        return;
      }

      state.masterEdit.validPreview = true;
      state.masterEdit.targetDayIndex = nextDay;
      state.masterEdit.targetStartSlot = nextStart;
      state.masterEdit.targetEndSlot = nextEnd;
      state.masterEdit.targetLane = placement.lane;
      applyMasterEditPreview();
    }

    function getMasterEditPlacement(dayIndex, startSlot, endSlot, options) {
      const kind = state.masterEdit.kind;
      const cap = state.masterEdit.capacity;
      if (!kind || endSlot <= startSlot) return null;

      const date = formatDateInput(addDays(state.weekStart, dayIndex));
      const start = slotToTime(startSlot);
      const end = slotToTime(endSlot);
      if (!canManageEventPlacementByRole(kind, date, start, end, state.masterEdit.title)) return null;
      if (!isEventPlacementAllowed(kind, dayIndex, startSlot, endSlot)) return null;

      const occupancyMap = getMasterEditOccupancyMap(date);
      const preferredLaneRaw = Number(options?.preferredLane);
      const preferredLane = Number.isInteger(preferredLaneRaw) ? preferredLaneRaw : null;
      const requirePreferredLane = Boolean(options?.requirePreferredLane);

      if (preferredLane !== null && occupancy.canPlaceInLane(occupancyMap, startSlot, endSlot, cap, preferredLane)) {
        return { lane: preferredLane };
      }
      if (requirePreferredLane) return null;

      const lane = occupancy.findLane(occupancyMap, startSlot, endSlot, cap);
      if (lane < 0) return null;
      return { lane };
    }

    function applyMasterEditPreview() {
      const bubble = state.masterEdit.bubbleEl;
      if (!bubble || !state.masterEdit.validPreview) return;

      const dayIndex = Number(state.masterEdit.targetDayIndex);
      const startSlot = Number(state.masterEdit.targetStartSlot);
      const endSlot = Number(state.masterEdit.targetEndSlot);
      const lane = Number(state.masterEdit.targetLane || 0);
      const cap = Number(state.masterEdit.capacity || 1);

      bubble.style.top = `${startSlot * slotHeight + 1}px`;
      bubble.style.height = `${Math.max(slotHeight - 2, (endSlot - startSlot) * slotHeight - 2)}px`;
      bubble.style.left = `${((dayIndex + (lane / 3)) / 7) * 100}%`;
      bubble.style.width = `${((cap / 3) / 7) * 100}%`;
    }

    function handleMasterCalendarPointerUp(event) {
      if (!event) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.active && state.masterEdit.pointerId !== null && Number(event.pointerId) !== state.masterEdit.pointerId) {
        return;
      }
      finalizeMasterCalendarEdit(event.clientX, event.clientY);
    }

    function finalizeMasterCalendarEdit(clientX, clientY) {
      if (state.masterEdit.active) {
        const edit = state.masterEdit;
        const editEventId = edit.eventId;
        const shouldOpenQuickEdit = Boolean(editEventId) && !edit.pointerMoved;

        if (edit.kind === '수강' && typeof clientX === 'number' && typeof clientY === 'number') {
          const pointer = getMasterPointerDaySlot(clientX, clientY);
          if (pointer) {
            const classRule = getBaseRuleForSlot(pointer.day, pointer.slot);
            if (classRule && classRule.type === '수업시간') {
              const snapStart = Number(classRule.startSlot);
              const snapEnd = Number(classRule.endSlot);
              const placement = getMasterEditPlacement(pointer.day, snapStart, snapEnd, {
                preferredLane: edit.originLane
              });
              if (placement) {
                edit.validPreview = true;
                edit.targetDayIndex = pointer.day;
                edit.targetStartSlot = snapStart;
                edit.targetEndSlot = snapEnd;
                edit.targetLane = placement.lane;
              } else {
                edit.validPreview = false;
              }
            } else {
              edit.validPreview = false;
            }
          }
        }

        const eventItem = state.events.find((item) => item.id === edit.eventId);
        if (eventItem && edit.validPreview) {
          const nextDate = formatDateInput(addDays(state.weekStart, edit.targetDayIndex));
          const nextStart = slotToTime(edit.targetStartSlot);
          const nextEnd = slotToTime(edit.targetEndSlot);
          const nextClassRule = eventItem.kind === '수강'
            ? getClassBaseRuleForRange(nextDate, nextStart, nextEnd)
            : null;
          const plan = commandPlanner.planPointerEdit({
            edit,
            event: eventItem,
            viewMode: state.viewMode,
            originalDate: String(edit.occurrenceDate || formatDateInput(addDays(state.weekStart, edit.dayIndex || 0)) || ''),
            originalStart: slotToTime(Number(edit.startSlot || 0)),
            originalEnd: slotToTime(Number(edit.endSlot || 1)),
            target: {
              dayIndex: edit.targetDayIndex,
              startSlot: edit.targetStartSlot,
              endSlot: edit.targetEndSlot,
              date: nextDate,
              start: nextStart,
              end: nextEnd
            },
            nextClassRule
          });

          if (plan.action === 'prompt-recurring') {
            Object.assign(state.recurringMove, plan.recurringMove);

            resetMasterEditState();
            renderCalendar();
            openModal('recurring-move-modal');
            return;
          }

          if (plan.action === 'update') {
            Object.assign(eventItem, plan.patch);
            applyClassEventBaseMetadata(eventItem, nextDate);
            saveState();
          }
        }

        resetMasterEditState();
        renderCalendar();
        refreshWorkshopUsageUi();

        if (shouldOpenQuickEdit) {
          openQuickEditEventModal(editEventId, edit.occurrenceDate || '');
        }
        return;
      }

      if (state.masterCreate.active) {
        finalizeMasterCreate();
      }
    }

    function handleMasterCalendarPointerCancel(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier !== null) return;
      if (state.masterEdit.pointerId !== null && Number(event?.pointerId) !== state.masterEdit.pointerId) return;
      resetMasterEditState();
      renderCalendar();
    }

    function getTrackedMasterTouch(event) {
      const tracked = state.masterEdit.touchIdentifier;
      if (!Number.isFinite(tracked)) return null;
      const changed = Array.from(event?.changedTouches || []);
      const active = Array.from(event?.touches || []);
      const allTouches = changed.concat(active);
      return allTouches.find((touch) => Number(touch.identifier) === Number(tracked)) || null;
    }

    function handleMasterCalendarTouchMove(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      const touch = getTrackedMasterTouch(event);
      if (!touch) return;
      applyMasterCalendarEditMove(touch.clientX, touch.clientY, event);
    }

    function handleMasterCalendarTouchEnd(event) {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      const touch = getTrackedMasterTouch(event);
      if (touch) {
        finalizeMasterCalendarEdit(touch.clientX, touch.clientY);
        return;
      }
      finalizeMasterCalendarEdit();
    }

    function handleMasterCalendarTouchCancel() {
      if (!state.masterEdit.active) return;
      if (state.masterEdit.touchIdentifier === null) return;
      resetMasterEditState();
      renderCalendar();
    }

    function resetMasterEditState() {
      const bubble = state.masterEdit.bubbleEl;
      const pointerId = state.masterEdit.pointerId;
      if (bubble) {
        bubble.classList.remove('editing');
        if (pointerId !== null && typeof bubble.hasPointerCapture === 'function' && typeof bubble.releasePointerCapture === 'function') {
          try {
            if (bubble.hasPointerCapture(pointerId)) {
              bubble.releasePointerCapture(pointerId);
            }
          } catch (_error) {
            // Ignore release errors for unsupported environments.
          }
        }
      }
      document.body.classList.remove('is-dragging-base');
      state.masterEdit.active = false;
      state.masterEdit.eventId = null;
      state.masterEdit.occurrenceDate = '';
      state.masterEdit.mode = '';
      state.masterEdit.edge = '';
      state.masterEdit.dayIndex = null;
      state.masterEdit.startSlot = null;
      state.masterEdit.endSlot = null;
      state.masterEdit.duration = 1;
      state.masterEdit.capacity = 1;
      state.masterEdit.originLane = 0;
      state.masterEdit.kind = '';
      state.masterEdit.title = '';
      state.masterEdit.repeatWeekly = false;
      state.masterEdit.anchorOffset = 0;
      state.masterEdit.bubbleEl = null;
      state.masterEdit.occupancySnapshot = null;
      state.masterEdit.validPreview = false;
      state.masterEdit.targetDayIndex = null;
      state.masterEdit.targetStartSlot = null;
      state.masterEdit.targetEndSlot = null;
      state.masterEdit.targetLane = 0;
      state.masterEdit.pointerDownX = 0;
      state.masterEdit.pointerDownY = 0;
      state.masterEdit.pointerId = null;
      state.masterEdit.touchIdentifier = null;
      state.masterEdit.pointerMoved = false;
      state.masterEdit.suppressClickUntil = Date.now() + 220;
    }

    return {
      getMasterPointerDaySlot,
      buildMasterEditOccupancySnapshot,
      getMasterEditOccupancyMap,
      startMasterEventEdit,
      getMasterEventResizeEdge,
      handleMasterCalendarPointerMove,
      applyMasterCalendarEditMove,
      getMasterEditPlacement,
      applyMasterEditPreview,
      handleMasterCalendarPointerUp,
      finalizeMasterCalendarEdit,
      handleMasterCalendarPointerCancel,
      getTrackedMasterTouch,
      handleMasterCalendarTouchMove,
      handleMasterCalendarTouchEnd,
      handleMasterCalendarTouchCancel,
      resetMasterEditState
    };
  }

  return { create };
});