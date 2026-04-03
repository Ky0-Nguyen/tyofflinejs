import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, MockNetworkAdapter, MockSyncExecutor } from '../helpers';
import type { OfflineEngine } from '../../src/core/offline-engine';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';

describe('SyncManager', () => {
  let engine: OfflineEngine;
  let network: MockNetworkAdapter;
  let executor: MockSyncExecutor;

  beforeEach(async () => {
    const ctx = createTestEngine();
    engine = ctx.engine;
    network = ctx.network;
    executor = ctx.executor;
    await engine.init();
  });

  it('should sync pending actions when online', async () => {
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });

    await engine.syncNow();

    expect(executor.calls.length).toBe(1);
    expect(engine.getPendingActions().length).toBe(0);
  });

  it('should not sync when offline', async () => {
    network.setOnline(false);
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });

    await engine.syncNow();

    expect(executor.calls.length).toBe(0);
    expect(engine.getPendingActions().length).toBe(1);
  });

  it('should mark failed actions with increased retryCount', async () => {
    executor.shouldFail = true;
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });

    await engine.syncNow();

    const actions = engine.getPendingActions();
    expect(actions.length).toBe(1);
    expect(actions[0]!.status).toBe('failed');
    expect(actions[0]!.retryCount).toBe(1);
  });

  it('should process multiple actions in order', async () => {
    network.setOnline(false);

    await engine.enqueue({
      type: 'delete',
      entity: 'task',
      entityId: 'task-3',
      payload: null,
    });
    await engine.enqueue({
      type: 'create',
      entity: 'other',
      entityId: 'other-1',
      payload: { title: 'First' },
    });

    network.setOnline(true);
    await engine.syncNow();

    expect(executor.calls.length).toBe(2);
    const types = executor.calls.map((c: any) => c.type);
    expect(types).toEqual(['create', 'delete']);
  });

  it('should pause sync when network drops mid-sync', async () => {
    // Go offline first so enqueue doesn't trigger sync
    network.setOnline(false);

    await engine.enqueue({ type: 'create', entity: 'a', entityId: '1', payload: {} });
    await engine.enqueue({ type: 'create', entity: 'b', entityId: '2', payload: {} });

    // Go online, but drop connection after first execute
    network.setOnline(true);
    let callCount = 0;
    executor.customHandler = () => {
      callCount++;
      if (callCount === 1) {
        network.setOnline(false);
      }
      return { ok: true, value: {} };
    };

    await engine.syncNow();

    expect(callCount).toBe(1);
    expect(engine.getSyncStatus()).toBe('paused');
  });

  it('should handle conflict resolution during sync', async () => {
    executor.failWithConflict = true;
    await engine.enqueue({
      type: 'update',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Local' },
    });

    await engine.syncNow();

    // Default LWW resolver: local timestamp < remote, so local gets discarded
    // (the mock sets remote timestamp to Date.now() which is >= local)
    // Action should have been resolved by conflict handler
    expect(executor.calls.length).toBe(1);
  });

  it('should persist across engine restarts', async () => {
    const storage = new MemoryAdapter();
    const net = new MockNetworkAdapter();
    net.setOnline(false);
    const exec = new MockSyncExecutor();

    const engine1 = createTestEngine({ storage, network: net, syncExecutor: exec }).engine;
    await engine1.init();

    await engine1.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Persist Me' },
    });
    await engine1.destroy();

    const engine2 = createTestEngine({ storage, network: net, syncExecutor: exec }).engine;
    await engine2.init();

    expect(engine2.getPendingActions().length).toBe(1);
    expect(engine2.getPendingActions()[0]!.payload).toEqual({ title: 'Persist Me' });

    await engine2.destroy();
  });
});
