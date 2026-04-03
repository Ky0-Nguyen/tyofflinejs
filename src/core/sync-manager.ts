import type {
  INetworkAdapter,
  PendingAction,
  SyncExecutor,
  SyncProgress,
  SyncStatus,
} from './types';
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  DEFAULT_MAX_CONSECUTIVE_RETRIES,
  DEFAULT_NETWORK_STABILIZATION_MS,
  ExecutionTimeoutError,
  SYNC_META_KEY,
  isNetworkError,
  type IStorageAdapter,
} from './types';
import { EventBus } from './event-bus';
import { PendingQueue } from './pending-queue';
import { ConflictResolver } from './conflict-resolver';
import type { NetworkQualifier } from './network-qualifier';

interface SyncMeta {
  lastSyncAt: number | null;
}

/**
 * Orchestrates syncing the PendingQueue to the backend.
 *
 * Key resilience features:
 * - **Stabilization window**: waits for the network to remain stable
 *   before starting a sync, preventing rapid on/off flapping from
 *   triggering wasted sync attempts.
 * - **Execution timeout**: wraps every `executor.execute()` call with
 *   a configurable timeout so a non-responsive server cannot block the
 *   sync pipeline indefinitely.
 * - **Network-error classification**: transient network failures (DNS,
 *   connectivity, timeout) do NOT consume an action's retry quota,
 *   reserving retries for genuine business/server errors.
 * - **In-progress recovery**: on init, any actions left in `in_progress`
 *   (from a crash or killed process) are reset to `pending` so they are
 *   retried automatically (handled by PendingQueue.load → recoverInterrupted).
 * - **Single-flight concurrency**: only one `doProcessQueue` runs at a
 *   time; duplicate callers await the same promise.
 * - **Auto-retry with circuit breaker**: after a sync cycle finishes
 *   with failures, automatically schedules a retry with exponential
 *   backoff. A circuit breaker (`maxConsecutiveRetries`) halts
 *   retries to prevent infinite loops.
 *
 * Anti-infinite-loop safeguards (6 layers):
 *   1. `maxRetries` per action — hard cap (default 3)
 *   2. `retryCount++` on each business error — quota consumed
 *   3. `consecutiveRetryCycles` circuit breaker — max cycles (default 5)
 *   4. Exponential backoff between retry cycles (1s → 2s → 4s → 8s → 16s)
 *   5. Network readiness check before each cycle
 *   6. All timers cancelled on network offline / engine destroy
 */
export class SyncManager {
  private status: SyncStatus = 'idle';
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastSyncAt: number | null = null;
  private cooldownMs: number;
  private activeSyncPromise: Promise<void> | null = null;
  private networkQualifier: NetworkQualifier | null = null;

  private readonly stabilizationMs: number;
  private readonly executionTimeoutMs: number;
  private readonly maxConsecutiveRetries: number;
  private readonly retryBackoff: 'linear' | 'exponential';
  private stabilizationTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveRetryCycles = 0;

  constructor(
    private readonly queue: PendingQueue,
    private readonly executor: SyncExecutor,
    private readonly network: INetworkAdapter,
    private readonly storage: IStorageAdapter,
    private readonly eventBus: EventBus,
    private readonly conflictResolver: ConflictResolver,
    private readonly onSyncError?: (error: Error, action: PendingAction) => void,
    cooldownMs?: number,
    stabilizationMs?: number,
    executionTimeoutMs?: number,
    maxConsecutiveRetries?: number,
    retryBackoff?: 'linear' | 'exponential',
  ) {
    this.cooldownMs = cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.stabilizationMs = stabilizationMs ?? DEFAULT_NETWORK_STABILIZATION_MS;
    this.executionTimeoutMs = executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    this.maxConsecutiveRetries = maxConsecutiveRetries ?? DEFAULT_MAX_CONSECUTIVE_RETRIES;
    this.retryBackoff = retryBackoff ?? 'exponential';
  }

  setNetworkQualifier(qualifier: NetworkQualifier): void {
    this.networkQualifier = qualifier;
  }

  async init(): Promise<void> {
    const meta = await this.storage.get<SyncMeta>(SYNC_META_KEY);
    if (meta) {
      this.lastSyncAt = meta.lastSyncAt;
    }
  }

  /**
   * Schedule a sync after the stabilization window.
   * Repeated calls within the window reset the timer — this is intentional
   * so that rapid ON/OFF/ON toggles wait until the network is truly stable.
   */
  scheduleStabilizedSync(): void {
    if (this.stabilizationTimer) clearTimeout(this.stabilizationTimer);
    this.stabilizationTimer = setTimeout(() => {
      this.stabilizationTimer = null;
      void this.processQueue();
    }, this.stabilizationMs);
  }

  /** Cancel any pending stabilization timer (e.g. when network goes offline). */
  cancelStabilizedSync(): void {
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }
  }

  /** Cancel any pending auto-retry timer (e.g. when network goes offline). */
  cancelAutoRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async processQueue(): Promise<void> {
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }
    this.activeSyncPromise = this.doProcessQueue();
    try {
      await this.activeSyncPromise;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  private async doProcessQueue(): Promise<void> {
    if (this.lastSyncAt && Date.now() - this.lastSyncAt < this.cooldownMs) {
      return;
    }

    const canProceed = await this.checkSyncReadiness();
    if (!canProceed) {
      this.setStatus('paused');
      return;
    }

    const items = this.queue.getOrderedForSync();
    if (items.length === 0) return;

    this.setStatus('syncing');
    this.eventBus.emit('sync:start');

    const progress: SyncProgress = {
      status: 'syncing',
      total: items.length,
      completed: 0,
      failed: 0,
      lastSyncAt: this.lastSyncAt,
    };
    this.eventBus.emit('sync:progress', { ...progress });

    for (const action of items) {
      const stillReady = await this.checkSyncReadiness(true);
      if (!stillReady) {
        await this.resetInProgress(action);
        this.setStatus('paused');
        progress.status = 'paused';
        this.eventBus.emit('sync:progress', { ...progress });
        return;
      }

      await this.queue.updateStatus(action.id, 'in_progress');

      try {
        const result = await this.executeWithTimeout(action);

        if (result.ok) {
          await this.queue.remove(action.id);
          progress.completed += 1;
        } else {
          await this.handleFailure(action, result.error, progress);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await this.handleFailure(action, error, progress);
      }

      this.eventBus.emit('sync:progress', { ...progress });
    }

    this.lastSyncAt = Date.now();
    progress.lastSyncAt = this.lastSyncAt;
    await this.storage.set<SyncMeta>(SYNC_META_KEY, {
      lastSyncAt: this.lastSyncAt,
    });

    const finalStatus: SyncStatus = progress.failed > 0 ? 'error' : 'idle';
    this.setStatus(finalStatus);
    progress.status = finalStatus;
    this.eventBus.emit('sync:complete', { ...progress });

    this.scheduleAutoRetryIfNeeded(progress);
  }

  /**
   * After a sync cycle completes, check whether failed actions remain
   * that are still retryable. If so, schedule a retry with backoff.
   *
   * Anti-loop safeguards:
   * - Circuit breaker: `consecutiveRetryCycles` caps total retry rounds.
   *   Resets to 0 when a cycle has zero failures.
   * - Exponential backoff: delay doubles each cycle (1s, 2s, 4s, 8s, 16s).
   * - `maxRetries` on each action: retryCount increments on business errors.
   *   Once exhausted, the action drops out of `getRetryable()`.
   * - Network readiness: checked at the start of `doProcessQueue()`.
   */
  private scheduleAutoRetryIfNeeded(progress: SyncProgress): void {
    if (progress.failed === 0) {
      this.consecutiveRetryCycles = 0;
      return;
    }

    const retryable = this.queue.getFailed().filter(
      (a) => a.retryCount < a.maxRetries,
    );

    if (retryable.length === 0) {
      this.consecutiveRetryCycles = 0;
      return;
    }

    if (this.consecutiveRetryCycles >= this.maxConsecutiveRetries) {
      this.consecutiveRetryCycles = 0;
      this.eventBus.emit('sync:retry-halted', {
        reason: `Circuit breaker: ${this.maxConsecutiveRetries} consecutive retry cycles exhausted`,
        failedCount: retryable.length,
      });
      return;
    }

    const delay = this.computeBackoffDelay(this.consecutiveRetryCycles, this.retryBackoff);
    this.consecutiveRetryCycles += 1;

    this.cancelAutoRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processQueue();
    }, delay);

    this.eventBus.emit('sync:retry-scheduled', {
      delayMs: delay,
      cycle: this.consecutiveRetryCycles,
      retryableCount: retryable.length,
    });
  }

  /**
   * Wrap executor.execute() with a timeout.
   * If the server doesn't respond within `executionTimeoutMs`, the
   * promise rejects with an ExecutionTimeoutError — which is classified
   * as a network error so it won't consume retry quota.
   */
  private executeWithTimeout(
    action: PendingAction,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: Error }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ExecutionTimeoutError(action, this.executionTimeoutMs));
      }, this.executionTimeoutMs);

      this.executor
        .execute(action)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Central failure handler.
   * - Conflict (HTTP 409) → delegate to ConflictResolver.
   * - Network / timeout error → revert to 'pending' WITHOUT incrementing
   *   retryCount, preserving retry quota for real failures.
   * - Business error → mark 'failed', increment retryCount normally.
   */
  private async handleFailure(
    action: PendingAction,
    error: Error,
    progress: SyncProgress,
  ): Promise<void> {
    const isConflict = this.isConflictError(error);

    if (isConflict) {
      const resolved = this.conflictResolver.resolve({
        local: action,
        remote: (error as Error & { remote?: unknown }).remote,
        entity: action.entity,
        entityId: action.entityId,
      });
      this.eventBus.emit('sync:conflict', {
        local: action,
        remote: (error as Error & { remote?: unknown }).remote,
        entity: action.entity,
        entityId: action.entityId,
      });
      if (resolved) {
        await this.queue.updateStatus(action.id, 'pending');
      } else {
        await this.queue.remove(action.id);
        progress.completed += 1;
      }
      return;
    }

    if (isNetworkError(error)) {
      await this.revertToPending(action);
      this.eventBus.emit('sync:error', { error, action });
      return;
    }

    await this.queue.updateStatus(action.id, 'failed');
    progress.failed += 1;
    this.onSyncError?.(error, action);
    this.eventBus.emit('sync:error', { error, action });
  }

  /**
   * Revert an action to 'pending' without touching retryCount.
   * Used when the failure is a transient network issue.
   */
  private async revertToPending(action: PendingAction): Promise<void> {
    const items = this.queue.getAll();
    const item = items.find((i) => i.id === action.id);
    if (item) {
      item.status = 'pending';
    }
    await this.queue.updateStatus(action.id, 'pending');
  }

  /**
   * Reset an action back to pending when sync pauses mid-flight.
   * Prevents the action from staying forever in 'in_progress'.
   */
  private async resetInProgress(action: PendingAction): Promise<void> {
    if (action.status === 'in_progress') {
      await this.queue.updateStatus(action.id, 'pending');
    }
  }

  startAutoSync(intervalMs: number): void {
    this.stopAutoSync();
    this.intervalId = setInterval(() => {
      void this.processQueue();
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getProgress(): SyncProgress {
    return {
      status: this.status,
      total: this.queue.count,
      completed: 0,
      failed: this.queue.getFailed().length,
      lastSyncAt: this.lastSyncAt,
    };
  }

  getLastSyncAt(): number | null {
    return this.lastSyncAt;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
  }

  private async checkSyncReadiness(forceRefresh = false): Promise<boolean> {
    if (this.networkQualifier) {
      const readiness = await this.networkQualifier.evaluate(forceRefresh);
      return readiness.canSync;
    }
    return this.network.isOnline();
  }

  private isConflictError(error: Error): boolean {
    return (
      'statusCode' in error &&
      ((error as Error & { statusCode?: number }).statusCode === 409)
    );
  }

  private computeBackoffDelay(
    retryCount: number,
    strategy: 'linear' | 'exponential' = 'exponential',
  ): number {
    const BASE_DELAY = 1000;
    if (strategy === 'linear') return BASE_DELAY * (retryCount + 1);
    return BASE_DELAY * Math.pow(2, retryCount);
  }

  /**
   * Manual retry trigger.
   * Resets failed actions to 'pending' (with per-action backoff delay),
   * then calls `processQueue()`. Also resets the circuit breaker so
   * manual intervention can restart the auto-retry pipeline.
   */
  async retryFailed(): Promise<void> {
    const failed = this.queue.getFailed().filter(
      (a) => a.retryCount < a.maxRetries,
    );
    for (const action of failed) {
      const delay = this.computeBackoffDelay(action.retryCount);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      await this.queue.updateStatus(action.id, 'pending');
    }
    if (failed.length > 0) {
      this.consecutiveRetryCycles = 0;
      await this.processQueue();
    }
  }

  destroy(): void {
    this.stopAutoSync();
    this.cancelStabilizedSync();
    this.cancelAutoRetry();
  }
}
