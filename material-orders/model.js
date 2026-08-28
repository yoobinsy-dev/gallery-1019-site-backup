(function initializePotteryMaterialOrdersModel(root) {
  'use strict';

  function normalizeOrder(order, options) {
    if (!order || typeof order !== 'object') return null;

    const makeId = options?.makeId;
    const siteOptions = Array.isArray(options?.siteOptions) ? options.siteOptions : [];
    const defaultStatus = String(options?.defaultStatus || '');
    const currentDate = options?.currentDate instanceof Date ? options.currentDate : new Date();
    const id = String(order.id || makeId('ord')).trim();
    const date = normalizeDateISO(order.orderDate) || formatDateISO(currentDate);
    const createdAt = String(order.createdAt || currentDate.toISOString());
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const items = rawItems
      .map((item) => normalizeItem(item, { makeId, siteOptions, defaultStatus }))
      .filter(Boolean);

    if (items.length === 0) return null;

    const explicitOrderWideDiscount = typeof order.orderWideDiscount === 'boolean' ? order.orderWideDiscount : null;
    const explicitOrderWideShipping = typeof order.orderWideShipping === 'boolean' ? order.orderWideShipping : null;
    const inferredOrderWideDiscount = inferOrderWideByPattern(items, 'discount');
    const inferredOrderWideShipping = inferOrderWideByPattern(items, 'shipping');

    return {
      id,
      orderDate: date,
      createdAt,
      orderWideDiscount: explicitOrderWideDiscount !== null ? explicitOrderWideDiscount : inferredOrderWideDiscount,
      orderWideShipping: explicitOrderWideShipping !== null ? explicitOrderWideShipping : inferredOrderWideShipping,
      items
    };
  }

  function normalizeItem(item, options) {
    if (!item || typeof item !== 'object') return null;

    const siteOptions = Array.isArray(options?.siteOptions) ? options.siteOptions : [];
    const defaultStatus = String(options?.defaultStatus || '');
    const id = String(item.id || options?.makeId('item')).trim();
    const category = String(item.category || '').trim();
    const requestedSite = String(item.site || '').trim();
    const site = siteOptions.includes(requestedSite) ? requestedSite : siteOptions[0];
    const product = String(item.product || '').trim();
    const quantity = Math.floor(Number(item.quantity));

    if (!product) return null;
    if (!Number.isInteger(quantity) || quantity <= 0) return null;

    return {
      id,
      category,
      site,
      product,
      quantity,
      price: normalizePositiveInteger(item.price),
      discount: normalizePositiveInteger(item.discount),
      shippingFee: normalizePositiveInteger(item.shippingFee),
      status: String(item.status || defaultStatus).trim() || defaultStatus
    };
  }

  function normalizePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }

  function inferOrderWideByPattern(items, kind) {
    if (!Array.isArray(items) || items.length <= 1) return false;

    const key = kind === 'discount' ? 'discount' : 'shippingFee';
    const firstValue = Number(items[0]?.[key]);
    if (!Number.isFinite(firstValue) || firstValue <= 0) return false;
    return items.slice(1).every((item) => {
      const value = Number(item?.[key]);
      return !Number.isFinite(value) || value <= 0;
    });
  }

  function getLineTotal(price, discount, shippingFee) {
    const safePrice = normalizePositiveInteger(price) || 0;
    const safeDiscount = normalizePositiveInteger(discount) || 0;
    const safeShippingFee = normalizePositiveInteger(shippingFee) || 0;
    const total = safePrice - safeDiscount + safeShippingFee;
    return total > 0 ? total : null;
  }

  function getOrderTotal(order) {
    if (!order || !Array.isArray(order.items)) return null;

    let totalPrice = 0;
    let totalDiscount = 0;
    let totalShipping = 0;
    order.items.forEach((item, index) => {
      totalPrice += normalizePositiveInteger(item?.price) || 0;
      if (!order.orderWideDiscount || index === 0) totalDiscount += normalizePositiveInteger(item?.discount) || 0;
      if (!order.orderWideShipping || index === 0) totalShipping += normalizePositiveInteger(item?.shippingFee) || 0;
    });

    const total = totalPrice - totalDiscount + totalShipping;
    return total > 0 ? total : null;
  }

  function getOrdersForMonth(orders, monthKey) {
    return (Array.isArray(orders) ? orders : [])
      .filter((order) => String(order.orderDate || '').slice(0, 7) === monthKey)
      .sort((a, b) => compareOrders(b, a));
  }

  function buildOrderNumberMap(orders) {
    const map = new Map();
    (Array.isArray(orders) ? orders : []).slice().sort(compareOrders).forEach((order, index) => {
      map.set(order.id, index + 1);
    });
    return map;
  }

  function compareOrders(a, b) {
    const byDate = String(a?.orderDate || '').localeCompare(String(b?.orderDate || ''));
    if (byDate !== 0) return byDate;
    const byCreated = String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
    if (byCreated !== 0) return byCreated;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  }

  function normalizeDateISO(rawDate) {
    const value = String(rawDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? '' : value;
  }

  function formatDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = Object.freeze({
    normalizeOrder,
    normalizeItem,
    inferOrderWideByPattern,
    getLineTotal,
    getOrderTotal,
    getOrdersForMonth,
    buildOrderNumberMap,
    compareOrders,
    normalizeDateISO
  });
  root.PotteryMaterialOrdersModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
