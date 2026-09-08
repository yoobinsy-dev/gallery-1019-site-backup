const test = require('node:test');
const assert = require('node:assert/strict');
const { projectStudentCreditLedgerV2 } = require('../../student-credits-v2/projection');
const { addAdjustment, confirmOpeningBalance } = require('../../student-credits-v2/commands');

function student(openingBalance, overrides = {}) {
  return {
    tuitionBasis: '4회',
    creditLedgerV2: {
      version: 2,
      openingDate: '2026-07-26',
      openingBalance,
      openingConfirmed: true,
      adjustments: []
    },
    ...overrides
  };
}

function payment(id, date, credits) {
  return { id, date, credits, basis: `${credits}회` };
}

function classRecord(id, date, start = '10:00') {
  return { id, date, start, end: '11:00', kind: '수강' };
}

test('V2 signed opening balances and natural carryover produce one running balance', () => {
  assert.equal(projectStudentCreditLedgerV2({
    student: student(3), paymentRecords: [], classRecords: [classRecord('a', '2026-08-01'), classRecord('b', '2026-08-02')]
  }).currentBalance, 1);
  assert.equal(projectStudentCreditLedgerV2({
    student: student(0), paymentRecords: [], classRecords: [classRecord('a', '2026-08-01')]
  }).currentBalance, -1);
  assert.equal(projectStudentCreditLedgerV2({
    student: student(-2), paymentRecords: [payment('p', '2026-08-02', 4)], classRecords: []
  }).currentBalance, 2);
  assert.equal(projectStudentCreditLedgerV2({
    student: student(2), paymentRecords: [payment('p', '2026-08-02', 4)], classRecords: []
  }).currentBalance, 6);
});

test('V2 reproduces the 손원희 and 최복희 signed-ledger patterns without cycle assignment', () => {
  const wonheeClasses = ['2026-08-11', '2026-08-28', '2026-09-04'].map((date, index) => classRecord(`c${index}`, date));
  const beforePayment = projectStudentCreditLedgerV2({
    student: student(-2),
    paymentRecords: [payment('aug', '2026-08-02', 4)],
    classRecords: wonheeClasses
  });
  assert.equal(beforePayment.currentBalance, -1);
  assert.equal(beforePayment.events.some((event) => /pending|unassigned/i.test(event.label)), false);
  assert.equal(projectStudentCreditLedgerV2({
    student: student(-2),
    paymentRecords: [payment('aug', '2026-08-02', 4), payment('next', '2026-09-10', 4)],
    classRecords: wonheeClasses
  }).currentBalance, 3);

  const bokhee = projectStudentCreditLedgerV2({
    student: student(0),
    paymentRecords: [payment('sep', '2026-09-02', 4)],
    classRecords: [classRecord('before', '2026-09-01'), classRecord('after', '2026-09-08')]
  });
  assert.equal(bokhee.currentBalance, 2);
  assert.deepEqual(bokhee.events.map((event) => event.runningBalance), [0, -1, 3, 2]);
});

test('V2 same-day display is deterministic and cutover boundaries are exact', () => {
  const projection = projectStudentCreditLedgerV2({
    student: student(0),
    paymentRecords: [payment('old', '2026-07-25', 9), payment('cutover', '2026-07-26', 4)],
    classRecords: [classRecord('old', '2026-07-25'), classRecord('cutover', '2026-07-26')]
  });
  assert.equal(projection.currentBalance, 3);
  assert.deepEqual(projection.events.map((event) => event.type), ['opening', 'payment', 'class']);
  assert.deepEqual(projection.events.map((event) => event.runningBalance), [0, 4, 3]);

  const configured = student(0);
  configured.creditLedgerV2.adjustments = [{
    id: 'cutover-adjustment',
    date: '2026-07-26',
    delta: 1,
    reason: '서비스 회차',
    createdAt: '2026-07-26T12:00:00.000Z'
  }];
  const ordered = projectStudentCreditLedgerV2({
    student: configured,
    paymentRecords: [payment('cutover', '2026-07-26', 4)],
    classRecords: [classRecord('cutover', '2026-07-26')]
  });
  assert.deepEqual(ordered.events.map((event) => event.type), ['opening', 'payment', 'adjustment', 'class']);
});

test('V2 excludes monthly students and requires a confirmed signed opening balance', () => {
  const monthly = projectStudentCreditLedgerV2({
    student: { tuitionBasis: '월초' }, paymentRecords: [payment('p', '2026-08-01', 4)], classRecords: []
  });
  assert.equal(monthly.isApplicable, false);
  assert.equal(monthly.currentBalance, null);

  const incomplete = projectStudentCreditLedgerV2({ student: { tuitionBasis: '4회' }, paymentRecords: [], classRecords: [] });
  assert.equal(incomplete.isReady, false);
  assert.equal(incomplete.currentBalance, null);
  assert.deepEqual(incomplete.issues, [{ type: 'opening-not-confirmed' }]);
});

test('V2 counts each stable source once and supports explicit signed adjustments', () => {
  const configured = student(0);
  configured.creditLedgerV2.adjustments = [
    { id: 'service', date: '2026-08-01', delta: 1, reason: '서비스', createdAt: '2026-08-01T01:00:00Z' },
    { id: 'correction', date: '2026-08-02', delta: -1, reason: '정정', createdAt: '2026-08-02T01:00:00Z' }
  ];
  const input = {
    student: configured,
    paymentRecords: [payment('p', '2026-08-01', 4), payment('p', '2026-08-01', 4)],
    classRecords: [classRecord('c', '2026-08-03'), classRecord('c', '2026-08-03')]
  };
  const first = projectStudentCreditLedgerV2(input);
  const second = projectStudentCreditLedgerV2(input);
  assert.equal(first.currentBalance, 3);
  assert.deepEqual(first, second);
  assert.deepEqual(first.events.filter((event) => event.type === 'adjustment').map((event) => event.delta), [1, -1]);
});

test('V2 surfaces payment records whose purchased credits are not reliable', () => {
  const projection = projectStudentCreditLedgerV2({
    student: student(0),
    paymentRecords: [{ id: 'missing', date: '2026-08-01', basis: '4회' }],
    classRecords: []
  });
  assert.equal(projection.isReady, false);
  assert.equal(projection.currentBalance, 0);
  assert.equal(projection.issues[0].type, 'payment-credits-missing');
});

test('V2 commands persist only confirmed opening data and explicit stable adjustments', () => {
  const ledger = confirmOpeningBalance(null, -2, '2026-09-08T00:00:00.000Z');
  assert.deepEqual(ledger, {
    version: 2,
    openingDate: '2026-07-26',
    openingBalance: -2,
    openingConfirmed: true,
    openingConfirmedAt: '2026-09-08T00:00:00.000Z',
    adjustments: []
  });
  const adjusted = addAdjustment(ledger, {
    id: 'adjustment-1', date: '2026-09-08', delta: 1, reason: '서비스', createdAt: '2026-09-08T01:00:00.000Z'
  });
  assert.equal(adjusted.adjustments[0].id, 'adjustment-1');
  assert.equal(adjusted.adjustments[0].delta, 1);
  assert.throws(() => confirmOpeningBalance(null, 1.5), /signed integer/);
  assert.throws(() => addAdjustment(ledger, { id: 'bad', date: '2026-09-08', delta: 0, reason: '' }), /requires/);
});