const test = require('node:test');
const assert = require('node:assert/strict');

const quickCreateController = require('../../master-calendar/quick-create-controller');

test('quick-create controller preserves personal drag preview and final modal preset reset', () => {
  const overlay = {
    children: [],
    appendChild(element) {
      this.children.push(element);
      element.parentNode = this;
    },
    removeChild(element) {
      this.children = this.children.filter((child) => child !== element);
      element.parentNode = null;
    }
  };
  const document = {
    querySelector(selector) {
      assert.equal(selector, '#calendar-body .events-overlay');
      return overlay;
    },
    createElement(tagName) {
      assert.equal(tagName, 'div');
      return { className: '', innerHTML: '', style: {}, parentNode: null };
    }
  };
  const state = {
    weekStart: '2026-08-03',
    masterEdit: { active: false },
    masterCreate: {
      active: false,
      mode: '',
      dayIndex: null,
      anchorSlot: null,
      startSlot: null,
      endSlot: null,
      overlayEl: null,
      previewEl: null
    }
  };
  const modalPresets = [];
  const controller = quickCreateController.create({
    state,
    document,
    SLOT_HEIGHT: 30,
    canCreateFromBaseRule: () => true,
    getBaseRuleForSlot: () => ({ type: '개인작업' }),
    formatDateInput: (value) => value,
    addDays: (_date, days) => `2026-08-0${3 + days}`,
    slotToTime: (slot) => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`,
    buildDailyOccupancyMap: (date) => ({ date }),
    findLane: () => 1,
    openEventModal: (preset) => modalPresets.push(preset)
  });
  let prevented = 0;

  controller.startMasterCreate({ button: 0, preventDefault() { prevented += 1; } }, 2, 4, { type: '개인작업' });
  const preview = state.masterCreate.previewEl;
  assert.equal(prevented, 1);
  assert.equal(overlay.children.length, 1);
  assert.equal(preview.className, 'event-bubble kind-personal master-preview-bubble');
  assert.equal(preview.innerHTML, '<strong>새 일정</strong>');
  assert.equal(preview.style.top, '121px');
  assert.equal(preview.style.height, '28px');

  controller.moveMasterCreate(2, 6);
  assert.equal(state.masterCreate.previewEl, preview);
  assert.equal(overlay.children.length, 1);
  assert.equal(preview.style.height, '88px');

  controller.finalizeMasterCreate();
  assert.deepEqual(modalPresets, [{
    date: '2026-08-05',
    start: '02:00',
    end: '03:30',
    kind: '개인작업'
  }]);
  assert.equal(overlay.children.length, 0);
  assert.deepEqual(state.masterCreate, {
    active: false,
    mode: '',
    dayIndex: null,
    anchorSlot: null,
    startSlot: null,
    endSlot: null,
    overlayEl: null,
    previewEl: null
  });
});