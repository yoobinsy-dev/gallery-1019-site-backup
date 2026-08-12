// Authentication logic
let currentUser = null;
const MAX_PERSISTED_PHOTO_PREVIEW_LENGTH = 280000;
const EMERGENCY_RECOVERY_PASSWORD = 'recover1019!';

function isStorageQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22
    || error.code === 1014;
}

function stripHeavyFieldsFromValue(value, aggressive) {
  if (!value || typeof value !== 'object') return false;

  let stripped = false;
  const stripField = (fieldName) => {
    if (typeof value[fieldName] === 'string' && value[fieldName].length > 0) {
      value[fieldName] = '';
      stripped = true;
    }
  };

  stripField('photoDataUrl');
  stripField('imageDataUrl');

  if (aggressive) {
    // Keep lightweight preview thumbnails whenever possible.
    // Removing photoPreviewDataUrl causes user-visible "disappearing image" regressions.
    stripField('fileDataUrl');
    stripField('previewDataUrl');
  }

  Object.keys(value).forEach((key) => {
    const child = value[key];
    if (Array.isArray(child)) {
      child.forEach((item) => {
        if (stripHeavyFieldsFromValue(item, aggressive)) {
          stripped = true;
        }
      });
      return;
    }

    if (child && typeof child === 'object' && stripHeavyFieldsFromValue(child, aggressive)) {
      stripped = true;
    }
  });

  return stripped;
}

function stripHeavyImageFieldsFromExhibitions(exhibitions, aggressive = false) {
  if (!Array.isArray(exhibitions)) return false;

  let stripped = false;
  exhibitions.forEach((exhibition) => {
    if (stripHeavyFieldsFromValue(exhibition, aggressive)) {
      stripped = true;
    }
  });

  return stripped;
}

function compactSerializedExhibitionsValue(serializedValue, aggressive = false) {
  if (typeof serializedValue !== 'string') return null;
  try {
    const parsed = JSON.parse(serializedValue);
    const changed = stripHeavyImageFieldsFromExhibitions(parsed, aggressive);
    if (!changed) return null;
    return JSON.stringify(parsed);
  } catch (error) {
    return null;
  }
}

function compactStoredExhibitions(aggressive = false) {
  const raw = localStorage.getItem('exhibitions');
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const changed = stripHeavyImageFieldsFromExhibitions(parsed, aggressive);
    if (!changed) return false;
    localStorage.setItem('exhibitions', JSON.stringify(parsed));
    return true;
  } catch (error) {
    return false;
  }
}

function safeSetLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      console.error('Failed to save localStorage key:', key, error);
      return false;
    }

    // First retry with compacted exhibition payload when writing exhibitions itself.
    if (key === 'exhibitions') {
      const compactModes = [false, true];
      for (const aggressive of compactModes) {
        const compactedValue = compactSerializedExhibitionsValue(value, aggressive);
        if (!compactedValue) continue;

        try {
          localStorage.setItem(key, compactedValue);
          if (aggressive) {
            console.warn('Saved exhibitions after aggressive compaction of preview/file payload.');
          } else {
            console.warn('Saved exhibitions after compacting image payload.');
          }
          return true;
        } catch (retryError) {
          // Continue to generic compaction retry path.
        }
      }
    }

    // Otherwise compact existing exhibitions to free up space, then retry.
    const compactModes = [false, true];
    for (const aggressive of compactModes) {
      const compactedStorage = compactStoredExhibitions(aggressive);
      if (!compactedStorage) continue;

      try {
        localStorage.setItem(key, value);
        if (aggressive) {
          console.warn('Saved localStorage after aggressive compaction of preview/file payload.');
        } else {
          console.warn('Saved localStorage after compacting stored image payload.');
        }
        return true;
      } catch (retryError) {
        if (!isStorageQuotaError(retryError)) {
          console.error('Failed to save localStorage key after compaction:', key, retryError);
          return false;
        }
      }
    }

    console.error('Failed to save localStorage key due to storage quota:', key, error);
    return false;
  }
}

window.safeSetLocalStorageItem = safeSetLocalStorageItem;

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  renderGlobalUserInfoBox();
  const loginForm = document.getElementById('login-id');
  if (loginForm) {
    loginForm.focus();
  }
});

function normalizeAccountTypeLabel(type) {
  return type ? type.toString().trim() : '';
}

function ensureProfileEditStyles() {
  if (document.getElementById('profile-edit-styles')) return;

  const style = document.createElement('style');
  style.id = 'profile-edit-styles';
  style.textContent = `
    .user-pill-actions {
      display: inline-flex;
      gap: 8px;
      margin-left: 10px;
      align-items: center;
    }

    .edit-account-btn {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #111827;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .edit-account-btn:hover {
      background: #e5e7eb;
    }

    .profile-edit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
      box-sizing: border-box;
    }

    .profile-edit-modal {
      width: 100%;
      max-width: 480px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .profile-edit-header {
      padding: 16px 18px;
      border-bottom: 1px solid #e5e7eb;
    }

    .profile-edit-title {
      margin: 0;
      font-size: 18px;
      color: #111827;
    }

    .profile-edit-body {
      padding: 16px 18px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .profile-edit-body label {
      font-size: 13px;
      color: #374151;
      font-weight: 600;
    }

    .profile-edit-body input {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .profile-edit-note {
      margin: 2px 0 0;
      color: #6b7280;
      font-size: 12px;
    }

    .profile-edit-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 18px 18px;
    }

    .profile-edit-btn {
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .profile-edit-cancel {
      background: #f3f4f6;
      color: #111827;
    }

    .profile-edit-save {
      background: #111827;
      color: #ffffff;
    }

    .profile-edit-message {
      min-height: 18px;
      font-size: 12px;
      color: #b91c1c;
      margin-top: 2px;
    }
  `;

  document.head.appendChild(style);
}

function ensureProfileEditModal() {
  ensureProfileEditStyles();
  if (document.getElementById('profile-edit-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'profile-edit-overlay';
  overlay.className = 'profile-edit-overlay';
  overlay.innerHTML = `
    <div class="profile-edit-modal">
      <div class="profile-edit-header">
        <h3 class="profile-edit-title">계정 수정</h3>
      </div>
      <div class="profile-edit-body">
        <label for="profile-edit-name">실명</label>
        <input id="profile-edit-name" type="text" autocomplete="name">

        <label for="profile-edit-username">사용자명</label>
        <input id="profile-edit-username" type="text" autocomplete="username">

        <label for="profile-edit-email">이메일</label>
        <input id="profile-edit-email" type="email" autocomplete="email">

        <label for="profile-edit-phone">전화번호</label>
        <input id="profile-edit-phone" type="tel" autocomplete="tel">

        <label for="profile-edit-password">새 비밀번호 (선택)</label>
        <input id="profile-edit-password" type="password" autocomplete="new-password">

        <label for="profile-edit-confirm">새 비밀번호 확인</label>
        <input id="profile-edit-confirm" type="password" autocomplete="new-password">

        <p class="profile-edit-note">접근 사이트/권한은 여기서 수정할 수 없습니다.</p>
        <div id="profile-edit-message" class="profile-edit-message"></div>
      </div>
      <div class="profile-edit-footer">
        <button class="profile-edit-btn profile-edit-cancel" onclick="closeProfileEditModal()">취소</button>
        <button class="profile-edit-btn profile-edit-save" onclick="saveProfileEdit()">저장</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeProfileEditModal();
    }
  });

  document.body.appendChild(overlay);
}

function getCurrentUserRecordIndex(users, activeUser) {
  if (!Array.isArray(users) || !activeUser) return -1;

  const currentId = Number(activeUser.id);
  if (Number.isFinite(currentId) && currentId > 0) {
    const byId = users.findIndex((user) => Number(user?.id) === currentId);
    if (byId !== -1) return byId;
  }

  const normalizedUsername = normalizeLoginValue(activeUser.username);
  const normalizedEmail = normalizeLoginValue(activeUser.email);
  const normalizedPhone = normalizeLoginValue(activeUser.phone);
  const normalizedName = normalizeLoginValue(activeUser.name);

  return users.findIndex((user) => {
    if (!user || typeof user !== 'object') return false;
    return normalizeLoginValue(user.username) === normalizedUsername
      || normalizeLoginValue(user.email) === normalizedEmail
      || normalizeLoginValue(user.phone) === normalizedPhone
      || normalizeLoginValue(user.name) === normalizedName;
  });
}

function showProfileEditMessage(message) {
  const messageEl = document.getElementById('profile-edit-message');
  if (!messageEl) return;
  messageEl.textContent = message || '';
}

function openProfileEditModal() {
  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  if (!activeUser) return;

  ensureProfileEditModal();

  const overlay = document.getElementById('profile-edit-overlay');
  if (!overlay) return;

  document.getElementById('profile-edit-name').value = activeUser.name || '';
  document.getElementById('profile-edit-username').value = activeUser.username || '';
  document.getElementById('profile-edit-email').value = activeUser.email || '';
  document.getElementById('profile-edit-phone').value = activeUser.phone || '';
  document.getElementById('profile-edit-password').value = '';
  document.getElementById('profile-edit-confirm').value = '';
  showProfileEditMessage('');

  overlay.style.display = 'flex';
}

function closeProfileEditModal() {
  const overlay = document.getElementById('profile-edit-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  showProfileEditMessage('');
}

function saveProfileEdit() {
  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  if (!activeUser) {
    showProfileEditMessage('로그인 정보가 없어 수정할 수 없습니다.');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const userIndex = getCurrentUserRecordIndex(users, activeUser);
  if (userIndex === -1) {
    showProfileEditMessage('사용자 계정을 찾을 수 없습니다.');
    return;
  }

  const name = document.getElementById('profile-edit-name').value.trim();
  const username = document.getElementById('profile-edit-username').value.trim();
  const email = document.getElementById('profile-edit-email').value.trim();
  const phone = document.getElementById('profile-edit-phone').value.trim();
  const newPassword = document.getElementById('profile-edit-password').value.trim();
  const confirmPassword = document.getElementById('profile-edit-confirm').value.trim();

  if (!name || !username || !email || !phone) {
    showProfileEditMessage('실명, 사용자명, 이메일, 전화번호를 모두 입력하세요.');
    return;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      showProfileEditMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showProfileEditMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }
  }

  const normalizedName = normalizeLoginValue(name);
  const normalizedUsername = normalizeLoginValue(username);
  const duplicateIdentity = users.some((user, index) => {
    if (!user || typeof user !== 'object') return false;
    if (index === userIndex) return false;
    return normalizeLoginValue(user.name) === normalizedName
      || normalizeLoginValue(user.username) === normalizedUsername;
  });

  if (duplicateIdentity) {
    showProfileEditMessage('이미 사용 중인 실명 또는 사용자명입니다.');
    return;
  }

  const updatedUser = {
    ...users[userIndex],
    name,
    username,
    email,
    phone
  };

  if (newPassword) {
    updatedUser.password = newPassword;
  }

  users[userIndex] = updatedUser;

  const savedUsers = safeSetLocalStorageItem('users', JSON.stringify(users));
  if (!savedUsers) {
    showProfileEditMessage('저장 공간이 부족해 계정 수정을 저장하지 못했습니다.');
    return;
  }

  currentUser = updatedUser;
  const savedCurrentUser = safeSetLocalStorageItem('currentUser', JSON.stringify(updatedUser));
  if (!savedCurrentUser) {
    showProfileEditMessage('로그인 상태 저장에 실패했습니다. 다시 시도해 주세요.');
    return;
  }

  renderGlobalUserInfoBox();
  closeProfileEditModal();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('auth:profile-updated', {
      detail: { user: updatedUser }
    }));
  }
}

window.openProfileEditModal = openProfileEditModal;
window.closeProfileEditModal = closeProfileEditModal;
window.saveProfileEdit = saveProfileEdit;

function renderGlobalUserInfoBox() {
  const activeUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  const existingBox = document.querySelector('.user-info');

  if (!activeUser) {
    if (existingBox) {
      existingBox.remove();
    }
    return;
  }

  const accountTypeLabel = normalizeAccountTypeLabel(activeUser.accountType) || '미지정';
  const userLabel = `<strong>${activeUser.name}</strong> (${accountTypeLabel})`;

  if (existingBox) {
    const userDisplay = existingBox.querySelector('#user-display');
    if (userDisplay) {
      userDisplay.innerHTML = userLabel;
    }

    let actionWrap = existingBox.querySelector('.user-pill-actions');
    if (!actionWrap) {
      actionWrap = document.createElement('span');
      actionWrap.className = 'user-pill-actions';
      existingBox.appendChild(actionWrap);
    }

    let editButton = existingBox.querySelector('.edit-account-btn');
    if (!editButton) {
      editButton = document.createElement('button');
      editButton.className = 'edit-account-btn';
      editButton.textContent = '계정 수정';
      actionWrap.appendChild(editButton);
    }
    editButton.setAttribute('onclick', 'openProfileEditModal()');

    let logoutButton = existingBox.querySelector('.logout-btn');
    if (!logoutButton) {
      logoutButton = document.createElement('button');
      logoutButton.className = 'logout-btn';
      logoutButton.textContent = '로그아웃';
      actionWrap.appendChild(logoutButton);
    }
    logoutButton.setAttribute('onclick', 'logout()');
    return;
  }

  const userInfoBox = document.createElement('div');
  userInfoBox.className = 'user-info';
  userInfoBox.innerHTML = `
    <span id="user-display">${userLabel}</span>
    <span class="user-pill-actions">
      <button class="edit-account-btn" onclick="openProfileEditModal()">계정 수정</button>
      <button class="logout-btn" onclick="logout()">로그아웃</button>
    </span>
  `;
  document.body.prepend(userInfoBox);
}

function logout() {
  if (confirm('로그아웃하시겠습니까?')) {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }
}

window.logout = logout;

function toggleForm() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  
  if (loginForm.classList.contains('active')) {
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
  } else {
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
  }
  
  clearMessage();
}

function normalizeLoginValue(value) {
  return value ? value.toString().trim().toLowerCase() : '';
}

function handleLogin() {
  const id = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!id || !password) {
    showMessage('ID와 비밀번호를 입력하세요.', 'error');
    return;
  }

  const normalizedId = normalizeLoginValue(id);
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const user = users.find(u => {
    const normalizedName = normalizeLoginValue(u.name);
    const normalizedUsername = normalizeLoginValue(u.username);
    const normalizedPhone = normalizeLoginValue(u.phone);
    const normalizedEmail = normalizeLoginValue(u.email);
    return (normalizedName === normalizedId || normalizedUsername === normalizedId || normalizedPhone === normalizedId || normalizedEmail === normalizedId) && u.password === password;
  });

  if (!user) {
    showMessage('ID 또는 비밀번호가 잘못되었습니다.', 'error');
    return;
  }

  // Log the user in
  currentUser = user;
  const savedCurrentUser = safeSetLocalStorageItem('currentUser', JSON.stringify(currentUser));
  if (!savedCurrentUser) {
    showMessage('저장 공간이 부족해 로그인 상태를 저장하지 못했습니다.', 'error');
    return;
  }
  showMessage('로그인 성공! 잠시 후 대시보드로 이동합니다...', 'success');

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1500);
}

function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const confirmPassword = document.getElementById('signup-confirm').value.trim();

  if (!name || !username || !email || !phone || !password || !confirmPassword) {
    showMessage('모든 필드를 입력하세요.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showMessage('비밀번호가 일치하지 않습니다.', 'error');
    return;
  }

  if (password.length < 6) {
    showMessage('비밀번호는 최소 6자 이상이어야 합니다.', 'error');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users')) || [];
  const normalizedName = normalizeLoginValue(name);
  const normalizedUsername = normalizeLoginValue(username);

  // Name and username must remain unique across all accounts.
  const hasDuplicateIdentity = users.some((user) => {
    return normalizeLoginValue(user.name) === normalizedName
      || normalizeLoginValue(user.username) === normalizedUsername;
  });

  if (hasDuplicateIdentity) {
    showMessage('이미 사용 중인 실명 또는 사용자명입니다.', 'error');
    return;
  }

  // Create new user
  const newUser = {
    id: Date.now(),
    name: name,
    username: username,
    email: email,
    phone: phone,
    password: password,
    accountType: null, // Will be assigned by admin
    approved: false,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  const savedUsers = safeSetLocalStorageItem('users', JSON.stringify(users));
  if (!savedUsers) {
    showMessage('저장 공간이 부족해 회원가입 정보를 저장하지 못했습니다.', 'error');
    return;
  }

  showMessage('회원가입 성공! 관리자의 승인을 기다려주세요. 로그인 페이지로 이동합니다...', 'success');

  setTimeout(() => {
    // Clear form
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-username').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-phone').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-confirm').value = '';

    // Toggle back to login form
    document.getElementById('signup-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
  }, 2000);
}

function showMessage(message, type) {
  const messageDiv = document.getElementById('auth-message');
  messageDiv.textContent = message;
  messageDiv.className = 'auth-message ' + type;
  messageDiv.style.display = 'block';
}

function clearMessage() {
  const messageDiv = document.getElementById('auth-message');
  messageDiv.textContent = '';
  messageDiv.className = 'auth-message';
  messageDiv.style.display = 'none';
}

function loadCurrentUser() {
  const stored = localStorage.getItem('currentUser');
  if (stored) {
    currentUser = JSON.parse(stored);
  }
}

function canUseRemoteState() {
  return typeof window !== 'undefined' && window.location && !window.location.protocol.startsWith('file');
}

function hasPasswordValue(user) {
  return Boolean(String(user?.password || '').trim());
}

function isAdminRoleLabel(label) {
  const value = String(label || '').trim();
  return value === '어드민';
}

function hasAnyAdminAccount(users) {
  return (users || []).some((user) => {
    if (!user || typeof user !== 'object') return false;
    const accountType = String(user.accountType || '').trim();
    const studioRole = String(user.studioRole || '').trim();
    const galleryRole = String(user.galleryRole || '').trim();
    return isAdminRoleLabel(accountType) || isAdminRoleLabel(studioRole) || isAdminRoleLabel(galleryRole);
  });
}

function repairUsersMissingPasswords() {
  if (!isLoginPage()) return false;

  const rawUsers = JSON.parse(localStorage.getItem('users'));
  const users = Array.isArray(rawUsers) ? rawUsers : [];
  if (users.length === 0) return false;

  let changed = false;
  users.forEach((user) => {
    if (!user || typeof user !== 'object') return;
    if (!hasPasswordValue(user)) {
      user.password = EMERGENCY_RECOVERY_PASSWORD;
      changed = true;
    }
  });

  if (!hasAnyAdminAccount(users)) {
    const maxId = users.reduce((acc, user) => {
      const id = Number(user && user.id);
      return Number.isFinite(id) && id > acc ? id : acc;
    }, 0);

    users.push({
      id: maxId + 1,
      name: '복구 관리자',
      username: 'recoveryadmin',
      email: 'recovery@1019.com',
      phone: '010-1019-1019',
      password: EMERGENCY_RECOVERY_PASSWORD,
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    });
    changed = true;
  }

  if (!changed) return false;

  safeSetLocalStorageItem('users', JSON.stringify(users));
  if (typeof window !== 'undefined') {
    window.__authRecoveryNotice = `복구 모드: 누락된 비밀번호를 임시 비밀번호(${EMERGENCY_RECOVERY_PASSWORD})로 복구했습니다.`;
  }
  return true;
}

function isLocalPreviewEnvironment() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const host = (window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isLoginPage() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const path = window.location.pathname || '';
  return path.endsWith('/login.html') || path === '/login.html' || path === 'login.html';
}

function waitForCloudSyncReady(timeoutMs = 4000) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

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

async function seedDefaultUsersIfNeeded() {
  if (!isLoginPage()) {
    return;
  }

  const existingUsers = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    return;
  }

  const syncStatus = await waitForCloudSyncReady();
  const usersAfterSync = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(usersAfterSync) && usersAfterSync.length > 0) {
    repairUsersMissingPasswords();
    return;
  }

  if (canUseRemoteState() && !isLocalPreviewEnvironment()) {
    const remoteReachable = Boolean(syncStatus && syncStatus.remoteReachable);
    const remoteHasUsers = Boolean(syncStatus && syncStatus.hadRemoteData && syncStatus.hadRemoteData.users);

    if (remoteHasUsers) {
      return;
    }

    if (!remoteReachable) {
      console.warn('Skipping default user seeding because remote sync is unreachable.');
      return;
    }
  }

  seedDefaultUsers();
  repairUsersMissingPasswords();
}

function ensureLocalPreviewDualSiteAdmin() {
  if (!isLocalPreviewEnvironment()) {
    return;
  }

  const rawUsers = JSON.parse(localStorage.getItem('users'));
  const users = Array.isArray(rawUsers) ? rawUsers : [];

  let changed = false;
  const now = new Date().toISOString();

  const applyDualAdminFields = (user) => {
    if (!user || typeof user !== 'object') return;

    if (user.accountType !== '어드민') {
      user.accountType = '어드민';
      changed = true;
    }
    if (user.approved !== true) {
      user.approved = true;
      changed = true;
    }
    if (user.siteAccess !== 'both') {
      user.siteAccess = 'both';
      changed = true;
    }
    if (user.studioRole !== '어드민') {
      user.studioRole = '어드민';
      changed = true;
    }
    if (user.galleryRole !== '어드민') {
      user.galleryRole = '어드민';
      changed = true;
    }
  };

  const candidates = users.filter((user) => {
    const username = normalizeLoginValue(user && user.username);
    const email = normalizeLoginValue(user && user.email);
    return username === 'admin'
      || username === 'yoobinsy'
      || email === 'admin@1019.com'
      || email === 'yoobinsy@gmail.com';
  });

  if (candidates.length > 0) {
    candidates.forEach((user) => applyDualAdminFields(user));
  } else {
    const maxId = users.reduce((acc, user) => {
      const id = Number(user && user.id);
      return Number.isFinite(id) && id > acc ? id : acc;
    }, 0);

    users.push({
      id: maxId + 1,
      name: '로컬 어드민',
      username: 'localadmin',
      email: 'localadmin@1019.com',
      phone: '010-1019-1019',
      password: 'localadmin123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: now
    });
    changed = true;
  }

  if (changed) {
    safeSetLocalStorageItem('users', JSON.stringify(users));
  }
}

function registerLocalPreviewAdminGuards() {
  if (!isLocalPreviewEnvironment()) {
    return;
  }

  waitForCloudSyncReady().finally(() => {
    ensureLocalPreviewDualSiteAdmin();
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (keys.includes('users')) {
      ensureLocalPreviewDualSiteAdmin();
    }
  });
}

function seedDefaultUsers() {
  const users = JSON.parse(localStorage.getItem('users'));
  if (Array.isArray(users) && users.length > 0) {
    return;
  }

  const initialUsers = [];
  const defaultUsers = [
    {
      id: 1,
      name: '관리자',
      username: 'admin',
      email: 'admin@1019.com',
      phone: '010-0000-0000',
      password: 'admin123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      name: '기획자 테스트',
      username: 'planner',
      email: 'planner@1019.com',
      phone: '010-1111-1111',
      password: 'planner123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 3,
      name: '작가 테스트',
      username: 'artist',
      email: 'artist@1019.com',
      phone: '010-2222-2222',
      password: 'artist123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 4,
      name: '이수민',
      username: 'sumin',
      email: 'sumin@example.com',
      phone: '010-3333-3333',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 5,
      name: '김현우',
      username: 'hyunwoo',
      email: 'hyunwoo@example.com',
      phone: '010-4444-4444',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 6,
      name: '박지윤',
      username: 'jiyoon',
      email: 'jiyoon@example.com',
      phone: '010-5555-5555',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 7,
      name: '최민준',
      username: 'minjun',
      email: 'minjun@example.com',
      phone: '010-6666-6666',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 8,
      name: '정서연',
      username: 'seoyeon',
      email: 'seoyeon@example.com',
      phone: '010-7777-7777',
      password: 'test123',
      accountType: '기획자/작가',
      approved: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 9,
      name: 'yoobinsy',
      username: 'yoobinsy',
      email: 'yoobinsy@gmail.com',
      phone: '010-1234-5678',
      password: 'test123',
      accountType: '어드민',
      siteAccess: 'both',
      studioRole: '어드민',
      galleryRole: '어드민',
      approved: true,
      createdAt: new Date().toISOString()
    }
  ];

  defaultUsers.forEach(defaultUser => {
    initialUsers.push(defaultUser);
  });

  safeSetLocalStorageItem('users', JSON.stringify(initialUsers));
}

seedDefaultUsersIfNeeded();
waitForCloudSyncReady().finally(() => {
  const recovered = repairUsersMissingPasswords();
  if (recovered && typeof showMessage === 'function') {
    showMessage(window.__authRecoveryNotice || '복구 모드가 적용되었습니다.', 'success');
  }
});
ensureLocalPreviewDualSiteAdmin();
registerLocalPreviewAdminGuards();
