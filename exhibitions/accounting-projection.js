(function initializeExhibitionAccountingProjection(root) {
  'use strict';

  function parseAmount(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function formatAmount(value) {
    return `₩ ${parseAmount(value).toLocaleString('ko-KR')}`;
  }

  function buildRevenueItems(options) {
    let artTotal = 0;
    let goodsTotal = 0;
    const soldWorks = Array.isArray(options?.soldWorks) ? options.soldWorks : [];
    soldWorks.forEach((sold) => {
      const itemType = options.normalizeItemType(sold);
      const unitAmount = parseAmount(sold.price);
      const quantity = options.getQuantity(itemType, sold.soldQuantity);
      const rowAmount = unitAmount * quantity;
      if (itemType === '굿즈') goodsTotal += rowAmount;
      else artTotal += rowAmount;
    });

    const manualItems = Array.isArray(options?.manualRevenueItems) ? options.manualRevenueItems : [];
    const manualRows = manualItems.map((item) => ({
      id: item.id,
      division: item.division,
      amount: item.amount,
      source: 'manual'
    }));
    return [
      { id: 'art', division: '작품 판매', amount: artTotal, source: 'auto' },
      { id: 'goods', division: '굿즈 판매', amount: goodsTotal, source: 'auto' },
      ...manualRows
    ];
  }

  function getExpenseEffectiveAmount(item, revenueTotals) {
    if (!item) return 0;
    if (item.code === 'commission-art') return (revenueTotals.art || 0) * 0.6;
    if (item.code === 'commission-goods') return (revenueTotals.goods || 0) * 0.8;
    return parseAmount(item.amount);
  }

  function buildFinanceProjection(options) {
    const expenseItems = Array.isArray(options?.expenseItems) ? options.expenseItems : [];
    const revenueItems = Array.isArray(options?.revenueItems) ? options.revenueItems : [];
    const revenueTotals = {
      art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
      goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
    };
    const expenseTotal = expenseItems.reduce(
      (sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals),
      0
    );
    const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
    return {
      revenueTotals,
      expenseTotal,
      revenueTotal,
      profitTotal: revenueTotal - expenseTotal
    };
  }

  const api = Object.freeze({
    buildFinanceProjection,
    buildRevenueItems,
    formatAmount,
    getExpenseEffectiveAmount,
    parseAmount
  });
  root.ExhibitionAccountingProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
