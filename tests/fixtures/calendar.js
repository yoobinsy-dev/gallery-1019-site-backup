const CALENDAR_EVENTS = Object.freeze([
  {
    id: 'CHARACTERIZATION_TEST_single',
    kind: '수강',
    title: 'CHARACTERIZATION_TEST_STUDENT',
    date: '2026-07-01',
    start: '10:00',
    end: '11:30',
    repeatWeekly: false
  },
  {
    id: 'CHARACTERIZATION_TEST_weekly',
    kind: '수강',
    title: 'CHARACTERIZATION_TEST_STUDENT',
    date: '2026-07-06',
    start: '14:00',
    end: '16:00',
    repeatWeekly: true,
    repeatEndDate: '2026-08-03',
    repeatSkipDates: ['2026-07-20']
  },
  {
    id: 'CHARACTERIZATION_TEST_personal',
    kind: '개인작업',
    title: 'CHARACTERIZATION_TEST_ARTIST',
    date: '2026-07-31',
    start: '23:30',
    end: '00:30',
    repeatWeekly: false
  },
  {
    id: 'CHARACTERIZATION_TEST_personal_weekly',
    kind: '강사 지도 하 개인작업',
    title: 'CHARACTERIZATION_TEST_ARTIST',
    date: '2026-08-03',
    start: '09:00',
    end: '10:30',
    repeatWeekly: true,
    repeatEndDate: '2026-08-17',
    repeatSkipDates: ['2026-08-10']
  }
]);

function cloneCalendarEvents() {
  return structuredClone(CALENDAR_EVENTS);
}

module.exports = { CALENDAR_EVENTS, cloneCalendarEvents };