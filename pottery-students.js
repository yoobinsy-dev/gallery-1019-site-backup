(function () {
  const STORAGE_KEY = 'pottery-students-v1';
  const CALENDAR_STORAGE_KEY = 'studio-calendar-state-v1';
  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = 48;
  const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

  const state = {
    students: [],
    calendar: {
      events: [],
      baseRules: [],
      baseRuleTimeline: [],
      baseWeekOverrides: {},
      studioUsers: [],
      classTeachingLog: []
    },
    pendingStudent: null,
    editingStudentId: '',
    detailStudentId: '',
    slotPicker: {
      weekStart: getWeekStart(new Date()),
      selected: null
    },
    access: {
      userName: '',
      studioRole: ''
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!enforceStudentsAccess()) return;
    loadStudents();
    loadCalendarState();
    bindEvents();
    renderStudents();
    startHourlyAutoRecompute();
  });

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

  function isInstructorRole() {
    return String(state.access.studioRole || '') === '강사';
  }

  function enforceStudentsAccess() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }

    const siteAccess = normalizeSiteAccess(currentUser?.siteAccess);
    if (siteAccess !== 'pottery' && siteAccess !== 'both') {
      alert('도예공방 10.19 접근 권한이 없습니다.');
      window.location.href = 'index.html';
      return false;
    }

    const role = getEffectiveStudioRole(currentUser);
    if (role !== '어드민' && role !== '강사') {
      alert('계정 등급으로 인해 선택 불가능');
      window.location.href = 'pottery-workshop.html';
      return false;
    }

    state.access.userName = String(currentUser?.name || currentUser?.username || '').trim();
    state.access.studioRole = role;

    if (role === '강사') {
      document.title = '도예공방 10.19 - 나의 수강생 관리';
      const h1 = document.querySelector('.students-header h1');
      if (h1) h1.textContent = '나의 수강생 관리';
    }

    return true;
  }

  function getVisibleStudents() {
    if (!isInstructorRole()) return state.students;
    const instructorName = String(state.access.userName || '').trim();
    return state.students.filter((student) => {
      return getStudentCurrentInstructor(student) === instructorName;
    });
  }

  function canManageStudent(student) {
    if (!student) return false;
    if (!isInstructorRole()) return true;
    return getStudentCurrentInstructor(student) === String(state.access.userName || '').trim();
  }

  function startHourlyAutoRecompute() {
    const run = () => {
      loadCalendarState();
      renderStudents();
    };

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const firstDelayMs = Math.max(1000, nextHour.getTime() - now.getTime());

    setTimeout(() => {
      run();
      setInterval(run, 60 * 60 * 1000);
    }, firstDelayMs);
  }

  function bindEvents() {
    const form = document.getElementById('student-add-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      startStudentAddFlow();
    });

    document.getElementById('slot-week-prev-btn')?.addEventListener('click', () => {
      state.slotPicker.weekStart = addDays(state.slotPicker.weekStart, -7);
      renderSlotPicker();
    });

    document.getElementById('slot-week-next-btn')?.addEventListener('click', () => {
      state.slotPicker.weekStart = addDays(state.slotPicker.weekStart, 7);
      renderSlotPicker();
    });

    document.getElementById('slot-cancel-btn')?.addEventListener('click', () => {
      closeSlotModal();
    });

    document.getElementById('slot-save-btn')?.addEventListener('click', saveStudentWithSelectedSlot);
    document.getElementById('slot-save-later-btn')?.addEventListener('click', saveStudentWithoutSlot);
    document.getElementById('student-edit-save-btn')?.addEventListener('click', saveStudentEdit);
    document.getElementById('student-edit-cancel-btn')?.addEventListener('click', closeEditModal);
    document.getElementById('student-detail-close-btn')?.addEventListener('click', closeDetailModal);

    const addTuitionInput = document.getElementById('student-tuition');
    if (addTuitionInput) {
      addTuitionInput.addEventListener('focus', () => applyWonInputFormat(addTuitionInput, { withSuffix: false }));
      addTuitionInput.addEventListener('input', () => applyWonInputFormat(addTuitionInput, { withSuffix: false }));
      addTuitionInput.addEventListener('blur', () => applyWonInputFormat(addTuitionInput, { withSuffix: true }));
    }

    const editTuitionInput = document.getElementById('edit-student-tuition');
    if (editTuitionInput) {
      editTuitionInput.addEventListener('focus', () => applyWonInputFormat(editTuitionInput, { withSuffix: false }));
      editTuitionInput.addEventListener('input', () => applyWonInputFormat(editTuitionInput, { withSuffix: false }));
      editTuitionInput.addEventListener('blur', () => applyWonInputFormat(editTuitionInput, { withSuffix: true }));
    }

    const modal = document.getElementById('student-class-slot-modal');
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          closeSlotModal();
        }
      });
    }

    const editModal = document.getElementById('student-edit-modal');
    if (editModal) {
      editModal.addEventListener('click', (event) => {
        if (event.target === editModal) {
          closeEditModal();
        }
      });
    }

    const detailModal = document.getElementById('student-detail-modal');
    if (detailModal) {
      detailModal.addEventListener('click', (event) => {
        if (event.target === detailModal) {
          closeDetailModal();
        }
      });
    }
  }

  function startStudentAddFlow() {
    const nameInput = document.getElementById('student-name');
    const tuitionInput = document.getElementById('student-tuition');
    const tuitionBasisInput = document.getElementById('student-tuition-basis');
    const paymentInput = document.getElementById('student-recent-payment');

    const name = String(nameInput?.value || '').trim();
    if (!name) return;

    const tuitionBasis = String(tuitionBasisInput?.value || '').trim();
    if (!tuitionBasis) {
      alert('수강료 기준을 선택해주세요.');
      return;
    }

    const paymentDate = String(paymentInput?.value || '').trim();

    const purchasedCount = basisToCount(tuitionBasis);

    state.pendingStudent = {
      name,
      tuition: parseCurrencyInput(tuitionInput?.value || ''),
      tuitionBasis,
      mostRecentPaymentDate: paymentDate,
      paymentHistory: paymentDate ? [paymentDate] : [],
      carryOverBeforePayment: 0,
      paymentCycleCredits: purchasedCount
    };

    state.slotPicker.weekStart = getWeekStart(new Date());
    state.slotPicker.selected = null;
    const repeatCheckbox = document.getElementById('slot-repeat-weekly');
    if (repeatCheckbox) repeatCheckbox.checked = false;

    const nameLabel = document.getElementById('slot-modal-student-name');
    if (nameLabel) {
      nameLabel.textContent = name;
    }

    openSlotModal();
    renderSlotPicker();
  }

  function saveStudentWithSelectedSlot() {
    if (!state.pendingStudent) return;
    if (!state.slotPicker.selected) {
      alert('수업시간 블록을 먼저 선택해주세요.');
      return;
    }

    const slot = state.slotPicker.selected;
    if (isInstructorRole() && String(slot.instructor || '').trim() !== String(state.access.userName || '').trim()) {
      alert('계정 등급으로 인해 선택 불가능');
      return;
    }
    const repeatWeekly = Boolean(document.getElementById('slot-repeat-weekly')?.checked);
    if (repeatWeekly && !isClassBlockRepeatingWeekly(slot.date, slot.start, slot.end)) {
      alert('선택한 수업 블록은 매주 반복되는 베이스 블록이 아닙니다. 매주 반복으로 등록할 수 없습니다.');
      return;
    }
    const student = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: state.pendingStudent.name,
      classTime: formatClassTime(slot.date, slot.start, slot.end),
      classType: slot.className || '수업시간',
      instructor: slot.instructor || '',
      mostRecentClassDate: '',
      tuition: state.pendingStudent.tuition,
      tuitionBasis: state.pendingStudent.tuitionBasis,
      mostRecentPaymentDate: state.pendingStudent.mostRecentPaymentDate,
      paymentHistory: Array.isArray(state.pendingStudent.paymentHistory) ? state.pendingStudent.paymentHistory.slice() : [],
      carryOverBeforePayment: state.pendingStudent.carryOverBeforePayment,
      paymentCycleCredits: state.pendingStudent.paymentCycleCredits
    };

    state.students.push(student);

    addStudioUserName(state.pendingStudent.name);

    state.calendar.events.push({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: '수강',
      title: state.pendingStudent.name,
      date: slot.date,
      endDate: '',
      start: slot.start,
      end: slot.end,
      classType: slot.className || '수업시간',
      instructor: slot.instructor || '',
      baseRuleId: slot.baseRuleId || '',
      capacity: 1,
      repeatWeekly
    });

    saveStudents();
    saveCalendarState();
    closeSlotModal();
    clearStudentForm();
    renderStudents();
  }

  function saveStudentWithoutSlot() {
    if (!state.pendingStudent) return;
    if (isInstructorRole()) {
      alert('계정 등급으로 인해 선택 불가능');
      return;
    }

    const student = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: state.pendingStudent.name,
      classTime: '',
      classType: '',
      instructor: '',
      mostRecentClassDate: '',
      tuition: state.pendingStudent.tuition,
      tuitionBasis: state.pendingStudent.tuitionBasis,
      mostRecentPaymentDate: state.pendingStudent.mostRecentPaymentDate,
      paymentHistory: Array.isArray(state.pendingStudent.paymentHistory) ? state.pendingStudent.paymentHistory.slice() : [],
      carryOverBeforePayment: state.pendingStudent.carryOverBeforePayment,
      paymentCycleCredits: state.pendingStudent.paymentCycleCredits
    };

    state.students.push(student);
    addStudioUserName(state.pendingStudent.name);

    saveStudents();
    saveCalendarState();
    closeSlotModal();
    clearStudentForm();
    renderStudents();
  }

  function clearStudentForm() {
    const nameInput = document.getElementById('student-name');
    const tuitionInput = document.getElementById('student-tuition');
    const tuitionBasisInput = document.getElementById('student-tuition-basis');
    const paymentInput = document.getElementById('student-recent-payment');

    if (nameInput) nameInput.value = '';
    if (tuitionInput) tuitionInput.value = '';
    if (tuitionBasisInput) tuitionBasisInput.value = '';
    if (paymentInput) paymentInput.value = '';
    nameInput?.focus();
  }

  function renderSlotPicker() {
    const root = document.getElementById('slot-selector-wrap');
    const weekLabel = document.getElementById('slot-week-label');
    const hint = document.getElementById('slot-selection-hint');
    if (!root) return;

    const weekStart = state.slotPicker.weekStart;
    const weekEnd = addDays(weekStart, 6);
    if (weekLabel) {
      weekLabel.textContent = `${formatDateLabel(weekStart)} ~ ${formatDateLabel(weekEnd)}`;
    }

    const grid = document.createElement('div');
    grid.className = 'slot-grid';

    const headTime = document.createElement('div');
    headTime.className = 'slot-head';
    headTime.textContent = '시간';
    grid.appendChild(headTime);

    for (let day = 0; day < 7; day += 1) {
      const d = addDays(weekStart, day);
      const head = document.createElement('div');
      head.className = 'slot-head';
      head.textContent = `${DAY_NAMES[day]} ${d.getMonth() + 1}/${d.getDate()}`;
      grid.appendChild(head);
    }

    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const time = document.createElement('div');
      time.className = 'slot-time';
      time.textContent = slot % 2 === 0 ? slotToTime(slot) : '';
      grid.appendChild(time);

      for (let day = 0; day < 7; day += 1) {
        const date = formatDateInput(addDays(weekStart, day));
        const rule = getBaseRuleForSlot(day, slot, weekStart);
        const cell = document.createElement('div');
        cell.className = 'slot-cell';

        if (rule && rule.type === '수업시간') {
          const isInstructorOwned = !isInstructorRole()
            || String(rule.instructor || '').trim() === String(state.access.userName || '').trim();
          const occupancy = buildDailyOccupancyMap(date);
          const blockCapacity = getBlockCapacity(rule, occupancy);
          const isFull = blockCapacity >= 3;
          cell.classList.add('class-slot');
          if (isFull) cell.classList.add('full');
          if (!isInstructorOwned) {
            cell.classList.add('full');
            cell.setAttribute('title', '계정 등급으로 인해 선택 불가능');
          }

          const selected = state.slotPicker.selected
            && state.slotPicker.selected.date === date
            && timeToSlot(state.slotPicker.selected.start) === Number(rule.startSlot)
            && timeToSlot(state.slotPicker.selected.end) === Number(rule.endSlot);
          if (selected) {
            cell.classList.add('selected');
          }

          const prevRule = slot > 0 ? getBaseRuleForSlot(day, slot - 1, weekStart) : null;
          const nextRule = slot < SLOTS_PER_DAY - 1 ? getBaseRuleForSlot(day, slot + 1, weekStart) : null;
          const isBlockStart = !prevRule || prevRule.id !== rule.id;
          const isBlockEnd = !nextRule || nextRule.id !== rule.id;
          if (isBlockStart) cell.classList.add('block-start');
          if (isBlockEnd) cell.classList.add('block-end');
          if (isBlockStart) {
            const label = document.createElement('div');
            label.className = 'slot-block-label';
            label.textContent = rule.className || '수업시간';
            cell.appendChild(label);

            const cap = document.createElement('div');
            cap.className = 'slot-block-capacity';
            cap.textContent = `${blockCapacity}/3`;
            cell.appendChild(cap);
          }

          cell.addEventListener('click', () => {
            if (!isInstructorOwned) {
              alert('계정 등급으로 인해 선택 불가능');
              return;
            }
            if (isFull) {
              alert('이 수업시간은 현재 정원이 가득 찼습니다.');
              return;
            }

            state.slotPicker.selected = {
              date,
              start: slotToTime(Number(rule.startSlot)),
              end: slotToTime(Number(rule.endSlot)),
              className: rule.className || '수업시간',
              instructor: String(rule.instructor || '').trim(),
              baseRuleId: String(rule.id || '')
            };
            if (hint) {
              hint.textContent = `선택됨: ${state.slotPicker.selected.className} · ${formatClassTime(date, state.slotPicker.selected.start, state.slotPicker.selected.end)}`;
            }
            renderSlotPicker();
          });
        }

        grid.appendChild(cell);
      }
    }

    root.innerHTML = '';
    root.appendChild(grid);

    if (!state.slotPicker.selected && hint) {
      hint.textContent = '수업시간 블록을 클릭해 선택하세요.';
    }
  }

  function openSlotModal() {
    const modal = document.getElementById('student-class-slot-modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeSlotModal() {
    const modal = document.getElementById('student-class-slot-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    state.pendingStudent = null;
    state.slotPicker.selected = null;
  }

  function formatClassTime(dateStr, start, end) {
    const dayIndex = getDayIndexFromDateString(dateStr);
    const dayName = dayIndex >= 0 && dayIndex < 7 ? DAY_NAMES[dayIndex] : '-';
    return `${dayName} ${start}~${end}`;
  }

  function renderStudents() {
    const tbody = document.getElementById('students-tbody');
    if (!tbody) return;

    const visibleStudents = getVisibleStudents();

    if (!visibleStudents.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="11">수강생을 추가하면 여기에 표시됩니다.</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    visibleStudents.forEach((student, index) => {
      const stats = getStudentClassStats(student.name);
      const isMonthly = isMonthlyStartBasis(student?.tuitionBasis);
      const completedSincePayment = isMonthly
        ? 0
        : getCompletedClassCountSince(student.name, student.mostRecentPaymentDate);
      const remainingCount = isMonthly
        ? null
        : getRemainingClassCount(student, completedSincePayment);
      const recentClassDate = stats.mostRecentClassDate || '';
      const currentInstructor = getStudentCurrentInstructor(student);

      const tr = document.createElement('tr');
      tr.dataset.id = String(student.id || '');

      const numberTd = document.createElement('td');
      numberTd.className = 'num-cell';
      numberTd.textContent = String(index + 1);
      tr.appendChild(numberTd);

      tr.appendChild(buildTextCell(student.name || '-'));
      tr.appendChild(buildTextCell(student.classTime || '-'));
      tr.appendChild(buildTextCell(student.classType || '-'));
      tr.appendChild(buildTextCell(currentInstructor || '-'));
      tr.appendChild(buildTextCell(recentClassDate || '-'));
      tr.appendChild(buildTextCell(student.tuition ? formatWon(student.tuition) : '-'));
      tr.appendChild(buildTextCell(student.tuitionBasis || '-'));
      tr.appendChild(buildTextCell(student.mostRecentPaymentDate || '-'));

      const remainingTd = document.createElement('td');
      const remainingBadge = document.createElement('span');
      remainingBadge.className = 'remaining-badge';
      if (!isMonthly && remainingCount < 0) {
        remainingBadge.classList.add('negative');
      }
      remainingBadge.textContent = isMonthly ? '-' : String(remainingCount);
      remainingTd.appendChild(remainingBadge);
      tr.appendChild(remainingTd);

      const actionTd = document.createElement('td');
      actionTd.className = 'action-cell';

      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'row-action-btn detail';
      detailBtn.textContent = '상세';
      detailBtn.addEventListener('click', () => openDetailModal(student.id));

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-action-btn edit';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => openEditModal(student.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'row-action-btn delete';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => deleteStudent(student.id));

      actionTd.appendChild(detailBtn);
      actionTd.appendChild(editBtn);
      actionTd.appendChild(deleteBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });
  }

  function buildTextCell(value) {
    const td = document.createElement('td');
    const span = document.createElement('span');
    span.className = 'cell-text';
    span.textContent = String(value || '-');
    td.appendChild(span);
    return td;
  }

  function openEditModal(studentId) {
    const student = state.students.find((item) => item && item.id === studentId);
    if (!student) return;
    if (!canManageStudent(student)) return;

    state.editingStudentId = String(studentId);

    document.getElementById('edit-student-name').value = student.name || '';
    document.getElementById('edit-student-class-time').value = student.classTime || '';
    document.getElementById('edit-student-class-type').value = student.classType || '';
    document.getElementById('edit-student-instructor').value = getStudentCurrentInstructor(student) || '';
    document.getElementById('edit-student-tuition').value = student.tuition ? formatWon(student.tuition) : '';
    document.getElementById('edit-student-tuition-basis').value = student.tuitionBasis || '';
    document.getElementById('edit-student-recent-payment').value = student.mostRecentPaymentDate || '';

    const modal = document.getElementById('student-edit-modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeEditModal() {
    const modal = document.getElementById('student-edit-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    state.editingStudentId = '';
  }

  function openDetailModal(studentId) {
    const student = state.students.find((item) => item && item.id === studentId);
    if (!student) return;
    if (!canManageStudent(student)) return;

    state.detailStudentId = String(studentId);
    loadCalendarState();

    const title = document.getElementById('student-detail-title');
    if (title) {
      title.textContent = `${student.name || '-'} 상세 기록`;
    }

    renderDetailPaymentClassTable(student);
    renderDetailOtherUsageTable(student);

    const modal = document.getElementById('student-detail-modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDetailModal() {
    const modal = document.getElementById('student-detail-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    state.detailStudentId = '';
  }

  function saveStudentEdit() {
    const student = state.students.find((item) => item && item.id === state.editingStudentId);
    if (!student) {
      closeEditModal();
      return;
    }
    if (!canManageStudent(student)) {
      closeEditModal();
      return;
    }

    const oldName = String(student.name || '').trim();
    const previousPaymentDate = String(student.mostRecentPaymentDate || '');
    const previousCompletedSincePayment = getCompletedClassCountSince(student.name, previousPaymentDate);
    const previousRemaining = getRemainingClassCount(student, previousCompletedSincePayment);

    const nextName = String(document.getElementById('edit-student-name')?.value || '').trim();
    if (!nextName) {
      alert('이름을 입력해주세요.');
      return;
    }

    student.name = nextName;
    student.tuition = parseCurrencyInput(document.getElementById('edit-student-tuition')?.value || '');
    student.tuitionBasis = String(document.getElementById('edit-student-tuition-basis')?.value || '');
    student.mostRecentPaymentDate = String(document.getElementById('edit-student-recent-payment')?.value || '');
    if (!Array.isArray(student.paymentHistory)) {
      student.paymentHistory = [];
    }
    if (previousPaymentDate && !student.paymentHistory.includes(previousPaymentDate)) {
      student.paymentHistory.push(previousPaymentDate);
    }
    if (student.mostRecentPaymentDate && !student.paymentHistory.includes(student.mostRecentPaymentDate)) {
      student.paymentHistory.push(student.mostRecentPaymentDate);
    }
    student.paymentHistory = student.paymentHistory
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));

    const paymentChanged = previousPaymentDate !== student.mostRecentPaymentDate;
    if (isMonthlyStartBasis(student.tuitionBasis)) {
      student.carryOverBeforePayment = 0;
      student.paymentCycleCredits = 0;
    } else if (paymentChanged && student.mostRecentPaymentDate) {
      student.carryOverBeforePayment = previousRemaining;
      student.paymentCycleCredits = basisToCount(student.tuitionBasis);
    } else {
      const existingCycleCredits = Number(student.paymentCycleCredits);
      if (!Number.isFinite(existingCycleCredits)) {
        student.paymentCycleCredits = basisToCount(student.tuitionBasis);
      }
      const existingCarry = Number(student.carryOverBeforePayment);
      if (!Number.isFinite(existingCarry)) {
        student.carryOverBeforePayment = 0;
      }
    }

    if (oldName && oldName !== nextName) {
      state.calendar.events.forEach((event) => {
        if (!event || event.kind !== '수강') return;
        if (String(event.title || '').trim() === oldName) {
          event.title = nextName;
        }
      });
    }

    addStudioUserName(nextName);
    saveStudents();
    saveCalendarState();
    closeEditModal();
    renderStudents();
  }

  function deleteStudent(studentId) {
    const student = state.students.find((item) => item && item.id === studentId);
    if (!student) return;
    if (!canManageStudent(student)) return;
    if (!confirm('이 수강생을 삭제하시겠습니까?')) return;

    state.students = state.students.filter((item) => item.id !== studentId);
    saveStudents();
    renderStudents();
  }

  function addStudioUserName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    const existing = Array.isArray(state.calendar.studioUsers) ? state.calendar.studioUsers : [];
    if (existing.includes(trimmed)) return;
    existing.push(trimmed);
    existing.sort((a, b) => a.localeCompare(b, 'ko'));
    state.calendar.studioUsers = existing;
  }

  function basisToCount(basis) {
    const match = String(basis || '').match(/\d+/);
    const value = match ? Number(match[0]) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function isMonthlyStartBasis(basis) {
    return String(basis || '').trim() === '월초';
  }

  function getRemainingClassCount(student, completedSincePayment) {
    const carry = Number(student?.carryOverBeforePayment || 0);
    const cycleCredits = Number(
      student?.paymentCycleCredits
      ?? basisToCount(student?.tuitionBasis)
      ?? 0
    );
    const used = Number(completedSincePayment || 0);

    const safeCarry = Number.isFinite(carry) ? carry : 0;
    const safeCycle = Number.isFinite(cycleCredits) ? cycleCredits : 0;
    const safeUsed = Number.isFinite(used) ? used : 0;

    return safeCarry + safeCycle - safeUsed;
  }

  function renderDetailPaymentClassTable(student) {
    const tbody = document.getElementById('student-detail-payment-class-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const classRecords = collectStudentEventOccurrences(student?.name, ['수강'], { pastOnly: true });
    const paymentDates = getStudentPaymentHistory(student);

    if (!classRecords.length && !paymentDates.length) {
      const row = document.createElement('tr');
      row.className = 'students-detail-row-empty';
      row.innerHTML = '<td colspan="2">수업/결제 기록이 없습니다.</td>';
      tbody.appendChild(row);
      return;
    }

    const grouped = buildPaymentClassGroups(student, paymentDates, classRecords);
    const groups = grouped.groups;
    groups.forEach((group) => {
      const classItems = Array.isArray(group.classRecords) ? group.classRecords : [];
      const spanCount = Math.max(1, classItems.length);

      for (let index = 0; index < spanCount; index += 1) {
        const row = document.createElement('tr');

        if (index === 0) {
          const paymentCell = document.createElement('td');
          paymentCell.rowSpan = spanCount;
          paymentCell.textContent = group.paymentDate || '-';
          row.appendChild(paymentCell);
        }

        const classCell = document.createElement('td');
        if (classItems.length) {
          const record = classItems[index];
          const dayIndex = getDayIndexFromDateString(record.date);
          const dayName = dayIndex >= 0 && dayIndex < DAY_NAMES.length ? DAY_NAMES[dayIndex] : '-';
          const classLabel = String(record.classType || '수강').trim();
          classCell.textContent = `${record.date} (${dayName}) ${record.start}~${record.end} · ${classLabel}`;

          if (record.absent) {
            classCell.classList.add('students-detail-class-absent');
            const tag = document.createElement('span');
            tag.className = 'students-absent-tag';
            tag.textContent = '결석';
            classCell.appendChild(tag);
          }
        } else {
          classCell.textContent = '-';
        }

        row.appendChild(classCell);
        tbody.appendChild(row);
      }
    });

    const unassigned = Array.isArray(grouped.unassigned) ? grouped.unassigned : [];
    if (unassigned.length) {
      unassigned.forEach((record, index) => {
        const row = document.createElement('tr');
        if (index === 0) {
          const paymentCell = document.createElement('td');
          paymentCell.rowSpan = unassigned.length;
          paymentCell.textContent = '결제기록 없음';
          row.appendChild(paymentCell);
        }

        const classCell = document.createElement('td');
        const dayIndex = getDayIndexFromDateString(record.date);
        const dayName = dayIndex >= 0 && dayIndex < DAY_NAMES.length ? DAY_NAMES[dayIndex] : '-';
        const classLabel = String(record.classType || '수강').trim();
        classCell.textContent = `${record.date} (${dayName}) ${record.start}~${record.end} · ${classLabel}`;
        if (record.absent) {
          classCell.classList.add('students-detail-class-absent');
          const tag = document.createElement('span');
          tag.className = 'students-absent-tag';
          tag.textContent = '결석';
          classCell.appendChild(tag);
        }

        row.appendChild(classCell);
        tbody.appendChild(row);
      });
    }
  }

  function renderDetailOtherUsageTable(student) {
    const tbody = document.getElementById('student-detail-other-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const records = collectStudentEventOccurrences(student?.name, ['개인작업', '강사 지도 하 개인작업'], { pastOnly: true });
    if (!records.length) {
      const row = document.createElement('tr');
      row.className = 'students-detail-row-empty';
      row.innerHTML = '<td>기타 이용 기록이 없습니다.</td>';
      tbody.appendChild(row);
      return;
    }

    records.forEach((record) => {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      const dayIndex = getDayIndexFromDateString(record.date);
      const dayName = dayIndex >= 0 && dayIndex < DAY_NAMES.length ? DAY_NAMES[dayIndex] : '-';
      cell.textContent = `${record.date} (${dayName}) ${record.start}~${record.end} · ${record.kind}`;
      row.appendChild(cell);
      tbody.appendChild(row);
    });
  }

  function getStudentPaymentCycleSize(student) {
    const direct = Number(student?.paymentCycleCredits);
    const fromBasis = basisToCount(student?.tuitionBasis);
    const safeDirect = Number.isFinite(direct) && direct > 0 ? Math.floor(direct) : 0;
    const safeBasis = Number.isFinite(fromBasis) && fromBasis > 0 ? Math.floor(fromBasis) : 0;
    return Math.max(1, safeDirect, safeBasis);
  }

  function buildPaymentClassGroups(student, paymentDates, classRecords) {
    if (isMonthlyStartBasis(student?.tuitionBasis)) {
      return buildMonthlyStartPaymentClassGroups(paymentDates, classRecords);
    }

    const sortedPaymentsAsc = (Array.isArray(paymentDates) ? paymentDates : [])
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const workingClasses = (Array.isArray(classRecords) ? classRecords : [])
      .map((record) => ({ ...record, __assignedPayment: false }))
      .sort((a, b) => {
        const ak = `${a.date} ${a.start}`;
        const bk = `${b.date} ${b.start}`;
        return ak.localeCompare(bk);
      });

    const cycleSize = getStudentPaymentCycleSize(student);

    const groupsAsc = [];
    sortedPaymentsAsc.forEach((paymentDate, index) => {
      const nextPaymentDate = sortedPaymentsAsc[index + 1] || '';
      const assigned = [];
      let paidCount = 0;

      const assignRecord = (record) => {
        if (!record) return;
        record.__assignedPayment = true;
        assigned.push(record);
        if (!record.absent) {
          paidCount += 1;
        }
      };

      // Primary pass: classes in this payment window [paymentDate, nextPaymentDate)
      for (let i = 0; i < workingClasses.length; i += 1) {
        const record = workingClasses[i];
        const classDate = String(record?.date || '');
        if (!classDate || record.__assignedPayment) continue;
        if (classDate < paymentDate) continue;
        if (nextPaymentDate && classDate >= nextPaymentDate) continue;
        assignRecord(record);
        if (paidCount >= cycleSize) break;
      }

      // Fallback pass: if still short, take earliest unassigned classes on/after paymentDate.
      if (paidCount < cycleSize) {
        for (let i = 0; i < workingClasses.length; i += 1) {
          const record = workingClasses[i];
          const classDate = String(record?.date || '');
          if (!classDate || record.__assignedPayment) continue;
          if (classDate < paymentDate) continue;
          assignRecord(record);
          if (paidCount >= cycleSize) break;
        }
      }

      groupsAsc.push({
        paymentDate,
        classRecords: assigned
      });
    });

    const groups = groupsAsc.slice().sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
    return {
      groups,
      unassigned: workingClasses.filter((record) => !record.__assignedPayment)
    };
  }

  function buildMonthlyStartPaymentClassGroups(paymentDates, classRecords) {
    const sortedPaymentsAsc = (Array.isArray(paymentDates) ? paymentDates : [])
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const monthToPaymentDate = new Map();
    const paymentEntries = [];

    sortedPaymentsAsc.forEach((paymentDate) => {
      const parsed = new Date(`${paymentDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return;

      const currentMonthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
      let targetMonthKey = currentMonthKey;

      // Early payment rule: payment after 23rd can cover next month
      // only when payment for current month already exists.
      if (parsed.getDate() >= 24 && monthToPaymentDate.has(currentMonthKey)) {
        const nextMonth = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
        targetMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!monthToPaymentDate.has(targetMonthKey)) {
        monthToPaymentDate.set(targetMonthKey, paymentDate);
      }

      paymentEntries.push({
        paymentDate,
        targetMonthKey
      });
    });

    const groupsByPaymentDate = new Map();
    paymentEntries.forEach((entry) => {
      if (!groupsByPaymentDate.has(entry.paymentDate)) {
        groupsByPaymentDate.set(entry.paymentDate, []);
      }
    });

    const sortedClassesDesc = (Array.isArray(classRecords) ? classRecords : [])
      .slice()
      .sort((a, b) => {
        const ak = `${a.date} ${a.start}`;
        const bk = `${b.date} ${b.start}`;
        return bk.localeCompare(ak);
      });

    const unassigned = [];
    sortedClassesDesc.forEach((record) => {
      const classDate = String(record?.date || '').trim();
      if (!classDate) return;
      const classMonthKey = classDate.slice(0, 7);

      const paymentDate = monthToPaymentDate.get(classMonthKey);
      if (!paymentDate) {
        unassigned.push(record);
        return;
      }

      const bucket = groupsByPaymentDate.get(paymentDate);
      if (!bucket) {
        unassigned.push(record);
        return;
      }

      bucket.push(record);
    });

    const groups = Array.from(groupsByPaymentDate.entries())
      .map(([paymentDate, records]) => ({
        paymentDate,
        classRecords: records
      }))
      .sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));

    return {
      groups,
      unassigned
    };
  }

  function getStudentPaymentHistory(student) {
    const history = Array.isArray(student?.paymentHistory) ? student.paymentHistory.slice() : [];
    const recent = String(student?.mostRecentPaymentDate || '').trim();
    if (recent && !history.includes(recent)) {
      history.push(recent);
    }
    return history
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
  }

  function collectStudentEventOccurrences(studentName, targetKinds, options = {}) {
    const name = String(studentName || '').trim();
    if (!name) return [];

    const kindSet = new Set((Array.isArray(targetKinds) ? targetKinds : []).map((kind) => String(kind || '').trim()));
    if (!kindSet.size) return [];

    const now = new Date();
    const pastOnly = Boolean(options.pastOnly);
    const records = [];

    const pushOccurrence = (event, dateKey) => {
      const endAt = getOccurrenceEndDateTime(dateKey, event.start, event.end);
      if (!endAt) return;
      if (pastOnly && endAt > now) return;

      records.push({
        date: String(dateKey || ''),
        start: String(event.start || ''),
        end: String(event.end || ''),
        kind: String(event.kind || ''),
        classType: String(event.classType || ''),
        absent: isEventAbsentOnDate(event, dateKey)
      });
    };

    state.calendar.events.forEach((event) => {
      if (!event || !event.date) return;
      if (String(event.title || '').trim() !== name) return;
      if (!kindSet.has(String(event.kind || '').trim())) return;
      if (isAllDayKind(event.kind)) return;

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

    records.sort((a, b) => {
      const ak = `${a.date} ${a.start}`;
      const bk = `${b.date} ${b.start}`;
      return bk.localeCompare(ak);
    });

    return records;
  }

  function getStudentCurrentInstructor(student) {
    const name = String(student?.name || '').trim();
    if (!name) return '';

    const recurring = state.calendar.events
      .filter((event) => {
        if (!event || event.kind !== '수강') return false;
        if (!event.repeatWeekly) return false;
        return String(event.title || '').trim() === name;
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const todayKey = formatDateInput(new Date());
    const activeRecurring = recurring.find((event) => {
      if (!event.repeatEndDate) return true;
      return String(event.repeatEndDate) >= todayKey;
    });

    const sourceEvent = activeRecurring || recurring[0] || null;
    if (sourceEvent) {
      return getEventInstructor(sourceEvent) || String(student?.instructor || '').trim();
    }

    return String(student?.instructor || '').trim();
  }

  function getEventInstructor(event) {
    const rule = getClassRuleForEvent(event);
    if (rule) {
      const fromRule = String(rule.instructor || '').trim();
      if (fromRule) return fromRule;
    }

    return String(event?.instructor || '').trim();
  }

  function getClassRuleForEvent(event) {
    if (!event || event.kind !== '수강' || !event.date) return null;

    const day = getDayIndexFromDateString(event.date);
    if (day < 0) return null;

    const startSlot = timeToSlot(event.start);
    const endSlot = Math.max(startSlot + 1, timeToSlot(event.end));
    const weekStart = getWeekStart(new Date(`${event.date}T00:00:00`));
    const startRule = getBaseRuleForSlot(day, startSlot, weekStart);
    const endRule = getBaseRuleForSlot(day, endSlot - 1, weekStart);
    if (!startRule || !endRule) return null;
    if (startRule.id !== endRule.id) return null;
    if (String(startRule.type || '') !== '수업시간') return null;
    return startRule;
  }

  function formatNumberWithCommas(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value || '');
    return num.toLocaleString('ko-KR');
  }

  function parseCurrencyInput(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    return digits;
  }

  function formatWon(value) {
    const num = Number(parseCurrencyInput(value));
    if (!Number.isFinite(num)) return '';
    return `${num.toLocaleString('ko-KR')}원`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isEventAbsentOnDate(event, dateKey) {
    const key = String(dateKey || '').trim();
    if (!key) return false;
    const absenceDates = Array.isArray(event?.absenceDates) ? event.absenceDates : [];
    return absenceDates.includes(key);
  }

  function applyWonInputFormat(inputEl, options = {}) {
    if (!inputEl) return;
    const withSuffix = Boolean(options.withSuffix);
    const digits = parseCurrencyInput(inputEl.value);
    if (!digits) {
      inputEl.value = '';
      return;
    }

    const numberText = Number(digits).toLocaleString('ko-KR');
    inputEl.value = withSuffix ? `${numberText}원` : numberText;
  }

  function getStudentClassStats(studentName) {
    const name = String(studentName || '').trim();
    if (!name) {
      return {
        completedCount: 0,
        mostRecentClassDate: ''
      };
    }

    const now = new Date();
    let completedCount = 0;
    let mostRecentClassDate = '';

    state.calendar.events.forEach((event) => {
      if (!event || event.kind !== '수강') return;
      if (String(event.title || '').trim() !== name) return;
      if (!event.date) return;

      if (!event.repeatWeekly) {
        const key = String(event.date || '').trim();
        if (isEventAbsentOnDate(event, key)) return;
        const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
        if (!endAt || endAt > now) return;
        completedCount += 1;
        if (!mostRecentClassDate || key > mostRecentClassDate) {
          mostRecentClassDate = key;
        }
        return;
      }

      const baseDate = new Date(`${event.date}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) return;

      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      const endDate = event.repeatEndDate ? new Date(`${event.repeatEndDate}T00:00:00`) : now;
      if (Number.isNaN(endDate.getTime())) return;

      let cursor = new Date(baseDate);
      while (cursor <= endDate) {
        const key = formatDateInput(cursor);
        const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
        if (!endAt || endAt > now) break;
        if (!skipDates.includes(key) && !isEventAbsentOnDate(event, key)) {
          completedCount += 1;
          if (!mostRecentClassDate || key > mostRecentClassDate) {
            mostRecentClassDate = key;
          }
        }
        cursor = addDays(cursor, 7);
      }
    });

    return {
      completedCount,
      mostRecentClassDate
    };
  }

  function getCompletedClassCountSince(studentName, paymentDate) {
    const name = String(studentName || '').trim();
    if (!name) return 0;

    const normalizedPaymentDate = String(paymentDate || '').trim();
    if (!normalizedPaymentDate) return 0;

    const startDate = new Date(`${normalizedPaymentDate}T00:00:00`);
    if (startDate && Number.isNaN(startDate.getTime())) return 0;

    const now = new Date();
    let completedCount = 0;

    state.calendar.events.forEach((event) => {
      if (!event || event.kind !== '수강') return;
      if (String(event.title || '').trim() !== name) return;
      if (!event.date) return;

      if (!event.repeatWeekly) {
        const key = String(event.date || '').trim();
        if (isEventAbsentOnDate(event, key)) return;
        const d = new Date(`${key}T00:00:00`);
        if (Number.isNaN(d.getTime())) return;
        const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
        if (!endAt || endAt > now) return;
        if (startDate && d < startDate) return;
        completedCount += 1;
        return;
      }

      const baseDate = new Date(`${event.date}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) return;

      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      const endDate = event.repeatEndDate ? new Date(`${event.repeatEndDate}T00:00:00`) : now;
      if (Number.isNaN(endDate.getTime())) return;

      let cursor = new Date(baseDate);
      while (cursor <= endDate) {
        const key = formatDateInput(cursor);
        const endAt = getOccurrenceEndDateTime(key, event.start, event.end);
        if (!endAt || endAt > now) break;
        const notSkipped = !skipDates.includes(key);
        const notAbsent = !isEventAbsentOnDate(event, key);
        const afterPayment = !startDate || cursor >= startDate;
        if (notSkipped && notAbsent && afterPayment) {
          completedCount += 1;
        }
        cursor = addDays(cursor, 7);
      }
    });

    return completedCount;
  }

  function loadCalendarState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY) || '{}');
      state.calendar.events = Array.isArray(parsed.events) ? parsed.events : [];
      state.calendar.baseRules = Array.isArray(parsed.baseRules) ? parsed.baseRules : [];
      state.calendar.baseRuleTimeline = Array.isArray(parsed.baseRuleTimeline)
        ? parsed.baseRuleTimeline
            .map((entry) => ({
              weekKey: String(entry?.weekKey || '').trim(),
              rules: Array.isArray(entry?.rules) ? entry.rules : []
            }))
            .filter((entry) => entry.weekKey)
        : [];
      state.calendar.baseWeekOverrides = parsed.baseWeekOverrides && typeof parsed.baseWeekOverrides === 'object'
        ? parsed.baseWeekOverrides
        : {};
      state.calendar.studioUsers = Array.isArray(parsed.studioUsers) ? parsed.studioUsers : [];
      state.calendar.classTeachingLog = Array.isArray(parsed.classTeachingLog) ? parsed.classTeachingLog : [];
    } catch (error) {
      state.calendar.events = [];
      state.calendar.baseRules = [];
      state.calendar.baseRuleTimeline = [];
      state.calendar.baseWeekOverrides = {};
      state.calendar.studioUsers = [];
      state.calendar.classTeachingLog = [];
    }
  }

  function saveCalendarState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY) || '{}');
      const next = {
        ...parsed,
        events: state.calendar.events,
        baseRules: state.calendar.baseRules,
        baseRuleTimeline: state.calendar.baseRuleTimeline,
        baseWeekOverrides: state.calendar.baseWeekOverrides,
        studioUsers: state.calendar.studioUsers,
        classTeachingLog: state.calendar.classTeachingLog
      };
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify({
        events: state.calendar.events,
        baseRules: state.calendar.baseRules,
        baseRuleTimeline: state.calendar.baseRuleTimeline,
        baseWeekOverrides: state.calendar.baseWeekOverrides,
        studioUsers: state.calendar.studioUsers,
        classTeachingLog: state.calendar.classTeachingLog
      }));
    }
  }

  function getWeekKey(date) {
    return formatDateInput(getWeekStart(date || new Date()));
  }

  function getTemplateRulesForWeek(weekStartDate) {
    const weekKey = getWeekKey(weekStartDate || new Date());
    let resolved = null;
    (state.calendar.baseRuleTimeline || []).forEach((entry) => {
      const key = String(entry?.weekKey || '');
      if (!key || key > weekKey) return;
      if (!resolved || key > resolved.weekKey) {
        resolved = { weekKey: key, rules: Array.isArray(entry?.rules) ? entry.rules : [] };
      }
    });
    return resolved ? resolved.rules : state.calendar.baseRules;
  }

  function getRulesForWeek(weekStartDate) {
    const weekKey = getWeekKey(weekStartDate || new Date());
    const overrideRules = state.calendar.baseWeekOverrides?.[weekKey];
    return Array.isArray(overrideRules) ? overrideRules : getTemplateRulesForWeek(weekStartDate || new Date());
  }

  function getBaseRuleForSlot(day, slot, weekStartDate) {
    const rules = getRulesForWeek(weekStartDate);
    return rules.find((rule) => {
      return Number(rule.day) === Number(day)
        && Number(rule.startSlot) <= Number(slot)
        && Number(rule.endSlot) > Number(slot);
    }) || null;
  }

  function isClassBlockRepeatingWeekly(date, startTime, endTime) {
    const day = getDayIndexFromDateString(date);
    if (day < 0) return false;

    const weekStart = getWeekStart(new Date(`${date}T00:00:00`));
    const startSlot = timeToSlot(startTime);
    const endSlot = Math.max(startSlot + 1, timeToSlot(endTime));

    const weekStartRule = getBaseRuleForSlot(day, startSlot, weekStart);
    const weekEndRule = getBaseRuleForSlot(day, endSlot - 1, weekStart);
    if (!weekStartRule || !weekEndRule) return false;
    if (weekStartRule.id !== weekEndRule.id) return false;
    if (String(weekStartRule.type || '') !== '수업시간') return false;
    if (Number(weekStartRule.startSlot) !== Number(startSlot)) return false;
    if (Number(weekStartRule.endSlot) !== Number(endSlot)) return false;

    const templateRule = (state.calendar.baseRules || []).find((rule) => {
      return String(rule?.type || '') === '수업시간'
        && Number(rule?.day) === Number(day)
        && Number(rule?.startSlot) === Number(startSlot)
        && Number(rule?.endSlot) === Number(endSlot);
    });
    if (!templateRule) return false;

    return String(templateRule.className || '').trim() === String(weekStartRule.className || '').trim()
      && String(templateRule.instructor || '').trim() === String(weekStartRule.instructor || '').trim();
  }

  function buildDailyOccupancyMap(date) {
    const occupancy = Array.from({ length: SLOTS_PER_DAY }, () => [false, false, false]);
    const events = getEventsForDate(date);

    events.forEach((event) => {
      if (!event) return;
      if (event.kind === '기타' || isAllDayKind(event.kind)) return;
      const s = timeToSlot(event.start);
      const e = Math.max(s + 1, timeToSlot(event.end));
      const need = Math.max(1, Math.min(3, Number(event.capacity || 1)));
      const lane = findLane(occupancy, s, e, need);
      if (lane < 0) return;
      for (let slot = s; slot < e; slot += 1) {
        for (let l = lane; l < lane + need; l += 1) {
          occupancy[slot][l] = true;
        }
      }
    });

    return occupancy;
  }

  function getEventsForDate(date) {
    const target = new Date(`${date}T00:00:00`);
    if (Number.isNaN(target.getTime())) return [];

    return state.calendar.events.filter((event) => {
      if (!event || !event.date) return false;

      if (isExhibitionKind(event.kind)) {
        const startDate = new Date(`${event.date}T00:00:00`);
        const endDate = new Date(`${(event.endDate || event.date)}T00:00:00`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
        return target >= startDate && target <= endDate;
      }

      if (!event.repeatWeekly) {
        return event.date === date;
      }

      const skipDates = Array.isArray(event.repeatSkipDates) ? event.repeatSkipDates : [];
      if (skipDates.includes(date)) return false;

      const baseDate = new Date(`${event.date}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) return false;
      if (target < baseDate) return false;

      if (event.repeatEndDate) {
        const repeatEndDate = new Date(`${event.repeatEndDate}T00:00:00`);
        if (!Number.isNaN(repeatEndDate.getTime()) && target > repeatEndDate) {
          return false;
        }
      }

      return baseDate.getDay() === target.getDay();
    });
  }

  function findLane(occupancy, startSlot, endSlot, need) {
    for (let lane = 0; lane <= 3 - need; lane += 1) {
      let available = true;
      for (let s = startSlot; s < endSlot; s += 1) {
        for (let l = lane; l < lane + need; l += 1) {
          if (occupancy[s][l]) {
            available = false;
            break;
          }
        }
        if (!available) break;
      }
      if (available) return lane;
    }
    return -1;
  }

  function getBlockCapacity(rule, occupancy) {
    if (!rule || !occupancy) return 0;
    let maxUsed = 0;
    for (let slot = Number(rule.startSlot); slot < Number(rule.endSlot); slot += 1) {
      const used = (occupancy[slot] || []).filter(Boolean).length;
      if (used > maxUsed) maxUsed = used;
    }
    return maxUsed;
  }

  function isExhibitionKind(kind) {
    const value = String(kind || '').trim();
    return value === '전시회' || value.includes('전시');
  }

  function isKilnKind(kind) {
    const value = String(kind || '').trim();
    return value === '가마 소성' || value === '가마 관련' || value.includes('가마');
  }

  function isAllDayKind(kind) {
    return isKilnKind(kind) || isExhibitionKind(kind);
  }

  function getWeekStart(date) {
    const base = new Date(date);
    const day = base.getDay();
    const delta = day === 0 ? -6 : 1 - day;
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + delta);
    return base;
  }

  function addDays(date, diff) {
    const next = new Date(date);
    next.setDate(next.getDate() + diff);
    return next;
  }

  function slotToTime(slot) {
    const bounded = Math.max(0, Math.min(SLOTS_PER_DAY, slot));
    const hour = Math.floor((bounded * SLOT_MINUTES) / 60);
    const minute = (bounded * SLOT_MINUTES) % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function timeToSlot(timeStr) {
    const [h, m] = String(timeStr || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(SLOTS_PER_DAY, Math.floor((h * 60 + m) / SLOT_MINUTES)));
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

  function formatDateInput(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateLabel(date) {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDayIndexFromDateString(date) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return -1;
    const jsDay = d.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  function loadStudents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.students = Array.isArray(parsed)
        ? parsed.map((student) => ({
            ...student,
            instructor: String(student?.instructor || '').trim(),
            paymentHistory: Array.isArray(student?.paymentHistory)
              ? student.paymentHistory.map((d) => String(d || '').trim()).filter(Boolean)
              : (student?.mostRecentPaymentDate ? [String(student.mostRecentPaymentDate).trim()] : []),
            carryOverBeforePayment: Number(student.carryOverBeforePayment ?? 0),
            paymentCycleCredits: Number(
              student.paymentCycleCredits
              ?? student.purchasedClassCount
              ?? basisToCount(student.tuitionBasis)
              ?? student.initialRemainingCount
              ?? student.remainingCount
              ?? 0
            )
          }))
        : [];
    } catch (error) {
      state.students = [];
    }
  }

  function saveStudents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.students));
  }
})();
