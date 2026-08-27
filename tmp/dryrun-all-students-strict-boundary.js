const BASE_URL = 'https://gallery-1019-site-nine.vercel.app';

function basisToCount(basis) {
  const match = String(basis || '').match(/\d+/);
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) ? Math.floor(value) : 0;
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

function collectStudentClassOccurrences(events, studentName) {
  const name = String(studentName || '').trim();
  if (!name) return [];

  const now = new Date();
  const records = [];

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || event.kind !== '수강') return;
    if (String(event.title || '').trim() !== name) return;
    if (!event.date) return;

    if (!event.repeatWeekly) {
      const key = String(event.date || '').trim();
      const d = new Date(`${key}T00:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
      if (!endAt || endAt > now) return;
      records.push({ date: key, start: event.start || '', end: event.end || '' });
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
      if (!skipDates.includes(key)) {
        records.push({ date: key, start: event.start || '', end: event.end || '' });
      }
      cursor = addDays(cursor, 7);
    }
  });

  records.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return records;
}

function getStudentPaymentHistoryAsc(student) {
  const history = Array.isArray(student?.paymentHistory) ? student.paymentHistory.slice() : [];
  const recent = String(student?.mostRecentPaymentDate || '').trim();
  if (recent && !history.includes(recent)) history.push(recent);
  return history
    .map((d) => String(d || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function countClassesInRange(records, startInclusive, endExclusive) {
  return records.filter((r) => {
    if (!r?.date) return false;
    if (r.date < startInclusive) return false;
    if (endExclusive && r.date >= endExclusive) return false;
    return true;
  }).length;
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

  students.forEach((student) => {
    if (isMonthlyStartBasis(student?.tuitionBasis)) return;

    const paymentDates = getStudentPaymentHistoryAsc(student);
    const latestPaymentDate = paymentDates[paymentDates.length - 1] || '';
    if (!latestPaymentDate) return;

    const previousPaymentDate = paymentDates.length >= 2 ? paymentDates[paymentDates.length - 2] : '';
    const cycle = Number(student?.paymentCycleCredits ?? basisToCount(student?.tuitionBasis) ?? 0);
    const safeCycle = Number.isFinite(cycle) ? cycle : 0;

    const carry = Number(student?.carryOverBeforePayment || 0);
    const safeCarry = Number.isFinite(carry) ? carry : 0;

    const manual = getManualUsedAdjustment(student);

    const classRecords = collectStudentClassOccurrences(events, student?.name);
    const usedSinceLatest = countClassesInRange(classRecords, latestPaymentDate, '');
    const currentRemaining = safeCarry + safeCycle - usedSinceLatest - manual;

    let projectedCarry = safeCarry;
    let oldCycleSameDayUsed = 0;
    let sameDayCount = 0;

    if (previousPaymentDate) {
      const prevWindowCount = countClassesInRange(classRecords, previousPaymentDate, latestPaymentDate);
      sameDayCount = countClassesInRange(classRecords, latestPaymentDate, formatDateInput(addDays(new Date(`${latestPaymentDate}T00:00:00`), 1)));
      const shortfall = Math.max(0, Math.max(1, basisToCount(student?.tuitionBasis)) - prevWindowCount);
      oldCycleSameDayUsed = Math.min(shortfall, sameDayCount);
      projectedCarry = Math.max(0, safeCarry) + oldCycleSameDayUsed;
    }

    const projectedRemaining = currentRemaining + (projectedCarry - safeCarry);
    const delta = projectedRemaining - currentRemaining;

    if (delta !== 0) {
      changes.push({
        name: String(student?.name || '').trim() || '(unknown)',
        tuitionBasis: String(student?.tuitionBasis || '').trim(),
        latestPaymentDate,
        previousPaymentDate,
        currentRemaining,
        projectedRemaining,
        delta,
        currentCarry: safeCarry,
        projectedCarry,
        oldCycleSameDayUsed,
        sameDayCount
      });
    }
  });

  changes.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));

  const report = {
    generatedAt: new Date().toISOString(),
    studentsTotal: students.length,
    changedCount: changes.length,
    unchangedCount: students.length - changes.length,
    changes
  };

  console.log(JSON.stringify(report, null, 2));
})();
