(function initializeExhibitionDetailAccountingViewController(root) {
  'use strict';

  function create(options) {
    const exhibitionDetailState = options.state;
    const document = options.document;
    const accountingProjection = options.accountingProjection;
    const canManageAccountingData = options.canManageAccountingData;
    const getFirstAllowedTab = options.getFirstAllowedTab;
    const switchTab = options.switchTab;
    const getCurrentExhibition = options.getCurrentExhibition;
    const ensureSoldWorksArray = options.ensureSoldWorksArray;
    const normalizeSoldItemType = options.normalizeSoldItemType;
    const getSoldQuantityForItemType = options.getSoldQuantityForItemType;
    const cloneSalesRecords = options.cloneSalesRecords;
    const saveExhibition = options.saveExhibition;
    const escapeHtml = options.escapeHtml;
    const alert = options.alert;
    const now = options.now;
    const random = options.random;

    function parseAccountingAmount(value) {
      return accountingProjection.parseAmount(value);
    }

    function formatAccountingAmount(value) {
      return accountingProjection.formatAmount(value);
    }

    function getExhibitionExpenseItems() {
      const exhibition = getCurrentExhibition();
      if (!Array.isArray(exhibition.expenseItems)) {
        exhibition.expenseItems = [];
      }

      if (!exhibition.expenseDefaultsInitialized) {
        const defaultRows = [
          { id: 'expense-print', code: 'print', division: '홍보물 인쇄', amount: '' },
          { id: 'expense-marketing', code: 'marketing', division: '마케팅 비용', amount: '' },
          { id: 'expense-commission-art', code: 'commission-art', division: '작가 커미션 (판매작)', amount: '' },
          { id: 'expense-commission-goods', code: 'commission-goods', division: '작가 커미션 (판매굿즈)', amount: '' }
        ];

        exhibition.expenseItems = [...defaultRows, ...exhibition.expenseItems];
        exhibition.expenseDefaultsInitialized = true;

        if (exhibitionDetailState.exhibition) {
          exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
          exhibitionDetailState.exhibition.expenseDefaultsInitialized = true;
        }
        saveExhibition();
      }

      return exhibition.expenseItems;
    }

    function getExhibitionRevenueItems() {
      return accountingProjection.buildRevenueItems({
        soldWorks: ensureSoldWorksArray(),
        manualRevenueItems: getExhibitionManualRevenueItems(),
        normalizeItemType: normalizeSoldItemType,
        getQuantity: getSoldQuantityForItemType
      });
    }

    function getExhibitionManualRevenueItems() {
      const exhibition = getCurrentExhibition();
      if (!Array.isArray(exhibition.manualRevenueItems)) {
        exhibition.manualRevenueItems = [];
      }
      return exhibition.manualRevenueItems;
    }

    function getExpenseEffectiveAmount(item, revenueTotals) {
      return accountingProjection.getExpenseEffectiveAmount(item, revenueTotals);
    }

    function buildAccountingTableRows(items, options = {}) {
      const {
        kind = 'expense',
        selectedIds = [],
        revenueTotals = { art: 0, goods: 0 },
        editingIds = []
      } = options;

      const isExpense = kind === 'expense';
      const rows = items.map((item) => {
        const isChecked = selectedIds.includes(item.id);
        const isAutoCommission = item.code === 'commission-art' || item.code === 'commission-goods';
        const isEditing = editingIds.includes(item.id);
        const displayAmount = isAutoCommission ? getExpenseEffectiveAmount(item, revenueTotals) : item.amount;
        const isAutoRevenue = !isExpense && item.source === 'auto';

        if (!isExpense) {
          return `
            <tr>
              <td class="checkbox-col"><input type="checkbox" data-accounting-kind="${kind}" data-accounting-id="${item.id}" ${isChecked ? 'checked' : ''} ${isAutoRevenue ? '' : ''} onclick='toggleAccountingRowSelection("${kind}", ${JSON.stringify(item.id)}, this.checked)'></td>
              <td>
                ${isAutoRevenue || !isEditing
                  ? `<span class="accounting-cell-text">${escapeHtml(String(item.division || ''))}</span>`
                  : `<input
                      id="revenue-division-${item.id}"
                      type="text"
                      class="accounting-text-input"
                      value="${escapeHtml(String(item.division || ''))}"
                      placeholder="예: 협찬금"
                      >`}
              </td>
              <td class="accounting-amount-cell">
                ${isAutoRevenue || !isEditing
                  ? `<span class="accounting-cell-text">${formatAccountingAmount(item.amount)}</span>`
                  : `<input
                      id="revenue-amount-${item.id}"
                      type="text"
                      class="accounting-amount-input"
                      value="${escapeHtml(String(item.amount || ''))}"
                      placeholder="₩ 0"
                      oninput="this.value = formatAccountingInput(this.value)"
                      >`}
              </td>
              <td class="accounting-action-cell">
                <button class="action-btn edit-btn" onclick='${isAutoRevenue ? `editAccountingRow("revenue", ${JSON.stringify(item.id)})` : (isEditing ? `saveRevenueRowEdit(${JSON.stringify(item.id)})` : `editAccountingRow("revenue", ${JSON.stringify(item.id)})`)}'>${!isAutoRevenue && isEditing ? '저장' : '수정'}</button>
                <button class="action-btn delete-btn" onclick='deleteAccountingRow("revenue", ${JSON.stringify(item.id)})'>삭제</button>
              </td>
            </tr>
          `;
        }

        return `
          <tr>
            <td class="checkbox-col"><input type="checkbox" data-accounting-kind="${kind}" data-accounting-id="${item.id}" ${isChecked ? 'checked' : ''} onclick='toggleAccountingRowSelection("${kind}", ${JSON.stringify(item.id)}, this.checked)'></td>
            <td>
              ${isAutoCommission || !isEditing
                ? `<span class="accounting-cell-text">${escapeHtml(String(item.division || ''))}</span>`
                : `<input
                    id="expense-division-${item.id}"
                    type="text"
                    class="accounting-text-input"
                    value="${escapeHtml(String(item.division || ''))}"
                    placeholder="예: 설치비, 운송비"
                    >`}
            </td>
            <td>
              ${isAutoCommission || !isEditing
                ? `<span class="accounting-cell-text">${formatAccountingAmount(displayAmount)}</span>`
                : `<input
                    id="expense-amount-${item.id}"
                    type="text"
                    class="accounting-amount-input"
                    value="${escapeHtml(String(item.amount || ''))}"
                    placeholder="0"
                    oninput="this.value = formatAccountingInput(this.value)"
                    >`}
            </td>
            <td class="accounting-action-cell">
              <button class="action-btn edit-btn" onclick='${isEditing ? `saveExpenseRowEdit(${JSON.stringify(item.id)})` : `editAccountingRow("expense", ${JSON.stringify(item.id)})`}'>${isEditing ? '저장' : '수정'}</button>
              <button class="action-btn delete-btn" onclick='deleteAccountingRow("expense", ${JSON.stringify(item.id)})'>삭제</button>
            </td>
          </tr>
        `;
      }).join('');

      return rows;
    }

    function renderExhibitionAccounting(container) {
      if (!canManageAccountingData()) {
        const fallbackTab = getFirstAllowedTab() || 'exhibition-info';
        switchTab(fallbackTab);
        return;
      }

      const exhibition = getCurrentExhibition();
      const expenseItems = getExhibitionExpenseItems();
      const revenueItems = getExhibitionRevenueItems();
      const { revenueTotals, expenseTotal, revenueTotal, profitTotal } =
        accountingProjection.buildFinanceProjection({ expenseItems, revenueItems });

      exhibitionDetailState.selectedExpenseIds = exhibitionDetailState.selectedExpenseIds
        .filter((id) => expenseItems.some((item) => item.id === id));
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds
        .filter((id) => expenseItems.some((item) => item.id === id));
      exhibitionDetailState.selectedRevenueIds = exhibitionDetailState.selectedRevenueIds
        .filter((id) => revenueItems.some((item) => item.id === id));
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds
        .filter((id) => revenueItems.some((item) => item.id === id));

      container.innerHTML = `
        <div class="accounting-wrapper">
          <div class="accounting-header-row">
            <h2>전시 회계</h2>
            <button type="button" class="works-action-btn works-action-btn-secondary" onclick="exportAccountingToExcel()">엑셀 파일로 다운로드</button>
          </div>
          <p class="accounting-description">전시의 지출과 수입을 한 화면에서 확인하세요.</p>
          <div class="accounting-profit-ticker ${profitTotal < 0 ? 'negative' : 'positive'}" role="status" aria-live="polite">
            <span class="accounting-profit-label">총이익</span>
            <strong class="accounting-profit-value">${formatAccountingAmount(profitTotal)}</strong>
            <span class="accounting-profit-meta">수입 합계 ${formatAccountingAmount(revenueTotal)} · 지출 합계 ${formatAccountingAmount(expenseTotal)}</span>
          </div>

          <div class="accounting-grid">
            <section class="accounting-card">
              <div class="accounting-card-header">
                <h3>지출</h3>
              </div>
              <div class="accounting-actions">
                <button type="button" class="works-action-btn" onclick="addExpenseItem()">+ 지출 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-select-all-btn" onclick="toggleAccountingSelectAllFromButton('expense')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('expense')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-undo-btn" onclick="undoExpenseAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="expense-delete-selected-btn" onclick="deleteSelectedExpenseItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
              <div class="accounting-table-wrapper">
                <table class="works-table accounting-table">
                  <colgroup>
                    <col class="accounting-col-checkbox">
                    <col class="accounting-col-division">
                    <col class="accounting-col-amount">
                    <col class="accounting-col-action">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="checkbox-col"><input type="checkbox" id="select-all-expense-accounting" onclick="toggleAccountingSelectAll('expense', this)"></th>
                      <th>구분</th>
                      <th>금액</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildAccountingTableRows(expenseItems, { kind: 'expense', selectedIds: exhibitionDetailState.selectedExpenseIds, revenueTotals, editingIds: exhibitionDetailState.editingExpenseIds })}
                  </tbody>
                  <tfoot>
                    <tr class="accounting-total-row">
                      <td></td>
                      <td>합계</td>
                      <td class="accounting-amount-cell">${formatAccountingAmount(expenseTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div class="accounting-actions" style="margin-top:10px;">
                <button type="button" class="works-action-btn" onclick="addExpenseItem()">+ 지출 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-select-all-btn-bottom" onclick="toggleAccountingSelectAllFromButton('expense')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('expense')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="expense-undo-btn-bottom" onclick="undoExpenseAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="expense-delete-selected-btn-bottom" onclick="deleteSelectedExpenseItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
            </section>

            <section class="accounting-card">
              <div class="accounting-card-header">
                <h3>수입</h3>
                <span class="accounting-note">작품/굿즈 판매 내역 자동 반영</span>
              </div>
              <div class="accounting-actions">
                <button type="button" class="works-action-btn" onclick="addRevenueItem()">+ 수입 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-select-all-btn" onclick="toggleAccountingSelectAllFromButton('revenue')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('revenue')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-undo-btn" onclick="undoRevenueAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="revenue-delete-selected-btn" onclick="deleteSelectedRevenueItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
              <div class="accounting-table-wrapper">
                <table class="works-table accounting-table">
                  <colgroup>
                    <col class="accounting-col-checkbox">
                    <col class="accounting-col-division">
                    <col class="accounting-col-amount">
                    <col class="accounting-col-action">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="checkbox-col"><input type="checkbox" id="select-all-revenue-accounting" onclick="toggleAccountingSelectAll('revenue', this)"></th>
                      <th>구분</th>
                      <th>금액</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildAccountingTableRows(revenueItems, { kind: 'revenue', selectedIds: exhibitionDetailState.selectedRevenueIds, editingIds: exhibitionDetailState.editingRevenueIds })}
                  </tbody>
                  <tfoot>
                    <tr class="accounting-total-row">
                      <td></td>
                      <td>합계</td>
                      <td class="accounting-amount-cell">${formatAccountingAmount(revenueTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div class="accounting-actions" style="margin-top:10px;">
                <button type="button" class="works-action-btn" onclick="addRevenueItem()">+ 수입 항목 추가</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-select-all-btn-bottom" onclick="toggleAccountingSelectAllFromButton('revenue')">전체 선택</button>
                <button type="button" class="works-action-btn works-action-btn-danger" onclick="deleteAllAccountingItems('revenue')">전체 삭제</button>
                <button type="button" class="works-action-btn works-action-btn-secondary" id="revenue-undo-btn-bottom" onclick="undoRevenueAccountingChanges()">되돌리기</button>
                <button type="button" class="works-action-btn works-action-btn-danger" id="revenue-delete-selected-btn-bottom" onclick="deleteSelectedRevenueItems()" style="display:none;">선택된 항목 삭제</button>
              </div>
            </section>
          </div>
        </div>
      `;

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }

      updateAccountingActionButtons();
    }

    function formatAccountingInput(value) {
      const raw = String(value ?? '').replace(/[^\d.-]/g, '');
      if (!raw || raw === '-' || raw === '.' || raw === '-.') return raw;
      const number = Number(raw);
      if (!Number.isFinite(number)) return '';
      return `₩ ${number.toLocaleString('ko-KR')}`;
    }

    function addExpenseItem() {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      pushExpenseUndoSnapshot();
      const newId = now() + Math.floor(random() * 1000);
      const expenses = getExhibitionExpenseItems();
      expenses.push({
        id: newId,
        division: '',
        amount: ''
      });
      if (!exhibitionDetailState.editingExpenseIds.includes(newId)) {
        exhibitionDetailState.editingExpenseIds = [...exhibitionDetailState.editingExpenseIds, newId];
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function handleExpenseFieldChange(expenseId, field, value) {
      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === expenseId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') return;
      pushExpenseUndoSnapshot();

      if (field === 'amount') {
        target.amount = formatAccountingInput(value);
      } else {
        target[field] = value;
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteSelectedExpenseItems() {
      if (exhibitionDetailState.selectedExpenseIds.length === 0) return;
      pushExpenseUndoSnapshot();
      const selectedIds = new Set(exhibitionDetailState.selectedExpenseIds);
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = getExhibitionExpenseItems().filter((item) => !selectedIds.has(item.id));
      exhibitionDetailState.selectedExpenseIds = [];
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => !selectedIds.has(id));

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function pushExpenseUndoSnapshot() {
      const snapshot = JSON.parse(JSON.stringify(getExhibitionExpenseItems()));
      exhibitionDetailState.expenseUndoStack.push(snapshot);
      if (exhibitionDetailState.expenseUndoStack.length > 30) {
        exhibitionDetailState.expenseUndoStack.shift();
      }
    }

    function pushRevenueUndoSnapshot() {
      const snapshot = {
        soldWorks: cloneSalesRecords(ensureSoldWorksArray()),
        manualRevenueItems: JSON.parse(JSON.stringify(getExhibitionManualRevenueItems()))
      };
      exhibitionDetailState.revenueUndoStack.push(snapshot);
      if (exhibitionDetailState.revenueUndoStack.length > 30) {
        exhibitionDetailState.revenueUndoStack.shift();
      }
    }

    function toggleAccountingRowSelection(kind, id, checked) {
      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = checked
          ? Array.from(new Set([...exhibitionDetailState.selectedExpenseIds, id]))
          : exhibitionDetailState.selectedExpenseIds.filter((itemId) => itemId !== id);
      } else {
        exhibitionDetailState.selectedRevenueIds = checked
          ? Array.from(new Set([...exhibitionDetailState.selectedRevenueIds, id]))
          : exhibitionDetailState.selectedRevenueIds.filter((itemId) => itemId !== id);
      }
      updateAccountingActionButtons();
    }

    function toggleAccountingSelectAll(kind, source) {
      const items = kind === 'expense' ? getExhibitionExpenseItems() : getExhibitionRevenueItems();
      const ids = items.map((item) => item.id);

      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = source.checked ? ids : [];
      } else {
        exhibitionDetailState.selectedRevenueIds = source.checked ? ids : [];
      }

      switchTab('exhibition-accounting');
    }

    function toggleAccountingSelectAllFromButton(kind) {
      const items = kind === 'expense' ? getExhibitionExpenseItems() : getExhibitionRevenueItems();
      const ids = items.map((item) => item.id);
      const selectedIds = kind === 'expense' ? exhibitionDetailState.selectedExpenseIds : exhibitionDetailState.selectedRevenueIds;
      const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

      if (kind === 'expense') {
        exhibitionDetailState.selectedExpenseIds = allSelected ? [] : ids;
      } else {
        exhibitionDetailState.selectedRevenueIds = allSelected ? [] : ids;
      }

      switchTab('exhibition-accounting');
    }

    function deleteAllAccountingItems(kind) {
      if (kind === 'expense') {
        const expenses = getExhibitionExpenseItems();
        if (expenses.length === 0) return;
        pushExpenseUndoSnapshot();
        const exhibition = getCurrentExhibition();
        exhibition.expenseItems = [];
        exhibitionDetailState.selectedExpenseIds = [];
        exhibitionDetailState.editingExpenseIds = [];
        if (exhibitionDetailState.exhibition) {
          exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
        }
        saveExhibition();
        switchTab('exhibition-accounting');
        return;
      }

      const soldWorks = ensureSoldWorksArray();
      const manualRevenueItems = getExhibitionManualRevenueItems();
      if (soldWorks.length === 0 && manualRevenueItems.length === 0) return;
      pushRevenueUndoSnapshot();
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = [];
      exhibition.manualRevenueItems = [];
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function undoExpenseAccountingChanges() {
      if (exhibitionDetailState.expenseUndoStack.length === 0) return;
      const previous = exhibitionDetailState.expenseUndoStack.pop();
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = JSON.parse(JSON.stringify(previous || []));
      exhibitionDetailState.selectedExpenseIds = [];
      exhibitionDetailState.editingExpenseIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function undoRevenueAccountingChanges() {
      if (exhibitionDetailState.revenueUndoStack.length === 0) return;
      const previous = exhibitionDetailState.revenueUndoStack.pop();
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = cloneSalesRecords(previous?.soldWorks || []);
      exhibition.manualRevenueItems = JSON.parse(JSON.stringify(previous?.manualRevenueItems || []));
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = [];
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteSelectedRevenueItems() {
      if (exhibitionDetailState.selectedRevenueIds.length === 0) return;
      pushRevenueUndoSnapshot();
      const selectedKinds = new Set(exhibitionDetailState.selectedRevenueIds);
      const exhibition = getCurrentExhibition();
      exhibition.soldWorks = ensureSoldWorksArray().filter((item) => {
        const kind = normalizeSoldItemType(item) === '굿즈' ? 'goods' : 'art';
        return !selectedKinds.has(kind);
      });
      exhibition.manualRevenueItems = getExhibitionManualRevenueItems().filter((item) => !selectedKinds.has(item.id));
      exhibitionDetailState.selectedRevenueIds = [];
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => !selectedKinds.has(id));
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function updateAccountingActionButtons() {
      const expenseItems = getExhibitionExpenseItems();
      const revenueItems = getExhibitionRevenueItems();

      const expenseAllSelected = expenseItems.length > 0 && expenseItems.every((item) => exhibitionDetailState.selectedExpenseIds.includes(item.id));
      const revenueAllSelected = revenueItems.length > 0 && revenueItems.every((item) => exhibitionDetailState.selectedRevenueIds.includes(item.id));

      ['expense-select-all-btn', 'expense-select-all-btn-bottom'].forEach((buttonId) => {
        const expenseSelectAllBtn = document.getElementById(buttonId);
        if (expenseSelectAllBtn) {
          expenseSelectAllBtn.textContent = expenseAllSelected ? '전체 선택 해제' : '전체 선택';
        }
      });

      ['revenue-select-all-btn', 'revenue-select-all-btn-bottom'].forEach((buttonId) => {
        const revenueSelectAllBtn = document.getElementById(buttonId);
        if (revenueSelectAllBtn) {
          revenueSelectAllBtn.textContent = revenueAllSelected ? '전체 선택 해제' : '전체 선택';
        }
      });

      ['expense-delete-selected-btn', 'expense-delete-selected-btn-bottom'].forEach((buttonId) => {
        const expenseDeleteSelectedBtn = document.getElementById(buttonId);
        if (expenseDeleteSelectedBtn) {
          expenseDeleteSelectedBtn.style.display = exhibitionDetailState.selectedExpenseIds.length > 0 ? 'inline-block' : 'none';
        }
      });

      ['revenue-delete-selected-btn', 'revenue-delete-selected-btn-bottom'].forEach((buttonId) => {
        const revenueDeleteSelectedBtn = document.getElementById(buttonId);
        if (revenueDeleteSelectedBtn) {
          revenueDeleteSelectedBtn.style.display = exhibitionDetailState.selectedRevenueIds.length > 0 ? 'inline-block' : 'none';
        }
      });

      ['expense-undo-btn', 'expense-undo-btn-bottom'].forEach((buttonId) => {
        const expenseUndoBtn = document.getElementById(buttonId);
        if (expenseUndoBtn) {
          const canUndo = exhibitionDetailState.expenseUndoStack.length > 0;
          expenseUndoBtn.disabled = !canUndo;
          expenseUndoBtn.style.opacity = canUndo ? '1' : '0.5';
          expenseUndoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
      });

      ['revenue-undo-btn', 'revenue-undo-btn-bottom'].forEach((buttonId) => {
        const revenueUndoBtn = document.getElementById(buttonId);
        if (revenueUndoBtn) {
          const canUndo = exhibitionDetailState.revenueUndoStack.length > 0;
          revenueUndoBtn.disabled = !canUndo;
          revenueUndoBtn.style.opacity = canUndo ? '1' : '0.5';
          revenueUndoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
      });

      const expenseHeaderCheckbox = document.getElementById('select-all-expense-accounting');
      if (expenseHeaderCheckbox) {
        expenseHeaderCheckbox.checked = expenseAllSelected;
      }

      const revenueHeaderCheckbox = document.getElementById('select-all-revenue-accounting');
      if (revenueHeaderCheckbox) {
        revenueHeaderCheckbox.checked = revenueAllSelected;
      }
    }

    function addRevenueItem() {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      pushRevenueUndoSnapshot();
      const newId = `revenue-${now()}-${Math.floor(random() * 1000)}`;
      const manualRevenueItems = getExhibitionManualRevenueItems();
      manualRevenueItems.push({
        id: newId,
        division: '',
        amount: ''
      });

      if (!exhibitionDetailState.editingRevenueIds.includes(newId)) {
        exhibitionDetailState.editingRevenueIds = [...exhibitionDetailState.editingRevenueIds, newId];
      }

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function editAccountingRow(kind, rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      if (kind === 'revenue') {
        const revenueItems = getExhibitionRevenueItems();
        const targetRevenue = revenueItems.find((item) => item.id === rowId);
        if (!targetRevenue) return;

        if (targetRevenue.source === 'auto') {
          exhibitionDetailState.salesSearch = rowId === 'goods' ? '굿즈' : '작품';
          switchTab('inventory-sales');
          return;
        }

        if (!exhibitionDetailState.editingRevenueIds.includes(rowId)) {
          exhibitionDetailState.editingRevenueIds = [...exhibitionDetailState.editingRevenueIds, rowId];
        }
        switchTab('exhibition-accounting');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === rowId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') {
        alert('해당 항목은 판매 합계 기반 자동 계산 항목입니다. 작품/굿즈 판매 내역을 수정해주세요.');
        return;
      }

      if (!exhibitionDetailState.editingExpenseIds.includes(rowId)) {
        exhibitionDetailState.editingExpenseIds = [...exhibitionDetailState.editingExpenseIds, rowId];
      }
      switchTab('exhibition-accounting');
    }

    function saveExpenseRowEdit(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      const target = expenses.find((item) => item.id === rowId);
      if (!target) return;
      if (target.code === 'commission-art' || target.code === 'commission-goods') return;

      const divisionInput = document.getElementById(`expense-division-${rowId}`);
      const amountInput = document.getElementById(`expense-amount-${rowId}`);
      const nextDivision = (divisionInput ? divisionInput.value : target.division || '').trim();
      const nextAmount = (amountInput ? amountInput.value : target.amount || '').trim();

      if (!nextDivision || !nextAmount) {
        alert('구분과 금액을 모두 입력한 뒤 저장해주세요.');
        return;
      }

      pushExpenseUndoSnapshot();
      target.division = nextDivision;
      target.amount = formatAccountingInput(nextAmount);

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }

      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => id !== rowId);
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteAccountingRow(kind, rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      if (kind === 'revenue') {
        deleteRevenueRowByType(rowId);
        return;
      }
      deleteExpenseRowById(rowId);
    }

    function deleteExpenseRowById(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const expenses = getExhibitionExpenseItems();
      if (!expenses.some((item) => item.id === rowId)) return;

      pushExpenseUndoSnapshot();
      const exhibition = getCurrentExhibition();
      exhibition.expenseItems = expenses.filter((item) => item.id !== rowId);
      exhibitionDetailState.selectedExpenseIds = exhibitionDetailState.selectedExpenseIds.filter((id) => id !== rowId);
      exhibitionDetailState.editingExpenseIds = exhibitionDetailState.editingExpenseIds.filter((id) => id !== rowId);

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.expenseItems = exhibition.expenseItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function deleteRevenueRowByType(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const exhibition = getCurrentExhibition();
      const soldWorks = ensureSoldWorksArray();
      const manualRevenueItems = getExhibitionManualRevenueItems();
      const hasManual = manualRevenueItems.some((item) => item.id === rowId);
      const isAutoKind = rowId === 'art' || rowId === 'goods';
      if (!hasManual && !isAutoKind) return;

      pushRevenueUndoSnapshot();
      if (isAutoKind) {
        exhibition.soldWorks = soldWorks.filter((item) => {
          const kind = normalizeSoldItemType(item) === '굿즈' ? 'goods' : 'art';
          return kind !== rowId;
        });
      } else {
        exhibition.manualRevenueItems = manualRevenueItems.filter((item) => item.id !== rowId);
      }
      exhibitionDetailState.selectedRevenueIds = exhibitionDetailState.selectedRevenueIds.filter((id) => id !== rowId);
      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => id !== rowId);

      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.soldWorks = exhibition.soldWorks;
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    function saveRevenueRowEdit(rowId) {
      if (!canManageAccountingData()) {
        alert('전시 회계 수정 권한이 없습니다.');
        return;
      }

      const manualRevenueItems = getExhibitionManualRevenueItems();
      const target = manualRevenueItems.find((item) => item.id === rowId);
      if (!target) return;

      const divisionInput = document.getElementById(`revenue-division-${rowId}`);
      const amountInput = document.getElementById(`revenue-amount-${rowId}`);
      const nextDivision = (divisionInput ? divisionInput.value : target.division || '').trim();
      const nextAmountRaw = (amountInput ? amountInput.value : target.amount || '').trim();

      if (!nextDivision || !nextAmountRaw) {
        alert('구분과 금액을 모두 입력한 뒤 저장해주세요.');
        return;
      }

      pushRevenueUndoSnapshot();
      target.division = nextDivision;
      target.amount = formatAccountingInput(nextAmountRaw);

      const exhibition = getCurrentExhibition();
      if (exhibitionDetailState.exhibition) {
        exhibitionDetailState.exhibition.manualRevenueItems = exhibition.manualRevenueItems;
      }

      exhibitionDetailState.editingRevenueIds = exhibitionDetailState.editingRevenueIds.filter((id) => id !== rowId);
      saveExhibition();
      switchTab('exhibition-accounting');
    }

    return {
      addExpenseItem,
      addRevenueItem,
      buildAccountingTableRows,
      deleteAccountingRow,
      deleteAllAccountingItems,
      deleteExpenseRowById,
      deleteRevenueRowByType,
      deleteSelectedExpenseItems,
      deleteSelectedRevenueItems,
      editAccountingRow,
      formatAccountingAmount,
      formatAccountingInput,
      getExhibitionExpenseItems,
      getExhibitionManualRevenueItems,
      getExhibitionRevenueItems,
      getExpenseEffectiveAmount,
      handleExpenseFieldChange,
      parseAccountingAmount,
      pushExpenseUndoSnapshot,
      pushRevenueUndoSnapshot,
      renderExhibitionAccounting,
      saveExpenseRowEdit,
      saveRevenueRowEdit,
      toggleAccountingRowSelection,
      toggleAccountingSelectAll,
      toggleAccountingSelectAllFromButton,
      undoExpenseAccountingChanges,
      undoRevenueAccountingChanges,
      updateAccountingActionButtons
    };
  }

  const api = { create };
  root.ExhibitionDetailAccountingViewController = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);