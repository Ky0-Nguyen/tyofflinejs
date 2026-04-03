import type {
  ActionStatus,
  ActionType,
  IStorageAdapter,
  PendingAction,
} from './types';
import { QUEUE_STORAGE_KEY } from './types';
import { EventBus } from './event-bus';

interface EnqueueParams<T = unknown> {
  type: ActionType;
  entity: string;
  entityId: string;
  payload: T;
  maxRetries?: number;
  meta?: Record<string, unknown>;
  tempId?: string;
  dependsOn?: string[];
  parentTempId?: string;
}

export class PendingQueue {
  private items: PendingAction[] = [];
  private loaded = false;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly eventBus: EventBus,
    private readonly defaultMaxRetries: number = 3,
  ) {}

  async load(): Promise<void> {
    const stored = await this.storage.get<PendingAction[]>(QUEUE_STORAGE_KEY);
    this.items = stored ?? [];
    this.loaded = true;
    await this.recoverInterrupted();
  }

  /**
   * Recover actions stuck in 'in_progress' from a previous interrupted sync.
   * These actions never received a response — reset to 'pending' so they
   * can be retried without consuming retry quota.
   */
  async recoverInterrupted(): Promise<void> {
    let recovered = false;
    for (const item of this.items) {
      if (item.status === 'in_progress') {
        item.status = 'pending';
        recovered = true;
      }
    }
    if (recovered) {
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await this.storage.set(QUEUE_STORAGE_KEY, this.items);
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('PendingQueue not loaded. Call load() first.');
    }
  }

  async enqueue<T>(params: EnqueueParams<T>): Promise<PendingAction<T>> {
    this.ensureLoaded();

    const deduplicated = this.deduplicateBeforeEnqueue(params);
    if (deduplicated) {
      await this.persist();
      this.eventBus.emit('queue:updated', deduplicated as PendingAction);
      return deduplicated;
    }

    const action: PendingAction<T> = {
      id: this.generateId(),
      type: params.type,
      entity: params.entity,
      entityId: params.entityId,
      payload: params.payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: params.maxRetries ?? this.defaultMaxRetries,
      status: 'pending',
      meta: params.meta,
      ...(params.tempId && { tempId: params.tempId }),
      ...(params.dependsOn && { dependsOn: params.dependsOn }),
      ...(params.parentTempId && { parentTempId: params.parentTempId }),
    };

    this.items.push(action as PendingAction);
    await this.persist();
    this.eventBus.emit('queue:added', action as PendingAction);
    return action;
  }

  /**
   * Merges consecutive updates to the same entity. If the last queued action
   * targets the same entity+entityId and is still pending, we update its
   * payload instead of adding a duplicate.  A delete supersedes prior pending
   * creates/updates for the same entity.
   */
  private deduplicateBeforeEnqueue<T>(
    params: EnqueueParams<T>,
  ): PendingAction<T> | null {
    const existing = this.findLastPendingForEntity(
      params.entity,
      params.entityId,
    );
    if (!existing) return null;

    if (params.type === 'delete' && existing.type === 'create') {
      this.items = this.items.filter((i) => i.id !== existing.id);
      return null;
    }

    if (
      params.type === 'update' &&
      (existing.type === 'create' || existing.type === 'update')
    ) {
      existing.payload = params.payload;
      existing.timestamp = Date.now();
      if (params.meta) existing.meta = { ...existing.meta, ...params.meta };
      return existing as PendingAction<T>;
    }

    return null;
  }

  private findLastPendingForEntity(
    entity: string,
    entityId: string,
  ): PendingAction | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      if (
        item.entity === entity &&
        item.entityId === entityId &&
        item.status === 'pending'
      ) {
        return item;
      }
    }
    return undefined;
  }

  async updateStatus(id: string, status: ActionStatus): Promise<void> {
    this.ensureLoaded();
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.status = status;
    if (status === 'failed') item.retryCount += 1;
    await this.persist();
    this.eventBus.emit('queue:updated', item);
  }

  async remove(id: string): Promise<void> {
    this.ensureLoaded();
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
    this.eventBus.emit('queue:removed', id);
  }

  async clear(): Promise<void> {
    this.items = [];
    await this.persist();
    this.eventBus.emit('queue:cleared');
  }

  getPending(): PendingAction[] {
    this.ensureLoaded();
    return this.items.filter((i) => i.status === 'pending');
  }

  getFailed(): PendingAction[] {
    this.ensureLoaded();
    return this.items.filter((i) => i.status === 'failed');
  }

  getRetryable(): PendingAction[] {
    this.ensureLoaded();
    return this.items.filter(
      (i) =>
        (i.status === 'pending' || i.status === 'failed') &&
        i.retryCount < i.maxRetries,
    );
  }

  getAll(): PendingAction[] {
    this.ensureLoaded();
    return [...this.items];
  }

  get count(): number {
    return this.items.length;
  }

  get pendingCount(): number {
    return this.items.filter(
      (i) => i.status === 'pending' || i.status === 'in_progress',
    ).length;
  }

  /**
   * Returns items sorted by: creates first, then updates, then deletes.
   * Within each group, ordered by timestamp ascending.
   */
  getOrderedForSync(): PendingAction[] {
    this.ensureLoaded();
    const retryable = this.getRetryable();
    const ORDER: Record<ActionType, number> = { create: 0, update: 1, delete: 2 };
    return retryable.sort((a, b) => {
      const typeDiff = ORDER[a.type] - ORDER[b.type];
      return typeDiff !== 0 ? typeDiff : a.timestamp - b.timestamp;
    });
  }

  getBlocked(): PendingAction[] {
    this.ensureLoaded();
    return this.items.filter((i) => i.status === 'blocked');
  }

  getDependencyAware(): PendingAction[] {
    this.ensureLoaded();
    return this.items.filter(
      (i) =>
        (i.status === 'pending' || i.status === 'failed' || i.status === 'blocked') &&
        i.retryCount < i.maxRetries &&
        (i.dependsOn?.length || i.parentTempId || i.tempId),
    );
  }

  hasDependencyActions(): boolean {
    this.ensureLoaded();
    return this.items.some(
      (i) => i.dependsOn?.length || i.parentTempId || i.tempId,
    );
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${ts}-${rand}`;
  }
}
