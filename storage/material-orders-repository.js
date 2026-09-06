(function initializeMaterialOrdersRepository(root) {
  'use strict';

  const KEYS = Object.freeze({
    orders: 'pottery-material-orders-v1',
    productOptions: 'pottery-material-product-options-v1'
  });

  function createMaterialOrdersRepository(storage) {
    function readArray(key) {
      try {
        const value = JSON.parse(storage.read(key) || '[]');
        return Array.isArray(value) ? value : [];
      } catch (error) {
        return [];
      }
    }

    return Object.freeze({
      loadOrders() {
        return readArray(KEYS.orders);
      },
      loadProductOptions() {
        return readArray(KEYS.productOptions);
      },
      saveOrders(orders) {
        return storage.write(KEYS.orders, JSON.stringify(orders));
      }
    });
  }

  function createDeferredMaterialOrdersRepository(getStorage) {
    function repository() {
      const storage = getStorage();
      if (!storage) throw new Error('Material orders storage adapter is unavailable.');
      return createMaterialOrdersRepository(storage);
    }
    return Object.freeze({
      loadOrders: () => repository().loadOrders(),
      loadProductOptions: () => repository().loadProductOptions(),
      saveOrders: (orders) => repository().saveOrders(orders)
    });
  }

  const api = Object.freeze({
    KEYS,
    createMaterialOrdersRepository,
    createDeferredMaterialOrdersRepository,
    repository: createDeferredMaterialOrdersRepository(() => root.BrowserStorageAdapter?.storage)
  });
  root.MaterialOrdersRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);