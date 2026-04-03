import { describe, it, expect } from 'vitest';
import { ConflictResolver } from '../../src/core/conflict-resolver';
import type { ConflictContext, PendingAction } from '../../src/core/types';

function makeAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'action-1',
    type: 'update',
    entity: 'task',
    entityId: 'task-1',
    payload: { title: 'Client Version' },
    timestamp: 1000,
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    ...overrides,
  };
}

describe('ConflictResolver', () => {
  it('client-wins should return local action', () => {
    const resolver = new ConflictResolver('client-wins');
    const ctx: ConflictContext = {
      local: makeAction(),
      remote: { title: 'Server Version', timestamp: 2000 },
      entity: 'task',
      entityId: 'task-1',
    };

    const result = resolver.resolve(ctx);
    expect(result).toEqual(ctx.local);
  });

  it('server-wins should return null (discard local)', () => {
    const resolver = new ConflictResolver('server-wins');
    const ctx: ConflictContext = {
      local: makeAction(),
      remote: { title: 'Server Version' },
      entity: 'task',
      entityId: 'task-1',
    };

    const result = resolver.resolve(ctx);
    expect(result).toBeNull();
  });

  it('last-write-wins should pick the later timestamp', () => {
    const resolver = new ConflictResolver('last-write-wins');

    const localWins: ConflictContext = {
      local: makeAction({ timestamp: 2000 }),
      remote: { timestamp: 1000 },
      entity: 'task',
      entityId: 'task-1',
    };
    expect(resolver.resolve(localWins)).toEqual(localWins.local);

    const serverWins: ConflictContext = {
      local: makeAction({ timestamp: 500 }),
      remote: { timestamp: 1000 },
      entity: 'task',
      entityId: 'task-1',
    };
    expect(resolver.resolve(serverWins)).toBeNull();
  });

  it('merge should combine local and remote payloads', () => {
    const resolver = new ConflictResolver('merge');
    const ctx: ConflictContext = {
      local: makeAction({ payload: { title: 'Local', priority: 'high' } }),
      remote: { title: 'Remote', description: 'From server' },
      entity: 'task',
      entityId: 'task-1',
    };

    const result = resolver.resolve(ctx);
    expect(result).not.toBeNull();
    expect(result!.payload).toEqual({
      title: 'Local',
      description: 'From server',
      priority: 'high',
    });
  });

  it('manual should return null (requires user intervention)', () => {
    const resolver = new ConflictResolver('manual');
    const ctx: ConflictContext = {
      local: makeAction(),
      remote: {},
      entity: 'task',
      entityId: 'task-1',
    };

    expect(resolver.resolve(ctx)).toBeNull();
  });

  it('should use custom handler when provided', () => {
    const resolver = new ConflictResolver('client-wins', (ctx) => ({
      ...ctx.local,
      payload: 'custom-resolved',
    }));

    const ctx: ConflictContext = {
      local: makeAction(),
      remote: {},
      entity: 'task',
      entityId: 'task-1',
    };

    const result = resolver.resolve(ctx);
    expect(result!.payload).toBe('custom-resolved');
  });

  it('should allow changing strategy at runtime', () => {
    const resolver = new ConflictResolver('client-wins');
    expect(resolver.getStrategy()).toBe('client-wins');

    resolver.setStrategy('server-wins');
    expect(resolver.getStrategy()).toBe('server-wins');
  });
});
