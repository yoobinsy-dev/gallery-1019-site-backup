#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { setStateValue } = require('../api/_lib/state-store');
const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../tests/helpers/test-safety');

const PREFIX = 'DEV_DUMMY_';
const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const MANIFEST = require('./dev-dummy-data-manifest.json');
const STATE_KEYS = [
  'users',
  'exhibitions',
  'pottery-students-v1',
  'pottery-personal-work-v1',
  'studio-calendar-state-v1',
  'pottery-material-orders-v1',
  'pottery-accounting-v1'
];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(baseDate, days) {
  const date = new Date(`${formatDate(baseDate)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function makeWorks(exhibitionIndex, artists, ownerId) {
  const media = ['도자', '캔버스에 유채', '한지에 채색', '혼합재료', '조각', '목탄 드로잉', '아크릴', '판화'];
  return Array.from({ length: 8 }, (_, index) => {
    const number = exhibitionIndex * 8 + index + 1;
    return {
      id: 91019000 + number,
      manualNumber: `${PREFIX}W${String(number).padStart(2, '0')}`,
      title: `${PREFIX}${['고요의 결', '흐르는 정원', '빛의 자리', '겹의 시간', '푸른 호흡', '낮의 온도', '경계의 풍경', '작은 우주'][index]}_${exhibitionIndex + 1}`,
      author: artists[index % artists.length],
      price: index === 6 ? '판매안함' : String(280000 + (number * 70000)),
      size: index % 3 === 0 ? '30 × 40 cm' : (index % 3 === 1 ? '45 × 53 cm' : '20 × 20 × 28 cm'),
      year: String(2023 + (index % 4)),
      materials: media[index],
      category: index % 4 === 0 ? '입체' : '평면',
      description: index % 2 === 0 ? `${PREFIX}개발용 작품 설명 ${number}` : '',
      saved: true,
      createdByUserId: ownerId
    };
  });
}

function makeExhibition(id, title, startDate, endDate, exhibitionIndex, artists, owner) {
  const works = makeWorks(exhibitionIndex, artists, owner.id);
  const goods = [
    { id: `${PREFIX}GOODS_${exhibitionIndex + 1}_01`, manualNumber: `${PREFIX}G${exhibitionIndex + 1}1`, title: `${PREFIX}아트 엽서 세트`, itemType: '굿즈', price: '12000', quantity: 30, saved: true, createdByUserId: owner.id },
    { id: `${PREFIX}GOODS_${exhibitionIndex + 1}_02`, manualNumber: `${PREFIX}G${exhibitionIndex + 1}2`, title: `${PREFIX}전시 패브릭백`, itemType: '굿즈', price: '28000', quantity: exhibitionIndex === 2 ? 0 : 12, saved: true, createdByUserId: owner.id }
  ];
  const artworkSales = works.slice(0, 2).map((work, index) => ({
    id: `${PREFIX}SALE_${exhibitionIndex + 1}_${index + 1}`,
    workId: work.id,
    itemType: '작품',
    manualNumber: work.manualNumber,
    title: work.title,
    author: work.author,
    price: Number(work.price),
    buyerName: `${PREFIX}구매자${exhibitionIndex + 1}${index + 1}`,
    buyerPhone: `010-000${exhibitionIndex}-${String(index + 1).padStart(4, '0')}`,
    paymentMethod: index % 2 === 0 ? '카드' : '계좌이체',
    soldAtKst: `${shiftDate(new Date(`${endDate}T12:00:00Z`), -index - 1)} 15:00:00`,
    saved: true,
    createdByUserId: owner.id
  }));
  const goodsSale = {
    id: `${PREFIX}SALE_${exhibitionIndex + 1}_GOODS`,
    workId: goods[0].id,
    itemType: '굿즈',
    manualNumber: goods[0].manualNumber,
    title: goods[0].title,
    author: '',
    price: Number(goods[0].price),
    soldQuantity: exhibitionIndex + 1,
    buyerName: `${PREFIX}굿즈구매자${exhibitionIndex + 1}`,
    buyerPhone: `010-0009-${String(exhibitionIndex + 1).padStart(4, '0')}`,
    paymentMethod: '현금',
    soldAtKst: `${shiftDate(new Date(`${endDate}T12:00:00Z`), -1)} 16:30:00`,
    saved: true,
    createdByUserId: owner.id
  };
  return {
    id,
    title: `${PREFIX}${title}`,
    name: `${PREFIX}${title}`,
    type: exhibitionIndex === 0 ? '단체전' : (exhibitionIndex === 1 ? '2인전' : '개인전'),
    startDate,
    endDate,
    managers: [owner.name],
    staff: { planners: [], artists: [], staffs: [] },
    works: JSON.parse(JSON.stringify(works)),
    artWorks: JSON.parse(JSON.stringify(works)),
    goods,
    soldWorks: [...artworkSales, goodsSale],
    artSoldWorks: artworkSales,
    soldGoods: [goodsSale],
    expenseItems: [{ id: `${PREFIX}EXHIBITION_EXPENSE_${exhibitionIndex + 1}`, category: '홍보비', title: `${PREFIX}전시 인쇄물`, amount: 85000 + exhibitionIndex * 15000, date: startDate }],
    revenueItems: [],
    information: `${PREFIX}개발 및 화면 검증용 전시 데이터입니다.`,
    createdAt: `${startDate}T00:00:00.000Z`,
    updatedAt: new Date().toISOString()
  };
}

function buildSeedData(now = new Date()) {
  const artists = [`${PREFIX}작가_김하늘`, `${PREFIX}작가_이로운`, `${PREFIX}작가_박여름`, `${PREFIX}작가_최새벽`];
  const owner = { id: 91019000, name: `${PREFIX}운영자` };
  const users = [{
    id: 91019999,
    username: `${PREFIX}ADMIN`,
    name: `${PREFIX}관리자`,
    password: 'DevOnly1019!',
    email: 'dev-dummy-admin@example.invalid',
    phone: '010-0000-1019',
    accountType: '어드민',
    studioRole: '어드민',
    galleryRole: '어드민',
    siteAccess: 'both',
    approved: true
  }];
  const exhibitions = [
    makeExhibition(91019001, '현재전_겹쳐진_풍경', shiftDate(now, -7), shiftDate(now, 14), 0, artists, owner),
    makeExhibition(91019002, '예정전_흙과_빛의_대화', shiftDate(now, 25), shiftDate(now, 50), 1, artists, owner),
    makeExhibition(91019003, '종료전_기억의_표면', shiftDate(now, -55), shiftDate(now, -25), 2, artists, owner)
  ];
  const students = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const paymentDate = shiftDate(now, -(index % 3) * 14);
    return {
      id: `${PREFIX}STUDENT_${String(number).padStart(2, '0')}`,
      name: `${PREFIX}학생${String(number).padStart(2, '0')}`,
      studentGroup: index === 9 ? '원데이' : '정규반',
      classTime: `${['월 10:00~12:00', '화 14:00~16:00', '수 19:00~21:00', '토 11:00~13:00'][index % 4]}`,
      classType: index === 9 ? '원데이 클래스' : '정규 수강',
      instructor: `${PREFIX}강사${(index % 3) + 1}`,
      tuition: index === 9 ? 70000 : 180000,
      tuitionBasis: index === 9 ? '1회' : (index % 2 === 0 ? '4회' : '월초'),
      mostRecentPaymentDate: paymentDate,
      paymentHistory: [paymentDate],
      paymentRecords: [{ id: `${PREFIX}PAYMENT_${String(number).padStart(2, '0')}`, date: paymentDate, tuition: index === 9 ? 70000 : 180000, basis: index === 9 ? '1회' : (index % 2 === 0 ? '4회' : '월초'), credits: index === 9 ? 1 : 4 }],
      creditTrackingStartDate: paymentDate,
      carryOverBeforePayment: index % 3,
      paymentCycleCredits: index === 9 ? 1 : 4,
      manualUsedAdjustment: index % 4
    };
  });
  const personalWork = Array.from({ length: 6 }, (_, index) => {
    const startDate = shiftDate(now, index < 4 ? -(index * 5) : -(45 + index * 3));
    const entry = {
      id: `${PREFIX}PERSONAL_${String(index + 1).padStart(2, '0')}`,
      userName: students[index].name,
      startDate,
      maxHours: 8 + index * 2,
      monthlyFee: 90000 + index * 10000,
      lastPaymentDate: startDate,
      paymentHistory: [startDate]
    };
    if (index >= 4) {
      entry.isDormant = true;
      entry.dormantCycleStart = startDate;
      entry.dormantCycleEnd = shiftDate(new Date(`${startDate}T12:00:00Z`), 30);
    }
    return entry;
  });
  const calendarEvents = [
    ...students.slice(0, 8).map((student, index) => ({
      id: `${PREFIX}CAL_CLASS_${String(index + 1).padStart(2, '0')}`,
      kind: '수강', title: student.name, instructor: student.instructor,
      date: shiftDate(now, -21 + (index % 6)), start: ['10:00', '11:00', '14:00', '16:00', '18:00', '19:00'][index % 6],
      end: ['12:00', '13:00', '16:00', '18:00', '20:00', '21:00'][index % 6],
      repeatWeekly: true, repeatEndDate: shiftDate(now, 21), repeatSkipDates: index === 2 ? [shiftDate(now, -1)] : []
    })),
    ...personalWork.slice(0, 4).map((entry, index) => ({
      id: `${PREFIX}CAL_PERSONAL_${String(index + 1).padStart(2, '0')}`,
      kind: index === 3 ? '강사 지도 하 개인작업' : '개인작업', title: entry.userName,
      instructor: index === 3 ? `${PREFIX}강사1` : '', date: shiftDate(now, -4 + index * 3), start: `${13 + index}:00`, end: `${15 + index}:00`
    })),
    { id: `${PREFIX}CAL_EVENT_OPENING`, kind: '전시', title: exhibitions[0].title, date: exhibitions[0].startDate, endDate: exhibitions[0].endDate, start: '00:00', end: '24:00' },
    { id: `${PREFIX}CAL_EVENT_MEETING`, kind: '기타', title: `${PREFIX}월간 운영 회의`, date: shiftDate(now, 5), start: '10:30', end: '11:30' }
  ];
  const materialNames = ['백자토 20kg', '청자토 20kg', '투명유 5L', '무광백유 5L', '코발트 안료', '철화 안료', '조각도 세트', '스펀지 세트', '가마 선반지', '포장 완충재'];
  const materialOrders = materialNames.map((product, index) => ({
    id: `${PREFIX}ORDER_${String(index + 1).padStart(2, '0')}`,
    orderDate: shiftDate(now, -20 + index * 2),
    createdAt: `${shiftDate(now, -20 + index * 2)}T03:00:00.000Z`,
    orderWideDiscount: false,
    orderWideShipping: false,
    items: [{
      id: `${PREFIX}ORDER_ITEM_${String(index + 1).padStart(2, '0')}`,
      category: index < 2 ? '흙' : (index < 6 ? '유약' : '기타'),
      site: ['클레이어', '대원도재', '중앙도재'][index % 3],
      product: `${PREFIX}${product}`,
      quantity: 1 + (index % 4),
      price: 18000 + index * 3500,
      discount: index % 3 === 0 ? 2000 : null,
      shippingFee: index % 2 === 0 ? 3500 : null,
      status: ['주문 완료', '배송중', '배송 완료'][index % 3]
    }]
  }));
  return {
    users,
    exhibitions,
    'pottery-students-v1': students,
    'pottery-personal-work-v1': personalWork,
    'studio-calendar-state-v1': { events: calendarEvents, baseRules: [], baseRuleTimeline: [], baseWeekOverrides: {}, studioUsers: students.map(({ id, name }) => ({ id, name })), instructors: [`${PREFIX}강사1`, `${PREFIX}강사2`, `${PREFIX}강사3`], classTeachingLog: [] },
    'pottery-material-orders-v1': materialOrders,
    'pottery-accounting-v1': []
  };
}

function hasDummyIdentity(value) {
  if (!value || typeof value !== 'object') return false;
  return [value.id, value.username, value.name, value.title, value.userName, value.manualNumber, value.product]
    .some((field) => String(field || '').startsWith(PREFIX));
}

function mergeById(existing, additions) {
  const additionIds = new Set(additions.map((item) => String(item.id)));
  return [...existing.filter((item) => !additionIds.has(String(item?.id))), ...additions];
}

function mergeSeedState(current, seed) {
  return {
    ...current,
    users: mergeById(Array.isArray(current.users) ? current.users : [], seed.users),
    exhibitions: mergeById(Array.isArray(current.exhibitions) ? current.exhibitions : [], seed.exhibitions),
    'pottery-students-v1': mergeById(Array.isArray(current['pottery-students-v1']) ? current['pottery-students-v1'] : [], seed['pottery-students-v1']),
    'pottery-personal-work-v1': mergeById(Array.isArray(current['pottery-personal-work-v1']) ? current['pottery-personal-work-v1'] : [], seed['pottery-personal-work-v1']),
    'pottery-material-orders-v1': mergeById(Array.isArray(current['pottery-material-orders-v1']) ? current['pottery-material-orders-v1'] : [], seed['pottery-material-orders-v1']),
    'pottery-accounting-v1': Array.isArray(current['pottery-accounting-v1']) ? current['pottery-accounting-v1'] : [],
    'studio-calendar-state-v1': {
      ...(current['studio-calendar-state-v1'] || {}),
      events: mergeById(Array.isArray(current['studio-calendar-state-v1']?.events) ? current['studio-calendar-state-v1'].events : [], seed['studio-calendar-state-v1'].events),
      studioUsers: mergeById(Array.isArray(current['studio-calendar-state-v1']?.studioUsers) ? current['studio-calendar-state-v1'].studioUsers : [], seed['studio-calendar-state-v1'].studioUsers),
      instructors: Array.from(new Set([...(current['studio-calendar-state-v1']?.instructors || []), ...seed['studio-calendar-state-v1'].instructors]))
    }
  };
}

function cleanupSeedState(current) {
  const calendar = current['studio-calendar-state-v1'] || {};
  return {
    ...current,
    users: (current.users || []).filter((item) => !MANIFEST.userIds.includes(item?.id) && !hasDummyIdentity(item)),
    exhibitions: (current.exhibitions || []).filter((item) => !MANIFEST.exhibitionIds.includes(item?.id) && !hasDummyIdentity(item)),
    'pottery-students-v1': (current['pottery-students-v1'] || []).filter((item) => !hasDummyIdentity(item)),
    'pottery-personal-work-v1': (current['pottery-personal-work-v1'] || []).filter((item) => !hasDummyIdentity(item)),
    'pottery-material-orders-v1': (current['pottery-material-orders-v1'] || []).filter((item) => !hasDummyIdentity(item)),
    'pottery-accounting-v1': (current['pottery-accounting-v1'] || []).filter((item) => !hasDummyIdentity(item)),
    'studio-calendar-state-v1': {
      ...calendar,
      events: (calendar.events || []).filter((item) => !hasDummyIdentity(item)),
      studioUsers: (calendar.studioUsers || []).filter((item) => !hasDummyIdentity(item)),
      instructors: (calendar.instructors || []).filter((item) => !String(item || '').startsWith(PREFIX)),
      ...('classTeachingLog' in calendar
        ? { classTeachingLog: (calendar.classTeachingLog || []).filter((item) => !hasDummyIdentity(item)) }
        : {})
    }
  };
}

async function fetchState(fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/api/state`);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`DEV state read failed (${response.status}): ${body.error || 'unknown error'}`);
  return { data: body.data || {}, meta: body.meta || {} };
}

async function putState(key, value, baseUpdatedAt, fetchImpl = fetch) {
  const requestId = `${PREFIX}SEED_${Date.now()}_${key}`;
  const body = { key, value, baseUpdatedAt: baseUpdatedAt || undefined };
  if (key === 'exhibitions') body.syncMode = 'delta';
  const response = await fetchImpl(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-cloud-client-id': `${PREFIX}SEED_UTILITY` },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`DEV ${key} write failed (${response.status}): ${result.error || 'unknown error'}`);
  return result;
}

function resolveDevDatabaseUrl() {
  return execFileSync('npx', ['neonctl', 'connection-string', DEVELOPMENT_IDENTITIES.databaseBranchId, '--project-id', 'calm-glitter-93873921', '--role-name', DEVELOPMENT_IDENTITIES.databaseRole, '--database-name', 'neondb', '--pooled', '--ssl', 'verify-full'], { encoding: 'utf8' }).trim();
}

function verifyDevTarget() {
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.vercel', 'project.json'), 'utf8'));
  const databaseUrl = resolveDevDatabaseUrl();
  const database = new URL(databaseUrl);
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    vercelProjectId: project.projectId,
    databaseEndpointId: database.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(database.username),
    archiveWriteEnabled: false
  });
  return databaseUrl;
}

function summarize(data) {
  const exhibitions = data.exhibitions.filter(hasDummyIdentity);
  return {
    users: data.users.filter(hasDummyIdentity).length,
    exhibitions: exhibitions.length,
    works: exhibitions.reduce((sum, item) => sum + (item.artWorks || item.works || []).length, 0),
    sales: exhibitions.reduce((sum, item) => sum + (item.soldWorks || []).length, 0),
    goods: exhibitions.reduce((sum, item) => sum + (item.goods || []).length, 0),
    students: data['pottery-students-v1'].filter(hasDummyIdentity).length,
    personalWork: data['pottery-personal-work-v1'].filter(hasDummyIdentity).length,
    calendarEvents: data['studio-calendar-state-v1'].events.filter(hasDummyIdentity).length,
    materialOrders: data['pottery-material-orders-v1'].filter(hasDummyIdentity).length,
    accounting: data['pottery-accounting-v1'].filter(hasDummyIdentity).length,
    blobObjects: 0
  };
}

async function run(mode, options = {}) {
  if (!['seed', 'cleanup', 'verify', 'manifest'].includes(mode)) throw new Error('Usage: node scripts/seed-dev-dummy-data.js <seed|cleanup|verify|manifest>');
  if (mode === 'manifest') return { mode, manifest: MANIFEST };
  const databaseUrl = options.databaseUrl || verifyDevTarget();
  const before = await fetchState(options.fetchImpl);
  const seed = buildSeedData(options.now || new Date());
  const desired = mode === 'seed' ? mergeSeedState(before.data, seed) : cleanupSeedState(before.data);

  if (mode !== 'verify') {
    for (const key of STATE_KEYS) {
      if (mode === 'cleanup' && ['users', 'exhibitions', 'pottery-students-v1'].includes(key)) continue;
      const value = ['users', 'exhibitions'].includes(key) && mode === 'seed' ? seed[key] : desired[key];
      await putState(key, value, before.meta[key]?.updatedAt, options.fetchImpl);
    }
    if (mode === 'cleanup') {
      const previous = process.env.DATABASE_URL;
      process.env.DATABASE_URL = databaseUrl;
      try {
        await setStateValue('users', desired.users);
        await setStateValue('exhibitions', desired.exhibitions);
        await setStateValue('pottery-students-v1', desired['pottery-students-v1']);
      } finally {
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
    }
  }

  const after = await fetchState(options.fetchImpl);
  const summary = summarize(after.data);
  if (mode === 'seed' && JSON.stringify(summary) !== JSON.stringify(MANIFEST.counts)) throw new Error(`Seed verification mismatch: ${JSON.stringify(summary)}`);
  if (mode === 'cleanup' && Object.values(summary).some(Boolean)) throw new Error(`Cleanup verification found residue: ${JSON.stringify(summary)}`);
  return { mode, target: BASE_URL, summary, manifestVersion: MANIFEST.version };
}

if (require.main === module) {
  run(process.argv[2] || '').then((result) => console.log(JSON.stringify({ ok: true, ...result }, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { BASE_URL, PREFIX, buildSeedData, cleanupSeedState, hasDummyIdentity, mergeSeedState, run, summarize };