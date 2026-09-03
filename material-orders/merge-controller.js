(function initializePotteryMaterialOrdersMergeController(root) {
  'use strict';

  function create(dependencies) {
    const {
      state,
      mergePlanning,
      captureInlineEditDraft,
      snapshotOrdersForUndo,
      snapshotOrderLinesForUndo,
      saveOrders,
      renderOrdersTable,
      updateOrderLinesTotalRow,
      parseCurrencyInput,
      escapeAttribute
    } = dependencies;

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
      return mergePlanning.buildVerticalSelection({
        table: anchor.table,
        colKey: anchor.colKey,
        orderedRowIds: rows.map((row) => getMergeRowId(row, anchor.table)),
        startRowId: anchor.rowId,
        endRowId: target.rowId
      });
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

      state.manualCellMerges[table] = mergePlanning.applyMergePlan(
        state.manualCellMerges[table],
        selection
      );

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
        for (let index = 1; index < selection.rowIds.length; index += 1) {
          const lineId = selection.rowIds[index];
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
      for (let index = 1; index < selection.rowIds.length; index += 1) {
        const itemId = selection.rowIds[index];
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
        for (let index = 1; index < selection.rowIds.length; index += 1) {
          const lineId = selection.rowIds[index];
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
      for (let index = 1; index < selection.rowIds.length; index += 1) {
        const itemId = selection.rowIds[index];
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
      for (let index = 0; index < state.orders.length; index += 1) {
        const order = state.orders[index];
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

      return mergePlanning.buildContiguousSelection({
        table,
        colKey,
        orderedRowIds: eligibleRows.map((row) => getMergeRowId(row, table)),
        selectedRowIds: selectedEntries.map((entry) => entry.rowId)
      });
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

      const applicableMerges = mergePlanning.retainApplicablePlans(
        state.manualCellMerges[table],
        Array.from(rowMap.keys())
      );
      const nextMerges = [];
      applicableMerges.forEach((mergeEntry) => {
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

    return Object.freeze({
      applyManualCellMerge,
      applyManualCellMerges,
      clearMergeSelection,
      handleMergeCellSelectionClick,
      updateMergeButtons
    });
  }

  const api = Object.freeze({ create });
  root.PotteryMaterialOrdersMergeController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);