(function initializeExhibitionSalesModel(root) {
  'use strict';

  function normalizeSoldItemType(sold) {
    if (!sold) return '작품';
    return sold.itemType === '굿즈' ? '굿즈' : '작품';
  }

  function parseSoldQuantity(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(number) || number <= 0) return 1;
    return Math.floor(number);
  }

  function parseStockQuantity(value) {
    const number = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.floor(number);
  }

  function getSoldQuantityForItemType(itemType, value) {
    return itemType === '굿즈' ? parseSoldQuantity(value) : 1;
  }

  function getGoodsSoldQuantity(records, goodsId) {
    return records
      .filter((sold) => normalizeSoldItemType(sold) === '굿즈' && sold.workId === goodsId)
      .reduce((sum, sold) => sum + parseSoldQuantity(sold.soldQuantity), 0);
  }

  function getSalesSearchResults(options) {
    const artWorks = Array.isArray(options?.artWorks)
      ? options.artWorks
      : (Array.isArray(options?.works) ? options.works : []);
    const goods = Array.isArray(options?.goods) ? options.goods : [];
    const items = [
      ...artWorks.map((work) => ({ ...work, itemType: '작품' })),
      ...goods.map((work) => ({ ...work, itemType: '굿즈' }))
    ];
    const query = options?.query;
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (query === '__all__') return items;
    if (!normalizedQuery) return [];

    return items
      .filter((work) => {
        const number = String(work.manualNumber || '').toLowerCase();
        const title = String(work.title || '').toLowerCase();
        return number.includes(normalizedQuery) || title.includes(normalizedQuery);
      })
      .slice(0, 20);
  }

  function filterSoldWorks(records, options = {}) {
    if (options.advanced) {
      const filters = options.filters || {};
      return records.filter((sold) => {
        const soldDate = String(sold.soldAtKst || '').slice(0, 10);
        const from = String(filters.soldDateFrom || '').trim();
        const to = String(filters.soldDateTo || '').trim();
        if (from && (!soldDate || soldDate < from)) return false;
        if (to && (!soldDate || soldDate > to)) return false;

        const textFields = ['manualNumber', 'title', 'author', 'buyerName', 'buyerPhone', 'paymentMethod'];
        return textFields.every((key) => {
          const value = String(filters[key] || '').trim().toLowerCase();
          if (!value) return true;
          return String(sold[key] || '').toLowerCase().includes(value);
        });
      });
    }

    const search = String(options.search || '').trim().toLowerCase();
    if (!search) return records;
    return records.filter((sold) => {
      const paymentDisplay = sold.paymentMethod === '기타'
        ? `기타 ${sold.paymentMethodEtc || ''}`
        : (sold.paymentMethod || '');
      const text = `${sold.manualNumber || ''} ${normalizeSoldItemType(sold)} ${sold.title || ''} ${sold.author || ''} ${sold.price || ''} ${sold.soldQuantity || ''} ${sold.soldAtKst || ''} ${sold.buyerName || ''} ${sold.buyerPhone || ''} ${paymentDisplay} ${sold.note || ''}`.toLowerCase();
      return text.includes(search);
    });
  }

  function parseSoldPriceAmount(value, isNotForSale) {
    if (typeof isNotForSale === 'function' && isNotForSale(value)) return 0;
    const amount = Number(String(value || '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount;
  }

  function getSoldSortValue(sold, field, isNotForSale) {
    if (field === 'itemType') return normalizeSoldItemType(sold);
    if (field === 'price') {
      const amount = parseSoldPriceAmount(sold.price, isNotForSale);
      return amount > 0 ? String(amount) : '';
    }
    const values = {
      manualNumber: sold.manualNumber,
      category: sold.category,
      title: sold.title,
      author: sold.author,
      soldAtKst: sold.soldAtKst,
      buyerName: sold.buyerName,
      buyerPhone: sold.buyerPhone,
      paymentMethod: sold.paymentMethod
    };
    return values[field] || '';
  }

  function getSortedSoldWorks(options) {
    const filtered = filterSoldWorks(options?.records || [], options);
    if (!options?.sortField) return filtered;
    const direction = options.sortDirection === 'desc' ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const leftValue = getSoldSortValue(left, options.sortField, options.isNotForSale);
      const rightValue = getSoldSortValue(right, options.sortField, options.isNotForSale);
      return options.compareValues(leftValue, rightValue, options.sortField) * direction;
    });
  }

  function getArtistSalesSummary(records, isNotForSale) {
    const summaryMap = new Map();
    records.forEach((sold) => {
      const author = String(sold.author || '').trim() || '작가 미지정';
      const quantity = getSoldQuantityForItemType(normalizeSoldItemType(sold), sold.soldQuantity);
      const revenue = parseSoldPriceAmount(sold.price, isNotForSale) * quantity;
      const existing = summaryMap.get(author) || { author, soldCount: 0, totalRevenue: 0 };
      existing.soldCount += quantity;
      existing.totalRevenue += revenue;
      summaryMap.set(author, existing);
    });
    return Array.from(summaryMap.values()).sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.soldCount !== left.soldCount) return right.soldCount - left.soldCount;
      return left.author.localeCompare(right.author, 'ko');
    });
  }

  function getSoldStats(options) {
    const records = Array.isArray(options?.records) ? options.records : [];
    const selectedIds = Array.isArray(options?.selectedIds) ? options.selectedIds : [];
    const selectedSet = new Set(selectedIds);
    const idField = options?.idField || 'id';
    const scoped = selectedIds.length > 0
      ? records.filter((item) => selectedSet.has(item[idField]))
      : records;
    return {
      basisLabel: selectedIds.length > 0
        ? `${options.selectedLabel} ${selectedIds.length}개 기준 판매 통계`
        : options.allLabel,
      soldCount: scoped.length,
      totalAmount: scoped.reduce((sum, item) => sum + parseSoldPriceAmount(item.price, options.isNotForSale), 0)
    };
  }

  const api = Object.freeze({
    filterSoldWorks,
    getArtistSalesSummary,
    getGoodsSoldQuantity,
    getSalesSearchResults,
    getSoldQuantityForItemType,
    getSoldSortValue,
    getSoldStats,
    getSortedSoldWorks,
    normalizeSoldItemType,
    parseSoldPriceAmount,
    parseSoldQuantity,
    parseStockQuantity
  });
  root.ExhibitionSalesModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
