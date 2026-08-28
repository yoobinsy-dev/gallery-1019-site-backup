(function initializePotteryMaterialOrdersRowProjection(root) {
  'use strict';

  function buildRowProjection(options) {
    const orders = Array.isArray(options?.orders) ? options.orders : [];
    const orderNumberMap = options?.orderNumberMap instanceof Map ? options.orderNumberMap : new Map();
    const selectedItemIds = Array.isArray(options?.selectedItemIds) ? options.selectedItemIds : [];
    const editingOrderId = String(options?.editingOrderId || '');
    const getOrderTotal = options?.getOrderTotal;
    const rows = [];
    const visibleItemIds = [];
    let grandTotal = 0;

    orders.forEach((order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      const rowSpan = items.length;
      const mergeDiscount = Boolean(order?.orderWideDiscount);
      const mergeShipping = Boolean(order?.orderWideShipping);
      const mergeTotal = mergeDiscount || mergeShipping;
      const mergeOrderCells = rowSpan > 1;
      const orderTotal = getOrderTotal(order);
      const orderSelected = rowSpan > 0 && items.every((item) => selectedItemIds.includes(item.id));
      if (typeof orderTotal === 'number' && orderTotal > 0) grandTotal += orderTotal;

      items.forEach((item, itemIndex) => {
        visibleItemIds.push(item.id);
        rows.push({
          order,
          item,
          orderNo: orderNumberMap.get(order.id) || '-',
          itemIndex,
          rowSpan,
          showGroupCell: itemIndex === 0,
          isEditing: editingOrderId === String(order.id || ''),
          itemSelected: selectedItemIds.includes(item.id),
          orderSelected,
          mergeMeta: {
            mergeOrderCells,
            mergeDiscount,
            mergeShipping,
            mergeTotal,
            orderTotal
          }
        });
      });
    });

    return { rows, visibleItemIds, grandTotal };
  }

  const api = Object.freeze({ buildRowProjection });
  root.PotteryMaterialOrdersRowProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
