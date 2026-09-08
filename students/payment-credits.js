(function initializeStudentPaymentCredits(root) {
  'use strict';

  function getRemainingClassCount({ student, completedSincePayment, basisCount }) {
    const carry = Number(student?.carryOverBeforePayment || 0);
    const cycleCredits = Number(student?.paymentCycleCredits ?? basisCount ?? 0);
    const used = Number(completedSincePayment || 0);

    const safeCarry = Number.isFinite(carry) ? carry : 0;
    const safeCycle = Number.isFinite(cycleCredits) ? cycleCredits : 0;
    const safeUsed = Number.isFinite(used) ? used : 0;
    return safeCarry + safeCycle - safeUsed - getManualUsedAdjustment(student);
  }

  function getManualUsedAdjustment(student) {
    const parsed = Number(student?.manualUsedAdjustment || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.floor(parsed);
  }

  function computeCarryOverForNewPaymentCycle({ nextPaymentDate, previousRemaining, sameDayCompleted }) {
    const nextDate = String(nextPaymentDate || '').trim();
    if (!nextDate) return 0;

    const completed = Number(sameDayCompleted) || 0;
    const balanceAfterSameDayClasses = Number(previousRemaining) || 0;
    const balanceBeforeSameDayClasses = balanceAfterSameDayClasses + completed;
    const outstandingBalance = Math.min(0, balanceBeforeSameDayClasses);
    const oldCreditsAvailable = Math.max(0, balanceBeforeSameDayClasses);
    const oldPlanClasses = Math.min(completed, oldCreditsAvailable);
    return outstandingBalance + oldPlanClasses;
  }

  function getStudentPaymentCycleSize({ student, basisCount }) {
    const direct = Number(student?.paymentCycleCredits);
    const fromBasis = Number(basisCount);
    const safeDirect = Number.isFinite(direct) && direct > 0 ? Math.floor(direct) : 0;
    const safeBasis = Number.isFinite(fromBasis) && fromBasis > 0 ? Math.floor(fromBasis) : 0;
    return safeDirect || safeBasis || 1;
  }

  function getStudentPaymentHistory(student) {
    const history = Array.isArray(student?.paymentHistory) ? student.paymentHistory.slice() : [];
    const recent = String(student?.mostRecentPaymentDate || '').trim();
    if (recent && !history.includes(recent)) history.push(recent);
    return history
      .map((date) => String(date || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
  }

  function normalizePaymentRecords({ student, isValidDateString, paymentCycleSize }) {
    const records = Array.isArray(student?.paymentRecords) ? student.paymentRecords : [];
    const normalized = records
      .map((record) => ({
        id: String(record?.id || '').trim() || `legacy-payment-${String(record?.date || '').trim()}`,
        date: String(record?.date || '').trim(),
        tuition: Number(record?.tuition) || 0,
        basis: String(record?.basis || '').trim(),
        credits: Math.max(0, Math.floor(Number(record?.credits) || 0))
      }))
      .filter((record) => isValidDateString(record.date));

    getStudentPaymentHistory(student).forEach((date) => {
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

  function buildPaymentClassGroups(options) {
    const student = options?.student;
    const paymentDates = options?.paymentDates;
    const classRecords = options?.classRecords;
    const paymentRecordByDate = new Map(
      (Array.isArray(options?.paymentRecords) ? options.paymentRecords : [])
        .map((record) => [record.date, record])
    );
    if (options?.isMonthlyStart) {
      const monthlyGroups = buildMonthlyStartPaymentClassGroups(paymentDates, classRecords);
      monthlyGroups.groups.forEach((group) => {
        group.paymentRecord = paymentRecordByDate.get(group.paymentDate) || null;
      });
      return monthlyGroups;
    }

    const sortedPaymentsAsc = (Array.isArray(paymentDates) ? paymentDates : [])
      .map((date) => String(date || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const workingClasses = (Array.isArray(classRecords) ? classRecords : [])
      .map((record) => ({ ...record, __assignedPayment: false }))
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

    reservePriorCycleClasses({
      sortedPaymentsAsc,
      workingClasses,
      manualUsedAdjustment: options?.manualUsedAdjustment,
      carryOverBeforePayment: student?.carryOverBeforePayment
    });

    const groupsAsc = [];
    sortedPaymentsAsc.forEach((paymentDate, index) => {
      const nextPaymentDate = sortedPaymentsAsc[index + 1] || '';
      const firstPaymentDate = sortedPaymentsAsc[0] || paymentDate;
      const paymentRecord = paymentRecordByDate.get(paymentDate) || null;
      const recordCredits = Number(paymentRecord?.credits);
      const cycleSize = Number.isFinite(recordCredits) && recordCredits > 0
        ? Math.floor(recordCredits)
        : options?.paymentCycleSize;
      const assigned = [];
      let paidCount = 0;
      const assignRecord = (record) => {
        if (!record) return;
        record.__assignedPayment = true;
        assigned.push(record);
        paidCount += 1;
      };

      for (let classIndex = 0; classIndex < workingClasses.length; classIndex += 1) {
        const record = workingClasses[classIndex];
        const classDate = String(record?.date || '');
        if (!classDate || record.__assignedPayment || record.__priorCycle) continue;
        if (classDate < firstPaymentDate) continue;
        if (nextPaymentDate && classDate >= nextPaymentDate) continue;
        assignRecord(record);
        if (paidCount >= cycleSize) break;
      }

      if (paidCount < cycleSize && nextPaymentDate) {
        for (let classIndex = 0; classIndex < workingClasses.length; classIndex += 1) {
          const record = workingClasses[classIndex];
          const classDate = String(record?.date || '');
          if (!classDate || record.__assignedPayment || record.__priorCycle) continue;
          if (classDate !== nextPaymentDate) continue;
          assignRecord(record);
          if (paidCount >= cycleSize) break;
        }
      }

      groupsAsc.push({
        paymentDate,
        paymentRecord,
        classRecords: assigned.sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`))
      });
    });

    const latestPaymentDate = sortedPaymentsAsc[sortedPaymentsAsc.length - 1] || '';
    const currentGroup = groupsAsc[groupsAsc.length - 1];
    const priorUsageSinceLatestPayment = workingClasses.filter((record) => (
      record.__priorCycle && String(record?.date || '') >= latestPaymentDate
    )).length;
    return {
      groups: groupsAsc.slice().sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''))),
      unassigned: workingClasses
        .filter((record) => !record.__assignedPayment)
        .sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`)),
      remainingCount: getRemainingClassCount({
        student,
        completedSincePayment: (currentGroup?.classRecords.length || 0) + priorUsageSinceLatestPayment,
        basisCount: options?.paymentCycleSize
      })
    };
  }

  function buildPaymentClassDetailRows(options) {
    const groups = Array.isArray(options?.groups) ? options.groups : [];
    const unassigned = Array.isArray(options?.unassigned) ? options.unassigned : [];
    const latestPaymentDate = groups.reduce((latest, group) => (
      String(group?.paymentDate || '') > latest ? String(group.paymentDate) : latest
    ), '');
    const pending = unassigned.filter((record) => String(record?.date || '') >= latestPaymentDate);
    const prior = unassigned.filter((record) => String(record?.date || '') < latestPaymentDate);
    const dayNames = Array.isArray(options?.dayNames) ? options.dayNames : [];
    const getDayIndex = options?.getDayIndex;
    const formatTuition = options?.formatTuition;
    const isMonthlyBasis = options?.isMonthlyBasis;
    const formatClass = (record) => {
      const dayIndex = typeof getDayIndex === 'function' ? getDayIndex(record?.date) : -1;
      const dayName = dayIndex >= 0 && dayIndex < dayNames.length ? dayNames[dayIndex] : '-';
      const classLabel = String(record?.classType || '수강').trim();
      return `${record?.date} (${dayName}) ${record?.start}~${record?.end} · ${classLabel}`;
    };

    const rows = [];
    groups.forEach((group) => {
      const classItems = Array.isArray(group?.classRecords) ? group.classRecords : [];
      const spanCount = Math.max(1, classItems.length);
      for (let index = 0; index < spanCount; index += 1) {
        const cells = [];
        if (index === 0) {
          const paymentRecord = group?.paymentRecord || {};
          cells.push({ text: group?.paymentDate || '-', rowSpan: spanCount });
          cells.push({ text: paymentRecord.basis || '-', rowSpan: spanCount });
          cells.push({
            text: paymentRecord.tuition && typeof formatTuition === 'function'
              ? formatTuition(paymentRecord.tuition)
              : '-',
            rowSpan: spanCount
          });
          cells.push({
            text: paymentRecord.basis
              ? (typeof isMonthlyBasis === 'function' && isMonthlyBasis(paymentRecord.basis)
                  ? '-'
                  : String(paymentRecord.credits))
              : '-',
            rowSpan: spanCount
          });
        }
        cells.push({ text: classItems.length ? formatClass(classItems[index]) : '-' });
        rows.push({ cells });
      }
    });

    appendUnassignedRows(rows, pending, '다음 결제 대기', formatClass);
    appendUnassignedRows(rows, prior, '이전 결제 사이클', formatClass);
    return rows;
  }

  function appendUnassignedRows(rows, records, label, formatClass) {
    records.forEach((record, index) => {
      const cells = [];
      if (index === 0) cells.push({ text: label, rowSpan: records.length, colSpan: 4 });
      cells.push({ text: formatClass(record) });
      rows.push({ cells });
    });
  }

  function reservePriorCycleClasses(options) {
    const workingClasses = options?.workingClasses;
    const sortedPaymentsAsc = options?.sortedPaymentsAsc;
    if (!Array.isArray(workingClasses) || workingClasses.length === 0) return;
    if (!Array.isArray(sortedPaymentsAsc) || sortedPaymentsAsc.length === 0) return;

    const firstPaymentDate = String(sortedPaymentsAsc[0] || '').trim();
    let openingCredits = Math.max(0, -(Number(options?.manualUsedAdjustment) || 0));
    for (let index = 0; index < workingClasses.length && openingCredits > 0; index += 1) {
      const record = workingClasses[index];
      const classDate = String(record?.date || '').trim();
      if (!classDate || classDate < firstPaymentDate) continue;
      record.__priorCycle = true;
      openingCredits -= 1;
    }

    const latestPaymentDate = String(sortedPaymentsAsc[sortedPaymentsAsc.length - 1] || '').trim();
    let sameDayPriorCycleCount = Math.max(0, Math.floor(Number(options?.carryOverBeforePayment) || 0));
    for (let index = 0; index < workingClasses.length && sameDayPriorCycleCount > 0; index += 1) {
      const record = workingClasses[index];
      if (record.__priorCycle) continue;
      if (String(record?.date || '').trim() !== latestPaymentDate) continue;
      record.__priorCycle = true;
      sameDayPriorCycleCount -= 1;
    }
  }

  function buildMonthlyStartPaymentClassGroups(paymentDates, classRecords) {
    const sortedPaymentsAsc = (Array.isArray(paymentDates) ? paymentDates : [])
      .map((date) => String(date || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
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

    const groupsByPaymentDate = new Map();
    paymentEntries.forEach((entry) => {
      if (!groupsByPaymentDate.has(entry.paymentDate)) groupsByPaymentDate.set(entry.paymentDate, []);
    });
    const sortedClassesDesc = (Array.isArray(classRecords) ? classRecords : [])
      .slice()
      .sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`));
    const unassigned = [];
    sortedClassesDesc.forEach((record) => {
      const classDate = String(record?.date || '').trim();
      if (!classDate) return;
      const paymentDate = monthToPaymentDate.get(classDate.slice(0, 7));
      const bucket = paymentDate ? groupsByPaymentDate.get(paymentDate) : null;
      if (!bucket) {
        unassigned.push(record);
        return;
      }
      bucket.push(record);
    });

    return {
      groups: Array.from(groupsByPaymentDate.entries())
        .map(([paymentDate, records]) => ({ paymentDate, classRecords: records }))
        .sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''))),
      unassigned
    };
  }

  const api = Object.freeze({
    buildPaymentClassDetailRows,
    buildPaymentClassGroups,
    computeCarryOverForNewPaymentCycle,
    getManualUsedAdjustment,
    getRemainingClassCount,
    getStudentPaymentCycleSize,
    getStudentPaymentHistory,
    normalizePaymentRecords
  });
  root.StudentPaymentCredits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);