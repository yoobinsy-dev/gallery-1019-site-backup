(function initializeExhibitionExportModel(root) {
  'use strict';

  const EXCEL_MIME_TYPE = 'application/vnd.ms-excel;charset=utf-8;';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function sanitizeTitle(title) {
    return String(title || 'exhibition').replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
  }

  function buildFilename(title, suffix) {
    return `${sanitizeTitle(title)}-${suffix}.xls`;
  }

  function getPaymentDisplay(sold) {
    if (sold.paymentMethod === '기타') {
      return `기타${sold.paymentMethodEtc ? ` (${sold.paymentMethodEtc})` : ''}`;
    }
    return sold.paymentMethod || '';
  }

  function buildSalesExport(options) {
    const soldWorks = Array.isArray(options?.soldWorks) ? options.soldWorks : [];
    const getPhotoPreviewDataUrl = typeof options?.getPhotoPreviewDataUrl === 'function'
      ? options.getPhotoPreviewDataUrl
      : () => '';
    const headers = ['번호', '사진', '제목', '작가', '가격', '판매일시', '구매자 성함', '구매자 연락처', '결제방법', '비고'];
    const headerRow = headers.map((header) => `<th style="background:#f0f0f0;font-weight:bold;border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(header)}</th>`).join('');
    const dataRows = soldWorks.map((sold) => {
      const soldPreviewDataUrl = getPhotoPreviewDataUrl(sold);
      const photoCell = soldPreviewDataUrl
        ? `<td style="border:1px solid #ccc;padding:4px;text-align:center"><img src="${soldPreviewDataUrl}" width="80" height="80" style="object-fit:contain"></td>`
        : `<td style="border:1px solid #ccc;padding:6px 10px">${escapeHtml(sold.photoName || '')}</td>`;
      const cells = [
        sold.manualNumber || '',
        null,
        sold.title || '',
        sold.author || '',
        sold.price || '',
        sold.soldAtKst || '',
        sold.buyerName || '',
        sold.buyerPhone || '',
        getPaymentDisplay(sold),
        sold.note || ''
      ];
      const tdCells = cells.map((value, index) => {
        if (index === 1) return photoCell;
        return `<td style="border:1px solid #ccc;padding:6px 10px;white-space:nowrap">${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${tdCells}</tr>`;
    }).join('');
    const content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>table{border-collapse:collapse}td,th{font-family:Arial,sans-serif;font-size:12px}</style>
</head><body>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
</body></html>`;
    return {
      content,
      filename: buildFilename(options?.title, 'sales'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  function buildAccountingExport(options) {
    const exhibition = options?.exhibition || {};
    const expenseItems = Array.isArray(options?.expenseItems) ? options.expenseItems : [];
    const revenueItems = Array.isArray(options?.revenueItems) ? options.revenueItems : [];
    const formatAmount = options.formatAmount;
    const getExpenseEffectiveAmount = options.getExpenseEffectiveAmount;
    const parseAmount = options.parseAmount;
    const revenueTotals = {
      art: revenueItems.find((item) => item.id === 'art')?.amount || 0,
      goods: revenueItems.find((item) => item.id === 'goods')?.amount || 0
    };
    const expenseRows = expenseItems.map((item) => ({
      division: item.division || '',
      amount: formatAmount(getExpenseEffectiveAmount(item, revenueTotals))
    }));
    const revenueRows = revenueItems.map((item) => ({
      division: item.division || '',
      amount: formatAmount(item.amount)
    }));
    const expenseTotal = expenseItems.reduce(
      (sum, item) => sum + getExpenseEffectiveAmount(item, revenueTotals),
      0
    );
    const revenueTotal = revenueItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
    const profitTotal = revenueTotal - expenseTotal;
    const buildRows = (rows) => rows.map((row) => `
    <tr>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.division)}</td>
      <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(row.amount)}</td>
    </tr>
  `).join('');
    const content = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; margin-bottom: 16px; width: 100%; }
        th, td { font-family: Arial, sans-serif; font-size: 12px; }
      </style>
    </head>
    <body>
      <h2>${escapeHtml(exhibition.title || '전시 회계')}</h2>
      <p>기간: ${escapeHtml((exhibition.startDate || '') + ' ~ ' + (exhibition.endDate || ''))}</p>

      <table>
        <thead>
          <tr>
            <th colspan="2" style="border:1px solid #ccc;padding:8px 10px;background:#f3f4f6;text-align:left;">지출</th>
          </tr>
          <tr>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">구분</th>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(expenseRows)}
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">합계</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAmount(expenseTotal))}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th colspan="2" style="border:1px solid #ccc;padding:8px 10px;background:#f3f4f6;text-align:left;">수입</th>
          </tr>
          <tr>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">구분</th>
            <th style="border:1px solid #ccc;padding:8px 10px;background:#f9fafb;text-align:left;">금액</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(revenueRows)}
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">합계</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#eef2ff;">${escapeHtml(formatAmount(revenueTotal))}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">총이익</td>
            <td style="border:1px solid #ccc;padding:8px 10px;font-weight:700;background:#ecfdf5;">${escapeHtml(formatAmount(profitTotal))}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;
    return {
      content,
      filename: buildFilename(exhibition.title, 'accounting'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  function buildWorksExport(options) {
    const works = Array.isArray(options?.works) ? options.works : [];
    const rows = [
      ['번호', '사진', '제목', '작가', '가격', '재료', '크기', '연도', '분류']
    ];
    works.forEach((work) => {
      rows.push([
        work.manualNumber || '',
        work.photoName || '',
        work.title || '',
        work.author || '',
        work.price || '',
        work.materials || '',
        work.size || '',
        work.year || '',
        work.category || ''
      ]);
    });
    const sheetRows = rows.map((row) => {
      const cells = row.map((value) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('');
      return `<Row>${cells}</Row>`;
    }).join('');
    const content = `<?xml version="1.0" encoding="UTF-8"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      <Worksheet ss:Name="Sheet1">
        <Table>${sheetRows}</Table>
      </Worksheet>
    </Workbook>`;
    return {
      content,
      filename: buildFilename(options?.title, 'works'),
      mimeType: EXCEL_MIME_TYPE
    };
  }

  const api = Object.freeze({
    buildAccountingExport,
    buildFilename,
    buildSalesExport,
    buildWorksExport,
    getPaymentDisplay,
    sanitizeTitle
  });
  root.ExhibitionExportModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
