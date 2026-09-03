(function initializePotteryMaterialOrdersTableView(root) {
  'use strict';

  function create(dependencies) {
    const {
      defaultStatus,
      buildCategoryOptionsHTML,
      buildSiteOptionsHTML,
      buildStatusOptionsHTML,
      escapeAttribute,
      escapeHtml,
      formatDiscountText,
      formatPriceText,
      formatWonInput,
      getLineTotal
    } = dependencies;

    function render(options) {
      const tbody = options?.tbody;
      const orders = Array.isArray(options?.orders) ? options.orders : [];
      const projection = options?.projection || { rows: [], grandTotal: 0 };
      const selectedItemIds = Array.isArray(options?.selectedItemIds) ? options.selectedItemIds : [];
      if (!tbody) return { empty: true };

      tbody.innerHTML = '';

      if (orders.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="13" class="orders-empty-row">해당 월의 재료 주문 기록이 없습니다.</td>';
        tbody.appendChild(tr);
        return { empty: true };
      }

      projection.rows.forEach((row) => {
        const { order, item, itemIndex, rowSpan, showGroupCell, orderNo, mergeMeta } = row;
        const tr = document.createElement('tr');
        tr.dataset.orderId = order.id;
        tr.dataset.itemId = item.id;
        if (itemIndex === 0) tr.classList.add('group-start');
        if (row.isEditing) tr.classList.add('orders-inline-edit');

        tr.innerHTML = row.isEditing
          ? buildInlineEditRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta, selectedItemIds)
          : buildReadOnlyRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta, selectedItemIds);
        tbody.appendChild(tr);
      });

      appendTotalRow(tbody, projection.grandTotal);
      return { empty: false };
    }

    function appendTotalRow(tbody, grandTotal) {
      const tr = document.createElement('tr');
      tr.className = 'orders-total-row';
      tr.innerHTML = `
        <td colspan="7" class="orders-total-label">총 합계</td>
        <td class="orders-price">-</td>
        <td class="orders-price">-</td>
        <td class="orders-price">-</td>
        <td class="orders-price">${formatPriceText(grandTotal)}</td>
        <td colspan="2"></td>
      `;
      tbody.appendChild(tr);
    }

    function buildReadOnlyRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta, selectedItemIds) {
      const numberClass = showGroupCell ? 'orders-number' : 'orders-number orders-group-empty';
      const dateClass = showGroupCell ? 'orders-date' : 'orders-date orders-group-empty';
      const checkedAttr = selectedItemIds.includes(item.id) ? ' checked' : '';
      const isFirstInOrder = itemIndex === 0;
      const mergeDiscount = Boolean(mergeMeta?.mergeDiscount);
      const mergeShipping = Boolean(mergeMeta?.mergeShipping);
      const mergeTotal = Boolean(mergeMeta?.mergeTotal);
      const orderTotal = Number(mergeMeta?.orderTotal) || 0;
      const mergeOrderCells = Boolean(mergeMeta?.mergeOrderCells);
      const orderChecked = order.items.length > 0 && order.items.every((entry) => selectedItemIds.includes(entry.id));

      const groupCells = showGroupCell
        ? `
        <td class="${numberClass}" data-merge-col="number" rowspan="${String(rowSpan)}">${String(orderNo)}</td>
        <td class="${dateClass}" data-merge-col="date" rowspan="${String(rowSpan)}">${escapeHtml(order.orderDate)}</td>`
        : '';

      const discountCell = mergeDiscount
        ? (isFirstInOrder
          ? `<td class="orders-price" data-merge-col="discount" rowspan="${String(rowSpan)}">${formatDiscountText(item.discount)}</td>`
          : '')
        : `<td class="orders-price" data-merge-col="discount">${formatDiscountText(item.discount)}</td>`;

      const shippingCell = mergeShipping
        ? (isFirstInOrder
          ? `<td class="orders-price" data-merge-col="shipping" rowspan="${String(rowSpan)}">${formatPriceText(item.shippingFee)}</td>`
          : '')
        : `<td class="orders-price" data-merge-col="shipping">${formatPriceText(item.shippingFee)}</td>`;

      const totalCell = mergeTotal
        ? (isFirstInOrder
          ? `<td class="orders-price orders-col-total" data-merge-col="total" rowspan="${String(rowSpan)}">${formatPriceText(orderTotal)}</td>`
          : '')
        : `<td class="orders-price orders-col-total" data-merge-col="total">${formatPriceText(getLineTotal(item.price, item.discount, item.shippingFee))}</td>`;

      const checkboxCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td class="orders-checkbox-col" data-merge-col="checkbox" rowspan="${String(rowSpan)}"><input type="checkbox" class="js-order-row-checkbox" data-order-id="${escapeAttribute(order.id)}" data-order-checkbox="true"${orderChecked ? ' checked' : ''}></td>`
          : '')
        : `<td class="orders-checkbox-col" data-merge-col="checkbox"><input type="checkbox" class="js-order-row-checkbox" data-order-id="${escapeAttribute(order.id)}" data-item-id="${escapeAttribute(item.id)}"${checkedAttr}></td>`;

      const statusCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td data-merge-col="status" rowspan="${String(rowSpan)}"><span class="orders-status">${escapeHtml(item.status || defaultStatus)}</span></td>`
          : '')
        : `<td data-merge-col="status"><span class="orders-status">${escapeHtml(item.status || defaultStatus)}</span></td>`;

      const actionsCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td class="orders-actions-cell" data-merge-col="actions" rowspan="${String(rowSpan)}">
          <button type="button" class="orders-action-btn edit" data-action="edit" data-order-id="${escapeHtml(order.id)}">수정</button>
          <button type="button" class="orders-action-btn delete" data-action="delete-order" data-order-id="${escapeHtml(order.id)}">삭제</button>
        </td>`
          : '')
        : `<td class="orders-actions-cell" data-merge-col="actions">
          <button type="button" class="orders-action-btn edit" data-action="edit" data-order-id="${escapeHtml(order.id)}" data-item-id="${escapeHtml(item.id)}">수정</button>
          <button type="button" class="orders-action-btn delete" data-action="delete" data-order-id="${escapeHtml(order.id)}" data-item-id="${escapeHtml(item.id)}">삭제</button>
        </td>`;

      return `
        ${checkboxCell}${groupCells}
        <td data-merge-col="category">${escapeHtml(item.category || '-')}</td>
        <td data-merge-col="site">${escapeHtml(item.site || '-')}</td>
        <td data-merge-col="product">${escapeHtml(item.product)}</td>
        <td class="orders-col-qty" data-merge-col="quantity">${String(item.quantity)}</td>
        <td class="orders-price" data-merge-col="price">${formatPriceText(item.price)}</td>
        ${discountCell}
        ${shippingCell}
        ${totalCell}
        ${statusCell}
        ${actionsCell}
      `;
    }

    function buildInlineEditRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta, selectedItemIds) {
      const statusOptionsHTML = buildStatusOptionsHTML(item.status || defaultStatus);
      const categoryOptionsHTML = buildCategoryOptionsHTML(item.category || '');
      const siteOptionsHTML = buildSiteOptionsHTML(item.site || '');
      const mergeOrderCells = Boolean(mergeMeta?.mergeOrderCells);
      const mergeDiscount = Boolean(mergeMeta?.mergeDiscount);
      const mergeShipping = Boolean(mergeMeta?.mergeShipping);
      const mergeTotal = Boolean(mergeMeta?.mergeTotal);
      const orderTotal = Number(mergeMeta?.orderTotal) || 0;
      const checkedAttr = selectedItemIds.includes(item.id) ? ' checked' : '';
      const groupCells = showGroupCell
        ? `
        <td class="orders-number" data-merge-col="number" rowspan="${String(rowSpan)}">${String(orderNo)}</td>
        <td class="orders-date" data-merge-col="date" rowspan="${String(rowSpan)}"><input class="orders-input js-edit-date" type="date" value="${escapeAttribute(order.orderDate)}" required></td>`
        : '';
      const isFirstInOrder = itemIndex === 0;
      const leadClass = isFirstInOrder && (!mergeDiscount || !mergeShipping) ? ' orders-inline-toggle-lead' : '';
      const orderChecked = order.items.length > 0 && order.items.every((entry) => selectedItemIds.includes(entry.id));
      const checkboxCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td class="orders-checkbox-col" data-merge-col="checkbox" rowspan="${String(rowSpan)}"><input type="checkbox" class="js-order-row-checkbox" data-order-id="${escapeAttribute(order.id)}" data-order-checkbox="true"${orderChecked ? ' checked' : ''}></td>`
          : '')
        : `<td class="orders-checkbox-col" data-merge-col="checkbox"><input type="checkbox" class="js-order-row-checkbox" data-order-id="${escapeAttribute(order.id)}" data-item-id="${escapeAttribute(item.id)}"${checkedAttr}></td>`;
      const discountControl = `<label class="orders-inline-merge-toggle"><input type="checkbox" class="js-edit-order-wide-toggle" data-order-id="${escapeAttribute(order.id)}" data-kind="discount"${mergeDiscount ? ' checked' : ''}> 모든 항목에 적용</label>`;
      const shippingControl = `<label class="orders-inline-merge-toggle"><input type="checkbox" class="js-edit-order-wide-toggle" data-order-id="${escapeAttribute(order.id)}" data-kind="shipping"${mergeShipping ? ' checked' : ''}> 모든 항목에 적용</label>`;
      const discountCell = mergeDiscount
        ? (isFirstInOrder
          ? `<td data-merge-col="discount" rowspan="${String(rowSpan)}">${discountControl}<input class="orders-input js-edit-discount" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(item.discount, true, true))}" placeholder="선택"></td>`
          : '')
        : `<td data-merge-col="discount">${isFirstInOrder ? discountControl : ''}<input class="orders-input js-edit-discount" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(item.discount, true, true))}" placeholder="선택"></td>`;
      const shippingCell = mergeShipping
        ? (isFirstInOrder
          ? `<td data-merge-col="shipping" rowspan="${String(rowSpan)}">${shippingControl}<input class="orders-input js-edit-shipping" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(item.shippingFee, true))}" placeholder="선택"></td>`
          : '')
        : `<td data-merge-col="shipping">${isFirstInOrder ? shippingControl : ''}<input class="orders-input js-edit-shipping" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(item.shippingFee, true))}" placeholder="선택"></td>`;
      const totalCell = mergeTotal
        ? (isFirstInOrder
          ? `<td class="orders-price orders-col-total js-edit-order-total" data-merge-col="total" rowspan="${String(rowSpan)}">${formatPriceText(orderTotal)}</td>`
          : '')
        : `<td class="orders-price orders-col-total js-edit-total" data-merge-col="total">${formatPriceText(getLineTotal(item.price, item.discount, item.shippingFee))}</td>`;
      const statusCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td data-merge-col="status" rowspan="${String(rowSpan)}"><select class="orders-select js-edit-order-status">${statusOptionsHTML}</select></td>`
          : '')
        : `<td data-merge-col="status"><select class="orders-select js-edit-status">${statusOptionsHTML}</select></td>`;
      const actionsCell = mergeOrderCells
        ? (isFirstInOrder
          ? `<td class="orders-actions-cell" data-merge-col="actions" rowspan="${String(rowSpan)}">
          <button type="button" class="orders-action-btn save" data-action="save" data-order-id="${escapeHtml(order.id)}">저장</button>
          <button type="button" class="orders-action-btn cancel" data-action="cancel">취소</button>
        </td>`
          : '')
        : `<td class="orders-actions-cell" data-merge-col="actions">
          <button type="button" class="orders-action-btn save" data-action="save" data-order-id="${escapeHtml(order.id)}" data-item-id="${escapeHtml(item.id)}">저장</button>
          <button type="button" class="orders-action-btn cancel" data-action="cancel">취소</button>
        </td>`;

      return `
        ${checkboxCell}${groupCells}
        <td class="${leadClass.trim()}" data-merge-col="category"><select class="orders-select js-edit-category" required>${categoryOptionsHTML}</select></td>
        <td class="${leadClass.trim()}" data-merge-col="site"><select class="orders-select js-edit-site" required>${siteOptionsHTML}</select></td>
        <td class="${leadClass.trim()}" data-merge-col="product">
          <div class="orders-edit-product-wrap">
            <textarea class="orders-input orders-textarea js-edit-product" rows="1" required>${escapeHtml(item.product)}</textarea>
            <button type="button" class="orders-inline-delete-btn" data-action="delete-item-inline" data-order-id="${escapeHtml(order.id)}" data-item-id="${escapeHtml(item.id)}" aria-label="이 상품 삭제">삭제</button>
          </div>
        </td>
        <td class="orders-col-qty ${leadClass.trim()}" data-merge-col="quantity"><input class="orders-input js-edit-quantity" type="number" min="1" step="1" value="${String(item.quantity)}" required></td>
        <td class="${leadClass.trim()}" data-merge-col="price"><input class="orders-input js-edit-price" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(item.price, true))}" placeholder="선택"></td>
        ${discountCell}
        ${shippingCell}
        ${totalCell}
        ${statusCell}
        ${actionsCell}
      `;
    }

    return Object.freeze({ render });
  }

  const api = Object.freeze({ create });
  root.PotteryMaterialOrdersTableView = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);