(function initializeExhibitionDetailStaffController(root, factory) {
  'use strict';

  const api = factory();
  root.ExhibitionDetailStaffController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStaffControllerModule() {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function getInviteRoleLabel(role) {
      if (role === 'planners') return '기획자';
      if (role === 'artists') return '작가';
      if (role === 'staffs') return '스탭';
      return '관계자';
    }

    function renderStaffManagement(container) {
      if (!options.canManageStaffRoles()) {
        const fallbackTab = options.getFirstAllowedTab() || 'exhibition-info';
        options.switchTab(fallbackTab);
        return;
      }

      const exhibition = options.getCurrentExhibition();
      const planners = exhibition.staff?.planners || [];
      const artists = exhibition.staff?.artists || [];
      const staffs = exhibition.staff?.staffs || [];

      const users = options.loadUsers();
      const candidates = users.filter(user => user.approved && options.normalizeAccountType(options.getEffectiveGalleryRole(user)) === '기획자/작가');

      const roleSection = (role, label, assignedIds) => {
        const section = document.createElement('section');
        section.className = 'role-section';

        const header = document.createElement('div');
        header.className = 'section-heading';
        header.innerHTML = `<h2>${label}</h2><button class="add-exhibition-btn small" onclick="openInviteModal('${role}')">+ 초대</button>`;
        section.appendChild(header);

        const list = document.createElement('div');
        list.className = 'role-list';

        if (assignedIds.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = '아직 초대된 사용자가 없습니다.';
          list.appendChild(empty);
        } else {
          assignedIds.forEach(userId => {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            const row = document.createElement('div');
            row.className = 'role-row';
            row.innerHTML = `
          <div>
            <p class="role-name">${user.name}</p>
            <p class="role-meta">${user.username} · ${user.email}</p>
          </div>
          <button class="action-btn delete-btn" onclick="removeStaffMember('${role}', ${user.id})">제거</button>
        `;
            list.appendChild(row);
          });
        }

        section.appendChild(list);
        return section;
      };

      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '전시 관계자 관리';
      wrapper.appendChild(title);

      wrapper.appendChild(roleSection('planners', '기획자', planners));
      wrapper.appendChild(roleSection('artists', '작가', artists));
      wrapper.appendChild(roleSection('staffs', '스탭', staffs));
      container.appendChild(wrapper);
    }

    function openInviteModal(role) {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      state.inviteRole = role;
      const exhibition = options.getCurrentExhibition();
      const users = options.loadUsers();

      document.getElementById('invite-modal-title').textContent = `${getInviteRoleLabel(role)} 초대`;
      document.getElementById('invite-modal-description').textContent = '모든 사용자 중에서 전시에 참여자를 선택하세요.';

      const listContainer = document.getElementById('invite-user-list');
      listContainer.innerHTML = '';

      const assignedIds = new Set(exhibition.staff?.[role] || []);

      state.inviteSearch = '';
      renderInviteUserList(users, assignedIds);
      document.getElementById('invite-search').value = '';
      document.getElementById('invite-modal').style.display = 'flex';
    }

    function closeInviteModal() {
      document.getElementById('invite-modal').style.display = 'none';
      state.inviteRole = null;
      state.inviteSearch = '';
    }

    function filterInviteUsers() {
      state.inviteSearch = document.getElementById('invite-search').value.trim().toLowerCase();
      const users = options.loadUsers();
      const exhibition = options.getCurrentExhibition();
      const assignedIds = new Set(exhibition.staff?.[state.inviteRole] || []);
      renderInviteUserList(users, assignedIds);
    }

    function renderInviteUserList(users, assignedIds) {
      const listContainer = document.getElementById('invite-user-list');
      listContainer.innerHTML = '';
      const search = state.inviteSearch;

      if (users.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">등록된 사용자가 없습니다.</p>';
        return;
      }

      let renderedCount = 0;

      users.forEach(user => {
        const label = options.normalizeAccountType(options.getEffectiveGalleryRole(user)) || '미지정';
        const text = `${user.name} ${user.username} ${user.email} ${label}`.toLowerCase();
        if (search && !text.includes(search)) return;

        const row = document.createElement('label');
        row.className = 'invite-user-row';
        row.innerHTML = `
      <input type="checkbox" value="${user.id}" ${assignedIds.has(user.id) ? 'checked' : ''}>
      <span>
        <strong>${user.name}</strong> (${user.username}) • ${user.email} • ${label}
      </span>
    `;
        listContainer.appendChild(row);
        renderedCount += 1;
      });

      if (renderedCount === 0) {
        listContainer.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
      }
    }

    function confirmInvite() {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      const role = state.inviteRole;
      if (!role) return;

      const checkboxes = Array.from(document.querySelectorAll('#invite-user-list input[type="checkbox"]'));
      const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.value));

      const exhibition = options.getCurrentExhibition();
      exhibition.staff = exhibition.staff || { planners: [], artists: [], staffs: [] };
      exhibition.staff[role] = Array.from(new Set(selectedIds));
      if (state.exhibition) {
        state.exhibition.staff = exhibition.staff;
      }
      options.saveExhibition();
      closeInviteModal();
      options.switchTab('staff');
    }

    function removeStaffMember(role, userId) {
      if (!options.canManageStaffRoles()) {
        options.alert('전시 관계자 관리 권한이 없습니다.');
        return;
      }

      const exhibition = options.getCurrentExhibition();
      exhibition.staff[role] = (exhibition.staff[role] || []).filter(id => id !== userId);
      if (state.exhibition) {
        state.exhibition.staff = exhibition.staff;
      }
      options.saveExhibition();
      options.switchTab('staff');
    }

    return Object.freeze({
      getInviteRoleLabel,
      renderStaffManagement,
      openInviteModal,
      closeInviteModal,
      filterInviteUsers,
      renderInviteUserList,
      confirmInvite,
      removeStaffMember
    });
  }

  return Object.freeze({ create });
});