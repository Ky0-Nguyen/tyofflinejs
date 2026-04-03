import type { IStorageAdapter } from '../../core/types';
import { StorageError } from '../../core/types';

/**
 * React Native storage adapter using @react-native-async-storage/async-storage.
 * The dependency is optional and injected to avoid bundling native code on web.
 */

interface AsyncStorageStatic {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly [string, string | null][]>;
  clear(): Promise<void>;
}

export class AsyncStorageAdapter implements IStorageAdapter {
  private readonly asyncStorage: AsyncStorageStatic;
  private readonly prefix: string;

  constructor(asyncStorage: AsyncStorageStatic, prefix: string = '@offline:') {
    this.asyncStorage = asyncStorage;
    this.prefix = prefix;
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private stripPrefix(key: string): string {
    return key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.asyncStorage.getItem(this.prefixKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (cause) {
      throw new StorageError(`Failed to get key "${key}"`, { cause: cause as Error });
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      await this.asyncStorage.setItem(this.prefixKey(key), raw);
    } catch (cause) {
      throw new StorageError(`Failed to set key "${key}"`, { cause: cause as Error });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.asyncStorage.removeItem(this.prefixKey(key));
    } catch (cause) {
      throw new StorageError(`Failed to remove key "${key}"`, { cause: cause as Error });
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const allKeys = await this.asyncStorage.getAllKeys();
      return allKeys
        .filter((k) => k.startsWith(this.prefix))
        .map((k) => this.stripPrefix(k));
    } catch (cause) {
      throw new StorageError('Failed to get all keys', { cause: cause as Error });
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    try {
      const prefixedKeys = keys.map((k) => this.prefixKey(k));
      const pairs = await this.asyncStorage.multiGet(prefixedKeys);
      const result = new Map<string, T>();
      for (const [prefixedKey, raw] of pairs) {
        if (raw !== null) {
          result.set(this.stripPrefix(prefixedKey), JSON.parse(raw) as T);
        }
      }
      return result;
    } catch (cause) {
      throw new StorageError('Failed to multiGet', { cause: cause as Error });
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      for (const key of keys) {
        await this.asyncStorage.removeItem(this.prefixKey(key));
      }
    } catch (cause) {
      throw new StorageError('Failed to clear storage', { cause: cause as Error });
    }
  }
}
