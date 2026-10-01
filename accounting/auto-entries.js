(function initializePotteryAccountingAutoEntries(root) {
  'use strict';

  function buildGallerySalesAutoEntries(options) {
    const exhibitions = Array.isArray(options?.exhibitions) ? options.exhibitions : [];
    const itemType = options?.itemType;
    const monthKey = options?.monthKey;
    const helpers = options?.helpers || {};
    const entries = [];

    exhibitions.forEach((exhibition) => {
      if (!exhibition || typeof exhibition !== 'object') return;

      const endDate = getExhibitionEndDate(exhibition, helpers);
      if (!endDate || !endDate.startsWith(`${monthKey}-`)) return;

      const soldWorks = getExhibitionSoldRecords(exhibition, helpers);
      let sum = 0;

      soldWorks.forEach((sold) => {
        const soldType = helpers.normalizeSoldItemType(sold);
        if (soldType !== itemType) return;
        const unit = helpers.parsePriceToNumber(sold.price);
        const quantity = soldType === '굿즈' ? helpers.parseSoldQuantity(sold.soldQuantity) : 1;
        sum += unit * quantity;
      });

      if (sum <= 0) return;

      const title = String(exhibition.title || exhibition.name || '전시').trim() || '전시';
      entries.push({
        id: `auto-sales-${itemType}-${exhibition.id || title}-${endDate}`,
        source: 'auto',
        side: 'revenue',
        category: itemType === '작품' ? '작품 판매' : '굿즈 판매',
        date: endDate,
        title,
        amount: helpers.roundWon(sum),
        fixed: false,
        tab: 'gallery'
      });
    });

    entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return entries;
  }

  function getMaterialOrderTotal(order) {
    if (!order || !Array.isArray(order.items)) return 0;

    const orderWideDiscount = Boolean(order.orderWideDiscount);
    const orderWideShipping = Boolean(order.orderWideShipping);
    let totalPrice = 0;
    let totalDiscount = 0;
    let totalShipping = 0;

    order.items.forEach((item, index) => {
      const price = Number(item?.price);
      const discount = Number(item?.discount);
      const shipping = Number(item?.shippingFee);
      if (Number.isFinite(price) && price > 0) totalPrice += Math.floor(price);
      if (Number.isFinite(discount) && discount > 0 && (!orderWideDiscount || index === 0)) {
        totalDiscount += Math.floor(discount);
      }
      if (Number.isFinite(shipping) && shipping > 0 && (!orderWideShipping || index === 0)) {
        totalShipping += Math.floor(shipping);
      }
    });

    const total = totalPrice - totalDiscount + totalShipping;
    return total > 0 ? total : 0;
  }

  function buildPotteryClassRevenueEntries(options) {
    const students = Array.isArray(options?.students) ? options.students : [];
    const occurrenceMap = options?.occurrenceMap instanceof Map ? options.occurrenceMap : new Map();
    const monthKey = String(options?.monthKey || '');
    const helpers = options?.helpers || {};
    const entries = [];

    students.forEach((student, index) => {
      if (!student || typeof student !== 'object') return;
      const name = String(student.name || '').trim();
      if (!name) return;

      const studentOccurrences = occurrenceMap.get(name) || [];
      const completedCount = studentOccurrences.length;
      if (completedCount <= 0) return;

      const tuition = helpers.parsePriceToNumber(student.tuition);
      if (tuition <= 0) return;

      const tuitionBasis = String(student.tuitionBasis || '').trim();
      let totalAmount = 0;
      if (tuitionBasis === '월초') {
        totalAmount = helpers.roundWon(tuition);
      } else {
        const cycleCount = Math.max(1, helpers.basisToCount(tuitionBasis));
        totalAmount = helpers.roundWon((tuition / cycleCount) * completedCount);
      }

      if (totalAmount <= 0) return;
      const baseAmount = Math.floor(totalAmount / completedCount);
      const remainder = totalAmount - baseAmount * completedCount;

      studentOccurrences.forEach((occurrence, occurrenceIndex) => {
        const date = helpers.normalizeDateInput(occurrence.date || `${monthKey}-01`) || `${monthKey}-01`;
        const entry = {
          id: `auto-pottery-class-${helpers.normalizeNameKey(name)}-${date}-${occurrence.start || occurrenceIndex}-${index}`,
          source: 'auto',
          side: 'revenue',
          category: '수강료',
          date,
          title: `${name} 수강 ${occurrence.start || ''}`.trim(),
          amount: baseAmount + (occurrenceIndex < remainder ? 1 : 0),
          fixed: false,
          tab: 'pottery'
        };
        const instructor = String(occurrence.instructor || '').trim();
        if (instructor) entry.instructor = instructor;
        entries.push(entry);
      });
    });

    return sortEntries(entries);
  }

  function buildPotteryPersonalWorkRevenueEntries(options) {
    const personalWorkEntries = Array.isArray(options?.personalWorkEntries) ? options.personalWorkEntries : [];
    const monthKey = String(options?.monthKey || '');
    const helpers = options?.helpers || {};
    const entries = [];

    personalWorkEntries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const userName = String(entry.userName || '').trim();
      if (!userName) return;

      const monthlyFee = helpers.parsePriceToNumber(entry.monthlyFee);
      if (monthlyFee <= 0) return;

      const paymentDates = getPersonalWorkPaymentDates(entry, helpers)
        .filter((date) => String(date || '').startsWith(`${monthKey}-`));

      paymentDates.forEach((date, paymentIndex) => {
        entries.push({
          id: `auto-pottery-personal-${helpers.normalizeNameKey(userName)}-${monthKey}-${index}-${paymentIndex}`,
          source: 'auto',
          side: 'revenue',
          category: '개인작업 이용료',
          date,
          title: `${userName} 개인작업 이용료`,
          amount: monthlyFee,
          fixed: false,
          tab: 'pottery'
        });
      });
    });

    return sortEntries(entries);
  }

  function buildPotteryMaterialExpenseEntries(options) {
    const materialOrders = Array.isArray(options?.materialOrders) ? options.materialOrders : [];
    const monthKey = String(options?.monthKey || '');
    const helpers = options?.helpers || {};
    const entries = [];

    materialOrders.forEach((order, index) => {
      if (!order || typeof order !== 'object') return;
      const orderDate = helpers.normalizeDateInput(order.orderDate || '');
      if (!orderDate || !orderDate.startsWith(`${monthKey}-`)) return;

      const amount = getMaterialOrderTotal(order);
      if (amount <= 0) return;

      entries.push({
        id: `auto-pottery-material-${order.id || index}-${orderDate}`,
        source: 'auto',
        side: 'expense',
        category: '재료비',
        date: orderDate,
        title: `재료 주문 ${orderDate}`,
        amount,
        fixed: false,
        tab: 'pottery'
      });
    });

    return sortEntries(entries);
  }

  function getPersonalWorkPaymentDates(entry, helpers) {
    const history = Array.isArray(entry?.paymentHistory) ? entry.paymentHistory : [];
    const latest = helpers.normalizeDateInput(entry?.lastPaymentDate || '');
    const dates = new Set();

    history.forEach((value) => {
      const date = helpers.normalizeDateInput(value);
      if (date) dates.add(date);
    });
    if (latest) dates.add(latest);

    return Array.from(dates).sort((a, b) => a.localeCompare(b));
  }

  function sortEntries(entries) {
    return entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });
  }

  function getExhibitionEndDate(exhibition, helpers) {
    if (!exhibition || typeof exhibition !== 'object') return '';
    return helpers.normalizeDateInput(exhibition.endDate || exhibition.date || '');
  }

  function getExhibitionSoldRecords(exhibition, helpers) {
    if (!exhibition || typeof exhibition !== 'object') return [];

    const soldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : [];
    if (soldWorks.length > 0) {
      return dedupeSoldRecords(soldWorks.map((item) => ({ ...item })), helpers);
    }

    const artSoldWorks = Array.isArray(exhibition.artSoldWorks) ? exhibition.artSoldWorks : [];
    const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods : [];
    return dedupeSoldRecords([
      ...artSoldWorks.map((item) => ({ ...item, __forcedItemType: '작품' })),
      ...soldGoods.map((item) => ({ ...item, __forcedItemType: '굿즈' }))
    ], helpers);
  }

  function dedupeSoldRecords(records, helpers) {
    const list = Array.isArray(records) ? records : [];
    const seen = new Set();
    const deduped = [];

    list.forEach((record, index) => {
      if (!record || typeof record !== 'object') return;
      const key = getSoldRecordIdentity(record, index, helpers);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(record);
    });

    return deduped;
  }

  function getSoldRecordIdentity(record, _index, helpers) {
    const id = String(record?.id || '').trim();
    if (id) return `id:${id}`;

    const workId = Number(record?.workId);
    const title = helpers.normalizeNameKey(record?.title || '');
    const soldDate = helpers.normalizeDateInput(record?.soldDate || '');
    const soldDateTime = String(record?.soldDateTime || '').trim();
    const itemType = helpers.normalizeSoldItemType(record);
    const price = helpers.parsePriceToNumber(record?.price);
    const qty = helpers.parseSoldQuantity(record?.soldQuantity);
    const base = Number.isFinite(workId) && workId > 0 ? `work:${workId}` : `title:${title}`;
    return `${base}|${itemType}|${soldDate}|${soldDateTime}|${price}|${qty}`;
  }

  const api = Object.freeze({
    buildGallerySalesAutoEntries,
    buildPotteryClassRevenueEntries,
    buildPotteryPersonalWorkRevenueEntries,
    buildPotteryMaterialExpenseEntries,
    getMaterialOrderTotal
  });
  root.PotteryAccountingAutoEntries = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);