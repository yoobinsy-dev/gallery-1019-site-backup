(function initializeExhibitionInventoryModel(root) {
  'use strict';

  function normalizeManualNumber(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function normalizeTitle(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function shouldValidateManualNumberUniqueness(work) {
    if (!work) return false;
    const current = normalizeManualNumber(work.manualNumber);
    if (!current || work.wasSaved === undefined) return false;
    if (!work.wasSaved) return true;
    return current !== normalizeManualNumber(work.editOriginalManualNumber);
  }

  function shouldValidateTitleUniqueness(work) {
    if (!work) return false;
    const current = normalizeTitle(work.title);
    if (!current || work.wasSaved === undefined) return false;
    if (!work.wasSaved) return true;
    return current !== normalizeTitle(work.editOriginalTitle);
  }

  function findSavedConflict(work, allWorks, field, normalize) {
    const target = normalize(work?.[field]);
    if (!target) return null;
    return allWorks.find((candidate) => {
      if (!candidate || candidate.id === work.id || !candidate.saved) return false;
      return normalize(candidate[field]) === target;
    }) || null;
  }

  function findSavedManualNumberConflict(work, allWorks) {
    return findSavedConflict(work, allWorks, 'manualNumber', normalizeManualNumber);
  }

  function findSavedTitleConflict(work, allWorks) {
    return findSavedConflict(work, allWorks, 'title', normalizeTitle);
  }

  function getBulkConflicts(allWorks, pendingWorks, field, normalize, shouldValidate) {
    const conflictIds = new Set();
    const pendingIds = new Set(pendingWorks.filter(shouldValidate).map((work) => work.id));
    const savedValues = new Map();
    allWorks.forEach((work) => {
      if (!work || !work.saved || pendingIds.has(work.id)) return;
      const normalized = normalize(work[field]);
      if (normalized && !savedValues.has(normalized)) savedValues.set(normalized, work.id);
    });
    const pendingValues = new Map();
    pendingWorks.forEach((work) => {
      if (!shouldValidate(work)) return;
      const normalized = normalize(work[field]);
      if (!normalized) return;
      if (savedValues.has(normalized)) conflictIds.add(work.id);
      const ids = pendingValues.get(normalized) || [];
      ids.push(work.id);
      pendingValues.set(normalized, ids);
    });
    pendingValues.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => conflictIds.add(id));
    });
    return conflictIds;
  }

  function getBulkManualNumberConflicts(allWorks, pendingWorks) {
    return getBulkConflicts(
      allWorks,
      pendingWorks,
      'manualNumber',
      normalizeManualNumber,
      shouldValidateManualNumberUniqueness
    );
  }

  function getBulkTitleConflicts(allWorks, pendingWorks) {
    return getBulkConflicts(
      allWorks,
      pendingWorks,
      'title',
      normalizeTitle,
      shouldValidateTitleUniqueness
    );
  }

  function getMissingRequiredWorkFields(work) {
    const missing = [];
    if (!(work.manualNumber || '').toString().trim()) missing.push('manualNumber');
    if (!(work.title || '').toString().trim()) missing.push('title');
    if (!(work.price || '').toString().trim()) missing.push('price');
    return missing;
  }

  function parseSizeParts(sizeText) {
    const text = (sizeText || '').toString().trim();
    if (!text) return { width: '', height: '' };
    const normalized = text.replace(/\s+/g, ' ').replace(/×/g, 'x');
    const fullMatch = normalized.match(/([\d.]+)\s*cm?\s*x\s*([\d.]+)\s*cm?/i)
      || normalized.match(/([\d.]+)\s*x\s*([\d.]+)/i);
    if (fullMatch) return { width: fullMatch[1] || '', height: fullMatch[2] || '' };
    const widthOnlyMatch = normalized.match(/^([\d.]+)\s*cm?\s*x?\s*$/i)
      || normalized.match(/^([\d.]+)\s*x\s*$/i);
    if (widthOnlyMatch) return { width: widthOnlyMatch[1] || '', height: '' };
    const heightOnlyMatch = normalized.match(/^x\s*([\d.]+)\s*cm?$/i)
      || normalized.match(/^x\s*([\d.]+)$/i);
    if (heightOnlyMatch) return { width: '', height: heightOnlyMatch[1] || '' };
    return { width: '', height: '' };
  }

  function filterWorks(works, options = {}) {
    if (options.advanced) {
      const filters = options.filters || {};
      return works.filter((work) => Object.keys(filters).every((key) => {
        const value = filters[key].trim().toLowerCase();
        if (!value) return true;
        return (work[key] || '').toString().toLowerCase().includes(value);
      }));
    }
    const search = String(options.search || '').trim().toLowerCase();
    if (!search) return works;
    return works.filter((work) => {
      const text = `${work.manualNumber || ''} ${work.title || ''} ${work.author || ''} ${work.price || ''} ${work.materials || ''} ${work.size || ''} ${work.year || ''} ${work.category || ''}`.toLowerCase();
      return text.includes(search);
    });
  }

  function getWorkSortValue(work, field, options = {}) {
    switch (field) {
      case 'manualNumber':
      case 'photoName':
      case 'title':
      case 'author':
      case 'price':
      case 'materials':
      case 'size':
      case 'year':
      case 'category':
        return work[field] || '';
      case 'quantity':
        return String(options.parseStockQuantity(work.quantity || 0));
      case 'soldQuantity':
        return String(options.getGoodsSoldQuantity(work.id));
      case 'remainingQuantity': {
        const stockQuantity = options.parseStockQuantity(work.quantity || 0);
        const soldQuantity = options.getGoodsSoldQuantity(work.id);
        return String(Math.max(0, stockQuantity - soldQuantity));
      }
      case 'status':
        return options.soldWorkIdSet?.has(work.id) ? 'sold' : '';
      default:
        return '';
    }
  }

  function getSortedWorks(options) {
    const filtered = filterWorks(options.works || [], options);
    if (!options.sortField) return filtered;
    const direction = options.sortDirection === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const leftValue = getWorkSortValue(left, options.sortField, options);
      const rightValue = getWorkSortValue(right, options.sortField, options);
      return options.compareValues(leftValue, rightValue, options.sortField) * direction;
    });
  }

  const api = Object.freeze({
    filterWorks,
    findSavedManualNumberConflict,
    findSavedTitleConflict,
    getBulkManualNumberConflicts,
    getBulkTitleConflicts,
    getMissingRequiredWorkFields,
    getSortedWorks,
    getWorkSortValue,
    normalizeManualNumber,
    normalizeTitle,
    parseSizeParts,
    shouldValidateManualNumberUniqueness,
    shouldValidateTitleUniqueness
  });
  root.ExhibitionInventoryModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
