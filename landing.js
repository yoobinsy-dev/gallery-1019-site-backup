function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function getAccountTypeKey(type) {
  return normalizeAccountType(type).replace(/\s+/g, '');
}

function isAdminAccount(type) {
  return getAccountTypeKey(type) === '어드민';
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

function getEffectiveStudioRole(user) {
  return normalizeAccountType(user?.studioRole);
}

function isAdminAnywhere(user) {
  if (isAdminAccount(getEffectiveGalleryRole(user))) return true;
  if (isAdminAccount(getEffectiveStudioRole(user))) return true;
  return isAdminAccount(user?.accountType);
}

function isDualSiteAdmin(user) {
  if (!user) return false;
  if (getEffectiveSiteAccess(user) !== 'both') return false;
  return isAdminAccount(getEffectiveStudioRole(user))
    && isAdminAccount(getEffectiveGalleryRole(user));
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

  // Keep existing user data working without migration writes.
  return 'gallery';
}

function hasGalleryAccess(user) {
  const siteAccess = getEffectiveSiteAccess(user);
  return siteAccess === 'gallery' || siteAccess === 'both';
}

function hasPotteryAccess(user) {
  const siteAccess = getEffectiveSiteAccess(user);
  return siteAccess === 'pottery' || siteAccess === 'both';
}

function setCardVisibility(id, visible) {
  const card = document.getElementById(id);
  if (!card) return;
  card.hidden = !visible;
}

function wireAccessGuard(cardSelector, canAccess, deniedMessage) {
  const card = document.querySelector(cardSelector);
  if (!card) return;

  card.style.display = '';
  card.classList.toggle('is-disabled', !canAccess);
  if (!canAccess) {
    card.setAttribute('aria-disabled', 'true');
    card.setAttribute('title', deniedMessage);
  } else {
    card.removeAttribute('aria-disabled');
    card.removeAttribute('title');
  }

  card.addEventListener('click', (event) => {
    if (canAccess) return;
    event.preventDefault();
    alert(deniedMessage);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
  }

  setCardVisibility('landing-users-card', isDualSiteAdmin(currentUser));

  wireAccessGuard('a[href="pottery-workshop.html"]', hasPotteryAccess(currentUser), '도예공방 10.19 접근 권한이 없습니다.');
  wireAccessGuard('a[href="gallery-lounge.html"]', hasGalleryAccess(currentUser), '10.19 Gallery&Lounge 접근 권한이 없습니다.');
});
