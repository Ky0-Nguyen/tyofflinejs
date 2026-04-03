import { NetworkPanel } from './panels/NetworkPanel';
import { EntityPanel } from './panels/EntityPanel';
import { QueuePanel } from './panels/QueuePanel';
import { SyncPanel } from './panels/SyncPanel';
import { DependencyPanel } from './panels/DependencyPanel';
import type { ControllableNetworkAdapter } from './mock-network';
import type { MockBackend } from './mock-backend';

interface AppProps {
  network: ControllableNetworkAdapter;
  backend: MockBackend;
}

export function App({ network, backend }: AppProps) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Offline Module Test Dashboard</h1>
      </header>
      <div className="dashboard-grid">
        <NetworkPanel network={network} />
        <EntityPanel />
        <QueuePanel />
        <SyncPanel backend={backend} />
        <DependencyPanel />
      </div>
    </div>
  );
}
