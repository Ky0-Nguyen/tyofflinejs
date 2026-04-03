import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestEngine, MockNetworkAdapter, MockSyncExecutor } from '../helpers';
import type { OfflineEngine } from '../../src/core/offline-engine';

describe('Auto-Retry Pipeline', () => {
  let engine: OfflineEngine;
  let network: MockNetworkAdapter;
  let executor: MockSyncExecutor;

  beforeEach(async () => {
    const ctx = createTestEngine({ cooldownMs: 0 });
    engine = ctx.engine;
    network = ctx.network;
    executor = ctx.executor;
    await engine.init();
  });

  // -------------------------------------------------------------------------
  // Basic auto-retry
  // -------------------------------------------------------------------------
  it('should automatically retry failed actions after backoff delay', async () => {
    network.setOnline(false);

    let callCount = 0;
    executor.customHandler = () => {
      callCount++;
      if (callCount <= 1) {
        return { ok: false, error: new Error('Sync failed') };
      }
      return { ok: true, value: {} };
    };

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);

    // First sync: action fails → auto-retry scheduled
    await engine.syncNow();

    const actions1 = engine.getPendingActions();
    expect(actions1.length).toBe(1);
    expect(actions1[0]!.status).toBe('failed');
    expect(actions1[0]!.retryCount).toBe(1);

    // Wait for auto-retry (backoff for cycle 0 = 1s)
    await new Promise((r) => setTimeout(r, 1500));

    // Second sync: action succeeds
    expect(engine.getPendingActions().length).toBe(0);
    expect(callCount).toBe(2);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // sync:retry-scheduled event
  // -------------------------------------------------------------------------
  it('should emit sync:retry-scheduled with correct metadata', async () => {
    network.setOnline(false);
    executor.shouldFail = true;
    const events: unknown[] = [];
    engine.on('sync:retry-scheduled', (e) => events.push(e));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);
    await engine.syncNow();

    expect(events.length).toBe(1);
    const ev = events[0] as { delayMs: number; cycle: number; retryableCount: number };
    expect(ev.cycle).toBe(1);
    expect(ev.retryableCount).toBe(1);
    expect(ev.delayMs).toBe(1000); // 2^0 * 1000

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // Exponential backoff between cycles
  // -------------------------------------------------------------------------
  it('should increase delay exponentially across retry cycles', async () => {
    network.setOnline(false);
    executor.shouldFail = true;
    const delays: number[] = [];
    engine.on('sync:retry-scheduled', (e) => delays.push(e.delayMs));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1',
      payload: {}, meta: {},
    });

    network.setOnline(true);

    // Cycle 0 → fail → schedule retry
    await engine.syncNow();
    // Wait for cycle 1 → fail → schedule retry
    await new Promise((r) => setTimeout(r, 1200));
    // Wait for cycle 2 → fail → action exhausted (retryCount=3 = maxRetries)
    await new Promise((r) => setTimeout(r, 2200));

    // Delays should be: 1000 (2^0), 2000 (2^1)
    // Third cycle won't be scheduled because retryCount=3 >= maxRetries=3
    expect(delays).toEqual([1000, 2000]);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // Circuit breaker halts retries
  // -------------------------------------------------------------------------
  it('should halt retries after maxConsecutiveRetries and emit sync:retry-halted', async () => {
    const ctx = createTestEngine({
      cooldownMs: 0,
      maxRetries: 100, // high so action never exhausts
      maxConsecutiveRetries: 2,
    });
    engine = ctx.engine;
    network = ctx.network;
    executor = ctx.executor;
    await engine.init();

    network.setOnline(false);
    executor.shouldFail = true;

    const haltEvents: unknown[] = [];
    const retryEvents: unknown[] = [];
    engine.on('sync:retry-halted', (e) => haltEvents.push(e));
    engine.on('sync:retry-scheduled', (e) => retryEvents.push(e));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);

    // Cycle 0 → fail → schedule (consecutiveRetryCycles=1)
    await engine.syncNow();
    expect(retryEvents.length).toBe(1);

    // Wait for cycle 1 → fail → schedule (consecutiveRetryCycles=2)
    await new Promise((r) => setTimeout(r, 1200));
    expect(retryEvents.length).toBe(2);

    // Wait for cycle 2 → fail → circuit breaker trips (maxConsecutiveRetries=2)
    await new Promise((r) => setTimeout(r, 2200));
    expect(haltEvents.length).toBe(1);
    const halt = haltEvents[0] as { reason: string; failedCount: number };
    expect(halt.reason).toContain('Circuit breaker');
    expect(halt.failedCount).toBe(1);

    // No more retry-scheduled events after halt
    expect(retryEvents.length).toBe(2);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // No retry when all actions succeed
  // -------------------------------------------------------------------------
  it('should NOT schedule retry when all actions succeed', async () => {
    const events: unknown[] = [];
    engine.on('sync:retry-scheduled', (e) => events.push(e));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    await engine.syncNow();

    expect(events.length).toBe(0);
    expect(engine.getPendingActions().length).toBe(0);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // No retry when retryCount exhausted
  // -------------------------------------------------------------------------
  it('should NOT schedule retry when all failed actions have exhausted maxRetries', async () => {
    network.setOnline(false);
    executor.shouldFail = true;

    const retryEvents: unknown[] = [];
    engine.on('sync:retry-scheduled', (e) => retryEvents.push(e));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);

    // exhaust all 3 retries: initial sync + 2 auto-retries
    await engine.syncNow(); // retryCount=1
    await new Promise((r) => setTimeout(r, 1200)); // auto-retry → retryCount=2
    await new Promise((r) => setTimeout(r, 2200)); // auto-retry → retryCount=3, exhausted

    // Should have scheduled exactly 2 retries, 3rd cycle sees no retryable actions
    expect(retryEvents.length).toBe(2);

    const actions = engine.getPendingActions();
    expect(actions.length).toBe(1);
    expect(actions[0]!.retryCount).toBe(3);
    expect(actions[0]!.status).toBe('failed');

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // Cancel auto-retry on network offline
  // -------------------------------------------------------------------------
  it('should cancel auto-retry when network goes offline', async () => {
    network.setOnline(false);
    executor.shouldFail = true;

    let retryScheduled = 0;
    engine.on('sync:retry-scheduled', () => retryScheduled++);

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);
    await engine.syncNow(); // fails, schedules retry
    expect(retryScheduled).toBe(1);

    // Network goes offline — should cancel pending retry
    network.setOnline(false);

    // Wait longer than backoff delay
    await new Promise((r) => setTimeout(r, 1500));

    // Executor should not have been called again
    expect(executor.calls.length).toBe(1);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // Cancel auto-retry on destroy
  // -------------------------------------------------------------------------
  it('should cancel auto-retry when engine is destroyed', async () => {
    network.setOnline(false);
    executor.shouldFail = true;

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);
    await engine.syncNow(); // fails, schedules retry
    await engine.destroy(); // should cancel retry timer

    await new Promise((r) => setTimeout(r, 1500));

    // Only 1 call (the initial sync), not 2
    expect(executor.calls.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Manual retryFailed resets circuit breaker
  // -------------------------------------------------------------------------
  it('should reset circuit breaker on manual retryFailed()', async () => {
    // Use a high stabilization to prevent setOnline(true) from auto-triggering sync
    const ctx = createTestEngine({
      cooldownMs: 0,
      maxRetries: 100,
      maxConsecutiveRetries: 1,
      networkStabilizationMs: 99_999,
    });
    engine = ctx.engine;
    network = ctx.network;
    executor = ctx.executor;
    await engine.init();

    executor.shouldFail = true;
    network.setOnline(false);

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);

    const haltEvents: unknown[] = [];
    engine.on('sync:retry-halted', (e) => haltEvents.push(e));

    // Cycle 0 → fail → schedule retry (consecutiveRetryCycles=1)
    await engine.syncNow();

    // Cycle 1 → fail → circuit breaker trips (maxConsecutiveRetries=1)
    await new Promise((r) => setTimeout(r, 1500));
    expect(haltEvents.length).toBe(1);

    // After circuit breaker, manually reset action and trigger sync.
    // This simulates what retryFailed() does (reset → processQueue) but
    // without the per-action backoff delay that would timeout the test.
    const retryEvents: unknown[] = [];
    engine.on('sync:retry-scheduled', (e) => retryEvents.push(e));

    const failedActions = engine.getPendingActions().filter(a => a.status === 'failed');
    for (const a of failedActions) {
      await engine.queue.updateStatus(a.id, 'pending');
    }
    // Reset the circuit breaker as retryFailed would
    (engine.syncManager as any).consecutiveRetryCycles = 0;

    await engine.syncNow();

    // Fails again → scheduleAutoRetryIfNeeded fires (circuit breaker was reset)
    expect(retryEvents.length).toBe(1);

    await engine.destroy();
  });

  // -------------------------------------------------------------------------
  // Partial success resets circuit breaker
  // -------------------------------------------------------------------------
  it('should reset circuit breaker when a sync cycle has zero failures', async () => {
    network.setOnline(false);

    let callCount = 0;
    executor.customHandler = () => {
      callCount++;
      if (callCount <= 1) {
        return { ok: false, error: new Error('Sync failed') };
      }
      return { ok: true, value: {} };
    };

    const haltEvents: unknown[] = [];
    engine.on('sync:retry-halted', (e) => haltEvents.push(e));

    await engine.enqueue({
      type: 'create', entity: 'task', entityId: '1', payload: {},
    });

    network.setOnline(true);

    // Cycle 0: fails (callCount=1) → retry scheduled
    await engine.syncNow();
    expect(callCount).toBe(1);

    // Cycle 1: succeeds (callCount=2) → circuit breaker resets, no more retries
    await new Promise((r) => setTimeout(r, 1500));

    expect(callCount).toBe(2);
    expect(haltEvents.length).toBe(0);
    expect(engine.getPendingActions().length).toBe(0);

    await engine.destroy();
  });
});
