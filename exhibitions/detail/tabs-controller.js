(function initializeExhibitionDetailTabsController(root) {
  'use strict';

  function applyTabVisibilityByPermission(options) {
    options.document.querySelectorAll('.tab-button').forEach((button) => {
      const tab = button.getAttribute('data-tab') || '';
      button.style.display = options.canAccessTab(tab) ? '' : 'none';
    });
  }

  function switchTab(tabName, options) {
    const state = options.state;

    if (!options.canAccessTab(tabName)) {
      options.applyTabVisibilityByPermission();
      const fallbackTab = options.getFirstAllowedTab();
      if (!fallbackTab) {
        options.alertNoAccess();
        options.redirectToExhibitions();
        return;
      }
      tabName = fallbackTab;
    }

    if (tabName === 'works') {
      state.currentTab = 'inventory-list';
      state.inventoryListView = 'art';
      options.syncInventoryMode('art');
    } else if (tabName === 'goods') {
      state.currentTab = 'inventory-list';
      state.inventoryListView = 'goods';
      options.syncInventoryMode('goods');
    } else if (tabName === 'sales' || tabName === 'inventory-sales') {
      state.currentTab = 'inventory-sales';
      options.syncInventoryMode('art');
    } else if (tabName === 'inventory-list') {
      state.currentTab = 'inventory-list';
      if (!['art', 'goods'].includes(state.inventoryListView)) {
        state.inventoryListView = 'art';
      }
      options.syncInventoryMode(state.inventoryListView);
    } else {
      state.currentTab = tabName;
    }

    if (state.currentTab === 'inventory-list') {
      options.saveLastViewedExhibitionTab(options.getCurrentInventoryListTabName());
    } else {
      options.saveLastViewedExhibitionTab(state.currentTab);
    }

    options.document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-tab') === state.currentTab);
    });

    const content = options.document.getElementById('tab-content');
    if (!content) return;
    content.innerHTML = '';

    if (tabName === 'staff') {
      options.renderStaffManagement(content);
    } else if (tabName === 'exhibition-info') {
      options.renderExhibitionInfo(content);
    } else if (tabName === 'works' || tabName === 'goods' || tabName === 'inventory-list') {
      options.renderInventoryListManagement(content);
    } else if (tabName === 'sales' || tabName === 'inventory-sales') {
      options.renderInventorySalesManagement(content);
    } else if (tabName === 'exhibition-files') {
      options.renderExhibitionFiles(content);
    } else if (tabName === 'exhibition-accounting') {
      options.renderExhibitionAccounting(content);
    } else if (tabName === 'exhibition-backup') {
      options.renderExhibitionBackup(content);
    }
  }

  const api = Object.freeze({
    applyTabVisibilityByPermission,
    switchTab
  });
  root.ExhibitionDetailTabsController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);