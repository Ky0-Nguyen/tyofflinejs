import type { IStorageAdapter } from '../../core/types';
import { StorageError } from '../../core/types';

/**
 * Subset of react-native-mmkv MMKV used by {@link MmkvAdapter}.
 * Pass an `MMKV` instance from `react-native-mmkv`.
 */
export interface MmkvLike {
  getString(key: string): string | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

export class MmkvAdapter implements IStorageAdapter {
  private readonly mmkv: MmkvLike;
  private readonly prefix: string;

  constructor(mmkv: MmkvLike, prefix: string = '@offline:') {
    this.mmkv = mmkv;
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
      const raw = this.mmkv.getString(this.prefixKey(key));
      if (raw === undefined) return null;
      return JSON.parse(raw) as T;
    } catch (cause) {
      throw new StorageError(`Failed to get key "${key}"`, { cause: cause as Error });
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      this.mmkv.set(this.prefixKey(key), JSON.stringify(value));
    } catch (cause) {
      throw new StorageError(`Failed to set key "${key}"`, { cause: cause as Error });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.mmkv.delete(this.prefixKey(key));
    } catch (cause) {
      throw new StorageError(`Failed to remove key "${key}"`, { cause: cause as Error });
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      return this.mmkv
        .getAllKeys()
        .filter((k) => k.startsWith(this.prefix))
        .map((k) => this.stripPrefix(k));
    } catch (cause) {
      throw new StorageError('Failed to get all keys', { cause: cause as Error });
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    try {
      for (const key of keys) {
        const raw = this.mmkv.getString(this.prefixKey(key));
        if (raw !== undefined) {
          result.set(key, JSON.parse(raw) as T);
        }
      }
      return result;
    } catch (cause) {
      throw new StorageError('Failed to multiGet', { cause: cause as Error });
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = this.mmkv.getAllKeys().filter((k) => k.startsWith(this.prefix));
      for (const k of keys) {
        this.mmkv.delete(k);
      }
    } catch (cause) {
      throw new StorageError('Failed to clear storage', { cause: cause as Error });
    }
  }
}
