function normalizeSiteAccess(access) {
  const raw = access ? access.toString().trim().toLowerCase() : '';
  if (raw === 'both' || raw === 'all') return 'both';
  if (raw === 'pottery' || raw === 'studio') return 'pottery';
  if (raw === 'gallery') return 'gallery';
  return '';
}

function hasPotteryAccess(user) {
  const siteAccess = normalizeSiteAccess(user?.siteAccess);
  return siteAccess === 'pottery' || siteAccess === 'both';
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
  }
});
