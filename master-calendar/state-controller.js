(function (root, factory) {
  const api = factory();
  root.MasterCalendarStateController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(dependencies) {
    const {
      state,
      repository,
      normalizeBaseRule,
      isKilnKind,
      normalizeKilnCategory,
      extractKilnCategoryFromTitle,
      buildKilnEventTitle,
      loadStudioInstructors,
      rebuildClassTeachingLog,
      now,
      random
    } = dependencies;

    function saveState() {
      loadStudioInstructors();
      rebuildClassTeachingLog();
      repository.saveCalendarState({
        events: state.events,
        baseRules: state.baseRules,
        baseRuleTimeline: state.baseRuleTimeline,
        baseWeekOverrides: state.baseWeekOverrides,
        studioUsers: state.studioUsers,
        instructors: state.instructors,
        classTeachingLog: state.classTeachingLog
      });
    }

    function loadState() {
      try {
        const parsed = repository.loadCalendarState();
        state.events = Array.isArray(parsed.events)
          ? parsed.events.map((event) => {
              const kind = String(event?.kind || '').trim();
              const kilnCategory = isKilnKind(kind)
                ? (normalizeKilnCategory(event?.kilnCategory)
                  || extractKilnCategoryFromTitle(event?.title)
                  || '')
                : '';

              return {
                id: String(event?.id || `evt-${now()}-${random().toString(36).slice(2, 8)}`),
                kind,
                title: isKilnKind(kind)
                  ? buildKilnEventTitle(kilnCategory)
                  : String(event?.title || ''),
                kilnCategory,
                date: String(event?.date || ''),
                endDate: String(event?.endDate || ''),
                start: String(event?.start || ''),
                end: String(event?.end || ''),
                capacity: Math.max(1, Math.min(3, Number(event?.capacity || 1))),
                classType: String(event?.classType || '').trim(),
                instructor: String(event?.instructor || '').trim(),
                baseRuleId: String(event?.baseRuleId || '').trim(),
                repeatWeekly: Boolean(event?.repeatWeekly),
                repeatSkipDates: Array.isArray(event?.repeatSkipDates) ? event.repeatSkipDates.slice() : [],
                repeatEndDate: String(event?.repeatEndDate || '')
              };
            })
          : [];
        state.baseRules = Array.isArray(parsed.baseRules)
          ? parsed.baseRules.map((rule) => normalizeBaseRule(rule))
          : [];
        state.baseRuleTimeline = Array.isArray(parsed.baseRuleTimeline)
          ? parsed.baseRuleTimeline
              .map((entry) => ({
                weekKey: String(entry?.weekKey || '').trim(),
                rules: Array.isArray(entry?.rules) ? entry.rules.map((rule) => normalizeBaseRule(rule)) : []
              }))
              .filter((entry) => entry.weekKey)
          : [];
        state.baseWeekOverrides = {};
        if (parsed.baseWeekOverrides && typeof parsed.baseWeekOverrides === 'object') {
          Object.entries(parsed.baseWeekOverrides).forEach(([weekKey, rules]) => {
            if (!Array.isArray(rules)) return;
            state.baseWeekOverrides[weekKey] = rules.map((rule) => normalizeBaseRule(rule));
          });
        }
        state.studioUsers = Array.isArray(parsed.studioUsers) ? parsed.studioUsers : [];
        state.instructors = Array.isArray(parsed.instructors) ? parsed.instructors : [];
        state.classTeachingLog = Array.isArray(parsed.classTeachingLog) ? parsed.classTeachingLog : [];
      } catch (error) {
        state.events = [];
        state.baseRules = [];
        state.baseRuleTimeline = [];
        state.baseWeekOverrides = {};
        state.studioUsers = [];
        state.instructors = [];
        state.classTeachingLog = [];
      }

      loadStudioInstructors();
      rebuildClassTeachingLog();
    }

    return Object.freeze({
      loadState,
      saveState
    });
  }

  return Object.freeze({ create });
});