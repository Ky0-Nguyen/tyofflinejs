# SPEC-03: Sync Engine (SyncManager)

| Field | Value |
|-------|-------|
| **Epic** | Epic 3 |
| **Priority** | P0 |
| **Source** | `src/core/sync-manager.ts` |
| **Requirements** | FR-3.1 through FR-3.7, FR-9.1 through FR-9.4 |

---

## 1. Purpose

The SyncManager processes the pending queue by calling the user-provided `SyncExecutor` for each action. It handles retry logic, backoff, cooldown, conflict delegation, network stabilization, execution timeouts, error classification, and prevents concurrent sync runs.

## 2. Sync Flow

```
processQueue()
  ├── Already syncing? → await active promise, return
  ├── Within cooldown? → return
  ├── Offline / not ready? → set status 'paused', return
  ├── Queue empty? → return
  └── For each action (ordered):
       ├── Per-action readiness check (force refresh)
       │    └── Offline? → resetInProgress, set 'paused', return
       ├── Set status 'in_progress'
       ├── executeWithTimeout(action, executionTimeoutMs)
       │    ├── Timeout → ExecutionTimeoutError (network error)
       │    ├── Success → remove from queue
       │    ├── Conflict (409) → delegate to ConflictResolver
       │    ├── Network error → revertToPending (no retryCount++)
       │    └── Business error → set 'failed', retryCount++
       └── Emit sync:progress
  └── Record lastSyncAt, emit sync:complete
```

## 3. Concurrency Control

The SyncManager tracks the active sync via `activeSyncPromise`:

```typescript
async processQueue(): Promise<void> {
  if (this.activeSyncPromise) {
    return this.activeSyncPromise;  // await existing sync
  }
  this.activeSyncPromise = this.doProcessQueue();
  try {
    await this.activeSyncPromise;
  } finally {
    this.activeSyncPromise = null;
  }
}
```

Multiple callers (auto-sync timer, network restore, manual syncNow) all get the same promise -- no duplicate processing.

## 4. Network Stabilization (Fix #1)

Network flapping (rapid ON/OFF toggling) can trigger many wasted sync attempts. The SyncManager includes a stabilization mechanism:

- `scheduleStabilizedSync()` — starts a debounce timer (default 3000ms)
- `cancelStabilizedSync()` — clears the timer when network goes offline
- Repeated calls within the window reset the timer
- Sync only fires when network has been stable for the full window duration

OfflineEngine wires this into the network subscriber:
- `network:online` → `scheduleStabilizedSync()`
- `network:offline` → `cancelStabilizedSync()`

## 5. Execution Timeout (Fix #3)

Every `executor.execute()` call is wrapped with a configurable timeout:

```typescript
executeWithTimeout(action, executionTimeoutMs)
  ├── Start timer (default 30s)
  ├── await executor.execute(action)
  │    ├── Resolves before timer → clear timer, return result
  │    └── Timer fires first → reject with ExecutionTimeoutError
  └── ExecutionTimeoutError → classified as network error → no retryCount++
```

This prevents a non-responsive server from blocking the entire sync pipeline.

## 6. Error Classification (Fix #4)

The `handleFailure()` method routes errors through a classification pipeline:

```
Error received
  ├── Conflict (statusCode 409)?
  │    └── Yes → ConflictResolver
  ├── isNetworkError(error)?
  │    └── Yes → revertToPending (status='pending', retryCount unchanged)
  └── Business error → updateStatus('failed'), retryCount++
```

`isNetworkError()` matches:
- `ExecutionTimeoutError`, `NetworkError`, `AbortError`
- Messages containing: `network`, `fetch`, `econnrefused`, `enotfound`, `timeout`, `abort`

## 7. In-Progress Recovery (Fix #2)

Actions can get stuck in `in_progress` if:
- The app crashes or is killed during sync
- The sync pauses mid-batch (network check fails between actions)

Recovery mechanisms:
- **On startup**: `PendingQueue.load()` → `recoverInterrupted()` resets all `in_progress` → `pending`
- **Mid-batch**: `resetInProgress(action)` reverts the current action before pausing

## 8. Retry Strategy

| Strategy | Formula | Example (retryCount=2) |
|----------|---------|----------------------|
| `linear` | `BASE * (retryCount + 1)` | 1000 * 3 = 3000ms |
| `exponential` | `BASE * 2^retryCount` | 1000 * 4 = 4000ms |

- `BASE_DELAY = 1000ms`
- `retryFailed()` resets failed items to `'pending'` with appropriate delay between each
- Network errors preserve the existing `retryCount` (do not consume quota)

## 8b. Auto-Retry Pipeline

After every sync cycle that finishes with failures, `scheduleAutoRetryIfNeeded` checks whether another retry cycle should be scheduled:

```
Sync cycle completes
  ├── progress.failed === 0 → reset consecutiveRetryCycles, done
  ├── No retryable actions left (all exhausted maxRetries) → reset, done
  ├── consecutiveRetryCycles >= maxConsecutiveRetries → HALT (circuit breaker)
  │    └── emit sync:retry-halted, reset counter
  └── Schedule processQueue() after backoff delay
       ├── delay = computeBackoffDelay(consecutiveRetryCycles)
       ├── consecutiveRetryCycles++
       └── emit sync:retry-scheduled { delayMs, cycle, retryableCount }
```

**6 layers of anti-infinite-loop protection:**

| Layer | Mechanism | Default |
|-------|-----------|---------|
| 1 | `maxRetries` per action (hard cap) | 3 |
| 2 | `retryCount++` on each business error | — |
| 3 | `consecutiveRetryCycles` circuit breaker | 5 cycles |
| 4 | Exponential backoff between cycles | 1s → 2s → 4s → 8s → 16s |
| 5 | Network readiness check before each cycle | — |
| 6 | All timers cancelled on offline / destroy | — |

**Events:**

| Event | Payload | When |
|-------|---------|------|
| `sync:retry-scheduled` | `{ delayMs, cycle, retryableCount }` | Retry timer set |
| `sync:retry-halted` | `{ reason, failedCount }` | Circuit breaker trips |

**Manual override:** `retryFailed()` resets the circuit breaker, allowing a new round of auto-retries after user intervention.

## 9. Cooldown

After a sync completes, `lastSyncAt` is recorded. Subsequent `processQueue()` calls within `cooldownMs` are silently skipped. This prevents network event flapping from triggering excessive syncs.

## 10. Auto-Sync

- `startAutoSync(intervalMs)` sets up a `setInterval` timer
- Each tick calls `void processQueue()` (fire-and-forget)
- `stopAutoSync()` clears the interval
- `destroy()` calls `stopAutoSync()`, `cancelStabilizedSync()`, and `cancelAutoRetry()`

## 11. Conflict Handling

When `SyncExecutor.execute()` returns `{ ok: false, error }` and the error has `statusCode === 409`:

1. Extract `error.remote` as the server state
2. Build `ConflictContext { local, remote, entity, entityId }`
3. Emit `sync:conflict` event
4. Call `conflictResolver.resolve(context)`
   - If resolved (non-null) → set action back to `'pending'` for re-sync
   - If null (discarded) → remove action from queue

## 12. SyncProgress

Emitted via `sync:progress` and `sync:complete`:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `SyncStatus` | `'idle' \| 'syncing' \| 'paused' \| 'error'` |
| `total` | `number` | Items in this sync batch |
| `completed` | `number` | Successfully synced |
| `failed` | `number` | Failed this batch |
| `lastSyncAt` | `number \| null` | Timestamp of last completed sync |

## 13. Acceptance Criteria

- [ ] Queue is processed when online
- [ ] Sync is skipped when offline (status becomes 'paused')
- [ ] Concurrent processQueue calls await the same promise
- [ ] Failed actions have incremented retryCount (business errors only)
- [ ] Network errors do NOT increment retryCount
- [ ] Sync pauses mid-batch when network drops
- [ ] In-progress actions are reset on pause and on restart
- [ ] Execution timeout fires after configurable deadline
- [ ] Timeout errors are classified as network errors
- [ ] Conflicts are delegated to ConflictResolver
- [ ] Cooldown prevents rapid re-triggering
- [ ] Stabilization window prevents flapping-triggered syncs
- [ ] Auto-sync fires on configured interval
- [ ] SyncProgress events reflect accurate counts
- [ ] Auto-retry schedules with exponential backoff after failures
- [ ] Auto-retry emits `sync:retry-scheduled` with delay, cycle, count
- [ ] Circuit breaker halts retries after `maxConsecutiveRetries` cycles
- [ ] Circuit breaker emits `sync:retry-halted` with reason
- [ ] Circuit breaker resets on zero-failure cycle or manual `retryFailed()`
- [ ] Auto-retry cancelled when network goes offline or engine destroyed
- [ ] No retry scheduled when all actions exhausted `maxRetries`
- [ ] `destroy()` cleans up all timers (auto-sync + stabilization + auto-retry)
