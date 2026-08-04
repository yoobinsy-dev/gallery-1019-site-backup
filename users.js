// User Management logic
let currentFilter = 'all';
let userToApprove = null;
let selectedUserIds = [];
let lastUserCheckboxIndex = null;

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
  if (!currentUser || currentUser.accountType !== '어드민') {
    alert('관리자만 접근할 수 있습니다.');
    window.location.href = 'login.html';
  }
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
  return (users || []).filter(u => u.username !== 'admin' || u.id === 1);
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
    tbody.innerHTML = '<tr><td colspan="8" class="no-users">사용자가 없습니다</td></tr>';
    return;
  }

  filteredUsers.forEach((user, index) => {
    const row = document.createElement('tr');
    row.className = user.approved ? 'user-row approved' : 'user-row pending';
    const isSelected = selectedUserIds.includes(user.id);

    const statusDot = user.approved ? '🟢' : '🔴';
    const accountType = user.accountType || '—';

    row.innerHTML = `
      <td class="checkbox-col">
        <input type="checkbox" class="user-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleUserSelection(${user.id}, this.checked, event, ${index})">
      </td>
      <td class="status-col">
        <span class="status-dot" title="${user.approved ? '승인됨' : '대기 중'}">
          ${statusDot}
        </span>
      </td>
      <td>${accountType}</td>
      <td>${user.name}</td>
      <td>${user.username}</td>
      <td>${user.phone}</td>
      <td>${user.email}</td>
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

  document.getElementById('account-type').value = '';
  document.getElementById('approve-modal').style.display = 'flex';
}

function confirmApproval() {
  if (!userToApprove) return;

  const accountType = document.getElementById('account-type').value;
  if (!accountType) {
    alert('계정 타입을 선택해주세요.');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userIndex = users.findIndex(u => u.id === userToApprove.id);

  if (userIndex !== -1) {
    users[userIndex].approved = true;
    users[userIndex].accountType = accountType;
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
  document.getElementById('create-account-type').value = '';
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
  const accountType = document.getElementById('create-account-type').value;

  if (!name || !username || !phone || !email || !password || !confirm || !accountType) {
    alert('모든 필드를 입력해주세요.');
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
    accountType,
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
  // Placeholder for editing user account type
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => u.id === userId);

  if (!user) return;

  const newAccountType = prompt(`${user.name}의 새 계정 타입을 선택하세요:\n(어드민 / 기획자/작가 / 스탭)`, user.accountType);

  if (newAccountType && ['어드민', '기획자/작가', '기획자', '작가', '스탭'].includes(newAccountType)) {
    const userIndex = users.findIndex(u => u.id === userId);
    users[userIndex].accountType = newAccountType;
    const saved = persistUsers(users);
    if (!saved) {
      alert('저장 공간이 부족해 사용자 정보를 저장하지 못했습니다.');
      return;
    }
    refreshCurrentUserIfMatches(users[userIndex]);
    loadUsers();
  }
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
