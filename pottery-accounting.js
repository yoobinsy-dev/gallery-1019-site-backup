(function () {
  const STORAGE_KEY = 'pottery-accounting-v1';
  const EXHIBITIONS_KEY = 'exhibitions';
  const STUDENTS_KEY = 'pottery-students-v1';
  const PERSONAL_WORK_KEY = 'pottery-personal-work-v1';
  const MATERIAL_ORDERS_KEY = 'pottery-material-orders-v1';
  const CALENDAR_KEY = 'studio-calendar-state-v1';
  const SLOT_MINUTES = 30;

  const TAB_POTTERY = 'pottery';
  const TAB_GALLERY = 'gallery';

  const FIXED_BY_TAB = {
    pottery: {
      revenue: [
        '수강료',
        '작품 판매',
        '가마 소성비',
        '개인작업 이용료',
        '기타'
      ],
      expense: [
        '수강료 강사 커미션',
        '재료비',
        '홍보비',
        '관리비',
        '청소, 공사 및 기타 작업비',
        'ADT 이용료',
        '인터넷 + 통신료',
        '직원/스태프 식비',
        '기타'
      ]
    },
    gallery: {
      expense: [
        '작품 판매 작가 커미션',
        '굿즈 판매 작가 커미션',
        '전시 및 기타 홍보비',
        '행사 비용',
        '인건비',
        '임대료',
        '관리비',
        '원재료 및 완제품 구입비',
        '청소, 공사 및 기타 작업비',
        '작가 발굴, 섭외, 조사 관련 비용',
        'ADT 이용료',
        '인터넷 + 통신료',
        '직원/스태프 식비',
        '기타'
      ],
      revenue: [
        '작품 판매',
        '굿즈 판매',
        '대관료',
        '식음료 판매',
        '기타'
      ]
    }
  };

  const AUTO_CATEGORY_IDS = new Set([
    'pottery:revenue:수강료',
    'pottery:revenue:개인작업 이용료',
    'pottery:expense:수강료 강사 커미션',
    'pottery:expense:재료비',
    'gallery:revenue:작품 판매',
    'gallery:revenue:굿즈 판매',
    'gallery:expense:작품 판매 작가 커미션',
    'gallery:expense:굿즈 판매 작가 커미션'
  ]);

  const state = {
    monthStart: getMonthStart(new Date()),
    activeTab: TAB_POTTERY,
    expandAll: false,
    expanded: {
      [TAB_POTTERY]: {
        revenue: new Set(),
        expense: new Set()
      },
      [TAB_GALLERY]: {
        revenue: new Set(),
        expense: new Set()
      }
    },
    entries: [],
    exhibitions: [],
    students: [],
    personalWorkEntries: [],
    materialOrders: [],
    calendarEvents: [],
    access: {
      userName: '',
      studioRole: ''
    },
    modal: {
      open: false,
      side: 'revenue',
      editingEntryId: '',
      sourceType: 'manual',
      overrideKey: ''
    },
    renderCache: null
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!enforceAccess()) return;
    bindEvents();
    initializePage();
  });

  window.addEventListener('cloud-sync:state-applied', (event) => {
    const keys = Array.isArray(event?.detail?.keys) ? event.detail.keys : [];
    if (
      !keys.includes(STORAGE_KEY)
      && !keys.includes(EXHIBITIONS_KEY)
      && !keys.includes(STUDENTS_KEY)
      && !keys.includes(PERSONAL_WORK_KEY)
      && !keys.includes(MATERIAL_ORDERS_KEY)
      && !keys.includes(CALENDAR_KEY)
      && !keys.includes('users')
    ) {
      return;
    }
    loadAllData();
    renderAll();
  });

  async function initializePage() {
    await waitForCloudSyncReady();
    loadAllData();
    renderAll();
  }

  function bindEvents() {
    document.getElementById('accounting-tab-pottery')?.addEventListener('click', () => {
      state.activeTab = TAB_POTTERY;
      state.expandAll = false;
      renderAll();
    });

    document.getElementById('accounting-tab-gallery')?.addEventListener('click', () => {
      state.activeTab = TAB_GALLERY;
      state.expandAll = false;
      renderAll();
    });

    document.getElementById('accounting-month-prev-btn')?.addEventListener('click', () => {
      state.monthStart = addMonths(state.monthStart, -1);
      renderAll();
    });

    document.getElementById('accounting-month-next-btn')?.addEventListener('click', () => {
      state.monthStart = addMonths(state.monthStart, 1);
      renderAll();
    });

    document.getElementById('accounting-month-current-btn')?.addEventListener('click', () => {
      state.monthStart = getMonthStart(new Date());
      renderAll();
    });

    document.getElementById('accounting-add-revenue-btn')?.addEventListener('click', () => {
      openEntryModal({ side: 'revenue' });
    });

    document.getElementById('accounting-add-expense-btn')?.addEventListener('click', () => {
      openEntryModal({ side: 'expense' });
    });

    document.getElementById('accounting-export-btn')?.addEventListener('click', () => {
      exportCurrentTabToExcel();
    });

    const viewToggle = document.getElementById('accounting-view-toggle');
    viewToggle?.addEventListener('change', () => {
      state.expandAll = Boolean(viewToggle.checked);
      renderAll();
    });

    document.getElementById('accounting-entry-save-btn')?.addEventListener('click', saveEntryModal);
    document.getElementById('accounting-entry-cancel-btn')?.addEventListener('click', closeEntryModal);
    document.getElementById('accounting-entry-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveEntryModal();
    });

    const amountInput = document.getElementById('accounting-entry-amount');
    amountInput?.addEventListener('focus', () => {
      amountInput.value = formatMoneyInput(amountInput.value, false);
    });
    amountInput?.addEventListener('input', () => {
      amountInput.value = formatMoneyInput(amountInput.value, false);
    });
    amountInput?.addEventListener('blur', () => {
      amountInput.value = formatMoneyInput(amountInput.value, true);
    });

    const entryModal = document.getElementById('accounting-entry-modal');
    entryModal?.addEventListener('click', (event) => {
      if (event.target === entryModal) {
        closeEntryModal();
      }
    });

    document.getElementById('accounting-revenue-body')?.addEventListener('click', handleTableBodyClick);
    document.getElementById('accounting-expense-body')?.addEventListener('click', handleTableBodyClick);
  }

  function handleTableBodyClick(event) {
    const categoryBtn = event.target.closest('button[data-action="toggle-category"]');
    if (categoryBtn instanceof HTMLButtonElement) {
      const side = String(categoryBtn.dataset.side || '');
      const category = String(categoryBtn.dataset.category || '');
      if (side && category) {
        toggleCategoryExpansion(side, category);
      }
      return;
    }

    const deleteBtn = event.target.closest('button[data-action="delete-entry"]');
    if (deleteBtn instanceof HTMLButtonElement) {
      const entryId = String(deleteBtn.dataset.entryId || '');
      if (entryId) {
        deleteManualEntry(entryId);
      }
    }

    const editBtn = event.target.closest('button[data-action="edit-entry"]');
    if (editBtn instanceof HTMLButtonElement) {
      const entryId = String(editBtn.dataset.entryId || '');
      const side = String(editBtn.dataset.side || '');
      const category = String(editBtn.dataset.category || '');
      if (entryId && side && category) {
        editAccountingEntry(entryId, side, category);
      }
    }
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

  function normalizeGalleryRole(role) {
    const value = String(role || '').trim();
    if (value === '기획자' || value === '작가') return '기획자/작가';
    const allowed = ['어드민', '기획자/작가', '스탭'];
    return allowed.includes(value) ? value : '';
  }

  function isAdminAccount(type) {
    return String(type || '').replace(/\s+/g, '') === '어드민';
  }

  function getEffectiveStudioRole(user) {
    const direct = normalizeStudioRole(user?.studioRole);
    if (direct) return direct;
    const accountType = String(user?.accountType || '').replace(/\s+/g, '');
    const access = normalizeSiteAccess(user?.siteAccess);
    if (access === 'pottery' && accountType === '어드민') return '어드민';
    return '';
  }

  function getEffectiveGalleryRole(user) {
    const direct = normalizeGalleryRole(user?.galleryRole);
    if (direct) return direct;
    return normalizeGalleryRole(user?.accountType);
  }

  function isDualSiteAdmin(user) {
    if (!user) return false;
    if (normalizeSiteAccess(user?.siteAccess) !== 'both') return false;
    return isAdminAccount(getEffectiveStudioRole(user)) && isAdminAccount(getEffectiveGalleryRole(user));
  }

  function enforceAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }

    if (!isDualSiteAdmin(currentUser)) {
      alert('회계 페이지는 양쪽 사이트 모두 어드민 권한을 가진 계정만 접근할 수 있습니다.');
      window.location.href = 'index.html';
      return false;
    }

    state.access.userName = String(currentUser?.name || currentUser?.username || '').trim();
    state.access.studioRole = '어드민';
    return true;
  }

  function waitForCloudSyncReady(timeoutMs = 4000) {
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

  function loadAllData() {
    loadAccountingEntries();
    loadExhibitions();
    loadStudents();
    loadPersonalWorkEntries();
    loadMaterialOrders();
    loadCalendarEvents();
  }

  function loadAccountingEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.entries = Array.isArray(parsed)
        ? parsed.map(normalizeAccountingEntry).filter(Boolean)
        : [];
    } catch (_error) {
      state.entries = [];
    }
  }

  function loadExhibitions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXHIBITIONS_KEY) || '[]');
      state.exhibitions = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      state.exhibitions = [];
    }
  }

  function loadStudents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STUDENTS_KEY) || '[]');
      state.students = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      state.students = [];
    }
  }

  function loadPersonalWorkEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSONAL_WORK_KEY) || '[]');
      state.personalWorkEntries = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      state.personalWorkEntries = [];
    }
  }

  function loadMaterialOrders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MATERIAL_ORDERS_KEY) || '[]');
      state.materialOrders = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      state.materialOrders = [];
    }
  }

  function loadCalendarEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CALENDAR_KEY) || '{}');
      state.calendarEvents = Array.isArray(parsed?.events) ? parsed.events : [];
    } catch (_error) {
      state.calendarEvents = [];
    }
  }

  function normalizeAccountingEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    if (!entry.tab && (entry.monthKey || entry.label)) {
      return normalizeLegacyAccountingEntry(entry);
    }

    const id = String(entry.id || '').trim();
    const tab = String(entry.tab || TAB_POTTERY).trim();
    const side = String(entry.side || '').trim();
    const category = normalizeAccountingCategory(tab, side, entry.category || '');
    const title = String(entry.title || entry.label || '').trim();
    const date = normalizeDateInput(entry.date || '');
    const fixed = Boolean(entry.fixed);
    const amount = parseAmountValue(entry.amount);

    if (!id) return null;
    if (tab !== TAB_POTTERY && tab !== TAB_GALLERY) return null;
    if (side !== 'revenue' && side !== 'expense') return null;
    if (!category || !title || !date) return null;

    return {
      id,
      tab,
      side,
      category,
      title,
      date,
      fixed,
      amount,
      source: String(entry.source || 'manual').trim(),
      overrideKey: String(entry.overrideKey || '').trim(),
      deleted: Boolean(entry.deleted),
      fixedThroughMonth: normalizeMonthKey(entry.fixedThroughMonth),
      createdAt: String(entry.createdAt || ''),
      updatedAt: String(entry.updatedAt || '')
    };
  }

  function normalizeLegacyAccountingEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const monthKey = String(entry.monthKey || '').trim();
    const monthDate = /^\d{4}-\d{2}$/.test(monthKey) ? `${monthKey}-01` : '';
    const date = normalizeDateInput(entry.date || monthDate || '');
    if (!date) return null;

    const side = String(entry.side || '').trim();
    const category = String(entry.category || '').trim();
    const title = String(entry.title || entry.label || category || '').trim();
    const amount = parseAmountValue(entry.amount);
    if (!title) return null;

    let normalizedSide = side;
    if (normalizedSide !== 'revenue' && normalizedSide !== 'expense') {
      if (FIXED_BY_TAB[TAB_POTTERY].revenue.includes(category || title)) {
        normalizedSide = 'revenue';
      } else if (FIXED_BY_TAB[TAB_POTTERY].expense.includes(category || title)) {
        normalizedSide = 'expense';
      } else {
        normalizedSide = 'expense';
      }
    }

    const normalizedCategory = normalizeAccountingCategory(TAB_POTTERY, normalizedSide, category || title);
    if (!normalizedCategory) return null;

    const safeId = String(entry.id || '').trim() || `legacy-${normalizeNameKey(normalizedCategory)}-${normalizeNameKey(title)}-${date}-${normalizedSide}`;
    return {
      id: safeId,
      tab: TAB_POTTERY,
      side: normalizedSide,
      category: normalizedCategory,
      title,
      date,
      fixed: Boolean(entry.fixed),
      amount,
      source: 'manual',
      overrideKey: '',
      deleted: false,
      fixedThroughMonth: '',
      createdAt: String(entry.createdAt || ''),
      updatedAt: String(entry.updatedAt || '')
    };
  }

  function parseAmountValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed);
  }

  function normalizeAccountingCategory(tab, side, value) {
    const category = String(value || '').trim();
    if (!category) return '';

    if (tab === TAB_GALLERY && side === 'expense' && category === '창소, 공사 및 기타 작업비') {
      return '청소, 공사 및 기타 작업비';
    }

    if (tab === TAB_POTTERY && side === 'expense') {
      const aliases = {
        '수강료 강사 커미션 (60%)': '수강료 강사 커미션',
        'ADT 캡스': 'ADT 이용료',
        '인터넷 + 전화': '인터넷 + 통신료',
        '창소, 공사 및 기타 작업비': '청소, 공사 및 기타 작업비'
      };
      return aliases[category] || category;
    }

    return category;
  }

  function renderAll() {
    renderMonthLabel();
    renderTabUi();
    renderViewToggle();

    const monthKey = getMonthKeyFromDate(state.monthStart);
    const calc = buildFinanceForTab(state.activeTab, monthKey);
    state.renderCache = calc;

    renderCategoryTable('revenue', calc.revenueCategories, calc.revenueTotal, calc.monthKey);
    renderCategoryTable('expense', calc.expenseCategories, calc.expenseTotal, calc.monthKey);
    renderSummary(calc.revenueTotal, calc.expenseTotal);
  }

  function renderTabUi() {
    const potteryBtn = document.getElementById('accounting-tab-pottery');
    const galleryBtn = document.getElementById('accounting-tab-gallery');
    const addRevenueBtn = document.getElementById('accounting-add-revenue-btn');
    const addExpenseBtn = document.getElementById('accounting-add-expense-btn');
    document.body.classList.add('accounting-interactive-mode');
    if (potteryBtn) {
      potteryBtn.classList.toggle('is-active', state.activeTab === TAB_POTTERY);
      potteryBtn.setAttribute('aria-selected', state.activeTab === TAB_POTTERY ? 'true' : 'false');
    }
    if (galleryBtn) {
      galleryBtn.classList.toggle('is-active', state.activeTab === TAB_GALLERY);
      galleryBtn.setAttribute('aria-selected', state.activeTab === TAB_GALLERY ? 'true' : 'false');
    }

    if (addRevenueBtn) {
      addRevenueBtn.disabled = false;
      addRevenueBtn.hidden = false;
    }
    if (addExpenseBtn) {
      addExpenseBtn.disabled = false;
      addExpenseBtn.hidden = false;
    }
  }

  function renderViewToggle() {
    const toggle = document.getElementById('accounting-view-toggle');
    const toggleWrap = document.querySelector('label.accounting-switch[for="accounting-view-toggle"]');
    const label = document.getElementById('accounting-view-toggle-label');
    if (toggle) {
      toggle.checked = state.expandAll;
      toggle.disabled = false;
      toggle.hidden = false;
    }
    if (toggleWrap) {
      toggleWrap.hidden = false;
    }
    if (label) {
      label.hidden = false;
      label.textContent = state.expandAll ? '상세 뷰' : '요약 뷰';
    }
  }

  function renderMonthLabel() {
    const label = document.getElementById('accounting-month-label');
    if (!label) return;
    label.textContent = `${state.monthStart.getFullYear()}년 ${state.monthStart.getMonth() + 1}월`;
  }

  function renderSummary(revenueTotal, expenseTotal) {
    const profit = revenueTotal - expenseTotal;
    const revenueEl = document.getElementById('accounting-total-revenue');
    const expenseEl = document.getElementById('accounting-total-expense');
    const profitEl = document.getElementById('accounting-total-profit');
    const profitCard = document.getElementById('accounting-profit-card');

    if (revenueEl) revenueEl.textContent = formatWon(revenueTotal);
    if (expenseEl) expenseEl.textContent = formatWon(expenseTotal);
    if (profitEl) profitEl.textContent = formatWon(profit);
    if (profitCard) {
      profitCard.classList.remove('positive', 'negative');
      profitCard.classList.add(profit < 0 ? 'negative' : 'positive');
    }
  }

  function buildFinanceForTab(tab, monthKey) {
    const definitions = FIXED_BY_TAB[tab] || { revenue: [], expense: [] };

    const revenueCategories = definitions.revenue.map((category) => buildCategorySnapshot(tab, 'revenue', category, monthKey));
    const expenseCategories = definitions.expense.map((category) => buildCategorySnapshot(tab, 'expense', category, monthKey));

    const revenueTotal = revenueCategories.reduce((sum, category) => sum + category.total, 0);
    const expenseTotal = expenseCategories.reduce((sum, category) => sum + category.total, 0);

    return {
      tab,
      monthKey,
      revenueCategories,
      expenseCategories,
      revenueTotal,
      expenseTotal,
      profit: revenueTotal - expenseTotal
    };
  }

  function buildCategorySnapshot(tab, side, category, monthKey) {
    const categoryId = `${tab}:${side}:${category}`;
    const autoEntries = buildAutoEntries(tab, side, category, monthKey);
    const manualEntries = buildManualEntries(tab, side, category, monthKey);

    const merged = mergeCategoryEntries(autoEntries, manualEntries);
    const total = merged.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      id: categoryId,
      tab,
      side,
      category,
      entries: merged,
      total,
      hasAuto: AUTO_CATEGORY_IDS.has(categoryId)
    };
  }

  function buildAutoEntries(tab, side, category, monthKey) {
    if (tab === TAB_POTTERY) {
      if (side === 'revenue' && category === '수강료') {
        return buildPotteryClassRevenueEntries(monthKey);
      }
      if (side === 'revenue' && category === '개인작업 이용료') {
        return buildPotteryPersonalWorkRevenueEntries(monthKey);
      }
      if (side === 'expense' && category === '수강료 강사 커미션') {
        const classRevenueEntries = buildPotteryClassRevenueEntries(monthKey);
        return classRevenueEntries.map((entry) => ({
          id: `auto-pottery-commission-${entry.id}`,
          source: 'auto',
          side,
          category,
          date: entry.date,
          title: `${entry.title} 커미션`,
          amount: roundWon(entry.amount * 0.6),
          fixed: false,
          tab: TAB_POTTERY
        }));
      }
      if (side === 'expense' && category === '재료비') {
        return buildPotteryMaterialExpenseEntries(monthKey);
      }
      return [];
    }

    if (tab !== TAB_GALLERY) {
      return [];
    }

    if (side === 'revenue' && category === '작품 판매') {
      return buildGallerySalesAutoEntries('작품', monthKey);
    }
    if (side === 'revenue' && category === '굿즈 판매') {
      return buildGallerySalesAutoEntries('굿즈', monthKey);
    }

    if (side === 'expense' && category === '작품 판매 작가 커미션') {
      const revenueEntries = buildGallerySalesAutoEntries('작품', monthKey);
      return revenueEntries.map((entry) => ({
        id: `auto-commission-art-${entry.id}`,
        source: 'auto',
        side,
        category,
        date: entry.date,
        title: `${entry.title} 커미션`,
        amount: roundWon(entry.amount * 0.6),
        fixed: false,
        tab: TAB_GALLERY
      }));
    }

    if (side === 'expense' && category === '굿즈 판매 작가 커미션') {
      const revenueEntries = buildGallerySalesAutoEntries('굿즈', monthKey);
      return revenueEntries.map((entry) => ({
        id: `auto-commission-goods-${entry.id}`,
        source: 'auto',
        side,
        category,
        date: entry.date,
        title: `${entry.title} 커미션`,
        amount: roundWon(entry.amount * 0.8),
        fixed: false,
        tab: TAB_GALLERY
      }));
    }

    return [];
  }

  function buildPotteryClassRevenueEntries(monthKey) {
    const occurrenceMap = collectClassOccurrencesByStudentInMonth(monthKey);
    const entries = [];

    state.students.forEach((student, index) => {
      if (!student || typeof student !== 'object') return;
      const name = String(student.name || '').trim();
      if (!name) return;

      const studentOccurrences = occurrenceMap.get(name) || [];
      const completedCount = studentOccurrences.length;
      if (completedCount <= 0) return;

      const tuition = parsePriceToNumber(student.tuition);
      if (tuition <= 0) return;

      const tuitionBasis = String(student.tuitionBasis || '').trim();
      let totalAmount = 0;
      if (tuitionBasis === '월초') {
        totalAmount = roundWon(tuition);
      } else {
        const cycleCount = Math.max(1, basisToCount(tuitionBasis));
        totalAmount = roundWon((tuition / cycleCount) * completedCount);
      }

      if (totalAmount <= 0) return;
      const baseAmount = Math.floor(totalAmount / completedCount);
      const remainder = totalAmount - baseAmount * completedCount;

      studentOccurrences.forEach((occurrence, occurrenceIndex) => {
        const date = normalizeDateInput(occurrence.date || `${monthKey}-01`) || `${monthKey}-01`;
        entries.push({
          id: `auto-pottery-class-${normalizeNameKey(name)}-${date}-${occurrence.start || occurrenceIndex}-${index}`,
          source: 'auto',
          side: 'revenue',
          category: '수강료',
          date,
          title: `${name} 수강 ${occurrence.start || ''}`.trim(),
          amount: baseAmount + (occurrenceIndex < remainder ? 1 : 0),
          fixed: false,
          tab: TAB_POTTERY
        });
      });
    });

    entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return entries;
  }

  function buildPotteryPersonalWorkRevenueEntries(monthKey) {
    const entries = [];

    state.personalWorkEntries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const userName = String(entry.userName || '').trim();
      if (!userName) return;

      const monthlyFee = parsePriceToNumber(entry.monthlyFee);
      if (monthlyFee <= 0) return;

      const paymentDates = getPersonalWorkPaymentDates(entry)
        .filter((date) => String(date || '').startsWith(`${monthKey}-`));

      paymentDates.forEach((date, paymentIndex) => {
        entries.push({
          id: `auto-pottery-personal-${normalizeNameKey(userName)}-${monthKey}-${index}-${paymentIndex}`,
          source: 'auto',
          side: 'revenue',
          category: '개인작업 이용료',
          date,
          title: `${userName} 개인작업 이용료`,
          amount: monthlyFee,
          fixed: false,
          tab: TAB_POTTERY
        });
      });
    });

    entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return entries;
  }

  function buildPotteryMaterialExpenseEntries(monthKey) {
    const entries = [];

    state.materialOrders.forEach((order, index) => {
      if (!order || typeof order !== 'object') return;
      const orderDate = normalizeDateInput(order.orderDate || '');
      if (!orderDate || !orderDate.startsWith(`${monthKey}-`)) return;

      const amount = getMaterialOrderTotal(order);
      if (amount <= 0) return;

      entries.push({
        id: `auto-pottery-material-${order.id || index}-${orderDate}`,
        source: 'auto',
        side: 'expense',
        category: '재료비',
        date: orderDate,
        title: `재료 주문 ${orderDate}`,
        amount,
        fixed: false,
        tab: TAB_POTTERY
      });
    });

    entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return entries;
  }

  function collectClassOccurrencesByStudentInMonth(monthKey) {
    const byStudent = new Map();
    const monthStart = parseDateOnly(`${monthKey}-01`);
    if (!monthStart) return byStudent;
    const monthEnd = addMonths(monthStart, 1);
    const now = new Date();

    const pushOccurrence = (event, dateKey) => {
      const normalizedDate = normalizeDateInput(dateKey);
      if (!normalizedDate) return;
      const occurrenceDate = parseDateOnly(normalizedDate);
      if (!occurrenceDate || occurrenceDate < monthStart || occurrenceDate >= monthEnd) return;
      const endAt = getOccurrenceEndDateTime(normalizedDate, event.start, event.end);
      if (endAt && endAt > now) return;

      const studentName = String(event.title || '').trim();
      if (!studentName) return;
      const list = byStudent.get(studentName) || [];
      list.push({ date: normalizedDate, start: String(event.start || '') });
      byStudent.set(studentName, list);
    };

    state.calendarEvents.forEach((event) => {
      if (!event || String(event.kind || '').trim() !== '수강') return;
      if (!event.date) return;

      const baseDate = parseDateOnly(event.date);
      if (!baseDate) return;

      if (!event.repeatWeekly) {
        pushOccurrence(event, event.date);
        return;
      }

      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      let horizon = monthEnd;
      if (event.repeatEndDate) {
        const repeatEnd = parseDateOnly(event.repeatEndDate);
        if (repeatEnd) {
          horizon = repeatEnd < monthEnd ? addDays(repeatEnd, 1) : monthEnd;
        }
      }

      let cursor = new Date(baseDate);
      while (cursor < horizon) {
        const key = formatDateInput(cursor);
        if (!skipDates.includes(key)) {
          pushOccurrence(event, key);
        }
        cursor = addDays(cursor, 7);
      }
    });

    byStudent.forEach((list, studentName) => {
      list.sort((a, b) => {
        const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.start || '').localeCompare(String(b.start || ''));
      });

      const deduped = [];
      const seen = new Set();
      list.forEach((occurrence) => {
        const key = `${occurrence.date}|${occurrence.start}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(occurrence);
      });
      byStudent.set(studentName, deduped);
    });

    return byStudent;
  }

  function getOccurrenceEndDateTime(dateKey, startTime, endTime) {
    const date = normalizeDateInput(dateKey);
    if (!date) return null;

    const baseDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;

    const startSlot = timeToSlot(startTime || '00:00');
    let endSlot = timeToSlot(endTime || startTime || '00:00');
    if (endSlot <= startSlot) endSlot = startSlot + 1;

    return new Date(baseDate.getTime() + endSlot * SLOT_MINUTES * 60 * 1000);
  }

  function timeToSlot(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(48, Math.floor((h * 60 + m) / SLOT_MINUTES)));
  }

  function basisToCount(basis) {
    const match = String(basis || '').match(/\d+/);
    const value = match ? Number(match[0]) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function getPersonalWorkPaymentDates(entry) {
    const history = Array.isArray(entry?.paymentHistory) ? entry.paymentHistory : [];
    const latest = normalizeDateInput(entry?.lastPaymentDate || '');
    const set = new Set();

    history.forEach((value) => {
      const date = normalizeDateInput(value);
      if (date) set.add(date);
    });
    if (latest) set.add(latest);

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function getMaterialOrderTotal(order) {
    if (!order || !Array.isArray(order.items)) return 0;

    const items = order.items;
    const orderWideDiscount = Boolean(order.orderWideDiscount);
    const orderWideShipping = Boolean(order.orderWideShipping);

    let totalPrice = 0;
    let totalDiscount = 0;
    let totalShipping = 0;

    items.forEach((item, index) => {
      const price = Number(item?.price);
      const discount = Number(item?.discount);
      const shipping = Number(item?.shippingFee);

      if (Number.isFinite(price) && price > 0) {
        totalPrice += Math.floor(price);
      }

      if (Number.isFinite(discount) && discount > 0) {
        const shouldCount = orderWideDiscount ? index === 0 : true;
        if (shouldCount) {
          totalDiscount += Math.floor(discount);
        }
      }

      if (Number.isFinite(shipping) && shipping > 0) {
        const shouldCount = orderWideShipping ? index === 0 : true;
        if (shouldCount) {
          totalShipping += Math.floor(shipping);
        }
      }
    });

    const total = totalPrice - totalDiscount + totalShipping;
    return total > 0 ? total : 0;
  }

  function buildGallerySalesAutoEntries(itemType, monthKey) {
    const entries = [];

    state.exhibitions.forEach((exhibition) => {
      if (!exhibition || typeof exhibition !== 'object') return;

      const endDate = getExhibitionEndDate(exhibition);
      if (!endDate || !endDate.startsWith(`${monthKey}-`)) return;

      const soldWorks = getExhibitionSoldRecords(exhibition);
      let sum = 0;

      soldWorks.forEach((sold) => {
        const soldType = normalizeSoldItemType(sold);
        if (soldType !== itemType) return;
        const unit = parsePriceToNumber(sold.price);
        const quantity = soldType === '굿즈' ? parseSoldQuantity(sold.soldQuantity) : 1;
        sum += unit * quantity;
      });

      if (sum <= 0) return;

      const title = String(exhibition.title || exhibition.name || '전시').trim() || '전시';
      entries.push({
        id: `auto-sales-${itemType}-${exhibition.id || title}-${endDate}`,
        source: 'auto',
        side: 'revenue',
        category: itemType === '작품' ? '작품 판매' : '굿즈 판매',
        date: endDate,
        title,
        amount: roundWon(sum),
        fixed: false,
        tab: TAB_GALLERY
      });
    });

    entries.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return entries;
  }

  function getExhibitionEndDate(exhibition) {
    if (!exhibition || typeof exhibition !== 'object') return '';
    return normalizeDateInput(exhibition.endDate || exhibition.date || '');
  }

  function getExhibitionSoldRecords(exhibition) {
    if (!exhibition || typeof exhibition !== 'object') return [];

    const soldWorks = Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks : [];
    if (soldWorks.length > 0) {
      return dedupeSoldRecords(soldWorks.map((item) => ({ ...item })));
    }

    const artSoldWorks = Array.isArray(exhibition.artSoldWorks) ? exhibition.artSoldWorks : [];
    const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods : [];
    return dedupeSoldRecords([
      ...artSoldWorks.map((item) => ({ ...item, __forcedItemType: '작품' })),
      ...soldGoods.map((item) => ({ ...item, __forcedItemType: '굿즈' }))
    ]);
  }

  function dedupeSoldRecords(records) {
    const list = Array.isArray(records) ? records : [];
    const seen = new Set();
    const deduped = [];

    list.forEach((record, index) => {
      if (!record || typeof record !== 'object') return;
      const key = getSoldRecordIdentity(record, index);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(record);
    });

    return deduped;
  }

  function getSoldRecordIdentity(record, _index) {
    const id = String(record?.id || '').trim();
    if (id) return `id:${id}`;

    const workId = Number(record?.workId);
    const title = normalizeNameKey(record?.title || '');
    const soldDate = normalizeDateInput(record?.soldDate || '');
    const soldDateTime = String(record?.soldDateTime || '').trim();
    const itemType = normalizeSoldItemType(record);
    const price = parsePriceToNumber(record?.price);
    const qty = parseSoldQuantity(record?.soldQuantity);
    const base = Number.isFinite(workId) && workId > 0 ? `work:${workId}` : `title:${title}`;
    return `${base}|${itemType}|${soldDate}|${soldDateTime}|${price}|${qty}`;
  }

  function buildManualEntries(tab, side, category, monthKey) {
    const exactMonth = [];
    const fixedEntries = [];

    state.entries.forEach((entry) => {
      if (!entry) return;
      if (entry.tab !== tab || entry.side !== side || entry.category !== category) return;
      const entryMonth = getMonthKeyFromDate(parseDateOnly(entry.date) || state.monthStart);

      if (entryMonth === monthKey) {
        exactMonth.push(entry);
      } else if (entry.fixed && entryMonth < monthKey && isFixedEntryActiveInMonth(entry, monthKey)) {
        fixedEntries.push(entry);
      }
    });

    const usedTitleInExactMonth = new Set(exactMonth.map((entry) => normalizeNameKey(entry.title)));
    const scopedFixed = fixedEntries.filter((entry) => !usedTitleInExactMonth.has(normalizeNameKey(entry.title)));

    const fixedByTitle = new Map();
    scopedFixed.forEach((entry) => {
      const key = normalizeNameKey(entry.title);
      const previous = fixedByTitle.get(key);
      if (!previous) {
        fixedByTitle.set(key, entry);
        return;
      }

      const prevMonth = getMonthKeyFromDate(parseDateOnly(previous.date) || state.monthStart);
      const nextMonth = getMonthKeyFromDate(parseDateOnly(entry.date) || state.monthStart);
      if (nextMonth > prevMonth) {
        fixedByTitle.set(key, entry);
      }
    });

    const result = [];
    exactMonth.forEach((entry) => {
      result.push({
        id: entry.id,
        source: 'manual',
        side,
        category,
        date: entry.date,
        title: entry.title,
        amount: entry.amount,
        fixed: Boolean(entry.fixed && (!entry.fixedThroughMonth || monthKey < entry.fixedThroughMonth)),
        fixedThroughMonth: entry.fixedThroughMonth,
        overrideKey: entry.overrideKey,
        deleted: entry.deleted,
        tab
      });
    });

    fixedByTitle.forEach((entry) => {
      result.push({
        id: entry.id,
        source: 'manual',
        side,
        category,
        date: entry.date,
        title: entry.title,
        amount: entry.amount,
        fixed: !entry.fixedThroughMonth || monthKey < entry.fixedThroughMonth,
        fixedThroughMonth: entry.fixedThroughMonth,
        overrideKey: entry.overrideKey,
        deleted: entry.deleted,
        tab
      });
    });

    result.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });

    return result;
  }

  function isFixedEntryActiveInMonth(entry, monthKey) {
    const throughMonth = normalizeMonthKey(entry?.fixedThroughMonth);
    return !throughMonth || monthKey <= throughMonth;
  }

  function mergeCategoryEntries(autoEntries, manualEntries) {
    const merged = [];
    const manualByKey = new Map();

    manualEntries.forEach((entry) => {
      const key = entry.overrideKey || getAccountingEntryOverrideKey(entry);
      manualByKey.set(key, entry);
    });

    autoEntries.forEach((entry) => {
      const key = getAccountingEntryOverrideKey(entry);
      if (manualByKey.has(key)) return;
      merged.push(entry);
    });

    manualEntries.forEach((entry) => {
      if (!entry.deleted) merged.push(entry);
    });
    merged.sort((a, b) => {
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });
    return merged;
  }

  function getAccountingEntryOverrideKey(entry) {
    return `${String(entry?.side || '')}|${String(entry?.category || '')}|${normalizeDateInput(entry?.date)}|${normalizeNameKey(entry?.title)}`;
  }

  function renderCategoryTable(side, categories, totalAmount) {
    const body = document.getElementById(side === 'revenue' ? 'accounting-revenue-body' : 'accounting-expense-body');
    const totalEl = document.getElementById(side === 'revenue' ? 'accounting-revenue-total' : 'accounting-expense-total');
    if (!body || !totalEl) return;

    body.innerHTML = '';
    totalEl.textContent = formatWon(totalAmount);

    categories.forEach((category) => {
      const isOpen = state.expandAll || isCategoryExpanded(side, category.category);

      const categoryRow = document.createElement('tr');
      categoryRow.className = `accounting-category-row${isOpen ? ' is-open' : ''}`;

      const categoryCell = document.createElement('td');
      categoryCell.className = 'accounting-category-cell';
      const categoryBtn = document.createElement('button');
      categoryBtn.type = 'button';
      categoryBtn.className = 'accounting-category-toggle';
      categoryBtn.dataset.action = 'toggle-category';
      categoryBtn.dataset.side = side;
      categoryBtn.dataset.category = category.category;
      categoryBtn.innerHTML = `
        <span class="accounting-category-chevron">▶</span>
        <span>${escapeHtml(category.category)}</span>
        <span class="accounting-category-meta">
          <span class="accounting-pill count">${category.entries.length}건</span>
          ${category.hasAuto ? '<span class="accounting-pill auto">자동</span>' : ''}
        </span>
      `;
      categoryCell.appendChild(categoryBtn);

      const amountCell = document.createElement('td');
      amountCell.className = 'accounting-category-amount';
      amountCell.textContent = formatWon(category.total);

      const statusCell = document.createElement('td');
      statusCell.className = 'accounting-status-cell';
      statusCell.textContent = isOpen ? '상세 열림' : '요약';

      categoryRow.appendChild(categoryCell);
      categoryRow.appendChild(amountCell);
      categoryRow.appendChild(statusCell);
      body.appendChild(categoryRow);

      const detailRow = document.createElement('tr');
      detailRow.className = 'accounting-detail-row';
      const detailCell = document.createElement('td');
      detailCell.colSpan = 2;

      const detailPanel = document.createElement('div');
      detailPanel.className = `accounting-detail-panel${isOpen ? ' is-open' : ''}`;
      const inner = document.createElement('div');
      inner.className = 'accounting-detail-inner';

      inner.appendChild(buildCategoryDetailTable(category.entries, category));
      detailPanel.appendChild(inner);
      detailCell.appendChild(detailPanel);
      detailRow.appendChild(detailCell);
      body.appendChild(detailRow);
    });
  }

  function buildCategoryDetailTable(entries, category) {
    const table = document.createElement('table');
    table.className = 'accounting-entry-table';

    const head = document.createElement('thead');
    head.innerHTML = '<tr><th>날짜</th><th>항목명</th><th>금액</th><th>작업</th></tr>';
    table.appendChild(head);

    const body = document.createElement('tbody');
    if (!entries.length) {
      body.innerHTML = '<tr class="accounting-empty-row"><td colspan="4">내역이 없습니다.</td></tr>';
      table.appendChild(body);
      return table;
    }

    entries.forEach((entry) => {
      const tr = document.createElement('tr');

      const dateTd = document.createElement('td');
      dateTd.textContent = entry.date || '-';

      const titleTd = document.createElement('td');
      titleTd.textContent = entry.title || '-';

      const amountTd = document.createElement('td');
      amountTd.className = 'amount';
      amountTd.textContent = formatWon(entry.amount);

      const actionTd = document.createElement('td');
      actionTd.className = 'action';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'accounting-entry-edit-btn';
      editBtn.dataset.action = 'edit-entry';
      editBtn.dataset.entryId = String(entry.id || '');
      editBtn.dataset.side = String(category.side || '');
      editBtn.dataset.category = String(category.category || '');
      editBtn.textContent = '수정';
      actionTd.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'accounting-entry-delete-btn';
      delBtn.dataset.action = 'delete-entry';
      delBtn.dataset.entryId = String(entry.id || '');
      delBtn.dataset.side = String(category.side || '');
      delBtn.dataset.category = String(category.category || '');
      delBtn.textContent = '삭제';
      actionTd.appendChild(delBtn);

      tr.appendChild(dateTd);
      tr.appendChild(titleTd);
      tr.appendChild(amountTd);
      tr.appendChild(actionTd);
      body.appendChild(tr);
    });

    table.appendChild(body);
    return table;
  }

  function toggleCategoryExpansion(side, category) {
    const set = state.expanded[state.activeTab]?.[side];
    if (!(set instanceof Set)) return;

    const key = String(category || '');
    if (!key) return;

    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }

    state.expandAll = false;
    renderAll();
  }

  function isCategoryExpanded(side, category) {
    const set = state.expanded[state.activeTab]?.[side];
    if (!(set instanceof Set)) return false;
    return set.has(String(category || ''));
  }

  function openEntryModal(options) {
    const side = String(options?.side || 'revenue');
    state.modal.open = true;
    state.modal.side = side;
    state.modal.editingEntryId = '';
    state.modal.sourceType = 'manual';
    state.modal.overrideKey = '';

    const monthDate = formatDateInput(state.monthStart);
    const dateInput = document.getElementById('accounting-entry-date');
    const categorySelect = document.getElementById('accounting-entry-category');
    const titleInput = document.getElementById('accounting-entry-title');
    const amountInput = document.getElementById('accounting-entry-amount');
    const fixedInput = document.getElementById('accounting-entry-fixed');
    const modalTitle = document.getElementById('accounting-entry-modal-title');
    const modal = document.getElementById('accounting-entry-modal');

    if (!dateInput || !categorySelect || !titleInput || !amountInput || !fixedInput || !modalTitle || !modal) return;

    modalTitle.textContent = side === 'revenue' ? '수입 항목 추가' : '지출 항목 추가';
    dateInput.value = monthDate;
    titleInput.value = '';
    amountInput.value = '';
    fixedInput.checked = false;

    const categories = getAvailableCategoriesForModal(state.activeTab, side);
    categorySelect.innerHTML = categories
      .map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`)
      .join('');

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    titleInput.focus();
  }

  function closeEntryModal() {
    const modal = document.getElementById('accounting-entry-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');

    state.modal.open = false;
    state.modal.editingEntryId = '';
    state.modal.sourceType = 'manual';
    state.modal.overrideKey = '';
  }

  function getAvailableCategoriesForModal(tab, side) {
    const defs = FIXED_BY_TAB[tab] || { revenue: [], expense: [] };
    return Array.isArray(defs[side]) ? defs[side].slice() : [];
  }

  function saveEntryModal() {
    const dateInput = document.getElementById('accounting-entry-date');
    const categorySelect = document.getElementById('accounting-entry-category');
    const titleInput = document.getElementById('accounting-entry-title');
    const amountInput = document.getElementById('accounting-entry-amount');
    const fixedInput = document.getElementById('accounting-entry-fixed');
    if (!dateInput || !categorySelect || !titleInput || !amountInput || !fixedInput) return;

    const date = normalizeDateInput(dateInput.value);
    if (!date) {
      alert('날짜를 입력해주세요.');
      return;
    }

    const category = String(categorySelect.value || '').trim();
    if (!category) {
      alert('카테고리를 선택해주세요.');
      return;
    }

    const title = String(titleInput.value || '').trim();
    if (!title) {
      alert('항목명을 입력해주세요.');
      return;
    }

    const amount = parseCurrencyInput(amountInput.value);
    if (amount === null) {
      alert('금액을 입력해주세요.');
      return;
    }

    const nowIso = new Date().toISOString();
    const existing = state.entries.find((item) => item && item.id === state.modal.editingEntryId);
    const fixedRequested = Boolean(fixedInput.checked);
    const currentMonthKey = getMonthKeyFromDate(state.monthStart);
    const wasRecurring = Boolean(existing?.fixed);
    let fixed = fixedRequested;
    let fixedThroughMonth = '';

    if (existing && wasRecurring && !fixedRequested) {
      fixed = true;
      fixedThroughMonth = currentMonthKey;
    } else if (existing && fixedRequested) {
      fixedThroughMonth = '';
    } else if (existing) {
      fixedThroughMonth = normalizeMonthKey(existing.fixedThroughMonth);
    }

    const entry = {
      id: existing?.id || makeId('acc2'),
      tab: state.activeTab,
      side: state.modal.side,
      category,
      title,
      date,
      fixed,
      fixedThroughMonth,
      amount,
      source: 'manual',
      overrideKey: state.modal.overrideKey,
      deleted: false,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      state.entries.push(entry);
    }
    persistEntries();
    closeEntryModal();
    renderAll();
  }

  function deleteManualEntry(entryId) {
    const id = String(entryId || '').trim();
    if (!id) return;
    const target = findRenderedAccountingEntry(id);
    if (!target) return;

    if (!confirm('이 항목을 삭제하시겠습니까?')) return;

    if (target.source === 'auto' || target.overrideKey) {
      const nowIso = new Date().toISOString();
      state.entries = state.entries.filter((entry) => entry.id !== id);
      state.entries.push({
        ...target,
        id: makeId('acc-override-delete'),
        source: 'manual',
        overrideKey: target.overrideKey || getAccountingEntryOverrideKey(target),
        deleted: true,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    } else {
      state.entries = state.entries.filter((entry) => entry.id !== id);
    }
    persistEntries();
    renderAll();
  }

  function findRenderedAccountingEntry(entryId) {
    const cache = state.renderCache;
    if (!cache) return null;
    const categories = [...cache.revenueCategories, ...cache.expenseCategories];
    for (const category of categories) {
      const found = category.entries.find((entry) => String(entry?.id || '') === String(entryId || ''));
      if (found) return found;
    }
    return null;
  }

  function editAccountingEntry(entryId, side, category) {
    const rendered = findRenderedAccountingEntry(entryId);
    if (!rendered) return;

    openEntryModal({ side });
    state.modal.editingEntryId = rendered.source === 'manual' ? String(rendered.id || '') : '';
    state.modal.sourceType = String(rendered.source || 'manual');
    state.modal.overrideKey = rendered.overrideKey || getAccountingEntryOverrideKey(rendered);

    const modalTitle = document.getElementById('accounting-entry-modal-title');
    const dateInput = document.getElementById('accounting-entry-date');
    const categorySelect = document.getElementById('accounting-entry-category');
    const titleInput = document.getElementById('accounting-entry-title');
    const amountInput = document.getElementById('accounting-entry-amount');
    const fixedInput = document.getElementById('accounting-entry-fixed');

    if (modalTitle) modalTitle.textContent = '항목 수정';
    if (dateInput) dateInput.value = rendered.date || '';
    if (categorySelect) categorySelect.value = category;
    if (titleInput) titleInput.value = rendered.title || '';
    if (amountInput) amountInput.value = formatMoneyInput(rendered.amount, true);
    if (fixedInput) fixedInput.checked = Boolean(rendered.fixed);
  }

  function persistEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  }

  async function exportCurrentTabToExcel() {
    const cache = state.renderCache;
    if (!cache) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const rows = buildExportRows(cache);
    const tabLabel = state.activeTab === TAB_GALLERY ? '갤러리' : '도예공방';
    const monthLabel = getMonthKeyFromDate(state.monthStart);

    if (typeof XlsxPopulate === 'undefined' || typeof XlsxPopulate.fromBlankAsync !== 'function') {
      exportRowsToCsv(rows, `${tabLabel}-회계-${monthLabel}.csv`);
      return;
    }

    try {
      const workbook = await XlsxPopulate.fromBlankAsync();
      const sheet = workbook.sheet(0);
      sheet.name(`${tabLabel} 회계`);

      rows.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          sheet.cell(rowIndex + 1, colIndex + 1).value(cell);
        });
      });

      sheet.row(1).style({ bold: true });

      const output = await workbook.outputAsync();
      const blob = new Blob([output], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      downloadBlob(blob, `${tabLabel}-회계-${monthLabel}.xlsx`);
    } catch (_error) {
      exportRowsToCsv(rows, `${tabLabel}-회계-${monthLabel}.csv`);
    }
  }

  function buildExportRows(cache) {
    const lines = [];
    lines.push(['구분', '카테고리', '날짜', '항목명', '금액', '유형']);

    cache.revenueCategories.forEach((category) => {
      category.entries.forEach((entry) => {
        lines.push([
          '수입',
          category.category,
          entry.date,
          entry.title,
          String(entry.amount || 0),
          entry.source === 'auto' ? '자동' : (entry.fixed ? '고정' : '수동')
        ]);
      });
    });

    cache.expenseCategories.forEach((category) => {
      category.entries.forEach((entry) => {
        lines.push([
          '지출',
          category.category,
          entry.date,
          entry.title,
          String(entry.amount || 0),
          entry.source === 'auto' ? '자동' : (entry.fixed ? '고정' : '수동')
        ]);
      });
    });

    lines.push(['', '', '', '총 수입', String(cache.revenueTotal), '']);
    lines.push(['', '', '', '총 지출', String(cache.expenseTotal), '']);
    lines.push(['', '', '', '월 손익', String(cache.profit), '']);

    return lines;
  }

  function exportRowsToCsv(lines, fileName) {
    const csvBody = lines
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, fileName);
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function normalizeSoldItemType(sold) {
    const forced = String(sold?.__forcedItemType || '').trim();
    if (forced === '굿즈' || forced === '작품') return forced;
    if (!sold) return '작품';
    return sold.itemType === '굿즈' ? '굿즈' : '작품';
  }

  function parseSoldQuantity(value) {
    const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.floor(n);
  }

  function parsePriceToNumber(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    if (text === '-' || text === '판매불가') return 0;
    const numeric = Number(text.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  function parseCurrencyInput(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    if (digits === '') return null;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
  }

  function formatMoneyInput(value, withSuffix) {
    const amount = parseCurrencyInput(value);
    if (amount === null) return '';
    const text = amount.toLocaleString('ko-KR');
    return withSuffix ? `${text}원` : text;
  }

  function formatWon(value) {
    const parsed = Number(value || 0);
    const safe = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    return `${safe.toLocaleString('ko-KR')}원`;
  }

  function roundWon(value) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed);
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, diff) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + Number(diff || 0));
    next.setDate(1);
    return next;
  }

  function addDays(date, diff) {
    const next = new Date(date);
    next.setDate(next.getDate() + Number(diff || 0));
    return next;
  }

  function getMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function normalizeDateInput(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return formatDateInput(parsed);
  }

  function formatDateInput(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function parseDateOnly(value) {
    const normalized = normalizeDateInput(value);
    if (!normalized) return null;
    return new Date(`${normalized}T00:00:00`);
  }

  function normalizeNameKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeMonthKey(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}$/.test(text) ? text : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
