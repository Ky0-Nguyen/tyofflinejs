import type { IStorageAdapter } from '../../core/types';
import { StorageError } from '../../core/types';

const DEFAULT_DB_NAME = 'offline_module_db';
const DEFAULT_STORE_NAME = 'kv_store';
const DEFAULT_VERSION = 1;

export class IndexedDBAdapter implements IStorageAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly version: number;

  constructor(
    dbName: string = DEFAULT_DB_NAME,
    storeName: string = DEFAULT_STORE_NAME,
    version: number = DEFAULT_VERSION,
  ) {
    if (typeof indexedDB === 'undefined') {
      throw new StorageError('IndexedDB is not available in this environment');
    }
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(new StorageError('Failed to open IndexedDB', { cause: request.error }));
      };
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    try {
      const db = await this.getDB();
      return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(this.storeName, mode);
        const store = tx.objectStore(this.storeName);
        const request = operation(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new StorageError('IndexedDB operation failed', { cause: request.error }));
      });
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw new StorageError('IndexedDB transaction failed', { cause: cause as Error });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.transaction<T | undefined>(
      'readonly',
      (store) => store.get(key) as IDBRequest<T | undefined>,
    );
    return result ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.transaction<IDBValidKey>(
      'readwrite',
      (store) => store.put(value, key),
    );
  }

  async remove(key: string): Promise<void> {
    await this.transaction<undefined>(
      'readwrite',
      (store) => store.delete(key) as IDBRequest<undefined>,
    );
  }

  async getAllKeys(): Promise<string[]> {
    const keys = await this.transaction<IDBValidKey[]>(
      'readonly',
      (store) => store.getAllKeys(),
    );
    return keys.map(String);
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const db = await this.getDB();

    return new Promise<Map<string, T>>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);

      let remaining = keys.length;
      if (remaining === 0) {
        resolve(result);
        return;
      }

      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined) {
            result.set(key, request.result as T);
          }
          remaining -= 1;
          if (remaining === 0) resolve(result);
        };
        request.onerror = () => {
          reject(new StorageError(`Failed to get key "${key}"`, { cause: request.error }));
        };
      }
    });
  }

  async clear(): Promise<void> {
    await this.transaction<undefined>(
      'readwrite',
      (store) => store.clear() as IDBRequest<undefined>,
    );
  }
}
