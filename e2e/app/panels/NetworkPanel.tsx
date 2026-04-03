import { useOfflineStatus } from '../../../src/react/use-offline-status';
import type { ControllableNetworkAdapter } from '../mock-network';

interface Props {
  network: ControllableNetworkAdapter;
}

export function NetworkPanel({ network }: Props) {
  const { isOnline } = useOfflineStatus();

  const toggle = () => {
    network.setOnline(!isOnline);
  };

  return (
    <div className="panel" data-testid="network-panel">
      <h2>Network</h2>
      <div className="status-row">
        <span
          className={`status-dot ${isOnline ? 'online' : 'offline'}`}
          data-testid="network-dot"
        />
        <span data-testid="network-status">{isOnline ? 'Online' : 'Offline'}</span>
      </div>
      <button onClick={toggle} data-testid="network-toggle">
        {isOnline ? 'Go Offline' : 'Go Online'}
      </button>
    </div>
  );
}
