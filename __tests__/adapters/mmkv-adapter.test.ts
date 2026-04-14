import { describe, it, expect, beforeEach } from 'vitest';
import { MmkvAdapter, type MmkvLike } from '../../src/adapters/storage/mmkv.adapter';

class FakeMmkv implements MmkvLike {
  private readonly store = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string | number | boolean): void {
    this.store.set(key, typeof value === 'string' ? value : String(value));
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  getAllKeys(): string[] {
    return [...this.store.keys()];
  }
}

describe('MmkvAdapter', () => {
  let mmkv: FakeMmkv;
  let adapter: MmkvAdapter;

  beforeEach(() => {
    mmkv = new FakeMmkv();
    adapter = new MmkvAdapter(mmkv);
  });

  it('returns null for missing keys', async () => {
    expect(await adapter.get('missing')).toBeNull();
  });

  it('set and get round-trip JSON values', async () => {
    await adapter.set('k', { n: 1 });
    expect(await adapter.get('k')).toEqual({ n: 1 });
  });

  it('removes a key', async () => {
    await adapter.set('k', 1);
    await adapter.remove('k');
    expect(await adapter.get('k')).toBeNull();
  });

  it('lists keys with prefix only', async () => {
    mmkv.set('@offline:a', '1');
    mmkv.set('@offline:b', '2');
    mmkv.set('other:x', '3');

    const keys = (await adapter.getAllKeys()).sort();
    expect(keys).toEqual(['a', 'b']);
  });

  it('multiGet returns only existing keys', async () => {
    await adapter.set('a', 10);
    await adapter.set('c', 30);
    const map = await adapter.multiGet<number>(['a', 'b', 'c']);
    expect(map.get('a')).toBe(10);
    expect(map.get('c')).toBe(30);
    expect(map.has('b')).toBe(false);
  });

  it('clear removes only prefixed keys', async () => {
    await adapter.set('a', 1);
    mmkv.set('other:keep', '"x"');

    await adapter.clear();

    expect(await adapter.getAllKeys()).toEqual([]);
    expect(mmkv.getString('other:keep')).toBe('"x"');
  });
});
