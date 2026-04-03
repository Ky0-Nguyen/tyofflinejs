import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestEngine, MockNetworkAdapter, MockSyncExecutor } from '../helpers';
import type { OfflineEngine } from '../../src/core/offline-engine';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';
import {
  isNetworkError,
  NetworkError,
  ExecutionTimeoutError,
} from '../../src/core/types';

// ---------------------------------------------------------------------------
// Fix #1 – Network stabilization window
// ---------------------------------------------------------------------------
describe('Fix #1: Network Stabilization Window', () => {
  it('should NOT trigger sync immediately on network online event', async () => {
    const { engine, network, executor } = createTestEngine({
      networkStabilizationMs: 500,
    });
    await engine.init();

    network.setOnline(false);
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    network.setOnline(true);
    // Give 100ms — sync should NOT have fired yet
    await new Promise((r) => setTimeout(r, 100));
    expect(executor.calls.length).toBe(0);

    await engine.destroy();
  });

  it('should sync after stabilization window elapses', async () => {
    const { engine, network, executor } = createTestEngine({
      networkStabilizationMs: 200,
    });
    await engine.init();

    network.setOnline(false);
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    network.setOnline(true);
    await new Promise((r) => setTimeout(r, 350));

    expect(executor.calls.length).toBe(1);
    await engine.destroy();
  });

  it('should reset stabilization timer on rapid ON/OFF toggling', async () => {
    const { engine, network, executor } = createTestEngine({
      networkStabilizationMs: 200,
    });
    await engine.init();

    network.setOnline(false);
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    // Rapid toggling
    network.setOnline(true);
    await new Promise((r) => setTimeout(r, 100));
    network.setOnline(false);
    await new Promise((r) => setTimeout(r, 50));
    network.setOnline(true);
    await new Promise((r) => setTimeout(r, 100));
    network.setOnline(false);

    // After enough time, still no sync because network ended offline
    await new Promise((r) => setTimeout(r, 300));
    expect(executor.calls.length).toBe(0);

    await engine.destroy();
  });

  it('should cancel stabilization timer when network goes offline', async () => {
    const { engine, network, executor } = createTestEngine({
      networkStabilizationMs: 200,
    });
    await engine.init();

    network.setOnline(false);
    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    network.setOnline(true);
    await new Promise((r) => setTimeout(r, 100));
    network.setOnline(false); // cancel

    await new Promise((r) => setTimeout(r, 300));
    expect(executor.calls.length).toBe(0);

    await engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// Fix #2 – Recover actions stuck in 'in_progress'
// ---------------------------------------------------------------------------
describe('Fix #2: In-Progress Recovery', () => {
  it('should recover in_progress actions to pending on engine restart', async () => {
    const storage = new MemoryAdapter();
    const network = new MockNetworkAdapter();
    network.setOnline(false);
    const executor = new MockSyncExecutor();

    const engine1 = createTestEngine({
      storage,
      network,
      syncExecutor: executor,
    }).engine;
    await engine1.init();

    await engine1.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: { title: 'test' },
    });

    // Manually force the action to in_progress (simulating a crash mid-sync)
    const actions = engine1.getPendingActions();
    await engine1.queue.updateStatus(actions[0]!.id, 'in_progress');
    expect(engine1.getPendingActions()[0]!.status).toBe('in_progress');

    await engine1.destroy();

    // Restart with same storage
    const engine2 = createTestEngine({
      storage,
      network,
      syncExecutor: executor,
    }).engine;
    await engine2.init();

    const recovered = engine2.getPendingActions();
    expect(recovered.length).toBe(1);
    expect(recovered[0]!.status).toBe('pending');

    await engine2.destroy();
  });

  it('should reset action to pending when sync pauses mid-flight', async () => {
    const { engine, network, executor } = createTestEngine();
    await engine.init();

    network.setOnline(false);
    await engine.enqueue({
      type: 'create', entity: 'a', entityId: '1', payload: {},
    });
    await engine.enqueue({
      type: 'create', entity: 'b', entityId: '2', payload: {},
    });

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

    // Second action should be back to 'pending', not stuck in 'in_progress'
    const pending = engine.getPendingActions();
    const statuses = pending.map((a) => a.status);
    expect(statuses).not.toContain('in_progress');

    await engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// Fix #3 – Execution timeout
// ---------------------------------------------------------------------------
describe('Fix #3: Execution Timeout', () => {
  it('should timeout if executor does not respond in time', async () => {
    const { engine, executor } = createTestEngine({
      executionTimeoutMs: 200,
    });
    await engine.init();

    executor.customHandler = () =>
      new Promise(() => {}) as any; // never resolves

    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    await engine.syncNow();

    // Action should still be in queue (reverted to pending because timeout is a network error)
    const actions = engine.getPendingActions();
    expect(actions.length).toBe(1);
    expect(actions[0]!.status).toBe('pending');
    // retryCount should NOT have been incremented (network error)
    expect(actions[0]!.retryCount).toBe(0);

    await engine.destroy();
  });

  it('should succeed if executor responds before timeout', async () => {
    const { engine, executor } = createTestEngine({
      executionTimeoutMs: 5000,
    });
    await engine.init();

    executor.customHandler = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, value: {} };
    };

    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    await engine.syncNow();
    expect(engine.getPendingActions().length).toBe(0);

    await engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// Fix #4 – Network error classification
// ---------------------------------------------------------------------------
describe('Fix #4: Network vs Business Error Classification', () => {
  describe('isNetworkError()', () => {
    it('should identify ExecutionTimeoutError as network error', () => {
      expect(isNetworkError(new ExecutionTimeoutError())).toBe(true);
    });

    it('should identify NetworkError as network error', () => {
      expect(isNetworkError(new NetworkError('offline'))).toBe(true);
    });

    it('should identify AbortError as network error', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(isNetworkError(err)).toBe(true);
    });

    it('should identify fetch/network related messages as network error', () => {
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
      expect(isNetworkError(new Error('Network request failed'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND api.example.com'))).toBe(true);
      expect(isNetworkError(new Error('Request timeout'))).toBe(true);
    });

    it('should NOT classify business errors as network errors', () => {
      expect(isNetworkError(new Error('Validation failed'))).toBe(false);
      expect(isNetworkError(new Error('Unauthorized'))).toBe(false);
      expect(isNetworkError(new Error('Duplicate entry'))).toBe(false);
    });
  });

  it('should NOT consume retry quota on network errors', async () => {
    const { engine, executor } = createTestEngine();
    await engine.init();

    executor.customHandler = () => {
      throw new NetworkError('Connection lost');
    };

    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    await engine.syncNow();

    const actions = engine.getPendingActions();
    expect(actions.length).toBe(1);
    expect(actions[0]!.status).toBe('pending');
    expect(actions[0]!.retryCount).toBe(0);

    await engine.destroy();
  });

  it('should consume retry quota on business errors', async () => {
    const { engine, executor } = createTestEngine();
    await engine.init();

    executor.shouldFail = true; // Error('Sync failed') — business error

    await engine.enqueue({
      type: 'create',
      entity: 'task',
      entityId: '1',
      payload: {},
    });

    await engine.syncNow();

    const actions = engine.getPendingActions();
    expect(actions.length).toBe(1);
    expect(actions[0]!.status).toBe('failed');
    expect(actions[0]!.retryCount).toBe(1);

    await engine.destroy();
  });
});
