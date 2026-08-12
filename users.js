// User Management logic
let currentFilter = 'all';
let userToApprove = null;
let selectedUserIds = [];
let lastUserCheckboxIndex = null;

const SITE_ACCESS_LABELS = {
  pottery: '도예공방 10.19',
  gallery: '10.19 Gallery&Lounge',
  both: '둘 다'
};

const STUDIO_ROLE_VALUES = ['어드민', '강사', '수강생', '작가'];
const GALLERY_ROLE_VALUES = ['어드민', '기획자/작가', '스탭'];

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupFilterButtons();
  initializeUsersPage();
});

window.addEventListener('cloud-sync:state-applied', (event) => {
  const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
  if (keys.includes('users')) {
    loadUsers();
  }
});

function waitForCloudSyncReady(timeoutMs = 4000) {
  const cloudReady = window.cloudSyncReady;
  if (!cloudReady || typeof cloudReady.then !== 'function') {
    return Promise.resolve(window.cloudSyncStatus || null);
  }

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve(window.cloudSyncStatus || null);
    }, timeoutMs);
  });

  return Promise.race([
    cloudReady.catch(() => null),
    timeoutPromise
  ]);
}

async function initializeUsersPage() {
  await waitForCloudSyncReady();
  loadUsers();
}

function checkAuth() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  if (!isDualSiteAdmin(currentUser)) {
    alert('USER 관리 페이지는 양쪽 사이트 모두 어드민 권한을 가진 계정만 접근할 수 있습니다.');
    window.location.href = 'index.html';
    return;
  }
}

function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function getAccountTypeKey(type) {
  return normalizeAccountType(type).replace(/\s+/g, '');
}

function isAdminAccount(type) {
  return getAccountTypeKey(type) === '어드민';
}

function normalizeStudioRole(role) {
  const value = normalizeAccountType(role);
  return STUDIO_ROLE_VALUES.includes(value) ? value : '';
}

function normalizeGalleryRole(role) {
  const value = normalizeAccountType(role);
  if (value === '기획자' || value === '작가') {
    return '기획자/작가';
  }
  return GALLERY_ROLE_VALUES.includes(value) ? value : '';
}

function normalizeSiteAccess(access) {
  const raw = access ? access.toString().trim().toLowerCase() : '';
  if (raw === 'both' || raw === 'all') return 'both';
  if (raw === 'pottery' || raw === 'studio') return 'pottery';
  if (raw === 'gallery') return 'gallery';
  return '';
}

function getEffectiveSiteAccess(user) {
  const direct = normalizeSiteAccess(user?.siteAccess);
  if (direct) return direct;
  return 'gallery';
}

function getEffectiveStudioRole(user) {
  const direct = normalizeStudioRole(user?.studioRole);
  if (direct) return direct;

  if (normalizeSiteAccess(user?.siteAccess) === 'pottery' && isAdminAccount(user?.accountType)) {
    return '어드민';
  }

  return '';
}

function getEffectiveGalleryRole(user) {
  const direct = normalizeGalleryRole(user?.galleryRole);
  if (direct) return direct;
  return normalizeGalleryRole(user?.accountType);
}

function isAdminAnywhere(user) {
  if (getEffectiveStudioRole(user) === '어드민') return true;
  if (getEffectiveGalleryRole(user) === '어드민') return true;
  return isAdminAccount(user?.accountType);
}

function isDualSiteAdmin(user) {
  if (!user) return false;
  if (getEffectiveSiteAccess(user) !== 'both') return false;
  return getEffectiveStudioRole(user) === '어드민'
    && getEffectiveGalleryRole(user) === '어드민';
}

function getSiteAccessLabel(access) {
  return SITE_ACCESS_LABELS[normalizeSiteAccess(access)] || '10.19 Gallery&Lounge';
}

function isStudioRoleRequired(siteAccess) {
  const normalized = normalizeSiteAccess(siteAccess);
  return normalized === 'pottery' || normalized === 'both';
}

function isGalleryRoleRequired(siteAccess) {
  const normalized = normalizeSiteAccess(siteAccess);
  return normalized === 'gallery' || normalized === 'both';
}

function applyRoleFieldVisibility(prefix, siteAccess) {
  const studioGroup = document.querySelector(`label[for="${prefix}-studio-role"]`)?.closest('.form-group');
  const galleryGroup = document.querySelector(`label[for="${prefix}-gallery-role"]`)?.closest('.form-group');

  if (studioGroup) {
    studioGroup.style.display = isStudioRoleRequired(siteAccess) ? '' : 'none';
  }
  if (galleryGroup) {
    galleryGroup.style.display = isGalleryRoleRequired(siteAccess) ? '' : 'none';
  }
}

function syncApprovalAccountTypeOptions() {
  const siteAccess = document.getElementById('approve-site-access')?.value || '';
  applyRoleFieldVisibility('approve', siteAccess);
}

function syncCreateAccountTypeOptions() {
  const siteAccess = document.getElementById('create-site-access')?.value || '';
  applyRoleFieldVisibility('create', siteAccess);
}

function setupFilterButtons() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.getAttribute('data-filter');
      setActiveFilterButtons(currentFilter);
      selectedUserIds = [];
      lastUserCheckboxIndex = null;
      loadUsers();
    });
  });

  setActiveFilterButtons(currentFilter);
}

function setActiveFilterButtons(filter) {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((button) => {
    const isActive = button.getAttribute('data-filter') === filter;
    button.classList.toggle('active', isActive);
  });
}

function persistUsers(users) {
  if (typeof safeSetLocalStorageItem === 'function') {
    return safeSetLocalStorageItem('users', JSON.stringify(users));
  }

  try {
    localStorage.setItem('users', JSON.stringify(users));
    return true;
  } catch (error) {
    console.error('Failed to save users:', error);
    return false;
  }
}

function persistCurrentUser(user) {
  if (typeof safeSetLocalStorageItem === 'function') {
    return safeSetLocalStorageItem('currentUser', JSON.stringify(user));
  }

  try {
    localStorage.setItem('currentUser', JSON.stringify(user));
    return true;
  } catch (error) {
    console.error('Failed to save currentUser:', error);
    return false;
  }
}

function getStoredUsers() {
  return JSON.parse(localStorage.getItem('users')) || [];
}

function getManagedUsers(users) {
  return (users || []).filter((user) => {
    const username = String(user?.username || '').trim().toLowerCase();
    const email = String(user?.email || '').trim().toLowerCase();
    const id = Number(user?.id);

    // Keep hiding only the original seeded legacy admin account.
    const isLegacySeedAdmin = username === 'admin' && id === 1 && email === 'admin@1019.com';
    return !isLegacySeedAdmin;
  });
}

function getFilteredUsers(users) {
  let filteredUsers = getManagedUsers(users);

  if (currentFilter === 'pending') {
    filteredUsers = filteredUsers.filter(u => !u.approved);
  } else if (currentFilter === 'approved') {
    filteredUsers = filteredUsers.filter(u => u.approved);
  }

  filteredUsers.sort((a, b) => {
    if (a.approved === b.approved) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return a.approved ? 1 : -1;
  });

  return filteredUsers;
}

function updateUserSelectionUi(filteredUsers) {
  const ids = filteredUsers.map((user) => user.id);
  selectedUserIds = selectedUserIds.filter((id) => ids.includes(id));

  if (lastUserCheckboxIndex !== null && (lastUserCheckboxIndex < 0 || lastUserCheckboxIndex >= filteredUsers.length)) {
    lastUserCheckboxIndex = null;
  }

  const allSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedUserIds.includes(user.id));

  ['users-select-all-btn', 'users-select-all-btn-bottom'].forEach((buttonId) => {
    const selectAllButton = document.getElementById(buttonId);
    if (selectAllButton) {
      selectAllButton.textContent = allSelected ? '전체 선택 해제' : '전체 선택';
    }
  });

  const selectAllCheckbox = document.getElementById('select-all-users');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = !allSelected && selectedUserIds.length > 0;
  }

  ['users-delete-selected-btn', 'users-delete-selected-btn-bottom'].forEach((buttonId) => {
    const deleteSelectedButton = document.getElementById(buttonId);
    if (deleteSelectedButton) {
      deleteSelectedButton.style.display = selectedUserIds.length > 0 ? 'inline-block' : 'none';
    }
  });
}

function loadUsers() {
  const users = getStoredUsers();
  const filteredUsers = getFilteredUsers(users);
  const tbody = document.getElementById('users-tbody');
  if (!tbody) {
    return;
  }
  tbody.innerHTML = '';

  updateUserSelectionUi(filteredUsers);

  if (filteredUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-users">사용자가 없습니다</td></tr>';
    return;
  }

  filteredUsers.forEach((user, index) => {
    const row = document.createElement('tr');
    row.className = user.approved ? 'user-row approved' : 'user-row pending';
    const isSelected = selectedUserIds.includes(user.id);

    const statusDot = user.approved ? '🟢' : '🔴';
    const studioRole = getEffectiveStudioRole(user);
    const galleryRole = getEffectiveGalleryRole(user);
    const levelLabelParts = [];
    if (studioRole) {
      levelLabelParts.push(`도예공방:${studioRole}`);
    }
    if (galleryRole) {
      levelLabelParts.push(`갤러리:${galleryRole}`);
    }
    const accountType = levelLabelParts.length > 0 ? levelLabelParts.join(' / ') : (user.accountType || '—');
    const siteAccessLabel = !user.approved && !normalizeSiteAccess(user.siteAccess)
      ? '미지정'
      : getSiteAccessLabel(getEffectiveSiteAccess(user));

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="user-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleUserSelection(${user.id}, this.checked, event, ${index})">
      </td>
      <td class="status-col">
        <span class="status-dot" title="${user.approved ? '승인됨' : '대기 중'}">
          ${statusDot}
        </span>
      </td>
      <td>${user.name}</td>
      <td>${user.username}</td>
      <td>${user.phone}</td>
      <td>${user.email}</td>
      <td>${siteAccessLabel}</td>
      <td>${accountType}</td>
      <td class="action-col">
        ${!user.approved ? `
          <button class="action-btn approve-btn" onclick="openApproveModal(${user.id})">
            승인
          </button>
        ` : `
          <button class="action-btn edit-btn" onclick="editUser(${user.id})">
            수정
          </button>
        `}
        <button class="action-btn delete-btn" onclick="deleteUser(${user.id})">
          삭제
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function toggleSelectAllUsers(source) {
  const filteredUsers = getFilteredUsers(getStoredUsers());
  const ids = filteredUsers.map((user) => user.id);
  selectedUserIds = source.checked ? ids : [];
  lastUserCheckboxIndex = null;
  loadUsers();
}

function toggleSelectAllUsersFromButton() {
  const filteredUsers = getFilteredUsers(getStoredUsers());
  const ids = filteredUsers.map((user) => user.id);
  const allSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedUserIds.includes(user.id));
  selectedUserIds = allSelected ? [] : ids;
  lastUserCheckboxIndex = null;
  loadUsers();
}

function toggleUserSelection(userId, checked, event, rowIndex) {
  const filteredUsers = getFilteredUsers(getStoredUsers());
  const currentIndex = typeof rowIndex === 'number'
    ? rowIndex
    : filteredUsers.findIndex((user) => user.id === userId);
  const isShiftRange = Boolean(event && event.shiftKey && lastUserCheckboxIndex !== null && currentIndex !== -1);

  if (isShiftRange) {
    const start = Math.min(lastUserCheckboxIndex, currentIndex);
    const end = Math.max(lastUserCheckboxIndex, currentIndex);
    const rangeIds = filteredUsers.slice(start, end + 1).map((user) => user.id);
    if (checked) {
      selectedUserIds = Array.from(new Set([...selectedUserIds, ...rangeIds]));
    } else {
      selectedUserIds = selectedUserIds.filter((id) => !rangeIds.includes(id));
    }
  } else if (checked) {
    selectedUserIds = Array.from(new Set([...selectedUserIds, userId]));
  } else {
    selectedUserIds = selectedUserIds.filter((id) => id !== userId);
  }

  if (currentIndex !== -1) {
    lastUserCheckboxIndex = currentIndex;
  }

  loadUsers();
}

function openApproveModal(userId) {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => u.id === userId);

  if (!user) return;

  userToApprove = user;
  const modalUserInfo = document.getElementById('modal-user-info');
  modalUserInfo.innerHTML = `<strong>${user.name}</strong> (${user.username})을 승인하시겠습니까?`;

  document.getElementById('approve-site-access').value = '';
  document.getElementById('approve-studio-role').value = '';
  document.getElementById('approve-gallery-role').value = '';
  syncApprovalAccountTypeOptions();
  document.getElementById('approve-modal').style.display = 'flex';
}

function confirmApproval() {
  if (!userToApprove) return;

  const siteAccess = normalizeSiteAccess(document.getElementById('approve-site-access').value);
  const studioRole = normalizeStudioRole(document.getElementById('approve-studio-role').value);
  const galleryRole = normalizeGalleryRole(document.getElementById('approve-gallery-role').value);
  if (!siteAccess) {
    alert('접근 사이트를 선택해주세요.');
    return;
  }

  if (isStudioRoleRequired(siteAccess) && !studioRole) {
    alert('도예공방 권한을 선택해주세요.');
    return;
  }

  if (isGalleryRoleRequired(siteAccess) && !galleryRole) {
    alert('갤러리 권한을 선택해주세요.');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userIndex = users.findIndex(u => u.id === userToApprove.id);

  if (userIndex !== -1) {
    users[userIndex].approved = true;
    users[userIndex].studioRole = isStudioRoleRequired(siteAccess) ? studioRole : null;
    users[userIndex].galleryRole = isGalleryRoleRequired(siteAccess) ? galleryRole : null;
    users[userIndex].siteAccess = siteAccess;
    // Keep legacy field in sync for existing pages that still read accountType.
    users[userIndex].accountType = users[userIndex].galleryRole || users[userIndex].studioRole || users[userIndex].accountType || null;
    const saved = persistUsers(users);
    if (!saved) {
      alert('저장 공간이 부족해 사용자 승인을 저장하지 못했습니다.');
      return;
    }
    refreshCurrentUserIfMatches(users[userIndex]);
  }

  closeApproveModal();
  loadUsers();
}

function refreshCurrentUserIfMatches(user) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (currentUser && currentUser.id === user.id) {
    persistCurrentUser(user);
  }
}

function closeApproveModal() {
  document.getElementById('approve-modal').style.display = 'none';
  userToApprove = null;
}

function openCreateUserModal() {
  document.getElementById('create-name').value = '';
  document.getElementById('create-username').value = '';
  document.getElementById('create-phone').value = '';
  document.getElementById('create-email').value = '';
  document.getElementById('create-password').value = '';
  document.getElementById('create-confirm').value = '';
  document.getElementById('create-site-access').value = '';
  document.getElementById('create-studio-role').value = '';
  document.getElementById('create-gallery-role').value = '';
  syncCreateAccountTypeOptions();
  document.getElementById('create-user-modal').style.display = 'flex';
}

function closeCreateUserModal() {
  const modal = document.getElementById('create-user-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function createUserByAdmin() {
  const name = document.getElementById('create-name').value.trim();
  const username = document.getElementById('create-username').value.trim();
  const phone = document.getElementById('create-phone').value.trim();
  const email = document.getElementById('create-email').value.trim();
  const password = document.getElementById('create-password').value.trim();
  const confirm = document.getElementById('create-confirm').value.trim();
  const siteAccess = normalizeSiteAccess(document.getElementById('create-site-access').value);
  const studioRole = normalizeStudioRole(document.getElementById('create-studio-role').value);
  const galleryRole = normalizeGalleryRole(document.getElementById('create-gallery-role').value);

  if (!name || !username || !phone || !email || !password || !confirm || !siteAccess) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  if (isStudioRoleRequired(siteAccess) && !studioRole) {
    alert('도예공방 권한을 선택해주세요.');
    return;
  }

  if (isGalleryRoleRequired(siteAccess) && !galleryRole) {
    alert('갤러리 권한을 선택해주세요.');
    return;
  }

  if (password.length < 6) {
    alert('비밀번호는 최소 6자 이상이어야 합니다.');
    return;
  }

  if (password !== confirm) {
    alert('비밀번호가 일치하지 않습니다.');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const normalizedName = normalizeText(name);
  const normalizedUsername = normalizeText(username);

  const hasDuplicate = users.some((user) => {
    return normalizeText(user.name) === normalizedName
      || normalizeText(user.username) === normalizedUsername;
  });

  if (hasDuplicate) {
    alert('이미 사용 중인 실명 또는 사용자명이 있습니다.');
    return;
  }

  const newUser = {
    id: Date.now(),
    name,
    username,
    phone,
    email,
    password,
    siteAccess,
    studioRole: isStudioRoleRequired(siteAccess) ? studioRole : null,
    galleryRole: isGalleryRoleRequired(siteAccess) ? galleryRole : null,
    accountType: (isGalleryRoleRequired(siteAccess) ? galleryRole : null) || (isStudioRoleRequired(siteAccess) ? studioRole : null),
    approved: true,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  const saved = persistUsers(users);
  if (!saved) {
    alert('저장 공간이 부족해 계정 생성을 저장하지 못했습니다.');
    return;
  }

  closeCreateUserModal();
  loadUsers();
  alert(`계정이 생성되었습니다.\n아이디: ${username}`);
}

function editUser(userId) {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => u.id === userId);

  if (!user) return;

  const currentSiteAccess = getEffectiveSiteAccess(user);
  const newSiteAccess = normalizeSiteAccess(prompt(
    `${user.name}의 접근 사이트를 선택하세요:\n(pottery / gallery / both)`,
    currentSiteAccess
  ));

  if (!newSiteAccess) {
    return;
  }

  let newStudioRole = normalizeStudioRole(user.studioRole);
  let newGalleryRole = normalizeGalleryRole(user.galleryRole || user.accountType);

  if (isStudioRoleRequired(newSiteAccess)) {
    newStudioRole = normalizeStudioRole(prompt(
      `${user.name}의 도예공방 권한을 선택하세요:\n(어드민 / 강사 / 수강생 / 작가)`,
      newStudioRole || ''
    ));
    if (!newStudioRole) {
      alert('도예공방 권한이 올바르지 않습니다.');
      return;
    }
  } else {
    newStudioRole = '';
  }

  if (isGalleryRoleRequired(newSiteAccess)) {
    newGalleryRole = normalizeGalleryRole(prompt(
      `${user.name}의 갤러리 권한을 선택하세요:\n(어드민 / 기획자/작가 / 스탭)`,
      newGalleryRole || ''
    ));
    if (!newGalleryRole) {
      alert('갤러리 권한이 올바르지 않습니다.');
      return;
    }
  } else {
    newGalleryRole = '';
  }

  const userIndex = users.findIndex(u => u.id === userId);
  users[userIndex].siteAccess = newSiteAccess;
  users[userIndex].studioRole = newStudioRole || null;
  users[userIndex].galleryRole = newGalleryRole || null;
  users[userIndex].accountType = newGalleryRole || newStudioRole || users[userIndex].accountType || null;

  const saved = persistUsers(users);
  if (!saved) {
    alert('저장 공간이 부족해 사용자 정보를 저장하지 못했습니다.');
    return;
  }

  refreshCurrentUserIfMatches(users[userIndex]);
  loadUsers();
}

function deleteUser(userId) {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => u.id === userId);

  if (!user) return;

  if (confirm(`${user.name} (${user.username})을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    const updatedUsers = users.filter(u => u.id !== userId);
    const saved = persistUsers(updatedUsers);
    if (!saved) {
      alert('저장 공간이 부족해 사용자 삭제를 저장하지 못했습니다.');
      return;
    }
    selectedUserIds = selectedUserIds.filter((id) => id !== userId);
    lastUserCheckboxIndex = null;
    loadUsers();
  }
}

function deleteAllUsers() {
  const users = getStoredUsers();
  const filteredUsers = getFilteredUsers(users);
  if (filteredUsers.length === 0) {
    return;
  }

  if (!confirm(`현재 목록의 사용자 ${filteredUsers.length}명을 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }

  const targetIds = new Set(filteredUsers.map((user) => user.id));
  const updatedUsers = users.filter((user) => !targetIds.has(user.id));
  const saved = persistUsers(updatedUsers);
  if (!saved) {
    alert('저장 공간이 부족해 사용자 삭제를 저장하지 못했습니다.');
    return;
  }

  selectedUserIds = [];
  lastUserCheckboxIndex = null;
  loadUsers();
}

function deleteSelectedUsers() {
  if (selectedUserIds.length === 0) {
    return;
  }

  if (!confirm(`선택된 사용자 ${selectedUserIds.length}명을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }

  const users = getStoredUsers();
  const selectedSet = new Set(selectedUserIds);
  const updatedUsers = users.filter((user) => !selectedSet.has(user.id));
  const saved = persistUsers(updatedUsers);
  if (!saved) {
    alert('저장 공간이 부족해 사용자 삭제를 저장하지 못했습니다.');
    return;
  }

  selectedUserIds = [];
  lastUserCheckboxIndex = null;
  loadUsers();
}

function goBack() {
  window.location.href = 'index.html';
}

// Close modal when clicking outside of it
window.addEventListener('click', (event) => {
  const approveModal = document.getElementById('approve-modal');
  const createModal = document.getElementById('create-user-modal');
  if (event.target === approveModal) {
    closeApproveModal();
  }
  if (event.target === createModal) {
    closeCreateUserModal();
  }
});
