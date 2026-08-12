(function () {
  const STORAGE_KEY = 'pottery-personal-work-v1';
  const CALENDAR_STORAGE_KEY = 'studio-calendar-state-v1';
  const SLOT_MINUTES = 30;

  const state = {
    entries: [],
    users: [],
    calendarEvents: [],
    editingId: '',
    paymentModalEntryId: '',
    detailEntryId: '',
    activationEntryId: ''
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!enforceAccess()) return;
    loadEntries();
    loadUsers();
    loadCalendarEvents();
    bindEvents();
    renderUserOptions();
    syncAddPaymentDateInputState();
    renderTable();
    startUsageRefreshTicker();
  });

  function bindEvents() {
    document.getElementById('personal-add-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      addEntry();
    });

    document.getElementById('personal-payment-modal-save')?.addEventListener('click', savePaymentFromModal);
    document.getElementById('personal-payment-modal-close')?.addEventListener('click', closePaymentModal);
    document.getElementById('personal-detail-close')?.addEventListener('click', closeDetailModal);
    document.getElementById('personal-activate-save')?.addEventListener('click', saveActivationFromModal);
    document.getElementById('personal-activate-close')?.addEventListener('click', closeActivateModal);

    const paymentModal = document.getElementById('personal-payment-modal');
    paymentModal?.addEventListener('click', (event) => {
      if (event.target === paymentModal) closePaymentModal();
    });

    const detailModal = document.getElementById('personal-detail-modal');
    detailModal?.addEventListener('click', (event) => {
      if (event.target === detailModal) closeDetailModal();
    });

    const activateModal = document.getElementById('personal-activate-modal');
    activateModal?.addEventListener('click', (event) => {
      if (event.target === activateModal) closeActivateModal();
    });

    document.addEventListener('focusin', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains('money-input')) return;
      applyWonInputFormat(target, { withSuffix: false });
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains('money-input')) return;
      applyWonInputFormat(target, { withSuffix: false });
      if (target.id === 'personal-monthly-fee') {
        syncAddPaymentDateInputState();
      }
    });

    document.addEventListener('focusout', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains('money-input')) return;
      applyWonInputFormat(target, { withSuffix: true });
      if (target.id === 'personal-monthly-fee') {
        syncAddPaymentDateInputState();
      }
    });
  }

  function syncAddPaymentDateInputState() {
    const feeInput = document.getElementById('personal-monthly-fee');
    const paymentInput = document.getElementById('personal-payment-date');
    if (!(feeInput instanceof HTMLInputElement) || !(paymentInput instanceof HTMLInputElement)) return;

    const feeNumber = Number(parseCurrencyInput(feeInput.value) || 0);
    const isFree = feeNumber <= 0;
    paymentInput.disabled = isFree;
    paymentInput.required = !isFree;
    if (isFree) {
      paymentInput.value = '';
    }
  }

  function enforceAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }

    const siteAccess = normalizeSiteAccess(currentUser.siteAccess);
    if (siteAccess !== 'pottery' && siteAccess !== 'both') {
      alert('도예공방 10.19 접근 권한이 없습니다.');
      window.location.href = 'index.html';
      return false;
    }

    const role = getEffectiveStudioRole(currentUser);
    if (role !== '어드민') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }

    return true;
  }

  function normalizeSiteAccess(access) {
    const raw = String(access || '').trim().toLowerCase();
    if (raw === 'both' || raw === 'all') return 'both';
    if (raw === 'pottery' || raw === 'studio') return 'pottery';
    if (raw === 'gallery') return 'gallery';
    return '';
  }

  function normalizeStudioRole(role) {
    const value = String(role || '').trim();
    const allowed = ['어드민', '강사', '수강생', '작가'];
    return allowed.includes(value) ? value : '';
  }

  function getEffectiveStudioRole(user) {
    const direct = normalizeStudioRole(user?.studioRole);
    if (direct) return direct;

    const accountType = String(user?.accountType || '').trim();
    const access = normalizeSiteAccess(user?.siteAccess);
    if ((access === 'pottery' || access === 'both') && accountType === '어드민') return '어드민';
    if (accountType === '강사') return '강사';
    if (accountType === '작가') return '작가';
    if (accountType === '수강생') return '수강생';
    return '';
  }

  function loadUsers() {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      const filtered = Array.isArray(users)
        ? users.filter((user) => {
            const role = getEffectiveStudioRole(user);
            const access = normalizeSiteAccess(user?.siteAccess);
            const allowedRole = role === '작가' || role === '어드민' || role === '강사';
            const allowedAccess = access === 'pottery' || access === 'both';
            return Boolean(allowedRole && allowedAccess && user?.approved !== false);
          })
        : [];

      state.users = Array.from(new Set(
        filtered
          .map((user) => String(user?.name || user?.username || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ko'));
    } catch (error) {
      state.users = [];
    }
  }

  function renderUserOptions(selectedName) {
    const select = document.getElementById('personal-user-name');
    if (!select) return;

    select.innerHTML = '<option value="">선택</option>';
    state.users.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    if (selectedName && state.users.includes(selectedName)) {
      select.value = selectedName;
    }
  }

  function loadCalendarEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY) || '{}');
      state.calendarEvents = Array.isArray(parsed?.events) ? parsed.events : [];
    } catch (error) {
      state.calendarEvents = [];
    }
  }

  function loadEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.entries = Array.isArray(parsed)
        ? parsed.map((entry) => normalizeEntry(entry)).filter(Boolean)
        : [];
    } catch (error) {
      state.entries = [];
    }
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const id = String(entry.id || '').trim() || `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userName = String(entry.userName || '').trim();
    const startDate = normalizeDateInput(entry.startDate);
    const maxHours = normalizeHourNumber(entry.maxHours, 100);
    const monthlyFee = parseCurrencyInput(entry.monthlyFee || '');
    const paymentHistory = normalizePaymentHistory(entry.paymentHistory);
    const latestHistory = paymentHistory.length ? paymentHistory[0] : '';
    const lastPaymentDate = normalizeDateInput(entry.lastPaymentDate) || latestHistory;
    const isDormant = Boolean(entry.isDormant);
    const dormantCycleStart = normalizeDateInput(entry.dormantCycleStart || '');
    const dormantCycleEnd = normalizeDateInput(entry.dormantCycleEnd || '');

    if (!userName || !startDate) return null;

    return {
      id,
      userName,
      startDate,
      maxHours,
      monthlyFee,
      lastPaymentDate,
      paymentHistory,
      isDormant,
      dormantCycleStart,
      dormantCycleEnd
    };
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  }

  function addEntry() {
    const userName = String(document.getElementById('personal-user-name')?.value || '').trim();
    const paymentDate = normalizeDateInput(document.getElementById('personal-payment-date')?.value || '');
    const startDate = normalizeDateInput(document.getElementById('personal-start-date')?.value || '');
    const maxHours = normalizeHourNumber(document.getElementById('personal-max-hours')?.value, 100);
    const monthlyFee = parseCurrencyInput(document.getElementById('personal-monthly-fee')?.value || '');

    const isFree = Number(monthlyFee || 0) <= 0;

    if (!userName || !startDate) {
      alert('성함과 이용 시작일을 모두 입력해주세요.');
      return;
    }

    if (!isFree && !paymentDate) {
      alert('월별 이용료가 0원이 아닌 경우 결제일을 입력해주세요.');
      return;
    }

    if (!state.users.includes(userName)) {
      alert('성함은 작가/어드민/강사 계정 목록에서 선택해주세요.');
      return;
    }

    const existing = state.entries.find((entry) => entry.userName === userName);
    if (existing) {
      alert('이미 등록된 이름입니다. 기존 행에서 수정해주세요.');
      return;
    }

    const entry = {
      id: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userName,
      startDate,
      maxHours,
      monthlyFee,
      lastPaymentDate: isFree ? '' : paymentDate,
      paymentHistory: isFree ? [] : [paymentDate]
    };

    state.entries.push(entry);
    sortEntriesByName();
    saveEntries();
    clearAddForm();
    renderTable();
  }

  function clearAddForm() {
    document.getElementById('personal-user-name').value = '';
    document.getElementById('personal-payment-date').value = '';
    document.getElementById('personal-start-date').value = '';
    document.getElementById('personal-max-hours').value = '100';
    document.getElementById('personal-monthly-fee').value = '';
    syncAddPaymentDateInputState();
  }

  function renderTable() {
    loadCalendarEvents();
    const tbody = document.getElementById('personal-tbody');
    const dormantTbody = document.getElementById('personal-dormant-tbody');
    const table = document.querySelector('.personal-table');
    if (!tbody || !dormantTbody) return;

    if (table) {
      table.classList.toggle('is-editing', Boolean(state.editingId));
    }

    const activeEntries = state.entries.filter((entry) => !entry.isDormant);
    const dormantEntries = state.entries.filter((entry) => entry.isDormant);

    if (!activeEntries.length) {
      tbody.innerHTML = '<tr class="personal-empty"><td colspan="9">개인작업 이용자를 추가하면 여기에 표시됩니다.</td></tr>';
    } else {
      tbody.innerHTML = '';
      activeEntries.forEach((entry) => {
        tbody.appendChild(buildEntryRow(entry, { dormant: false }));
      });
    }

    if (!dormantEntries.length) {
      dormantTbody.innerHTML = '<tr class="personal-empty"><td colspan="8">휴면 계정이 없습니다.</td></tr>';
    } else {
      dormantTbody.innerHTML = '';
      dormantEntries.forEach((entry) => {
        dormantTbody.appendChild(buildEntryRow(entry, { dormant: true }));
      });
    }
  }

  function buildEntryRow(entry, options = {}) {
    const isDormant = Boolean(options.dormant);
    const tr = document.createElement('tr');
    tr.dataset.id = entry.id;

    const cycle = isDormant
      ? {
          start: String(entry.dormantCycleStart || ''),
          end: String(entry.dormantCycleEnd || '')
        }
      : getCurrentCycleRange(entry.startDate, new Date());

    const usage = cycle.start && cycle.end
      ? getCycleUsageHours(entry.userName, cycle.start, cycle.end)
      : 0;
    const remaining = Math.max(0, roundHour(entry.maxHours - usage));
    const needsPayment = !isDormant && isPaymentRequired(entry);
    const isEditing = !isDormant && state.editingId === entry.id;

    const checkboxTd = document.createElement('td');
    checkboxTd.className = 'select-col';
    checkboxTd.innerHTML = '<input type="checkbox" aria-label="행 선택">';
    tr.appendChild(checkboxTd);

    const nameTd = document.createElement('td');
    nameTd.className = 'name-col';
    const nameWrap = document.createElement('span');
    nameWrap.className = 'personal-row-name';
    const nameText = document.createElement('span');
    nameText.textContent = entry.userName;
    nameWrap.appendChild(nameText);
    if (needsPayment) {
      const badge = document.createElement('span');
      badge.className = 'personal-need-payment';
      badge.textContent = '결제 필요';
      nameWrap.appendChild(badge);
    }
    nameTd.appendChild(nameWrap);
    tr.appendChild(nameTd);

    const periodTd = document.createElement('td');
    periodTd.className = 'period-col';
    if (isEditing) {
      const startInput = document.createElement('input');
      startInput.type = 'date';
      startInput.value = entry.startDate;
      startInput.id = `edit-start-${entry.id}`;
      periodTd.appendChild(startInput);
    } else {
      periodTd.textContent = cycle.start && cycle.end ? `${cycle.start} ~ ${cycle.end}` : '-';
    }
    tr.appendChild(periodTd);

    const feeTd = document.createElement('td');
    feeTd.className = 'fee-col';
    let feeInputRef = null;
    if (isEditing) {
      const feeInput = document.createElement('input');
      feeInput.type = 'text';
      feeInput.className = 'money-input';
      feeInput.inputMode = 'numeric';
      feeInput.id = `edit-fee-${entry.id}`;
      feeInput.value = formatWon(entry.monthlyFee, false);
      feeTd.appendChild(feeInput);
      feeInputRef = feeInput;
    } else {
      feeTd.textContent = formatWon(entry.monthlyFee, true) || '-';
    }
    tr.appendChild(feeTd);

    const paymentTd = document.createElement('td');
    paymentTd.className = 'payment-col';
    if (isEditing) {
      const inlineWrap = document.createElement('div');
      inlineWrap.className = 'payment-edit-inline';

      const paymentInput = document.createElement('input');
      paymentInput.type = 'date';
      paymentInput.className = 'payment-edit-input';
      paymentInput.value = Number(entry.monthlyFee || 0) > 0 ? (entry.lastPaymentDate || '') : '';
      paymentInput.id = `edit-payment-${entry.id}`;
      inlineWrap.appendChild(paymentInput);

      const addPaymentBtn = document.createElement('button');
      addPaymentBtn.type = 'button';
      addPaymentBtn.className = 'personal-small-btn';
      addPaymentBtn.textContent = '결제 추가';
      addPaymentBtn.addEventListener('click', () => openPaymentModal(entry.id));
      inlineWrap.appendChild(addPaymentBtn);

      const syncPaymentControls = () => {
        const feeNumber = Number(parseCurrencyInput(feeInputRef?.value || '') || 0);
        const isFree = feeNumber <= 0;
        paymentInput.disabled = isFree;
        addPaymentBtn.disabled = isFree;
        if (isFree) {
          paymentInput.value = '';
          addPaymentBtn.title = '월별 이용료가 0원인 경우 결제일을 입력하지 않습니다.';
        } else {
          addPaymentBtn.removeAttribute('title');
        }
      };
      feeInputRef?.addEventListener('input', syncPaymentControls);
      feeInputRef?.addEventListener('change', syncPaymentControls);
      syncPaymentControls();

      paymentTd.appendChild(inlineWrap);
    } else {
      paymentTd.textContent = Number(entry.monthlyFee || 0) <= 0 ? '' : (entry.lastPaymentDate || '-');
    }
    tr.appendChild(paymentTd);

    const usedTd = document.createElement('td');
    usedTd.className = 'used-col';
    const usedBadge = document.createElement('span');
    usedBadge.className = 'personal-hours-badge';
    usedBadge.textContent = `${formatHourText(usage)}시간`;
    usedTd.appendChild(usedBadge);
    tr.appendChild(usedTd);

    const remainTd = document.createElement('td');
    remainTd.className = 'remain-col';
    const remainBadge = document.createElement('span');
    remainBadge.className = 'personal-hours-badge remain';
    if (remaining <= 10) remainBadge.classList.add('low');
    remainBadge.textContent = `${formatHourText(remaining)}시간`;
    remainTd.appendChild(remainBadge);
    tr.appendChild(remainTd);

    if (!isDormant) {
      const editMaxHoursTd = document.createElement('td');
      editMaxHoursTd.className = 'edit-only-col';
      if (isEditing) {
        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.min = '1';
        maxInput.step = '0.5';
        maxInput.value = String(entry.maxHours);
        maxInput.id = `edit-max-${entry.id}`;
        editMaxHoursTd.appendChild(maxInput);
      } else {
        editMaxHoursTd.textContent = '-';
      }
      tr.appendChild(editMaxHoursTd);
    }

    const actionTd = document.createElement('td');
    actionTd.className = 'action-col';
    const actionGrid = document.createElement('div');
    actionGrid.className = 'action-grid';

    if (isDormant) {
      actionGrid.appendChild(buildActionButton('활성', 'activate', () => openActivateModal(entry.id)));
      actionGrid.appendChild(buildActionButton('삭제', 'delete', () => deleteEntry(entry.id)));
      actionGrid.appendChild(buildActionButton('상세', 'detail', () => openDetailModal(entry.id)));
    } else if (isEditing) {
      const nameSelect = buildEditNameSelect(entry);
      nameSelect.id = `edit-name-${entry.id}`;
      nameTd.innerHTML = '';
      nameTd.appendChild(nameSelect);

      actionGrid.appendChild(buildActionButton('저장', 'save', () => saveEdit(entry.id)));
      actionGrid.appendChild(buildActionButton('취소', 'cancel', cancelEdit));
      actionGrid.appendChild(buildActionButton('삭제', 'delete', () => deleteEntry(entry.id)));
      actionGrid.appendChild(buildActionButton('상세', 'detail', () => openDetailModal(entry.id)));
    } else {
      actionGrid.appendChild(buildActionButton('수정', 'edit', () => startEdit(entry.id)));
      actionGrid.appendChild(buildActionButton('휴면', 'sleep', () => setDormant(entry.id)));
      actionGrid.appendChild(buildActionButton('삭제', 'delete', () => deleteEntry(entry.id)));
      actionGrid.appendChild(buildActionButton('상세', 'detail', () => openDetailModal(entry.id)));
    }

    actionTd.appendChild(actionGrid);
    tr.appendChild(actionTd);
    return tr;
  }

  function buildEditNameSelect(entry) {
    const select = document.createElement('select');
    select.appendChild(new Option('선택', ''));

    state.users.forEach((name) => {
      const option = new Option(name, name);
      select.appendChild(option);
    });

    select.value = entry.userName;
    return select;
  }

  function buildActionButton(label, className, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `personal-action-btn ${className}`;
    btn.textContent = label;
    btn.addEventListener('click', handler);
    return btn;
  }

  function startEdit(entryId) {
    state.editingId = String(entryId || '');
    renderTable();
  }

  function cancelEdit() {
    state.editingId = '';
    renderTable();
  }

  function saveEdit(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;

    const nextName = String(document.getElementById(`edit-name-${entry.id}`)?.value || '').trim();
    const nextStart = normalizeDateInput(document.getElementById(`edit-start-${entry.id}`)?.value || '');
    const nextPayment = normalizeDateInput(document.getElementById(`edit-payment-${entry.id}`)?.value || '');
    const nextMaxHours = normalizeHourNumber(document.getElementById(`edit-max-${entry.id}`)?.value, entry.maxHours);
    const nextMonthlyFee = parseCurrencyInput(document.getElementById(`edit-fee-${entry.id}`)?.value || '');

    if (!nextName || !nextStart) {
      alert('성함과 이용 시작일을 입력해주세요.');
      return;
    }
    if (!state.users.includes(nextName)) {
      alert('성함은 작가/어드민/강사 계정 목록에서 선택해주세요.');
      return;
    }

    const duplicate = state.entries.find((item) => item.id !== entry.id && item.userName === nextName);
    if (duplicate) {
      alert('이미 등록된 이름입니다.');
      return;
    }

    entry.userName = nextName;
    entry.startDate = nextStart;
    entry.maxHours = nextMaxHours;
    entry.monthlyFee = nextMonthlyFee;

    if (Number(nextMonthlyFee || 0) <= 0) {
      entry.lastPaymentDate = '';
      entry.paymentHistory = [];
    } else if (nextPayment) {
      entry.lastPaymentDate = nextPayment;
      addPaymentHistoryDate(entry, nextPayment);
    }

    state.editingId = '';
    sortEntriesByName();
    saveEntries();
    renderTable();
  }

  function deleteEntry(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (!confirm('이 이용자를 삭제하시겠습니까?')) return;

    state.entries = state.entries.filter((item) => item.id !== entryId);
    if (state.editingId === entryId) state.editingId = '';
    if (state.detailEntryId === entryId) closeDetailModal();
    if (state.paymentModalEntryId === entryId) closePaymentModal();
    saveEntries();
    renderTable();
  }

  function setDormant(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (!confirm('이 계정을 휴면으로 전환하시겠습니까? 현재 계약 기간이 마지막 기간으로 고정됩니다.')) return;

    const cycle = getCurrentCycleRange(entry.startDate, new Date());
    entry.isDormant = true;
    entry.dormantCycleStart = cycle.start;
    entry.dormantCycleEnd = cycle.end;
    if (state.editingId === entryId) state.editingId = '';

    saveEntries();
    renderTable();
  }

  function openActivateModal(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;

    state.activationEntryId = entryId;

    const startInput = document.getElementById('personal-activate-start-date');
    const feeInput = document.getElementById('personal-activate-monthly-fee');
    const paymentInput = document.getElementById('personal-activate-payment-date');
    const maxInput = document.getElementById('personal-activate-max-hours');
    if (startInput) startInput.value = '';
    if (feeInput) feeInput.value = formatWon(entry.monthlyFee, false);
    if (paymentInput) paymentInput.value = '';
    if (maxInput) maxInput.value = String(entry.maxHours || 100);

    const modal = document.getElementById('personal-activate-modal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeActivateModal() {
    state.activationEntryId = '';
    const modal = document.getElementById('personal-activate-modal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function saveActivationFromModal() {
    const entry = state.entries.find((item) => item.id === state.activationEntryId);
    if (!entry) {
      closeActivateModal();
      return;
    }

    const nextStartDate = normalizeDateInput(document.getElementById('personal-activate-start-date')?.value || '');
    const nextMonthlyFeeRaw = String(document.getElementById('personal-activate-monthly-fee')?.value || '');
    const nextMonthlyFee = parseCurrencyInput(nextMonthlyFeeRaw);
    const nextPaymentDate = normalizeDateInput(document.getElementById('personal-activate-payment-date')?.value || '');
    const nextMaxHoursRaw = String(document.getElementById('personal-activate-max-hours')?.value || '').trim();
    const nextMaxHours = normalizeHourNumber(nextMaxHoursRaw, entry.maxHours || 100);

    const hasFeeInput = String(nextMonthlyFeeRaw || '').trim() !== '';
    const isFree = Number(nextMonthlyFee || 0) <= 0;

    if (!nextStartDate || !hasFeeInput || !nextMaxHoursRaw) {
      alert('새 계약 기간 시작일, 월별 이용료, 맥스 이용시간을 모두 입력해주세요.');
      return;
    }

    if (!isFree && !nextPaymentDate) {
      alert('월별 이용료가 0원이 아닌 경우 결제일을 입력해주세요.');
      return;
    }

    entry.startDate = nextStartDate;
    entry.monthlyFee = nextMonthlyFee;
    entry.maxHours = nextMaxHours;
    if (isFree) {
      entry.lastPaymentDate = '';
      entry.paymentHistory = [];
    } else {
      entry.lastPaymentDate = nextPaymentDate;
      addPaymentHistoryDate(entry, nextPaymentDate);
    }
    entry.isDormant = false;
    entry.dormantCycleStart = '';
    entry.dormantCycleEnd = '';

    saveEntries();
    closeActivateModal();
    renderTable();
  }

  function openPaymentModal(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;

    state.paymentModalEntryId = entryId;
    const dateInput = document.getElementById('personal-payment-modal-date');
    if (dateInput) {
      dateInput.value = entry.lastPaymentDate || '';
      dateInput.focus();
    }

    const modal = document.getElementById('personal-payment-modal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closePaymentModal() {
    state.paymentModalEntryId = '';
    const modal = document.getElementById('personal-payment-modal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function savePaymentFromModal() {
    const entry = state.entries.find((item) => item.id === state.paymentModalEntryId);
    if (!entry) {
      closePaymentModal();
      return;
    }

    const paymentDate = normalizeDateInput(document.getElementById('personal-payment-modal-date')?.value || '');
    if (!paymentDate) {
      alert('결제일을 선택해주세요.');
      return;
    }

    entry.lastPaymentDate = paymentDate;
    addPaymentHistoryDate(entry, paymentDate);
    saveEntries();
    closePaymentModal();
    renderTable();
  }

  function openDetailModal(entryId) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;

    state.detailEntryId = entryId;
    loadCalendarEvents();

    const title = document.getElementById('personal-detail-title');
    if (title) title.textContent = `${entry.userName} 상세`;

    renderDetailPaymentHistory(entry);
    renderDetailUsageHistory(entry);

    const modal = document.getElementById('personal-detail-modal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeDetailModal() {
    state.detailEntryId = '';
    const modal = document.getElementById('personal-detail-modal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function renderDetailPaymentHistory(entry) {
    const tbody = document.getElementById('personal-detail-payment-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const history = normalizePaymentHistory(entry.paymentHistory);
    if (!history.length) {
      tbody.innerHTML = '<tr><td>-</td></tr>';
      return;
    }

    history.forEach((date) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = date;
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  function renderDetailUsageHistory(entry) {
    const tbody = document.getElementById('personal-detail-usage-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const rows = collectPersonalWorkUsageRows(entry.userName, { pastOnly: true });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="2">개인작업 이용 이력이 없습니다.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td');
      dateTd.textContent = `${row.date} ${row.start}~${row.end}`;
      const durTd = document.createElement('td');
      durTd.textContent = `${formatHourText(row.durationHours)}시간`;
      tr.appendChild(dateTd);
      tr.appendChild(durTd);
      tbody.appendChild(tr);
    });
  }

  function collectPersonalWorkUsageRows(userName, options = {}) {
    const now = new Date();
    const pastOnly = Boolean(options.pastOnly);
    const from = options.from ? new Date(`${options.from}T00:00:00`) : null;
    const to = options.to ? new Date(`${options.to}T00:00:00`) : null;

    const rows = [];

    const pushOccurrence = (event, dateKey) => {
      const startAt = new Date(`${dateKey}T${String(event.start || '00:00')}:00`);
      const endAt = getOccurrenceEndDateTime(dateKey, event.start, event.end);
      if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;
      if (pastOnly && endAt > now) return;
      if (from && startAt < from) return;
      if (to && startAt >= to) return;

      const startSlot = timeToSlot(event.start);
      const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
      const durationHours = roundHour((endSlot - startSlot) * (SLOT_MINUTES / 60));

      rows.push({
        date: String(dateKey || ''),
        start: String(event.start || ''),
        end: String(event.end || ''),
        durationHours
      });
    };

    state.calendarEvents.forEach((event) => {
      if (!event || String(event.kind || '').trim() !== '개인작업') return;
      if (String(event.title || '').trim() !== String(userName || '').trim()) return;
      if (!event.date) return;

      if (!event.repeatWeekly) {
        pushOccurrence(event, String(event.date || ''));
        return;
      }

      const baseDate = new Date(`${event.date}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) return;

      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      let horizon = null;
      if (event.repeatEndDate) {
        horizon = new Date(`${event.repeatEndDate}T00:00:00`);
        if (Number.isNaN(horizon.getTime())) return;
      } else if (to) {
        horizon = addDays(to, 7);
      } else if (pastOnly) {
        horizon = new Date(now);
      } else {
        horizon = addDays(now, 365);
      }

      let cursor = new Date(baseDate);
      while (cursor <= horizon) {
        const key = formatDateInput(cursor);
        if (!skipDates.includes(key)) {
          pushOccurrence(event, key);
        }
        cursor = addDays(cursor, 7);
      }
    });

    rows.sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`));
    return rows;
  }

  function getCycleUsageHours(userName, cycleStart, cycleEnd) {
    const rows = collectPersonalWorkUsageRows(userName, {
      pastOnly: true,
      from: cycleStart,
      to: cycleEnd
    });

    return roundHour(rows.reduce((sum, row) => sum + Number(row.durationHours || 0), 0));
  }

  function getCurrentCycleRange(startDateStr, nowDate) {
    const anchor = new Date(`${startDateStr}T00:00:00`);
    const now = new Date(nowDate || new Date());

    if (Number.isNaN(anchor.getTime())) {
      const today = formatDateInput(now);
      return {
        start: today,
        end: formatDateInput(addMonthKeepDay(now, 1))
      };
    }

    let cycleStart = new Date(anchor);
    let cycleEnd = addMonthKeepDay(cycleStart, 1);

    if (now >= cycleStart) {
      while (now >= cycleEnd) {
        cycleStart = cycleEnd;
        cycleEnd = addMonthKeepDay(cycleStart, 1);
      }
    }

    return {
      start: formatDateInput(cycleStart),
      end: formatDateInput(cycleEnd)
    };
  }

  function isPaymentRequired(entry) {
    if (Number(entry?.monthlyFee || 0) <= 0) return false;
    const requiredCycleCount = getElapsedCycleCount(entry?.startDate, new Date());
    if (requiredCycleCount <= 0) return false;

    const todayKey = formatDateInput(new Date());
    const paidDates = getEffectivePaymentDates(entry)
      .filter((dateKey) => String(dateKey || '') <= todayKey);
    return paidDates.length < requiredCycleCount;
  }

  function getElapsedCycleCount(startDateStr, nowDate) {
    const anchor = new Date(`${String(startDateStr || '').trim()}T00:00:00`);
    const now = new Date(nowDate || new Date());
    if (Number.isNaN(anchor.getTime())) return 0;
    if (now < anchor) return 0;

    let count = 1;
    let cycleStart = new Date(anchor);
    let cycleEnd = addMonthKeepDay(cycleStart, 1);
    while (now >= cycleEnd) {
      count += 1;
      cycleStart = cycleEnd;
      cycleEnd = addMonthKeepDay(cycleStart, 1);
    }
    return count;
  }

  function getEffectivePaymentDates(entry) {
    const history = normalizePaymentHistory(entry?.paymentHistory);
    const latest = normalizeDateInput(entry?.lastPaymentDate || '');
    const dates = new Set(history);
    if (latest) dates.add(latest);
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }

  function addPaymentHistoryDate(entry, paymentDate) {
    if (!entry || !paymentDate) return;
    const history = normalizePaymentHistory(entry.paymentHistory);
    if (!history.includes(paymentDate)) {
      history.push(paymentDate);
    }
    history.sort((a, b) => b.localeCompare(a));
    entry.paymentHistory = history;
  }

  function normalizePaymentHistory(paymentHistory) {
    const history = Array.isArray(paymentHistory) ? paymentHistory : [];
    return Array.from(new Set(
      history
        .map((value) => normalizeDateInput(value))
        .filter(Boolean)
    )).sort((a, b) => b.localeCompare(a));
  }

  function normalizeDateInput(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const date = new Date(`${text}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return formatDateInput(date);
  }

  function normalizeHourNumber(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return Number(fallback || 100);
    return roundHour(num);
  }

  function formatDateInput(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + Number(days || 0));
    return next;
  }

  function addMonthKeepDay(date, diff) {
    const source = new Date(date);
    const year = source.getFullYear();
    const month = source.getMonth();
    const day = source.getDate();

    const firstOfTarget = new Date(year, month + Number(diff || 0), 1);
    const maxDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(day, maxDay);

    return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), targetDay);
  }

  function timeToSlot(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(48, Math.floor((h * 60 + m) / SLOT_MINUTES)));
  }

  function getOccurrenceEndDateTime(dateStr, startTime, endTime) {
    const date = String(dateStr || '').trim();
    if (!date) return null;

    const baseDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;

    const startSlot = timeToSlot(startTime || '00:00');
    let endSlot = timeToSlot(endTime || startTime || '00:00');
    if (endSlot <= startSlot) endSlot = startSlot + 1;

    return new Date(baseDate.getTime() + (endSlot * SLOT_MINUTES * 60 * 1000));
  }

  function roundHour(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function formatHourText(value) {
    const num = roundHour(value);
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(1);
  }

  function parseCurrencyInput(value) {
    return String(value || '').replace(/[^0-9]/g, '');
  }

  function formatWon(value, withSuffix) {
    const digits = parseCurrencyInput(value);
    if (!digits) return '';
    const numberText = Number(digits).toLocaleString('ko-KR');
    return withSuffix ? `${numberText}원` : numberText;
  }

  function applyWonInputFormat(inputEl, options = {}) {
    if (!inputEl) return;
    const withSuffix = Boolean(options.withSuffix);
    inputEl.value = formatWon(inputEl.value, withSuffix);
  }

  function sortEntriesByName() {
    state.entries.sort((a, b) => String(a.userName || '').localeCompare(String(b.userName || ''), 'ko'));
  }

  function startUsageRefreshTicker() {
    setInterval(() => {
      renderTable();
    }, 5 * 60 * 1000);
  }
})();
