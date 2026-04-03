import type {
  ActionType,
  INetworkAdapter,
  IStorageAdapter,
  OfflineConfig,
  OfflineEvents,
  PendingAction,
  SyncProgress,
  SyncStatus,
} from './types';
import { DEFAULT_MAX_RETRIES, DEFAULT_SYNC_INTERVAL } from './types';
import { EventBus } from './event-bus';
import { PendingQueue } from './pending-queue';
import { SyncManager } from './sync-manager';
import { ConflictResolver } from './conflict-resolver';
import { ExecutionEngine } from './dag/execution-engine';
import { NetworkQualifier } from './network-qualifier';
import type { SyncReadiness } from './network-types';

/**
 * Top-level orchestrator for all offline operations.
 *
 * Wires together PendingQueue, SyncManager, ExecutionEngine (DAG),
 * NetworkQualifier, and ConflictResolver. Consumers interact almost
 * exclusively through this class (or the React hooks that wrap it).
 *
 * Network resilience lifecycle:
 *   1. Network comes online → stabilization timer starts (debounce).
 *   2. If the network stays online for `networkStabilizationMs`, sync triggers.
 *   3. If it drops before the window elapses, the timer is cancelled.
 *   4. During sync, each action is guarded by a per-action readiness check.
 *   5. `executor.execute()` has a timeout; non-responsive servers don't block.
 *   6. Transient network errors don't consume retry quota.
 *   7. On restart, actions left `in_progress` are recovered to `pending`.
 *   8. After a sync with failures, auto-retry schedules with exponential backoff.
 *   9. Circuit breaker halts retries after `maxConsecutiveRetries` cycles.
 */
export class OfflineEngine {
  readonly eventBus: EventBus;
  readonly queue: PendingQueue;
  readonly syncManager: SyncManager;
  readonly conflictResolver: ConflictResolver;
  readonly executionEngine: ExecutionEngine;
  readonly networkQualifier: NetworkQualifier;

  private readonly storage: IStorageAdapter;
  private readonly network: INetworkAdapter;
  private networkUnsubscribe: (() => void) | null = null;
  private ready = false;
  private destroyed = false;

  constructor(private readonly config: OfflineConfig) {
    this.storage = config.storage;
    this.network = config.network;
    this.eventBus = new EventBus();

    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    this.conflictResolver = new ConflictResolver(
      config.conflictStrategy ?? 'last-write-wins',
      config.onConflict,
    );

    this.queue = new PendingQueue(this.storage, this.eventBus, maxRetries);

    this.networkQualifier = new NetworkQualifier(this.network, this.eventBus, {
      pingUrl: config.pingUrl,
      pingTimeoutMs: config.pingTimeoutMs,
      syncConditions: config.syncConditions,
    });

    this.syncManager = new SyncManager(
      this.queue,
      config.syncExecutor,
      this.network,
      this.storage,
      this.eventBus,
      this.conflictResolver,
      config.onSyncError,
      config.cooldownMs,
      config.networkStabilizationMs,
      config.executionTimeoutMs,
      config.maxConsecutiveRetries,
      config.retryBackoff,
    );
    this.syncManager.setNetworkQualifier(this.networkQualifier);

    this.executionEngine = new ExecutionEngine(
      this.queue,
      config.syncExecutor,
      this.eventBus,
      this.storage,
    );
  }

  async init(): Promise<void> {
    if (this.ready) return;

    // PendingQueue.load() also recovers any in_progress → pending (Fix #2)
    await this.queue.load();
    await this.syncManager.init();
    await this.executionEngine.init();

    this.networkUnsubscribe = this.network.subscribe((online) => {
      if (online) {
        this.eventBus.emit('network:online');
        // Fix #1: use stabilization window instead of immediate sync
        this.syncManager.scheduleStabilizedSync();
      } else {
        this.eventBus.emit('network:offline');
        // Cancel pending stabilization and auto-retry — network is not stable
        this.syncManager.cancelStabilizedSync();
        this.syncManager.cancelAutoRetry();
      }
    });

    const syncInterval = this.config.syncInterval ?? DEFAULT_SYNC_INTERVAL;
    if (syncInterval > 0) {
      this.syncManager.startAutoSync(syncInterval);
    }

    this.ready = true;
    this.eventBus.emit('engine:ready');

    const online = await this.network.isOnline();
    if (online && this.queue.pendingCount > 0) {
      void this.syncManager.processQueue();
    }
  }

  async enqueue<T>(params: {
    type: ActionType;
    entity: string;
    entityId: string;
    payload: T;
    meta?: Record<string, unknown>;
  }): Promise<PendingAction<T>> {
    this.ensureReady();
    const action = await this.queue.enqueue(params);

    const online = await this.network.isOnline();
    if (online) {
      void this.syncManager.processQueue();
    }

    return action;
  }

  async enqueueWithDeps<T>(params: {
    type: ActionType;
    entity: string;
    entityId: string;
    payload: T;
    tempId?: string;
    dependsOn?: string[];
    parentTempId?: string;
    meta?: Record<string, unknown>;
  }): Promise<PendingAction<T>> {
    this.ensureReady();
    return this.queue.enqueue(params);
  }

  async syncWithDeps(): Promise<void> {
    this.ensureReady();
    const online = await this.network.isOnline();
    if (!online) return;

    const actions = this.queue.getRetryable();
    if (actions.length === 0) return;

    if (this.queue.hasDependencyActions()) {
      this.eventBus.emit('sync:start');
      await this.executionEngine.executeQueue(actions);
      this.eventBus.emit('sync:complete', this.syncManager.getProgress());
    } else {
      await this.syncManager.processQueue();
    }
  }

  async getData<T>(key: string): Promise<T | null> {
    return this.storage.get<T>(key);
  }

  async setData<T>(key: string, value: T): Promise<void> {
    await this.storage.set(key, value);
  }

  async removeData(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async syncNow(): Promise<void> {
    this.ensureReady();
    await this.syncManager.processQueue();
  }

  async retryFailed(): Promise<void> {
    this.ensureReady();
    await this.syncManager.retryFailed();
  }

  async isOnline(): Promise<boolean> {
    return this.network.isOnline();
  }

  async checkSyncReadiness(): Promise<SyncReadiness> {
    return this.networkQualifier.evaluate();
  }

  async canSync(): Promise<boolean> {
    const readiness = await this.networkQualifier.evaluate();
    return readiness.canSync;
  }

  getSyncStatus(): SyncStatus {
    return this.syncManager.getStatus();
  }

  getSyncProgress(): SyncProgress {
    return this.syncManager.getProgress();
  }

  getPendingActions(): PendingAction[] {
    return this.queue.getAll();
  }

  on<K extends keyof OfflineEvents>(
    event: K,
    callback: OfflineEvents[K] extends undefined
      ? () => void
      : (payload: OfflineEvents[K]) => void,
  ): () => void {
    return this.eventBus.on(event, callback);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ready = false;

    this.syncManager.destroy();
    this.networkUnsubscribe?.();
    this.networkUnsubscribe = null;
    this.eventBus.emit('engine:destroyed');
    this.eventBus.removeAllListeners();
  }

  isReady(): boolean {
    return this.ready;
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('OfflineEngine not initialized. Call init() first.');
    }
    if (this.destroyed) {
      throw new Error('OfflineEngine has been destroyed.');
    }
  }
}
