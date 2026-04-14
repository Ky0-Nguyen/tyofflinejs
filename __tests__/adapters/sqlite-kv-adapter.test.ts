import { describe, it, expect, beforeEach } from 'vitest';
import {
  SqliteKvAdapter,
  type ISQLiteKvRuntime,
} from '../../src/adapters/storage/sqlite-kv.adapter';

/**
 * Minimal in-memory ISQLiteKvRuntime for adapter tests (not a full SQL engine).
 */
function createMemorySqliteKv(table: string): ISQLiteKvRuntime {
  const rows = new Map<string, string>();

  return {
    async execute(sql, params = []) {
      if (sql.startsWith('CREATE TABLE')) return;
      if (sql.includes('INSERT OR REPLACE')) {
        rows.set(params[0] as string, params[1] as string);
        return;
      }
      if (sql.includes('DELETE FROM') && sql.includes(`"${table}"`) && sql.includes('WHERE key = ?')) {
        rows.delete(params[0] as string);
      }
    },
    async query(sql, params = []) {
      if (sql.includes('SELECT value FROM') && sql.includes('WHERE key = ?')) {
        const key = params[0] as string;
        const v = rows.get(key);
        return v !== undefined ? [{ value: v }] : [];
      }
      if (sql.includes('SELECT key FROM') && !sql.includes('WHERE')) {
        return [...rows.keys()].map((key) => ({ key }));
      }
      if (sql.includes('SELECT key, value') && sql.includes('IN')) {
        const keys = params as string[];
        return keys.filter((k) => rows.has(k)).map((k) => ({ key: k, value: rows.get(k)! }));
      }
      return [];
    },
  };
}

describe('SqliteKvAdapter', () => {
  let sqlite: ISQLiteKvRuntime;
  let adapter: SqliteKvAdapter;

  beforeEach(() => {
    sqlite = createMemorySqliteKv('offline_kv');
    adapter = new SqliteKvAdapter(sqlite);
  });

  it('returns null for missing keys', async () => {
    expect(await adapter.get('missing')).toBeNull();
  });

  it('set and get round-trip', async () => {
    await adapter.set('entity', { id: '1' });
    expect(await adapter.get('entity')).toEqual({ id: '1' });
  });

  it('remove deletes row', async () => {
    await adapter.set('k', 42);
    await adapter.remove('k');
    expect(await adapter.get('k')).toBeNull();
  });

  it('getAllKeys strips prefix', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    const keys = (await adapter.getAllKeys()).sort();
    expect(keys).toEqual(['a', 'b']);
  });

  it('multiGet', async () => {
    await adapter.set('x', 1);
    await adapter.set('y', 2);
    const m = await adapter.multiGet<number>(['x', 'z', 'y']);
    expect(m.get('x')).toBe(1);
    expect(m.get('y')).toBe(2);
    expect(m.has('z')).toBe(false);
  });

  it('clear removes prefixed keys only', async () => {
    await adapter.set('a', 1);
    await sqlite.execute(`INSERT OR REPLACE INTO "offline_kv" (key, value) VALUES (?, ?)`, [
      'noprefix:keep',
      '"stay"',
    ]);

    await adapter.clear();

    expect(await adapter.getAllKeys()).toEqual([]);
    const rows = await sqlite.query(`SELECT key FROM "offline_kv"`, []);
    expect(rows.some((r) => r.key === 'noprefix:keep')).toBe(true);
  });

  it('rejects unsafe table names', () => {
    expect(() => new SqliteKvAdapter(sqlite, { tableName: 'bad;drop' })).toThrow();
  });
});
