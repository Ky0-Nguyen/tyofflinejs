# Documentation Index

## Product Requirements Document (PRD)

| Document | Description |
|----------|-------------|
| [PRD-overview.md](PRD-overview.md) | Vision, goals, personas, success metrics, assumptions |
| [PRD-requirements.md](PRD-requirements.md) | Functional requirements (FR-1 to FR-7) and non-functional requirements (NFR-1 to NFR-4) |
| [PRD-epics.md](PRD-epics.md) | Epic breakdown (8 epics) with dependencies, priorities, and sequencing |

## Technical Specs

| Spec | Epic | Component |
|------|------|-----------|
| [SPEC-01-core-engine.md](specs/SPEC-01-core-engine.md) | Epic 1 | OfflineEngine + EventBus |
| [SPEC-02-pending-queue.md](specs/SPEC-02-pending-queue.md) | Epic 2 | PendingQueue (CRUD, dedup, ordering) |
| [SPEC-03-sync-engine.md](specs/SPEC-03-sync-engine.md) | Epic 3 | SyncManager (retry, backoff, cooldown) |
| [SPEC-04-conflict-resolution.md](specs/SPEC-04-conflict-resolution.md) | Epic 4 | ConflictResolver (5 strategies + custom) |
| [SPEC-05-storage-adapters.md](specs/SPEC-05-storage-adapters.md) | Epic 5 | Memory, IndexedDB, AsyncStorage adapters |
| [SPEC-06-network-adapters.md](specs/SPEC-06-network-adapters.md) | Epic 6 | Web + React Native network adapters |
| [SPEC-07-react-integration.md](specs/SPEC-07-react-integration.md) | Epic 7 | OfflineProvider + 5 React hooks |
| [SPEC-08-testing-observability.md](specs/SPEC-08-testing-observability.md) | Epic 8 | Test doubles, test suite, event observability |

## Architecture

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layered architecture, data flows, design decisions |
