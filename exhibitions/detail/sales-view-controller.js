(function initializeExhibitionDetailSalesViewController(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function renderInventorySalesManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '작품 / 굿즈 판매';
      wrapper.appendChild(title);

      const innerContent = document.createElement('div');
      innerContent.className = 'works-sales-subcontent';
      wrapper.appendChild(innerContent);

      container.appendChild(wrapper);

      renderSalesManagement(innerContent);
    }

    function renderSalesManagement(container) {
      if (container) {
        container.innerHTML = '';
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'works-wrapper';

      const searchBar = document.createElement('div');
      searchBar.className = 'works-search-bar';
      searchBar.innerHTML = `
        <div class="works-search-row">
          <input id="sales-search" type="text" class="works-search" placeholder="번호, 제목, 작가, 구매자, 결제방법 등 검색" value="${state.salesSearch}" oninput="handleSalesSearchInput(this.value)">
          <button class="modal-btn modal-approve" onclick="toggleSalesAdvanced()">${state.salesAdvanced ? '간단 검색' : '고급 검색'}</button>
        </div>
        <div id="sales-advanced-search-panel" class="advanced-search-panel ${state.salesAdvanced ? 'active' : ''}">
          <div class="advanced-search-grid">
            <label>번호 <input type="text" id="sales-filter-manualNumber" value="${state.salesFilters.manualNumber}" onchange="handleSalesAdvancedFilter('manualNumber', this.value)"></label>
            <label>제목 <input type="text" id="sales-filter-title" value="${state.salesFilters.title}" onchange="handleSalesAdvancedFilter('title', this.value)"></label>
            <label>작가 <input type="text" id="sales-filter-author" value="${state.salesFilters.author}" onchange="handleSalesAdvancedFilter('author', this.value)"></label>
            <div class="sales-date-range-row">
              <label class="sales-date-range-label">판매일</label>
              <div class="sales-date-range">
                <input type="date" id="sales-filter-soldDateFrom" value="${state.salesFilters.soldDateFrom}" onchange="handleSalesAdvancedFilter('soldDateFrom', this.value)">
                <span class="sales-date-range-sep">~</span>
                <input type="date" id="sales-filter-soldDateTo" value="${state.salesFilters.soldDateTo}" onchange="handleSalesAdvancedFilter('soldDateTo', this.value)">
              </div>
            </div>
            <label>구매자 성함 <input type="text" id="sales-filter-buyerName" value="${state.salesFilters.buyerName}" onchange="handleSalesAdvancedFilter('buyerName', this.value)"></label>
            <label>구매자 연락처 <input type="text" id="sales-filter-buyerPhone" value="${state.salesFilters.buyerPhone}" onchange="handleSalesAdvancedFilter('buyerPhone', this.value)"></label>
            <label>결제방법 <input type="text" id="sales-filter-paymentMethod" value="${state.salesFilters.paymentMethod}" onchange="handleSalesAdvancedFilter('paymentMethod', this.value)"></label>
          </div>
          <div class="advanced-search-actions">
            <button class="modal-btn modal-approve" onclick="applySalesFilters()">검색</button>
            <button class="modal-btn modal-cancel" onclick="resetSalesFilters()">초기화</button>
          </div>
        </div>
      `;
      wrapper.appendChild(searchBar);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'works-action-row';

      const addSoldButton = document.createElement('button');
      addSoldButton.className = 'works-action-btn';
      addSoldButton.textContent = '+ 판매 항목 추가';
      addSoldButton.onclick = () => options.openSalesAddModal();
      actionsRow.appendChild(addSoldButton);

      const actionGroup = document.createElement('div');
      actionGroup.className = 'works-action-group';

      const selectAllButton = document.createElement('button');
      selectAllButton.className = 'works-action-btn works-action-btn-secondary';
      selectAllButton.id = 'sales-select-all-btn';
      selectAllButton.onclick = () => options.toggleSelectAllSalesFromButton();
      actionGroup.appendChild(selectAllButton);

      const saveAllButton = document.createElement('button');
      saveAllButton.className = 'works-action-btn works-action-btn-secondary';
      saveAllButton.id = 'sales-save-all-btn';
      saveAllButton.textContent = '전체 저장';
      saveAllButton.onclick = () => options.saveAllSoldWorks();
      saveAllButton.style.display = 'none';
      actionGroup.appendChild(saveAllButton);

      const deleteAllButton = document.createElement('button');
      deleteAllButton.className = 'works-action-btn works-action-btn-danger';
      deleteAllButton.textContent = '전체 삭제';
      deleteAllButton.onclick = () => options.deleteAllSoldWorks();
      if (options.isArtistScopedUser()) {
        deleteAllButton.style.display = 'none';
      }
      actionGroup.appendChild(deleteAllButton);

      const deleteSelectedButton = document.createElement('button');
      deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      deleteSelectedButton.id = 'sales-delete-selected-btn';
      deleteSelectedButton.textContent = '선택된 항목만 삭제';
      deleteSelectedButton.onclick = () => options.deleteSelectedSoldWorks();
      deleteSelectedButton.style.display = 'none';
      actionGroup.appendChild(deleteSelectedButton);

      const editSelectedButton = document.createElement('button');
      editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      editSelectedButton.id = 'sales-edit-selected-btn';
      editSelectedButton.textContent = '선택된 항목 수정';
      editSelectedButton.onclick = () => options.editSelectedSoldWorks();
      editSelectedButton.style.display = 'none';
      actionGroup.appendChild(editSelectedButton);

      const undoButton = document.createElement('button');
      undoButton.className = 'works-action-btn works-action-btn-secondary';
      undoButton.id = 'sales-undo-btn';
      undoButton.textContent = '되돌리기';
      undoButton.onclick = () => options.undoSalesChanges();
      actionGroup.appendChild(undoButton);

      const exportButton = document.createElement('button');
      exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      exportButton.textContent = '엑셀 파일로 다운 받기';
      exportButton.onclick = () => options.exportSalesToExcel();

      const allCertificatesButton = document.createElement('button');
      allCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      allCertificatesButton.textContent = '모든 보증서 다운 받기';
      allCertificatesButton.onclick = () => options.handleDownloadAllCertificatesAction();

      actionsRow.appendChild(actionGroup);
      actionsRow.appendChild(exportButton);
      actionsRow.appendChild(allCertificatesButton);
      wrapper.appendChild(actionsRow);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'works-table-wrapper expanded';
      const table = document.createElement('table');
      table.className = 'works-table sales-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th class="checkbox-col"><input type="checkbox" id="select-all-sales" onclick="toggleSelectAllSales(this)"></th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>번호</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleSalesSort('manualNumber')">${options.getSalesSortIndicator('manualNumber')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>분류</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'itemType' ? ' active' : ''}" onclick="toggleSalesSort('itemType')">${options.getSalesSortIndicator('itemType')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>카테고리</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'category' ? ' active' : ''}" onclick="toggleSalesSort('category')">${options.getSalesSortIndicator('category')}</button>
              </div>
            </th>
            <th>사진</th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>제목</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'title' ? ' active' : ''}" onclick="toggleSalesSort('title')">${options.getSalesSortIndicator('title')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>작가</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'author' ? ' active' : ''}" onclick="toggleSalesSort('author')">${options.getSalesSortIndicator('author')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>가격</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'price' ? ' active' : ''}" onclick="toggleSalesSort('price')">${options.getSalesSortIndicator('price')}</button>
              </div>
            </th>
            <th>수량</th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>판매일시</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'soldAtKst' ? ' active' : ''}" onclick="toggleSalesSort('soldAtKst')">${options.getSalesSortIndicator('soldAtKst')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>구매자 성함</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'buyerName' ? ' active' : ''}" onclick="toggleSalesSort('buyerName')">${options.getSalesSortIndicator('buyerName')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>구매자 연락처</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'buyerPhone' ? ' active' : ''}" onclick="toggleSalesSort('buyerPhone')">${options.getSalesSortIndicator('buyerPhone')}</button>
              </div>
            </th>
            <th class="sortable-header">
              <div class="header-with-sort">
                <span>결제방법</span>
                <button type="button" class="header-sort-btn${state.salesSortField === 'paymentMethod' ? ' active' : ''}" onclick="toggleSalesSort('paymentMethod')">${options.getSalesSortIndicator('paymentMethod')}</button>
              </div>
            </th>
            <th>비고</th>
            <th>작업</th>
            <th>보증서</th>
          </tr>
        </thead>
        <tbody id="sold-works-tbody"></tbody>
      `;

      tableWrapper.appendChild(table);
      wrapper.appendChild(tableWrapper);

      const bottomActionsRow = document.createElement('div');
      bottomActionsRow.className = 'works-action-row';
      bottomActionsRow.style.marginTop = '12px';
      bottomActionsRow.style.marginBottom = '0';

      const bottomAddSoldButton = document.createElement('button');
      bottomAddSoldButton.className = 'works-action-btn';
      bottomAddSoldButton.textContent = '+ 판매 항목 추가';
      bottomAddSoldButton.onclick = () => options.openSalesAddModal();
      bottomActionsRow.appendChild(bottomAddSoldButton);

      const bottomActionGroup = document.createElement('div');
      bottomActionGroup.className = 'works-action-group';

      const bottomSelectAllButton = document.createElement('button');
      bottomSelectAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSelectAllButton.id = 'sales-select-all-btn-bottom';
      bottomSelectAllButton.onclick = () => options.toggleSelectAllSalesFromButton();
      bottomActionGroup.appendChild(bottomSelectAllButton);

      const bottomSaveAllButton = document.createElement('button');
      bottomSaveAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSaveAllButton.id = 'sales-save-all-btn-bottom';
      bottomSaveAllButton.textContent = '전체 저장';
      bottomSaveAllButton.onclick = () => options.saveAllSoldWorks();
      bottomSaveAllButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomSaveAllButton);

      const bottomDeleteAllButton = document.createElement('button');
      bottomDeleteAllButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteAllButton.textContent = '전체 삭제';
      bottomDeleteAllButton.onclick = () => options.deleteAllSoldWorks();
      if (options.isArtistScopedUser()) {
        bottomDeleteAllButton.style.display = 'none';
      }
      bottomActionGroup.appendChild(bottomDeleteAllButton);

      const bottomDeleteSelectedButton = document.createElement('button');
      bottomDeleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteSelectedButton.id = 'sales-delete-selected-btn-bottom';
      bottomDeleteSelectedButton.textContent = '선택된 항목만 삭제';
      bottomDeleteSelectedButton.onclick = () => options.deleteSelectedSoldWorks();
      bottomDeleteSelectedButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomDeleteSelectedButton);

      const bottomEditSelectedButton = document.createElement('button');
      bottomEditSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      bottomEditSelectedButton.id = 'sales-edit-selected-btn-bottom';
      bottomEditSelectedButton.textContent = '선택된 항목 수정';
      bottomEditSelectedButton.onclick = () => options.editSelectedSoldWorks();
      bottomEditSelectedButton.style.display = 'none';
      bottomActionGroup.appendChild(bottomEditSelectedButton);

      const bottomUndoButton = document.createElement('button');
      bottomUndoButton.className = 'works-action-btn works-action-btn-secondary';
      bottomUndoButton.id = 'sales-undo-btn-bottom';
      bottomUndoButton.textContent = '되돌리기';
      bottomUndoButton.onclick = () => options.undoSalesChanges();
      bottomActionGroup.appendChild(bottomUndoButton);

      const bottomExportButton = document.createElement('button');
      bottomExportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomExportButton.textContent = '엑셀 파일로 다운 받기';
      bottomExportButton.onclick = () => options.exportSalesToExcel();

      const bottomAllCertificatesButton = document.createElement('button');
      bottomAllCertificatesButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomAllCertificatesButton.textContent = '모든 보증서 다운 받기';
      bottomAllCertificatesButton.onclick = () => options.handleDownloadAllCertificatesAction();

      bottomActionsRow.appendChild(bottomActionGroup);
      bottomActionsRow.appendChild(bottomExportButton);
      bottomActionsRow.appendChild(bottomAllCertificatesButton);
      wrapper.appendChild(bottomActionsRow);

      const ticker = document.createElement('div');
      ticker.className = 'stats-ticker';
      ticker.id = 'sales-sold-stats-ticker';
      wrapper.appendChild(ticker);

      container.appendChild(wrapper);
      options.renderSoldWorkRows();
    }

    return {
      renderInventorySalesManagement,
      renderSalesManagement
    };
  }

  const api = { create };
  root.ExhibitionDetailSalesViewController = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);