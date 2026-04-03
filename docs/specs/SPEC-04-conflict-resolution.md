# SPEC-04: Conflict Resolution

| Field | Value |
|-------|-------|
| **Epic** | Epic 4 |
| **Priority** | P0 |
| **Source** | `src/core/conflict-resolver.ts` |
| **Requirements** | FR-4.1 through FR-4.5 |

---

## 1. Purpose

The ConflictResolver provides pluggable strategies for resolving conflicts between local pending actions and server-side state. It is invoked by the SyncManager when the server returns HTTP 409.

## 2. ConflictContext

Passed to every resolution attempt:

| Field | Type | Description |
|-------|------|-------------|
| `local` | `PendingAction<T>` | The local pending action |
| `remote` | `unknown` | Server-side state (from error payload) |
| `entity` | `string` | Entity name |
| `entityId` | `string` | Entity identifier |

## 3. Built-in Strategies

### client-wins

Always returns the local action. The local change overwrites the server.

```typescript
(ctx) => ctx.local
```

### server-wins

Always returns null. The local action is discarded and removed from the queue.

```typescript
(ctx) => null
```

### last-write-wins

Compares `local.timestamp` against `remote.timestamp`. Returns whichever is more recent, or null if the server is newer.

```typescript
(ctx) => ctx.local.timestamp >= remoteTimestamp ? ctx.local : null
```

### merge

Performs a shallow merge: spreads remote object first, then local payload on top. Local fields override remote fields.

```typescript
(ctx) => ({
  ...ctx.local,
  payload: { ...ctx.remote, ...ctx.local.payload }
})
```

### manual

Always returns null. Designed for use with a custom `onConflict` handler or UI-driven resolution.

## 4. Custom Handler

When a custom `ConflictHandler` is provided via `OfflineConfig.onConflict`, it takes precedence over the built-in strategy:

```typescript
type ConflictHandler<T> = (context: ConflictContext<T>) => PendingAction<T> | null;
```

- Return a `PendingAction` to re-queue for retry
- Return `null` to discard the local action

## 5. Runtime Strategy Switching

```typescript
resolver.setStrategy('server-wins');
resolver.setCustomHandler(myHandler);
```

Strategy and handler can be changed at runtime without recreating the engine.

## 6. Resolution Outcomes

| Outcome | What happens |
|---------|-------------|
| Returns `PendingAction` | Action set back to `'pending'`, will re-sync |
| Returns `null` | Action removed from queue |

## 7. Acceptance Criteria

- [ ] `client-wins` always returns the local action
- [ ] `server-wins` always returns null
- [ ] `last-write-wins` picks the later timestamp
- [ ] `merge` produces shallow merge with local on top
- [ ] `manual` returns null (defers to custom handler)
- [ ] Custom handler overrides built-in strategy when provided
- [ ] Strategy is changeable at runtime via `setStrategy()`
