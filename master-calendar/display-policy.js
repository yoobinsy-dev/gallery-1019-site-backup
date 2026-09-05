(function initializeMasterCalendarDisplayPolicy(root) {
  'use strict';

  function getBaseLabelText(rule) {
    if (!rule) return '';
    if (rule.type === '수업시간') {
      const className = String(rule.className || '수업시간').trim();
      const instructor = String(rule.instructor || '').trim();
      return instructor ? `${className} · ${instructor}` : className;
    }
    return rule.type;
  }

  function baseTypeToClass(type) {
    if (type === '수업시간') return 'base-class';
    if (type === '개인작업 시간') return 'base-personal';
    if (type === '이용 불가') return 'base-closed';
    return '';
  }

  function isExhibitionKind(kind) {
    const value = String(kind || '').trim();
    return value === '전시회' || value.includes('전시');
  }

  function isKilnKind(kind) {
    const value = String(kind || '').trim();
    return value === '가마 소성' || value === '가마 관련' || value.includes('가마');
  }

  function kindToClass(kind) {
    if (kind === '수강') return 'kind-class';
    if (kind === '개인작업') return 'kind-personal';
    if (kind === '강사 지도 하 개인작업') return 'kind-guided';
    if (isExhibitionKind(kind)) return 'kind-exhibition';
    if (kind === '기타') return 'kind-other';
    if (isKilnKind(kind)) return 'kind-kiln';
    return 'kind-personal';
  }

  function isAllDayKind(kind) {
    return isKilnKind(kind) || isExhibitionKind(kind);
  }

  function getAllDayPriority(kind) {
    if (isKilnKind(kind)) return 0;
    if (isExhibitionKind(kind)) return 1;
    return 2;
  }

  function normalizeKilnCategory(value, categoryOptions) {
    const text = String(value || '').trim();
    return categoryOptions.includes(text) ? text : '';
  }

  function extractKilnCategoryFromTitle(title, categoryOptions) {
    const text = String(title || '').trim();
    const matched = text.match(/^가마\s*소성\s*\(([^)]+)\)$/);
    if (!matched) return '';
    return normalizeKilnCategory(matched[1], categoryOptions);
  }

  function buildKilnEventTitle(category, categoryOptions) {
    const normalized = normalizeKilnCategory(category, categoryOptions);
    return normalized ? `가마 소성 (${normalized})` : '가마 소성';
  }

  function getEventDisplayTitle(eventItem, fallbackTitle, categoryOptions) {
    const fallback = String(fallbackTitle || '새 일정');
    if (!eventItem) return fallback;

    if (isKilnKind(eventItem.kind)) {
      const fromCategory = normalizeKilnCategory(eventItem.kilnCategory, categoryOptions);
      if (fromCategory) {
        return buildKilnEventTitle(fromCategory, categoryOptions);
      }

      const fromTitle = String(eventItem.title || '').trim();
      return fromTitle || '가마 소성';
    }

    const title = String(eventItem.title || '').trim();
    return title || fallback;
  }

  const api = Object.freeze({
    getBaseLabelText,
    baseTypeToClass,
    kindToClass,
    isExhibitionKind,
    isAllDayKind,
    getAllDayPriority,
    isKilnKind,
    normalizeKilnCategory,
    extractKilnCategoryFromTitle,
    buildKilnEventTitle,
    getEventDisplayTitle
  });
  root.MasterCalendarDisplayPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);