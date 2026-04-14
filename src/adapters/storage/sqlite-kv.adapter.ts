import type { IStorageAdapter } from '../../core/types';
import { StorageError } from '../../core/types';

const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Async SQLite surface for key-value rows. Bridge from expo-sqlite, op-sqlite, etc.
 */
export interface ISQLiteKvRuntime {
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  query(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

export interface SqliteKvAdapterOptions {
  /** Alphanumeric + underscore. Default: offline_kv */
  tableName?: string;
  /** Stored key prefix in DB. Default: @offline: (same as AsyncStorageAdapter). */
  prefix?: string;
}

export class SqliteKvAdapter implements IStorageAdapter {
  private readonly sqlite: ISQLiteKvRuntime;
  private readonly table: string;
  private readonly prefix: string;
  private initPromise: Promise<void> | null = null;

  constructor(sqlite: ISQLiteKvRuntime, options?: SqliteKvAdapterOptions) {
    this.sqlite = sqlite;
    const name = options?.tableName ?? 'offline_kv';
    if (!SAFE_IDENT.test(name)) {
      throw new StorageError(`Invalid SQLite table name "${name}" (use letters, digits, underscore)`);
    }
    this.table = name;
    this.prefix = options?.prefix ?? '@offline:';
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private stripPrefix(dbKey: string): string {
    return dbKey.startsWith(this.prefix) ? dbKey.slice(this.prefix.length) : dbKey;
  }

  private ensureTable(): Promise<void> {
    if (!this.initPromise) {
      const sql = `CREATE TABLE IF NOT EXISTS "${this.table}" (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`;
      this.initPromise = this.sqlite.execute(sql).catch((cause) => {
        this.initPromise = null;
        throw new StorageError('Failed to initialize SQLite KV table', { cause: cause as Error });
      });
    }
    return this.initPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureTable();
    try {
      const rows = await this.sqlite.query(
        `SELECT value FROM "${this.table}" WHERE key = ?`,
        [this.prefixKey(key)],
      );
      const raw = rows[0]?.value;
      if (typeof raw !== 'string') return null;
      return JSON.parse(raw) as T;
    } catch (cause) {
      throw new StorageError(`Failed to get key "${key}"`, { cause: cause as Error });
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.ensureTable();
    try {
      const raw = JSON.stringify(value);
      await this.sqlite.execute(`INSERT OR REPLACE INTO "${this.table}" (key, value) VALUES (?, ?)`, [
        this.prefixKey(key),
        raw,
      ]);
    } catch (cause) {
      throw new StorageError(`Failed to set key "${key}"`, { cause: cause as Error });
    }
  }

  async remove(key: string): Promise<void> {
    await this.ensureTable();
    try {
      await this.sqlite.execute(`DELETE FROM "${this.table}" WHERE key = ?`, [this.prefixKey(key)]);
    } catch (cause) {
      throw new StorageError(`Failed to remove key "${key}"`, { cause: cause as Error });
    }
  }

  async getAllKeys(): Promise<string[]> {
    await this.ensureTable();
    try {
      const rows = await this.sqlite.query(`SELECT key FROM "${this.table}"`, []);
      return rows
        .map((r) => r.key)
        .filter((k): k is string => typeof k === 'string' && k.startsWith(this.prefix))
        .map((k) => this.stripPrefix(k));
    } catch (cause) {
      throw new StorageError('Failed to get all keys', { cause: cause as Error });
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    await this.ensureTable();
    const result = new Map<string, T>();
    if (keys.length === 0) return result;
    try {
      const placeholders = keys.map(() => '?').join(',');
      const prefixed = keys.map((k) => this.prefixKey(k));
      const rows = await this.sqlite.query(
        `SELECT key, value FROM "${this.table}" WHERE key IN (${placeholders})`,
        prefixed,
      );
      for (const row of rows) {
        const dbKey = row.key;
        const raw = row.value;
        if (typeof dbKey === 'string' && typeof raw === 'string' && dbKey.startsWith(this.prefix)) {
          result.set(this.stripPrefix(dbKey), JSON.parse(raw) as T);
        }
      }
      return result;
    } catch (cause) {
      throw new StorageError('Failed to multiGet', { cause: cause as Error });
    }
  }

  async clear(): Promise<void> {
    await this.ensureTable();
    try {
      const rows = await this.sqlite.query(`SELECT key FROM "${this.table}"`, []);
      const toDelete = rows
        .map((r) => r.key)
        .filter((k): k is string => typeof k === 'string' && k.startsWith(this.prefix));
      for (const k of toDelete) {
        await this.sqlite.execute(`DELETE FROM "${this.table}" WHERE key = ?`, [k]);
      }
    } catch (cause) {
      throw new StorageError('Failed to clear storage', { cause: cause as Error });
    }
  }
}
