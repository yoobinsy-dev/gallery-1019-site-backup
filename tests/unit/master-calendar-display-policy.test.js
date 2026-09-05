const test = require('node:test');
const assert = require('node:assert/strict');

const displayPolicy = require('../../master-calendar/display-policy');

const kilnCategories = ['초벌', '재벌'];

test('display policy classifies base and event types', () => {
  assert.equal(displayPolicy.getBaseLabelText(null), '');
  assert.equal(displayPolicy.getBaseLabelText({ type: '수업시간', className: ' 물레 ', instructor: ' 강사 ' }), '물레 · 강사');
  assert.equal(displayPolicy.getBaseLabelText({ type: '수업시간', className: '', instructor: '' }), '수업시간');
  assert.equal(displayPolicy.getBaseLabelText({ type: '이용 불가' }), '이용 불가');

  assert.equal(displayPolicy.baseTypeToClass('수업시간'), 'base-class');
  assert.equal(displayPolicy.baseTypeToClass('개인작업 시간'), 'base-personal');
  assert.equal(displayPolicy.baseTypeToClass('이용 불가'), 'base-closed');
  assert.equal(displayPolicy.baseTypeToClass('unknown'), '');

  assert.equal(displayPolicy.kindToClass('수강'), 'kind-class');
  assert.equal(displayPolicy.kindToClass('개인작업'), 'kind-personal');
  assert.equal(displayPolicy.kindToClass('강사 지도 하 개인작업'), 'kind-guided');
  assert.equal(displayPolicy.kindToClass('기획 전시'), 'kind-exhibition');
  assert.equal(displayPolicy.kindToClass('기타'), 'kind-other');
  assert.equal(displayPolicy.kindToClass('가마 관련'), 'kind-kiln');
  assert.equal(displayPolicy.kindToClass('unknown'), 'kind-personal');
});

test('display policy identifies and prioritizes all-day kinds', () => {
  assert.equal(displayPolicy.isExhibitionKind(' 전시회 '), true);
  assert.equal(displayPolicy.isExhibitionKind('개인작업'), false);
  assert.equal(displayPolicy.isKilnKind(' 가마 소성 '), true);
  assert.equal(displayPolicy.isKilnKind('개인작업'), false);
  assert.equal(displayPolicy.isAllDayKind('가마 관련'), true);
  assert.equal(displayPolicy.isAllDayKind('기획 전시'), true);
  assert.equal(displayPolicy.isAllDayKind('수강'), false);
  assert.equal(displayPolicy.getAllDayPriority('가마 소성'), 0);
  assert.equal(displayPolicy.getAllDayPriority('전시회'), 1);
  assert.equal(displayPolicy.getAllDayPriority('수강'), 2);
});

test('display policy normalizes kiln categories and titles', () => {
  assert.equal(displayPolicy.normalizeKilnCategory(' 초벌 ', kilnCategories), '초벌');
  assert.equal(displayPolicy.normalizeKilnCategory('삼벌', kilnCategories), '');
  assert.equal(displayPolicy.extractKilnCategoryFromTitle(' 가마 소성 (재벌) ', kilnCategories), '재벌');
  assert.equal(displayPolicy.extractKilnCategoryFromTitle('가마 소성 (삼벌)', kilnCategories), '');
  assert.equal(displayPolicy.buildKilnEventTitle(' 초벌 ', kilnCategories), '가마 소성 (초벌)');
  assert.equal(displayPolicy.buildKilnEventTitle('삼벌', kilnCategories), '가마 소성');
});

test('display policy resolves kiln and general event titles', () => {
  assert.equal(displayPolicy.getEventDisplayTitle(null, '', kilnCategories), '새 일정');
  assert.equal(displayPolicy.getEventDisplayTitle({ kind: '가마 소성', kilnCategory: '재벌', title: 'legacy' }, 'fallback', kilnCategories), '가마 소성 (재벌)');
  assert.equal(displayPolicy.getEventDisplayTitle({ kind: '가마 관련', kilnCategory: 'invalid', title: ' custom kiln ' }, 'fallback', kilnCategories), 'custom kiln');
  assert.equal(displayPolicy.getEventDisplayTitle({ kind: '가마 소성', title: '' }, 'fallback', kilnCategories), '가마 소성');
  assert.equal(displayPolicy.getEventDisplayTitle({ kind: '개인작업', title: ' work ' }, 'fallback', kilnCategories), 'work');
  assert.equal(displayPolicy.getEventDisplayTitle({ kind: '개인작업', title: '' }, 'fallback', kilnCategories), 'fallback');
});

test('display policy exposes an immutable API', () => {
  assert.equal(Object.isFrozen(displayPolicy), true);
});