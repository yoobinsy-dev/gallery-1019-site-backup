function calculateUsageSummary({ usageRows, maxHours }) {
  const usageHours = roundHour(
    (Array.isArray(usageRows) ? usageRows : [])
      .reduce((sum, row) => sum + Number(row?.durationHours || 0), 0)
  );
  return {
    usageHours,
    remainingHours: Math.max(0, roundHour(Number(maxHours) - usageHours))
  };
}

function getCurrentCycleRange(startDateStr, nowDate) {
  const anchor = new Date(`${startDateStr}T00:00:00`);
  const now = new Date(nowDate || new Date());

  if (Number.isNaN(anchor.getTime())) {
    const today = formatDateInput(now);
    return { start: today, end: formatDateInput(addMonthKeepDay(now, 1)) };
  }

  let cycleStart = new Date(anchor);
  let cycleEnd = addMonthKeepDay(cycleStart, 1);
  if (now >= cycleStart) {
    while (now >= cycleEnd) {
      cycleStart = cycleEnd;
      cycleEnd = addMonthKeepDay(cycleStart, 1);
    }
  }
  return { start: formatDateInput(cycleStart), end: formatDateInput(cycleEnd) };
}

function getElapsedCycleCount(startDateStr, nowDate) {
  const anchor = new Date(`${String(startDateStr || '').trim()}T00:00:00`);
  const now = new Date(nowDate || new Date());
  if (Number.isNaN(anchor.getTime()) || now < anchor) return 0;

  let count = 1;
  let cycleStart = new Date(anchor);
  let cycleEnd = addMonthKeepDay(cycleStart, 1);
  while (now >= cycleEnd) {
    count += 1;
    cycleStart = cycleEnd;
    cycleEnd = addMonthKeepDay(cycleStart, 1);
  }
  return count;
}

function isPaymentRequired({ entry, asOfDate }) {
  if (Number(entry?.monthlyFee || 0) <= 0) return false;
  const requiredCycleCount = getElapsedCycleCount(entry?.startDate, asOfDate);
  if (requiredCycleCount <= 0) return false;
  const todayKey = formatDateInput(new Date(asOfDate || new Date()));
  const paidDates = getEffectivePaymentDates(entry)
    .filter((dateKey) => String(dateKey || '') <= todayKey);
  return paidDates.length < requiredCycleCount;
}

function getEffectivePaymentDates(entry) {
  const history = normalizePaymentHistory(entry?.paymentHistory);
  const latest = normalizeDateInput(entry?.lastPaymentDate || '');
  const dates = new Set(history);
  if (latest) dates.add(latest);
  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

function normalizePaymentHistory(paymentHistory) {
  const history = Array.isArray(paymentHistory) ? paymentHistory : [];
  return Array.from(new Set(
    history.map((value) => normalizeDateInput(value)).filter(Boolean)
  )).sort((a, b) => b.localeCompare(a));
}

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateInput(date);
}

function formatDateInput(date) {
  const normalized = new Date(date);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`;
}

function addMonthKeepDay(date, diff) {
  const source = new Date(date);
  const year = source.getFullYear();
  const month = source.getMonth();
  const day = source.getDate();
  const firstOfTarget = new Date(year, month + Number(diff || 0), 1);
  const maxDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(day, maxDay));
}

function roundHour(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

module.exports = {
  calculateUsageSummary,
  getCurrentCycleRange,
  getEffectivePaymentDates,
  getElapsedCycleCount,
  isPaymentRequired,
  normalizePaymentHistory
};