document.addEventListener('DOMContentLoaded', () => {
  const currentUser = checkAuth();
  if (currentUser) {
    displayUserInfo(currentUser);
    setupMenuButtons(currentUser);
  }
});

function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function getAccountTypeKey(type) {
  return normalizeAccountType(type).replace(/\s+/g, '');
}

function isAdminAccount(type) {
  return getAccountTypeKey(type) === '어드민';
}

function isStaffAccount(type) {
  return getAccountTypeKey(type) === '스탭';
}

function isExhibitionMemberAccount(type) {
  const key = getAccountTypeKey(type);
  return key === '기획자/작가' || key === '기획자' || key === '작가' || key === '스탭';
}

function normalizeGalleryRole(role) {
  const value = normalizeAccountType(role);
  if (value === '기획자' || value === '작가') {
    return '기획자/작가';
  }
  return value;
}

function getEffectiveGalleryRole(user) {
  const direct = normalizeGalleryRole(user?.galleryRole);
  if (direct) return direct;
  return normalizeGalleryRole(user?.accountType);
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

function hasGalleryAccess(user) {
  const siteAccess = getEffectiveSiteAccess(user);
  return siteAccess === 'gallery' || siteAccess === 'both';
}

function checkAuth() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return null;
  }
  if (!hasGalleryAccess(currentUser)) {
    alert('갤러리 사이트 접근 권한이 없습니다.');
    window.location.href = 'index.html';
    return null;
  }
  return currentUser;
}

function displayUserInfo(currentUser) {
  const userDisplay = document.getElementById('user-display');
  const galleryRole = normalizeAccountType(getEffectiveGalleryRole(currentUser));
  userDisplay.innerHTML = `<strong>${currentUser.name}</strong> (${galleryRole || '미지정'})`;
}

function logout() {
  if (confirm('로그아웃하시겠습니까?')) {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }
}

function setupMenuButtons(currentUser) {
  const menuButtons = document.querySelectorAll('.menu-btn');

  const accountType = getEffectiveGalleryRole(currentUser);
  let allowedPages = [];
  if (isAdminAccount(accountType)) {
    allowedPages = ['exhibitions', 'accounting', 'inventory'];
  } else if (isStaffAccount(accountType)) {
    allowedPages = ['exhibitions', 'inventory'];
  } else if (isExhibitionMemberAccount(accountType)) {
    allowedPages = ['exhibitions'];
  }

  menuButtons.forEach(btn => {
    const page = btn.getAttribute('data-page');
    const canAccess = allowedPages.includes(page);

    if (!canAccess) {
      btn.classList.add('disabled');
      btn.setAttribute('title', '이 기능은 ' + normalizeAccountType(currentUser.accountType) + ' 계정에서 사용할 수 없습니다.');
    }

    btn.addEventListener('click', () => {
      if (canAccess) {
        handleMenuClick(page);
      } else {
        alert('이 페이지에 접근할 권한이 없습니다.');
      }
    });
  });
}

function handleMenuClick(page) {
  switch(page) {
    case 'exhibitions':
      window.location.href = 'exhibitions.html';
      break;
    case 'accounting':
      alert('회계 페이지는 준비 중입니다.');
      break;
    case 'inventory':
      window.location.href = 'inventory.html';
      break;
  }
}