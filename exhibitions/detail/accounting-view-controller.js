(function initializeExhibitionDetailAccountingViewController(root) {
  'use strict';

  function create(options) {
    const exhibitionDetailState = options.state;
    const ExhibitionAccountingProjection = options.ExhibitionAccountingProjection;
    const canManageAccountingData = options.canManageAccountingData;
    const getFirstAllowedTab = options.getFirstAllowedTab;
    const switchTab = options.switchTab;
    const getCurrentExhibition = options.getCurrentExhibition;
    const getExhibitionExpenseItems = options.getExhibitionExpenseItems;
    const getExhibitionRevenueItems = options.getExhibitionRevenueItems;
    const getExpenseEffectiveAmount = options.getExpenseEffectiveAmount;
    const escapeAccountingHtml = options.escapeAccountingHtml;
    const formatAccountingAmount = options.formatAccountingAmount;
    const updateAccountingActionButtons = options.updateAccountingActionButtons;

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
                  ? `<span class="accounting-cell-text">${escapeAccountingHtml(String(item.division || ''))}</span>`
                  : `<input
                      id="revenue-division-${item.id}"
                      type="text"
                      class="accounting-text-input"
                      value="${escapeAccountingHtml(String(item.division || ''))}"
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
                      value="${escapeAccountingHtml(String(item.amount || ''))}"
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
                ? `<span class="accounting-cell-text">${escapeAccountingHtml(String(item.division || ''))}</span>`
                : `<input
                    id="expense-division-${item.id}"
                    type="text"
                    class="accounting-text-input"
                    value="${escapeAccountingHtml(String(item.division || ''))}"
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
                    value="${escapeAccountingHtml(String(item.amount || ''))}"
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
        ExhibitionAccountingProjection.buildFinanceProjection({ expenseItems, revenueItems });

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

    return {
      buildAccountingTableRows,
      renderExhibitionAccounting
    };
  }

  const api = { create };
  root.ExhibitionDetailAccountingViewController = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);