import { describe, it, expect, beforeEach } from 'vitest';
import { TempIdResolver } from '../../../src/core/dag/temp-id-resolver';
import type { PendingAction } from '../../../src/core/types';

function makeAction(overrides: Partial<PendingAction>): PendingAction {
  return {
    id: 'a1',
    type: 'create',
    entity: 'SubItem',
    entityId: 'tmp-sub-1',
    payload: { itemId: 'tmp-item-1', name: 'child' },
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    ...overrides,
  };
}

describe('TempIdResolver', () => {
  let resolver: TempIdResolver;

  beforeEach(() => {
    resolver = new TempIdResolver();
  });

  it('registers and resolves temp IDs', () => {
    resolver.register('tmp-1', 'srv-1');
    expect(resolver.resolve('tmp-1')).toBe('srv-1');
  });

  it('returns undefined for unregistered IDs', () => {
    expect(resolver.resolve('tmp-unknown')).toBeUndefined();
  });

  it('returns current map as a copy', () => {
    resolver.register('tmp-1', 'srv-1');
    const map = resolver.getMap();
    map.set('tmp-2', 'srv-2');
    expect(resolver.resolve('tmp-2')).toBeUndefined();
  });

  it('replaces entityId with resolved server ID', () => {
    resolver.register('tmp-item-1', 'srv-item-1');

    const action = makeAction({ entityId: 'tmp-item-1' });
    const resolved = resolver.resolveAction(action);

    expect(resolved.entityId).toBe('srv-item-1');
  });

  it('deep-resolves temp IDs in payload', () => {
    resolver.register('tmp-item-1', 'srv-item-1');

    const action = makeAction({
      payload: { itemId: 'tmp-item-1', name: 'child' },
    });
    const resolved = resolver.resolveAction(action);
    const payload = resolved.payload as Record<string, unknown>;

    expect(payload['itemId']).toBe('srv-item-1');
    expect(payload['name']).toBe('child');
  });

  it('handles nested objects in payload', () => {
    resolver.register('tmp-1', 'srv-1');

    const action = makeAction({
      payload: { nested: { ref: 'tmp-1', other: 42 } },
    });
    const resolved = resolver.resolveAction(action);
    const payload = resolved.payload as Record<string, Record<string, unknown>>;

    expect(payload['nested']!['ref']).toBe('srv-1');
    expect(payload['nested']!['other']).toBe(42);
  });

  it('handles arrays in payload', () => {
    resolver.register('tmp-1', 'srv-1');
    resolver.register('tmp-2', 'srv-2');

    const action = makeAction({
      payload: { refs: ['tmp-1', 'tmp-2', 'literal'] },
    });
    const resolved = resolver.resolveAction(action);
    const payload = resolved.payload as Record<string, string[]>;

    expect(payload['refs']).toEqual(['srv-1', 'srv-2', 'literal']);
  });

  it('attaches resolvedIds snapshot to resolved action', () => {
    resolver.register('tmp-1', 'srv-1');

    const action = makeAction({});
    const resolved = resolver.resolveAction(action);

    expect(resolved.resolvedIds).toEqual({ 'tmp-1': 'srv-1' });
  });

  it('skips resolution when map is empty', () => {
    const action = makeAction({ entityId: 'tmp-item-1' });
    const resolved = resolver.resolveAction(action);

    expect(resolved.entityId).toBe('tmp-item-1');
    expect(resolved).toBe(action);
  });

  it('clears all mappings', () => {
    resolver.register('tmp-1', 'srv-1');
    resolver.clear();
    expect(resolver.resolve('tmp-1')).toBeUndefined();
  });

  it('persists and loads from storage', async () => {
    const storage = {
      _data: new Map<string, unknown>(),
      async get<T>(key: string) { return (this._data.get(key) as T) ?? null; },
      async set<T>(key: string, value: T) { this._data.set(key, value); },
      async remove(key: string) { this._data.delete(key); },
      async getAllKeys() { return Array.from(this._data.keys()); },
      async multiGet<T>(keys: string[]) {
        const map = new Map<string, T>();
        for (const k of keys) { const v = this._data.get(k); if (v) map.set(k, v as T); }
        return map;
      },
      async clear() { this._data.clear(); },
    };

    const r1 = new TempIdResolver(storage);
    r1.register('tmp-1', 'srv-1');
    await r1.persist();

    const r2 = new TempIdResolver(storage);
    await r2.load();
    expect(r2.resolve('tmp-1')).toBe('srv-1');
  });
});
