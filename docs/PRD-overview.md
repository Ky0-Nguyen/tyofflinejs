# PRD: Cross-Platform Offline Module -- Overview

| Field | Value |
|-------|-------|
| **Product** | `tyofflinejs` |
| **Version** | 1.0 |
| **Author** | Principal Engineer |
| **Status** | Draft |
| **Last Updated** | 2026-04-03 |

> See also: [PRD-requirements.md](PRD-requirements.md) | [PRD-epics.md](PRD-epics.md) | [specs/](specs/)

---

## 1. Vision

Provide a single, production-grade TypeScript library that gives any React or React Native application **full offline capability** -- including local data persistence, background sync, conflict resolution, and a developer-friendly React hooks API -- without requiring platform-specific application code.

## 2. Problem Statement

Modern mobile and web applications are expected to work reliably regardless of network conditions. Today, teams building offline support face these challenges:

| Challenge | Impact |
|-----------|--------|
| Duplicated offline logic across web and mobile codebases | Higher maintenance cost, divergent behavior |
| No standard sync queue pattern | Each team reinvents queuing, retry, and deduplication |
| Conflict handling is ad-hoc | Data loss when two clients edit the same entity |
| Storage APIs differ across platforms | IndexedDB (web) vs AsyncStorage (RN) require separate code |
| Network detection varies | `navigator.onLine` (web) vs `NetInfo` (RN) have different semantics |

## 3. Goals

| # | Goal | Measurable Target |
|---|------|-------------------|
| G1 | **Cross-platform reuse** | Same core engine runs on React and React Native with zero source changes |
| G2 | **Zero-config happy path** | A developer can integrate offline support in < 30 minutes with default settings |
| G3 | **Reliable sync** | 100% of queued operations eventually reach the server (given network availability and retry budget) |
| G4 | **Pluggable architecture** | Adding a new storage backend (e.g. SQLite, MMKV) requires implementing 1 interface, touching 0 core files |
| G5 | **Small bundle impact** | < 25 KB gzipped for the core; platform adapters tree-shake away when unused |
| G6 | **Observable** | Every queue mutation, sync attempt, and conflict emits a typed event that the app can subscribe to |

## 4. Non-Goals (v1)

- **Server SDK** -- the module does not provide server-side endpoints; it communicates via a user-defined `SyncExecutor`.
- **Full CRDT / OT** -- v1 supports last-write-wins and shallow merge. Deep structural merge (e.g. text CRDT) is out of scope.
- **Offline-first routing / navigation** -- the module handles data, not UI navigation.
- **Encryption at rest** -- storage adapters persist data as-is. Consumers can wrap adapters to add encryption.

## 5. Target Personas

### 5.1 Feature Developer

- Consumes the React hooks (`useOfflineMutation`, `useOfflineQuery`)
- Wants a simple API: "mutate data, get it synced, show status"
- Should not need to understand queue internals or storage layer

### 5.2 Platform / Infrastructure Engineer

- Configures the `OfflineEngine` with project-specific adapters and sync executor
- May write custom adapters (SQLite, MMKV, GraphQL sync)
- Needs full control over conflict strategies and error handling

### 5.3 QA / Reliability Engineer

- Needs to simulate offline scenarios in tests
- Requires observable events to assert sync behavior
- Uses `MemoryAdapter` for fast, deterministic test setups

## 6. Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Integration time | < 30 min for default setup | Developer survey / onboarding timer |
| Sync reliability | 0 lost operations under normal retry budget | Automated test suite (47 tests) + production telemetry |
| Bundle size (core) | < 25 KB gzip | CI build artifact measurement |
| Cross-platform parity | 100% API surface shared | Same test suite runs against web + RN adapters |
| Adapter extensibility | New adapter in < 100 LOC | Reference: MemoryAdapter = 39 LOC |

## 7. Assumptions and Constraints

| # | Assumption / Constraint |
|---|------------------------|
| A1 | Host apps use React >= 17 (hooks support) |
| A2 | React Native apps have access to `@react-native-async-storage/async-storage` and `@react-native-community/netinfo` |
| A3 | Backend APIs are REST-ish; the library is protocol-agnostic via `SyncExecutor` |
| A4 | Conflict detection relies on HTTP 409 status code from the server |
| A5 | The module does not manage authentication tokens -- the `SyncExecutor` is responsible for authenticated requests |
