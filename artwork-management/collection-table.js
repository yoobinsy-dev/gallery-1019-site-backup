(function initializeCollectionTable(root) {
  'use strict';

  function formatPrice(value) {
    const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
  }

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
    onRendered(() => input.addEventListener('change', () => optionsForCell(cell)?.onPhotoSelected?.(cell.getRow(), input.files?.[0])));
    return control;
  }

  const tableOptions = new WeakMap();

  function optionsForCell(cell) {
    return tableOptions.get(cell.getTable());
  }

  function history(cell) {
    const entries = cell.getValue() || [];
    if (!entries.length) return '<span class="history-empty">전시 이력 없음</span>';
    return entries.map((entry) => `<span class="history-chip">${entry.name}</span>`).join('');
  }

  function create(element, options = {}) {
    const table = new root.Tabulator(element, {
      index: 'workId',
      data: options.data || [],
      layout: 'fitDataStretch',
      responsiveLayout: false,
      selectableRows: true,
      placeholder: '등록된 소장품이 없습니다.',
      columns: [
        { formatter: 'rowSelection', titleFormatter: 'rowSelection', download: false, hozAlign: 'center', headerSort: false, width: 48 },
        { title: '번호', field: 'collection.collectionNumber', editor: 'input', sorter: 'string', minWidth: 130 },
        { title: '사진', field: 'imageRef', formatter: thumbnail, download: false, headerSort: false, width: 96 },
        { title: '작품명', field: 'title', editor: 'input', sorter: 'string', minWidth: 180 },
        { title: '작가', field: 'artistName', editor: 'input', sorter: 'string', minWidth: 130 },
        { title: '가격', field: 'currentPrice', editor: 'input', sorter: 'number', formatter: (cell) => formatPrice(cell.getValue()), hozAlign: 'right', minWidth: 120 },
        { title: '크기', field: 'size', editor: 'input', sorter: 'string', minWidth: 120 },
        { title: '재료', field: 'medium', editor: 'input', sorter: 'string', minWidth: 140 },
        { title: '연도', field: 'year', editor: 'input', sorter: 'number', minWidth: 88 },
        { title: '등록일', field: 'collection.dateAdded', editor: 'date', sorter: 'date', minWidth: 120 },
        { title: '전시 이력', field: 'exhibitionHistory', formatter: history, accessorDownload: (value) => (value || []).map((entry) => entry.name).join(', '), headerSort: false, minWidth: 240 }
      ]
    });
    tableOptions.set(table, options);
    if (options.onCellEdited) table.on('cellEdited', options.onCellEdited);
    return table;
  }

  root.ArtworkCollectionTable = Object.freeze({ create, formatPrice });
})(typeof globalThis !== 'undefined' ? globalThis : this);