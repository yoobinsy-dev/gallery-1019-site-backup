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

function checkAuth() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return null;
  }
  return currentUser;
}

function displayUserInfo(currentUser) {
  const userDisplay = document.getElementById('user-display');
  userDisplay.innerHTML = `<strong>${currentUser.name}</strong> (${normalizeAccountType(currentUser.accountType) || '미지정'})`;
}

function logout() {
  if (confirm('로그아웃하시겠습니까?')) {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }
}

function setupMenuButtons(currentUser) {
  const menuButtons = document.querySelectorAll('.menu-btn');

  const accountType = currentUser.accountType;
  let allowedPages = [];
  if (isAdminAccount(accountType)) {
    allowedPages = ['users', 'exhibitions', 'accounting', 'inventory'];
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
    case 'users':
      window.location.href = 'users.html';
      break;
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