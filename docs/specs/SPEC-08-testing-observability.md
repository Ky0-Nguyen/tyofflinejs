# SPEC-08: Testing and Observability

| Field | Value |
|-------|-------|
| **Epic** | Epic 8 |
| **Priority** | P1 |
| **Source** | `__tests__/`, `src/core/event-bus.ts` |
| **Requirements** | FR-7.1 through FR-7.3, NFR-2.1 through NFR-2.3 |

---

## 1. Purpose

Provide test infrastructure (mock adapters, helpers) and ensure the event system enables production observability. The test suite validates all core behaviors, adapter contracts, and React hook integrations.

## 2. Test Doubles

### MockNetworkAdapter

```typescript
class MockNetworkAdapter implements INetworkAdapter {
  setOnline(value: boolean): void  // Trigger online/offline for tests
  async isOnline(): Promise<boolean>
  subscribe(cb): () => void
}
```

- `setOnline()` synchronously notifies all subscribers
- No debounce (deterministic for tests)

### MockSyncExecutor

```typescript
class MockSyncExecutor implements SyncExecutor {
  calls: unknown[]              // Record of all execute() calls
  shouldFail: boolean           // Force all executions to fail
  failWithConflict: boolean     // Force 409 conflict responses
  customHandler: Function|null  // Per-call control
  reset(): void                 // Reset state
}
```

### createTestEngine(overrides?)

Factory function that wires up `MemoryAdapter` + `MockNetworkAdapter` + `MockSyncExecutor` with test-friendly defaults:
- `syncInterval: 0` (no auto-sync)
- `cooldownMs: 0` (no cooldown)

Returns `{ engine, storage, network, executor }` for full control.

## 3. Test Suite Structure

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| EventBus | `__tests__/core/event-bus.test.ts` | 9 | Event emission, unsubscribe, error isolation, listener count |
| PendingQueue | `__tests__/core/pending-queue.test.ts` | 10 | Enqueue, dedup, ordering, persistence, status updates |
| ConflictResolver | `__tests__/core/conflict-resolver.test.ts` | 7 | All 5 strategies, custom handler, runtime switching |
| SyncManager | `__tests__/core/sync-manager.test.ts` | 7 | Online sync, offline skip, failure handling, ordering, pause, conflict, persistence |
| MemoryAdapter | `__tests__/adapters/memory-adapter.test.ts` | 7 | CRUD, deep clone, multiGet, clear |
| React Hooks | `__tests__/react/hooks.test.ts` | 7 | useOfflineStatus, useOfflineMutation, usePendingQueue, useSyncStatus |
| **Total** | | **47** | |

## 4. Key Test Scenarios

### Offline-to-Online Transition

1. Set network offline
2. Enqueue multiple actions
3. Set network online
4. Verify all actions are synced in correct order
5. Verify queue is empty after sync

### Sync Failure and Retry

1. Configure executor to fail
2. Enqueue and sync
3. Verify action status is `'failed'` with retryCount incremented
4. Call `retryFailed()` (with mocked delay)
5. Configure executor to succeed
6. Verify action is synced and removed

### Queue Persistence Across Restarts

1. Create engine, enqueue while offline, destroy engine
2. Create new engine with same storage adapter
3. Verify pending actions are restored from storage

### Network Flapping

1. Rapidly toggle online/offline during sync
2. Verify sync pauses gracefully
3. Verify no duplicate processing

### Conflict Resolution

1. Configure executor to return 409 conflict
2. Sync the action
3. Verify ConflictResolver is invoked
4. Verify action is either re-queued or removed based on strategy

## 5. Observability Events

For production monitoring, apps can subscribe to events:

| Use Case | Events to Subscribe |
|----------|-------------------|
| Sync status UI | `sync:start`, `sync:progress`, `sync:complete` |
| Offline banner | `network:online`, `network:offline` |
| Pending badge count | `queue:added`, `queue:removed`, `queue:cleared` |
| Error alerting | `sync:error` |
| Conflict audit log | `sync:conflict` |
| Analytics | `sync:complete` (track sync duration, failure rate) |

## 6. Testing Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 2.1.x | Test runner with globals |
| @testing-library/react | 16.x | React hook testing |
| jsdom | 25.x | DOM environment for hook tests |

## 7. Acceptance Criteria

- [ ] MockNetworkAdapter allows synchronous online/offline control
- [ ] MockSyncExecutor records calls and supports configurable failures
- [ ] createTestEngine provides a ready-to-use test harness
- [ ] All 47 tests pass
- [ ] Tests cover: enqueue, dedup, sync, retry, conflict, persistence, hooks
- [ ] Event system enables production observability without code changes
- [ ] Test suite runs in < 5 seconds
