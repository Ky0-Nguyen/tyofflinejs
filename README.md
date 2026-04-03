# tyofflinejs

A cross-platform, tree-shakeable offline-first module for **React** and **React Native**. Pure TypeScript core with pluggable storage and network adapters.

## Features

- **Cross-platform** - same API for React (web) and React Native (mobile)
- **Pure TypeScript core** - zero platform dependencies in the engine
- **Pluggable adapters** - bring your own storage (IndexedDB, AsyncStorage, or custom) and network detection
- **Pending queue** - operations are queued when offline and synced when connectivity returns
- **Conflict resolution** - built-in strategies (client-wins, server-wins, last-write-wins, merge, manual) or provide your own
- **React hooks** - `useOfflineQuery`, `useOfflineMutation`, `useOfflineStatus`, `useSyncStatus`, `usePendingQueue`
- **Tree-shakeable** - import only what you need; web apps never bundle React Native code
- **Type-safe** - full generic typing across the entire API

## Installation

```bash
npm install tyofflinejs
```

### Web (React)

No additional dependencies required for `MemoryAdapter`. For persistent storage:

```bash
# IndexedDB adapter works out of the box in browsers
```

### React Native

```bash
npm install @react-native-async-storage/async-storage @react-native-community/netinfo
```

## Quick Start

### 1. Define your sync executor

The sync executor is how the module communicates with your backend:

```typescript
import type { SyncExecutor, PendingAction, Result } from 'tyofflinejs';

const syncExecutor: SyncExecutor = {
  async execute(action: PendingAction): Promise<Result<unknown>> {
    try {
      const response = await fetch(`/api/${action.entity}`, {
        method: action.type === 'delete' ? 'DELETE' : action.type === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.payload),
      });

      if (!response.ok) {
        return { ok: false, error: new Error(`HTTP ${response.status}`) };
      }

      return { ok: true, value: await response.json() };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  },
};
```

### 2. Configure and wrap your app

#### Web (React)

```tsx
import { OfflineProvider } from 'tyofflinejs';
import { IndexedDBAdapter, WebNetworkAdapter } from 'tyofflinejs/web';

const config = {
  storage: new IndexedDBAdapter(),
  network: new WebNetworkAdapter({ pingUrl: '/api/health' }),
  syncExecutor: syncExecutor,
  syncInterval: 30000,
  conflictStrategy: 'last-write-wins' as const,
};

function App() {
  return (
    <OfflineProvider config={config}>
      <YourApp />
    </OfflineProvider>
  );
}
```

#### React Native

```tsx
import { OfflineProvider } from 'tyofflinejs';
import { AsyncStorageAdapter, RNNetworkAdapter } from 'tyofflinejs/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const config = {
  storage: new AsyncStorageAdapter(AsyncStorage),
  network: new RNNetworkAdapter(NetInfo),
  syncExecutor: syncExecutor,
  syncInterval: 30000,
  conflictStrategy: 'last-write-wins' as const,
};

function App() {
  return (
    <OfflineProvider config={config}>
      <YourApp />
    </OfflineProvider>
  );
}
```

### 3. Use the hooks

```tsx
import {
  useOfflineStatus,
  useOfflineMutation,
  useOfflineQuery,
  useSyncStatus,
  usePendingQueue,
} from 'tyofflinejs';

function TaskList() {
  const { isOnline } = useOfflineStatus();
  const { data: tasks, isLoading } = useOfflineQuery<Task[]>(
    'tasks',
    () => fetch('/api/tasks').then(r => r.json()),
  );
  const { mutate: createTask } = useOfflineMutation<Task>({
    entity: 'tasks',
    entityId: 'new',
    type: 'create',
  });
  const { status, lastSyncAt } = useSyncStatus();
  const { pendingCount } = usePendingQueue();

  return (
    <div>
      <p>Status: {isOnline ? 'Online' : 'Offline'}</p>
      <p>Sync: {status} | Pending: {pendingCount}</p>
      <button onClick={() => createTask({ title: 'New Task' })}>
        Add Task
      </button>
      {isLoading ? <p>Loading...</p> : tasks?.map(t => <div key={t.id}>{t.title}</div>)}
    </div>
  );
}
```

## API Reference

### Core

| Export | Description |
|--------|------------|
| `OfflineEngine` | Main orchestrator - manages queue, sync, and adapters |
| `PendingQueue` | Pending operations queue with deduplication and ordering |
| `SyncManager` | Processes the queue with retry, backoff, and conflict resolution |
| `ConflictResolver` | Pluggable conflict resolution strategies |
| `EventBus` | Typed event emitter for decoupled communication |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useOfflineStatus()` | `{ isOnline, checkNow }` | Current network status |
| `useOfflineQuery<T>(key, fetcher?)` | `{ data, isLoading, error, refetch }` | Cache-first data reading |
| `useOfflineMutation<T>(options)` | `{ mutate, isLoading, error, lastAction, reset }` | Write with offline queue |
| `useSyncStatus()` | `SyncProgress` | Sync progress (status, total, completed, failed, lastSyncAt) |
| `usePendingQueue()` | `{ actions, pendingCount, failedCount, clearQueue, retryFailed }` | Queue visibility and control |

### Adapters

| Adapter | Platform | Import Path |
|---------|----------|-------------|
| `MemoryAdapter` | Universal | `tyofflinejs` |
| `IndexedDBAdapter` | Web | `tyofflinejs/web` |
| `WebNetworkAdapter` | Web | `tyofflinejs/web` |
| `AsyncStorageAdapter` | React Native | `tyofflinejs/native` |
| `RNNetworkAdapter` | React Native | `tyofflinejs/native` |

### Configuration

```typescript
interface OfflineConfig {
  storage: IStorageAdapter;       // Required: storage adapter
  network: INetworkAdapter;       // Required: network adapter
  syncExecutor: SyncExecutor;     // Required: how to sync with backend
  syncInterval?: number;          // Auto-sync interval (ms). 0 = disabled. Default: 30000
  maxRetries?: number;            // Max retry attempts per action. Default: 3
  retryBackoff?: 'linear' | 'exponential'; // Retry delay strategy
  conflictStrategy?: ConflictStrategy;     // Default: 'last-write-wins'
  onConflict?: ConflictHandler;   // Custom conflict handler
  onSyncError?: (error: Error, action: PendingAction) => void;
  cooldownMs?: number;            // Min time between syncs. Default: 5000
}
```

### Conflict Strategies

| Strategy | Behavior |
|----------|----------|
| `client-wins` | Local change always wins |
| `server-wins` | Remote data always wins (local discarded) |
| `last-write-wins` | Most recent timestamp wins |
| `merge` | Shallow merge of local + remote payloads |
| `manual` | Returns null - requires custom `onConflict` handler |

## Events

Subscribe to engine events for fine-grained control:

```typescript
const engine = useEngine();

engine.on('network:online', () => console.log('Back online'));
engine.on('network:offline', () => console.log('Gone offline'));
engine.on('sync:start', () => console.log('Sync started'));
engine.on('sync:complete', (progress) => console.log('Sync done', progress));
engine.on('sync:error', ({ error, action }) => console.error('Sync failed', error));
engine.on('sync:conflict', (ctx) => console.warn('Conflict detected', ctx));
engine.on('queue:added', (action) => console.log('Queued', action));
```

## Custom Adapters

Implement `IStorageAdapter` or `INetworkAdapter` to support any platform:

```typescript
import type { IStorageAdapter } from 'tyofflinejs';

class SQLiteAdapter implements IStorageAdapter {
  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T): Promise<void> { /* ... */ }
  async remove(key: string): Promise<void> { /* ... */ }
  async getAllKeys(): Promise<string[]> { /* ... */ }
  async multiGet<T>(keys: string[]): Promise<Map<string, T>> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
}
```

## License

MIT
