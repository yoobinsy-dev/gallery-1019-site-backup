(function initializeExhibitionCertificateModel(root) {
  'use strict';

  const EMU_PER_PIXEL = 9525;

  function getSourceArtwork(exhibition, sold) {
    const artWorks = Array.isArray(exhibition?.artWorks)
      ? exhibition.artWorks
      : (Array.isArray(exhibition?.works) ? exhibition.works : []);
    return artWorks.find((work) => work.id === sold?.workId) || null;
  }

  function hasGeneratedCertificate(sold) {
    return Boolean(sold && sold.certificateReady === true && sold.certificateVersion === 2);
  }

  function normalizeCertificateDateText(soldAtKst) {
    const text = (soldAtKst || '').toString().trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return text;
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  function safeCertificateFileName(baseTitle) {
    const clean = String(baseTitle || '작품').replace(/[\\/:*?"<>|]/g, '_').trim() || '작품';
    return `${clean}-보증서.xlsx`;
  }

  function buildAllCertificatesFileName(exhibition) {
    const exhibitionName = (exhibition?.title || exhibition?.name || '전시').toString().trim() || '전시';
    return `${exhibitionName.replace(/[\\/:*?"<>|]/g, '_')}-모든보증서.xlsx`;
  }

  function normalizeArtistNameKey(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function getArtistInstagram(artistInstagramMap, sold, work) {
    const map = artistInstagramMap || {};
    const author = (work?.author || sold?.author || '').toString().trim();
    if (!author) return '';
    const direct = (map[author] || '').toString().trim();
    if (direct) return direct;
    const normalizedAuthor = normalizeArtistNameKey(author);
    const fallbackKey = Object.keys(map).find(
      (name) => normalizeArtistNameKey(name) === normalizedAuthor
    );
    return fallbackKey ? (map[fallbackKey] || '').toString().trim() : '';
  }

  function buildCertificateFields(sold, work, artistInstagram) {
    return {
      artist: (work?.author || sold?.author || '').toString(),
      title: (work?.title || sold?.title || '').toString(),
      materials: (work?.materials || '').toString(),
      size: (work?.size || '').toString(),
      year: (work?.year || '').toString(),
      edition: '',
      soldDate: normalizeCertificateDateText(sold?.soldAtKst || ''),
      photoText: (work?.photoName || sold?.photoName || '').toString(),
      artistInstagram: (artistInstagram || '').toString().trim()
    };
  }

  function excelColumnWidthToPixels(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth) || numericWidth <= 0) return 64;
    return Math.floor(((256 * numericWidth + Math.floor(128 / 7)) / 256) * 7);
  }

  function excelRowHeightToPixels(heightPt) {
    const numericHeight = Number(heightPt);
    if (!Number.isFinite(numericHeight) || numericHeight <= 0) return 20;
    return Math.floor(numericHeight * 96 / 72);
  }

  function parseWorksheetMetrics(sheetXml) {
    const defaultColWidthMatch = sheetXml.match(/defaultColWidth="([\d.]+)"/);
    const defaultRowHeightMatch = sheetXml.match(/defaultRowHeight="([\d.]+)"/);
    const defaultColWidth = Number(defaultColWidthMatch?.[1] || 8.43);
    const defaultRowHeight = Number(defaultRowHeightMatch?.[1] || 15);
    const colRanges = [];
    const colTagMatches = sheetXml.match(/<col\b[^>]*\/>/g) || [];
    colTagMatches.forEach((tag) => {
      const min = Number((tag.match(/\bmin="(\d+)"/) || [])[1] || 0);
      const max = Number((tag.match(/\bmax="(\d+)"/) || [])[1] || 0);
      const width = Number((tag.match(/\bwidth="([\d.]+)"/) || [])[1] || defaultColWidth);
      if (min && max) colRanges.push({ min, max, width });
    });
    const rowHeightByIndex = new Map();
    const rowTagRegex = /<row\b([^>]*)>/g;
    let rowMatch;
    while ((rowMatch = rowTagRegex.exec(sheetXml))) {
      const attributes = rowMatch[1] || '';
      const rowNumber = Number((attributes.match(/\br="(\d+)"/) || [])[1] || 0);
      const rowHeight = Number((attributes.match(/\bht="([\d.]+)"/) || [])[1] || 0);
      if (rowNumber && Number.isFinite(rowHeight) && rowHeight > 0) {
        rowHeightByIndex.set(rowNumber - 1, rowHeight);
      }
    }
    return {
      getColumnWidthPx(colIndexZeroBased) {
        const colIndex1Based = colIndexZeroBased + 1;
        const matched = colRanges.find(
          (range) => colIndex1Based >= range.min && colIndex1Based <= range.max
        );
        return excelColumnWidthToPixels(matched ? matched.width : defaultColWidth);
      },
      getRowHeightPx(rowIndexZeroBased) {
        return excelRowHeightToPixels(rowHeightByIndex.get(rowIndexZeroBased) || defaultRowHeight);
      }
    };
  }

  function sumAxisPixels(startIndex, endExclusive, sizeFn) {
    let sum = 0;
    for (let index = startIndex; index < endExclusive; index += 1) sum += sizeFn(index);
    return sum;
  }

  function positionPxToCellOffset(startIndex, endExclusive, positionPx, sizeFn) {
    const totalPx = sumAxisPixels(startIndex, endExclusive, sizeFn);
    if (positionPx <= 0) return { index: startIndex, offsetPx: 0 };
    if (positionPx >= totalPx) return { index: endExclusive, offsetPx: 0 };
    let remaining = positionPx;
    for (let index = startIndex; index < endExclusive; index += 1) {
      const segment = sizeFn(index);
      if (remaining < segment) return { index, offsetPx: remaining };
      remaining -= segment;
    }
    return { index: endExclusive, offsetPx: 0 };
  }

  function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
    const bounds = { fromCol: 2, toCol: 7, fromRow: 4 + rowOffset, toRow: 22 + rowOffset };
    const boxWidthPx = sumAxisPixels(bounds.fromCol, bounds.toCol, metrics.getColumnWidthPx);
    const boxHeightPx = sumAxisPixels(bounds.fromRow, bounds.toRow, metrics.getRowHeightPx);
    const safeImageWidth = Math.max(1, Number(imageWidthPx) || 1);
    const safeImageHeight = Math.max(1, Number(imageHeightPx) || 1);
    const imageRatio = safeImageWidth / safeImageHeight;
    const boxRatio = boxWidthPx / boxHeightPx;
    const fittedWidthPx = imageRatio > boxRatio ? boxWidthPx : boxHeightPx * imageRatio;
    const fittedHeightPx = imageRatio > boxRatio ? boxWidthPx / imageRatio : boxHeightPx;
    const startXPx = (boxWidthPx - fittedWidthPx) / 2;
    const startYPx = (boxHeightPx - fittedHeightPx) / 2;
    const fromX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, startXPx, metrics.getColumnWidthPx);
    const toX = positionPxToCellOffset(bounds.fromCol, bounds.toCol, startXPx + fittedWidthPx, metrics.getColumnWidthPx);
    const fromY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, startYPx, metrics.getRowHeightPx);
    const toY = positionPxToCellOffset(bounds.fromRow, bounds.toRow, startYPx + fittedHeightPx, metrics.getRowHeightPx);
    return {
      fromCol: fromX.index,
      fromColOff: Math.round(fromX.offsetPx * EMU_PER_PIXEL),
      toCol: toX.index,
      toColOff: Math.round(toX.offsetPx * EMU_PER_PIXEL),
      fromRow: fromY.index,
      fromRowOff: Math.round(fromY.offsetPx * EMU_PER_PIXEL),
      toRow: toY.index,
      toRowOff: Math.round(toY.offsetPx * EMU_PER_PIXEL)
    };
  }

  const api = Object.freeze({
    buildAllCertificatesFileName,
    buildCertificateFields,
    computeContainedImageAnchor,
    getArtistInstagram,
    getSourceArtwork,
    hasGeneratedCertificate,
    normalizeCertificateDateText,
    parseWorksheetMetrics,
    safeCertificateFileName
  });
  root.ExhibitionCertificateModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
