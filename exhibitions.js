function getCurrentUser() {
  return JSON.parse(localStorage.getItem('currentUser')) || null;
}

function normalizeAccountType(type) {
  return type ? type.toString().trim() : '';
}

function getAccountTypeKey(type) {
  return normalizeAccountType(type).replace(/\s+/g, '');
}

function isMemberAccountType(type) {
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

function getExhibitionPageRole(user) {
  const key = getAccountTypeKey(getEffectiveGalleryRole(user));
  if (key === '어드민') return 'admin';
  if (isMemberAccountType(getEffectiveGalleryRole(user))) return 'member';
  return 'none';
}

function isAdmin() {
  return getExhibitionPageRole(getCurrentUser()) === 'admin';
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

function applyExhibitionsPagePermissions(role) {
  const addButtons = document.querySelectorAll('.add-exhibition-btn');
  addButtons.forEach((addButton) => {
    addButton.style.display = role === 'admin' ? '' : 'none';
  });

  const sectionLabel = document.querySelector('.exhibitions-header .section-label');
  if (sectionLabel) {
    sectionLabel.textContent = role === 'admin' ? '기존 전시' : '초대된 전시';
  }
}

function loadExhibitions() {
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

  const role = getExhibitionPageRole(currentUser);
  if (role === 'none') {
    alert('이 페이지에 접근할 권한이 없습니다.');
    window.location.href = 'gallery-lounge.html';
    return;
  }

  applyExhibitionsPagePermissions(role);

  const exhibitions = JSON.parse(localStorage.getItem('exhibitions')) || [];
  const currentUserId = getCurrentUserId(currentUser);
  const visibleExhibitions = role === 'admin'
    ? exhibitions
    : exhibitions.filter((exhibition) => isInvitedToExhibition(exhibition, currentUserId));

  const tbody = document.getElementById('exhibitions-tbody');
  tbody.innerHTML = '';

  if (visibleExhibitions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="no-users">${role === 'admin' ? '등록된 전시가 없습니다.' : '초대된 전시가 없습니다.'}</td></tr>`;
    return;
  }

  visibleExhibitions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  visibleExhibitions.forEach(exhibition => {
    const row = document.createElement('tr');
    const participantList = Array.isArray(exhibition.participants) ? exhibition.participants : [];
    const participants = participantList.length > 0 ? participantList.join(', ') : '단체전';
    const statusLabel = exhibition.active ? '진행중' : '종료됨';

    row.innerHTML = `
      <td><a class="table-link" href="exhibition-detail.html?id=${exhibition.id}">${exhibition.title}</a></td>
      <td>${exhibition.startDate} ~ ${exhibition.endDate}</td>
      <td>${exhibition.type}</td>
      <td>${participants}</td>
      <td>${statusLabel}</td>
    `;

    tbody.appendChild(row);
  });
}

function openAddModal() {
  if (!isAdmin()) {
    alert('전시 추가는 어드민 계정만 가능합니다.');
    return;
  }

  document.getElementById('add-modal').style.display = 'flex';
  document.getElementById('exhibition-title').value = '';
  document.getElementById('exhibition-start').value = '';
  document.getElementById('exhibition-end').value = '';
  document.getElementById('exhibition-type').value = '';
  document.getElementById('participant-fields').innerHTML = '';
  document.getElementById('form-message').textContent = '';
}

function closeAddModal() {
  document.getElementById('add-modal').style.display = 'none';
}

function handleExhibitionTypeChange() {
  const type = document.getElementById('exhibition-type').value;
  const container = document.getElementById('participant-fields');
  container.innerHTML = '';

  let count = 0;
  if (type === '개인전') count = 1;
  if (type === '2인전') count = 2;
  if (type === '3인전') count = 3;

  if (count > 0) {
    const label = document.createElement('p');
    label.textContent = '참여자 이름을 입력하세요';
    label.className = 'field-label';
    container.appendChild(label);

    for (let i = 1; i <= count; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'auth-input participant-input';
      input.placeholder = `${i}번 참여자 이름`;
      input.dataset.participantIndex = i;
      container.appendChild(input);
    }
  }
}

function addExhibition() {
  if (!isAdmin()) {
    alert('전시 추가는 어드민 계정만 가능합니다.');
    return;
  }

  const title = document.getElementById('exhibition-title').value.trim();
  const startDate = document.getElementById('exhibition-start').value;
  const endDate = document.getElementById('exhibition-end').value;
  const type = document.getElementById('exhibition-type').value;
  const participantInputs = Array.from(document.querySelectorAll('.participant-input'));

  const message = document.getElementById('form-message');
  message.textContent = '';

  if (!title || !startDate || !endDate || !type) {
    message.textContent = '모든 필드를 입력해주세요.';
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    message.textContent = '시작일은 종료일 이전이어야 합니다.';
    return;
  }

  const participants = participantInputs.map(input => input.value.trim()).filter(Boolean);
  if ((type === '개인전' || type === '2인전' || type === '3인전') && participants.length !== participantInputs.length) {
    message.textContent = '참여자 이름을 모두 입력해주세요.';
    return;
  }

  const exhibitions = JSON.parse(localStorage.getItem('exhibitions')) || [];

  const newExhibition = {
    id: Date.now(),
    title,
    startDate,
    endDate,
    type,
    participants,
    staff: {
      planners: [],
      artists: [],
      staffs: []
    },
    works: [],
    active: new Date(endDate) >= new Date(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  exhibitions.push(newExhibition);
  const saveSucceeded = typeof safeSetLocalStorageItem === 'function'
    ? safeSetLocalStorageItem('exhibitions', JSON.stringify(exhibitions))
    : (() => {
      localStorage.setItem('exhibitions', JSON.stringify(exhibitions));
      return true;
    })();

  if (!saveSucceeded) {
    message.textContent = '저장 공간이 부족해 전시를 저장하지 못했습니다. 이미지 용량을 줄인 뒤 다시 시도해주세요.';
    return;
  }

  closeAddModal();
  loadExhibitions();
  alert('전시가 생성되었습니다. 이제 전시를 선택하여 세부 관리를 시작하세요.');
}


function goBack() {
  window.location.href = 'gallery-lounge.html';
}

window.addEventListener('click', (event) => {
  const modal = document.getElementById('add-modal');
  if (event.target === modal) {
    closeAddModal();
  }
});

window.addEventListener('DOMContentLoaded', loadExhibitions);
