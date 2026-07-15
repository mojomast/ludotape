import {canonical, clone, LudotapeError} from './index.mjs';

const fail = (code, message) => { throw new LudotapeError(code, message); };
function validKey(key, allowEmpty = false) {
  if (typeof key !== 'string' || (!allowEmpty && !key) || key.length > 1024 || /[\0-\x1f\x7f]/.test(key)) {
    fail('E_KEY', 'key must be a non-empty, bounded string without control characters');
  }
  return key;
}
function validNamespace(namespace) {
  validKey(namespace);
  if (namespace.length > 128) fail('E_NAMESPACE', 'namespace is too long');
  return namespace;
}

export function createMemoryRepository() {
  const data = new Map();
  return {
    async put(key, value) { validKey(key); const next = clone(value); data.set(key, next); return key; },
    async get(key) { validKey(key); return data.has(key) ? clone(data.get(key)) : null; },
    async delete(key) { validKey(key); return data.delete(key); },
    async list(prefix = '') { validKey(prefix, true); return [...data.keys()].filter(k => k.startsWith(prefix)).sort(); },
    async clear() { data.clear(); },
    get size() { return data.size; }
  };
}

/** Requires conforming synchronous Web Storage semantics: setItem/removeItem either complete or throw without changing that key. */
export function createStorageRepository(storage, {namespace = 'ludotape:'} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function' || typeof storage.key !== 'function') {
    fail('E_STORAGE', 'Storage-compatible object required');
  }
  validNamespace(namespace);
  const full = key => namespace + validKey(key);
  return {
    async put(key, value) {
      storage.setItem(full(key), canonical(value));
      return key;
    },
    async get(key) {
      const value = storage.getItem(full(key));
      if (value === null) return null;
      try { return clone(JSON.parse(value)); }
      catch { fail('E_STORAGE_DATA', 'stored value is malformed'); }
    },
    async delete(key) {
      const k = full(key);
      const existed = storage.getItem(k) !== null;
      storage.removeItem(k);
      return existed;
    },
    async list(prefix = '') {
      validKey(prefix, true);
      const out = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (typeof k !== 'string' || !k.startsWith(namespace)) continue;
        if (k.startsWith(namespace + prefix)) out.push(k.slice(namespace.length));
      }
      return out.sort();
    },
    async clear() {
      const keys = await this.list();
      const backup = keys.map(key => [key, storage.getItem(namespace + key)]);
      try { for (const [key] of backup) storage.removeItem(namespace + key); }
      catch (error) {
        try { for (const [key, value] of backup) if (value !== null) storage.setItem(namespace + key, value); }
        catch { throw new LudotapeError('E_STORAGE_ROLLBACK', 'clear failed and rollback was incomplete', {cause: error}); }
        throw error;
      }
    },
    get size() {
      let count = 0;
      for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(namespace)) count++;
      return count;
    }
  };
}

function idbError(message, error) {
  const detail = error?.message ? `: ${error.message}` : '';
  return new LudotapeError('E_IDB', `${message}${detail}`, error ? {cause: error} : undefined);
}

/** Create a lazy, promise-based IndexedDB repository of canonical values. */
export function createIndexedDbRepository(dbName, storeName, options = {}) {
  const indexedDb = options.indexedDB ?? globalThis.indexedDB;
  if (!indexedDb || typeof indexedDb.open !== 'function') {
    throw new LudotapeError('E_IDB_UNAVAILABLE', 'IndexedDB is not available in this environment');
  }
  if (typeof dbName !== 'string' || !dbName || typeof storeName !== 'string' || !storeName) {
    fail('E_IDB', 'dbName and storeName must be non-empty strings');
  }
  const version = options.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) fail('E_IDB', 'version must be a positive safe integer');
  let databasePromise;

  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDb.open(dbName, version); }
      catch (error) { reject(idbError('failed to open database', error)); return; }
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
        } catch (error) {
          reject(idbError('failed to create object store', error));
        }
      };
      request.onerror = () => reject(idbError('failed to open database', request.error));
      request.onblocked = () => reject(idbError('database open was blocked', request.error));
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.close();
          reject(idbError(`object store ${storeName} does not exist`));
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
    databasePromise.catch(() => { databasePromise = undefined; });
    return databasePromise;
  }

  async function transact(mode, start, message) {
    const database = await open();
    return new Promise((resolve, reject) => {
      let transaction;
      let result;
      let requestError;
      try {
        transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        result = start(store, value => { result = value; }, error => { requestError = error; });
      } catch (error) {
        reject(idbError(message, error));
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => { requestError ??= transaction.error; };
      transaction.onabort = () => reject(idbError(message, requestError ?? transaction.error));
    });
  }

  const repository = {
    async put(key, value) {
      validKey(key);
      const serialized = canonical(value);
      await transact('readwrite', (store, set, noteError) => {
        const request = store.put(serialized, key);
        request.onerror = () => noteError(request.error);
        return key;
      }, 'failed to put value');
      return key;
    },
    async get(key) {
      validKey(key);
      const serialized = await transact('readonly', (store, set, noteError) => {
        const request = store.get(key);
        request.onsuccess = () => set(request.result);
        request.onerror = () => noteError(request.error);
      }, 'failed to get value');
      if (serialized === undefined) return null;
      try { return clone(JSON.parse(serialized)); }
      catch (error) { throw idbError('stored value is malformed', error); }
    },
    async delete(key) {
      validKey(key);
      return transact('readwrite', (store, set, noteError) => {
        const lookup = typeof store.getKey === 'function' ? store.getKey(key) : store.get(key);
        lookup.onerror = () => noteError(lookup.error);
        lookup.onsuccess = () => {
          const existed = lookup.result !== undefined;
          set(existed);
          if (existed) {
            const removal = store.delete(key);
            removal.onerror = () => noteError(removal.error);
          }
        };
        return false;
      }, 'failed to delete value');
    },
    async list(prefix = '') {
      validKey(prefix, true);
      return transact('readonly', (store, set, noteError) => {
        const keys = [];
        const request = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
        request.onerror = () => noteError(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { set(keys.sort()); return; }
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) keys.push(cursor.key);
          cursor.continue();
        };
        return keys;
      }, 'failed to list values');
    },
    async clear() {
      await transact('readwrite', (store, set, noteError) => {
        const request = store.clear();
        request.onerror = () => noteError(request.error);
      }, 'failed to clear values');
    },
    get size() {
      return transact('readonly', (store, set, noteError) => {
        const request = store.count();
        request.onsuccess = () => set(request.result);
        request.onerror = () => noteError(request.error);
      }, 'failed to count values');
    }
  };
  return Object.freeze(repository);
}
