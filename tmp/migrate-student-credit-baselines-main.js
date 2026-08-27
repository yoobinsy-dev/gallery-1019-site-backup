const BASE_URL = 'https://gallery-1019-site.vercel.app';
const APPLY = process.argv.includes('--apply');
const STUDENTS_KEY = 'pottery-students-v1';
const CALENDAR_KEY = 'studio-calendar-state-v1';
const FALLBACK_BASELINE = '2026-08-01';
const SLOT_MINUTES = 30;

function formatDateInput(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function inferBaseline(student) {
  const explicit = String(student?.creditTrackingStartDate || '').trim();
  if (isValidDate(explicit)) {
    return { date: explicit, source: 'existing' };
  }

  const match = String(student?.id || '').match(/^stu-(\d+)-/);
  const createdAtMs = match ? Number(match[1]) : NaN;
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
    return { date: formatDateInput(new Date(createdAtMs)), source: 'student-id-created-at' };
  }

  return { date: FALLBACK_BASELINE, source: 'august-tracking-fallback' };
}

function basisToCount(basis) {
  const match = String(basis || '').match(/\d+/);
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) ? value : 0;
}

function isMonthly(student) {
  return String(student?.tuitionBasis || '').trim() === '월초';
}

function timeToSlot(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(48, Math.floor((hour * 60 + minute) / SLOT_MINUTES)));
}

function getOccurrenceEnd(date, start, end) {
  const base = new Date(`${date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const startSlot = timeToSlot(start);
  let endSlot = timeToSlot(end || start);
  if (endSlot <= startSlot) endSlot = startSlot + 1;
  return new Date(base.getTime() + endSlot * SLOT_MINUTES * 60 * 1000);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function collectCompletedClasses(events, studentName, startDate) {
  const now = new Date();
  const records = [];
  const name = String(studentName || '').trim();

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || String(event.kind || '').trim() !== '수강') continue;
    if (String(event.title || '').trim() !== name || !event.date) continue;

    const push = (date) => {
      const key = String(date || '').trim();
      if (!key || key < startDate) return;
      const endAt = getOccurrenceEnd(key, event.start, event.end);
      if (!endAt || endAt > now) return;
      records.push(`${key}|${event.start || ''}|${event.id || ''}`);
    };

    if (!event.repeatWeekly) {
      push(event.date);
      continue;
    }

    const baseDate = new Date(`${event.date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) continue;
    const skips = new Set(Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : []);
    const repeatEnd = event.repeatEndDate ? new Date(`${event.repeatEndDate}T00:00:00`) : now;
    if (Number.isNaN(repeatEnd.getTime())) continue;

    let cursor = new Date(baseDate);
    while (cursor <= repeatEnd) {
      const key = formatDateInput(cursor);
      if (!skips.has(key)) push(key);
      const endAt = getOccurrenceEnd(key, event.start, event.end);
      if (endAt && endAt > now) break;
      cursor = addDays(cursor, 7);
    }
  }

  return Array.from(new Set(records)).sort();
}

function projectedRemaining(student, events, baseline) {
  if (isMonthly(student)) return null;
  const paymentDate = String(student?.mostRecentPaymentDate || '').trim();
  const startDate = paymentDate || baseline;
  const completed = collectCompletedClasses(events, student?.name, startDate);
  const carry = Number(student?.carryOverBeforePayment || 0);
  const credits = Number(student?.paymentCycleCredits ?? basisToCount(student?.tuitionBasis));
  const manual = Number(student?.manualUsedAdjustment || 0);
  const safeCarry = Number.isFinite(carry) ? carry : 0;
  const safeCredits = Number.isFinite(credits) ? credits : 0;
  const safeManual = Number.isFinite(manual) ? Math.floor(manual) : 0;
  return {
    startDate,
    completedCount: completed.length,
    completed,
    remaining: safeCarry + safeCredits - completed.length - safeManual
  };
}

async function fetchState() {
  const keys = `${STUDENTS_KEY},${CALENDAR_KEY}`;
  const response = await fetch(`${BASE_URL}/api/state?keys=${encodeURIComponent(keys)}`);
  if (!response.ok) throw new Error(`GET failed: ${response.status}`);
  const body = await response.json();
  if (!body?.ok) throw new Error(`GET body failed: ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  const before = await fetchState();
  const students = Array.isArray(before?.data?.[STUDENTS_KEY]) ? before.data[STUDENTS_KEY] : [];
  const events = Array.isArray(before?.data?.[CALENDAR_KEY]?.events) ? before.data[CALENDAR_KEY].events : [];
  const baseUpdatedAt = String(before?.meta?.[STUDENTS_KEY]?.updatedAt || '').trim();
  if (!baseUpdatedAt) throw new Error('Missing students baseUpdatedAt; refusing migration.');

  const changes = [];
  const nextStudents = students.map((student) => {
    const inferred = inferBaseline(student);
    const current = String(student?.creditTrackingStartDate || '').trim();
    const projection = projectedRemaining(student, events, inferred.date);

    if (current === inferred.date) return student;
    changes.push({
      id: String(student?.id || ''),
      name: String(student?.name || ''),
      from: current || null,
      to: inferred.date,
      source: inferred.source,
      paymentDate: String(student?.mostRecentPaymentDate || '') || null,
      projection
    });
    return { ...student, creditTrackingStartDate: inferred.date };
  });

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    baseUpdatedAt,
    studentsTotal: students.length,
    changedCount: changes.length,
    unchangedCount: students.length - changes.length,
    changes
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ...report, applied: false }, null, 2));
    return;
  }

  if (changes.length === 0) {
    console.log(JSON.stringify({ ...report, applied: false, message: 'No changes required.' }, null, 2));
    return;
  }

  const response = await fetch(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-cloud-client-id': 'credit-baseline-migration-20260822'
    },
    body: JSON.stringify({
      key: STUDENTS_KEY,
      value: nextStudents,
      baseUpdatedAt,
      syncMode: 'full'
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.ok) {
    throw new Error(`PUT failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const after = await fetchState();
  const saved = Array.isArray(after?.data?.[STUDENTS_KEY]) ? after.data[STUDENTS_KEY] : [];
  const savedById = new Map(saved.map((student) => [String(student?.id || ''), student]));
  const verification = changes.map((change) => {
    const student = savedById.get(change.id);
    return {
      id: change.id,
      name: change.name,
      expected: change.to,
      actual: String(student?.creditTrackingStartDate || ''),
      ok: String(student?.creditTrackingStartDate || '') === change.to
    };
  });
  const verificationOk = verification.every((item) => item.ok);
  if (!verificationOk) throw new Error(`Verification failed: ${JSON.stringify(verification)}`);

  console.log(JSON.stringify({
    ...report,
    applied: true,
    putMeta: body.meta || null,
    verifiedUpdatedAt: String(after?.meta?.[STUDENTS_KEY]?.updatedAt || ''),
    verification
  }, null, 2));
})();
