(function initializePotteryLaborSettlement(root) {
  'use strict';

  function buildInstructorSettlements(options) {
    const entries = Array.isArray(options?.entries) ? options.entries : [];
    const roundWon = typeof options?.roundWon === 'function' ? options.roundWon : Math.round;
    const byInstructor = new Map();

    entries.forEach((entry) => {
      const instructor = String(entry?.instructor || '').trim();
      if (!instructor) return;

      const amount = roundWon(Number(entry.amount || 0));
      const commission = roundWon(amount * 0.6);
      const withholdingTax = roundWon(commission * 0.033);
      const netPayment = commission - withholdingTax;
      const rows = byInstructor.get(instructor) || [];
      rows.push({
        id: String(entry.id || ''),
        date: String(entry.date || ''),
        item: formatClassItem(entry.title),
        amount,
        commission,
        withholdingTax,
        netPayment
      });
      byInstructor.set(instructor, rows);
    });

    return Array.from(byInstructor, ([instructor, rows]) => ({
      instructor,
      rows,
      totals: sumRows(rows)
    })).sort((a, b) => a.instructor.localeCompare(b.instructor, 'ko'));
  }

  function formatClassItem(title) {
    return String(title || '').replace(/\s+수강(?=\s|$)/, '').trim();
  }

  function sumRows(rows) {
    return rows.reduce((totals, row) => ({
      amount: totals.amount + row.amount,
      commission: totals.commission + row.commission,
      withholdingTax: totals.withholdingTax + row.withholdingTax,
      netPayment: totals.netPayment + row.netPayment
    }), { amount: 0, commission: 0, withholdingTax: 0, netPayment: 0 });
  }

  function buildSettlementExportRows(settlement) {
    const rows = [['날짜', '수강생 + 수업시간', '금액', '작가 커미션', '원천세', '실지급액']];
    settlement.rows.forEach((row) => {
      rows.push([
        row.date,
        row.item,
        row.amount,
        row.commission,
        row.withholdingTax,
        row.netPayment
      ]);
    });
    rows.push([
      '합계',
      '',
      settlement.totals.amount,
      settlement.totals.commission,
      settlement.totals.withholdingTax,
      settlement.totals.netPayment
    ]);
    return rows;
  }

  function formatSettlementWorkbookSheet(sheet, rowCount) {
    const columnWidths = [14, 24, 18, 18, 16, 18];
    columnWidths.forEach((width, index) => sheet.column(index + 1).width(width));
    if (rowCount > 1) sheet.range(`C2:F${rowCount}`).style('numberFormat', '₩#,##0');
  }

  const api = Object.freeze({
    buildInstructorSettlements,
    buildSettlementExportRows,
    formatSettlementWorkbookSheet
  });
  root.PotteryLaborSettlement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);