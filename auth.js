// Authentication logic
let currentUser = null;
const MAX_PERSISTED_PHOTO_PREVIEW_LENGTH = 280000;

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
    if (typeof value.photoPreviewDataUrl === 'string' && value.photoPreviewDataUrl.length > MAX_PERSISTED_PHOTO_PREVIEW_LENGTH) {
      value.photoPreviewDataUrl = '';
      stripped = true;
    }
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

    let logoutButton = existingBox.querySelector('.logout-btn');
    if (!logoutButton) {
      logoutButton = document.createElement('button');
      logoutButton.className = 'logout-btn';
      logoutButton.textContent = '로그아웃';
      existingBox.appendChild(logoutButton);
    }
    logoutButton.setAttribute('onclick', 'logout()');
    return;
  }

  const userInfoBox = document.createElement('div');
  userInfoBox.className = 'user-info';
  userInfoBox.innerHTML = `
    <span id="user-display">${userLabel}</span>
    <button class="logout-btn" onclick="logout()">로그아웃</button>
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
    return;
  }

  if (canUseRemoteState()) {
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
