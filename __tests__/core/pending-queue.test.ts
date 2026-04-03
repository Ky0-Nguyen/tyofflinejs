import { describe, it, expect, beforeEach } from 'vitest';
import { PendingQueue } from '../../src/core/pending-queue';
import { EventBus } from '../../src/core/event-bus';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';

describe('PendingQueue', () => {
  let queue: PendingQueue;
  let storage: MemoryAdapter;
  let eventBus: EventBus;

  beforeEach(async () => {
    storage = new MemoryAdapter();
    eventBus = new EventBus();
    queue = new PendingQueue(storage, eventBus, 3);
    await queue.load();
  });

  it('should enqueue an action', async () => {
    const action = await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });

    expect(action.type).toBe('create');
    expect(action.entity).toBe('task');
    expect(action.status).toBe('pending');
    expect(action.retryCount).toBe(0);
    expect(queue.count).toBe(1);
  });

  it('should persist queue to storage', async () => {
    await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });

    const queue2 = new PendingQueue(storage, eventBus, 3);
    await queue2.load();

    expect(queue2.count).toBe(1);
    expect(queue2.getAll()[0]!.entity).toBe('task');
  });

  it('should deduplicate updates to the same entity', async () => {
    await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'V1' },
    });
    await queue.enqueue({
      type: 'update',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'V2' },
    });

    expect(queue.count).toBe(1);
    expect(queue.getAll()[0]!.payload).toEqual({ title: 'V2' });
  });

  it('should remove create when delete follows for same entity', async () => {
    await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: { title: 'Test' },
    });
    await queue.enqueue({
      type: 'delete',
      entity: 'task',
      entityId: 'task-1',
      payload: null,
    });

    expect(queue.count).toBe(1);
    expect(queue.getAll()[0]!.type).toBe('delete');
  });

  it('should order items for sync: creates -> updates -> deletes', async () => {
    await queue.enqueue({ type: 'delete', entity: 'a', entityId: '1', payload: null });
    await queue.enqueue({ type: 'update', entity: 'b', entityId: '2', payload: {} });
    await queue.enqueue({ type: 'create', entity: 'c', entityId: '3', payload: {} });

    const ordered = queue.getOrderedForSync();
    expect(ordered.map((a) => a.type)).toEqual(['create', 'update', 'delete']);
  });

  it('should update action status', async () => {
    const action = await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: {},
    });

    await queue.updateStatus(action.id, 'in_progress');
    expect(queue.getAll()[0]!.status).toBe('in_progress');

    await queue.updateStatus(action.id, 'failed');
    expect(queue.getAll()[0]!.status).toBe('failed');
    expect(queue.getAll()[0]!.retryCount).toBe(1);
  });

  it('should remove an action', async () => {
    const action = await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: {},
    });
    await queue.remove(action.id);

    expect(queue.count).toBe(0);
  });

  it('should clear the queue', async () => {
    await queue.enqueue({ type: 'create', entity: 'a', entityId: '1', payload: {} });
    await queue.enqueue({ type: 'create', entity: 'b', entityId: '2', payload: {} });

    await queue.clear();
    expect(queue.count).toBe(0);
  });

  it('should return retryable actions', async () => {
    const action = await queue.enqueue({
      type: 'create',
      entity: 'task',
      entityId: 'task-1',
      payload: {},
    });

    await queue.updateStatus(action.id, 'failed');
    expect(queue.getRetryable().length).toBe(1);

    await queue.updateStatus(action.id, 'failed');
    await queue.updateStatus(action.id, 'failed');
    expect(queue.getRetryable().length).toBe(0);
  });

  it('should throw if not loaded', () => {
    const freshQueue = new PendingQueue(storage, eventBus, 3);
    expect(() => freshQueue.getPending()).toThrow('not loaded');
  });
});
