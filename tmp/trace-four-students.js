const BASE_URL = 'https://gallery-1019-site-nine.vercel.app';
const TARGET_NAMES = ['김용상', '김현교', '박지은', '최복희'];

function basisToCount(basis) {
  const match = String(basis || '').match(/\d+/);
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) ? Math.floor(value) : 0;
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

function collectStudentClassOccurrences(events, studentName) {
  const name = String(studentName || '').trim();
  if (!name) return [];

  const now = new Date();
  const records = [];

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event || event.kind !== '수강') return;
    if (String(event.title || '').trim() !== name) return;
    if (!event.date) return;

    const classType = String(event.classType || '수강').trim();

    if (!event.repeatWeekly) {
      const key = String(event.date || '').trim();
      const d = new Date(`${key}T00:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
      if (!endAt || endAt > now) return;
      records.push({ date: key, start: event.start || '', end: event.end || '', classType });
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
        records.push({ date: key, start: event.start || '', end: event.end || '', classType });
      }
      cursor = addDays(cursor, 7);
    }
  });

  records.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return records;
}

function getStudentPaymentHistory(student) {
  const history = Array.isArray(student?.paymentHistory) ? student.paymentHistory.slice() : [];
  const recent = String(student?.mostRecentPaymentDate || '').trim();
  if (recent && !history.includes(recent)) history.push(recent);
  return history
    .map((d) => String(d || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function countInRange(records, startInclusive, endExclusive) {
  return records.filter((r) => {
    if (!r?.date) return false;
    if (r.date < startInclusive) return false;
    if (endExclusive && r.date >= endExclusive) return false;
    return true;
  }).length;
}

function listDatesInRange(records, startInclusive, endExclusive) {
  return records
    .filter((r) => {
      if (!r?.date) return false;
      if (r.date < startInclusive) return false;
      if (endExclusive && r.date >= endExclusive) return false;
      return true;
    })
    .map((r) => `${r.date} ${r.start}~${r.end}`);
}

function traceStudent(student, events) {
  const cycleSize = Math.max(1, basisToCount(student?.tuitionBasis));
  const paymentDatesAsc = getStudentPaymentHistory(student);
  const latestPaymentDate = paymentDatesAsc[paymentDatesAsc.length - 1] || '';
  const previousPaymentDate = paymentDatesAsc.length >= 2 ? paymentDatesAsc[paymentDatesAsc.length - 2] : '';

  const classes = collectStudentClassOccurrences(events, student?.name);
  const sameDayClasses = classes.filter((r) => r.date === latestPaymentDate);

  let previousWindowCount = null;
  let previousWindowClasses = [];
  let oldCycleSameDayUsed = 0;
  let newCycleSameDayUsed = sameDayClasses.length;
  let rationale = '';

  if (!latestPaymentDate) {
    rationale = 'No latest payment date on record.';
  } else if (!previousPaymentDate) {
    rationale = 'No previous payment exists, so same-day class belongs to current cycle.';
  } else {
    previousWindowCount = countInRange(classes, previousPaymentDate, latestPaymentDate);
    previousWindowClasses = listDatesInRange(classes, previousPaymentDate, latestPaymentDate);
    const shortfallBeforeBoundary = Math.max(0, cycleSize - previousWindowCount);
    oldCycleSameDayUsed = Math.min(shortfallBeforeBoundary, sameDayClasses.length);
    newCycleSameDayUsed = Math.max(0, sameDayClasses.length - oldCycleSameDayUsed);
    rationale = `Previous window count=${previousWindowCount}, cycleSize=${cycleSize}, shortfall=${shortfallBeforeBoundary}.`;
  }

  return {
    name: String(student?.name || '').trim(),
    tuitionBasis: String(student?.tuitionBasis || '').trim(),
    cycleSize,
    paymentDatesAsc,
    previousPaymentDate,
    latestPaymentDate,
    sameDayClassCount: sameDayClasses.length,
    sameDayClasses: sameDayClasses.map((r) => `${r.date} ${r.start}~${r.end}`),
    previousWindowCount,
    previousWindowClasses,
    oldCycleSameDayUsed,
    newCycleSameDayUsed,
    rationale,
    currentStored: {
      carryOverBeforePayment: Number(student?.carryOverBeforePayment || 0),
      paymentCycleCredits: Number(student?.paymentCycleCredits || 0),
      manualUsedAdjustment: Number(student?.manualUsedAdjustment || 0)
    }
  };
}

(async () => {
  const url = `${BASE_URL}/api/state?keys=${encodeURIComponent('pottery-students-v1,studio-calendar-state-v1')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);

  const body = await res.json();
  const data = body?.data || {};
  const students = Array.isArray(data['pottery-students-v1']) ? data['pottery-students-v1'] : [];
  const events = Array.isArray(data['studio-calendar-state-v1']?.events) ? data['studio-calendar-state-v1'].events : [];

  const traces = TARGET_NAMES.map((name) => {
    const student = students.find((s) => String(s?.name || '').trim() === name);
    if (!student) {
      return { name, missing: true };
    }
    return traceStudent(student, events);
  });

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), traces }, null, 2));
})();
