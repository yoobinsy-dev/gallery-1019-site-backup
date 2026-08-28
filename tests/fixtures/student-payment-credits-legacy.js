function getManualUsedAdjustmentLegacy(student) {
  const parsed = Number(student?.manualUsedAdjustment || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed);
}

function getRemainingClassCountLegacy({ student, completedSincePayment, basisCount }) {
  const carry = Number(student?.carryOverBeforePayment || 0);
  const cycleCredits = Number(student?.paymentCycleCredits ?? basisCount ?? 0);
  const used = Number(completedSincePayment || 0);
  const safeCarry = Number.isFinite(carry) ? carry : 0;
  const safeCycle = Number.isFinite(cycleCredits) ? cycleCredits : 0;
  const safeUsed = Number.isFinite(used) ? used : 0;
  return safeCarry + safeCycle - safeUsed - getManualUsedAdjustmentLegacy(student);
}

function computeCarryOverForNewPaymentCycleLegacy({ nextPaymentDate, previousRemaining, sameDayCompleted }) {
  if (!String(nextPaymentDate || '').trim()) return 0;
  const completed = Number(sameDayCompleted) || 0;
  const balanceAfterSameDayClasses = Number(previousRemaining) || 0;
  const balanceBeforeSameDayClasses = balanceAfterSameDayClasses + completed;
  const outstandingBalance = Math.min(0, balanceBeforeSameDayClasses);
  const oldCreditsAvailable = Math.max(0, balanceBeforeSameDayClasses);
  const oldPlanClasses = Math.min(completed, oldCreditsAvailable);
  return outstandingBalance + oldPlanClasses;
}

function getStudentPaymentCycleSizeLegacy({ student, basisCount }) {
  const direct = Number(student?.paymentCycleCredits);
  const fromBasis = Number(basisCount);
  const safeDirect = Number.isFinite(direct) && direct > 0 ? Math.floor(direct) : 0;
  const safeBasis = Number.isFinite(fromBasis) && fromBasis > 0 ? Math.floor(fromBasis) : 0;
  return Math.max(1, safeDirect, safeBasis);
}

function getStudentPaymentHistoryLegacy(student) {
  const history = Array.isArray(student?.paymentHistory) ? student.paymentHistory.slice() : [];
  const recent = String(student?.mostRecentPaymentDate || '').trim();
  if (recent && !history.includes(recent)) history.push(recent);
  return history.map((date) => String(date || '').trim()).filter(Boolean).sort((a, b) => b.localeCompare(a));
}

function normalizePaymentRecordsLegacy({ student, isValidDateString, paymentCycleSize }) {
  const records = Array.isArray(student?.paymentRecords) ? student.paymentRecords : [];
  const normalized = records.map((record) => ({
    id: String(record?.id || '').trim() || `legacy-payment-${String(record?.date || '').trim()}`,
    date: String(record?.date || '').trim(),
    tuition: Number(record?.tuition) || 0,
    basis: String(record?.basis || '').trim(),
    credits: Math.max(0, Math.floor(Number(record?.credits) || 0))
  })).filter((record) => isValidDateString(record.date));
  getStudentPaymentHistoryLegacy(student).forEach((date) => {
    if (normalized.some((record) => record.date === date)) return;
    const isLatest = date === String(student?.mostRecentPaymentDate || '').trim();
    normalized.push({
      id: `legacy-payment-${date}`,
      date,
      tuition: isLatest ? Number(student?.tuition) || 0 : 0,
      basis: isLatest ? String(student?.tuitionBasis || '').trim() : '',
      credits: isLatest ? paymentCycleSize : 0
    });
  });
  return normalized.sort((a, b) => b.date.localeCompare(a.date));
}

function buildPaymentClassGroupsLegacy(options) {
  const student = options.student;
  const paymentRecordByDate = new Map(options.paymentRecords.map((record) => [record.date, record]));
  if (options.isMonthlyStart) {
    const monthly = buildMonthlyStartPaymentClassGroupsLegacy(options.paymentDates, options.classRecords);
    monthly.groups.forEach((group) => {
      group.paymentRecord = paymentRecordByDate.get(group.paymentDate) || null;
    });
    return monthly;
  }
  const sortedPaymentsAsc = options.paymentDates.map((date) => String(date || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const workingClasses = options.classRecords.map((record) => ({ ...record, __assignedPayment: false })).sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  reservePriorCycleClassesLegacy({
    sortedPaymentsAsc,
    workingClasses,
    manualUsedAdjustment: options.manualUsedAdjustment,
    carryOverBeforePayment: student?.carryOverBeforePayment
  });
  const groupsAsc = [];
  sortedPaymentsAsc.forEach((paymentDate, index) => {
    const nextPaymentDate = sortedPaymentsAsc[index + 1] || '';
    const paymentRecord = paymentRecordByDate.get(paymentDate) || null;
    const recordCredits = Number(paymentRecord?.credits);
    const cycleSize = Number.isFinite(recordCredits) && recordCredits > 0 ? Math.floor(recordCredits) : options.paymentCycleSize;
    const assigned = [];
    let paidCount = 0;
    const assignRecord = (record) => {
      record.__assignedPayment = true;
      assigned.push(record);
      paidCount += 1;
    };
    for (const record of workingClasses) {
      const classDate = String(record?.date || '');
      if (!classDate || record.__assignedPayment || record.__priorCycle || classDate < paymentDate) continue;
      if (nextPaymentDate && classDate >= nextPaymentDate) continue;
      assignRecord(record);
      if (paidCount >= cycleSize) break;
    }
    if (paidCount < cycleSize && nextPaymentDate) {
      for (const record of workingClasses) {
        const classDate = String(record?.date || '');
        if (!classDate || record.__assignedPayment || record.__priorCycle || classDate !== nextPaymentDate) continue;
        assignRecord(record);
        if (paidCount >= cycleSize) break;
      }
    }
    groupsAsc.push({ paymentDate, paymentRecord, classRecords: assigned });
  });
  return {
    groups: groupsAsc.slice().sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''))),
    unassigned: workingClasses.filter((record) => !record.__assignedPayment)
  };
}

function reservePriorCycleClassesLegacy(options) {
  const { sortedPaymentsAsc, workingClasses } = options;
  if (!workingClasses.length || !sortedPaymentsAsc.length) return;
  const firstPaymentDate = String(sortedPaymentsAsc[0] || '').trim();
  let openingCredits = Math.max(0, -(Number(options.manualUsedAdjustment) || 0));
  for (let index = 0; index < workingClasses.length && openingCredits > 0; index += 1) {
    const record = workingClasses[index];
    const classDate = String(record?.date || '').trim();
    if (!classDate || classDate < firstPaymentDate) continue;
    record.__priorCycle = true;
    openingCredits -= 1;
  }
  const latestPaymentDate = String(sortedPaymentsAsc[sortedPaymentsAsc.length - 1] || '').trim();
  let sameDayPriorCycleCount = Math.max(0, Math.floor(Number(options.carryOverBeforePayment) || 0));
  for (let index = 0; index < workingClasses.length && sameDayPriorCycleCount > 0; index += 1) {
    const record = workingClasses[index];
    if (record.__priorCycle || String(record?.date || '').trim() !== latestPaymentDate) continue;
    record.__priorCycle = true;
    sameDayPriorCycleCount -= 1;
  }
}

function buildMonthlyStartPaymentClassGroupsLegacy(paymentDates, classRecords) {
  const sortedPaymentsAsc = paymentDates.map((date) => String(date || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const monthToPaymentDate = new Map();
  const paymentEntries = [];
  sortedPaymentsAsc.forEach((paymentDate) => {
    const parsed = new Date(`${paymentDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    const currentMonthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    let targetMonthKey = currentMonthKey;
    if (parsed.getDate() >= 24 && monthToPaymentDate.has(currentMonthKey)) {
      const nextMonth = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
      targetMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!monthToPaymentDate.has(targetMonthKey)) monthToPaymentDate.set(targetMonthKey, paymentDate);
    paymentEntries.push({ paymentDate, targetMonthKey });
  });
  const groupsByPaymentDate = new Map(paymentEntries.map((entry) => [entry.paymentDate, []]));
  const unassigned = [];
  classRecords.slice().sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`)).forEach((record) => {
    const classDate = String(record?.date || '').trim();
    if (!classDate) return;
    const bucket = groupsByPaymentDate.get(monthToPaymentDate.get(classDate.slice(0, 7)));
    if (!bucket) unassigned.push(record);
    else bucket.push(record);
  });
  return {
    groups: Array.from(groupsByPaymentDate.entries()).map(([paymentDate, records]) => ({ paymentDate, classRecords: records })).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
    unassigned
  };
}

module.exports = {
  buildPaymentClassGroupsLegacy,
  computeCarryOverForNewPaymentCycleLegacy,
  getRemainingClassCountLegacy,
  normalizePaymentRecordsLegacy
};
