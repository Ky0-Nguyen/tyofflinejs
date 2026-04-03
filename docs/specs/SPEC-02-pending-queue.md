# SPEC-02: Pending Queue

| Field | Value |
|-------|-------|
| **Epic** | Epic 2 |
| **Priority** | P0 |
| **Source** | `src/core/pending-queue.ts` |
| **Requirements** | FR-2.1 through FR-2.6 |

---

## 1. Purpose

The PendingQueue manages the list of offline operations waiting to be synced. It provides CRUD operations, automatic deduplication, ordered retrieval, and persistence through the storage adapter.

## 2. Data Model

### PendingAction\<T\>

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID (timestamp-based + random) |
| `type` | `'create' \| 'update' \| 'delete'` | Operation type |
| `entity` | `string` | Entity name (e.g. `'tasks'`) |
| `entityId` | `string` | Entity identifier |
| `payload` | `T` | Operation payload |
| `timestamp` | `number` | Enqueue time (ms since epoch) |
| `retryCount` | `number` | Number of failed attempts |
| `maxRetries` | `number` | Max allowed retries |
| `status` | `ActionStatus` | `'pending' \| 'in_progress' \| 'failed' \| 'completed' \| 'blocked'` |
| `meta` | `Record<string, unknown>?` | Optional metadata |

## 3. Operations

### 3.1 enqueue(params)

1. Check deduplication rules against existing pending items
2. If deduplicated, update existing item and persist
3. If new, create `PendingAction`, add to list, persist
4. Emit `queue:added` or `queue:updated`

### 3.2 Deduplication Rules

| Incoming | Existing (same entity+entityId) | Result |
|----------|--------------------------------|--------|
| `update` | `create` (pending) | Merge payload into existing create |
| `update` | `update` (pending) | Replace payload in existing update |
| `delete` | `create` (pending) | Remove the existing create |
| All other combinations | -- | Enqueue as new action |

### 3.3 updateStatus(id, status)

- Find item by ID, set new status
- If status is `'failed'`, increment `retryCount`
- Persist and emit `queue:updated`

### 3.4 remove(id)

- Filter out item by ID
- Persist and emit `queue:removed`

### 3.5 clear()

- Reset items to empty array
- Persist and emit `queue:cleared`

## 4. Retrieval Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getPending()` | `PendingAction[]` | Items with status `'pending'` |
| `getFailed()` | `PendingAction[]` | Items with status `'failed'` |
| `getRetryable()` | `PendingAction[]` | Pending or failed items under max retries |
| `getAll()` | `PendingAction[]` | Full copy of all items |
| `getOrderedForSync()` | `PendingAction[]` | Retryable items sorted: creates, updates, deletes |
| `count` | `number` | Total item count |
| `pendingCount` | `number` | Pending + in_progress count |

## 5. Sync Ordering

`getOrderedForSync()` returns items in this order:

1. All `create` actions, sorted by timestamp ascending
2. All `update` actions, sorted by timestamp ascending
3. All `delete` actions, sorted by timestamp ascending

This ensures entities exist on the server before they are updated or deleted.

## 6. Persistence

- Queue state is stored under key `__offline_queue__`
- `load()` must be called before any operation (throws if not loaded)
- Every mutation calls `persist()` which writes the full array to storage

## 7. In-Progress Recovery

On `load()`, the queue automatically calls `recoverInterrupted()` which scans for actions stuck in `in_progress` (from a previous crashed/killed sync) and resets them to `pending` without incrementing `retryCount`. This guarantees no action is permanently lost due to an interrupted sync.

## 8. DAG-Aware Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getBlocked()` | `PendingAction[]` | Items with status `'blocked'` |
| `getDependencyAware()` | `PendingAction[]` | Items with dependency metadata (`tempId`, `dependsOn`, `parentTempId`) |
| `hasDependencyActions()` | `boolean` | Whether any item has dependency metadata |

## 9. Acceptance Criteria

- [ ] Enqueue creates a PendingAction with correct defaults
- [ ] Consecutive updates to same entity are deduplicated
- [ ] Delete after create for same entity removes the create
- [ ] Queue persists across load/save cycles
- [ ] `getOrderedForSync()` returns creates before updates before deletes
- [ ] `updateStatus('failed')` increments retryCount
- [ ] `getRetryable()` excludes items at maxRetries
- [ ] Throws if operations called before `load()`
- [ ] `recoverInterrupted()` resets `in_progress` actions to `pending` on load
- [ ] Recovery does not increment `retryCount`
