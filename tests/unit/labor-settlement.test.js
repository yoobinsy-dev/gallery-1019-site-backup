const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const laborSettlement = require('../../accounting/labor-settlement');

const ROOT = path.resolve(__dirname, '../..');

test('labor settlement groups completed class revenue by instructor and calculates won totals', () => {
  const settlements = laborSettlement.buildInstructorSettlements({
    entries: [
      { id: '2', instructor: '박강사', date: '2026-09-02', title: '김기영 수강 10:00', amount: 33333 },
      { id: '1', instructor: '김강사', date: '2026-09-01', title: '이학생 수강 09:00', amount: 100000 },
      { id: '3', instructor: '박강사', date: '2026-09-09', title: '김기영 수강 10:00', amount: 33334 },
      { id: '4', instructor: '', date: '2026-09-10', title: '미지정 수강 11:00', amount: 50000 }
    ],
    roundWon: Math.round
  });

  assert.deepEqual(settlements, [
    {
      instructor: '김강사',
      rows: [{ id: '1', date: '2026-09-01', item: '이학생 09:00', amount: 100000, commission: 60000, withholdingTax: 1980, netPayment: 58020 }],
      totals: { amount: 100000, commission: 60000, withholdingTax: 1980, netPayment: 58020 }
    },
    {
      instructor: '박강사',
      rows: [
        { id: '2', date: '2026-09-02', item: '김기영 10:00', amount: 33333, commission: 20000, withholdingTax: 660, netPayment: 19340 },
        { id: '3', date: '2026-09-09', item: '김기영 10:00', amount: 33334, commission: 20000, withholdingTax: 660, netPayment: 19340 }
      ],
      totals: { amount: 66667, commission: 40000, withholdingTax: 1320, netPayment: 38680 }
    }
  ]);

  assert.deepEqual(laborSettlement.buildSettlementExportRows(settlements[0]), [
    ['날짜', '수강생 + 수업시간', '금액', '작가 커미션', '원천세', '실지급액'],
    ['2026-09-01', '이학생 09:00', 100000, 60000, 1980, 58020],
    ['합계', '', 100000, 60000, 1980, 58020]
  ]);
});

test('labor settlement workbook uses readable widths and won number formatting', () => {
  const widths = [];
  const styles = [];
  const sheet = {
    column(index) {
      return { width(value) { widths.push([index, value]); } };
    },
    range(address) {
      return { style(name, value) { styles.push([address, name, value]); } };
    }
  };

  laborSettlement.formatSettlementWorkbookSheet(sheet, 3);

  assert.deepEqual(widths, [[1, 14], [2, 24], [3, 18], [4, 18], [5, 16], [6, 18]]);
  assert.deepEqual(styles, [['C2:F3', 'numberFormat', '₩#,##0']]);
});

test('accounting page cache-busts instructor-aware automatic entries', () => {
  const html = fs.readFileSync(path.join(ROOT, 'pottery-accounting.html'), 'utf8');
  assert.match(html, /accounting\/auto-entries\.js\?v=20261001-1/);
});