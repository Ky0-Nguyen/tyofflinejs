# Architecture

## Overview

The offline module follows a **layered adapter architecture** where the pure TypeScript core has zero platform dependencies. Platform-specific behavior (storage, network detection) is injected at runtime via adapter interfaces.

This design enables a single codebase to run on both React (web) and React Native (mobile) by swapping only the adapters.

## Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  React Integration Layer                 │
│  OfflineProvider  useOfflineQuery  useOfflineMutation    │
│  useOfflineStatus  useSyncStatus  usePendingQueue       │
├─────────────────────────────────────────────────────────┤
│                   Core Layer (Pure TS)                   │
│  OfflineEngine → SyncManager → PendingQueue             │
│                → ConflictResolver → EventBus            │
│                → NetworkQualifier                       │
│                → DAG ExecutionEngine                    │
├─────────────────────────────────────────────────────────┤
│                  Adapter Interfaces                      │
│  IStorageAdapter              INetworkAdapter            │
├───────────────┬───────────────┬─────────────────────────┤
│ IndexedDB     │ AsyncStorage, MMKV, SQLite KV │ Memory (test/universal)  │
│ (Web)         │ (RN)          │                           │
├───────────────┼───────────────┤                          │
│ WebNetwork    │ RNNetwork    │                           │
│ (Web)         │ (RN)         │                           │
└───────────────┴───────────────┴─────────────────────────┘
```

## Dependency Direction

Dependencies flow **downward only**:

1. React hooks depend on Core (OfflineEngine)
2. Core depends on adapter **interfaces** (not implementations)
3. Adapters implement Core interfaces

This ensures:
- Core can be tested without any platform code
- Adding a new platform means writing new adapters, not modifying core
- Tree-shaking removes unused adapters from the bundle

## Core Components

### OfflineEngine

The main orchestrator. It:
- Initializes the PendingQueue, SyncManager, and ConflictResolver
- Subscribes to network changes and triggers sync on reconnection
- Provides the public API (`enqueue`, `syncNow`, `getData`, `setData`)
- Manages the engine lifecycle (`init`, `destroy`)

### PendingQueue

Manages the queue of offline operations:
- **Enqueue** with automatic deduplication (merges consecutive updates to the same entity)
- **Ordering** for sync: creates first, then updates, then deletes
- **Persistence** through the storage adapter
- **Status tracking**: pending → in_progress → completed/failed

Deduplication rules:
- `update` after `create` for same entity → merge into the existing create
- `update` after `update` for same entity → replace payload in the existing update
- `delete` after `create` for same entity → remove the create (cancel out)

### SyncManager

Processes the queue when online:
- **Sync promise tracking** prevents concurrent sync runs; callers await the in-flight promise
- **Cooldown** prevents re-triggering within a configurable window
- **Retry** with configurable backoff (linear or exponential)
- **Conflict detection** delegates to ConflictResolver when the server returns 409
- **Network stabilization** waits for connectivity to remain stable before syncing (prevents flapping)
- **Execution timeout** wraps each `executor.execute()` with a configurable deadline
- **Error classification** distinguishes network errors (no retry penalty) from business errors
- **Auto-retry** with exponential backoff and circuit breaker after failed cycles
- Emits events for progress tracking

### ConflictResolver

Resolves conflicts between local pending actions and server state:
- **Built-in strategies**: client-wins, server-wins, last-write-wins, merge, manual
- **Custom handler**: provide a function for complex resolution logic
- Strategy can be changed at runtime

### EventBus

Typed event emitter for decoupled communication within the engine:
- Type-safe event names and payloads
- Supports subscribe/unsubscribe/removeAll
- Listener errors are caught to prevent breaking the event loop

## Data Flow

### Write (Mutation) Flow

```
1. App calls useOfflineMutation → mutate(payload)
2. Hook calls engine.enqueue({ type, entity, entityId, payload })
3. Engine adds to PendingQueue (with deduplication)
4. Engine checks network:
   - Online → triggers SyncManager.processQueue()
   - Offline → action stays in queue, persisted to storage
5. SyncManager processes items in order (creates → updates → deletes)
6. For each item:
   - Sets status to 'in_progress'
   - Calls SyncExecutor.execute(action)
   - Success → removes from queue
   - Failure → sets status to 'failed', increments retryCount
   - Conflict (409) → delegates to ConflictResolver
7. Emits sync:complete with progress stats
```

### Read (Query) Flow

```
1. App calls useOfflineQuery(key, fetcher)
2. Hook reads from local storage first (cache-first)
3. If a fetcher is provided and online:
   - Fetches fresh data from the remote API
   - Caches the result locally
   - Updates the hook state with fresh data
4. If offline: returns the cached data only
```

### Reconnection Flow

```
1. NetworkAdapter detects connectivity restored
2. EventBus emits 'network:online'
3. OfflineEngine starts stabilization timer (default 3s)
4. If network drops before timer → timer is cancelled, no sync
5. If network stays online → timer fires → SyncManager.processQueue()
6. For each action:
   a. Per-action readiness check (force refresh cache)
   b. executeWithTimeout(action, default 30s)
   c. Network error → revert to pending, no retryCount increment
   d. Business error → mark failed, retryCount++
7. EventBus emits 'sync:complete'
```

### Network Resilience (SPEC-09)

The module handles these critical edge cases:

| Scenario | Mitigation |
|----------|-----------|
| Rapid ON/OFF toggling | Stabilization window debounces sync trigger |
| App crash mid-sync | `in_progress` actions recovered to `pending` on restart |
| Server hangs / no response | Execution timeout aborts after configurable deadline |
| Connectivity lost during API call | Network error classification preserves retry quota |
| Actions fail and need retry | Auto-retry with exponential backoff + circuit breaker |

## Package Structure

```
src/
├── core/                    # Pure TypeScript, zero platform dependencies
│   ├── types.ts             # Interfaces, types, constants, error classes
│   ├── network-types.ts     # Network-specific types (NetworkStatus, SyncReadiness)
│   ├── event-bus.ts         # Typed event emitter
│   ├── offline-engine.ts    # Main orchestrator
│   ├── sync-manager.ts      # Sync with retry, timeout, stabilization, error classification
│   ├── pending-queue.ts     # Queue with CRUD, deduplication, ordering, in-progress recovery
│   ├── conflict-resolver.ts # Pluggable conflict resolution strategies
│   ├── network-qualifier.ts # Multi-signal sync readiness evaluator
│   └── dag/                 # Dependency-aware execution engine
│       ├── types.ts
│       ├── dependency-graph.ts
│       ├── topological-sorter.ts
│       ├── temp-id-resolver.ts
│       ├── action-optimizer.ts
│       ├── execution-engine.ts
│       └── index.ts
├── adapters/
│   ├── storage/
│   │   ├── memory.adapter.ts        # Universal (test + fallback)
│   │   ├── indexeddb.adapter.ts     # Web browser
│   │   └── async-storage.adapter.ts # React Native
│   └── network/
│       ├── web-network.adapter.ts   # Browser (navigator.onLine + optional ping)
│       └── rn-network.adapter.ts    # React Native (@react-native-community/netinfo)
├── react/
│   ├── offline-provider.tsx         # React context + engine lifecycle
│   ├── use-offline-status.ts        # Network status hook
│   ├── use-offline-query.ts         # Cache-first data reading
│   ├── use-offline-mutation.ts      # Write with offline queue
│   ├── use-sync-status.ts           # Sync progress hook
│   └── use-pending-queue.ts         # Queue visibility hook
├── index.ts                 # Main entry: core + react + MemoryAdapter
├── adapters.web.ts          # Web adapters: IndexedDB + WebNetwork
└── adapters.native.ts       # RN adapters: AsyncStorage + RNNetwork
```

## Build Output

The library ships three entry points, each as ESM + CJS with TypeScript declarations:

| Entry | Contents | Import |
|-------|----------|--------|
| `index` | Core + React hooks + MemoryAdapter | `tyofflinejs` |
| `adapters.web` | IndexedDBAdapter + WebNetworkAdapter | `tyofflinejs/web` |
| `adapters.native` | AsyncStorageAdapter + RNNetworkAdapter | `tyofflinejs/native` |

Tree-shaking ensures:
- Web apps never bundle AsyncStorage or NetInfo code
- React Native apps never bundle IndexedDB code
- Apps that only use the core (no React) don't bundle React hooks

## Design Decisions

### Why adapter injection instead of conditional imports?

Conditional imports (`if (Platform.OS === 'web')`) force bundlers to include all platform code. Adapter injection via constructor means unused platform code is never imported.

### Why EventBus instead of direct callbacks?

EventBus decouples the engine components. The SyncManager doesn't need a reference to the React hooks; it just emits events. This keeps the core layer free from React dependencies.

### Why deduplication in the queue?

Without deduplication, rapid user edits while offline could produce hundreds of pending updates for the same entity. Merging consecutive updates reduces queue size and avoids unnecessary API calls.

### Why ordered sync (creates → updates → deletes)?

A `create` must reach the server before an `update` to the same entity. A `delete` should happen last. Without ordering, the server would receive updates for entities that don't exist yet.

### Why sync promise tracking?

Multiple triggers (auto-sync, network restore, manual syncNow) could fire simultaneously. Without promise tracking, they'd either skip silently or run concurrently causing race conditions. By tracking the active promise, concurrent callers await the in-flight sync.

### Why stabilization window before sync?

Network adapters already debounce events (2s), but that only collapses rapid micro-events. A stabilization window (default 3s) ensures the network has been *continuously* online before wasting resources on a sync attempt. Without it, a pattern like `ON(2.5s)→OFF→ON(2.5s)→OFF` would trigger two full sync attempts, both of which fail mid-flight. The stabilization timer resets on every OFF→ON transition and cancels on every ON→OFF transition.

### Why classify network vs business errors?

Without error classification, a user in a flaky network zone could exhaust all 3 retries for an action just from connectivity drops — before the action ever reaches the server's business logic. By distinguishing network errors (timeout, DNS, connectivity) from business errors (validation, auth, 500), we preserve retry quota for genuine failures. Network errors revert the action to `pending` without touching `retryCount`.

### Why execution timeout?

The `SyncExecutor` is user-provided code that calls an external API. If the server is alive but slow (long query, deadlock), the `await` blocks indefinitely — preventing all future syncs since `activeSyncPromise` never resolves. A configurable timeout (default 30s) ensures the sync pipeline always makes forward progress.
