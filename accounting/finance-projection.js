(function initializePotteryAccountingFinanceProjection(root) {
  'use strict';

  function buildFinanceForTab(options) {
    const tab = options?.tab;
    const monthKey = options?.monthKey;
    const definitions = options?.definitionsByTab?.[tab] || { revenue: [], expense: [] };
    const revenueCategories = definitions.revenue.map((category) => buildCategorySnapshot({
      ...options,
      side: 'revenue',
      category
    }));
    const expenseCategories = definitions.expense.map((category) => buildCategorySnapshot({
      ...options,
      side: 'expense',
      category
    }));
    const revenueTotal = revenueCategories.reduce((sum, category) => sum + category.total, 0);
    const expenseTotal = expenseCategories.reduce((sum, category) => sum + category.total, 0);

    return {
      tab,
      monthKey,
      revenueCategories,
      expenseCategories,
      revenueTotal,
      expenseTotal,
      profit: revenueTotal - expenseTotal
    };
  }

  function buildCategorySnapshot(options) {
    const tab = options?.tab;
    const side = options?.side;
    const category = options?.category;
    const monthKey = options?.monthKey;
    const categoryId = `${tab}:${side}:${category}`;
    const autoEntries = options?.buildAutoEntries(tab, side, category, monthKey) || [];
    const manualEntries = buildManualEntries(options);
    const merged = mergeCategoryEntries({
      autoEntries,
      manualEntries,
      getOverrideKey: options?.helpers?.getOverrideKey
    });
    const total = merged.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const autoCategoryIds = options?.autoCategoryIds instanceof Set
      ? options.autoCategoryIds
      : new Set(options?.autoCategoryIds || []);

    return {
      id: categoryId,
      tab,
      side,
      category,
      entries: merged,
      total,
      hasAuto: autoCategoryIds.has(categoryId)
    };
  }

  function buildManualEntries(options) {
    const tab = options?.tab;
    const side = options?.side;
    const category = options?.category;
    const monthKey = options?.monthKey;
    const entries = Array.isArray(options?.entries) ? options.entries : [];
    const monthStart = options?.monthStart;
    const helpers = options?.helpers || {};
    const exactMonth = [];
    const fixedEntries = [];

    entries.forEach((entry) => {
      if (!entry) return;
      if (entry.tab !== tab || entry.side !== side || entry.category !== category) return;
      const entryMonth = helpers.getMonthKeyFromDate(helpers.parseDateOnly(entry.date) || monthStart);

      if (entryMonth === monthKey) {
        exactMonth.push(entry);
      } else if (entry.fixed && entryMonth < monthKey && isFixedEntryActiveInMonth({ entry, monthKey, normalizeMonthKey: helpers.normalizeMonthKey })) {
        fixedEntries.push(entry);
      }
    });

    const usedTitleInExactMonth = new Set(exactMonth.map((entry) => helpers.normalizeNameKey(entry.title)));
    const scopedFixed = fixedEntries.filter((entry) => !usedTitleInExactMonth.has(helpers.normalizeNameKey(entry.title)));
    const fixedByTitle = new Map();

    scopedFixed.forEach((entry) => {
      const key = helpers.normalizeNameKey(entry.title);
      const previous = fixedByTitle.get(key);
      if (!previous) {
        fixedByTitle.set(key, entry);
        return;
      }

      const previousMonth = helpers.getMonthKeyFromDate(helpers.parseDateOnly(previous.date) || monthStart);
      const nextMonth = helpers.getMonthKeyFromDate(helpers.parseDateOnly(entry.date) || monthStart);
      if (nextMonth > previousMonth) fixedByTitle.set(key, entry);
    });

    const result = [];
    exactMonth.forEach((entry) => result.push(projectManualEntry(entry, { tab, side, category, monthKey })));
    fixedByTitle.forEach((entry) => result.push(projectManualEntry(entry, { tab, side, category, monthKey })));
    return sortEntries(result);
  }

  function projectManualEntry(entry, context) {
    return {
      id: entry.id,
      source: 'manual',
      side: context.side,
      category: context.category,
      date: entry.date,
      title: entry.title,
      amount: entry.amount,
      fixed: Boolean(entry.fixed && (!entry.fixedThroughMonth || context.monthKey < entry.fixedThroughMonth)),
      fixedThroughMonth: entry.fixedThroughMonth,
      overrideKey: entry.overrideKey,
      deleted: entry.deleted,
      tab: context.tab
    };
  }

  function isFixedEntryActiveInMonth(options) {
    const throughMonth = options?.normalizeMonthKey(options?.entry?.fixedThroughMonth);
    return !throughMonth || options?.monthKey <= throughMonth;
  }

  function mergeCategoryEntries(options) {
    const autoEntries = Array.isArray(options?.autoEntries) ? options.autoEntries : [];
    const manualEntries = Array.isArray(options?.manualEntries) ? options.manualEntries : [];
    const getOverrideKey = options?.getOverrideKey;
    const merged = [];
    const manualByKey = new Map();

    manualEntries.forEach((entry) => {
      const key = entry.overrideKey || getOverrideKey(entry);
      manualByKey.set(key, entry);
    });

    autoEntries.forEach((entry) => {
      const key = getOverrideKey(entry);
      if (!manualByKey.has(key)) merged.push(entry);
    });

    manualEntries.forEach((entry) => {
      if (!entry.deleted) merged.push(entry);
    });
    return sortEntries(merged);
  }

  function sortEntries(entries) {
    return entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });
  }

  const api = Object.freeze({
    buildFinanceForTab,
    buildManualEntries,
    isFixedEntryActiveInMonth,
    mergeCategoryEntries
  });
  root.PotteryAccountingFinanceProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
