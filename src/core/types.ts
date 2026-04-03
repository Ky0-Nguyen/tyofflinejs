// ─── Result Type ──────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ─── Storage Adapter ─────────────────────────────────────────────────────────

export interface IStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
  multiGet<T>(keys: string[]): Promise<Map<string, T>>;
  clear(): Promise<void>;
}

// ─── Network Adapter ─────────────────────────────────────────────────────────

export interface INetworkAdapter {
  isOnline(): Promise<boolean>;
  subscribe(callback: (online: boolean) => void): () => void;
  getNetworkStatus?(): Promise<import('./network-types').NetworkStatus>;
  ping?(url: string, timeoutMs?: number): Promise<{ reachable: boolean; latencyMs: number }>;
}

// ─── Pending Actions ─────────────────────────────────────────────────────────

export type ActionType = 'create' | 'update' | 'delete';
export type ActionStatus = 'pending' | 'in_progress' | 'failed' | 'completed' | 'blocked';

export interface PendingAction<T = unknown> {
  id: string;
  type: ActionType;
  entity: string;
  entityId: string;
  payload: T;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  status: ActionStatus;
  meta?: Record<string, unknown>;
  tempId?: string;
  dependsOn?: string[];
  parentTempId?: string;
  resolvedIds?: Record<string, string>;
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'paused' | 'error';

export interface SyncProgress {
  status: SyncStatus;
  total: number;
  completed: number;
  failed: number;
  lastSyncAt: number | null;
}

export interface SyncExecutor {
  execute<T>(action: PendingAction<T>): Promise<Result<unknown>>;
}

// ─── Conflict Resolution ─────────────────────────────────────────────────────

export type ConflictStrategy =
  | 'client-wins'
  | 'server-wins'
  | 'last-write-wins'
  | 'merge'
  | 'manual';

export interface ConflictContext<T = unknown> {
  local: PendingAction<T>;
  remote: unknown;
  entity: string;
  entityId: string;
}

export type ConflictHandler<T = unknown> = (
  context: ConflictContext<T>,
) => PendingAction<T> | null;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface OfflineConfig {
  storage: IStorageAdapter;
  network: INetworkAdapter;
  syncExecutor: SyncExecutor;
  syncInterval?: number;
  maxRetries?: number;
  retryBackoff?: 'linear' | 'exponential';
  conflictStrategy?: ConflictStrategy;
  onConflict?: ConflictHandler;
  onSyncError?: (error: Error, action: PendingAction) => void;
  cooldownMs?: number;
  pingUrl?: string;
  pingTimeoutMs?: number;
  syncConditions?: import('./network-types').SyncConditions;
  /** Wait for network to remain stable before syncing (ms). Prevents flapping. Default: 3000 */
  networkStabilizationMs?: number;
  /** Max time to wait for executor.execute() before aborting (ms). Default: 30000 */
  executionTimeoutMs?: number;
  /** Max consecutive auto-retry cycles before halting. Prevents infinite loops. Default: 5 */
  maxConsecutiveRetries?: number;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface OfflineEvents {
  'network:online': undefined;
  'network:offline': undefined;
  'network:readiness-changed': import('./network-types').SyncReadiness;
  'queue:added': PendingAction;
  'queue:updated': PendingAction;
  'queue:removed': string;
  'queue:cleared': undefined;
  'sync:start': undefined;
  'sync:progress': SyncProgress;
  'sync:complete': SyncProgress;
  'sync:error': { error: Error; action?: PendingAction };
  'sync:retry-scheduled': { delayMs: number; cycle: number; retryableCount: number };
  'sync:retry-halted': { reason: string; failedCount: number };
  'sync:conflict': ConflictContext;
  'dag:plan-created': { layers: number; total: number; optimizations: { merged: number; skipped: number } };
  'dag:layer-start': { depth: number; count: number };
  'dag:layer-complete': { depth: number; completed: number; failed: number };
  'dag:action-blocked': PendingAction;
  'dag:tempid-resolved': { tempId: string; serverId: string };
  'engine:ready': undefined;
  'engine:destroyed': undefined;
}

// ─── Error Classes ───────────────────────────────────────────────────────────

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

export class SyncError extends Error {
  public readonly action?: PendingAction;
  constructor(message: string, action?: PendingAction, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SyncError';
    this.action = action;
  }
}

export class ExecutionTimeoutError extends Error {
  public readonly action?: PendingAction;
  constructor(action?: PendingAction, timeoutMs?: number) {
    super(`Execution timed out after ${timeoutMs ?? '?'}ms`);
    this.name = 'ExecutionTimeoutError';
    this.action = action;
  }
}

/**
 * Determine whether an error is caused by a network problem
 * (lost connectivity, DNS failure, timeout) vs a business/server error.
 * Network errors should NOT consume retry quota.
 */
export function isNetworkError(error: Error): boolean {
  if (error instanceof ExecutionTimeoutError) return true;
  if (error instanceof NetworkError) return true;
  if (error.name === 'AbortError') return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_SYNC_INTERVAL = 30_000;
export const DEFAULT_COOLDOWN_MS = 5_000;
export const DEFAULT_NETWORK_STABILIZATION_MS = 3_000;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_CONSECUTIVE_RETRIES = 5;
export const QUEUE_STORAGE_KEY = '__offline_queue__';
export const SYNC_META_KEY = '__offline_sync_meta__';
export const DAG_TEMPID_MAP_KEY = '__offline_dag_tempids__';
