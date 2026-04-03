import type { IStorageAdapter } from '../../core/types';

export class MemoryAdapter implements IStorageAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return structuredClone(value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.store.get(key);
      if (value !== undefined) {
        result.set(key, structuredClone(value) as T);
      }
    }
    return result;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
