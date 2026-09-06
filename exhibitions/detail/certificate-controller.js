(function initializeExhibitionDetailCertificateController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailCertificateController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCertificateControllerModule() {
  'use strict';

  const CERT_TEMPLATE_PATHS = [
    'Templates/certificate-template.xlsx',
    'Templates/작품보증서%20양식.xlsx'
  ];
  const CERTIFICATE_BLOCK_START_ROW = 2;
  const CERTIFICATE_BLOCK_END_ROW = 45;
  const CERTIFICATE_BLOCK_HEIGHT = CERTIFICATE_BLOCK_END_ROW - CERTIFICATE_BLOCK_START_ROW + 1;

  function create(options) {
    let certTemplateArrayBufferPromise = null;

    function getModel() {
      const model = options.getExhibitionCertificateModel?.() || options.ExhibitionCertificateModel;
      if (!model) throw new Error('ExhibitionCertificateModel is unavailable.');
      return model;
    }

    function getImageLifecycle() {
      const imageLifecycle = options.getExhibitionImageLifecycle?.() || options.ExhibitionImageLifecycle;
      if (!imageLifecycle) throw new Error('ExhibitionImageLifecycle is unavailable.');
      return imageLifecycle;
    }

    function getJSZip() {
      return options.getJSZip();
    }

    function getXlsxPopulate() {
      return options.getXlsxPopulate();
    }

    async function ensureCertificateLibraries() {
      if (typeof options.ensureCertificateLibraries === 'function') {
        await options.ensureCertificateLibraries();
      }
    }

    async function fetchCertificateTemplateArrayBuffer() {
      const failures = [];

      for (const path of CERT_TEMPLATE_PATHS) {
        try {
          const response = await options.fetch(path);
          if (!response.ok) {
            failures.push(`${path} (${response.status})`);
            continue;
          }
          return response.arrayBuffer();
        } catch (error) {
          failures.push(`${path} (network error)`);
        }
      }

      throw new Error(`template fetch failed: ${failures.join(', ')}`);
    }

    function getCertificateTemplateArrayBuffer() {
      if (!certTemplateArrayBufferPromise) {
        certTemplateArrayBufferPromise = fetchCertificateTemplateArrayBuffer().catch((error) => {
          certTemplateArrayBufferPromise = null;
          throw error;
        });
      }
      return certTemplateArrayBufferPromise;
    }

    function getSourceArtworkForSold(sold) {
      return options.getSourceArtworkForSold(sold);
    }

    function hasGeneratedCertificate(sold) {
      return getModel().hasGeneratedCertificate(sold);
    }

    function normalizeCertificateDateText(soldAtKst) {
      return getModel().normalizeCertificateDateText(soldAtKst);
    }

    function safeCertificateFileName(baseTitle) {
      return getModel().safeCertificateFileName(baseTitle);
    }

    function getCertificateImageDataUrl(sold, work) {
      const imageLifecycle = getImageLifecycle();
      return imageLifecycle.getPhotoPreviewSource(work)
        || imageLifecycle.getPhotoSource(work)
        || imageLifecycle.getPhotoPreviewSource(sold)
        || imageLifecycle.getPhotoSource(sold);
    }

    function dataUrlToUint8Array(dataUrl) {
      const base64 = String(dataUrl || '').split(',')[1] || '';
      const binary = options.atob(base64);
      const bytes = new options.Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    function blobToUint8Array(blob) {
      return new Promise((resolve, reject) => {
        const reader = new options.FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (!(result instanceof options.ArrayBuffer)) {
            reject(new Error('Failed to read blob as ArrayBuffer.'));
            return;
          }
          resolve(new options.Uint8Array(result));
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob data.'));
        reader.readAsArrayBuffer(blob);
      });
    }

    function canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      });
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new options.FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Failed to read artwork image blob.'));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read artwork image blob.'));
        reader.readAsDataURL(blob);
      });
    }

    async function resolveCertificateImageDataUrl(imageSource) {
      const source = (imageSource || '').toString().trim();
      if (!source) {
        throw new Error('Missing artwork image source.');
      }
      if (!/^https?:\/\//i.test(source)) {
        return source;
      }

      const response = await options.fetch(source, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'default'
      });
      if (!response.ok) {
        throw new Error(`Artwork image fetch failed (${response.status}).`);
      }

      return blobToDataUrl(await response.blob());
    }

    async function buildCertificatePngBytesFromDataUrl(imageDataUrl) {
      const source = await resolveCertificateImageDataUrl(imageDataUrl);
      const image = await options.loadImageElement(source);
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height) {
        throw new Error('Invalid artwork image dimensions.');
      }

      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = options.document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas 2D context is unavailable.');
      }
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToBlob(canvas, 'image/png', 0.92);
      if (blob) {
        return {
          bytes: await blobToUint8Array(blob),
          width: targetWidth,
          height: targetHeight
        };
      }

      const pngDataUrl = canvas.toDataURL('image/png');
      return {
        bytes: dataUrlToUint8Array(pngDataUrl),
        width: targetWidth,
        height: targetHeight
      };
    }

    function parseWorksheetMetrics(sheetXml) {
      return getModel().parseWorksheetMetrics(sheetXml);
    }

    function computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset = 0) {
      return getModel().computeContainedImageAnchor(metrics, imageWidthPx, imageHeightPx, rowOffset);
    }

    function removeXmlAttribute(tag, attrName) {
      const attrRegex = new RegExp(`\\s${attrName}="[^"]*"`, 'g');
      return tag.replace(attrRegex, '');
    }

    function setOrReplaceXmlAttribute(tag, attrName, attrValue) {
      const attrRegex = new RegExp(`\\s${attrName}="[^"]*"`);
      if (attrRegex.test(tag)) {
        return tag.replace(attrRegex, ` ${attrName}="${attrValue}"`);
      }
      return tag.replace(/\/>$/, ` ${attrName}="${attrValue}"/>`);
    }

    function enforceWorksheetPageSetupXml(sheetXml, pageOptions = {}) {
      if (!sheetXml) return sheetXml;
      let nextXml = sheetXml;
      const fitToWidth = String(pageOptions.fitToWidth ?? 1);
      const fitToHeight = String(pageOptions.fitToHeight ?? 1);
      const fitToPage = String(pageOptions.fitToPage ?? 1);
      const sheetPrOpenCloseRegex = /<sheetPr\b([^>]*)>([\s\S]*?)<\/sheetPr>/;
      const sheetPrSelfClosingRegex = /<sheetPr\b([^>]*)\/>/;

      if (sheetPrOpenCloseRegex.test(nextXml)) {
        nextXml = nextXml.replace(sheetPrOpenCloseRegex, (full, attrs, body) => {
          const cleanBody = /<pageSetUpPr\b[^>]*\/>/.test(body)
            ? body.replace(/<pageSetUpPr\b[^>]*\/>/, `<pageSetUpPr fitToPage="${fitToPage}"/>`)
            : `${body}<pageSetUpPr fitToPage="${fitToPage}"/>`;
          return `<sheetPr${attrs}>${cleanBody}</sheetPr>`;
        });
      } else if (sheetPrSelfClosingRegex.test(nextXml)) {
        nextXml = nextXml.replace(sheetPrSelfClosingRegex, `<sheetPr$1><pageSetUpPr fitToPage="${fitToPage}"/></sheetPr>`);
      } else {
        nextXml = nextXml.replace(/(<worksheet\b[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="${fitToPage}"/></sheetPr>`);
      }

      const pageSetupRegex = /<pageSetup\b[^>]*\/>/;
      if (pageSetupRegex.test(nextXml)) {
        nextXml = nextXml.replace(pageSetupRegex, (tag) => {
          let updated = removeXmlAttribute(tag, 'scale');
          updated = setOrReplaceXmlAttribute(updated, 'orientation', 'portrait');
          updated = setOrReplaceXmlAttribute(updated, 'fitToWidth', fitToWidth);
          updated = setOrReplaceXmlAttribute(updated, 'fitToHeight', fitToHeight);
          return updated;
        });
      } else {
        const pageSetupTag = `<pageSetup paperSize="9" orientation="portrait" fitToWidth="${fitToWidth}" fitToHeight="${fitToHeight}"/>`;
        if (nextXml.includes('<headerFooter>')) {
          nextXml = nextXml.replace('<headerFooter>', `${pageSetupTag}<headerFooter>`);
        } else if (nextXml.includes('<drawing ')) {
          nextXml = nextXml.replace(/<drawing\b/, `${pageSetupTag}<drawing`);
        } else {
          nextXml = nextXml.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
        }
      }
      return nextXml;
    }

    function buildWorkbookPrintAreaFormula(workbookXml, endRow = CERTIFICATE_BLOCK_END_ROW) {
      const sheetNameMatch = workbookXml.match(/<sheet\b[^>]*\bname="([^"]+)"/);
      const sheetName = (sheetNameMatch?.[1] || 'Sheet1').replace(/'/g, "''");
      const safeEndRow = Math.max(CERTIFICATE_BLOCK_END_ROW, Number(endRow) || CERTIFICATE_BLOCK_END_ROW);
      return `'${sheetName}'!$A$${CERTIFICATE_BLOCK_START_ROW}:$I$${safeEndRow}`;
    }

    function upsertWorkbookPrintArea(workbookXml, printAreaFormula) {
      if (!workbookXml) return workbookXml;
      const printAreaTag = `<definedName name="_xlnm.Print_Area" localSheetId="0">${printAreaFormula}</definedName>`;
      const printAreaRegex = /<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[\s\S]*?<\/definedName>/;
      if (printAreaRegex.test(workbookXml)) return workbookXml.replace(printAreaRegex, printAreaTag);
      if (workbookXml.includes('<definedNames>')) return workbookXml.replace('</definedNames>', `${printAreaTag}</definedNames>`);
      if (workbookXml.includes('</sheets>')) return workbookXml.replace('</sheets>', `</sheets><definedNames>${printAreaTag}</definedNames>`);
      if (workbookXml.includes('<calcPr')) return workbookXml.replace('<calcPr', `<definedNames>${printAreaTag}</definedNames><calcPr`);
      return workbookXml.replace('</workbook>', `<definedNames>${printAreaTag}</definedNames></workbook>`);
    }

    function buildArtworkAnchorXml(imageAnchor, picId, relId) {
      return `
<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>${imageAnchor.fromCol}</xdr:col><xdr:colOff>${imageAnchor.fromColOff}</xdr:colOff><xdr:row>${imageAnchor.fromRow}</xdr:row><xdr:rowOff>${imageAnchor.fromRowOff}</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>${imageAnchor.toCol}</xdr:col><xdr:colOff>${imageAnchor.toColOff}</xdr:colOff><xdr:row>${imageAnchor.toRow}</xdr:row><xdr:rowOff>${imageAnchor.toRowOff}</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="${picId}" name="Artwork ${picId}"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}" cstate="print"/>
      <a:stretch><a:fillRect/></a:stretch>
    </xdr:blipFill>
    <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`;
    }

    async function applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl) {
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is unavailable');
      const zip = await JSZip.loadAsync(workbookBlob);
      const pngImage = await buildCertificatePngBytesFromDataUrl(imageDataUrl);
      const drawingPath = 'xl/drawings/drawing1.xml';
      const drawingRelsPath = 'xl/drawings/_rels/drawing1.xml.rels';
      const sheetPath = 'xl/worksheets/sheet1.xml';
      const workbookPath = 'xl/workbook.xml';
      const drawingFile = zip.file(drawingPath);
      const drawingRelsFile = zip.file(drawingRelsPath);
      const sheetFile = zip.file(sheetPath);
      const workbookFile = zip.file(workbookPath);
      if (!drawingFile || !drawingRelsFile) throw new Error('Template drawing files were not found.');

      const drawingXml = await drawingFile.async('string');
      const drawingRelsXml = await drawingRelsFile.async('string');
      const sheetXml = sheetFile ? await sheetFile.async('string') : '';
      const workbookXml = workbookFile ? await workbookFile.async('string') : '';
      const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((match) => Number(match[1]) || 0);
      const nextRelId = `rId${relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1}`;
      const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      const nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      zip.file('xl/media/certificate-artwork.png', pngImage.bytes);
      const insertedRel = `<Relationship Id="${nextRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork.png"/>`;
      const newDrawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);
      const defaultAnchor = { fromCol: 2, fromColOff: 0, fromRow: 4, fromRowOff: 0, toCol: 7, toColOff: 0, toRow: 22, toRowOff: 0 };
      const imageAnchor = sheetXml
        ? computeContainedImageAnchor(parseWorksheetMetrics(sheetXml), pngImage.width, pngImage.height)
        : defaultAnchor;
      const artworkAnchor = buildArtworkAnchorXml(imageAnchor, nextPicId, nextRelId);
      const newDrawingXml = drawingXml.replace('</xdr:wsDr>', `${artworkAnchor}</xdr:wsDr>`);
      const newSheetXml = enforceWorksheetPageSetupXml(sheetXml, { fitToWidth: 1, fitToHeight: 1, fitToPage: 1 });
      const newWorkbookXml = upsertWorkbookPrintArea(workbookXml, buildWorkbookPrintAreaFormula(workbookXml));
      zip.file(drawingRelsPath, newDrawingRelsXml);
      zip.file(drawingPath, newDrawingXml);
      if (sheetFile) zip.file(sheetPath, newSheetXml);
      if (workbookFile) zip.file(workbookPath, newWorkbookXml);
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    function downloadBlobFile(blob, fileName) {
      const url = options.URL.createObjectURL(blob);
      const link = options.document.createElement('a');
      link.href = url;
      link.download = fileName;
      options.document.body.appendChild(link);
      link.click();
      link.remove();
      options.URL.revokeObjectURL(url);
    }

    function getArtistInstagramForCertificate(sold, work) {
      const exhibition = options.ensureExhibitionInfoData();
      return getModel().getArtistInstagram(exhibition.artistInstagramMap, sold, work);
    }

    function escapeXmlText(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    async function applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, instagramTag) {
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') return workbookBlob;
      const placeholder = 'instagram_handle_name';
      const replacement = escapeXmlText((instagramTag || '').toString().trim());
      const zip = await JSZip.loadAsync(workbookBlob);
      let changed = false;
      for (const path of ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']) {
        const file = zip.file(path);
        if (!file) continue;
        const xml = await file.async('text');
        const replacedXml = xml.split(placeholder).join(replacement);
        if (replacedXml !== xml) {
          zip.file(path, replacedXml);
          changed = true;
        }
      }
      if (!changed) return workbookBlob;
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    function applyCertificateArtistInstagram(sheet, instagramTag) {
      const value = (instagramTag || '').toString().trim();
      if (!sheet) return;
      const placeholder = 'instagram_handle_name';
      let applied = false;
      ['A45', 'B45', 'C45'].forEach((address) => {
        try {
          const cell = sheet.cell(address);
          const raw = cell.value();
          const text = raw == null ? '' : String(raw);
          if (!text.includes(placeholder)) return;
          cell.value(text.split(placeholder).join(value));
          applied = true;
        } catch (error) {
          // Ignore per-cell failures and continue.
        }
      });
      if (applied) return;
      const labelRegex = /(인스타|instagram|insta|sns)/i;
      try {
        const usedRange = sheet.usedRange();
        if (usedRange) {
          const startCell = usedRange.startCell();
          const values = usedRange.value();
          if (Array.isArray(values)) {
            for (let rowIndex = 0; rowIndex < values.length && !applied; rowIndex += 1) {
              const row = values[rowIndex];
              if (!Array.isArray(row)) continue;
              for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
                const text = (row[columnIndex] == null ? '' : String(row[columnIndex])).trim();
                if (!labelRegex.test(text)) continue;
                sheet.cell(startCell.rowNumber() + rowIndex, startCell.columnNumber() + columnIndex + 1).value(value);
                applied = true;
                break;
              }
            }
          }
        }
      } catch (error) {
        applied = false;
      }
      if (!applied) sheet.cell('F36').value(value);
    }

    async function buildCertificateWorkbookBlob(sold, work) {
      await ensureCertificateLibraries();
      const XlsxPopulate = getXlsxPopulate();
      if (typeof XlsxPopulate === 'undefined') throw new Error('XlsxPopulate is unavailable');
      const templateBuffer = await getCertificateTemplateArrayBuffer();
      const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
      const sheet = workbook.sheet(0);
      const fields = getModel().buildCertificateFields(sold, work, getArtistInstagramForCertificate(sold, work));
      sheet.cell('F24').value(fields.artist);
      sheet.cell('F26').value(fields.title);
      sheet.cell('F28').value(fields.materials);
      sheet.cell('F30').value(fields.size);
      sheet.cell('F32').value(fields.year);
      sheet.cell('F34').value(fields.edition);
      if (fields.soldDate) sheet.cell('B3').value(`Date ${fields.soldDate}`);
      if (fields.photoText) sheet.cell('C22').value('');
      let workbookBlob = await workbook.outputAsync();
      workbookBlob = await applyCertificateInstagramPlaceholderToWorkbookBlob(workbookBlob, fields.artistInstagram);
      const imageDataUrl = getCertificateImageDataUrl(sold, work);
      if (!imageDataUrl) throw new Error('Artwork image not found for certificate.');
      return applyCertificateImageToWorkbookBlob(workbookBlob, imageDataUrl);
    }

    function buildAllCertificatesDownloadFileName() {
      return getModel().buildAllCertificatesFileName(options.getCurrentExhibition());
    }

    function upsertWorksheetRowBreaksXml(sheetXml, breakRows) {
      if (!sheetXml) return sheetXml;
      let nextXml = sheetXml
        .replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/g, '')
        .replace(/<rowBreaks\b[^>]*\/>/g, '');
      const rows = Array.isArray(breakRows)
        ? breakRows.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      if (rows.length === 0) return nextXml;
      const uniqueRows = Array.from(new Set(rows)).sort((a, b) => a - b);
      const breaksBody = uniqueRows.map((row) => `<brk id="${Math.round(row)}" max="16383" man="1"/>`).join('');
      const rowBreaksTag = `<rowBreaks count="${uniqueRows.length}" manualBreakCount="${uniqueRows.length}">${breaksBody}</rowBreaks>`;
      if (nextXml.includes('<drawing ')) return nextXml.replace(/<drawing\b/, `${rowBreaksTag}<drawing`);
      if (nextXml.includes('</worksheet>')) return nextXml.replace('</worksheet>', `${rowBreaksTag}</worksheet>`);
      return nextXml;
    }

    function parseXmlDocumentOrThrow(xmlText, label) {
      const parser = new options.DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const parseErrors = xmlDoc.getElementsByTagName('parsererror');
      if (parseErrors && parseErrors.length > 0) throw new Error(`Failed to parse ${label || 'XML'}.`);
      return xmlDoc;
    }

    function getElementsByLocalName(node, localName) {
      if (!node) return [];
      return Array.from(node.getElementsByTagNameNS('*', localName));
    }

    function splitCellReference(cellRef) {
      const match = String(cellRef || '').trim().match(/^([A-Z]+)(\d+)$/);
      if (!match) return null;
      return { column: match[1], row: Number(match[2]) };
    }

    function shiftCellReferenceRow(cellRef, rowOffset) {
      const parsed = splitCellReference(cellRef);
      if (!parsed) return cellRef;
      return `${parsed.column}${parsed.row + Number(rowOffset || 0)}`;
    }

    function shiftRangeReferenceRows(rangeRef, rowOffset) {
      return String(rangeRef || '').replace(/([A-Z]+)(\d+)/g, (full, col, row) => `${col}${Number(row) + Number(rowOffset || 0)}`);
    }

    function setSheetCellInlineText(cellElement, textValue, xmlDoc) {
      if (!cellElement || !xmlDoc) return;
      while (cellElement.firstChild) cellElement.removeChild(cellElement.firstChild);
      cellElement.setAttribute('t', 'inlineStr');
      const mainNs = xmlDoc.documentElement ? xmlDoc.documentElement.namespaceURI : null;
      const inlineStringNode = xmlDoc.createElementNS(mainNs, 'is');
      const textNode = xmlDoc.createElementNS(mainNs, 't');
      const text = String(textValue == null ? '' : textValue);
      if (/^\s|\s$/.test(text) || text.includes('\n')) textNode.setAttribute('xml:space', 'preserve');
      textNode.textContent = text;
      inlineStringNode.appendChild(textNode);
      cellElement.appendChild(inlineStringNode);
    }

    function getDrawingAnchorFromRowIndex(anchorXml) {
      const match = String(anchorXml || '').match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>/);
      if (!match) return null;
      const rowIndex = Number(match[1]);
      return Number.isFinite(rowIndex) ? rowIndex : null;
    }

    function shiftDrawingAnchorRows(anchorXml, rowOffset) {
      const offset = Number(rowOffset || 0);
      if (!offset) return anchorXml;
      return String(anchorXml || '')
        .replace(/(<xdr:from>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:from>)/,
          (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`)
        .replace(/(<xdr:to>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>[\s\S]*?<\/xdr:to>)/,
          (full, prefix, row, suffix) => `${prefix}${Number(row) + offset}${suffix}`);
    }

    function duplicateTemplateDrawingAnchorsForPages(drawingXml, pageCount) {
      const totalPages = Number(pageCount || 0);
      if (totalPages <= 1 || !drawingXml) return drawingXml;
      const anchorBlocks = Array.from(String(drawingXml).matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)).map((match) => match[0]);
      if (anchorBlocks.length === 0) return drawingXml;
      const templateAnchors = anchorBlocks.filter((anchorXml) => {
        const fromRow = getDrawingAnchorFromRowIndex(anchorXml);
        return Number.isFinite(fromRow) && fromRow >= CERTIFICATE_BLOCK_START_ROW - 1 && fromRow <= CERTIFICATE_BLOCK_END_ROW - 1;
      });
      if (templateAnchors.length === 0) return drawingXml;
      const picIdNumbers = Array.from(String(drawingXml).matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      let insertedAnchorsXml = '';
      for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateAnchors.forEach((anchorXml) => {
          let shifted = shiftDrawingAnchorRows(anchorXml, rowOffset);
          shifted = shifted.replace(/(<xdr:cNvPr\b[^>]*\bid=")(\d+)(")/, (full, prefix, id, suffix) => {
            const replacement = `${prefix}${nextPicId}${suffix}`;
            nextPicId += 1;
            return replacement;
          });
          insertedAnchorsXml += shifted;
        });
      }
      if (!insertedAnchorsXml) return drawingXml;
      return String(drawingXml).replace('</xdr:wsDr>', `${insertedAnchorsXml}</xdr:wsDr>`);
    }

    function parseSharedStringsText(sharedStringsXml) {
      if (!sharedStringsXml) return [];
      const doc = parseXmlDocumentOrThrow(sharedStringsXml, 'sharedStrings.xml');
      return getElementsByLocalName(doc, 'si').map((siNode) =>
        getElementsByLocalName(siNode, 't').map((node) => node.textContent || '').join(''));
    }

    function getTemplateInstagramPattern(sheetDoc, sharedStringsXml) {
      const sharedTexts = parseSharedStringsText(sharedStringsXml);
      const instagramCell = getElementsByLocalName(sheetDoc, 'c').find((cell) => (cell.getAttribute('r') || '') === 'A45');
      if (!instagramCell) return 'instagram_handle_name';
      const valueNode = getElementsByLocalName(instagramCell, 'v')[0];
      const type = (instagramCell.getAttribute('t') || '').toLowerCase();
      if (type === 's' && valueNode) {
        const sharedText = sharedTexts[Number(valueNode.textContent || 0)] || '';
        if (sharedText.includes('instagram_handle_name')) return sharedText;
      }
      return 'instagram_handle_name';
    }

    function setInlineCellValueByRef(cellMap, ref, value, xmlDoc) {
      const cellElement = cellMap.get(ref);
      if (cellElement) setSheetCellInlineText(cellElement, value, xmlDoc);
    }

    async function buildAllCertificatesWorkbookBlob(entries) {
      await ensureCertificateLibraries();
      const JSZip = getJSZip();
      if (typeof JSZip === 'undefined') throw new Error('JSZip is unavailable');
      const certificateEntries = Array.isArray(entries) ? entries : [];
      if (certificateEntries.length === 0) throw new Error('No generated certificates to export.');
      const zip = await JSZip.loadAsync(await getCertificateTemplateArrayBuffer());
      const sheetPath = 'xl/worksheets/sheet1.xml';
      const workbookPath = 'xl/workbook.xml';
      const sharedStringsPath = 'xl/sharedStrings.xml';
      const drawingPath = 'xl/drawings/drawing1.xml';
      const drawingRelsPath = 'xl/drawings/_rels/drawing1.xml.rels';
      const sheetFile = zip.file(sheetPath);
      const workbookFile = zip.file(workbookPath);
      const drawingFile = zip.file(drawingPath);
      const drawingRelsFile = zip.file(drawingRelsPath);
      if (!sheetFile || !workbookFile || !drawingFile || !drawingRelsFile) {
        throw new Error('Template files are incomplete for certificate export.');
      }
      const sourceSheetXml = await sheetFile.async('text');
      const workbookXml = await workbookFile.async('text');
      const sharedStringsFile = zip.file(sharedStringsPath);
      const sharedStringsXml = sharedStringsFile ? await sharedStringsFile.async('text') : '';
      let drawingXml = await drawingFile.async('text');
      let drawingRelsXml = await drawingRelsFile.async('text');
      const sheetDoc = parseXmlDocumentOrThrow(sourceSheetXml, 'sheet1.xml');
      const sheetData = getElementsByLocalName(sheetDoc, 'sheetData')[0];
      if (!sheetData) throw new Error('Template sheetData was not found.');
      const templateRows = getElementsByLocalName(sheetData, 'row')
        .filter((rowElement) => {
          const rowIndex = Number(rowElement.getAttribute('r') || 0);
          return rowIndex >= CERTIFICATE_BLOCK_START_ROW && rowIndex <= CERTIFICATE_BLOCK_END_ROW;
        })
        .map((rowElement) => rowElement.cloneNode(true));
      if (templateRows.length === 0) throw new Error('Template certificate row block was not found.');
      const mergeCellsNode = getElementsByLocalName(sheetDoc, 'mergeCells')[0] || null;
      const templateMergeRefs = mergeCellsNode
        ? getElementsByLocalName(mergeCellsNode, 'mergeCell').map((node) => (node.getAttribute('ref') || '').trim()).filter(Boolean)
        : [];
      while (sheetData.firstChild) sheetData.removeChild(sheetData.firstChild);
      const cellMap = new Map();
      certificateEntries.forEach((entry, pageIndex) => {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateRows.forEach((templateRow) => {
          const rowClone = templateRow.cloneNode(true);
          rowClone.setAttribute('r', String(Number(rowClone.getAttribute('r') || 0) + rowOffset));
          getElementsByLocalName(rowClone, 'c').forEach((cell) => {
            const originalRef = cell.getAttribute('r') || '';
            if (!originalRef) return;
            const shiftedRef = shiftCellReferenceRow(originalRef, rowOffset);
            cell.setAttribute('r', shiftedRef);
            cellMap.set(shiftedRef, cell);
          });
          sheetData.appendChild(rowClone);
        });
      });
      const sheetRoot = sheetDoc.documentElement;
      const sheetMainNs = sheetRoot ? sheetRoot.namespaceURI : null;
      let resolvedMergeCellsNode = mergeCellsNode;
      if (!resolvedMergeCellsNode) {
        resolvedMergeCellsNode = sheetDoc.createElementNS(sheetMainNs, 'mergeCells');
        if (sheetData.nextSibling) sheetData.parentNode.insertBefore(resolvedMergeCellsNode, sheetData.nextSibling);
        else sheetData.parentNode.appendChild(resolvedMergeCellsNode);
      }
      while (resolvedMergeCellsNode.firstChild) resolvedMergeCellsNode.removeChild(resolvedMergeCellsNode.firstChild);
      let mergeCount = 0;
      certificateEntries.forEach((entry, pageIndex) => {
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        templateMergeRefs.forEach((mergeRef) => {
          const mergeCellNode = sheetDoc.createElementNS(sheetMainNs, 'mergeCell');
          mergeCellNode.setAttribute('ref', shiftRangeReferenceRows(mergeRef, rowOffset));
          resolvedMergeCellsNode.appendChild(mergeCellNode);
          mergeCount += 1;
        });
      });
      resolvedMergeCellsNode.setAttribute('count', String(mergeCount));
      const instagramPattern = getTemplateInstagramPattern(sheetDoc, sharedStringsXml);
      certificateEntries.forEach((entry, pageIndex) => {
        const sold = entry.sold || {};
        const work = entry.work || {};
        const rowOffset = pageIndex * CERTIFICATE_BLOCK_HEIGHT;
        const fields = getModel().buildCertificateFields(sold, work, getArtistInstagramForCertificate(sold, work));
        setInlineCellValueByRef(cellMap, `F${24 + rowOffset}`, fields.artist, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${26 + rowOffset}`, fields.title, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${28 + rowOffset}`, fields.materials, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${30 + rowOffset}`, fields.size, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${32 + rowOffset}`, fields.year, sheetDoc);
        setInlineCellValueByRef(cellMap, `F${34 + rowOffset}`, fields.edition, sheetDoc);
        setInlineCellValueByRef(cellMap, `B${3 + rowOffset}`, fields.soldDate ? `Date ${fields.soldDate}` : '', sheetDoc);
        const instagramText = fields.artistInstagram
          ? (instagramPattern.includes('instagram_handle_name')
            ? instagramPattern.split('instagram_handle_name').join(fields.artistInstagram)
            : fields.artistInstagram)
          : '';
        setInlineCellValueByRef(cellMap, `A${45 + rowOffset}`, instagramText, sheetDoc);
      });
      const finalEndRow = CERTIFICATE_BLOCK_END_ROW + (certificateEntries.length - 1) * CERTIFICATE_BLOCK_HEIGHT;
      const dimensionNode = getElementsByLocalName(sheetDoc, 'dimension')[0];
      if (dimensionNode) dimensionNode.setAttribute('ref', `A${CERTIFICATE_BLOCK_START_ROW}:I${finalEndRow}`);
      let newSheetXml = new options.XMLSerializer().serializeToString(sheetDoc);
      newSheetXml = enforceWorksheetPageSetupXml(newSheetXml, { fitToWidth: 1, fitToHeight: 0, fitToPage: 1 });
      const pageBreakRows = [];
      for (let index = 0; index < certificateEntries.length - 1; index += 1) {
        pageBreakRows.push(CERTIFICATE_BLOCK_END_ROW + index * CERTIFICATE_BLOCK_HEIGHT);
      }
      newSheetXml = upsertWorksheetRowBreaksXml(newSheetXml, pageBreakRows);
      drawingXml = duplicateTemplateDrawingAnchorsForPages(drawingXml, certificateEntries.length);
      const metrics = parseWorksheetMetrics(newSheetXml);
      const relIdNumbers = Array.from(drawingRelsXml.matchAll(/Id="rId(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextRelIdNum = relIdNumbers.length > 0 ? Math.max(...relIdNumbers) + 1 : 1;
      const picIdNumbers = Array.from(drawingXml.matchAll(/<xdr:cNvPr[^>]*\sid="(\d+)"/g)).map((match) => Number(match[1]) || 0);
      let nextPicId = picIdNumbers.length > 0 ? Math.max(...picIdNumbers) + 1 : 100;
      for (let index = 0; index < certificateEntries.length; index += 1) {
        const pngImage = await buildCertificatePngBytesFromDataUrl(certificateEntries[index].imageDataUrl);
        zip.file(`xl/media/certificate-artwork-${index + 1}.png`, pngImage.bytes);
        const relId = `rId${nextRelIdNum}`;
        nextRelIdNum += 1;
        const picId = nextPicId;
        nextPicId += 1;
        const insertedRel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/certificate-artwork-${index + 1}.png"/>`;
        drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${insertedRel}</Relationships>`);
        const imageAnchor = computeContainedImageAnchor(metrics, pngImage.width, pngImage.height, index * CERTIFICATE_BLOCK_HEIGHT);
        drawingXml = drawingXml.replace('</xdr:wsDr>', `${buildArtworkAnchorXml(imageAnchor, picId, relId)}</xdr:wsDr>`);
      }
      zip.file(sheetPath, newSheetXml);
      zip.file(workbookPath, upsertWorkbookPrintArea(workbookXml, buildWorkbookPrintAreaFormula(workbookXml, finalEndRow)));
      zip.file(drawingPath, drawingXml);
      zip.file(drawingRelsPath, drawingRelsXml);
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    async function handleDownloadAllCertificatesAction() {
      const soldWorks = options.ensureSoldWorksArray();
      const generatedSales = soldWorks.filter((sold) => options.normalizeSoldItemType(sold) === '작품' && hasGeneratedCertificate(sold));
      if (generatedSales.length === 0) {
        options.alert('생성된 보증서가 없습니다. 먼저 판매 항목에서 보증서를 생성해주세요.');
        return;
      }
      const entries = [];
      const missingImageSales = [];
      generatedSales.forEach((sold) => {
        const work = getSourceArtworkForSold(sold) || null;
        const imageDataUrl = getCertificateImageDataUrl(sold, work);
        if (!imageDataUrl) missingImageSales.push(sold);
        else entries.push({ sold, work, imageDataUrl });
      });
      if (missingImageSales.length > 0) {
        options.alert(`이미지가 누락된 보증서 ${missingImageSales.length}건이 있어 전체 보증서를 생성할 수 없습니다. 판매 목록에서 이미지 상태를 확인해주세요.`);
        return;
      }
      try {
        downloadBlobFile(await buildAllCertificatesWorkbookBlob(entries), buildAllCertificatesDownloadFileName());
      } catch (error) {
        options.console.error('all certificates generation failed', error);
        options.alert('모든 보증서 다운로드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    }

    async function handleSoldCertificateAction(soldId) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find((item) => item.id === soldId);
      if (!sold || options.normalizeSoldItemType(sold) !== '작품') return;
      if (!sold.saved) {
        options.alert('보증서 생성을 위해 판매 항목을 먼저 저장해주세요.');
        return;
      }
      const work = getSourceArtworkForSold(sold);
      if (!work) {
        options.alert('작품 목록에서 해당 작품 정보를 찾을 수 없습니다. 작품 목록 데이터를 확인해주세요.');
        return;
      }
      if (!getCertificateImageDataUrl(sold, work)) {
        options.alert('작품 이미지가 없어 보증서를 생성할 수 없습니다. 작품 목록에서 사진을 먼저 등록해주세요.');
        return;
      }
      const certificateFileName = sold.certificateFileName || safeCertificateFileName(work?.title || sold.title || '작품');
      if (hasGeneratedCertificate(sold)) {
        try {
          downloadBlobFile(await buildCertificateWorkbookBlob(sold, work), certificateFileName);
        } catch (error) {
          options.console.error('certificate download failed', error);
          options.alert('보증서 다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
        return;
      }
      try {
        await buildCertificateWorkbookBlob(sold, work);
        sold.certificateFileName = certificateFileName;
        sold.certificateCreatedAt = new Date().toISOString();
        sold.certificateReady = true;
        sold.certificateVersion = 2;
        options.setStateSoldWorks(soldWorks);
        options.saveExhibition();
        options.renderSalesManagement();
      } catch (error) {
        options.console.error('certificate generation failed', error);
        options.alert('보증서 생성에 실패했습니다. 템플릿 파일과 네트워크 상태를 확인해주세요.');
      }
    }

    async function handleSoldCertificateRemakeAction(soldId) {
      const soldWorks = options.ensureSoldWorksArray();
      const sold = soldWorks.find((item) => item.id === soldId);
      if (!sold || options.normalizeSoldItemType(sold) !== '작품') return;
      if (!sold.saved || !hasGeneratedCertificate(sold)) {
        options.alert('먼저 보증서를 만들어주세요.');
        return;
      }
      const work = getSourceArtworkForSold(sold);
      if (!work) {
        options.alert('작품 목록에서 해당 작품 정보를 찾을 수 없습니다. 작품 목록 데이터를 확인해주세요.');
        return;
      }
      if (!getCertificateImageDataUrl(sold, work)) {
        options.alert('작품 이미지가 없어 보증서를 다시 만들 수 없습니다. 작품 목록에서 사진을 먼저 등록해주세요.');
        return;
      }
      try {
        await buildCertificateWorkbookBlob(sold, work);
        sold.certificateFileName = safeCertificateFileName(work.title || sold.title || '작품');
        sold.certificateCreatedAt = new Date().toISOString();
        sold.certificateReady = true;
        sold.certificateVersion = 2;
        options.setStateSoldWorks(soldWorks);
        options.saveExhibition();
        options.renderSalesManagement();
        options.alert('보증서를 다시 만들었습니다. 보증서 다운로드 버튼에서 새 보증서를 다운로드할 수 있습니다.');
      } catch (error) {
        options.console.error('certificate remake failed', error);
        options.alert('보증서를 다시 만드는 데 실패했습니다. 템플릿 파일과 네트워크 상태를 확인해주세요.');
      }
    }

    return {
      applyCertificateArtistInstagram,
      applyCertificateImageToWorkbookBlob,
      applyCertificateInstagramPlaceholderToWorkbookBlob,
      buildAllCertificatesDownloadFileName,
      buildAllCertificatesWorkbookBlob,
      buildArtworkAnchorXml,
      buildCertificatePngBytesFromDataUrl,
      buildCertificateWorkbookBlob,
      buildWorkbookPrintAreaFormula,
      blobToDataUrl,
      blobToUint8Array,
      canvasToBlob,
      computeContainedImageAnchor,
      dataUrlToUint8Array,
      downloadBlobFile,
      enforceWorksheetPageSetupXml,
      escapeXmlText,
      fetchCertificateTemplateArrayBuffer,
      getArtistInstagramForCertificate,
      getCertificateImageDataUrl,
      getCertificateTemplateArrayBuffer,
      getSourceArtworkForSold,
      getDrawingAnchorFromRowIndex,
      getElementsByLocalName,
      getTemplateInstagramPattern,
      hasGeneratedCertificate,
      handleDownloadAllCertificatesAction,
      handleSoldCertificateAction,
      handleSoldCertificateRemakeAction,
      normalizeCertificateDateText,
      parseSharedStringsText,
      parseWorksheetMetrics,
      parseXmlDocumentOrThrow,
      removeXmlAttribute,
      resolveCertificateImageDataUrl,
      safeCertificateFileName,
      setInlineCellValueByRef,
      setOrReplaceXmlAttribute,
      setSheetCellInlineText,
      shiftCellReferenceRow,
      shiftDrawingAnchorRows,
      shiftRangeReferenceRows,
      splitCellReference,
      duplicateTemplateDrawingAnchorsForPages,
      upsertWorkbookPrintArea,
      upsertWorksheetRowBreaksXml
    };
  }

  return { create };
});