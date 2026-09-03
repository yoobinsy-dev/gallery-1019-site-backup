(function initializeExhibitionDetailGridNavigation(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function isNavigableListTbodyId(tbodyId) {
      return tbodyId === 'works-tbody' || tbodyId === 'sold-works-tbody';
    }

    function getGridCellFromElement(element) {
      if (!element || typeof element.closest !== 'function') return null;
      return element.closest('#works-tbody td, #sold-works-tbody td');
    }

    function getGridMetaFromCell(cell) {
      if (!cell) return null;
      const row = cell.closest('tr');
      const tbody = cell.closest('tbody');
      if (!row || !tbody || !isNavigableListTbodyId(tbody.id)) return null;
      if (row.querySelector('.no-users')) return null;

      const cells = Array.from(row.querySelectorAll('td'));
      const colIndex = cells.indexOf(cell);
      if (colIndex === -1) return null;

      const rowIdAttr = tbody.id === 'works-tbody' ? 'data-work-id' : 'data-sold-id';
      const rowId = row.getAttribute(rowIdAttr);
      if (!rowId) return null;

      return {
        tbodyId: tbody.id,
        rowId,
        colIndex
      };
    }

    function updateGridNavAnchorFromCell(cell) {
      const meta = getGridMetaFromCell(cell);
      if (!meta) return;
      state.gridNavAnchor = meta;
    }

    function getGridEntryControl(cell) {
      if (!cell) return null;
      return cell.querySelector('input:not([type="checkbox"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    }

    function focusGridCell(cell, preferEntry) {
      if (!cell) return;

      if (preferEntry) {
        const control = getGridEntryControl(cell);
        if (control) {
          control.focus();
          if (control.tagName === 'INPUT' && control.type === 'text' && typeof control.select === 'function') {
            control.select();
          }
          updateGridNavAnchorFromCell(cell);
          return;
        }
      }

      cell.tabIndex = -1;
      cell.focus({ preventScroll: true });
      updateGridNavAnchorFromCell(cell);
    }

    function findGridCellByAnchor(anchor) {
      if (!anchor || !isNavigableListTbodyId(anchor.tbodyId)) return null;
      const tbody = document.getElementById(anchor.tbodyId);
      if (!tbody) return null;

      const rowAttr = anchor.tbodyId === 'works-tbody' ? 'data-work-id' : 'data-sold-id';
      const row = Array.from(tbody.querySelectorAll('tr')).find((candidate) => candidate.getAttribute(rowAttr) === String(anchor.rowId));
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
      return Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelectorAll('td').length > 0 && !row.querySelector('.no-users'));
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

    function setPendingGridFocus(tbodyId, rowId, colIndex) {
      state.pendingGridFocus = {
        tbodyId,
        rowId: String(rowId),
        colIndex: Number(colIndex) || 0
      };
    }

    function applyPendingGridFocusForTbody(tbodyId) {
      const pending = state.pendingGridFocus;
      if (!pending || pending.tbodyId !== tbodyId) return;
      const targetCell = findGridCellByAnchor(pending);
      if (!targetCell) return;
      state.pendingGridFocus = null;
      focusGridCell(targetCell, true);
    }

    function refreshGridKeyboardNavigation(tbodyId) {
      if (!isNavigableListTbodyId(tbodyId)) return;
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;

      tbody.querySelectorAll('td').forEach((cell) => {
        cell.classList.add('keyboard-grid-cell');
      });

      applyPendingGridFocusForTbody(tbodyId);
    }

    function handleGridKeyboardNavigation(event) {
      const salesAddModal = document.getElementById('sales-add-modal');
      if (salesAddModal && salesAddModal.style.display === 'flex') {
        return;
      }

      const key = event.key;
      const isArrowKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
      const isEnterKey = key === 'Enter';
      if (!isArrowKey && !isEnterKey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      const cell = getCurrentGridCell(target);
      if (!cell) return;

      if (isEnterKey) {
        if (target && typeof target.matches === 'function' && target.matches('button, input[type="checkbox"], input[type="file"]')) {
          return;
        }
        event.preventDefault();
        options.startCellEditFromEnter(cell);
        return;
      }

      event.preventDefault();
      const nextCell = getAdjacentGridCell(cell, key);
      if (!nextCell) return;
      focusGridCell(nextCell, true);
    }

    function handleGridCellClick(event) {
      const cell = getGridCellFromElement(event.target);
      if (!cell) return;

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

    return Object.freeze({
      isNavigableListTbodyId,
      getGridCellFromElement,
      getGridMetaFromCell,
      updateGridNavAnchorFromCell,
      getGridEntryControl,
      focusGridCell,
      findGridCellByAnchor,
      getCurrentGridCell,
      getGridRowsFromCell,
      getAdjacentGridCell,
      setPendingGridFocus,
      applyPendingGridFocusForTbody,
      refreshGridKeyboardNavigation,
      handleGridKeyboardNavigation,
      handleGridCellClick,
      handleGridCellFocusIn
    });
  }

  const api = Object.freeze({ create });
  root.ExhibitionDetailGridNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);