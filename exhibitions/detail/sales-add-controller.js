(function initializeExhibitionDetailSalesAddController(root) {
  'use strict';

  function create(options) {
    const state = options.state;
    const document = options.document;
    const schedule = options.setTimeout;

    function resetSalesAddCommonBuyerState() {
      state.salesAddApplyCommonBuyer = false;
      state.salesAddCommonBuyerName = '';
      state.salesAddCommonBuyerPhone = '';
      state.salesAddCommonPaymentMethod = '';
    }

    function renderSalesAddCommonBuyerSection() {
      const checkbox = document.getElementById('sales-add-apply-common-buyer');
      const fieldsSection = document.getElementById('sales-add-common-buyer-fields');
      const buyerNameInput = document.getElementById('sales-add-common-buyer-name');
      const buyerPhoneInput = document.getElementById('sales-add-common-buyer-phone');
      const paymentMethodSelect = document.getElementById('sales-add-common-payment-method');

      const enabled = !!state.salesAddApplyCommonBuyer;

      if (checkbox) checkbox.checked = enabled;
      if (fieldsSection) fieldsSection.hidden = !enabled;
      if (buyerNameInput) buyerNameInput.value = state.salesAddCommonBuyerName || '';
      if (buyerPhoneInput) buyerPhoneInput.value = state.salesAddCommonBuyerPhone || '';
      if (paymentMethodSelect) paymentMethodSelect.value = state.salesAddCommonPaymentMethod || '';
    }

    function handleSalesAddCommonBuyerToggle(checked) {
      state.salesAddApplyCommonBuyer = !!checked;
      renderSalesAddCommonBuyerSection();
    }

    function handleSalesAddCommonBuyerFieldChange(field, value) {
      if (field === 'buyerPhone') {
        const formatted = options.formatKoreanPhone(value);
        state.salesAddCommonBuyerPhone = formatted;
        const phoneInput = document.getElementById('sales-add-common-buyer-phone');
        if (phoneInput && phoneInput.value !== formatted) {
          phoneInput.value = formatted;
        }
        return;
      }

      if (field === 'buyerName') {
        state.salesAddCommonBuyerName = value || '';
        return;
      }

      if (field === 'paymentMethod') {
        state.salesAddCommonPaymentMethod = value || '';
      }
    }

    function openSalesAddModal() {
      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesAddBuffer = [];
      resetSalesAddCommonBuyerState();
      renderSalesAddSearchResults();
      renderSalesAddBuffer();
      renderSalesAddCommonBuyerSection();

      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        schedule(() => input.focus(), 0);
      }

      const modal = document.getElementById('sales-add-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeSalesAddModal() {
      const modal = document.getElementById('sales-add-modal');
      if (modal) modal.style.display = 'none';
      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesAddBuffer = [];
      resetSalesAddCommonBuyerState();
    }

    function handleSalesAddSearchInput(value) {
      state.salesSearchQuery = value;
      state.salesSearchResults = options.getSalesSearchResults(value);
      state.salesSearchHighlightIndex = -1;
      renderSalesAddSearchResults();
    }

    function handleSalesAddSearchKeydown(event) {
      const results = state.salesSearchResults;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (results.length === 0) return;
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        let next = state.salesSearchHighlightIndex;
        do {
          next += dir;
        } while (next >= 0 && next < results.length && !!options.getSalesPopupWorkDisabledReason(results[next]));
        state.salesSearchHighlightIndex = Math.max(-1, Math.min(results.length - 1, next));
        renderSalesAddSearchResults();
        return;
      }

      if (event.key !== 'Enter') return;
      event.preventDefault();

      const hi = state.salesSearchHighlightIndex;
      if (hi >= 0 && hi < results.length && !options.getSalesPopupWorkDisabledReason(results[hi])) {
        addWorkToSalesBuffer(results[hi]);
        return;
      }

      const query = (state.salesSearchQuery || '').trim().toLowerCase();
      if (!query || results.length === 0) return;

      const exact = results.find(work => {
        const number = (work.manualNumber || '').toString().trim().toLowerCase();
        const title = (work.title || '').toString().trim().toLowerCase();
        return (number === query || title === query) && !options.getSalesPopupWorkDisabledReason(work);
      });
      const firstAvailable = results.find(work => !options.getSalesPopupWorkDisabledReason(work));
      addWorkToSalesBuffer(exact || firstAvailable);
    }

    function addWorkToSalesBuffer(work) {
      if (!work) return;
      if (options.getSalesPopupWorkDisabledReason(work)) return;
      const exists = state.salesAddBuffer.some(item => item.workId === work.id && item.itemType === work.itemType);
      if (exists) return;

      state.salesAddBuffer.push({
        bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        workId: work.id,
        itemType: work.itemType || '작품',
        manualNumber: work.manualNumber || '',
        category: work.category || '',
        photoName: work.photoName || '',
        photoUrl: work.photoUrl || '',
        photoPreviewUrl: work.photoPreviewUrl || '',
        photoDataUrl: work.photoDataUrl || '',
        photoPreviewDataUrl: work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work),
        title: work.title || '',
        author: work.author || '',
        price: work.price || '',
        soldQuantity: work.itemType === '굿즈' ? 1 : 1,
        madeToOrder: false
      });

      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesSearchHighlightIndex = -1;
      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        input.focus();
      }

      renderSalesAddSearchResults();
      renderSalesAddBuffer();
    }

    function addMadeToOrderWorkToSalesBuffer(work) {
      if (!work) return;
      const disabledReason = options.getSalesPopupWorkDisabledReason(work);
      if (!disabledReason) return;

      state.salesAddBuffer.push({
        bufferItemId: `sales-buffer-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        workId: work.id,
        itemType: work.itemType || '작품',
        manualNumber: work.manualNumber || '',
        category: work.category || '',
        photoName: work.photoName || '',
        photoUrl: work.photoUrl || '',
        photoPreviewUrl: work.photoPreviewUrl || '',
        photoDataUrl: work.photoDataUrl || '',
        photoPreviewDataUrl: work.photoPreviewDataUrl || options.getPhotoPreviewDataUrl(work),
        title: work.title || '',
        author: work.author || '',
        price: work.price || '',
        soldQuantity: work.itemType === '굿즈' ? 1 : 1,
        madeToOrder: true
      });

      state.salesSearchQuery = '';
      state.salesSearchResults = [];
      state.salesSearchHighlightIndex = -1;
      const input = document.getElementById('sales-add-search-input');
      if (input) {
        input.value = '';
        input.focus();
      }

      renderSalesAddSearchResults();
      renderSalesAddBuffer();
    }

    function addMadeToOrderFromSearchResult(workId, itemType, event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      const results = state.salesSearchResults || [];
      const work = results.find((item) => item.id === workId && (item.itemType || '작품') === itemType)
        || options.getSalesSearchResults('__all__').find((item) => item.id === workId && (item.itemType || '작품') === itemType);
      if (!work) return;
      addMadeToOrderWorkToSalesBuffer(work);
    }

    function renderSalesAddSearchResults() {
      const container = document.getElementById('sales-add-search-results');
      if (!container) return;

      const query = (state.salesSearchQuery || '').trim();
      const results = state.salesSearchResults;
      container.innerHTML = '';

      if (!query) {
        container.innerHTML = '<p class="empty-state">작품/굿즈 번호 또는 제목으로 검색하세요.</p>';
        return;
      }

      if (results.length === 0) {
        container.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
        return;
      }

      const hi = state.salesSearchHighlightIndex;
      results.forEach((work, idx) => {
        const disabledReason = options.getSalesPopupWorkDisabledReason(work);
        const isDisabled = !!disabledReason;
        const tagText = disabledReason === 'alreadySold' ? '판매된 작품' : '미판매';
        const metaText = isDisabled
          ? `분류: ${work.itemType || '작품'} · ${work.author || '-'} · <span class="sales-status-tag-group"><span class="sales-not-for-sale-tag">${tagText}</span><button type="button" class="sales-made-to-order-btn" onclick="addMadeToOrderFromSearchResult(${work.id}, '${work.itemType || '작품'}', event)">주문제작</button></span>`
          : `분류: ${work.itemType || '작품'} · ${work.author || '-'} · ${work.price || '-'}`;
        const row = document.createElement('div');
        row.className = 'sales-search-result-row'
          + (idx === hi ? ' sales-search-result-highlighted' : '')
          + (isDisabled ? ' sales-search-result-disabled' : '');
        if (isDisabled) {
          row.setAttribute('aria-disabled', 'true');
          row.onclick = null;
        } else {
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.onclick = () => addWorkToSalesBuffer(work);
        }
        row.innerHTML = `
          <span class="sales-search-result-number">${work.manualNumber || '-'}</span>
          <span class="sales-search-result-title">${work.title || '제목 없음'}</span>
          <span class="sales-search-result-meta">${metaText}</span>
        `;
        container.appendChild(row);
      });

      if (hi >= 0) {
        const highlighted = container.querySelector('.sales-search-result-highlighted');
        if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderSalesAddBuffer() {
      const container = document.getElementById('sales-add-selected-list');
      const countEl = document.getElementById('sales-add-selected-count');
      const tickerEl = document.getElementById('sales-add-selected-ticker');
      if (!container || !countEl) return;

      const items = state.salesAddBuffer;
      countEl.textContent = `${items.length}개 선택됨`;
      updateSalesAddSelectedTicker(items, tickerEl);
      container.innerHTML = '';

      if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">아직 선택된 작품이 없습니다.</p>';
        return;
      }

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'sales-selected-row';
        const rowKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        const numberText = item.madeToOrder
          ? `<span class="sales-number-with-badge"><span>${item.manualNumber || '-'}</span><span class="sales-made-to-order-square-badge"><span>주문</span><span>제작</span></span></span>`
          : (item.manualNumber || '-');
        const titleText = item.title || '제목 없음';
        row.innerHTML = `
          <span class="sales-search-result-number">${numberText}</span>
          <span class="sales-search-result-title">${titleText}</span>
          <div class="sales-selected-actions">
            <span class="sales-search-result-meta">분류: ${item.itemType || '작품'} · ${item.author || '-'} · ${item.price || '-'}</span>
            ${item.itemType === '굿즈' ? `<input type="number" min="1" value="${options.parseSoldQuantity(item.soldQuantity)}" onchange="updateSalesBufferQuantity('${rowKey}', this.value)" style="width:88px;padding:4px 8px;border:1px solid #ddd;border-radius:8px;">` : ''}
            <button type="button" class="sales-selected-remove-btn" title="목록에서 제거" aria-label="목록에서 제거" onclick="removeWorkFromSalesBuffer('${rowKey}')">−</button>
          </div>
        `;
        container.appendChild(row);
      });
    }

    function updateSalesAddSelectedTicker(items, tickerEl) {
      const targetTicker = tickerEl || document.getElementById('sales-add-selected-ticker');
      if (!targetTicker) return;

      const safeItems = Array.isArray(items) ? items : [];
      const totalAmount = safeItems.reduce((sum, item) => {
        const unitPrice = options.parsePriceToNumber(item?.price);
        const quantity = options.normalizeSoldItemType(item) === '굿즈' ? options.parseSoldQuantity(item?.soldQuantity) : 1;
        return sum + (unitPrice * quantity);
      }, 0);

      targetTicker.textContent = `선택 ${safeItems.length}건 · 합계 ${options.formatCurrencyKrw(totalAmount)}`;
    }

    function updateSalesBufferQuantity(bufferKey, value) {
      const target = state.salesAddBuffer.find((item) => {
        const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        return itemKey === bufferKey;
      });
      if (!target) return;
      target.soldQuantity = options.parseSoldQuantity(value);
      updateSalesAddSelectedTicker(state.salesAddBuffer);
    }

    function removeWorkFromSalesBuffer(bufferKey) {
      state.salesAddBuffer = state.salesAddBuffer.filter((item) => {
        const itemKey = item.bufferItemId || `${item.itemType || '작품'}:${item.workId}`;
        return itemKey !== bufferKey;
      });
      renderSalesAddBuffer();
    }

    return Object.freeze({
      resetSalesAddCommonBuyerState,
      renderSalesAddCommonBuyerSection,
      handleSalesAddCommonBuyerToggle,
      handleSalesAddCommonBuyerFieldChange,
      openSalesAddModal,
      closeSalesAddModal,
      handleSalesAddSearchInput,
      handleSalesAddSearchKeydown,
      addWorkToSalesBuffer,
      addMadeToOrderWorkToSalesBuffer,
      addMadeToOrderFromSearchResult,
      renderSalesAddSearchResults,
      renderSalesAddBuffer,
      updateSalesAddSelectedTicker,
      updateSalesBufferQuantity,
      removeWorkFromSalesBuffer
    });
  }

  const api = Object.freeze({ create });
  root.ExhibitionDetailSalesAddController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);