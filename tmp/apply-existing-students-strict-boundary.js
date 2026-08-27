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

function computeProjectedCarry(student, classRecords) {
  const currentCarry = Number.isFinite(Number(student?.carryOverBeforePayment))
    ? Number(student?.carryOverBeforePayment)
    : 0;

  const paymentDates = getStudentPaymentHistoryAsc(student);
  const latestPaymentDate = paymentDates[paymentDates.length - 1] || '';
  if (!latestPaymentDate) {
    return { projectedCarry: currentCarry, reason: 'no-latest-payment' };
  }

  const previousPaymentDate = paymentDates.length >= 2 ? paymentDates[paymentDates.length - 2] : '';
  if (!previousPaymentDate || previousPaymentDate === latestPaymentDate) {
    return { projectedCarry: currentCarry, reason: 'no-previous-payment' };
  }

  const cycleSize = Math.max(1, basisToCount(student?.tuitionBasis));
  const previousWindowUsed = countClassesInRange(classRecords, previousPaymentDate, latestPaymentDate);
  const sameDayCount = countClassesInRange(
    classRecords,
    latestPaymentDate,
    formatDateInput(addDays(new Date(`${latestPaymentDate}T00:00:00`), 1))
  );

  const shortfall = Math.max(0, cycleSize - previousWindowUsed);
  const oldCycleSameDayUsed = Math.min(shortfall, sameDayCount);
  const projectedCarry = Math.max(0, currentCarry) + oldCycleSameDayUsed;

  return {
    projectedCarry,
    reason: 'recomputed',
    previousPaymentDate,
    latestPaymentDate,
    cycleSize,
    previousWindowUsed,
    sameDayCount,
    oldCycleSameDayUsed
  };
}

(async () => {
  const getUrl = `${BASE_URL}/api/state?keys=${encodeURIComponent('pottery-students-v1,studio-calendar-state-v1')}`;
  const getRes = await fetch(getUrl);
  if (!getRes.ok) throw new Error(`GET state failed: ${getRes.status}`);

  const stateBody = await getRes.json();
  const students = Array.isArray(stateBody?.data?.['pottery-students-v1']) ? stateBody.data['pottery-students-v1'] : [];
  const events = Array.isArray(stateBody?.data?.['studio-calendar-state-v1']?.events) ? stateBody.data['studio-calendar-state-v1'].events : [];
  const baseUpdatedAt = String(stateBody?.meta?.['pottery-students-v1']?.updatedAt || '').trim();

  const changes = [];
  const nextStudents = students.map((student) => {
    if (isMonthlyStartBasis(student?.tuitionBasis)) return student;

    const classRecords = collectStudentClassOccurrences(events, student?.name);
    const result = computeProjectedCarry(student, classRecords);
    const currentCarry = Number.isFinite(Number(student?.carryOverBeforePayment))
      ? Number(student?.carryOverBeforePayment)
      : 0;

    if (result.projectedCarry !== currentCarry) {
      changes.push({
        id: String(student?.id || ''),
        name: String(student?.name || '').trim(),
        currentCarry,
        projectedCarry: result.projectedCarry,
        detail: result
      });
      return {
        ...student,
        carryOverBeforePayment: result.projectedCarry
      };
    }

    return student;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUpdatedAt,
    studentsTotal: students.length,
    changedCount: changes.length,
    changes
  };

  if (changes.length === 0) {
    console.log(JSON.stringify({ ...report, applied: false, message: 'No changes required.' }, null, 2));
    return;
  }

  const putRes = await fetch(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      key: 'pottery-students-v1',
      value: nextStudents,
      baseUpdatedAt
    })
  });

  const putBody = await putRes.json().catch(() => ({}));
  if (!putRes.ok || !putBody?.ok) {
    throw new Error(`PUT failed: ${putRes.status} ${JSON.stringify(putBody)}`);
  }

  console.log(JSON.stringify({
    ...report,
    applied: true,
    putStatus: putRes.status,
    putMeta: putBody?.meta || null
  }, null, 2));
})();
