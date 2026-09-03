(function initializeMasterCalendarOccupancy(root) {
  'use strict';

  const LANE_COUNT = 3;
  const DEFAULT_SLOT_COUNT = 48;

  function createEmptyDailyOccupancy(slotCount = DEFAULT_SLOT_COUNT) {
    return Array.from({ length: slotCount }, () => Array(LANE_COUNT).fill(false));
  }

  function cloneDailyOccupancy(occupancy, slotCount = DEFAULT_SLOT_COUNT) {
    return Array.from({ length: slotCount }, (_unused, slot) => {
      const row = Array.isArray(occupancy?.[slot]) ? occupancy[slot] : [];
      return [Boolean(row[0]), Boolean(row[1]), Boolean(row[2])];
    });
  }

  function canPlaceInLane(occupancy, startSlot, endSlot, need, lane) {
    if (!Array.isArray(occupancy)) return false;
    if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot) return false;
    if (!Number.isInteger(need) || need < 1 || need > LANE_COUNT) return false;
    if (!Number.isInteger(lane) || lane < 0 || lane + need > LANE_COUNT) return false;

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      if (!Array.isArray(occupancy[slot])) return false;
      for (let currentLane = lane; currentLane < lane + need; currentLane += 1) {
        if (occupancy[slot][currentLane]) return false;
      }
    }
    return true;
  }

  function findLane(occupancy, startSlot, endSlot, need) {
    for (let lane = 0; lane <= LANE_COUNT - need; lane += 1) {
      if (canPlaceInLane(occupancy, startSlot, endSlot, need, lane)) return lane;
    }
    return -1;
  }

  function markLaneOccupancy(occupancy, startSlot, endSlot, lane, need) {
    for (let slot = startSlot; slot < endSlot; slot += 1) {
      for (let currentLane = lane; currentLane < lane + need; currentLane += 1) {
        occupancy[slot][currentLane] = true;
      }
    }
  }

  function buildDailyOccupancy(options = {}) {
    const occupancy = createEmptyDailyOccupancy(options.slotCount);
    const events = Array.isArray(options.events) ? options.events : [];
    const excludeEventId = options.excludeEventId;
    const timeToSlot = options.timeToSlot;
    const isIgnoredKind = options.isIgnoredKind;

    events.forEach((event) => {
      if (excludeEventId && event && event.id === excludeEventId) return;
      if (event && typeof isIgnoredKind === 'function' && isIgnoredKind(event.kind)) return;
      const startSlot = timeToSlot(event.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
      const need = Math.max(1, Math.min(LANE_COUNT, Number(event.capacity || 1)));
      const lane = findLane(occupancy, startSlot, endSlot, need);
      if (lane < 0) return;
      markLaneOccupancy(occupancy, startSlot, endSlot, lane, need);
    });

    return occupancy;
  }

  function getRuleForSlot(rules, dayIndex, slot) {
    let resolved = null;
    (Array.isArray(rules) ? rules : []).forEach((rule) => {
      if (rule.day === dayIndex && slot >= rule.startSlot && slot < rule.endSlot) resolved = rule;
    });
    return resolved;
  }

  function isPlacementAllowed(options = {}) {
    const kind = options.kind;
    const dayIndex = options.dayIndex;
    const startSlot = options.startSlot;
    const endSlot = options.endSlot;
    if (dayIndex < 0 || endSlot <= startSlot) return false;
    if (kind === '기타' || (typeof options.isAllDayKind === 'function' && options.isAllDayKind(kind))) return true;

    if (kind === '수강') {
      const startRule = getRuleForSlot(options.rules, dayIndex, startSlot);
      const endRule = getRuleForSlot(options.rules, dayIndex, endSlot - 1);
      if (!startRule || !endRule || startRule.id !== endRule.id) return false;
      return startRule.type === '수업시간'
        && Number(startRule.startSlot) === Number(startSlot)
        && Number(startRule.endSlot) === Number(endSlot);
    }

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      const rule = getRuleForSlot(options.rules, dayIndex, slot);
      if (kind === '개인작업' && (!rule || rule.type !== '개인작업 시간')) return false;
      if (kind === '강사 지도 하 개인작업' && (!rule || rule.type !== '수업시간')) return false;
    }
    return true;
  }

  const api = Object.freeze({
    buildDailyOccupancy,
    canPlaceInLane,
    cloneDailyOccupancy,
    createEmptyDailyOccupancy,
    findLane,
    hasEnoughCapacityForRange(occupancy, startSlot, endSlot, need) {
      return findLane(occupancy, startSlot, endSlot, need) >= 0;
    },
    isPlacementAllowed,
    markLaneOccupancy
  });

  root.MasterCalendarOccupancy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);