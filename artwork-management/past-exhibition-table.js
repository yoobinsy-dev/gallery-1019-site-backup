(function initializePastExhibitionTable(root) {
  'use strict';

  function ownershipSaleStatus(cell) {
    if (cell.getValue() === 'collection') return '<span class="artwork-status-pill artwork-status-owned">소장</span>';
    if (cell.getValue() === 'sold') return '<span class="artwork-status-pill artwork-status-sold">판매</span>';
    return '';
  }

  const tableOptions = new WeakMap();

  function thumbnail(cell, _formatterParams, onRendered) {
    const image = cell.getValue() || {};
    const source = cell.getRow().getData()._previewUrl || image.photoPreviewUrl || image.photoUrl || '';
    const control = document.createElement('label');
    control.className = 'artwork-photo-control';
    control.innerHTML = source
      ? `<img class="artwork-thumbnail" src="${source}" alt=""><span>변경</span>`
      : '<span class="artwork-thumbnail-empty" aria-label="사진 없음">사진 선택</span>';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('aria-label', '작품 사진 선택');
    control.appendChild(input);
    onRendered(() => input.addEventListener('change', () => tableOptions.get(cell.getTable())?.onPhotoSelected?.(cell.getRow(), input.files?.[0])));
    return control;
  }

  function history(cell) {
    return (cell.getValue() || []).map((entry) => `<span class="history-chip">${entry.name}</span>`).join('');
  }

  function price(cell) {
    const number = Number(String(cell.getValue() ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
  }

  function create(element, options = {}) {
    const inputEditor = root.ArtworkRowEditorController.compositionSafeInputEditor;
    const table = new root.Tabulator(element, {
      index: 'workId',
      data: options.data || [],
      layout: 'fitDataStretch',
      responsiveLayout: false,
      selectableRows: true,
      placeholder: '연결된 과거 전시 작품이 없습니다.',
      columns: [
        { formatter: 'rowSelection', titleFormatter: 'rowSelection', download: false, hozAlign: 'center', headerSort: false, width: 48 },
        { title: '소장/판매 여부', field: 'ownershipSaleStatus', formatter: ownershipSaleStatus, accessorDownload: (value) => value === 'collection' ? '소장' : (value === 'sold' ? '판매' : ''), headerSort: false, hozAlign: 'center', width: 120 },
        { title: '사진', field: 'imageRef', formatter: thumbnail, download: false, headerSort: false, width: 96 },
        { title: '작품명', field: 'title', editor: inputEditor, sorter: 'string', minWidth: 180 },
        { title: '작가', field: 'artistName', editor: inputEditor, sorter: 'string', minWidth: 130 },
        { title: '가격', field: 'latestPrice', editor: inputEditor, sorter: 'number', formatter: price, hozAlign: 'right', minWidth: 120 },
        { title: '크기', field: 'size', editor: inputEditor, sorter: 'string', minWidth: 120 },
        { title: '재료', field: 'medium', editor: inputEditor, sorter: 'string', minWidth: 140 },
        { title: '연도', field: 'year', editor: inputEditor, sorter: 'number', minWidth: 88 },
        { title: '최근 전시일', field: 'latestExhibitionDate', sorter: 'date', minWidth: 130 },
        { title: '최근 전시명', field: 'latestExhibitionName', sorter: 'string', minWidth: 180 },
        { title: '전시 이력', field: 'exhibitionHistory', formatter: history, accessorDownload: (value) => (value || []).map((entry) => entry.name).join(', '), headerSort: false, minWidth: 260 }
      ]
    });
    tableOptions.set(table, options);
    if (options.onCellEdited) table.on('cellEdited', options.onCellEdited);
    return table;
  }

  root.ArtworkPastExhibitionTable = Object.freeze({ create, ownershipSaleStatus });
})(typeof globalThis !== 'undefined' ? globalThis : this);