(function initializeExhibitionDetailWorksView(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;

    function renderInventoryListManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-sales-wrapper';

      const title = document.createElement('div');
      title.className = 'works-sales-title';
      title.textContent = '작품 / 굿즈 목록';
      wrapper.appendChild(title);

      const toggleBar = document.createElement('div');
      toggleBar.className = 'works-sales-toggle-bar';
      toggleBar.innerHTML = `
        <button type="button" class="works-sales-toggle-btn${state.inventoryListView === 'art' ? ' active' : ''}" onclick="switchTab('works')">작품 목록</button>
        <button type="button" class="works-sales-toggle-btn${state.inventoryListView === 'goods' ? ' active' : ''}" onclick="switchTab('goods')">굿즈 목록</button>
      `;
      wrapper.appendChild(toggleBar);

      const innerContent = document.createElement('div');
      innerContent.className = 'works-sales-subcontent';
      wrapper.appendChild(innerContent);

      container.appendChild(wrapper);

      renderWorksManagement(innerContent);
    }

    function renderWorksManagement(container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'works-wrapper';
      const isGoodsMode = state.inventoryMode === 'goods';

      const searchBar = document.createElement('div');
      searchBar.className = 'works-search-bar';
      searchBar.innerHTML = `
        <div class="works-search-row">
          <input id="work-search" type="text" class="works-search" placeholder="작품명, 작가, 재료 등 검색" value="${state.workSearch}" oninput="handleWorkSearchInput(this.value)">
          <button class="modal-btn modal-approve" onclick="toggleWorkAdvanced()">${state.workAdvanced ? '간단 검색' : '고급 검색'}</button>
        </div>
        <div id="advanced-search-panel" class="advanced-search-panel ${state.workAdvanced ? 'active' : ''}">
          <div class="advanced-search-grid">
            <label>제목 <input type="text" id="filter-title" value="${state.workFilters.title}" onchange="handleAdvancedFilter('title', this.value)"></label>
            <label>작가 <input type="text" id="filter-artist" value="${state.workFilters.artist}" onchange="handleAdvancedFilter('artist', this.value)"></label>
            <label>가격 <input type="text" id="filter-price" value="${state.workFilters.price}" onchange="handleAdvancedFilter('price', this.value)"></label>
            <label>재료 <input type="text" id="filter-materials" value="${state.workFilters.materials}" onchange="handleAdvancedFilter('materials', this.value)"></label>
            <label>크기 <input type="text" id="filter-size" value="${state.workFilters.size}" onchange="handleAdvancedFilter('size', this.value)"></label>
            <label>연도 <input type="text" id="filter-year" value="${state.workFilters.year}" onchange="handleAdvancedFilter('year', this.value)"></label>
            <label>카테고리 <input type="text" id="filter-category" value="${state.workFilters.category}" onchange="handleAdvancedFilter('category', this.value)"></label>
          </div>
          <div class="advanced-search-actions">
            <button class="modal-btn modal-approve" onclick="applyWorkFilters()">검색</button>
            <button class="modal-btn modal-cancel" onclick="resetWorkFilters()">초기화</button>
          </div>
        </div>
      `;
      wrapper.appendChild(searchBar);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'works-action-row';

      const addButton = document.createElement('button');
      addButton.className = 'works-action-btn';
      addButton.textContent = isGoodsMode ? '+ 굿즈 추가' : '+ 작품 추가';
      addButton.onclick = () => options.addWorkRow();
      actionsRow.appendChild(addButton);

      if (!isGoodsMode) {
        const collectionButton = document.createElement('button');
        collectionButton.className = 'works-action-btn';
        collectionButton.textContent = '소장품에서 추가';
        collectionButton.onclick = () => options.openCollectionPicker();
        actionsRow.appendChild(collectionButton);
      }

      const actionGroup = document.createElement('div');
      actionGroup.className = 'works-action-group';

      const selectAllButton = document.createElement('button');
      selectAllButton.className = 'works-action-btn works-action-btn-secondary';
      selectAllButton.id = 'work-select-all-btn';
      const visibleWorks = options.getVisibleWorks();
      const allVisibleSelected = visibleWorks.length > 0 && visibleWorks.every(work => state.selectedWorkIds.includes(work.id));
      selectAllButton.textContent = allVisibleSelected ? '전체 선택 해제' : '전체 선택';
      selectAllButton.onclick = () => options.toggleSelectAllVisibleWorks();
      actionGroup.appendChild(selectAllButton);

      const deleteAllButton = document.createElement('button');
      deleteAllButton.className = 'works-action-btn works-action-btn-danger';
      deleteAllButton.textContent = '전체 삭제';
      deleteAllButton.onclick = () => options.deleteAllWorks();
      if (options.isArtistScopedUser()) {
        deleteAllButton.style.display = 'none';
      }
      actionGroup.appendChild(deleteAllButton);

      const deleteSelectedButton = document.createElement('button');
      deleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      deleteSelectedButton.id = 'work-delete-selected-btn';
      deleteSelectedButton.textContent = '선택된 항목만 삭제';
      deleteSelectedButton.onclick = () => options.deleteSelectedWorks();
      deleteSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      actionGroup.appendChild(deleteSelectedButton);

      const editSelectedButton = document.createElement('button');
      editSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      editSelectedButton.id = 'work-edit-selected-btn';
      editSelectedButton.textContent = '선택된 항목 수정';
      editSelectedButton.onclick = () => options.editSelectedWorks();
      editSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      actionGroup.appendChild(editSelectedButton);

      const exportButton = document.createElement('button');
      exportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      exportButton.textContent = '엑셀 파일로 다운 받기';
      exportButton.onclick = () => options.exportWorksToExcel();

      const saveAllButton = document.createElement('button');
      saveAllButton.className = 'works-action-btn works-action-btn-secondary';
      saveAllButton.textContent = '전체 저장';
      saveAllButton.id = 'save-all-btn';
      saveAllButton.style.display = 'none';
      saveAllButton.onclick = () => options.saveAllWorks();
      actionGroup.appendChild(saveAllButton);

      const undoButton = document.createElement('button');
      undoButton.className = 'works-action-btn works-action-btn-secondary';
      undoButton.id = 'work-undo-btn';
      undoButton.textContent = '되돌리기';
      undoButton.onclick = () => options.undoWorkChanges();
      actionGroup.appendChild(undoButton);

      actionsRow.appendChild(actionGroup);
      actionsRow.appendChild(exportButton);
      wrapper.appendChild(actionsRow);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'works-table-wrapper' + (state.workListExpanded ? ' expanded' : ' collapsed');
      const table = document.createElement('table');
      table.className = 'works-table';
      if (isGoodsMode) {
        table.innerHTML = `
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" id="select-all-works" onclick="toggleSelectAllWorks(this)"></th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>번호</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'manualNumber' ? ' active' : ''}" onclick="toggleWorkSort('manualNumber')">${options.getSortIndicator('manualNumber')}</button>
                </div>
              </th>
              <th>사진</th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>제품 이름</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'title' ? ' active' : ''}" onclick="toggleWorkSort('title')">${options.getSortIndicator('title')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>가격</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'price' ? ' active' : ''}" onclick="toggleWorkSort('price')">${options.getSortIndicator('price')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'quantity' ? ' active' : ''}" onclick="toggleWorkSort('quantity')">${options.getSortIndicator('quantity')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>판매된 수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'soldQuantity' ? ' active' : ''}" onclick="toggleWorkSort('soldQuantity')">${options.getSortIndicator('soldQuantity')}</button>
                </div>
              </th>
              <th class="sortable-header">
                <div class="header-with-sort">
                  <span>남은 수량</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'remainingQuantity' ? ' active' : ''}" onclick="toggleWorkSort('remainingQuantity')">${options.getSortIndicator('remainingQuantity')}</button>
                </div>
              </th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody id="works-tbody"></tbody>
        `;
      } else {
        const headerCells = [
          { key: 'manualNumber', label: '번호' },
          { key: 'category', label: '카테고리' },
          { key: 'photoName', label: '사진' },
          { key: 'title', label: '제목' },
          { key: 'author', label: '작가' },
          { key: 'price', label: '가격' },
          { key: 'materials', label: '재료' },
          { key: 'size', label: '크기' },
          { key: 'year', label: '연도' }
        ];
        table.innerHTML = `
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" id="select-all-works" onclick="toggleSelectAllWorks(this)"></th>
              ${headerCells.map(({ key, label }) => `
                <th class="sortable-header">
                  <div class="header-with-sort">
                    <span>${label}</span>
                    ${key !== 'photoName' ? `<button type="button" class="header-sort-btn${state.workSortField === key ? ' active' : ''}" onclick="toggleWorkSort('${key}')">${options.getSortIndicator(key)}</button>` : ''}
                  </div>
                </th>
              `).join('')}
              <th class="sortable-header work-status-cell">
                <div class="header-with-sort">
                  <span>상태</span>
                  <button type="button" class="header-sort-btn${state.workSortField === 'status' ? ' active' : ''}" onclick="toggleWorkSort('status')">${options.getSortIndicator('status')}</button>
                </div>
              </th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody id="works-tbody"></tbody>
        `;
      }
      tableWrapper.appendChild(table);
      const fadeOverlay = document.createElement('div');
      fadeOverlay.className = 'fade-overlay';
      tableWrapper.appendChild(fadeOverlay);
      wrapper.appendChild(tableWrapper);

      const bottomActionsRow = document.createElement('div');
      bottomActionsRow.className = 'works-action-row';
      bottomActionsRow.style.marginTop = '12px';
      bottomActionsRow.style.marginBottom = '0';

      const bottomAddButton = document.createElement('button');
      bottomAddButton.className = 'works-action-btn';
      bottomAddButton.textContent = isGoodsMode ? '+ 굿즈 추가' : '+ 작품 추가';
      bottomAddButton.onclick = () => options.addWorkRow();
      bottomActionsRow.appendChild(bottomAddButton);

      if (!isGoodsMode) {
        const bottomCollectionButton = document.createElement('button');
        bottomCollectionButton.className = 'works-action-btn';
        bottomCollectionButton.textContent = '소장품에서 추가';
        bottomCollectionButton.onclick = () => options.openCollectionPicker();
        bottomActionsRow.appendChild(bottomCollectionButton);
      }

      const bottomActionGroup = document.createElement('div');
      bottomActionGroup.className = 'works-action-group';

      const bottomSelectAllButton = document.createElement('button');
      bottomSelectAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSelectAllButton.id = 'work-select-all-btn-bottom';
      bottomSelectAllButton.onclick = () => options.toggleSelectAllVisibleWorks();
      bottomActionGroup.appendChild(bottomSelectAllButton);

      const bottomDeleteAllButton = document.createElement('button');
      bottomDeleteAllButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteAllButton.textContent = '전체 삭제';
      bottomDeleteAllButton.onclick = () => options.deleteAllWorks();
      if (options.isArtistScopedUser()) {
        bottomDeleteAllButton.style.display = 'none';
      }
      bottomActionGroup.appendChild(bottomDeleteAllButton);

      const bottomDeleteSelectedButton = document.createElement('button');
      bottomDeleteSelectedButton.className = 'works-action-btn works-action-btn-danger';
      bottomDeleteSelectedButton.id = 'work-delete-selected-btn-bottom';
      bottomDeleteSelectedButton.textContent = '선택된 항목만 삭제';
      bottomDeleteSelectedButton.onclick = () => options.deleteSelectedWorks();
      bottomDeleteSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      bottomActionGroup.appendChild(bottomDeleteSelectedButton);

      const bottomEditSelectedButton = document.createElement('button');
      bottomEditSelectedButton.className = 'works-action-btn works-action-btn-secondary';
      bottomEditSelectedButton.id = 'work-edit-selected-btn-bottom';
      bottomEditSelectedButton.textContent = '선택된 항목 수정';
      bottomEditSelectedButton.onclick = () => options.editSelectedWorks();
      bottomEditSelectedButton.style.display = state.selectedWorkIds.length > 0 ? 'inline-block' : 'none';
      bottomActionGroup.appendChild(bottomEditSelectedButton);

      const bottomSaveAllButton = document.createElement('button');
      bottomSaveAllButton.className = 'works-action-btn works-action-btn-secondary';
      bottomSaveAllButton.textContent = '전체 저장';
      bottomSaveAllButton.id = 'save-all-btn-bottom';
      bottomSaveAllButton.style.display = 'none';
      bottomSaveAllButton.onclick = () => options.saveAllWorks();
      bottomActionGroup.appendChild(bottomSaveAllButton);

      const bottomUndoButton = document.createElement('button');
      bottomUndoButton.className = 'works-action-btn works-action-btn-secondary';
      bottomUndoButton.id = 'work-undo-btn-bottom';
      bottomUndoButton.textContent = '되돌리기';
      bottomUndoButton.onclick = () => options.undoWorkChanges();
      bottomActionGroup.appendChild(bottomUndoButton);

      const bottomExportButton = document.createElement('button');
      bottomExportButton.className = 'works-action-btn works-action-btn-secondary works-export-btn';
      bottomExportButton.textContent = '엑셀 파일로 다운 받기';
      bottomExportButton.onclick = () => options.exportWorksToExcel();

      bottomActionsRow.appendChild(bottomActionGroup);
      bottomActionsRow.appendChild(bottomExportButton);
      wrapper.appendChild(bottomActionsRow);

      container.appendChild(wrapper);
      options.updateWorksUndoButton();
      renderWorkRows();
    }

    function updateSaveAllButtonVisibility() {
      ['save-all-btn', 'save-all-btn-bottom'].forEach((buttonId) => {
        const saveAllBtn = document.getElementById(buttonId);
        if (saveAllBtn) {
          saveAllBtn.style.display = state.unsavedWorkCount >= 2 ? 'inline-block' : 'none';
        }
      });
    }

    function renderWorkRows() {
      const tbody = document.getElementById('works-tbody');
      const exhibition = options.getCurrentExhibition();
      const isGoodsMode = state.inventoryMode === 'goods';
      const works = options.getSortedWorks();
      tbody.innerHTML = '';

      state.unsavedWorkCount = works.filter((work) => !work.saved).length;
      updateSaveAllButtonVisibility();
      options.updateWorkSelectionActionButtons(works);

      if (works.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${isGoodsMode ? 9 : 12}" class="no-users">등록된 ${isGoodsMode ? '굿즈가' : '작품이'} 없습니다.</td>`;
        tbody.appendChild(emptyRow);
        options.refreshGridKeyboardNavigation('works-tbody');
        return;
      }

      const soldWorkIdSet = new Set(
        options.ensureSoldWorksArray()
          .filter((item) => options.normalizeSoldItemType(item) === '작품')
          .map((item) => item.workId)
      );
      const selectAllCheckbox = document.getElementById('select-all-works');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = works.every((work) => state.selectedWorkIds.includes(work.id));
      }

      works.forEach((work, index) => {
        const row = document.createElement('tr');
        const soldQuantity = isGoodsMode ? options.getGoodsSoldQuantity(work.id) : 0;
        const stockQuantity = isGoodsMode ? options.parseStockQuantity(work.quantity || 0) : 0;
        const presentation = options.inventoryRenderer.buildWorkRow({
          work,
          index,
          isGoodsMode,
          isSelected: state.selectedWorkIds.includes(work.id),
          canModifyWork: options.canCurrentUserModifyOwnedRow(work),
          previewDataUrl: options.getPhotoPreviewDataUrl(work),
          isUnsold: options.isWorkNotForSale(work.price),
          isSold: soldWorkIdSet.has(work.id),
          soldQuantity,
          stockQuantity,
          remainingQuantity: Math.max(0, stockQuantity - soldQuantity),
          isSoloExhibition: exhibition.type === '개인전'
        });
        row.setAttribute('data-work-id', String(work.id));
        row.className = presentation.className;
        row.innerHTML = presentation.html;
        tbody.appendChild(row);
      });

      options.refreshGridKeyboardNavigation('works-tbody');
    }

    return {
      renderInventoryListManagement,
      renderWorksManagement,
      renderWorkRows,
      updateSaveAllButtonVisibility
    };
  }

  const api = { create };
  root.ExhibitionDetailWorksView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);