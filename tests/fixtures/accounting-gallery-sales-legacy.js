function buildGallerySalesAutoEntriesLegacy({ exhibitions, itemType, monthKey, helpers }) {
  const entries = [];

  exhibitions.forEach((exhibition) => {
    if (!exhibition || typeof exhibition !== 'object') return;

    const endDate = getExhibitionEndDate(exhibition, helpers);
    if (!endDate || !endDate.startsWith(`${monthKey}-`)) return;

    const soldWorks = getExhibitionSoldRecords(exhibition, helpers);
    let sum = 0;

    soldWorks.forEach((sold) => {
      const soldType = helpers.normalizeSoldItemType(sold);
      if (soldType !== itemType) return;
      const unit = helpers.parsePriceToNumber(sold.price);
      const quantity = soldType === '굿즈' ? helpers.parseSoldQuantity(sold.soldQuantity) : 1;
      sum += unit * quantity;
    });

    if (sum <= 0) return;

    const title = String(exhibition.title || exhibition.name || '전시').trim() || '전시';
    entries.push({
      id: `auto-sales-${itemType}-${exhibition.id || title}-${endDate}`,
      source: 'auto',
      side: 'revenue',
      category: itemType === '작품' ? '작품 판매' : '굿즈 판매',
      date: endDate,
      title,
      amount: helpers.roundWon(sum),
      fixed: false,
      tab: 'gallery'
    });
  });

  entries.sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });

  return entries;
}

function getExhibitionEndDate(exhibition, helpers) {
  if (!exhibition || typeof exhibition !== 'object') return '';
  return helpers.normalizeDateInput(exhibition.endDate || exhibition.date || '');
}

function getExhibitionSoldRecords(exhibition, helpers) {
  if (!exhibition || typeof exhibition !== 'object') return [];
  const soldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : [];
  if (soldWorks.length > 0) {
    return dedupeSoldRecords(soldWorks.map((item) => ({ ...item })), helpers);
  }
  const artSoldWorks = Array.isArray(exhibition.artSoldWorks) ? exhibition.artSoldWorks : [];
  const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods : [];
  return dedupeSoldRecords([
    ...artSoldWorks.map((item) => ({ ...item, __forcedItemType: '작품' })),
    ...soldGoods.map((item) => ({ ...item, __forcedItemType: '굿즈' }))
  ], helpers);
}

function dedupeSoldRecords(records, helpers) {
  const seen = new Set();
  const deduped = [];
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') return;
    const key = getSoldRecordIdentity(record, index, helpers);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(record);
  });
  return deduped;
}

function getSoldRecordIdentity(record, _index, helpers) {
  const id = String(record?.id || '').trim();
  if (id) return `id:${id}`;
  const workId = Number(record?.workId);
  const title = helpers.normalizeNameKey(record?.title || '');
  const soldDate = helpers.normalizeDateInput(record?.soldDate || '');
  const soldDateTime = String(record?.soldDateTime || '').trim();
  const itemType = helpers.normalizeSoldItemType(record);
  const price = helpers.parsePriceToNumber(record?.price);
  const qty = helpers.parseSoldQuantity(record?.soldQuantity);
  const base = Number.isFinite(workId) && workId > 0 ? `work:${workId}` : `title:${title}`;
  return `${base}|${itemType}|${soldDate}|${soldDateTime}|${price}|${qty}`;
}

module.exports = { buildGallerySalesAutoEntriesLegacy };