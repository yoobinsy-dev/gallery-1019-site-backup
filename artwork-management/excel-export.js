(function initializeArtworkExcelExport(root, factory) {
  'use strict';

  const api = factory();
  root.ArtworkExcelExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArtworkExcelExport() {
  'use strict';

  const EXPORTS = Object.freeze({
    collection: { filename: '소장품.xlsx', sheetName: '소장품' },
    past: { filename: '과거 전시 작품.xlsx', sheetName: '과거 전시 작품' }
  });

  function download(table, tab) {
    const settings = EXPORTS[tab];
    if (!table || !settings) return false;
    table.download('xlsx', settings.filename, { sheetName: settings.sheetName }, 'active');
    return true;
  }

  return Object.freeze({ EXPORTS, download });
});