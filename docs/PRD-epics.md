# PRD: Cross-Platform Offline Module -- Epics

> See also: [PRD-overview.md](PRD-overview.md) | [PRD-requirements.md](PRD-requirements.md) | [specs/](specs/)

---

## Epic Map

```
Epic 1: Core Engine           ← foundation, everything depends on this
  ├── Epic 2: Pending Queue   ← data layer for offline operations
  ├── Epic 3: Sync Engine     ← processes the queue, talks to backend
  └── Epic 4: Conflict Res.   ← handles sync conflicts
Epic 5: Storage Adapters       ← platform-specific persistence
Epic 6: Network Adapters       ← platform-specific connectivity
Epic 7: React Integration      ← hooks + provider for React/RN apps
Epic 8: Testing & Observ.      ← test infrastructure + event system
```

---

## Epic 1: Core Engine (OfflineEngine)

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-01-core-engine.md](specs/SPEC-01-core-engine.md) |
| **Priority** | P0 |
| **Dependencies** | None (foundation) |
| **Requirements** | FR-3.8, FR-7.1, FR-7.2, FR-7.3 |

**Summary**: The OfflineEngine is the main orchestrator that wires together the queue, sync manager, conflict resolver, and event bus. It manages the engine lifecycle (init, destroy), subscribes to network changes, and provides the public API surface for enqueueing operations and reading data.

**Key deliverables**:
- `OfflineEngine` class with init/destroy lifecycle
- `EventBus` typed event emitter
- `OfflineConfig` configuration interface
- Engine auto-triggers sync on network restore

---

## Epic 2: Pending Queue

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-02-pending-queue.md](specs/SPEC-02-pending-queue.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1 (EventBus, IStorageAdapter interface) |
| **Requirements** | FR-2.1 through FR-2.6 |

**Summary**: The PendingQueue manages all offline operations. It supports enqueue, dequeue, status updates, deduplication, and ordered retrieval for sync processing. The queue persists through the storage adapter so operations survive app restarts.

**Key deliverables**:
- `PendingQueue` class with CRUD operations
- Deduplication logic (merge updates, cancel create+delete pairs)
- Ordered retrieval: creates -> updates -> deletes
- Persistence via `IStorageAdapter`

---

## Epic 3: Sync Engine

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-03-sync-engine.md](specs/SPEC-03-sync-engine.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1, Epic 2, Epic 4 |
| **Requirements** | FR-3.1 through FR-3.7 |

**Summary**: The SyncManager processes the pending queue when the device is online. It handles retry with configurable backoff, enforces cooldown between sync runs, prevents concurrent syncs via promise tracking, and delegates conflicts to the ConflictResolver.

**Key deliverables**:
- `SyncManager` class with processQueue, retryFailed
- Promise-tracked sync (concurrent callers await the same promise)
- Configurable retry backoff (linear / exponential)
- Cooldown enforcement
- Auto-sync on configurable interval

---

## Epic 4: Conflict Resolution

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-04-conflict-resolution.md](specs/SPEC-04-conflict-resolution.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1 (types) |
| **Requirements** | FR-4.1 through FR-4.5 |

**Summary**: The ConflictResolver provides pluggable strategies for handling conflicts between local pending actions and server state. Five built-in strategies are provided, plus support for custom handlers.

**Key deliverables**:
- `ConflictResolver` class
- 5 built-in strategies: client-wins, server-wins, last-write-wins, merge, manual
- Custom handler override
- Runtime strategy switching

---

## Epic 5: Storage Adapters

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-05-storage-adapters.md](specs/SPEC-05-storage-adapters.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1 (IStorageAdapter interface) |
| **Requirements** | FR-1.1 through FR-1.5 |

**Summary**: Three storage adapter implementations that conform to `IStorageAdapter`: MemoryAdapter (universal/test), IndexedDBAdapter (web), and AsyncStorageAdapter (React Native).

**Key deliverables**:
- `MemoryAdapter` -- Map-based, deep-clone, reference implementation
- `IndexedDBAdapter` -- browser IndexedDB with lazy DB initialization
- `AsyncStorageAdapter` -- React Native AsyncStorage with key prefixing and JSON serialization

---

## Epic 6: Network Adapters

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-06-network-adapters.md](specs/SPEC-06-network-adapters.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1 (INetworkAdapter interface) |
| **Requirements** | FR-5.1 through FR-5.5 |

**Summary**: Two network adapter implementations that conform to `INetworkAdapter`: WebNetworkAdapter (browser) and RNNetworkAdapter (React Native). Both include debounced event notifications.

**Key deliverables**:
- `WebNetworkAdapter` -- navigator.onLine + optional ping verification + debounce
- `RNNetworkAdapter` -- NetInfo integration + debounce + dedup notifications

---

## Epic 7: React Integration

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-07-react-integration.md](specs/SPEC-07-react-integration.md) |
| **Priority** | P0 |
| **Dependencies** | Epic 1, Epic 2, Epic 3 |
| **Requirements** | FR-6.1 through FR-6.7 |

**Summary**: React context provider and hooks that expose the offline engine to React and React Native applications. All hooks are platform-agnostic and use generics for type-safe payloads.

**Key deliverables**:
- `OfflineProvider` -- initializes engine, exposes via context
- `useOfflineStatus` -- network status
- `useOfflineQuery<T>` -- cache-first reads
- `useOfflineMutation<T>` -- offline-safe writes
- `useSyncStatus` -- sync progress
- `usePendingQueue` -- queue visibility and control

---

## Epic 8: Testing and Observability

| Field | Value |
|-------|-------|
| **Spec** | [SPEC-08-testing-observability.md](specs/SPEC-08-testing-observability.md) |
| **Priority** | P1 |
| **Dependencies** | All previous epics |
| **Requirements** | FR-7.1 through FR-7.3, NFR-2.1 through NFR-2.3 |

**Summary**: Test infrastructure, mock adapters, and the event system that enables observability. Includes `MockNetworkAdapter`, `createTestEngine` helper, and the comprehensive test suite.

**Key deliverables**:
- `MockNetworkAdapter` and `MockSyncExecutor` test doubles
- `createTestEngine()` factory for tests
- Test suite: 47 tests across core, adapters, and React hooks
- Typed event system for production observability

---

## Priority and Sequencing

| Phase | Epics | Rationale |
|-------|-------|-----------|
| Phase 1 | Epic 1, 2, 4 | Core foundation: engine, queue, conflict resolver |
| Phase 2 | Epic 3 | Sync engine depends on queue + conflict resolution |
| Phase 3 | Epic 5, 6 | Adapters implement core interfaces |
| Phase 4 | Epic 7 | React layer depends on core being complete |
| Phase 5 | Epic 8 | Tests and observability validate everything |
