(function initializeMasterCalendarBaseRules(root) {
  'use strict';

  function create(dependencies) {
    const { state, getWeekStart, formatDateInput, createBaseRuleId } = dependencies;

    function getBaseEditorWeekStart() {
      return getWeekStart(state.baseEditorWeekStart || state.weekStart || new Date());
    }

    function getBaseWeekKey(weekStartDate) {
      return formatDateInput(getWeekStart(weekStartDate || new Date()));
    }

    function cloneBaseRules(rules) {
      return (rules || []).map((rule) => ({ ...rule }));
    }

    function cloneBaseRuleTimeline(timeline) {
      return (timeline || []).map((entry) => ({
        weekKey: String(entry?.weekKey || ''),
        rules: cloneBaseRules(entry?.rules)
      })).filter((entry) => entry.weekKey);
    }

    function normalizeBaseRule(rule) {
      return {
        ...rule,
        day: Number(rule?.day || 0),
        startSlot: Number(rule?.startSlot || 0),
        endSlot: Number(rule?.endSlot || 1),
        className: String(rule?.className || '').trim(),
        instructor: String(rule?.instructor || '').trim()
      };
    }

    function getTemplateRulesForWeek(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      let resolved = null;
      (state.baseRuleTimeline || []).forEach((entry) => {
        const key = String(entry?.weekKey || '');
        if (!key || key > weekKey) return;
        if (!resolved || key > resolved.weekKey) {
          resolved = { weekKey: key, rules: entry.rules };
        }
      });
      if (resolved) return resolved.rules;
      return state.baseRules;
    }

    function getRulesForWeek(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      const override = state.baseWeekOverrides[weekKey];
      if (Array.isArray(override)) return override;
      return getTemplateRulesForWeek(weekStartDate || state.weekStart);
    }

    function hasWeekOverride(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      return Array.isArray(state.baseWeekOverrides[weekKey]);
    }

    function ensureWeekOverrideRules(weekStartDate) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      if (!Array.isArray(state.baseWeekOverrides[weekKey])) {
        state.baseWeekOverrides[weekKey] = cloneBaseRules(getTemplateRulesForWeek(weekStartDate || state.weekStart));
      }
      return state.baseWeekOverrides[weekKey];
    }

    function getRulesByScope(scope, weekStartDate) {
      if (scope === 'all') return getTemplateRulesForWeek(weekStartDate || getBaseEditorWeekStart());
      return ensureWeekOverrideRules(weekStartDate || getBaseEditorWeekStart());
    }

    function getTemplateRulesFromSnapshotForWeekKey(weekKey, snapshot) {
      const timeline = Array.isArray(snapshot?.baseRuleTimeline) ? snapshot.baseRuleTimeline : [];
      let resolved = null;
      timeline.forEach((entry) => {
        const key = String(entry?.weekKey || '');
        if (!key || key > weekKey) return;
        if (!resolved || key > resolved.weekKey) {
          resolved = { weekKey: key, rules: entry.rules };
        }
      });
      if (resolved) return cloneBaseRules(resolved.rules);
      return cloneBaseRules(snapshot?.baseRules);
    }

    function setTemplateRulesForWeekFrom(weekStartDate, nextRules) {
      const weekKey = getBaseWeekKey(weekStartDate || state.weekStart);
      const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
        .filter((entry) => String(entry.weekKey || '') !== weekKey);
      timeline.push({ weekKey, rules: cloneBaseRules(nextRules) });
      timeline.sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
      state.baseRuleTimeline = timeline;
    }

    function getRuleComparableSignature(rule) {
      const day = Number(rule?.day || 0);
      const startSlot = Number(rule?.startSlot || 0);
      const endSlot = Number(rule?.endSlot || 1);
      const type = String(rule?.type || '');
      const className = String(rule?.className || '').trim();
      const instructor = String(rule?.instructor || '').trim();
      return `${day}|${startSlot}|${endSlot}|${type}|${className}|${instructor}`;
    }

    function areRuleSetsEquivalent(left, right) {
      const leftRules = Array.isArray(left) ? left : [];
      const rightRules = Array.isArray(right) ? right : [];
      if (leftRules.length !== rightRules.length) return false;
      const leftSignatures = leftRules.map((rule) => getRuleComparableSignature(rule)).sort();
      const rightSignatures = rightRules.map((rule) => getRuleComparableSignature(rule)).sort();
      for (let index = 0; index < leftSignatures.length; index += 1) {
        if (leftSignatures[index] !== rightSignatures[index]) return false;
      }
      return true;
    }

    function normalizeTemplateTimeline() {
      const timeline = cloneBaseRuleTimeline(state.baseRuleTimeline)
        .sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
      const normalized = [];
      let previousRules = cloneBaseRules(state.baseRules);
      timeline.forEach((entry) => {
        if (!areRuleSetsEquivalent(entry.rules, previousRules)) {
          normalized.push({
            weekKey: String(entry.weekKey),
            rules: cloneBaseRules(entry.rules)
          });
          previousRules = cloneBaseRules(entry.rules);
        }
      });
      state.baseRuleTimeline = normalized;
    }

    function reconcileWeekOverridesAfterTemplateChange(templateSnapshot, startWeekKey) {
      Object.entries(state.baseWeekOverrides || {}).forEach(([weekKey, rules]) => {
        if (!Array.isArray(rules)) return;
        if (startWeekKey && weekKey < startWeekKey) return;
        const previousTemplate = getTemplateRulesFromSnapshotForWeekKey(weekKey, templateSnapshot);
        if (areRuleSetsEquivalent(rules, previousTemplate)) {
          delete state.baseWeekOverrides[weekKey];
        }
      });
    }

    function rangesOverlap(startA, endA, startB, endB) {
      return Math.max(startA, startB) < Math.min(endA, endB);
    }

    function applyMovedRuleOverride(targetRules, movedRule) {
      if (!Array.isArray(targetRules) || !movedRule) return;

      const movedDay = Number(movedRule.day);
      const movedStart = Number(movedRule.startSlot);
      const movedEnd = Number(movedRule.endSlot);
      const movedId = String(movedRule.id || '');
      if (!Number.isInteger(movedDay) || movedEnd <= movedStart || !movedId) return;

      const nextRules = [];
      targetRules.forEach((rule) => {
        if (!rule || String(rule.id || '') === movedId) return;
        const day = Number(rule.day);
        const start = Number(rule.startSlot);
        const end = Number(rule.endSlot);
        if (day !== movedDay || !rangesOverlap(movedStart, movedEnd, start, end)) {
          nextRules.push(rule);
          return;
        }
        if (start < movedStart) {
          const leftEnd = Math.min(end, movedStart);
          if (leftEnd > start) {
            nextRules.push({ ...rule, id: createBaseRuleId(), startSlot: start, endSlot: leftEnd });
          }
        }
        if (end > movedEnd) {
          const rightStart = Math.max(start, movedEnd);
          if (end > rightStart) {
            nextRules.push({ ...rule, id: createBaseRuleId(), startSlot: rightStart, endSlot: end });
          }
        }
      });
      nextRules.push(movedRule);
      targetRules.length = 0;
      nextRules.forEach((rule) => targetRules.push(rule));
    }

    return Object.freeze({
      getBaseWeekKey,
      cloneBaseRules,
      cloneBaseRuleTimeline,
      normalizeBaseRule,
      getRulesForWeek,
      hasWeekOverride,
      ensureWeekOverrideRules,
      getRulesByScope,
      getTemplateRulesFromSnapshotForWeekKey,
      getTemplateRulesForWeek,
      setTemplateRulesForWeekFrom,
      normalizeTemplateTimeline,
      reconcileWeekOverridesAfterTemplateChange,
      getRuleComparableSignature,
      areRuleSetsEquivalent,
      rangesOverlap,
      applyMovedRuleOverride
    });
  }

  const api = Object.freeze({ create });
  root.MasterCalendarBaseRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);