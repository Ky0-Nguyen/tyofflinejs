# SPEC-05: Storage Adapters

| Field | Value |
|-------|-------|
| **Epic** | Epic 5 |
| **Priority** | P0 |
| **Source** | `src/adapters/storage/memory.adapter.ts`, `indexeddb.adapter.ts`, `async-storage.adapter.ts` |
| **Requirements** | FR-1.1 through FR-1.5 |

---

## 1. Purpose

Storage adapters provide platform-specific implementations of `IStorageAdapter`. The core engine depends only on the interface; adapters are injected at configuration time.

## 2. IStorageAdapter Interface

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `<T>(key: string) => Promise<T \| null>` | Retrieve by key, null if missing |
| `set` | `<T>(key: string, value: T) => Promise<void>` | Store value at key |
| `remove` | `(key: string) => Promise<void>` | Delete key |
| `getAllKeys` | `() => Promise<string[]>` | List all stored keys |
| `multiGet` | `<T>(keys: string[]) => Promise<Map<string, T>>` | Batch retrieve |
| `clear` | `() => Promise<void>` | Delete all data |

## 3. MemoryAdapter

| Aspect | Detail |
|--------|--------|
| **Platform** | Universal (all environments) |
| **Backing store** | `Map<string, unknown>` |
| **Serialization** | `structuredClone()` for deep copy |
| **Use cases** | Unit tests, SSR, temporary storage |

Key behavior:
- `get()` and `multiGet()` return deep clones, not references
- Modifications to returned objects do not affect stored data
- `clear()` resets the internal Map

## 4. IndexedDBAdapter

| Aspect | Detail |
|--------|--------|
| **Platform** | Web browsers |
| **Backing store** | IndexedDB key-value object store |
| **Constructor** | `(dbName?, storeName?, version?)` |
| **Defaults** | `'offline_module_db'`, `'kv_store'`, `1` |

Key behavior:
- Lazy DB initialization: database opens on first operation
- `onupgradeneeded` creates the object store if missing
- All operations wrapped in transactions
- Errors wrapped in `StorageError` with original cause
- Platform guard: throws `StorageError` if `indexedDB` is undefined

## 5. AsyncStorageAdapter

| Aspect | Detail |
|--------|--------|
| **Platform** | React Native |
| **Backing store** | `@react-native-async-storage/async-storage` |
| **Constructor** | `(asyncStorage, prefix?)` |
| **Default prefix** | `'@offline:'` |

Key behavior:
- AsyncStorage dependency is **injected**, not imported (avoids bundling native code on web)
- All keys are prefixed: `@offline:myKey`
- Values are JSON-serialized: `JSON.stringify` on set, `JSON.parse` on get
- `getAllKeys()` filters by prefix to isolate module data from other app data
- `clear()` removes only prefixed keys (not entire AsyncStorage)
- Errors wrapped in `StorageError` with original cause

## 6. Error Handling

All adapters wrap platform errors in `StorageError`:

```typescript
class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}
```

The `cause` field preserves the original platform error for debugging.

## 7. Acceptance Criteria

- [ ] All three adapters implement the full `IStorageAdapter` interface
- [ ] MemoryAdapter returns deep clones (mutation-safe)
- [ ] IndexedDBAdapter creates the DB lazily on first access
- [ ] IndexedDBAdapter throws StorageError when IndexedDB is unavailable
- [ ] AsyncStorageAdapter prefixes all keys
- [ ] AsyncStorageAdapter only clears its own prefixed keys
- [ ] All adapters wrap errors in StorageError with cause
- [ ] All adapters pass the same functional test suite
