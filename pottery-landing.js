function normalizeSiteAccess(access) {
  const raw = access ? access.toString().trim().toLowerCase() : '';
  if (raw === 'both' || raw === 'all') return 'both';
  if (raw === 'pottery' || raw === 'studio') return 'pottery';
  if (raw === 'gallery') return 'gallery';
  return '';
}

function normalizeStudioRole(role) {
  const value = role ? role.toString().trim() : '';
  const allowed = ['어드민', '강사', '수강생', '작가'];
  return allowed.includes(value) ? value : '';
}

function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function getEffectiveStudioRole(user) {
  const direct = normalizeStudioRole(user?.studioRole);
  if (direct) return direct;

  const accountType = normalizeAccountType(user?.accountType);
  const siteAccess = normalizeSiteAccess(user?.siteAccess);
  if ((siteAccess === 'pottery' || siteAccess === 'both') && accountType === '어드민') {
    return '어드민';
  }
  if (accountType === '강사') return '강사';
  if (accountType === '작가') return '작가';
  if (accountType === '수강생') return '수강생';
  return '';
}

function hasPotteryAccess(user) {
  const siteAccess = normalizeSiteAccess(user?.siteAccess);
  return siteAccess === 'pottery' || siteAccess === 'both';
}

function getPotteryAllowedPagesByRole(role) {
  if (role === '어드민') {
    return [
      'pottery-workshop.html',
      'pottery-master-calendar.html',
      'pottery-students.html',
      'pottery-personal-work.html',
      'pottery-material-orders.html',
      'pottery-accounting.html',
      'pottery-exhibition-works.html'
    ];
  }

  if (role === '강사') {
    return ['pottery-workshop.html', 'pottery-master-calendar.html', 'pottery-students.html'];
  }

  if (role === '작가') {
    return ['pottery-workshop.html', 'pottery-master-calendar.html'];
  }

  return [];
}

function getCurrentPageName() {
  const path = window.location.pathname || '';
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'index.html';
}

function lockElementWithRoleMessage(el) {
  if (!el) return;
  el.classList.add('is-locked');
  el.setAttribute('aria-disabled', 'true');
  el.setAttribute('data-locked-message', '계정 등급으로 인해 선택 불가능');
  el.setAttribute('title', '계정 등급으로 인해 선택 불가능');
}

function applyWorkshopCardAccess(role) {
  const cards = Array.from(document.querySelectorAll('.pottery-card'));
  if (!cards.length) return;

  const allowed = new Set(getPotteryAllowedPagesByRole(role));
  cards.forEach((card) => {
    const href = String(card.getAttribute('href') || '').trim();
    const page = href.split('/').pop();
    const canAccess = allowed.has(page);
    const titleEl = card.querySelector('h2');

    if (role === '강사' && page === 'pottery-students.html' && titleEl) {
      titleEl.textContent = '나의 수강생 관리';
    }

    if (canAccess) return;
    lockElementWithRoleMessage(card);
    card.setAttribute('tabindex', '-1');
    card.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  if (!hasPotteryAccess(currentUser)) {
    alert('도예공방 10.19 접근 권한이 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  const role = getEffectiveStudioRole(currentUser);
  if (!role) {
    alert('계정 등급으로 인해 선택 불가능');
    window.location.href = 'index.html';
    return;
  }
  if (role === '수강생') {
    alert('현재 계정은 도예공방 페이지 접근 권한이 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  const page = getCurrentPageName();
  const allowedPages = getPotteryAllowedPagesByRole(role);
  if (!allowedPages.includes(page)) {
    alert('계정 등급으로 인해 선택 불가능');
    window.location.href = role === '작가' ? 'pottery-master-calendar.html' : 'pottery-workshop.html';
    return;
  }

  if (page === 'pottery-workshop.html') {
    applyWorkshopCardAccess(role);
  }
});
