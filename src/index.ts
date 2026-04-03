// ─── Core ────────────────────────────────────────────────────────────────────
export { OfflineEngine } from './core/offline-engine';
export { EventBus } from './core/event-bus';
export { PendingQueue } from './core/pending-queue';
export { SyncManager } from './core/sync-manager';
export { ConflictResolver } from './core/conflict-resolver';
export { NetworkQualifier } from './core/network-qualifier';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  IStorageAdapter,
  INetworkAdapter,
  PendingAction,
  ActionType,
  ActionStatus,
  SyncStatus,
  SyncProgress,
  SyncExecutor,
  ConflictStrategy,
  ConflictContext,
  ConflictHandler,
  OfflineConfig,
  OfflineEvents,
  Result,
} from './core/types';

export {
  StorageError,
  NetworkError,
  SyncError,
  ExecutionTimeoutError,
  isNetworkError,
  DEFAULT_MAX_RETRIES,
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_NETWORK_STABILIZATION_MS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  DEFAULT_MAX_CONSECUTIVE_RETRIES,
  QUEUE_STORAGE_KEY,
  SYNC_META_KEY,
  DAG_TEMPID_MAP_KEY,
} from './core/types';

// ─── Network Types ───────────────────────────────────────────────────────────
export type {
  NetworkStatus,
  SyncReadiness,
  SyncConditions,
  ConnectionType,
  EffectiveConnectionType,
  NetworkQualifierConfig,
} from './core/network-types';
export {
  DEFAULT_PING_TIMEOUT_MS,
  DEFAULT_REACHABILITY_CACHE_MS,
} from './core/network-types';

// ─── DAG Execution Engine ────────────────────────────────────────────────────
export {
  DependencyGraph,
  TopologicalSorter,
  TempIdResolver,
  ActionOptimizer,
  ExecutionEngine,
  CycleDetectedError,
  DependencyError,
} from './core/dag';
export type {
  ActionNode,
  ExecutionLayer,
  ExecutionPlan,
  ExecutionResult,
  OptimizationResult,
  TempIdMap,
} from './core/dag';

// ─── React ───────────────────────────────────────────────────────────────────
export { OfflineProvider, useEngine } from './react/offline-provider';
export type { OfflineProviderProps } from './react/offline-provider';

export { useOfflineStatus } from './react/use-offline-status';
export type { OfflineStatus } from './react/use-offline-status';

export { useOfflineQuery } from './react/use-offline-query';
export type { OfflineQueryResult } from './react/use-offline-query';

export { useOfflineMutation } from './react/use-offline-mutation';
export type { MutationOptions, OfflineMutationResult } from './react/use-offline-mutation';

export { useSyncStatus } from './react/use-sync-status';

export { usePendingQueue } from './react/use-pending-queue';
export type { PendingQueueResult } from './react/use-pending-queue';

export { useOfflineDagMutation } from './react/use-offline-dag-mutation';
export type { DagMutationOptions, DagMutationResult } from './react/use-offline-dag-mutation';

// ─── Memory Adapter (universal, also used for testing) ──────────────────────
export { MemoryAdapter } from './adapters/storage/memory.adapter';
