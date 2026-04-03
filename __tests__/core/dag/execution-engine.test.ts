import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionEngine } from '../../../src/core/dag/execution-engine';
import { EventBus } from '../../../src/core/event-bus';
import { PendingQueue } from '../../../src/core/pending-queue';
import { MemoryAdapter } from '../../../src/adapters/storage/memory.adapter';
import type { PendingAction, SyncExecutor, Result } from '../../../src/core/types';

function createTestSetup(executeFn?: (action: PendingAction) => Promise<Result<unknown>>) {
  const storage = new MemoryAdapter();
  const eventBus = new EventBus();
  const queue = new PendingQueue(storage, eventBus, 3);

  const executor: SyncExecutor = {
    execute: executeFn ?? (async () => ({ ok: true, value: { id: 'srv-default' } })),
  };

  const engine = new ExecutionEngine(queue, executor, eventBus, storage);

  return { storage, eventBus, queue, executor, engine };
}

describe('ExecutionEngine', () => {
  let storage: MemoryAdapter;
  let queue: PendingQueue;
  let engine: ExecutionEngine;
  let eventBus: EventBus;
  let serverIdCounter: number;

  beforeEach(async () => {
    serverIdCounter = 0;
    const setup = createTestSetup(async (action: PendingAction) => {
      if (action.type === 'create') {
        serverIdCounter += 1;
        return { ok: true, value: { id: `srv-${serverIdCounter}` } };
      }
      return { ok: true, value: {} };
    });
    storage = setup.storage;
    queue = setup.queue;
    engine = setup.engine;
    eventBus = setup.eventBus;

    await queue.load();
    await engine.init();
  });

  it('returns empty result for empty queue', async () => {
    const result = await engine.executeQueue([]);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.blocked).toBe(0);
  });

  it('executes independent actions in a single layer', async () => {
    const a1 = await queue.enqueue({ type: 'create', entity: 'Item', entityId: 'e1', payload: {} });
    const a2 = await queue.enqueue({ type: 'create', entity: 'Item', entityId: 'e2', payload: {} });
    const result = await engine.executeQueue([a1, a2]);

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('executes Item -> SubItem -> SubSubItem chain in correct order', async () => {
    const executionOrder: string[] = [];
    const setup = createTestSetup(async (action: PendingAction) => {
      executionOrder.push(action.id);
      if (action.type === 'create' && action.tempId) {
        return { ok: true, value: { id: `srv-${action.tempId}` } };
      }
      return { ok: true, value: {} };
    });
    await setup.queue.load();
    await setup.engine.init();

    const item = await setup.queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item',
      payload: { name: 'Item 1' },
      tempId: 'tmp-item',
    });

    const subItem = await setup.queue.enqueue({
      type: 'create',
      entity: 'SubItem',
      entityId: 'tmp-sub',
      payload: { itemId: 'tmp-item', name: 'Sub 1' },
      tempId: 'tmp-sub',
      parentTempId: 'tmp-item',
    });

    const subSubItem = await setup.queue.enqueue({
      type: 'create',
      entity: 'SubSubItem',
      entityId: 'tmp-subsub',
      payload: { subItemId: 'tmp-sub', name: 'SubSub 1' },
      tempId: 'tmp-subsub',
      parentTempId: 'tmp-sub',
    });

    const result = await setup.engine.executeQueue([item, subItem, subSubItem]);

    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);

    const itemIdx = executionOrder.indexOf(item.id);
    const subIdx = executionOrder.indexOf(subItem.id);
    const subSubIdx = executionOrder.indexOf(subSubItem.id);
    expect(itemIdx).toBeLessThan(subIdx);
    expect(subIdx).toBeLessThan(subSubIdx);
  });

  it('resolves temp IDs in child payloads', async () => {
    const capturedPayloads: unknown[] = [];
    const setup = createTestSetup(async (action: PendingAction) => {
      capturedPayloads.push(structuredClone(action.payload));
      if (action.type === 'create' && action.tempId) {
        return { ok: true, value: { id: `srv-for-${action.tempId}` } };
      }
      return { ok: true, value: {} };
    });
    await setup.queue.load();
    await setup.engine.init();

    const item = await setup.queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item-1',
      payload: { name: 'Item' },
      tempId: 'tmp-item-1',
    });

    const sub = await setup.queue.enqueue({
      type: 'create',
      entity: 'SubItem',
      entityId: 'tmp-sub-1',
      payload: { itemId: 'tmp-item-1', title: 'Sub' },
      tempId: 'tmp-sub-1',
      parentTempId: 'tmp-item-1',
    });

    await setup.engine.executeQueue([item, sub]);

    const subPayload = capturedPayloads[1] as Record<string, string>;
    expect(subPayload['itemId']).toBe('srv-for-tmp-item-1');
  });

  it('pauses descendants when parent fails', async () => {
    const setup = createTestSetup(async (action: PendingAction) => {
      if (action.entity === 'Item') {
        return { ok: false, error: new Error('Network error') };
      }
      return { ok: true, value: { id: 'srv-1' } };
    });
    await setup.queue.load();
    await setup.engine.init();

    const item = await setup.queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item',
      payload: {},
      tempId: 'tmp-item',
    });

    const sub = await setup.queue.enqueue({
      type: 'create',
      entity: 'SubItem',
      entityId: 'tmp-sub',
      payload: { itemId: 'tmp-item' },
      parentTempId: 'tmp-item',
    });

    const result = await setup.engine.executeQueue([item, sub]);

    expect(result.failed).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.completed).toBe(0);
  });

  it('emits dag:plan-created event', async () => {
    const spy = vi.fn();
    eventBus.on('dag:plan-created', spy);

    const a1 = await queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'e1',
      payload: {},
      tempId: 'tmp-1',
    });
    const a2 = await queue.enqueue({
      type: 'create',
      entity: 'SubItem',
      entityId: 'e2',
      payload: {},
      parentTempId: 'tmp-1',
    });

    await engine.executeQueue([a1, a2]);

    expect(spy).toHaveBeenCalledOnce();
    const payload = spy.mock.calls[0]![0];
    expect(payload.layers).toBe(2);
  });

  it('emits dag:tempid-resolved event', async () => {
    const spy = vi.fn();
    eventBus.on('dag:tempid-resolved', spy);

    const a1 = await queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-1',
      payload: {},
      tempId: 'tmp-1',
    });

    await engine.executeQueue([a1]);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].tempId).toBe('tmp-1');
    expect(spy.mock.calls[0]![0].serverId).toBe('srv-1');
  });

  it('buildPlan applies optimizations (collapse create+update)', () => {
    const a1: PendingAction = {
      id: 'opt-a1',
      type: 'create',
      entity: 'Item',
      entityId: 'e1',
      payload: { title: 'Original' },
      tempId: 'tmp-1',
      timestamp: 100,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
    };
    const a2: PendingAction = {
      id: 'opt-a2',
      type: 'update',
      entity: 'Item',
      entityId: 'e1',
      payload: { title: 'Updated' },
      dependsOn: ['opt-a1'],
      timestamp: 200,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
    };

    const plan = engine.buildPlan([a1, a2]);

    expect(plan.optimizations.merged).toBe(1);
    expect(plan.layers.length).toBe(1);
    const payload = plan.layers[0]!.actions[0]!.payload as Record<string, string>;
    expect(payload['title']).toBe('Updated');
  });

  it('returns tempIdMappings in result', async () => {
    const a1 = await queue.enqueue({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item',
      payload: {},
      tempId: 'tmp-item',
    });

    const result = await engine.executeQueue([a1]);

    expect(result.tempIdMappings.get('tmp-item')).toBe('srv-1');
  });
});
