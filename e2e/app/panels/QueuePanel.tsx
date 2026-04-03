import { usePendingQueue } from '../../../src/react/use-pending-queue';

export function QueuePanel() {
  const { actions, pendingCount, failedCount, clearQueue, retryFailed } = usePendingQueue();

  return (
    <div className="panel" data-testid="queue-panel">
      <h2>
        Pending Queue{' '}
        <span className="badge" data-testid="queue-badge">{pendingCount}</span>
      </h2>

      <div className="button-row">
        <button onClick={clearQueue} data-testid="queue-clear-btn">Clear Queue</button>
        <button onClick={retryFailed} data-testid="queue-retry-btn">
          Retry Failed ({failedCount})
        </button>
      </div>

      <div className="table-wrap" data-testid="queue-table">
        {actions.length === 0 ? (
          <p className="empty">Queue is empty</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Entity</th>
                <th>EntityID</th>
                <th>Status</th>
                <th>Retries</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} data-testid={`queue-row-${a.id}`} data-status={a.status}>
                  <td className="mono">{a.id.slice(0, 8)}</td>
                  <td><span className={`type-badge type-${a.type}`}>{a.type}</span></td>
                  <td>{a.entity}</td>
                  <td>{a.entityId}</td>
                  <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                  <td>{a.retryCount}/{a.maxRetries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
