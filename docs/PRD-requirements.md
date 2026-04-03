# PRD: Cross-Platform Offline Module -- Requirements

> See also: [PRD-overview.md](PRD-overview.md) | [PRD-epics.md](PRD-epics.md) | [specs/](specs/)

---

## 1. Functional Requirements

### FR-1: Offline Data Persistence

| ID | Requirement | Priority |
|----|------------|----------|
| FR-1.1 | The module MUST persist data locally via a pluggable storage adapter | P0 |
| FR-1.2 | The module MUST provide `get`, `set`, `remove`, `getAllKeys`, `multiGet`, `clear` operations | P0 |
| FR-1.3 | The module MUST ship three built-in adapters: MemoryAdapter, IndexedDBAdapter, AsyncStorageAdapter | P0 |
| FR-1.4 | Storage adapters MUST implement `IStorageAdapter` interface | P0 |
| FR-1.5 | MemoryAdapter MUST use deep clones to prevent reference mutation | P1 |

### FR-2: Pending Operations Queue

| ID | Requirement | Priority |
|----|------------|----------|
| FR-2.1 | The module MUST queue create/update/delete operations when offline | P0 |
| FR-2.2 | Each queued action MUST have: id, type, entity, entityId, payload, timestamp, retryCount, maxRetries, status | P0 |
| FR-2.3 | The queue MUST deduplicate: merge consecutive updates to the same entity | P0 |
| FR-2.4 | The queue MUST cancel out: delete after create for the same entity removes the create | P1 |
| FR-2.5 | The queue MUST persist across app restarts via the storage adapter | P0 |
| FR-2.6 | The queue MUST order items for sync: creates first, then updates, then deletes | P0 |

### FR-3: Sync Engine

| ID | Requirement | Priority |
|----|------------|----------|
| FR-3.1 | The module MUST sync pending operations when connectivity is restored | P0 |
| FR-3.2 | The module MUST support auto-sync on a configurable interval | P1 |
| FR-3.3 | The module MUST retry failed operations with configurable backoff (linear or exponential) | P0 |
| FR-3.4 | The module MUST respect a configurable max retry count per action | P0 |
| FR-3.5 | The module MUST enforce a cooldown period between sync runs | P1 |
| FR-3.6 | The module MUST prevent concurrent sync runs via promise tracking | P0 |
| FR-3.7 | The module MUST pause sync when network drops mid-sync | P0 |
| FR-3.8 | The module MUST delegate actual HTTP/API calls to a user-provided `SyncExecutor` | P0 |

### FR-4: Conflict Resolution

| ID | Requirement | Priority |
|----|------------|----------|
| FR-4.1 | The module MUST detect conflicts via HTTP 409 responses | P0 |
| FR-4.2 | The module MUST support 5 built-in strategies: client-wins, server-wins, last-write-wins, merge, manual | P0 |
| FR-4.3 | The module MUST allow a custom `ConflictHandler` function to override built-in strategies | P1 |
| FR-4.4 | The conflict strategy MUST be changeable at runtime | P2 |
| FR-4.5 | The `merge` strategy MUST perform a shallow merge of local payload over remote data | P1 |

### FR-5: Network Detection

| ID | Requirement | Priority |
|----|------------|----------|
| FR-5.1 | The module MUST detect online/offline status via a pluggable network adapter | P0 |
| FR-5.2 | WebNetworkAdapter MUST use `navigator.onLine` + optional ping URL | P0 |
| FR-5.3 | RNNetworkAdapter MUST use `@react-native-community/netinfo` | P0 |
| FR-5.4 | Network adapters MUST debounce connectivity change events | P1 |
| FR-5.5 | Network adapters MUST support subscribe/unsubscribe for change notifications | P0 |

### FR-6: React Integration

| ID | Requirement | Priority |
|----|------------|----------|
| FR-6.1 | The module MUST provide `OfflineProvider` that initializes the engine and exposes it via context | P0 |
| FR-6.2 | The module MUST provide `useOfflineStatus` hook returning `{ isOnline, checkNow }` | P0 |
| FR-6.3 | The module MUST provide `useOfflineQuery<T>` hook with cache-first reading | P0 |
| FR-6.4 | The module MUST provide `useOfflineMutation<T>` hook for offline-safe writes | P0 |
| FR-6.5 | The module MUST provide `useSyncStatus` hook returning sync progress | P1 |
| FR-6.6 | The module MUST provide `usePendingQueue` hook returning queue state and controls | P1 |
| FR-6.7 | All hooks MUST work in both React (web) and React Native without modification | P0 |

### FR-7: Event System

| ID | Requirement | Priority |
|----|------------|----------|
| FR-7.1 | The module MUST emit typed events for: network changes, queue mutations, sync lifecycle, conflicts | P0 |
| FR-7.2 | Event listeners MUST be unsubscribable via a returned cleanup function | P0 |
| FR-7.3 | Listener errors MUST NOT break the event loop | P1 |

---

## 2. Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-1.1 | Core bundle size (gzipped) | < 25 KB |
| NFR-1.2 | Adapter bundles MUST tree-shake independently | Verified by build output |
| NFR-1.3 | Queue operations (enqueue, dequeue) | < 5ms for 100 items |
| NFR-1.4 | Engine initialization time | < 50ms with MemoryAdapter |

### NFR-2: Reliability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-2.1 | Zero data loss for queued operations under normal conditions | 100% sync success rate |
| NFR-2.2 | Queue persistence survives app crash / restart | Verified by integration test |
| NFR-2.3 | Concurrent sync prevention | Only 1 sync runs at a time |

### NFR-3: Compatibility

| ID | Requirement | Target |
|----|------------|--------|
| NFR-3.1 | React | >= 17.0.0 |
| NFR-3.2 | React Native | >= 0.70 |
| NFR-3.3 | TypeScript | >= 5.0 |
| NFR-3.4 | Node.js | >= 18 |
| NFR-3.5 | Module formats | ESM + CJS dual output |

### NFR-4: Developer Experience

| ID | Requirement | Target |
|----|------------|--------|
| NFR-4.1 | Full TypeScript generics across the API | All hooks accept `<T>` |
| NFR-4.2 | Meaningful error messages on misconfiguration | Tested in unit tests |
| NFR-4.3 | Comprehensive README with web + RN examples | Available |
| NFR-4.4 | Architecture decision document | `docs/ARCHITECTURE.md` |
