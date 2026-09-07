(function initializeCollectionTable(root) {
  'use strict';

  function formatPrice(value) {
    const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
  }

  function thumbnail(cell) {
    const image = cell.getValue() || {};
    const source = image.photoPreviewUrl || image.photoUrl || '';
    return source
      ? `<img class="artwork-thumbnail" src="${source}" alt="">`
      : '<span class="artwork-thumbnail-empty" aria-label="사진 없음">사진 없음</span>';
  }

  function history(cell) {
    const entries = cell.getValue() || [];
    if (!entries.length) return '<span class="history-empty">전시 이력 없음</span>';
    return entries.map((entry) => `<span class="history-chip">${entry.name}</span>`).join('');
  }

  function create(element, options = {}) {
    return new root.Tabulator(element, {
      index: 'workId',
      data: options.data || [],
      layout: 'fitDataStretch',
      responsiveLayout: false,
      selectableRows: true,
      placeholder: '등록된 소장품이 없습니다.',
      height: '100%',
      columns: [
        { formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 48 },
        { title: '번호', field: 'collection.collectionNumber', sorter: 'string', minWidth: 130 },
        { title: '사진', field: 'imageRef', formatter: thumbnail, headerSort: false, width: 96 },
        { title: '작품명', field: 'title', sorter: 'string', minWidth: 180 },
        { title: '작가', field: 'artistName', sorter: 'string', minWidth: 130 },
        { title: '가격', field: 'currentPrice', sorter: 'number', formatter: (cell) => formatPrice(cell.getValue()), hozAlign: 'right', minWidth: 120 },
        { title: '크기', field: 'size', sorter: 'string', minWidth: 120 },
        { title: '재료', field: 'medium', sorter: 'string', minWidth: 140 },
        { title: '연도', field: 'year', sorter: 'number', minWidth: 88 },
        { title: '등록일', field: 'collection.dateAdded', sorter: 'date', minWidth: 120 },
        { title: '전시 이력', field: 'exhibitionHistory', formatter: history, headerSort: false, minWidth: 240 }
      ]
    });
  }

  root.ArtworkCollectionTable = Object.freeze({ create, formatPrice });
})(typeof globalThis !== 'undefined' ? globalThis : this);