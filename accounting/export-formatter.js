(function initializePotteryAccountingExportFormatter(root) {
  'use strict';

  function buildExportRows(cache) {
    const lines = [['구분', '카테고리', '날짜', '항목명', '금액', '유형']];

    cache.revenueCategories.forEach((category) => {
      category.entries.forEach((entry) => {
        lines.push(buildEntryRow('수입', category.category, entry));
      });
    });

    cache.expenseCategories.forEach((category) => {
      category.entries.forEach((entry) => {
        lines.push(buildEntryRow('지출', category.category, entry));
      });
    });

    lines.push(['', '', '', '총 수입', String(cache.revenueTotal), '']);
    lines.push(['', '', '', '총 지출', String(cache.expenseTotal), '']);
    lines.push(['', '', '', '월 손익', String(cache.profit), '']);
    return lines;
  }

  function buildEntryRow(sideLabel, category, entry) {
    return [
      sideLabel,
      category,
      entry.date,
      entry.title,
      String(entry.amount || 0),
      entry.source === 'auto' ? '자동' : (entry.fixed ? '고정' : '수동')
    ];
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  const api = Object.freeze({ buildExportRows, csvEscape });
  root.PotteryAccountingExportFormatter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
