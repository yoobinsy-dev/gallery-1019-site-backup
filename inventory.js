function getCurrentUser() {
  return JSON.parse(localStorage.getItem('currentUser')) || null;
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

function isStaffAccount(type) {
  return getAccountTypeKey(type) === '스탭';
}

function getCurrentUserId(user) {
  const id = Number(user?.id);
  return Number.isFinite(id) ? id : null;
}

function isInvitedToExhibition(exhibition, userId) {
  if (!Number.isFinite(userId) || !exhibition) return false;
  const planners = Array.isArray(exhibition.staff?.planners) ? exhibition.staff.planners.map(Number) : [];
  const artists = Array.isArray(exhibition.staff?.artists) ? exhibition.staff.artists.map(Number) : [];
  const staffs = Array.isArray(exhibition.staff?.staffs) ? exhibition.staff.staffs.map(Number) : [];
  return planners.includes(userId) || artists.includes(userId) || staffs.includes(userId);
}

function loadInventoryExhibitions() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  const accountType = currentUser.accountType;
  const isAdmin = isAdminAccount(accountType);
  const isStaff = isStaffAccount(accountType);

  if (!isAdmin && !isStaff) {
    alert('이 페이지에 접근할 권한이 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  const exhibitions = JSON.parse(localStorage.getItem('exhibitions')) || [];
  const userId = getCurrentUserId(currentUser);
  const visibleExhibitions = isAdmin
    ? exhibitions
    : exhibitions.filter((exhibition) => isInvitedToExhibition(exhibition, userId));

  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = '';

  if (visibleExhibitions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-users">접근 가능한 전시가 없습니다.</td></tr>';
    return;
  }

  visibleExhibitions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  visibleExhibitions.forEach((exhibition) => {
    const row = document.createElement('tr');
    const statusLabel = exhibition.active ? '진행중' : '종료됨';
    row.innerHTML = `
      <td><a class="table-link" href="exhibition-detail.html?id=${exhibition.id}&tab=inventory-list">${exhibition.title}</a></td>
      <td>${exhibition.startDate} ~ ${exhibition.endDate}</td>
      <td>${exhibition.type}</td>
      <td>${statusLabel}</td>
    `;
    tbody.appendChild(row);
  });
}

function goBack() {
  window.location.href = 'index.html';
}

window.addEventListener('DOMContentLoaded', loadInventoryExhibitions);
