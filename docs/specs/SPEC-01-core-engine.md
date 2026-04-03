# SPEC-01: Core Engine (OfflineEngine + EventBus)

| Field | Value |
|-------|-------|
| **Epic** | Epic 1 |
| **Priority** | P0 |
| **Source** | `src/core/offline-engine.ts`, `src/core/event-bus.ts`, `src/core/types.ts` |
| **Requirements** | FR-3.8, FR-7.1, FR-7.2, FR-7.3 |

---

## 1. Purpose

The OfflineEngine is the single entry point for consumers. It orchestrates all subsystems (queue, sync, conflict resolver, event bus) and manages the lifecycle of the offline module.

## 2. Components

### 2.1 OfflineEngine

**Responsibilities**:
- Accept `OfflineConfig` and instantiate all internal components
- Initialize queue (load persisted data) and sync manager
- Subscribe to network adapter and trigger sync on reconnection
- Expose public API: `enqueue`, `getData`, `setData`, `removeData`, `syncNow`, `retryFailed`
- Manage lifecycle: `init()` must be called before use; `destroy()` cleans up all subscriptions

**Lifecycle state machine**:

```
[Created] --init()--> [Ready] --destroy()--> [Destroyed]
                         |                       |
                         +--- ensureReady() -----+
                              (throws if not Ready)
```

**Constructor parameters** (`OfflineConfig`):

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `storage` | `IStorageAdapter` | Yes | -- |
| `network` | `INetworkAdapter` | Yes | -- |
| `syncExecutor` | `SyncExecutor` | Yes | -- |
| `syncInterval` | `number` | No | 30000 |
| `maxRetries` | `number` | No | 3 |
| `retryBackoff` | `'linear' \| 'exponential'` | No | `'exponential'` |
| `conflictStrategy` | `ConflictStrategy` | No | `'last-write-wins'` |
| `onConflict` | `ConflictHandler` | No | -- |
| `onSyncError` | `(error, action) => void` | No | -- |
| `cooldownMs` | `number` | No | 5000 |
| `pingUrl` | `string` | No | -- |
| `pingTimeoutMs` | `number` | No | 5000 |
| `syncConditions` | `SyncConditions` | No | -- |
| `networkStabilizationMs` | `number` | No | 3000 |
| `executionTimeoutMs` | `number` | No | 30000 |
| `maxConsecutiveRetries` | `number` | No | 5 |

### 2.2 EventBus

**Responsibilities**:
- Provide typed publish/subscribe for all `OfflineEvents`
- Return cleanup function from `on()` for safe unsubscription
- Catch and swallow listener errors to prevent breaking the emission loop

**API**:

| Method | Signature | Description |
|--------|-----------|-------------|
| `on` | `<K>(event: K, cb) => () => void` | Subscribe, returns unsubscribe fn |
| `off` | `<K>(event: K, cb) => void` | Unsubscribe explicitly |
| `emit` | `<K>(event: K, ...payload) => void` | Emit to all listeners |
| `removeAllListeners` | `(event?) => void` | Clear one or all events |
| `listenerCount` | `(event) => number` | Count active listeners |

## 3. Event Catalog

| Event | Payload | Emitted When |
|-------|---------|-------------|
| `network:online` | `undefined` | Network adapter reports online |
| `network:offline` | `undefined` | Network adapter reports offline |
| `queue:added` | `PendingAction` | New action enqueued |
| `queue:updated` | `PendingAction` | Action status changed |
| `queue:removed` | `string` (id) | Action removed from queue |
| `queue:cleared` | `undefined` | Entire queue cleared |
| `sync:start` | `undefined` | Sync processing begins |
| `sync:progress` | `SyncProgress` | After each item processed |
| `sync:complete` | `SyncProgress` | All items processed |
| `sync:error` | `{ error, action? }` | Individual action sync failure |
| `sync:retry-scheduled` | `{ delayMs, cycle, retryableCount }` | Auto-retry timer set after failures |
| `sync:retry-halted` | `{ reason, failedCount }` | Circuit breaker halted retries |
| `sync:conflict` | `ConflictContext` | Conflict detected during sync |
| `engine:ready` | `undefined` | Engine initialized |
| `engine:destroyed` | `undefined` | Engine destroyed |

## 4. Error Handling

- `ensureReady()` throws `Error` if engine not initialized or already destroyed
- All errors from subsystems propagate as typed errors (`StorageError`, `NetworkError`, `SyncError`)
- EventBus catches listener errors -- they never propagate to emitters

## 5. Acceptance Criteria

- [ ] Engine initializes queue and sync manager on `init()`
- [ ] Engine triggers sync on network reconnection
- [ ] Engine auto-syncs on `syncInterval` when > 0
- [ ] Engine prevents use before `init()` and after `destroy()`
- [ ] EventBus delivers events to all subscribers
- [ ] EventBus survives listener errors without breaking
- [ ] `destroy()` stops auto-sync, unsubscribes network, clears all listeners
