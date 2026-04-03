# SPEC-06: Network Adapters

| Field | Value |
|-------|-------|
| **Epic** | Epic 6 |
| **Priority** | P0 |
| **Source** | `src/adapters/network/web-network.adapter.ts`, `rn-network.adapter.ts` |
| **Requirements** | FR-5.1 through FR-5.5 |

---

## 1. Purpose

Network adapters provide platform-specific implementations of `INetworkAdapter`. They detect connectivity status and notify subscribers of changes.

## 2. INetworkAdapter Interface

| Method | Signature | Description |
|--------|-----------|-------------|
| `isOnline` | `() => Promise<boolean>` | Check current connectivity |
| `subscribe` | `(cb: (online: boolean) => void) => () => void` | Listen for changes, returns unsubscribe |

## 3. WebNetworkAdapter

| Aspect | Detail |
|--------|--------|
| **Platform** | Web browsers |
| **Constructor** | `(options?: WebNetworkOptions)` |
| **Options** | `pingUrl?: string`, `debounceMs?: number` (default 2000) |

### isOnline() Logic

1. Check `navigator.onLine` -- if false, return false immediately
2. If `pingUrl` is configured, send a `HEAD` request (5s timeout, `no-cors` mode)
   - Success: return true
   - Failure: return false
3. If no `pingUrl`, trust `navigator.onLine`

### subscribe() Logic

- Registers `window.addEventListener('online' | 'offline')`
- Events are **debounced** by `debounceMs` to handle network flapping
- Cleanup removes event listeners when last subscriber unsubscribes

### Platform Guard

Throws `NetworkError` if `typeof window === 'undefined'`.

## 4. RNNetworkAdapter

| Aspect | Detail |
|--------|--------|
| **Platform** | React Native |
| **Constructor** | `(netInfo: NetInfoModule, options?: RNNetworkOptions)` |
| **Options** | `debounceMs?: number` (default 2000) |

### isOnline() Logic

1. Call `netInfo.fetch()` to get current state
2. Return `isConnected === true && isInternetReachable !== false`

The `isInternetReachable !== false` check (rather than `=== true`) accounts for the initial `null` state when NetInfo hasn't determined reachability yet.

### subscribe() Logic

- Calls `netInfo.addEventListener()` on first subscriber
- Events are **debounced** by `debounceMs`
- **Deduplication**: only notifies when state actually changes from last reported value
- Cleanup calls the NetInfo unsubscribe function when last subscriber leaves

### Dependency Injection

NetInfo is passed via constructor (not imported) to avoid bundling React Native code on web.

## 5. Debounce Rationale

Network events can fire rapidly during:
- WiFi handoff
- Cellular tower switching
- VPN connection/disconnection
- Large file uploads (temporary connectivity drops)

A 2-second debounce window prevents:
- Unnecessary sync triggers
- UI flickering between online/offline indicators
- Multiple rapid event emissions

## 6. Error Handling

Both adapters:
- Catch and swallow errors in individual listener callbacks
- Throw `NetworkError` for construction-time failures (missing platform APIs)

## 7. Acceptance Criteria

- [ ] WebNetworkAdapter uses `navigator.onLine` for basic check
- [ ] WebNetworkAdapter optionally verifies via ping URL
- [ ] WebNetworkAdapter debounces online/offline events
- [ ] RNNetworkAdapter uses NetInfo.fetch() for status
- [ ] RNNetworkAdapter debounces and deduplicates notifications
- [ ] Both adapters return unsubscribe function from `subscribe()`
- [ ] Both adapters throw NetworkError when platform APIs are missing
- [ ] Listener errors do not propagate to other listeners
