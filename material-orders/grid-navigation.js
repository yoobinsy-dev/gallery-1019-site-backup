(function initializePotteryMaterialOrdersGridNavigation(root) {
  'use strict';

  function create(options) {
    const tbodyId = String(options?.tbodyId || '');
    const cellClass = String(options?.cellClass || '');
    const rowIdKey = String(options?.rowIdKey || '');
    const isNavigableRow = typeof options?.isNavigableRow === 'function'
      ? options.isNavigableRow
      : () => true;
    const getAnchor = typeof options?.getAnchor === 'function' ? options.getAnchor : () => null;
    const setAnchor = typeof options?.setAnchor === 'function' ? options.setAnchor : () => {};

    function getBody() {
      return document.getElementById(tbodyId);
    }

    function refresh() {
      const tbody = getBody();
      if (!tbody) return;
      tbody.querySelectorAll('td').forEach((cell) => {
        cell.classList.add(cellClass);
        if (cell instanceof HTMLTableCellElement) cell.tabIndex = -1;
      });
    }

    function getCellFromElement(targetElement) {
      const element = normalizeEventTarget(targetElement);
      if (!element || typeof element.closest !== 'function') return null;
      const cell = element.closest('td');
      if (!(cell instanceof HTMLTableCellElement)) return null;
      const tbody = cell.closest('tbody');
      return tbody?.id === tbodyId ? cell : null;
    }

    function updateAnchorFromCell(cell) {
      if (!cell) return;
      const row = cell.closest('tr');
      if (!row) return;
      const cells = Array.from(row.querySelectorAll('td'));
      const colIndex = cells.indexOf(cell);
      if (colIndex < 0) return;
      setAnchor({ rowId: String(row.dataset[rowIdKey] || ''), colIndex });
    }

    function findCellByAnchor(anchor) {
      if (!anchor) return null;
      const tbody = getBody();
      if (!tbody) return null;
      const row = Array.from(tbody.querySelectorAll('tr'))
        .find((entry) => String(entry.dataset[rowIdKey] || '') === String(anchor.rowId || ''));
      if (!row) return null;
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length === 0) return null;
      const boundedCol = Math.max(0, Math.min(Number(anchor.colIndex) || 0, cells.length - 1));
      return cells[boundedCol] || null;
    }

    function getCurrentCell(targetElement) {
      return getCellFromElement(targetElement) || findCellByAnchor(getAnchor());
    }

    function getAdjacentCell(cell, key) {
      const row = cell?.closest('tr');
      const tbody = cell?.closest('tbody');
      if (!row || !tbody) return null;
      const rows = Array.from(tbody.querySelectorAll('tr'))
        .filter((entry) => entry.querySelectorAll('td').length > 0 && isNavigableRow(entry));
      const rowIndex = rows.indexOf(row);
      const cells = Array.from(row.querySelectorAll('td'));
      const colIndex = cells.indexOf(cell);
      if (rowIndex < 0 || colIndex < 0) return null;

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const nextCol = key === 'ArrowLeft' ? colIndex - 1 : colIndex + 1;
        return nextCol >= 0 && nextCol < cells.length ? cells[nextCol] : null;
      }

      const nextRowIndex = key === 'ArrowUp' ? rowIndex - 1 : rowIndex + 1;
      if (nextRowIndex < 0 || nextRowIndex >= rows.length) return null;
      const nextRowCells = Array.from(rows[nextRowIndex].querySelectorAll('td'));
      return nextRowCells[Math.min(colIndex, nextRowCells.length - 1)] || null;
    }

    function focusCell(cell, focusEntryControl) {
      if (!cell) return;
      const tbody = cell.closest('tbody');
      tbody?.querySelectorAll(`td.${cellClass}`).forEach((entry) => {
        if (entry instanceof HTMLTableCellElement) entry.tabIndex = -1;
      });
      cell.tabIndex = 0;
      updateAnchorFromCell(cell);

      if (focusEntryControl) {
        const control = cell.querySelector('input, select, textarea, button');
        if (control && typeof control.focus === 'function') {
          control.focus();
          return;
        }
      }
      cell.focus();
    }

    function selectEditableText(cell) {
      const control = cell?.querySelector('input:not([type="checkbox"]), textarea');
      if (!control) return;
      try {
        control.focus();
        if (control instanceof HTMLTextAreaElement || control instanceof HTMLInputElement) control.select();
      } catch (error) {
        // Date inputs do not consistently support select().
      }
    }

    return Object.freeze({
      findCellByAnchor,
      focusCell,
      getAdjacentCell,
      getCellFromElement,
      getCurrentCell,
      refresh,
      selectEditableText,
      updateAnchorFromCell
    });
  }

  function normalizeEventTarget(target) {
    if (target && target.nodeType === 3) return target.parentElement;
    return target instanceof Element ? target : null;
  }

  const api = Object.freeze({ create });
  root.PotteryMaterialOrdersGridNavigation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);