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
      studioUsers: [],
      classTeachingLog: []
    },
    pendingStudent: null,
    editingStudentId: '',
    slotPicker: {
      weekStart: getWeekStart(new Date()),
      selected: null
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    loadStudents();
    loadCalendarState();
    bindEvents();
    renderStudents();
    startHourlyAutoRecompute();
  });

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
    const repeatWeekly = Boolean(document.getElementById('slot-repeat-weekly')?.checked);
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
        const rule = getBaseRuleForSlot(day, slot);
        const cell = document.createElement('div');
        cell.className = 'slot-cell';

        if (rule && rule.type === '수업시간') {
          const occupancy = buildDailyOccupancyMap(date);
          const blockCapacity = getBlockCapacity(rule, occupancy);
          const isFull = blockCapacity >= 3;
          cell.classList.add('class-slot');
          if (isFull) cell.classList.add('full');

          const selected = state.slotPicker.selected
            && state.slotPicker.selected.date === date
            && timeToSlot(state.slotPicker.selected.start) === Number(rule.startSlot)
            && timeToSlot(state.slotPicker.selected.end) === Number(rule.endSlot);
          if (selected) {
            cell.classList.add('selected');
          }

          const prevRule = slot > 0 ? getBaseRuleForSlot(day, slot - 1) : null;
          const nextRule = slot < SLOTS_PER_DAY - 1 ? getBaseRuleForSlot(day, slot + 1) : null;
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

    if (!state.students.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="11">수강생을 추가하면 여기에 표시됩니다.</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    state.students.forEach((student, index) => {
      const stats = getStudentClassStats(student.name);
      const completedSincePayment = getCompletedClassCountSince(student.name, student.mostRecentPaymentDate);
      const remainingCount = getRemainingClassCount(student, completedSincePayment);
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
      if (remainingCount < 0) {
        remainingBadge.classList.add('negative');
      }
      remainingBadge.textContent = String(remainingCount);
      remainingTd.appendChild(remainingBadge);
      tr.appendChild(remainingTd);

      const actionTd = document.createElement('td');
      actionTd.className = 'action-cell';

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

  function saveStudentEdit() {
    const student = state.students.find((item) => item && item.id === state.editingStudentId);
    if (!student) {
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

    const paymentChanged = previousPaymentDate !== student.mostRecentPaymentDate;
    if (paymentChanged && student.mostRecentPaymentDate) {
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
    const startRule = getBaseRuleForSlot(day, startSlot);
    const endRule = getBaseRuleForSlot(day, endSlot - 1);
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
      state.calendar.studioUsers = Array.isArray(parsed.studioUsers) ? parsed.studioUsers : [];
      state.calendar.classTeachingLog = Array.isArray(parsed.classTeachingLog) ? parsed.classTeachingLog : [];
    } catch (error) {
      state.calendar.events = [];
      state.calendar.baseRules = [];
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
        studioUsers: state.calendar.studioUsers,
        classTeachingLog: state.calendar.classTeachingLog
      };
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify({
        events: state.calendar.events,
        baseRules: state.calendar.baseRules,
        studioUsers: state.calendar.studioUsers,
        classTeachingLog: state.calendar.classTeachingLog
      }));
    }
  }

  function getBaseRuleForSlot(day, slot) {
    return state.calendar.baseRules.find((rule) => {
      return Number(rule.day) === Number(day)
        && Number(rule.startSlot) <= Number(slot)
        && Number(rule.endSlot) > Number(slot);
    }) || null;
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
