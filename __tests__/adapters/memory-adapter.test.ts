import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  it('should return null for missing keys', async () => {
    const result = await adapter.get('missing');
    expect(result).toBeNull();
  });

  it('should set and get a value', async () => {
    await adapter.set('key1', { hello: 'world' });
    const result = await adapter.get('key1');
    expect(result).toEqual({ hello: 'world' });
  });

  it('should return deep clones (not references)', async () => {
    const original = { nested: { value: 42 } };
    await adapter.set('key1', original);
    const result = await adapter.get<typeof original>('key1');

    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    result!.nested.value = 99;

    const result2 = await adapter.get<typeof original>('key1');
    expect(result2!.nested.value).toBe(42);
  });

  it('should remove a key', async () => {
    await adapter.set('key1', 'value');
    await adapter.remove('key1');
    const result = await adapter.get('key1');
    expect(result).toBeNull();
  });

  it('should return all keys', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.set('c', 3);

    const keys = await adapter.getAllKeys();
    expect(keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('should multiGet values', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.set('c', 3);

    const result = await adapter.multiGet<number>(['a', 'c', 'missing']);
    expect(result.get('a')).toBe(1);
    expect(result.get('c')).toBe(3);
    expect(result.has('missing')).toBe(false);
  });

  it('should clear all data', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    await adapter.clear();

    const keys = await adapter.getAllKeys();
    expect(keys).toEqual([]);
  });
});
