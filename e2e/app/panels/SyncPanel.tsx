import { useState, useEffect, useCallback } from 'react';
import { useSyncStatus } from '../../../src/react/use-sync-status';
import { useEngine } from '../../../src/react/offline-provider';
import type { MockBackend, FailMode } from '../mock-backend';

interface Props {
  backend: MockBackend;
}

export function SyncPanel({ backend }: Props) {
  const engine = useEngine();
  const progress = useSyncStatus();
  const [failMode, setFailMode] = useState<FailMode>('none');
  const [events, setEvents] = useState<string[]>([]);

  const addEvent = useCallback((msg: string) => {
    setEvents((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    const offs = [
      engine.on('sync:start', () => addEvent('Sync started')),
      engine.on('sync:complete', (p) => addEvent(`Sync complete: ${p.completed}/${p.total} ok, ${p.failed} failed`)),
      engine.on('sync:error', ({ error }) => addEvent(`Sync error: ${error.message}`)),
      engine.on('sync:conflict', (ctx) => addEvent(`Conflict: ${ctx.entity}/${ctx.entityId}`)),
      engine.on('queue:added', (a) => addEvent(`Queued: ${a.type} ${a.entity}/${a.entityId}`)),
      engine.on('queue:removed', (id) => addEvent(`Removed: ${id}`)),
      engine.on('network:online', () => addEvent('Network: online')),
      engine.on('network:offline', () => addEvent('Network: offline')),
    ];
    return () => offs.forEach((fn) => fn());
  }, [engine, addEvent]);

  const handleFailModeChange = (mode: FailMode) => {
    setFailMode(mode);
    backend.setFailMode(mode);
  };

  const handleSyncNow = async () => {
    await engine.syncNow();
  };

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="panel" data-testid="sync-panel">
      <h2>Sync</h2>

      <div className="status-row">
        <span>Status: </span>
        <strong data-testid="sync-status">{progress.status}</strong>
      </div>

      <div className="progress-bar" data-testid="sync-progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
        <span className="progress-label">{progress.completed}/{progress.total}</span>
      </div>

      <div className="status-row">
        <span>Last sync: </span>
        <span data-testid="sync-last-time">
          {progress.lastSyncAt ? new Date(progress.lastSyncAt).toLocaleTimeString() : 'Never'}
        </span>
      </div>

      <button onClick={handleSyncNow} data-testid="sync-now-btn">Sync Now</button>

      <div className="backend-controls">
        <h3>Backend Controls</h3>
        <div className="button-row">
          {(['none', 'error', 'conflict'] as FailMode[]).map((mode) => (
            <button
              key={mode}
              className={failMode === mode ? 'active' : ''}
              onClick={() => handleFailModeChange(mode)}
              data-testid={`backend-mode-${mode}`}
            >
              {mode === 'none' ? 'Normal' : mode === 'error' ? 'Fail' : 'Conflict 409'}
            </button>
          ))}
        </div>
        <p className="hint" data-testid="backend-mode-label">Mode: {failMode}</p>
      </div>

      <div className="event-log" data-testid="event-log">
        <h3>Event Log</h3>
        {events.length === 0 ? (
          <p className="empty">No events yet</p>
        ) : (
          <ul>
            {events.map((e, i) => (
              <li key={i} data-testid="event-log-entry">{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
