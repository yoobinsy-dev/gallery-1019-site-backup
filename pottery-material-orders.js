(function () {
  const STORAGE_KEY = 'pottery-material-orders-v1';
  const PRODUCT_OPTIONS_KEY = 'pottery-material-product-options-v1';
  const DEFAULT_STATUS = '주문 완료';
  const STATUS_OPTIONS = ['주문 완료', '배송중', '배송 완료'];
  const CATEGORY_OPTIONS = ['흙', '유약', '기타'];

  const state = {
    orders: [],
    displayMonth: getMonthStart(new Date()),
    editing: null,
    editingBaseline: null,
    selectedItemIds: [],
    undoOrdersSnapshot: null,
    gridNavAnchor: null,
    pendingGridFocus: null,
    selectedLineIds: [],
    undoOrderLinesSnapshot: null,
    lineGridNavAnchor: null,
    lineOrderWideDiscount: false,
    lineOrderWideShipping: false,
    mergeAnchor: null,
    mergeSelection: null,
    manualCellMerges: {
      main: [],
      popup: []
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    bindEvents();
    renderMonthLabel();
    renderOrdersTable();
  });

  function bindEvents() {
    document.getElementById('month-prev-btn')?.addEventListener('click', () => {
      moveDisplayMonth(-1);
    });

    document.getElementById('month-next-btn')?.addEventListener('click', () => {
      moveDisplayMonth(1);
    });

    document.getElementById('month-current-btn')?.addEventListener('click', () => {
      state.displayMonth = getMonthStart(new Date());
      renderMonthLabel();
      renderOrdersTable();
    });

    document.getElementById('open-add-order-modal-btn')?.addEventListener('click', openAddOrderModal);
    document.getElementById('order-add-btn')?.addEventListener('click', openAddOrderModal);
    document.getElementById('order-add-btn-bottom')?.addEventListener('click', openAddOrderModal);
    document.getElementById('close-order-modal-btn')?.addEventListener('click', closeAddOrderModal);
    document.getElementById('add-order-line-btn')?.addEventListener('click', () => {
      snapshotOrderLinesForUndo();
      appendOrderLine();
    });
    document.getElementById('line-select-all-btn')?.addEventListener('click', toggleSelectAllOrderLinesFromButton);
    document.getElementById('line-delete-all-btn')?.addEventListener('click', deleteAllOrderLines);
    document.getElementById('line-delete-selected-btn')?.addEventListener('click', deleteSelectedOrderLines);
    document.getElementById('line-undo-btn')?.addEventListener('click', undoOrderLineChanges);
    document.getElementById('line-merge-cells-btn')?.addEventListener('click', () => applyManualCellMerge('popup'));
    document.getElementById('line-order-discount-toggle')?.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;

      const nextChecked = input.checked;
      if (nextChecked === state.lineOrderWideDiscount) {
        return;
      }

      const rows = getVisibleOrderLineRows();

      if (nextChecked) {
        const shouldWarn = shouldWarnTopValueOnlyForRows(rows, '.js-new-discount');
        if (shouldWarn) {
          const ok = window.confirm('병합하면 맨 위 셀의 값만 유지되고 아래 값은 삭제됩니다. 계속할까요?');
          if (!ok) {
            input.checked = false;
            state.lineOrderWideDiscount = false;
            return;
          }
        }
      }

      snapshotOrderLinesForUndo();
      if (nextChecked) {
        keepOnlyTopRowValue(rows, '.js-new-discount');
      }

      state.lineOrderWideDiscount = nextChecked;
      applyOrderWideLineAdjustments('discount');
    });
    document.getElementById('line-order-shipping-toggle')?.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;

      const nextChecked = input.checked;
      if (nextChecked === state.lineOrderWideShipping) {
        return;
      }

      const rows = getVisibleOrderLineRows();

      if (nextChecked) {
        const shouldWarn = shouldWarnTopValueOnlyForRows(rows, '.js-new-shipping');
        if (shouldWarn) {
          const ok = window.confirm('병합하면 맨 위 셀의 값만 유지되고 아래 값은 삭제됩니다. 계속할까요?');
          if (!ok) {
            input.checked = false;
            state.lineOrderWideShipping = false;
            return;
          }
        }
      }

      snapshotOrderLinesForUndo();
      if (nextChecked) {
        keepOnlyTopRowValue(rows, '.js-new-shipping');
      }

      state.lineOrderWideShipping = nextChecked;
      applyOrderWideLineAdjustments('shipping');
    });
    document.getElementById('select-all-order-lines')?.addEventListener('change', (event) => {
      const checkbox = event.target;
      if (!(checkbox instanceof HTMLInputElement)) return;
      toggleSelectAllOrderLines(checkbox.checked);
    });
    document.getElementById('order-select-all-btn')?.addEventListener('click', toggleSelectAllOrdersFromButton);
    document.getElementById('order-select-all-btn-bottom')?.addEventListener('click', toggleSelectAllOrdersFromButton);
    document.getElementById('order-delete-all-btn')?.addEventListener('click', deleteAllVisibleOrderItems);
    document.getElementById('order-delete-all-btn-bottom')?.addEventListener('click', deleteAllVisibleOrderItems);
    document.getElementById('order-delete-selected-btn')?.addEventListener('click', deleteSelectedOrderItems);
    document.getElementById('order-delete-selected-btn-bottom')?.addEventListener('click', deleteSelectedOrderItems);
    document.getElementById('order-edit-selected-btn')?.addEventListener('click', editSelectedOrderItem);
    document.getElementById('order-edit-selected-btn-bottom')?.addEventListener('click', editSelectedOrderItem);
    document.getElementById('order-undo-btn')?.addEventListener('click', undoOrderChanges);
    document.getElementById('order-undo-btn-bottom')?.addEventListener('click', undoOrderChanges);
    document.getElementById('order-export-btn')?.addEventListener('click', exportOrdersToExcel);
    document.getElementById('order-export-btn-bottom')?.addEventListener('click', exportOrdersToExcel);
    document.getElementById('order-merge-cells-btn')?.addEventListener('click', () => applyManualCellMerge('main'));
    document.getElementById('order-merge-cells-btn-bottom')?.addEventListener('click', () => applyManualCellMerge('main'));
    document.getElementById('select-all-orders')?.addEventListener('change', (event) => {
      const checkbox = event.target;
      if (!(checkbox instanceof HTMLInputElement)) return;
      toggleSelectAllOrders(checkbox.checked);
    });

    document.getElementById('material-order-form')?.addEventListener('submit', submitNewOrder);

    const modal = document.getElementById('material-order-modal');
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeAddOrderModal();
      }
    });

    const orderLines = document.getElementById('material-order-lines');
    orderLines?.addEventListener('mousedown', (event) => {
      if (!event.shiftKey) return;
      const cell = getOrderLinesGridCellFromElement(event.target);
      if (!cell) return;
      if (handleMergeCellSelectionClick(event, cell, 'popup')) {
        event.preventDefault();
      }
    });
    orderLines?.addEventListener('click', (event) => {
      const checkboxTarget = event.target;
      if (checkboxTarget instanceof HTMLInputElement && checkboxTarget.classList.contains('js-order-line-checkbox')) {
        return;
      }

      const removeBtn = event.target.closest('.order-line-remove-btn');
      if (!removeBtn) return;

      const row = removeBtn.closest('.order-line-row');
      if (!row) return;

      const lineId = String(row.dataset.lineId || '');
      if (lineId) {
        state.selectedLineIds = state.selectedLineIds.filter((id) => id !== lineId);
      }

      const rows = Array.from(orderLines.querySelectorAll('.order-line-row'));
      if (rows.length <= 1) {
        alert('최소 1개 행은 필요합니다.');
        return;
      }

      snapshotOrderLinesForUndo();
      row.remove();
      applyOrderWideLineAdjustments('discount');
      applyOrderWideLineAdjustments('shipping');
      refreshOrderLinesKeyboardNavigation();
      updateOrderLineBulkButtons();
      updateOrderLinesTotalRow();
    });

    orderLines?.addEventListener('change', handleOrderLinesChange);
    orderLines?.addEventListener('click', handleOrderLinesGridCellClick);
    orderLines?.addEventListener('focusin', handleOrderLinesGridCellFocusIn);

    orderLines?.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-price-input') && !input.classList.contains('js-discount-input') && !input.classList.contains('js-shipping-input')) return;
      input.value = formatCurrencyInputForField(input, false);
      updateOrderLineTotalForRow(input.closest('.order-line-row'));
    });

    orderLines?.addEventListener('input', (event) => {
      const textarea = event.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('orders-textarea')) return;
      autoResizeTextarea(textarea);
    });

    orderLines?.addEventListener('focusin', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-price-input') && !input.classList.contains('js-discount-input') && !input.classList.contains('js-shipping-input')) return;
      input.value = formatCurrencyInputForField(input, false);
    });

    orderLines?.addEventListener('focusout', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-price-input') && !input.classList.contains('js-discount-input') && !input.classList.contains('js-shipping-input')) return;
      input.value = formatCurrencyInputForField(input, true);
      updateOrderLineTotalForRow(input.closest('.order-line-row'));
    });

    const tbody = document.getElementById('material-orders-tbody');
    tbody?.addEventListener('mousedown', (event) => {
      if (!event.shiftKey) return;
      const cell = getGridCellFromElement(event.target);
      if (!cell) return;
      if (handleMergeCellSelectionClick(event, cell, 'main')) {
        event.preventDefault();
      }
    });
    tbody?.addEventListener('click', handleTableClick);
    tbody?.addEventListener('change', handleTableChange);
    tbody?.addEventListener('click', handleGridCellClick);
    tbody?.addEventListener('focusin', handleGridCellFocusIn);

    tbody?.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-edit-price') && !input.classList.contains('js-edit-discount') && !input.classList.contains('js-edit-shipping')) return;
      input.value = formatCurrencyInputForField(input, false);
      updateInlineEditTotalForRow(input.closest('tr'));
    });

    tbody?.addEventListener('focusin', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-edit-price') && !input.classList.contains('js-edit-discount') && !input.classList.contains('js-edit-shipping')) return;
      input.value = formatCurrencyInputForField(input, false);
    });

    tbody?.addEventListener('focusout', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains('js-edit-price') && !input.classList.contains('js-edit-discount') && !input.classList.contains('js-edit-shipping')) return;
      input.value = formatCurrencyInputForField(input, true);
      updateInlineEditTotalForRow(input.closest('tr'));
    });

    tbody?.addEventListener('input', (event) => {
      const textarea = event.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('orders-textarea')) return;
      autoResizeTextarea(textarea);
    });

    document.addEventListener('keydown', handleOrdersGridKeyboardNavigation, true);
  }

  function moveDisplayMonth(monthDelta) {
    const next = new Date(state.displayMonth.getFullYear(), state.displayMonth.getMonth() + monthDelta, 1);
    state.displayMonth = getMonthStart(next);
    renderMonthLabel();
    renderOrdersTable();
  }

  function renderMonthLabel() {
    const label = document.getElementById('month-label');
    if (!label) return;
    label.textContent = `${state.displayMonth.getFullYear()}년 ${state.displayMonth.getMonth() + 1}월`;
  }

  function renderOrdersTable() {
    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    const monthKey = getMonthKeyFromDate(state.displayMonth);
    const orders = getOrdersForMonth(monthKey);
    const orderNoMap = buildOrderNumberMap();
    const visibleItemIds = [];

    orders.forEach((order) => {
      order.items.forEach((item) => {
        visibleItemIds.push(item.id);
      });
    });

    state.selectedItemIds = state.selectedItemIds.filter((itemId) => visibleItemIds.includes(itemId));

    tbody.innerHTML = '';

    if (orders.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="12" class="orders-empty-row">해당 월의 재료 주문 기록이 없습니다.</td>';
      tbody.appendChild(tr);
      updateBulkActionButtons();
      return;
    }

    orders.forEach((order) => {
      const editingInOrder = Boolean(state.editing && state.editing.orderId === order.id);
      const rowSpan = order.items.length;
      const mergeDiscount = Boolean(order.orderWideDiscount);
      const mergeShipping = Boolean(order.orderWideShipping);
      const mergeTotal = mergeDiscount || mergeShipping;
      const orderTotal = getOrderTotal(order);
      const mergeOrderCells = rowSpan > 1;

      order.items.forEach((item, itemIndex) => {
        const tr = document.createElement('tr');
        tr.dataset.orderId = order.id;
        tr.dataset.itemId = item.id;
        if (itemIndex === 0) tr.classList.add('group-start');

        const isEditing = editingInOrder;
        if (isEditing) {
          tr.classList.add('orders-inline-edit');
        }

        const showGroupCell = itemIndex === 0;
        const orderNo = orderNoMap.get(order.id) || '-';

        if (isEditing) {
          tr.innerHTML = buildInlineEditRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, {
            mergeOrderCells,
            mergeDiscount,
            mergeShipping,
            mergeTotal,
            orderTotal
          });
        } else {
          tr.innerHTML = buildReadOnlyRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, {
            mergeDiscount,
            mergeShipping,
            mergeTotal,
            orderTotal,
            mergeOrderCells
          });
        }

        tbody.appendChild(tr);
      });
    });

    appendMainTableTotalRow(tbody, orders);
    applyManualCellMerges('main');

    autoResizeTextareasIn(tbody);
    updateBulkActionButtons();
    clearMergeSelection(false);
    updateMergeButtons();
    refreshGridKeyboardNavigation();
  }

  function appendMainTableTotalRow(tbody, orders) {
    if (!tbody) return;

    let grandTotal = 0;

    orders.forEach((order) => {
      const orderTotal = getOrderTotal(order);
      if (typeof orderTotal === 'number' && orderTotal > 0) {
        grandTotal += orderTotal;
      }
    });

    const tr = document.createElement('tr');
    tr.className = 'orders-total-row';
    tr.innerHTML = `
      <td colspan="6" class="orders-total-label">총 합계</td>
      <td class="orders-price">-</td>
      <td class="orders-price">-</td>
      <td class="orders-price">-</td>
      <td class="orders-price">${formatPriceText(grandTotal)}</td>
      <td colspan="3"></td>
    `;
    tbody.appendChild(tr);
  }

  function buildReadOnlyRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta) {
    const numberClass = showGroupCell ? 'orders-number' : 'orders-number orders-group-empty';
    const dateClass = showGroupCell ? 'orders-date' : 'orders-date orders-group-empty';

    const numberText = showGroupCell ? String(orderNo) : String(orderNo);
    const dateText = showGroupCell ? escapeHtml(order.orderDate) : escapeHtml(order.orderDate);
    const checkedAttr = state.selectedItemIds.includes(item.id) ? ' checked' : '';
    const isFirstInOrder = itemIndex === 0;
    const mergeDiscount = Boolean(mergeMeta?.mergeDiscount);
    const mergeShipping = Boolean(mergeMeta?.mergeShipping);
    const mergeTotal = Boolean(mergeMeta?.mergeTotal);
    const orderTotal = Number(mergeMeta?.orderTotal) || 0;
    const mergeOrderCells = Boolean(mergeMeta?.mergeOrderCells);
    const orderChecked = order.items.length > 0 && order.items.every((entry) => state.selectedItemIds.includes(entry.id));

    const groupCells = showGroupCell
      ? `
      <td class="${numberClass}" data-merge-col="number" rowspan="${String(rowSpan)}">${numberText}</td>
      <td class="${dateClass}" data-merge-col="date" rowspan="${String(rowSpan)}">${dateText}</td>`
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
        ? `<td data-merge-col="status" rowspan="${String(rowSpan)}"><span class="orders-status">${escapeHtml(item.status || DEFAULT_STATUS)}</span></td>`
        : '')
      : `<td data-merge-col="status"><span class="orders-status">${escapeHtml(item.status || DEFAULT_STATUS)}</span></td>`;

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

  function buildInlineEditRowHTML(orderNo, order, item, itemIndex, showGroupCell, rowSpan, mergeMeta) {
    const statusOptionsHTML = buildStatusOptionsHTML(item.status || DEFAULT_STATUS);
    const categoryOptionsHTML = buildCategoryOptionsHTML(item.category || '');
    const mergeOrderCells = Boolean(mergeMeta?.mergeOrderCells);
    const mergeDiscount = Boolean(mergeMeta?.mergeDiscount);
    const mergeShipping = Boolean(mergeMeta?.mergeShipping);
    const mergeTotal = Boolean(mergeMeta?.mergeTotal);
    const orderTotal = Number(mergeMeta?.orderTotal) || 0;

    const numberClass = showGroupCell ? 'orders-number' : 'orders-number';
    const dateClass = showGroupCell ? 'orders-date' : 'orders-date';
    const checkedAttr = state.selectedItemIds.includes(item.id) ? ' checked' : '';

    const groupCells = showGroupCell
      ? `
      <td class="${numberClass}" data-merge-col="number" rowspan="${String(rowSpan)}">${String(orderNo)}</td>
      <td class="${dateClass}" data-merge-col="date" rowspan="${String(rowSpan)}"><input class="orders-input js-edit-date" type="date" value="${escapeAttribute(order.orderDate)}" required></td>`
      : '';

    const isFirstInOrder = itemIndex === 0;
    const needsToggleLead = isFirstInOrder && (!mergeDiscount || !mergeShipping);
    const leadClass = needsToggleLead ? ' orders-inline-toggle-lead' : '';
    const orderChecked = order.items.length > 0 && order.items.every((entry) => state.selectedItemIds.includes(entry.id));
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
        ? `<td data-merge-col="status" rowspan="${String(rowSpan)}">
        <select class="orders-select js-edit-order-status">
          ${statusOptionsHTML}
        </select>
      </td>`
        : '')
      : `<td data-merge-col="status">
        <select class="orders-select js-edit-status">
          ${statusOptionsHTML}
        </select>
      </td>`;

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
      <td class="${leadClass.trim()}" data-merge-col="category">
        <select class="orders-select js-edit-category" required>
          ${categoryOptionsHTML}
        </select>
      </td>
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

  function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const orderId = button.dataset.orderId || '';
    const itemId = button.dataset.itemId || '';

    if (action === 'edit') {
      if (!beginOrderEditing(orderId)) return;
      renderOrdersTable();
      return;
    }

    if (action === 'cancel') {
      restoreOrderFromEditingBaseline();
      clearOrderEditingState();
      renderOrdersTable();
      return;
    }

    if (action === 'save') {
      saveInlineEdit(orderId);
      return;
    }

    if (action === 'delete-item-inline') {
      deleteOrderItemInline(orderId, itemId);
      return;
    }

    if (action === 'delete-order') {
      deleteOrder(orderId);
      return;
    }

    if (action === 'delete') {
      deleteOrderItem(orderId, itemId);
    }
  }

  function handleTableChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    if (input.classList.contains('js-edit-order-wide-toggle')) {
      const orderId = String(input.dataset.orderId || '').trim();
      const kind = String(input.dataset.kind || '').trim();
      if (!orderId || (kind !== 'discount' && kind !== 'shipping')) return;

      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return;
      if (!beginOrderEditing(orderId)) return;

      const previousValue = kind === 'discount'
        ? Boolean(order.orderWideDiscount)
        : Boolean(order.orderWideShipping);
      if (input.checked === previousValue) {
        return;
      }

      if (input.checked) {
        const selector = kind === 'discount' ? '.js-edit-discount' : '.js-edit-shipping';
        const rows = getInlineEditRowsByOrderId(orderId);
        const shouldWarn = shouldWarnTopValueOnlyForRows(rows, selector);
        if (shouldWarn) {
          const ok = window.confirm('병합하면 맨 위 셀의 값만 유지되고 아래 값은 삭제됩니다. 계속할까요?');
          if (!ok) {
            input.checked = false;
            return;
          }
        }
      }

      snapshotOrdersForUndo();
      captureInlineEditDraft(orderId);
      if (kind === 'discount') {
        order.orderWideDiscount = input.checked;
        if (input.checked) {
          collapseOrderValuesToTop(order, 'discount');
        }
      } else {
        order.orderWideShipping = input.checked;
        if (input.checked) {
          collapseOrderValuesToTop(order, 'shipping');
        }
      }

      beginOrderEditing(orderId);
      renderOrdersTable();
      return;
    }

    if (!input.classList.contains('js-order-row-checkbox')) return;

    const orderCheckbox = String(input.dataset.orderCheckbox || '').trim() === 'true';
    if (orderCheckbox) {
      const orderId = String(input.dataset.orderId || '').trim();
      if (!orderId) return;
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return;

      const orderItemIds = order.items.map((entry) => entry.id);
      if (input.checked) {
        const merged = new Set(state.selectedItemIds);
        orderItemIds.forEach((id) => merged.add(id));
        state.selectedItemIds = Array.from(merged);
      } else {
        const selectedSet = new Set(orderItemIds);
        state.selectedItemIds = state.selectedItemIds.filter((id) => !selectedSet.has(id));
      }

      refreshOrderSelectionUI();
      updateBulkActionButtons();
      return;
    }

    const itemId = String(input.dataset.itemId || '').trim();
    if (!itemId) return;

    if (input.checked) {
      if (!state.selectedItemIds.includes(itemId)) {
        state.selectedItemIds.push(itemId);
      }
    } else {
      state.selectedItemIds = state.selectedItemIds.filter((id) => id !== itemId);
    }

    refreshOrderSelectionUI();
    updateBulkActionButtons();
  }

  function refreshOrderSelectionUI() {
    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('.js-order-row-checkbox').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const isOrderCheckbox = String(input.dataset.orderCheckbox || '').trim() === 'true';
      if (isOrderCheckbox) {
        const orderId = String(input.dataset.orderId || '').trim();
        const order = state.orders.find((entry) => entry.id === orderId);
        if (!order) {
          input.checked = false;
          return;
        }
        input.checked = order.items.length > 0 && order.items.every((entry) => state.selectedItemIds.includes(entry.id));
        return;
      }

      const itemId = String(input.dataset.itemId || '').trim();
      input.checked = itemId ? state.selectedItemIds.includes(itemId) : false;
    });
  }

  function getInlineEditRowsByOrderId(orderId) {
    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll(`tr[data-order-id="${escapeAttribute(orderId)}"]`));
  }

  function shouldWarnTopValueOnlyForRows(rows, selector) {
    if (!Array.isArray(rows) || rows.length <= 1) return false;
    return rows.slice(1).some((row) => {
      const input = row.querySelector(selector);
      if (!(input instanceof HTMLInputElement)) return false;
      return parseCurrencyInput(input.value) !== null;
    });
  }

  function keepOnlyTopRowValue(rows, selector) {
    if (!Array.isArray(rows) || rows.length <= 1) return;
    rows.slice(1).forEach((row) => {
      const input = row.querySelector(selector);
      if (!(input instanceof HTMLInputElement)) return;
      input.value = '';
    });
  }

  function collapseOrderValuesToTop(order, kind) {
    if (!order || !Array.isArray(order.items) || order.items.length <= 1) return;
    const key = kind === 'discount' ? 'discount' : 'shippingFee';
    for (let i = 1; i < order.items.length; i += 1) {
      order.items[i][key] = null;
    }
  }

  function beginOrderEditing(orderId, resetBaseline = false) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return false;

    const order = state.orders.find((entry) => entry.id === normalizedOrderId);
    if (!order) return false;

    const alreadyEditingSameOrder = Boolean(state.editing && state.editing.orderId === normalizedOrderId);
    if (resetBaseline || !alreadyEditingSameOrder || !state.editingBaseline || state.editingBaseline.id !== normalizedOrderId) {
      state.editingBaseline = JSON.parse(JSON.stringify(order));
    }

    state.editing = { orderId: normalizedOrderId };
    return true;
  }

  function restoreOrderFromEditingBaseline() {
    if (!state.editing || !state.editingBaseline) return;

    const orderId = String(state.editing.orderId || '').trim();
    const baseline = state.editingBaseline;
    if (!orderId || baseline.id !== orderId) return;

    const orderIndex = state.orders.findIndex((entry) => entry.id === orderId);
    if (orderIndex < 0) return;

    const restoredOrder = normalizeOrder(JSON.parse(JSON.stringify(baseline)));
    if (!restoredOrder) return;
    state.orders[orderIndex] = restoredOrder;
  }

  function clearOrderEditingState() {
    state.editing = null;
    state.editingBaseline = null;
  }

  function saveInlineEdit(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll(`tr[data-order-id="${escapeAttribute(orderId)}"]`));
    if (rows.length === 0) return;

    const firstRow = rows[0];
    const dateInput = firstRow.querySelector('.js-edit-date');
    const orderDate = String(dateInput?.value || '').trim();
    if (!orderDate) {
      alert('날짜를 입력해주세요.');
      return;
    }

    const orderStatusSelect = firstRow.querySelector('.js-edit-order-status');
    const orderStatus = String(orderStatusSelect?.value || '').trim() || DEFAULT_STATUS;

    const nextItems = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowItemId = String(row.dataset.itemId || '').trim();
      const existingItem = order.items.find((entry) => entry.id === rowItemId);
      if (!existingItem) continue;

      const categorySelect = row.querySelector('.js-edit-category');
      const productInput = row.querySelector('.js-edit-product');
      const quantityInput = row.querySelector('.js-edit-quantity');
      const priceInput = row.querySelector('.js-edit-price');
      const discountInput = row.querySelector('.js-edit-discount');
      const shippingInput = row.querySelector('.js-edit-shipping');
      const statusSelect = row.querySelector('.js-edit-status');

      const category = String(categorySelect?.value || '').trim();
      const product = String(productInput?.value || '').trim();
      const quantity = Number(quantityInput?.value || 0);
      const status = orderStatusSelect
        ? orderStatus
        : (String(statusSelect?.value || '').trim() || DEFAULT_STATUS);
      const price = parseCurrencyInput(priceInput?.value || '');
      const discount = parseCurrencyInput(discountInput?.value || '');
      const shippingFee = parseCurrencyInput(shippingInput?.value || '');

      if (!product) {
        alert('상품을 입력해주세요.');
        return;
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        alert('수량은 1 이상의 정수만 입력할 수 있습니다.');
        return;
      }

      nextItems.push({
        ...existingItem,
        category,
        product,
        quantity,
        price,
        discount,
        shippingFee,
        status
      });
    }

    if (nextItems.length === 0) {
      alert('저장할 주문 항목이 없습니다.');
      return;
    }

    snapshotOrdersForUndo();
    order.orderDate = orderDate;
    order.items = nextItems;

    saveOrders();
    clearOrderEditingState();
    renderOrdersTable();
  }

  function captureInlineEditDraft(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll(`tr[data-order-id="${escapeAttribute(orderId)}"]`));
    if (rows.length === 0) return;

    const firstRow = rows[0];
    const dateInput = firstRow.querySelector('.js-edit-date');
    const nextDate = normalizeDateISO(String(dateInput?.value || '').trim());
    if (nextDate) {
      order.orderDate = nextDate;
    }

    const orderStatusSelect = firstRow.querySelector('.js-edit-order-status');
    const orderStatus = String(orderStatusSelect?.value || '').trim() || DEFAULT_STATUS;

    const nextItems = [];
    rows.forEach((row) => {
      const rowItemId = String(row.dataset.itemId || '').trim();
      const existingItem = order.items.find((entry) => entry.id === rowItemId);
      if (!existingItem) return;

      const categorySelect = row.querySelector('.js-edit-category');
      const productInput = row.querySelector('.js-edit-product');
      const quantityInput = row.querySelector('.js-edit-quantity');
      const priceInput = row.querySelector('.js-edit-price');
      const discountInput = row.querySelector('.js-edit-discount');
      const shippingInput = row.querySelector('.js-edit-shipping');
      const statusSelect = row.querySelector('.js-edit-status');

      const category = String(categorySelect?.value || existingItem.category || '').trim();
      const product = String(productInput?.value || existingItem.product || '').trim() || existingItem.product;
      const rawQuantity = Number(quantityInput?.value || existingItem.quantity || 0);
      const quantity = Number.isInteger(rawQuantity) && rawQuantity > 0 ? rawQuantity : existingItem.quantity;

      nextItems.push({
        ...existingItem,
        category,
        product,
        quantity,
        price: parseCurrencyInput(priceInput?.value || '') ?? existingItem.price,
        discount: parseCurrencyInput(discountInput?.value || '') ?? existingItem.discount,
        shippingFee: parseCurrencyInput(shippingInput?.value || '') ?? existingItem.shippingFee,
        status: orderStatusSelect
          ? orderStatus
          : (String(statusSelect?.value || existingItem.status || DEFAULT_STATUS).trim() || DEFAULT_STATUS)
      });
    });

    if (nextItems.length > 0) {
      order.items = nextItems;
    }
  }

  function deleteOrderItemInline(orderId, itemId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const ok = window.confirm('이 상품 항목을 삭제할까요?');
    if (!ok) return;

    snapshotOrdersForUndo();

    order.items = order.items.filter((entry) => entry.id !== itemId);
    state.orders = state.orders.filter((entry) => entry.id !== orderId || entry.items.length > 0);
    state.selectedItemIds = state.selectedItemIds.filter((id) => id !== itemId);

    if (!order.items.length) {
      clearOrderEditingState();
    } else if (state.editing && state.editing.orderId === orderId) {
      beginOrderEditing(orderId, true);
    }

    saveOrders();
    renderOrdersTable();
  }

  function deleteOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const ok = window.confirm('이 주문 전체를 삭제할까요?');
    if (!ok) return;

    snapshotOrdersForUndo();
    const itemIdSet = new Set(order.items.map((item) => item.id));
    state.orders = state.orders.filter((entry) => entry.id !== orderId);
    state.selectedItemIds = state.selectedItemIds.filter((id) => !itemIdSet.has(id));
    if (state.editing && state.editing.orderId === orderId) {
      clearOrderEditingState();
    }

    saveOrders();
    renderOrdersTable();
  }

  function deleteOrderItem(orderId, itemId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const ok = window.confirm('해당 주문 항목을 삭제할까요?');
    if (!ok) return;

    snapshotOrdersForUndo();

    order.items = order.items.filter((entry) => entry.id !== itemId);
    state.orders = state.orders.filter((entry) => entry.id !== orderId || entry.items.length > 0);
    state.selectedItemIds = state.selectedItemIds.filter((id) => id !== itemId);

    if (state.editing && state.editing.orderId === orderId) {
      clearOrderEditingState();
    }

    saveOrders();
    renderOrdersTable();
  }

  function getVisibleOrderItemRefs() {
    const monthKey = getMonthKeyFromDate(state.displayMonth);
    const refs = [];

    getOrdersForMonth(monthKey).forEach((order) => {
      order.items.forEach((item) => {
        refs.push({ orderId: order.id, itemId: item.id });
      });
    });

    return refs;
  }

  function toggleSelectAllOrdersFromButton() {
    const visible = getVisibleOrderItemRefs();
    if (visible.length === 0) return;

    const allSelected = visible.every((ref) => state.selectedItemIds.includes(ref.itemId));
    if (allSelected) {
      const visibleIdSet = new Set(visible.map((ref) => ref.itemId));
      state.selectedItemIds = state.selectedItemIds.filter((id) => !visibleIdSet.has(id));
    } else {
      const merged = new Set(state.selectedItemIds);
      visible.forEach((ref) => merged.add(ref.itemId));
      state.selectedItemIds = Array.from(merged);
    }

    renderOrdersTable();
  }

  function toggleSelectAllOrders(checked) {
    const visible = getVisibleOrderItemRefs();
    if (checked) {
      const merged = new Set(state.selectedItemIds);
      visible.forEach((ref) => merged.add(ref.itemId));
      state.selectedItemIds = Array.from(merged);
    } else {
      const visibleIdSet = new Set(visible.map((ref) => ref.itemId));
      state.selectedItemIds = state.selectedItemIds.filter((id) => !visibleIdSet.has(id));
    }

    renderOrdersTable();
  }

  function deleteAllVisibleOrderItems() {
    const visible = getVisibleOrderItemRefs();
    if (visible.length === 0) {
      alert('삭제할 주문 항목이 없습니다.');
      return;
    }

    const ok = window.confirm('현재 월의 모든 주문 항목을 삭제할까요?');
    if (!ok) return;

    snapshotOrdersForUndo();
    const visibleIdSet = new Set(visible.map((ref) => ref.itemId));
    state.orders = state.orders
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => !visibleIdSet.has(item.id))
      }))
      .filter((order) => order.items.length > 0);

    state.selectedItemIds = state.selectedItemIds.filter((id) => !visibleIdSet.has(id));
    clearOrderEditingState();
    saveOrders();
    renderOrdersTable();
  }

  function deleteSelectedOrderItems() {
    const visible = getVisibleOrderItemRefs();
    const visibleIdSet = new Set(visible.map((ref) => ref.itemId));
    const selectedVisibleIds = state.selectedItemIds.filter((id) => visibleIdSet.has(id));

    if (selectedVisibleIds.length === 0) {
      alert('선택된 주문 항목이 없습니다.');
      return;
    }

    const ok = window.confirm(`선택된 ${selectedVisibleIds.length}개 주문 항목을 삭제할까요?`);
    if (!ok) return;

    snapshotOrdersForUndo();
    const selectedSet = new Set(selectedVisibleIds);
    state.orders = state.orders
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => !selectedSet.has(item.id))
      }))
      .filter((order) => order.items.length > 0);

    state.selectedItemIds = state.selectedItemIds.filter((id) => !selectedSet.has(id));
    clearOrderEditingState();
    saveOrders();
    renderOrdersTable();
  }

  function editSelectedOrderItem() {
    const visible = getVisibleOrderItemRefs();
    const firstVisibleSelected = visible.find((ref) => state.selectedItemIds.includes(ref.itemId));

    if (!firstVisibleSelected) {
      alert('선택된 주문 항목이 없습니다.');
      return;
    }

    beginOrderEditing(firstVisibleSelected.orderId);
    renderOrdersTable();
  }

  function snapshotOrdersForUndo() {
    state.undoOrdersSnapshot = {
      orders: JSON.parse(JSON.stringify(state.orders)),
      manualCellMerges: JSON.parse(JSON.stringify(state.manualCellMerges))
    };
  }

  function undoOrderChanges() {
    if (!state.undoOrdersSnapshot) {
      alert('되돌릴 변경 내용이 없습니다.');
      return;
    }

    const snapshot = state.undoOrdersSnapshot;
    const snapshotOrders = Array.isArray(snapshot)
      ? snapshot
      : (Array.isArray(snapshot.orders) ? snapshot.orders : []);

    state.orders = snapshotOrders.map(normalizeOrder).filter(Boolean);
    if (!Array.isArray(snapshot)) {
      state.manualCellMerges = {
        main: Array.isArray(snapshot.manualCellMerges?.main) ? snapshot.manualCellMerges.main : [],
        popup: Array.isArray(snapshot.manualCellMerges?.popup) ? snapshot.manualCellMerges.popup : []
      };
    }
    state.undoOrdersSnapshot = null;
    state.selectedItemIds = [];
    clearOrderEditingState();
    saveOrders();
    renderOrdersTable();
  }

  function updateBulkActionButtons() {
    const visible = getVisibleOrderItemRefs();
    const visibleIdSet = new Set(visible.map((ref) => ref.itemId));
    const selectedVisibleCount = state.selectedItemIds.filter((id) => visibleIdSet.has(id)).length;
    const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length;

    ['order-select-all-btn', 'order-select-all-btn-bottom'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
    });

    ['order-delete-selected-btn', 'order-delete-selected-btn-bottom', 'order-edit-selected-btn', 'order-edit-selected-btn-bottom'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.style.display = selectedVisibleCount > 0 ? 'inline-block' : 'none';
    });

    ['order-undo-btn', 'order-undo-btn-bottom'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = !state.undoOrdersSnapshot;
    });

    const selectAllCheckbox = document.getElementById('select-all-orders');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = allVisibleSelected;
      selectAllCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visible.length;
    }
  }

  function exportOrdersToExcel() {
    const monthKey = getMonthKeyFromDate(state.displayMonth);
    const rows = [];

    getOrdersForMonth(monthKey).forEach((order, index) => {
      order.items.forEach((item) => {
        rows.push([
          String(index + 1),
          String(order.orderDate || ''),
          String(item.category || ''),
          String(item.product || ''),
          String(item.quantity || ''),
          formatPriceText(item.price),
          formatDiscountText(item.discount),
          formatPriceText(item.shippingFee),
          formatPriceText(getLineTotal(item.price, item.discount, item.shippingFee)),
          String(item.status || DEFAULT_STATUS)
        ]);
      });
    });

    if (rows.length === 0) {
      alert('내보낼 주문 항목이 없습니다.');
      return;
    }

    const header = ['번호', '날짜', '분류', '상품', '수량', '가격', '할인', '배송비', '합계', '상태'];
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `재료주문_${monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openAddOrderModal() {
    const modal = document.getElementById('material-order-modal');
    const dateInput = document.getElementById('material-order-date');
    const linesRoot = document.getElementById('material-order-lines');

    if (!modal || !dateInput || !linesRoot) return;

    dateInput.value = formatDateISO(new Date());
    linesRoot.innerHTML = '';
    state.selectedLineIds = [];
    state.undoOrderLinesSnapshot = null;
    state.lineGridNavAnchor = null;
    state.lineOrderWideDiscount = false;
    state.lineOrderWideShipping = false;
    state.manualCellMerges.popup = [];
    clearMergeSelection(true);

    const orderWideDiscountToggle = document.getElementById('line-order-discount-toggle');
    const orderWideShippingToggle = document.getElementById('line-order-shipping-toggle');

    if (orderWideDiscountToggle instanceof HTMLInputElement) {
      orderWideDiscountToggle.checked = false;
    }
    if (orderWideShippingToggle instanceof HTMLInputElement) {
      orderWideShippingToggle.checked = false;
    }

    appendOrderLine();
    applyOrderWideLineAdjustments('discount');
    applyOrderWideLineAdjustments('shipping');

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeAddOrderModal() {
    const modal = document.getElementById('material-order-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function appendOrderLine(initial = {}) {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return;

    const row = document.createElement('tr');
    row.className = 'order-line-row';
    const lineId = String(initial.lineId || makeId('line')).trim();
    row.dataset.lineId = lineId;

    const category = String(initial.category || '').trim();
    const product = String(initial.product || '');
    const quantity = Number.isFinite(Number(initial.quantity)) ? Math.max(1, Math.floor(Number(initial.quantity))) : 1;
    const price = Number.isFinite(Number(initial.price)) && Number(initial.price) > 0 ? Number(initial.price) : null;
    const discount = Number.isFinite(Number(initial.discount)) && Number(initial.discount) > 0 ? Number(initial.discount) : null;
    const shippingFee = Number.isFinite(Number(initial.shippingFee)) && Number(initial.shippingFee) > 0 ? Number(initial.shippingFee) : null;
    const checkedAttr = state.selectedLineIds.includes(lineId) ? ' checked' : '';
    const discountDisabled = state.lineOrderWideDiscount && getVisibleOrderLineRows().length > 0 ? ' disabled' : '';
    const shippingDisabled = state.lineOrderWideShipping && getVisibleOrderLineRows().length > 0 ? ' disabled' : '';

    row.innerHTML = `
      <td class="orders-checkbox-col" data-merge-col="checkbox"><input type="checkbox" class="js-order-line-checkbox" data-line-id="${escapeAttribute(lineId)}"${checkedAttr}></td>
      <td class="orders-lines-action-col" data-merge-col="remove">
        <button type="button" class="order-line-remove-btn">삭제</button>
      </td>
      <td data-merge-col="category">
        <select class="orders-select js-new-category" required>
          ${buildCategoryOptionsHTML(category)}
        </select>
      </td>
      <td data-merge-col="product">
        <textarea class="orders-input orders-textarea js-new-product" rows="1" required placeholder="상품명/규격 등 입력">${escapeHtml(product)}</textarea>
      </td>
      <td class="orders-col-qty" data-merge-col="quantity">
        <input class="orders-input js-new-quantity" type="number" min="1" step="1" value="${String(quantity)}" required>
      </td>
      <td data-merge-col="price">
        <input class="orders-input js-new-price js-price-input" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(price, true))}" placeholder="선택">
      </td>
      <td class="order-line-discount-cell" data-merge-col="discount">
        <input class="orders-input js-new-discount js-discount-input" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(discount, true, true))}" placeholder="선택"${discountDisabled}>
      </td>
      <td class="order-line-shipping-cell" data-merge-col="shipping">
        <input class="orders-input js-new-shipping js-shipping-input" type="text" inputmode="numeric" value="${escapeAttribute(formatWonInput(shippingFee, true))}" placeholder="선택"${shippingDisabled}>
      </td>
      <td class="orders-price orders-col-total order-line-total-cell js-line-total" data-merge-col="total">${formatPriceText(getLineTotal(price, discount, shippingFee))}</td>
    `;

    const totalRow = linesRoot.querySelector('.orders-lines-total-row');
    if (totalRow) {
      linesRoot.insertBefore(row, totalRow);
    } else {
      linesRoot.appendChild(row);
    }
    autoResizeTextareasIn(row);
    updateOrderLineTotalForRow(row);
    applyOrderWideLineAdjustments('discount');
    applyOrderWideLineAdjustments('shipping');
    refreshOrderLinesKeyboardNavigation();
    updateOrderLineBulkButtons();
    updateOrderLinesTotalRow();
  }

  function collectOrderLinesFromDOM() {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return [];

    return Array.from(linesRoot.querySelectorAll('.order-line-row')).map((row) => ({
      lineId: String(row.dataset.lineId || makeId('line')),
      category: String(row.querySelector('.js-new-category')?.value || '').trim(),
      product: String(row.querySelector('.js-new-product')?.value || ''),
      quantity: Number(row.querySelector('.js-new-quantity')?.value || 1),
      price: parseCurrencyInput(String(row.querySelector('.js-new-price')?.value || '')),
      discount: parseCurrencyInput(String(row.querySelector('.js-new-discount')?.value || '')),
      shippingFee: parseCurrencyInput(String(row.querySelector('.js-new-shipping')?.value || ''))
    }));
  }

  function snapshotOrderLinesForUndo() {
    state.undoOrderLinesSnapshot = {
      lines: collectOrderLinesFromDOM(),
      lineOrderWideDiscount: state.lineOrderWideDiscount,
      lineOrderWideShipping: state.lineOrderWideShipping,
      manualMergesPopup: JSON.parse(JSON.stringify(state.manualCellMerges.popup || []))
    };
  }

  function rebuildOrderLinesFromSnapshot(snapshotPayload) {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return;

    const lines = Array.isArray(snapshotPayload)
      ? snapshotPayload
      : (Array.isArray(snapshotPayload?.lines) ? snapshotPayload.lines : []);
    const lineOrderWideDiscount = Array.isArray(snapshotPayload)
      ? state.lineOrderWideDiscount
      : Boolean(snapshotPayload?.lineOrderWideDiscount);
    const lineOrderWideShipping = Array.isArray(snapshotPayload)
      ? state.lineOrderWideShipping
      : Boolean(snapshotPayload?.lineOrderWideShipping);
    const manualMergesPopup = Array.isArray(snapshotPayload)
      ? []
      : (Array.isArray(snapshotPayload?.manualMergesPopup) ? snapshotPayload.manualMergesPopup : []);

    linesRoot.innerHTML = '';
    state.selectedLineIds = [];
    state.lineOrderWideDiscount = lineOrderWideDiscount;
    state.lineOrderWideShipping = lineOrderWideShipping;
    state.manualCellMerges.popup = manualMergesPopup;

    const discountToggle = document.getElementById('line-order-discount-toggle');
    const shippingToggle = document.getElementById('line-order-shipping-toggle');
    if (discountToggle instanceof HTMLInputElement) {
      discountToggle.checked = state.lineOrderWideDiscount;
    }
    if (shippingToggle instanceof HTMLInputElement) {
      shippingToggle.checked = state.lineOrderWideShipping;
    }

    lines.forEach((line) => appendOrderLine(line));
    if (lines.length === 0) {
      appendOrderLine();
    }

    refreshOrderLinesKeyboardNavigation();
    updateOrderLineBulkButtons();
  }

  function getVisibleOrderLineRows() {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return [];
    return Array.from(linesRoot.querySelectorAll('.order-line-row'));
  }

  function getVisibleOrderLineIds() {
    return getVisibleOrderLineRows()
      .map((row) => String(row.dataset.lineId || '').trim())
      .filter(Boolean);
  }

  function handleOrderLinesChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.classList.contains('js-order-line-checkbox')) return;

    const lineId = String(input.dataset.lineId || '').trim();
    if (!lineId) return;

    if (input.checked) {
      if (!state.selectedLineIds.includes(lineId)) {
        state.selectedLineIds.push(lineId);
      }
    } else {
      state.selectedLineIds = state.selectedLineIds.filter((id) => id !== lineId);
    }

    updateOrderLineBulkButtons();
  }

  function toggleSelectAllOrderLinesFromButton() {
    const lineIds = getVisibleOrderLineIds();
    if (lineIds.length === 0) return;

    const allSelected = lineIds.every((id) => state.selectedLineIds.includes(id));
    if (allSelected) {
      const visibleSet = new Set(lineIds);
      state.selectedLineIds = state.selectedLineIds.filter((id) => !visibleSet.has(id));
    } else {
      const merged = new Set(state.selectedLineIds);
      lineIds.forEach((id) => merged.add(id));
      state.selectedLineIds = Array.from(merged);
    }

    refreshOrderLinesSelectionUI();
    updateOrderLineBulkButtons();
  }

  function toggleSelectAllOrderLines(checked) {
    const lineIds = getVisibleOrderLineIds();
    if (checked) {
      const merged = new Set(state.selectedLineIds);
      lineIds.forEach((id) => merged.add(id));
      state.selectedLineIds = Array.from(merged);
    } else {
      const visibleSet = new Set(lineIds);
      state.selectedLineIds = state.selectedLineIds.filter((id) => !visibleSet.has(id));
    }

    refreshOrderLinesSelectionUI();
    updateOrderLineBulkButtons();
  }

  function refreshOrderLinesSelectionUI() {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return;

    linesRoot.querySelectorAll('.js-order-line-checkbox').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const lineId = String(input.dataset.lineId || '').trim();
      input.checked = state.selectedLineIds.includes(lineId);
    });
  }

  function deleteAllOrderLines() {
    const rows = getVisibleOrderLineRows();
    if (rows.length === 0) {
      alert('삭제할 주문 항목이 없습니다.');
      return;
    }

    const ok = window.confirm('팝업의 모든 주문 항목을 삭제할까요?');
    if (!ok) return;

    snapshotOrderLinesForUndo();
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return;

    linesRoot.innerHTML = '';
    state.selectedLineIds = [];
    appendOrderLine();
    updateOrderLineBulkButtons();
    updateOrderLinesTotalRow();
  }

  function deleteSelectedOrderLines() {
    const lineIds = getVisibleOrderLineIds();
    const visibleSet = new Set(lineIds);
    const selectedVisible = state.selectedLineIds.filter((id) => visibleSet.has(id));
    if (selectedVisible.length === 0) {
      alert('선택된 주문 항목이 없습니다.');
      return;
    }

    const rows = getVisibleOrderLineRows();
    if (rows.length <= selectedVisible.length) {
      alert('최소 1개 행은 필요합니다.');
      return;
    }

    const ok = window.confirm(`선택된 ${selectedVisible.length}개 주문 항목을 삭제할까요?`);
    if (!ok) return;

    snapshotOrderLinesForUndo();
    const selectedSet = new Set(selectedVisible);

    rows.forEach((row) => {
      const lineId = String(row.dataset.lineId || '').trim();
      if (selectedSet.has(lineId)) {
        row.remove();
      }
    });

    state.selectedLineIds = state.selectedLineIds.filter((id) => !selectedSet.has(id));
    applyOrderWideLineAdjustments('discount');
    applyOrderWideLineAdjustments('shipping');
    refreshOrderLinesSelectionUI();
    updateOrderLineBulkButtons();
    refreshOrderLinesKeyboardNavigation();
    updateOrderLinesTotalRow();
  }

  function undoOrderLineChanges() {
    if (!state.undoOrderLinesSnapshot) {
      alert('되돌릴 변경 내용이 없습니다.');
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(state.undoOrderLinesSnapshot));
    state.undoOrderLinesSnapshot = null;
    rebuildOrderLinesFromSnapshot(snapshot);
    applyOrderWideLineAdjustments('discount');
    applyOrderWideLineAdjustments('shipping');
  }

  function updateOrderLineBulkButtons() {
    const lineIds = getVisibleOrderLineIds();
    const visibleSet = new Set(lineIds);
    const selectedCount = state.selectedLineIds.filter((id) => visibleSet.has(id)).length;
    const allSelected = lineIds.length > 0 && selectedCount === lineIds.length;

    ['line-select-all-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.textContent = allSelected ? '전체 선택 해제' : '전체 선택';
    });

    ['line-delete-selected-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.style.display = selectedCount > 0 ? 'inline-block' : 'none';
    });

    ['line-undo-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = !state.undoOrderLinesSnapshot;
    });

    const selectAllCheckbox = document.getElementById('select-all-order-lines');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < lineIds.length;
    }
  }

  function applyOrderWideLineAdjustments(kind) {
    const isDiscount = kind === 'discount';
    const enabled = isDiscount ? state.lineOrderWideDiscount : state.lineOrderWideShipping;
    const rowSelector = isDiscount ? '.js-new-discount' : '.js-new-shipping';
    const cellSelector = isDiscount ? '.order-line-discount-cell' : '.order-line-shipping-cell';

    const linesRoot = document.getElementById('material-order-lines');

    if (linesRoot) {
      const rows = Array.from(linesRoot.querySelectorAll('.order-line-row'));

      rows.forEach((row, rowIndex) => {
        const cell = row.querySelector(cellSelector);
        if (!(cell instanceof HTMLTableCellElement)) return;

        cell.classList.remove('orders-merged-cell', 'orders-merged-hidden');
        cell.style.display = '';
        cell.removeAttribute('rowspan');

        if (enabled && rowIndex > 0) {
          cell.classList.add('orders-merged-hidden');
          cell.style.display = 'none';
        }
      });

      if (enabled && rows.length > 0) {
        const firstCell = rows[0].querySelector(cellSelector);
        if (firstCell instanceof HTMLTableCellElement) {
          firstCell.classList.add('orders-merged-cell');
          firstCell.setAttribute('rowspan', String(rows.length));
        }
      }

      linesRoot.querySelectorAll(rowSelector).forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        if (!enabled) {
          input.disabled = false;
          return;
        }

        const parentRow = input.closest('.order-line-row');
        const isFirstRow = parentRow ? rows.indexOf(parentRow) === 0 : false;
        input.disabled = !isFirstRow;
        if (!isFirstRow) {
          input.value = '';
        }
      });

      linesRoot.querySelectorAll('.order-line-row').forEach((row) => {
        updateOrderLineTotalForRow(row);
      });
    }

    updateOrderLinesTotalRow();
  }

  function submitNewOrder(event) {
    event.preventDefault();

    const dateInput = document.getElementById('material-order-date');
    const linesRoot = document.getElementById('material-order-lines');
    const orderDate = String(dateInput?.value || '').trim();

    if (!orderDate) {
      alert('날짜를 입력해주세요.');
      return;
    }

    if (!linesRoot) return;

    const lineRows = Array.from(linesRoot.querySelectorAll('.order-line-row'));
    if (lineRows.length === 0) {
      alert('주문 항목을 1개 이상 입력해주세요.');
      return;
    }

    const items = [];
    for (let i = 0; i < lineRows.length; i += 1) {
      const row = lineRows[i];
      const category = String(row.querySelector('.js-new-category')?.value || '').trim();
      const product = String(row.querySelector('.js-new-product')?.value || '').trim();
      const quantity = Number(row.querySelector('.js-new-quantity')?.value || 0);
      const priceValue = String(row.querySelector('.js-new-price')?.value || '');
      const discountValue = String(row.querySelector('.js-new-discount')?.value || '');
      const shippingValue = String(row.querySelector('.js-new-shipping')?.value || '');

      if (!product) {
        alert('상품을 입력해주세요.');
        return;
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        alert('수량은 1 이상의 정수만 입력할 수 있습니다.');
        return;
      }

      items.push({
        id: makeId('item'),
        category,
        product,
        quantity,
        price: parseCurrencyInput(priceValue),
        discount: state.lineOrderWideDiscount ? null : parseCurrencyInput(discountValue),
        shippingFee: state.lineOrderWideShipping ? null : parseCurrencyInput(shippingValue),
        status: DEFAULT_STATUS
      });
    }

    if (items.length > 0) {
      const firstRow = lineRows[0];
      const orderWideDiscount = state.lineOrderWideDiscount ? parseCurrencyInput(String(firstRow?.querySelector('.js-new-discount')?.value || '')) : null;
      const orderWideShippingFee = state.lineOrderWideShipping ? parseCurrencyInput(String(firstRow?.querySelector('.js-new-shipping')?.value || '')) : null;

      if (state.lineOrderWideDiscount) {
        items[0].discount = orderWideDiscount;
      }
      if (state.lineOrderWideShipping) {
        items[0].shippingFee = orderWideShippingFee;
      }
    }

    snapshotOrdersForUndo();
    state.orders.push({
      id: makeId('ord'),
      orderDate,
      createdAt: new Date().toISOString(),
      orderWideDiscount: state.lineOrderWideDiscount,
      orderWideShipping: state.lineOrderWideShipping,
      items
    });

    saveOrders();
    closeAddOrderModal();
    renderOrdersTable();
  }

  function getOrdersForMonth(monthKey) {
    return state.orders
      .filter((order) => String(order.orderDate || '').slice(0, 7) === monthKey)
      .sort((a, b) => compareOrders(b, a));
  }

  function buildOrderNumberMap() {
    const sorted = state.orders.slice().sort(compareOrders);
    const map = new Map();

    sorted.forEach((order, index) => {
      map.set(order.id, index + 1);
    });

    return map;
  }

  function compareOrders(a, b) {
    const byDate = String(a.orderDate || '').localeCompare(String(b.orderDate || ''));
    if (byDate !== 0) return byDate;

    const byCreated = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (byCreated !== 0) return byCreated;

    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function buildProductOptionsHTML(selectedValue) {
    const options = getProductOptions();
    const selected = String(selectedValue || '').trim();

    const merged = options.slice();
    if (selected && !merged.includes(selected)) {
      merged.unshift(selected);
    }

    let html = '<option value="">상품 선택</option>';

    if (merged.length === 0) {
      html += '<option value="" disabled>등록된 상품 없음</option>';
      return html;
    }

    merged.forEach((option) => {
      const selectedAttr = option === selected ? ' selected' : '';
      html += `<option value="${escapeAttribute(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
    });

    return html;
  }

  function buildCategoryOptionsHTML(selectedValue) {
    const selected = String(selectedValue || '').trim();
    const fallback = CATEGORY_OPTIONS.includes(selected) ? selected : CATEGORY_OPTIONS[0];

    return CATEGORY_OPTIONS
      .map((option) => {
        const selectedAttr = option === fallback ? ' selected' : '';
        return `<option value="${escapeAttribute(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
      })
      .join('');
  }

  function buildStatusOptionsHTML(selectedValue) {
    const selected = String(selectedValue || DEFAULT_STATUS).trim();
    const normalizedSelected = STATUS_OPTIONS.includes(selected) ? selected : DEFAULT_STATUS;

    return STATUS_OPTIONS
      .map((status) => {
        const selectedAttr = status === normalizedSelected ? ' selected' : '';
        return `<option value="${escapeAttribute(status)}"${selectedAttr}>${escapeHtml(status)}</option>`;
      })
      .join('');
  }

  function getProductOptions() {
    let parsed;
    try {
      parsed = JSON.parse(localStorage.getItem(PRODUCT_OPTIONS_KEY) || '[]');
    } catch (error) {
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  function loadOrders() {
    let parsed;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      state.orders = [];
      return;
    }

    state.orders = parsed
      .map(normalizeOrder)
      .filter(Boolean);
  }

  function normalizeOrder(order) {
    if (!order || typeof order !== 'object') return null;

    const id = String(order.id || makeId('ord')).trim();
    const date = normalizeDateISO(order.orderDate) || formatDateISO(new Date());
    const createdAt = String(order.createdAt || new Date().toISOString());

    const rawItems = Array.isArray(order.items) ? order.items : [];
    const items = rawItems
      .map(normalizeItem)
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

  function inferOrderWideByPattern(items, kind) {
    if (!Array.isArray(items) || items.length <= 1) return false;

    const key = kind === 'discount' ? 'discount' : 'shippingFee';
    const firstValue = Number(items[0]?.[key]);
    const firstHasValue = Number.isFinite(firstValue) && firstValue > 0;
    if (!firstHasValue) return false;

    return items.slice(1).every((item) => {
      const value = Number(item?.[key]);
      return !Number.isFinite(value) || value <= 0;
    });
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const id = String(item.id || makeId('item')).trim();
    const category = String(item.category || '').trim();
    const product = String(item.product || '').trim();
    const quantity = Math.floor(Number(item.quantity));

    if (!product) return null;
    if (!Number.isInteger(quantity) || quantity <= 0) return null;

    const parsedPrice = Number(item.price);
    const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.floor(parsedPrice) : null;
    const parsedDiscount = Number(item.discount);
    const discount = Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? Math.floor(parsedDiscount) : null;
    const parsedShippingFee = Number(item.shippingFee);
    const shippingFee = Number.isFinite(parsedShippingFee) && parsedShippingFee > 0 ? Math.floor(parsedShippingFee) : null;

    return {
      id,
      category,
      product,
      quantity,
      price,
      discount,
      shippingFee,
      status: String(item.status || DEFAULT_STATUS).trim() || DEFAULT_STATUS
    };
  }

  function saveOrders() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
  }

  function parseCurrencyInput(rawValue) {
    const digits = String(rawValue || '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    const number = Number(digits);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Math.floor(number);
  }

  function formatWonInput(value, withSuffix, withNegativePrefix = false) {
    const numeric = typeof value === 'number' ? value : parseCurrencyInput(value);
    if (!numeric) return '';
    const formatted = numeric.toLocaleString('ko-KR');
    const prefixed = withNegativePrefix ? `-${formatted}` : formatted;
    return withSuffix ? `${prefixed}원` : prefixed;
  }

  function formatDiscountText(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '-';
    return `-${number.toLocaleString('ko-KR')}원`;
  }

  function formatCurrencyInputForField(input, withSuffix) {
    if (!(input instanceof HTMLInputElement)) return '';
    const isDiscountField = input.classList.contains('js-discount-input') || input.classList.contains('js-edit-discount');
    return formatWonInput(input.value, withSuffix, isDiscountField);
  }

  function formatPriceText(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '-';
    return `${number.toLocaleString('ko-KR')}원`;
  }

  function getLineTotal(price, discount, shippingFee) {
    const numericPrice = Number(price);
    const numericDiscount = Number(discount);
    const numericShippingFee = Number(shippingFee);
    const safePrice = Number.isFinite(numericPrice) && numericPrice > 0 ? Math.floor(numericPrice) : 0;
    const safeDiscount = Number.isFinite(numericDiscount) && numericDiscount > 0 ? Math.floor(numericDiscount) : 0;
    const safeShippingFee = Number.isFinite(numericShippingFee) && numericShippingFee > 0 ? Math.floor(numericShippingFee) : 0;
    const total = safePrice - safeDiscount + safeShippingFee;
    return total > 0 ? total : null;
  }

  function updateOrderLineTotalForRow(row) {
    if (!row) return;
    const totalCell = row.querySelector('.js-line-total');
    if (!totalCell) return;

    const lineTotal = getPopupLineSubtotal(row);
    totalCell.textContent = formatPriceText(lineTotal);
    updateOrderLinesTotalRow();
  }

  function updateOrderLinesTotalRow() {
    const linesRoot = document.getElementById('material-order-lines');
    if (!linesRoot) return;

    const rows = Array.from(linesRoot.querySelectorAll('.order-line-row'));
    let grandTotal = 0;
    rows.forEach((row) => {
      const lineTotal = getPopupLineSubtotal(row);
      const lineTotalCell = row.querySelector('.js-line-total');
      if (lineTotalCell) {
        lineTotalCell.textContent = formatPriceText(lineTotal);
      }
      if (typeof lineTotal === 'number' && lineTotal > 0) {
        grandTotal += lineTotal;
      }
    });

    const firstRow = rows[0] || null;
    const orderWideDiscount = state.lineOrderWideDiscount ? parseCurrencyInput(String(firstRow?.querySelector('.js-new-discount')?.value || '')) : null;
    const orderWideShippingFee = state.lineOrderWideShipping ? parseCurrencyInput(String(firstRow?.querySelector('.js-new-shipping')?.value || '')) : null;

    if (state.lineOrderWideDiscount && typeof orderWideDiscount === 'number' && orderWideDiscount > 0) {
      grandTotal -= orderWideDiscount;
    }
    if (state.lineOrderWideShipping && typeof orderWideShippingFee === 'number' && orderWideShippingFee > 0) {
      grandTotal += orderWideShippingFee;
    }

    syncPopupMergedTotalCells(linesRoot, rows, grandTotal);

    let totalRow = linesRoot.querySelector('.orders-lines-total-row');
    if (!totalRow) {
      totalRow = document.createElement('tr');
      totalRow.className = 'orders-total-row orders-lines-total-row';
      linesRoot.appendChild(totalRow);
    }

    totalRow.innerHTML = `
      <td colspan="5" class="orders-total-label">총 합계</td>
      <td class="orders-price">-</td>
      <td class="orders-price">-</td>
      <td class="orders-price">-</td>
      <td class="orders-price">${formatPriceText(grandTotal)}</td>
    `;

    applyManualCellMerges('popup');
    updateMergeButtons();
  }

  function syncPopupMergedTotalCells(linesRoot, rows, grandTotal) {
    const shouldMergeTotal = state.lineOrderWideDiscount || state.lineOrderWideShipping;

    rows.forEach((row, rowIndex) => {
      const totalCell = row.querySelector('.order-line-total-cell');
      if (!(totalCell instanceof HTMLTableCellElement)) return;

      totalCell.classList.remove('orders-merged-cell', 'orders-merged-hidden');
      totalCell.style.display = '';
      totalCell.removeAttribute('rowspan');

      if (shouldMergeTotal && rowIndex > 0) {
        totalCell.classList.add('orders-merged-hidden');
        totalCell.style.display = 'none';
      }
    });

    if (!shouldMergeTotal || rows.length === 0) {
      return;
    }

    const firstTotalCell = rows[0].querySelector('.order-line-total-cell');
    if (!(firstTotalCell instanceof HTMLTableCellElement)) return;
    firstTotalCell.classList.add('orders-merged-cell');
    firstTotalCell.setAttribute('rowspan', String(rows.length));
    firstTotalCell.textContent = formatPriceText(grandTotal);
  }

  function getPopupLineSubtotal(row) {
    const price = parseCurrencyInput(String(row?.querySelector('.js-new-price')?.value || ''));
    const discount = state.lineOrderWideDiscount ? null : parseCurrencyInput(String(row?.querySelector('.js-new-discount')?.value || ''));
    const shippingFee = state.lineOrderWideShipping ? null : parseCurrencyInput(String(row?.querySelector('.js-new-shipping')?.value || ''));
    return getLineTotal(price, discount, shippingFee);
  }

  function getOrderTotal(order) {
    if (!order || !Array.isArray(order.items)) return null;

    const items = order.items;
    const orderWideDiscount = Boolean(order.orderWideDiscount);
    const orderWideShipping = Boolean(order.orderWideShipping);

    let totalPrice = 0;
    let totalDiscount = 0;
    let totalShipping = 0;

    items.forEach((item, index) => {
      const price = Number(item?.price);
      const discount = Number(item?.discount);
      const shipping = Number(item?.shippingFee);

      if (Number.isFinite(price) && price > 0) {
        totalPrice += Math.floor(price);
      }

      if (Number.isFinite(discount) && discount > 0) {
        const shouldCount = orderWideDiscount ? index === 0 : true;
        if (shouldCount) {
          totalDiscount += Math.floor(discount);
        }
      }

      if (Number.isFinite(shipping) && shipping > 0) {
        const shouldCount = orderWideShipping ? index === 0 : true;
        if (shouldCount) {
          totalShipping += Math.floor(shipping);
        }
      }
    });

    const total = totalPrice - totalDiscount + totalShipping;
    return total > 0 ? total : null;
  }

  function updateInlineEditTotalForRow(row) {
    if (!row) return;
    const totalCell = row.querySelector('.js-edit-total');
    if (!totalCell) {
      updateInlineEditOrderTotal(row);
      return;
    }

    const price = parseCurrencyInput(String(row.querySelector('.js-edit-price')?.value || ''));
    const discount = parseCurrencyInput(String(row.querySelector('.js-edit-discount')?.value || ''));
    const shippingFee = parseCurrencyInput(String(row.querySelector('.js-edit-shipping')?.value || ''));
    totalCell.textContent = formatPriceText(getLineTotal(price, discount, shippingFee));
    updateInlineEditOrderTotal(row);
  }

  function updateInlineEditOrderTotal(row) {
    const orderId = String(row?.dataset.orderId || '').trim();
    if (!orderId) return;

    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;

    const mergedTotal = Boolean(order.orderWideDiscount) || Boolean(order.orderWideShipping);
    if (!mergedTotal) return;

    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll(`tr[data-order-id="${escapeAttribute(orderId)}"]`));
    if (!rows.length) return;

    let totalPrice = 0;
    let totalDiscount = 0;
    let totalShipping = 0;

    rows.forEach((entryRow, index) => {
      const price = parseCurrencyInput(String(entryRow.querySelector('.js-edit-price')?.value || ''));
      const discount = parseCurrencyInput(String(entryRow.querySelector('.js-edit-discount')?.value || ''));
      const shipping = parseCurrencyInput(String(entryRow.querySelector('.js-edit-shipping')?.value || ''));

      if (typeof price === 'number' && price > 0) totalPrice += price;
      if (!order.orderWideDiscount || index === 0) {
        if (typeof discount === 'number' && discount > 0) totalDiscount += discount;
      }
      if (!order.orderWideShipping || index === 0) {
        if (typeof shipping === 'number' && shipping > 0) totalShipping += shipping;
      }
    });

    const mergedTotalValue = totalPrice - totalDiscount + totalShipping;
    const totalCell = rows[0].querySelector('.js-edit-order-total');
    if (totalCell) {
      totalCell.textContent = formatPriceText(mergedTotalValue > 0 ? mergedTotalValue : null);
    }
  }

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function getMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function normalizeDateISO(rawDate) {
    const value = String(rawDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return value;
  }

  function formatDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function autoResizeTextareasIn(root) {
    if (!root) return;
    const textareas = root.querySelectorAll('.orders-textarea');
    textareas.forEach((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      autoResizeTextarea(textarea);
    });
  }

  function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function refreshGridKeyboardNavigation() {
    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('td').forEach((cell) => {
      cell.classList.add('orders-keyboard-grid-cell');
      if (!(cell instanceof HTMLTableCellElement)) return;
      cell.tabIndex = -1;
    });

    applyPendingGridFocus();
  }

  function refreshOrderLinesKeyboardNavigation() {
    const tbody = document.getElementById('material-order-lines');
    if (!tbody) return;

    tbody.querySelectorAll('td').forEach((cell) => {
      cell.classList.add('orders-lines-keyboard-grid-cell');
      if (!(cell instanceof HTMLTableCellElement)) return;
      cell.tabIndex = -1;
    });
  }

  function applyPendingGridFocus() {
    const pending = state.pendingGridFocus;
    if (!pending) return;

    const cell = findGridCellByAnchor(pending);
    if (!cell) return;

    state.pendingGridFocus = null;
    focusGridCell(cell, true);
  }

  function setPendingGridFocus(rowId, colIndex) {
    state.pendingGridFocus = {
      rowId: String(rowId || ''),
      colIndex: Number(colIndex) || 0
    };
  }

  function getGridCellFromElement(targetElement) {
    const element = normalizeEventTarget(targetElement);
    if (!element || typeof element.closest !== 'function') return null;
    const cell = element.closest('td');
    if (!(cell instanceof HTMLTableCellElement)) return null;
    const tbody = cell.closest('tbody');
    if (!tbody || tbody.id !== 'material-orders-tbody') return null;
    return cell;
  }

  function updateGridNavAnchorFromCell(cell) {
    if (!cell) return;
    const row = cell.closest('tr');
    if (!row) return;
    const cells = Array.from(row.querySelectorAll('td'));
    const colIndex = cells.indexOf(cell);
    if (colIndex < 0) return;

    state.gridNavAnchor = {
      rowId: String(row.dataset.itemId || ''),
      colIndex
    };
  }

  function findGridCellByAnchor(anchor) {
    if (!anchor) return null;
    const tbody = document.getElementById('material-orders-tbody');
    if (!tbody) return null;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const row = rows.find((entry) => String(entry.dataset.itemId || '') === String(anchor.rowId || ''));
    if (!row) return null;

    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length === 0) return null;

    const boundedCol = Math.max(0, Math.min(Number(anchor.colIndex) || 0, cells.length - 1));
    return cells[boundedCol] || null;
  }

  function getCurrentGridCell(targetElement) {
    const directCell = getGridCellFromElement(targetElement);
    if (directCell) return directCell;
    return findGridCellByAnchor(state.gridNavAnchor);
  }

  function getGridRowsFromCell(cell) {
    const tbody = cell?.closest('tbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelectorAll('td').length > 0 && !row.querySelector('.orders-empty-row') && !row.classList.contains('orders-total-row'));
  }

  function getAdjacentGridCell(cell, key) {
    const row = cell?.closest('tr');
    if (!row) return null;

    const rows = getGridRowsFromCell(cell);
    const rowIndex = rows.indexOf(row);
    if (rowIndex === -1) return null;

    const cells = Array.from(row.querySelectorAll('td'));
    const colIndex = cells.indexOf(cell);
    if (colIndex === -1) return null;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const nextCol = key === 'ArrowLeft' ? colIndex - 1 : colIndex + 1;
      if (nextCol < 0 || nextCol >= cells.length) return null;
      return cells[nextCol] || null;
    }

    const nextRowIndex = key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
    if (nextRowIndex < 0 || nextRowIndex >= rows.length) return null;

    const nextRowCells = Array.from(rows[nextRowIndex].querySelectorAll('td'));
    if (nextRowCells.length === 0) return null;
    return nextRowCells[Math.min(colIndex, nextRowCells.length - 1)] || null;
  }

  function focusGridCell(cell, focusEntryControl) {
    if (!cell) return;

    const tbody = cell.closest('tbody');
    if (tbody) {
      tbody.querySelectorAll('td.orders-keyboard-grid-cell').forEach((entry) => {
        if (entry instanceof HTMLTableCellElement) {
          entry.tabIndex = -1;
        }
      });
    }

    cell.tabIndex = 0;
    updateGridNavAnchorFromCell(cell);

    if (focusEntryControl) {
      const control = cell.querySelector('input, select, textarea, button');
      if (control && typeof control.focus === 'function') {
        control.focus();
        return;
      }
    }

    cell.focus();
  }

  function selectEditableTextInCell(cell) {
    if (!cell) return;
    const control = cell.querySelector('input:not([type="checkbox"]), textarea');
    if (!control) return;

    try {
      control.focus();
      if (control instanceof HTMLTextAreaElement) {
        control.select();
        return;
      }
      if (control instanceof HTMLInputElement) {
        control.select();
      }
    } catch (error) {
      // Some input types (for example date) may not support select().
    }
  }

  function startCellEditFromEnter(cell) {
    const row = cell.closest('tr');
    if (!row) return;

    const rowItemId = String(row.dataset.itemId || '');
    const rowOrderId = String(row.dataset.orderId || '');
    if (!rowItemId || !rowOrderId) return;

    const cells = Array.from(row.querySelectorAll('td'));
    const colIndex = cells.indexOf(cell);

    const hasEditableControl = Boolean(cell.querySelector('input:not([type="checkbox"]), select, textarea'));
    if (hasEditableControl) {
      const saveButton = row.querySelector('button[data-action="save"]');
      if (saveButton instanceof HTMLButtonElement) {
        saveButton.click();
      }
      return;
    }

    setPendingGridFocus(rowItemId, colIndex);
    if (!beginOrderEditing(rowOrderId)) {
      return;
    }
    renderOrdersTable();
  }

  function isEditableTarget(target) {
    if (!target || typeof target.matches !== 'function') return false;
    return target.matches('input:not([type="checkbox"]), textarea, select');
  }

  function getOrderLinesGridCellFromElement(targetElement) {
    const element = normalizeEventTarget(targetElement);
    if (!element || typeof element.closest !== 'function') return null;
    const cell = element.closest('td');
    if (!(cell instanceof HTMLTableCellElement)) return null;
    const tbody = cell.closest('tbody');
    if (!tbody || tbody.id !== 'material-order-lines') return null;
    return cell;
  }

  function updateOrderLinesGridNavAnchorFromCell(cell) {
    if (!cell) return;
    const row = cell.closest('tr');
    if (!row) return;

    const cells = Array.from(row.querySelectorAll('td'));
    const colIndex = cells.indexOf(cell);
    if (colIndex < 0) return;

    state.lineGridNavAnchor = {
      rowId: String(row.dataset.lineId || ''),
      colIndex
    };
  }

  function findOrderLinesGridCellByAnchor(anchor) {
    if (!anchor) return null;
    const tbody = document.getElementById('material-order-lines');
    if (!tbody) return null;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const row = rows.find((entry) => String(entry.dataset.lineId || '') === String(anchor.rowId || ''));
    if (!row) return null;

    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length === 0) return null;
    const boundedCol = Math.max(0, Math.min(Number(anchor.colIndex) || 0, cells.length - 1));
    return cells[boundedCol] || null;
  }

  function getCurrentOrderLinesGridCell(targetElement) {
    const directCell = getOrderLinesGridCellFromElement(targetElement);
    if (directCell) return directCell;
    return findOrderLinesGridCellByAnchor(state.lineGridNavAnchor);
  }

  function getOrderLinesGridRowsFromCell(cell) {
    const tbody = cell?.closest('tbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelectorAll('td').length > 0 && !row.classList.contains('orders-total-row'));
  }

  function getAdjacentOrderLinesGridCell(cell, key) {
    const row = cell?.closest('tr');
    if (!row) return null;

    const rows = getOrderLinesGridRowsFromCell(cell);
    const rowIndex = rows.indexOf(row);
    if (rowIndex === -1) return null;

    const cells = Array.from(row.querySelectorAll('td'));
    const colIndex = cells.indexOf(cell);
    if (colIndex === -1) return null;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const nextCol = key === 'ArrowLeft' ? colIndex - 1 : colIndex + 1;
      if (nextCol < 0 || nextCol >= cells.length) return null;
      return cells[nextCol] || null;
    }

    const nextRowIndex = key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
    if (nextRowIndex < 0 || nextRowIndex >= rows.length) return null;

    const nextRowCells = Array.from(rows[nextRowIndex].querySelectorAll('td'));
    if (nextRowCells.length === 0) return null;
    return nextRowCells[Math.min(colIndex, nextRowCells.length - 1)] || null;
  }

  function focusOrderLinesGridCell(cell, focusEntryControl) {
    if (!cell) return;

    const tbody = cell.closest('tbody');
    if (tbody) {
      tbody.querySelectorAll('td.orders-lines-keyboard-grid-cell').forEach((entry) => {
        if (entry instanceof HTMLTableCellElement) {
          entry.tabIndex = -1;
        }
      });
    }

    cell.tabIndex = 0;
    updateOrderLinesGridNavAnchorFromCell(cell);

    if (focusEntryControl) {
      const control = cell.querySelector('input, select, textarea, button');
      if (control && typeof control.focus === 'function') {
        control.focus();
        return;
      }
    }

    cell.focus();
  }

  function handleOrderLinesGridKeyboardNavigation(event) {
    const key = event.key;
    const isArrowKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
    const isEnterKey = key === 'Enter';
    if (!isArrowKey && !isEnterKey) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;

    const cell = getCurrentOrderLinesGridCell(event.target);
    if (!cell) return false;

    const target = event.target;
    const isTextareaTarget = target && typeof target.matches === 'function' && target.matches('textarea');
    const isEditableControlTarget = isEditableTarget(target);

    if (isEnterKey) {
      if (target && typeof target.matches === 'function' && target.matches('button, input[type="checkbox"]')) {
        return false;
      }
      if (isTextareaTarget) {
        return false;
      }

      event.preventDefault();
      if (isEditableControlTarget) {
        const nextCell = getAdjacentOrderLinesGridCell(cell, 'ArrowDown');
        if (nextCell) {
          focusOrderLinesGridCell(nextCell, true);
        }
      } else {
        focusOrderLinesGridCell(cell, true);
      }
      return true;
    }

    event.preventDefault();
    const nextCell = getAdjacentOrderLinesGridCell(cell, key);
    if (!nextCell) return true;
    const nextCellHasEditor = Boolean(nextCell.querySelector('input:not([type="checkbox"]), select, textarea'));
    focusOrderLinesGridCell(nextCell, nextCellHasEditor);
    if (nextCellHasEditor) {
      selectEditableTextInCell(nextCell);
    }
    return true;
  }

  function handleOrdersGridKeyboardNavigation(event) {
    if (handleUndoKeyboardShortcut(event)) {
      return;
    }

    const modal = document.getElementById('material-order-modal');
    if (modal?.classList.contains('is-open')) {
      handleOrderLinesGridKeyboardNavigation(event);
      return;
    }

    const key = event.key;
    const isArrowKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
    const isEnterKey = key === 'Enter';
    if (!isArrowKey && !isEnterKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const cell = getCurrentGridCell(event.target);
    if (!cell) return;

    const target = event.target;
    const isTextareaTarget = target && typeof target.matches === 'function' && target.matches('textarea');
    const isEditableControlTarget = isEditableTarget(target);

    if (isEnterKey) {
      if (target && typeof target.matches === 'function' && target.matches('button, input[type="checkbox"]')) {
        return;
      }
      if (isTextareaTarget) {
        return;
      }
      event.preventDefault();
      startCellEditFromEnter(cell);
      return;
    }

    event.preventDefault();
    const nextCell = getAdjacentGridCell(cell, key);
    if (!nextCell) return;

    const nextRow = nextCell.closest('tr');
    const isInlineEditRow = Boolean(nextRow?.classList.contains('orders-inline-edit'));
    const nextCellHasEditor = Boolean(nextCell.querySelector('input:not([type="checkbox"]), select, textarea'));

    if (isInlineEditRow && (isEditableControlTarget || nextCellHasEditor)) {
      focusGridCell(nextCell, true);
      selectEditableTextInCell(nextCell);
      return;
    }

    focusGridCell(nextCell, false);
  }

  function handleUndoKeyboardShortcut(event) {
    const key = String(event.key || '').toLowerCase();
    const isUndoKey = key === 'z';
    const hasCmdOrCtrl = Boolean(event.metaKey || event.ctrlKey);
    if (!isUndoKey || !hasCmdOrCtrl || event.altKey || event.shiftKey) {
      return false;
    }

    const modal = document.getElementById('material-order-modal');
    const modalOpen = Boolean(modal?.classList.contains('is-open'));

    if (modalOpen) {
      if (!state.undoOrderLinesSnapshot) {
        return false;
      }
      event.preventDefault();
      undoOrderLineChanges();
      return true;
    }

    if (!state.undoOrdersSnapshot) {
      return false;
    }

    event.preventDefault();
    undoOrderChanges();
    return true;
  }

  function handleGridCellClick(event) {
    const cell = getGridCellFromElement(event.target);
    if (!cell) return;

    if (event.shiftKey && handleMergeCellSelectionClick(event, cell, 'main')) {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    if (handleMergeCellSelectionClick(event, cell, 'main')) {
      return;
    }

    updateGridNavAnchorFromCell(cell);
    if (event.target && typeof event.target.closest === 'function' && event.target.closest('input, textarea, select, button, a, label')) {
      return;
    }

    focusGridCell(cell, false);
  }

  function handleGridCellFocusIn(event) {
    const cell = getGridCellFromElement(event.target);
    if (!cell) return;
    updateGridNavAnchorFromCell(cell);
  }

  function handleOrderLinesGridCellClick(event) {
    const cell = getOrderLinesGridCellFromElement(event.target);
    if (!cell) return;

    if (event.shiftKey && handleMergeCellSelectionClick(event, cell, 'popup')) {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    if (handleMergeCellSelectionClick(event, cell, 'popup')) {
      return;
    }

    updateOrderLinesGridNavAnchorFromCell(cell);
    if (event.target && typeof event.target.closest === 'function' && event.target.closest('input, textarea, select, button, a, label')) {
      return;
    }

    focusOrderLinesGridCell(cell, false);
  }

  function handleOrderLinesGridCellFocusIn(event) {
    const cell = getOrderLinesGridCellFromElement(event.target);
    if (!cell) return;
    updateOrderLinesGridNavAnchorFromCell(cell);
  }

  function handleMergeCellSelectionClick(event, cell, table) {
    if (!(cell instanceof HTMLTableCellElement)) return false;
    const colKey = String(cell.dataset.mergeCol || '').trim();
    if (!colKey) return false;

    const ref = getMergeCellRef(cell, table);
    if (!ref) return false;

    if (!event.shiftKey) {
      state.mergeAnchor = ref;
      clearMergeSelection(false);
      updateMergeButtons();
      return false;
    }

    if (!state.mergeAnchor) {
      state.mergeAnchor = ref;
      state.mergeSelection = {
        table,
        colKey: ref.colKey,
        rowIds: [ref.rowId]
      };
      markMergeSelectionCells(state.mergeSelection);
      updateMergeButtons();
      event.preventDefault();
      return true;
    }

    if (state.mergeAnchor.table !== table || state.mergeAnchor.colKey !== ref.colKey) {
      state.mergeAnchor = ref;
      state.mergeSelection = {
        table,
        colKey: ref.colKey,
        rowIds: [ref.rowId]
      };
      markMergeSelectionCells(state.mergeSelection);
      updateMergeButtons();
      event.preventDefault();
      return true;
    }

    const selection = buildVerticalMergeSelection(state.mergeAnchor, ref);
    if (!selection) {
      clearMergeSelection(false);
      updateMergeButtons();
      return false;
    }

    state.mergeSelection = selection;
    markMergeSelectionCells(selection);
    updateMergeButtons();
    event.preventDefault();
    return true;
  }

  function getMergeRows(table) {
    const tbodyId = table === 'main' ? 'material-orders-tbody' : 'material-order-lines';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];

    return Array.from(tbody.querySelectorAll('tr')).filter((row) => {
      if (row.classList.contains('orders-total-row')) return false;
      if (row.querySelector('.orders-empty-row')) return false;
      const rowId = getMergeRowId(row, table);
      return Boolean(rowId);
    });
  }

  function getMergeRowId(row, table) {
    if (!row) return '';
    return table === 'main'
      ? String(row.dataset.itemId || '').trim()
      : String(row.dataset.lineId || '').trim();
  }

  function getMergeCellRef(cell, table) {
    const row = cell.closest('tr');
    if (!row) return null;
    const rowId = getMergeRowId(row, table);
    if (!rowId) return null;
    const colKey = String(cell.dataset.mergeCol || '').trim();
    if (!colKey) return null;
    return { table, rowId, colKey };
  }

  function buildVerticalMergeSelection(anchor, target) {
    const rows = getMergeRows(anchor.table)
      .filter((row) => getMergeCellByKey(row, anchor.colKey) instanceof HTMLTableCellElement);
    const startIndex = rows.findIndex((row) => getMergeRowId(row, anchor.table) === anchor.rowId);
    const endIndex = rows.findIndex((row) => getMergeRowId(row, anchor.table) === target.rowId);
    if (startIndex < 0 || endIndex < 0) return null;

    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

    const selected = [];
    for (let i = from; i <= to; i += 1) {
      const row = rows[i];
      const cell = getMergeCellByKey(row, anchor.colKey);
      if (!(cell instanceof HTMLTableCellElement)) {
        return null;
      }
      selected.push({ rowId: getMergeRowId(row, anchor.table), cell });
    }

    return {
      table: anchor.table,
      colKey: anchor.colKey,
      rowIds: selected.map((entry) => entry.rowId)
    };
  }

  function getMergeCellByKey(row, colKey) {
    if (!row || !colKey) return null;
    return row.querySelector(`td[data-merge-col="${escapeAttribute(colKey)}"]`);
  }

  function clearMergeSelection(clearAnchor) {
    document.querySelectorAll('.orders-cell-merge-selected').forEach((cell) => {
      cell.classList.remove('orders-cell-merge-selected');
    });
    state.mergeSelection = null;
    if (clearAnchor) {
      state.mergeAnchor = null;
    }
  }

  function markMergeSelectionCells(selection) {
    clearMergeSelection(false);
    if (!selection) return;

    const rows = getMergeRows(selection.table);
    const rowIdSet = new Set(selection.rowIds);
    rows.forEach((row) => {
      const rowId = getMergeRowId(row, selection.table);
      if (!rowIdSet.has(rowId)) return;
      const cell = getMergeCellByKey(row, selection.colKey);
      if (!(cell instanceof HTMLTableCellElement)) return;
      cell.classList.add('orders-cell-merge-selected');
    });
  }

  function applyManualCellMerge(table) {
    const stateSelection = state.mergeSelection;
    const fallbackSelection = getMergeSelectionFromDOM(table);
    const selection = (stateSelection && stateSelection.table === table && Array.isArray(stateSelection.rowIds) && stateSelection.rowIds.length >= 2)
      ? stateSelection
      : fallbackSelection;

    if (!selection || !Array.isArray(selection.rowIds) || selection.rowIds.length < 2) {
      alert('Shift+클릭으로 같은 열의 연속 셀 2개 이상을 먼저 선택해주세요.');
      return;
    }

    if (table === 'main' && state.editing) {
      const orderIds = new Set(selection.rowIds
        .map((rowId) => {
          const row = getMergeRowById('main', rowId);
          return String(row?.dataset.orderId || '').trim();
        })
        .filter(Boolean));
      orderIds.forEach((orderId) => captureInlineEditDraft(orderId));
    }

    if (shouldWarnOnManualMergeValueLoss(table, selection)) {
      const ok = window.confirm('병합하면 맨 위 셀의 값만 유지되고 아래 값은 삭제됩니다. 계속할까요?');
      if (!ok) {
        return;
      }
    }

    if (table === 'main') {
      snapshotOrdersForUndo();
    } else {
      snapshotOrderLinesForUndo();
    }

    const preservedChanged = preserveTopValueForManualMerge(table, selection);

    const rowIdSet = new Set(selection.rowIds);
    state.manualCellMerges[table] = (state.manualCellMerges[table] || []).filter((entry) => {
      if (entry.colKey !== selection.colKey) return true;
      return !entry.rowIds.some((rowId) => rowIdSet.has(rowId));
    });

    state.manualCellMerges[table].push({
      colKey: selection.colKey,
      rowIds: selection.rowIds.slice()
    });

    clearMergeSelection(true);
    updateMergeButtons();

    if (table === 'main') {
      if (preservedChanged) {
        saveOrders();
      }
      renderOrdersTable();
      return;
    }

    updateOrderLinesTotalRow();
  }

  function shouldWarnOnManualMergeValueLoss(table, selection) {
    if (!selection || !Array.isArray(selection.rowIds) || selection.rowIds.length < 2) return false;
    if (!isManualMergeTopPreserveColumn(selection.colKey)) return false;

    if (table === 'popup') {
      const selector = getPopupNumericSelectorByMergeCol(selection.colKey);
      if (!selector) return false;
      for (let i = 1; i < selection.rowIds.length; i += 1) {
        const lineId = selection.rowIds[i];
        const row = getMergeRowById('popup', lineId);
        const input = row?.querySelector(selector);
        if (input instanceof HTMLInputElement && parseCurrencyInput(input.value) !== null) {
          return true;
        }
      }
      return false;
    }

    const key = getMainNumericKeyByMergeCol(selection.colKey);
    if (!key) return false;
    for (let i = 1; i < selection.rowIds.length; i += 1) {
      const itemId = selection.rowIds[i];
      const item = findOrderItemById(itemId);
      if (!item) continue;
      const value = Number(item[key]);
      if (Number.isFinite(value) && value > 0) {
        return true;
      }
    }
    return false;
  }

  function preserveTopValueForManualMerge(table, selection) {
    if (!selection || !Array.isArray(selection.rowIds) || selection.rowIds.length < 2) return false;
    if (!isManualMergeTopPreserveColumn(selection.colKey)) return false;

    if (table === 'popup') {
      const selector = getPopupNumericSelectorByMergeCol(selection.colKey);
      if (!selector) return false;
      let changed = false;
      for (let i = 1; i < selection.rowIds.length; i += 1) {
        const lineId = selection.rowIds[i];
        const row = getMergeRowById('popup', lineId);
        const input = row?.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) continue;
        if (parseCurrencyInput(input.value) !== null) {
          input.value = '';
          changed = true;
        }
      }
      return changed;
    }

    const key = getMainNumericKeyByMergeCol(selection.colKey);
    if (!key) return false;
    let changed = false;
    for (let i = 1; i < selection.rowIds.length; i += 1) {
      const itemId = selection.rowIds[i];
      const item = findOrderItemById(itemId);
      if (!item) continue;
      const value = Number(item[key]);
      if (Number.isFinite(value) && value > 0) {
        item[key] = null;
        changed = true;
      }
    }
    return changed;
  }

  function isManualMergeTopPreserveColumn(colKey) {
    return colKey === 'price' || colKey === 'discount' || colKey === 'shipping';
  }

  function getPopupNumericSelectorByMergeCol(colKey) {
    if (colKey === 'price') return '.js-new-price';
    if (colKey === 'discount') return '.js-new-discount';
    if (colKey === 'shipping') return '.js-new-shipping';
    return '';
  }

  function getMainNumericKeyByMergeCol(colKey) {
    if (colKey === 'price') return 'price';
    if (colKey === 'discount') return 'discount';
    if (colKey === 'shipping') return 'shippingFee';
    return '';
  }

  function findOrderItemById(itemId) {
    if (!itemId) return null;
    for (let i = 0; i < state.orders.length; i += 1) {
      const order = state.orders[i];
      const found = order.items.find((entry) => entry.id === itemId);
      if (found) return found;
    }
    return null;
  }

  function getMergeRowById(table, rowId) {
    const rows = getMergeRows(table);
    return rows.find((row) => getMergeRowId(row, table) === String(rowId || '').trim()) || null;
  }

  function getMergeSelectionFromDOM(table) {
    const rows = getMergeRows(table);
    if (rows.length === 0) return null;

    const selectedEntries = rows
      .map((row) => {
        const selectedCell = row.querySelector('td.orders-cell-merge-selected[data-merge-col]');
        if (!(selectedCell instanceof HTMLTableCellElement)) return null;
        return {
          row,
          rowId: getMergeRowId(row, table),
          colKey: String(selectedCell.dataset.mergeCol || '').trim()
        };
      })
      .filter(Boolean);

    if (selectedEntries.length < 2) return null;

    const colKeys = new Set(selectedEntries.map((entry) => entry.colKey));
    if (colKeys.size !== 1) return null;
    const colKey = selectedEntries[0].colKey;

    const eligibleRows = rows.filter((row) => getMergeCellByKey(row, colKey) instanceof HTMLTableCellElement);
    if (eligibleRows.length < 2) return null;

    const selectedRowIdSet = new Set(selectedEntries.map((entry) => entry.rowId));
    const selectedIndexes = eligibleRows
      .map((row, index) => (selectedRowIdSet.has(getMergeRowId(row, table)) ? index : -1))
      .filter((index) => index >= 0);

    if (selectedIndexes.length < 2) return null;

    const from = Math.min(...selectedIndexes);
    const to = Math.max(...selectedIndexes);
    for (let i = from; i <= to; i += 1) {
      const rowId = getMergeRowId(eligibleRows[i], table);
      if (!selectedRowIdSet.has(rowId)) {
        return null;
      }
    }

    return {
      table,
      colKey,
      rowIds: eligibleRows.slice(from, to + 1).map((row) => getMergeRowId(row, table))
    };
  }

  function applyManualCellMerges(table) {
    const rows = getMergeRows(table);
    if (rows.length === 0) return;

    rows.forEach((row) => {
      row.querySelectorAll('td.js-manual-merge-hidden').forEach((cell) => {
        cell.classList.remove('js-manual-merge-hidden');
        cell.style.display = '';
      });
      row.querySelectorAll('td.js-manual-merge-anchor').forEach((cell) => {
        cell.classList.remove('js-manual-merge-anchor');
        cell.removeAttribute('rowspan');
      });
    });

    const rowMap = new Map();
    rows.forEach((row) => {
      rowMap.set(getMergeRowId(row, table), row);
    });

    const nextMerges = [];
    (state.manualCellMerges[table] || []).forEach((mergeEntry) => {
      if (!mergeEntry || !Array.isArray(mergeEntry.rowIds) || mergeEntry.rowIds.length < 2) return;

      const mergeRows = mergeEntry.rowIds.map((rowId) => rowMap.get(rowId)).filter(Boolean);
      if (mergeRows.length !== mergeEntry.rowIds.length) return;

      const cells = mergeRows.map((row) => getMergeCellByKey(row, mergeEntry.colKey));
      if (cells.some((cell) => !(cell instanceof HTMLTableCellElement))) return;

      const [firstCell, ...restCells] = cells;
      firstCell.classList.add('js-manual-merge-anchor');
      firstCell.setAttribute('rowspan', String(cells.length));

      restCells.forEach((cell) => {
        cell.classList.add('js-manual-merge-hidden');
        cell.style.display = 'none';
      });

      nextMerges.push({
        colKey: mergeEntry.colKey,
        rowIds: mergeEntry.rowIds.slice()
      });
    });

    state.manualCellMerges[table] = nextMerges;
  }

  function updateMergeButtons() {
    const canMergeMain = Boolean(state.mergeSelection && state.mergeSelection.table === 'main' && state.mergeSelection.rowIds.length >= 2);
    const canMergePopup = Boolean(state.mergeSelection && state.mergeSelection.table === 'popup' && state.mergeSelection.rowIds.length >= 2);

    ['order-merge-cells-btn', 'order-merge-cells-btn-bottom'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = false;
      btn.dataset.ready = canMergeMain ? 'true' : 'false';
    });

    const lineBtn = document.getElementById('line-merge-cells-btn');
    if (lineBtn) {
      lineBtn.disabled = false;
      lineBtn.dataset.ready = canMergePopup ? 'true' : 'false';
    }
  }

  function normalizeEventTarget(target) {
    if (target instanceof Element) return target;
    if (target && target.parentElement instanceof Element) return target.parentElement;
    return null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
