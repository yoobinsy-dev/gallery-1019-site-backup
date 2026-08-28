(function initializePotteryMaterialOrdersMergePlanning(root) {
  'use strict';

  function buildVerticalSelection(options) {
    const orderedRowIds = normalizeRowIds(options?.orderedRowIds);
    const startIndex = orderedRowIds.indexOf(String(options?.startRowId || ''));
    const endIndex = orderedRowIds.indexOf(String(options?.endRowId || ''));
    if (startIndex < 0 || endIndex < 0) return null;

    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    return {
      table: options?.table,
      colKey: options?.colKey,
      rowIds: orderedRowIds.slice(from, to + 1)
    };
  }

  function buildContiguousSelection(options) {
    const orderedRowIds = normalizeRowIds(options?.orderedRowIds);
    const selectedRowIds = normalizeRowIds(options?.selectedRowIds);
    const selectedSet = new Set(selectedRowIds);
    const selectedIndexes = orderedRowIds
      .map((rowId, index) => selectedSet.has(rowId) ? index : -1)
      .filter((index) => index >= 0);
    if (selectedIndexes.length < 2) return null;

    const from = Math.min(...selectedIndexes);
    const to = Math.max(...selectedIndexes);
    const rowIds = orderedRowIds.slice(from, to + 1);
    if (rowIds.length !== selectedSet.size || rowIds.some((rowId) => !selectedSet.has(rowId))) return null;
    return { table: options?.table, colKey: options?.colKey, rowIds };
  }

  function applyMergePlan(existingPlans, selection) {
    if (!selection || !Array.isArray(selection.rowIds) || selection.rowIds.length < 2) {
      return normalizePlans(existingPlans);
    }

    const selectedRows = new Set(selection.rowIds.map(String));
    const retained = normalizePlans(existingPlans).filter((entry) => {
      if (entry.colKey !== selection.colKey) return true;
      return !entry.rowIds.some((rowId) => selectedRows.has(rowId));
    });
    retained.push({
      colKey: selection.colKey,
      rowIds: selection.rowIds.map(String)
    });
    return retained;
  }

  function retainApplicablePlans(existingPlans, availableRowIds) {
    const available = new Set(normalizeRowIds(availableRowIds));
    return normalizePlans(existingPlans).filter((entry) => {
      return entry.rowIds.length >= 2 && entry.rowIds.every((rowId) => available.has(rowId));
    });
  }

  function normalizePlans(plans) {
    if (!Array.isArray(plans)) return [];
    return plans
      .filter((entry) => entry && entry.colKey && Array.isArray(entry.rowIds) && entry.rowIds.length >= 2)
      .map((entry) => ({ colKey: entry.colKey, rowIds: entry.rowIds.map(String) }));
  }

  function normalizeRowIds(rowIds) {
    return Array.isArray(rowIds) ? rowIds.map(String) : [];
  }

  const api = Object.freeze({
    buildVerticalSelection,
    buildContiguousSelection,
    applyMergePlan,
    retainApplicablePlans
  });
  root.PotteryMaterialOrdersMergePlanning = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
