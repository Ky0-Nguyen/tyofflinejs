# Mobile E2E Tests (Expo + Maestro)

End-to-end tests for the Offline Module running in a React Native (Expo) app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. **Node.js** >= 18
2. **Expo CLI**: installed via `npx expo`
3. **Maestro CLI**:
   ```bash
   curl -Ls 'https://get.maestro.mobile.dev' | bash
   ```
4. **iOS Simulator** (macOS) or **Android Emulator**

## Setup

```bash
# From repo root
cd e2e-mobile
npm install
```

## Running the App

```bash
# Start Expo dev server
npx expo start

# Or target a specific platform
npx expo start --ios
npx expo start --android
```

## Running E2E Tests

Start the app on a simulator/emulator first, then run Maestro:

```bash
# Run all test flows
maestro test maestro/

# Run a single flow
maestro test maestro/network-toggle.yaml
maestro test maestro/pending-queue.yaml
maestro test maestro/sync-flow.yaml
maestro test maestro/dag-execution.yaml
maestro test maestro/dag-failure.yaml
```

## Test Flows

| Flow | Description |
|---|---|
| `network-toggle.yaml` | Toggle online/offline state, verify UI updates |
| `pending-queue.yaml` | Create tasks offline, verify queue, clear queue |
| `sync-flow.yaml` | Sync online, test error mode, backend mode cycling |
| `dag-execution.yaml` | Full Item→SubItem→SubSubItem chain with DAG sync and temp ID mapping |
| `dag-failure.yaml` | DAG sync with backend errors, verify dependent actions are blocked |

## Architecture

The app mirrors the web E2E dashboard (`e2e/`) but uses React Native components:

- **`App.tsx`** — Entry point with `OfflineProvider` wrapping all panels
- **`src/mock-network.ts`** — Controllable network adapter (toggle online/offline)
- **`src/mock-backend.ts`** — Mock API with configurable fail modes and server ID generation
- **`src/panels/`** — Five interactive panels:
  - `NetworkPanel` — Online/offline toggle
  - `EntityPanel` — CRUD operations on tasks
  - `QueuePanel` — Pending queue visibility and controls
  - `SyncPanel` — Sync status, manual sync, backend mode
  - `DependencyPanel` — DAG chain creation and dependency-aware sync

All panels use `testID` props so Maestro can locate elements.
