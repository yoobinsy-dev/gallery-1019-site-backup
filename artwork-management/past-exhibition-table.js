(function initializePastExhibitionTable(root) {
  'use strict';

  function collectionIndicator(cell) {
    return cell.getValue()?.owned === true
      ? '<span class="collection-indicator" title="소장품" aria-label="소장품"></span>'
      : '';
  }

  function thumbnail(cell) {
    const image = cell.getValue() || {};
    const source = image.photoPreviewUrl || image.photoUrl || '';
    return source
      ? `<img class="artwork-thumbnail" src="${source}" alt="">`
      : '<span class="artwork-thumbnail-empty" aria-label="사진 없음">사진 없음</span>';
  }

  function history(cell) {
    return (cell.getValue() || []).map((entry) => `<span class="history-chip">${entry.name}</span>`).join('');
  }

  function price(cell) {
    const number = Number(String(cell.getValue() ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
  }

  function create(element, options = {}) {
    return new root.Tabulator(element, {
      index: 'workId',
      data: options.data || [],
      layout: 'fitDataStretch',
      responsiveLayout: false,
      selectableRows: true,
      placeholder: '연결된 과거 전시 작품이 없습니다.',
      height: '100%',
      columns: [
        { formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 48 },
        { title: '소장 여부', field: 'collection', formatter: collectionIndicator, headerSort: false, hozAlign: 'center', width: 92 },
        { title: '사진', field: 'imageRef', formatter: thumbnail, headerSort: false, width: 96 },
        { title: '작품명', field: 'title', sorter: 'string', minWidth: 180 },
        { title: '작가', field: 'artistName', sorter: 'string', minWidth: 130 },
        { title: '가격', field: 'latestPrice', sorter: 'number', formatter: price, hozAlign: 'right', minWidth: 120 },
        { title: '크기', field: 'size', sorter: 'string', minWidth: 120 },
        { title: '재료', field: 'medium', sorter: 'string', minWidth: 140 },
        { title: '연도', field: 'year', sorter: 'number', minWidth: 88 },
        { title: '최근 전시일', field: 'latestExhibitionDate', sorter: 'date', minWidth: 130 },
        { title: '최근 전시명', field: 'latestExhibitionName', sorter: 'string', minWidth: 180 },
        { title: '전시 이력', field: 'exhibitionHistory', formatter: history, headerSort: false, minWidth: 260 }
      ]
    });
  }

  root.ArtworkPastExhibitionTable = Object.freeze({ collectionIndicator, create });
})(typeof globalThis !== 'undefined' ? globalThis : this);