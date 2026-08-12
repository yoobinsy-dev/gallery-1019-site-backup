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

function canUseRemoteStateApi() {
  return typeof window !== 'undefined'
    && window.location
    && !String(window.location.protocol || '').startsWith('file');
}

async function fetchInventoryExhibitionSummaries() {
  if (!canUseRemoteStateApi()) return null;

  try {
    const response = await fetch('/api/state?keys=exhibitions&view=summary');
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.data) {
      return null;
    }

    return Array.isArray(payload.data.exhibitions) ? payload.data.exhibitions : null;
  } catch (error) {
    return null;
  }
}

async function loadInventoryExhibitions() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  if (!hasGalleryAccess(currentUser)) {
    alert('갤러리 사이트 접근 권한이 없습니다.');
    window.location.href = 'index.html';
    return;
  }

  const accountType = getEffectiveGalleryRole(currentUser);
  const isAdmin = isAdminAccount(accountType);
  const isStaff = isStaffAccount(accountType);

  if (!isAdmin && !isStaff) {
    alert('이 페이지에 접근할 권한이 없습니다.');
    window.location.href = 'gallery-lounge.html';
    return;
  }

  const fetchedSummaries = await fetchInventoryExhibitionSummaries();
  const exhibitions = Array.isArray(fetchedSummaries)
    ? fetchedSummaries
    : (JSON.parse(localStorage.getItem('exhibitions')) || []);
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
  window.location.href = 'gallery-lounge.html';
}

window.addEventListener('DOMContentLoaded', loadInventoryExhibitions);
