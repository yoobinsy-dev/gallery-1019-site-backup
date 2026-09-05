const test = require('node:test');
const assert = require('node:assert/strict');

const staffControllerModule = require('../../exhibitions/detail/staff-controller');

function createElement() {
  let html = '';
  return {
    children: [],
    className: '',
    style: {},
    textContent: '',
    value: '',
    appendChild(child) {
      this.children.push(child);
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = value;
      if (value === '') this.children = [];
    }
  };
}

function createHarness(overrides = {}) {
  const elements = {
    'invite-modal-title': createElement(),
    'invite-modal-description': createElement(),
    'invite-user-list': createElement(),
    'invite-search': createElement(),
    'invite-modal': createElement()
  };
  const state = {
    exhibition: {
      staff: { planners: [], artists: [2], staffs: [] }
    },
    inviteRole: null,
    inviteSearch: ''
  };
  const users = [
    { id: 1, name: 'Alice Kim', username: 'ALICE', email: 'alice@example.com', galleryRole: '기획자/작가' },
    { id: 2, name: 'Bob Lee', username: 'bob', email: 'bob@example.com', galleryRole: '스탭' }
  ];
  const calls = [];
  const document = {
    createElement,
    getElementById(id) {
      return elements[id];
    },
    querySelectorAll() {
      return overrides.checkboxes || [];
    }
  };
  const controller = staffControllerModule.create({
    state,
    document,
    getCurrentExhibition: () => state.exhibition,
    canManageStaffRoles: () => overrides.canManageStaffRoles !== false,
    getFirstAllowedTab: () => 'exhibition-info',
    getEffectiveGalleryRole: (user) => user.galleryRole,
    normalizeAccountType: (value) => value ? value.toString().trim() : '',
    loadUsers: () => users,
    saveExhibition: () => calls.push('save'),
    switchTab: (tabName) => calls.push(`tab:${tabName}`),
    alert: (message) => calls.push(`alert:${message}`)
  });
  return { calls, controller, elements, state };
}

test('staff controller preserves invite labels, assigned state, search, and modal lifecycle', () => {
  const { controller, elements, state } = createHarness();

  controller.openInviteModal('artists');

  assert.equal(controller.getInviteRoleLabel('artists'), '작가');
  assert.equal(controller.getInviteRoleLabel('unknown'), '관계자');
  assert.equal(elements['invite-modal-title'].textContent, '작가 초대');
  assert.equal(elements['invite-modal-description'].textContent, '모든 사용자 중에서 전시에 참여자를 선택하세요.');
  assert.equal(elements['invite-modal'].style.display, 'flex');
  assert.equal(elements['invite-user-list'].children.length, 2);
  assert.match(elements['invite-user-list'].children[1].innerHTML, /value="2" checked/);

  elements['invite-search'].value = '  ALICE  ';
  controller.filterInviteUsers();
  assert.equal(state.inviteSearch, 'alice');
  assert.equal(elements['invite-user-list'].children.length, 1);
  assert.match(elements['invite-user-list'].children[0].innerHTML, /Alice Kim/);

  controller.closeInviteModal();
  assert.equal(elements['invite-modal'].style.display, 'none');
  assert.equal(state.inviteRole, null);
  assert.equal(state.inviteSearch, '');
});

test('staff controller preserves duplicate removal and save-close-render ordering', () => {
  const { calls, controller, elements, state } = createHarness({
    checkboxes: [
      { checked: true, value: '3' },
      { checked: true, value: '3' },
      { checked: false, value: '4' },
      { checked: true, value: '5' }
    ]
  });
  state.inviteRole = 'staffs';
  state.inviteSearch = 'pending';
  elements['invite-modal'].style.display = 'flex';

  controller.confirmInvite();

  assert.deepEqual(state.exhibition.staff.staffs, [3, 5]);
  assert.deepEqual(calls, ['save', 'tab:staff']);
  assert.equal(elements['invite-modal'].style.display, 'none');
  assert.equal(state.inviteRole, null);
  assert.equal(state.inviteSearch, '');

  state.exhibition.staff.artists = [1, 2, 2];
  controller.removeStaffMember('artists', 2);
  assert.deepEqual(state.exhibition.staff.artists, [1]);
  assert.deepEqual(calls, ['save', 'tab:staff', 'save', 'tab:staff']);
});

test('staff controller preserves permission denial behavior', () => {
  const { calls, controller, state } = createHarness({ canManageStaffRoles: false });

  controller.renderStaffManagement(createElement());
  controller.openInviteModal('artists');
  state.inviteRole = 'artists';
  controller.confirmInvite();
  controller.removeStaffMember('artists', 2);

  assert.deepEqual(calls, [
    'tab:exhibition-info',
    'alert:전시 관계자 관리 권한이 없습니다.',
    'alert:전시 관계자 관리 권한이 없습니다.',
    'alert:전시 관계자 관리 권한이 없습니다.'
  ]);
  assert.deepEqual(state.exhibition.staff.artists, [2]);
});