# SPEC-07: React Integration (Provider + Hooks)

| Field | Value |
|-------|-------|
| **Epic** | Epic 7 |
| **Priority** | P0 |
| **Source** | `src/react/offline-provider.tsx`, `use-offline-*.ts`, `use-sync-status.ts`, `use-pending-queue.ts` |
| **Requirements** | FR-6.1 through FR-6.7 |

---

## 1. Purpose

Provide a React context provider and hooks that expose the offline engine to both React (web) and React Native applications. All hooks are platform-agnostic and use TypeScript generics for type safety.

## 2. OfflineProvider

### Behavior

1. Creates `OfflineEngine` from `config` prop on mount
2. Calls `engine.init()` asynchronously
3. Renders `null` until engine is ready
4. Renders children wrapped in context once ready
5. Calls `engine.destroy()` on unmount

### Props

| Prop | Type | Description |
|------|------|-------------|
| `config` | `OfflineConfig` | Engine configuration |
| `children` | `ReactNode` | App tree |

### useEngine() Internal Hook

Reads from context; throws a descriptive error if used outside `<OfflineProvider>`.

## 3. useOfflineStatus

```typescript
function useOfflineStatus(): { isOnline: boolean; checkNow: () => Promise<boolean> }
```

| Field | Description |
|-------|-------------|
| `isOnline` | Reactive boolean, updates on `network:online` / `network:offline` events |
| `checkNow` | Imperative check that updates `isOnline` and returns the result |

### Implementation

- Initial value set from `engine.isOnline()` on mount
- Subscribes to `network:online` and `network:offline` events
- Cleans up subscriptions on unmount

## 4. useOfflineQuery\<T\>

```typescript
function useOfflineQuery<T>(key: string, fetcher?: () => Promise<T>): OfflineQueryResult<T>
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T \| null` | Cached or fetched data |
| `isLoading` | `boolean` | True during initial load |
| `error` | `Error \| null` | Fetch error if any |
| `refetch` | `() => Promise<void>` | Manual refetch trigger |

### Cache-First Strategy

1. Read from `engine.getData(key)` -- show cached data immediately
2. If `fetcher` is provided and device is online:
   - Call `fetcher()` to get fresh data
   - Write result to `engine.setData(key, data)`
   - Update state with fresh data
3. If offline: use cached data only (no error)

## 5. useOfflineMutation\<T\>

```typescript
function useOfflineMutation<T>(options: MutationOptions<T>): OfflineMutationResult<T>
```

### MutationOptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity` | `string` | Yes | Entity name |
| `entityId` | `string` | Yes | Entity identifier |
| `type` | `ActionType` | Yes | `'create' \| 'update' \| 'delete'` |
| `meta` | `Record<string, unknown>` | No | Optional metadata |
| `onSuccess` | `(action) => void` | No | Success callback |
| `onError` | `(error) => void` | No | Error callback |

### OfflineMutationResult

| Field | Type | Description |
|-------|------|-------------|
| `mutate` | `(payload: T) => Promise<PendingAction<T>>` | Enqueue mutation |
| `isLoading` | `boolean` | True while enqueuing |
| `error` | `Error \| null` | Enqueue error if any |
| `lastAction` | `PendingAction<T> \| null` | Most recent enqueued action |
| `reset` | `() => void` | Clear error and lastAction |

## 6. useSyncStatus

```typescript
function useSyncStatus(): SyncProgress
```

Subscribes to `sync:start`, `sync:progress`, and `sync:complete` events. Returns current `SyncProgress` object.

## 7. usePendingQueue

```typescript
function usePendingQueue(): PendingQueueResult
```

| Field | Type | Description |
|-------|------|-------------|
| `actions` | `PendingAction[]` | All queued actions |
| `pendingCount` | `number` | Pending + in_progress count |
| `failedCount` | `number` | Failed action count |
| `clearQueue` | `() => Promise<void>` | Clear all actions |
| `retryFailed` | `() => Promise<void>` | Retry failed actions |

Subscribes to `queue:added`, `queue:updated`, `queue:removed`, `queue:cleared` events for reactive updates.

## 8. Platform Compatibility

All hooks:
- Use `useState`, `useEffect`, `useCallback`, `useContext` only
- No DOM-specific APIs (`document`, `window`)
- No React Native-specific APIs
- Platform concerns handled by adapters injected via config

## 9. Acceptance Criteria

- [ ] OfflineProvider initializes engine and renders children when ready
- [ ] useOfflineStatus reflects network changes reactively
- [ ] useOfflineQuery returns cached data immediately, fetches if online
- [ ] useOfflineMutation enqueues actions and returns PendingAction
- [ ] useSyncStatus reflects sync progress from events
- [ ] usePendingQueue reflects queue state from events
- [ ] All hooks clean up subscriptions on unmount
- [ ] All hooks work in both React DOM and React Native
