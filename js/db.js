// ===== IndexedDB wrapper =====
const DB = (() => {
  const DB_NAME = 'financeApp';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('transactions')) {
          const ts = d.createObjectStore('transactions', { keyPath: 'id' });
          ts.createIndex('date', 'date');
          ts.createIndex('category', 'category');
          ts.createIndex('type', 'type');
        }
        if (!d.objectStoreNames.contains('budgets')) {
          d.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function all(storeName) {
    return open().then(() => new Promise((resolve, reject) => {
      const req = tx(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function get(storeName, id) {
    return open().then(() => new Promise((resolve, reject) => {
      const req = tx(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function put(storeName, item) {
    return open().then(() => new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function remove(storeName, id) {
    return open().then(() => new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function clearStore(storeName) {
    return open().then(() => new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  // Settings helpers
  async function getSetting(key) {
    await open();
    const item = await get('settings', key);
    return item ? item.value : null;
  }

  async function setSetting(key, value) {
    await put('settings', { key, value });
  }

  return { open, all, get, put, remove, clearStore, getSetting, setSetting };
})();
