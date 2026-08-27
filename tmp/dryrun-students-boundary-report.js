const BASE_URL = 'https://gallery-1019-site-nine.vercel.app';

function basisToCount(basis) {
  const match = String(basis || '').match(/\d+/);
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) ? value : 0;
}

function isMonthlyStartBasis(basis) {
  return String(basis || '').trim() === '월초';
}

function formatDateInput(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date, diff) {
  const next = new Date(date);
  next.setDate(next.getDate() + diff);
  return next;
}

function timeToSlot(timeStr) {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(48, Math.floor((h * 60 + m) / 30)));
}

function getOccurrenceEndDateTime(dateStr, startTime, endTime) {
  const date = String(dateStr || '').trim();
  if (!date) return null;
  const baseDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;
  const startSlot = timeToSlot(startTime || '00:00');
  let endSlot = timeToSlot(endTime || startTime || '00:00');
  if (endSlot <= startSlot) endSlot = startSlot + 1;
  return new Date(baseDate.getTime() + (endSlot * 30 * 60 * 1000));
}

function getManualUsedAdjustment(student) {
  const parsed = Number(student?.manualUsedAdjustment || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function getCompletedClassCountSinceInRange(events, studentName, startDateInclusive, endDateExclusive) {
  const name = String(studentName || '').trim();
  const start = String(startDateInclusive || '').trim();
  const end = String(endDateExclusive || '').trim();
  if (!name || !start) return 0;

  const startDate = new Date(`${start}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return 0;
  const endDate = end ? new Date(`${end}T00:00:00`) : null;
  if (end && (!endDate || Number.isNaN(endDate.getTime()))) return 0;

  const now = new Date();
  let completedCount = 0;

  events.forEach((event) => {
    if (!event || event.kind !== '수강') return;
    if (String(event.title || '').trim() !== name) return;
    if (!event.date) return;

    if (!event.repeatWeekly) {
      const key = String(event.date || '').trim();
      const d = new Date(`${key}T00:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
      if (!endAt || endAt > now) return;
      if (d < startDate) return;
      if (endDate && d >= endDate) return;
      completedCount += 1;
      return;
    }

    const baseDate = new Date(`${event.date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return;

    const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
    const repeatEnd = event.repeatEndDate ? new Date(`${event.repeatEndDate}T00:00:00`) : now;
    if (Number.isNaN(repeatEnd.getTime())) return;

    let cursor = new Date(baseDate);
    while (cursor <= repeatEnd) {
      const key = formatDateInput(cursor);
      const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
      if (!endAt || endAt > now) break;
      if (!skipDates.includes(key) && cursor >= startDate && (!endDate || cursor < endDate)) {
        completedCount += 1;
      }
      cursor = addDays(cursor, 7);
    }
  });

  return completedCount;
}

function getCompletedClassCountOnDate(events, studentName, targetDate) {
  const t = String(targetDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 0;
  const next = formatDateInput(addDays(new Date(`${t}T00:00:00`), 1));
  return getCompletedClassCountSinceInRange(events, studentName, t, next);
}

function getCompletedClassCountSince(events, studentName, paymentDate) {
  return getCompletedClassCountSinceInRange(events, studentName, paymentDate, '');
}

(async () => {
  const url = `${BASE_URL}/api/state?keys=${encodeURIComponent('pottery-students-v1,studio-calendar-state-v1')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
  const body = await res.json();
  const data = body?.data || {};
  const students = Array.isArray(data['pottery-students-v1']) ? data['pottery-students-v1'] : [];
  const events = Array.isArray(data['studio-calendar-state-v1']?.events) ? data['studio-calendar-state-v1'].events : [];

  const changes = [];
  for (const student of students) {
    if (isMonthlyStartBasis(student?.tuitionBasis)) continue;
    const paymentDate = String(student?.mostRecentPaymentDate || '').trim();
    if (!paymentDate) continue;

    const carry = Number(student?.carryOverBeforePayment || 0);
    const cycle = Number(student?.paymentCycleCredits ?? basisToCount(student?.tuitionBasis) ?? 0);
    const used = Number(getCompletedClassCountSince(events, student?.name, paymentDate) || 0);
    const manual = Number(getManualUsedAdjustment(student) || 0);

    const safeCarry = Number.isFinite(carry) ? carry : 0;
    const safeCycle = Number.isFinite(cycle) ? cycle : 0;
    const currentRemaining = safeCarry + safeCycle - used - manual;

    const sameDayCompleted = getCompletedClassCountOnDate(events, student?.name, paymentDate);
    const beforeDayRemainingApprox = safeCarry + sameDayCompleted;
    const oldCycleSameDayCount = beforeDayRemainingApprox > 0
      ? Math.min(Math.floor(beforeDayRemainingApprox), sameDayCompleted)
      : 0;
    const projectedCarry = Math.max(0, safeCarry) + oldCycleSameDayCount;
    const projectedRemaining = currentRemaining + (projectedCarry - safeCarry);

    const delta = projectedRemaining - currentRemaining;
    if (delta !== 0) {
      changes.push({
        name: String(student?.name || '').trim() || '(unknown)',
        tuitionBasis: String(student?.tuitionBasis || '').trim(),
        paymentDate,
        currentRemaining,
        projectedRemaining,
        delta,
        currentCarry: safeCarry,
        projectedCarry,
        sameDayCompleted
      });
    }
  }

  changes.sort((a, b) => {
    const ad = Math.abs(Number(a.delta || 0));
    const bd = Math.abs(Number(b.delta || 0));
    if (bd !== ad) return bd - ad;
    return String(a.name).localeCompare(String(b.name), 'ko');
  });

  const report = {
    generatedAt: new Date().toISOString(),
    studentsTotal: students.length,
    changedCount: changes.length,
    unchangedCount: students.length - changes.length,
    changes
  };

  console.log(JSON.stringify(report, null, 2));
})();
