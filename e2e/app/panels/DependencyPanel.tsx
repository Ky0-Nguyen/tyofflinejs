import { useState, useCallback } from 'react';
import { useEngine } from '../../../src/react/offline-provider';

interface DagResult {
  completed: number;
  failed: number;
  blocked: number;
  mappings: Array<[string, string]>;
}

export function DependencyPanel() {
  const engine = useEngine();
  const [result, setResult] = useState<DagResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

  const handleCreateChain = useCallback(async () => {
    setResult(null);
    setLog([]);
    addLog('Enqueueing Item (tmp-item-1)...');

    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item-1',
      payload: { name: 'Test Item' },
      tempId: 'tmp-item-1',
    });

    addLog('Enqueueing Update Item (tmp-item-1)...');
    const createAction = engine.getPendingActions().find(
      (a) => a.tempId === 'tmp-item-1',
    );

    await engine.enqueueWithDeps({
      type: 'update',
      entity: 'Item',
      entityId: 'tmp-item-1',
      payload: { name: 'Updated Item' },
      dependsOn: createAction ? [createAction.id] : [],
    });

    addLog('Enqueueing SubItem (tmp-sub-1) under Item...');
    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'SubItem',
      entityId: 'tmp-sub-1',
      payload: { itemId: 'tmp-item-1', name: 'Sub 1' },
      tempId: 'tmp-sub-1',
      parentTempId: 'tmp-item-1',
    });

    addLog('Enqueueing SubSubItem (tmp-subsub-1) under SubItem...');
    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'SubSubItem',
      entityId: 'tmp-subsub-1',
      payload: { subItemId: 'tmp-sub-1', name: 'SubSub 1' },
      tempId: 'tmp-subsub-1',
      parentTempId: 'tmp-sub-1',
    });

    addLog(`Enqueued ${engine.getPendingActions().length} actions`);
  }, [engine, addLog]);

  const handleSyncDag = useCallback(async () => {
    addLog('Starting DAG sync...');
    try {
      await engine.syncWithDeps();
      const actions = engine.getPendingActions();
      const mappings = engine.executionEngine.getResolver().getMap();

      const dagResult: DagResult = {
        completed: actions.filter((a) => a.status === 'completed').length,
        failed: actions.filter((a) => a.status === 'failed').length,
        blocked: actions.filter((a) => a.status === 'blocked').length,
        mappings: Array.from(mappings.entries()),
      };

      const remaining = actions.length;
      addLog(`Sync done. Remaining in queue: ${remaining}`);
      addLog(`Temp ID mappings: ${dagResult.mappings.length}`);
      for (const [tempId, serverId] of dagResult.mappings) {
        addLog(`  ${tempId} → ${serverId}`);
      }
      setResult(dagResult);
    } catch (e) {
      addLog(`Sync error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [engine, addLog]);

  const handleClear = useCallback(() => {
    setResult(null);
    setLog([]);
  }, []);

  return (
    <div className="panel" data-testid="dag-panel">
      <h2>Dependency Engine (DAG)</h2>

      <div className="button-row">
        <button onClick={handleCreateChain} data-testid="dag-create-chain-btn">
          Create Item→Sub→SubSub
        </button>
        <button onClick={handleSyncDag} data-testid="dag-sync-btn">
          Sync with Dependencies
        </button>
        <button onClick={handleClear} data-testid="dag-clear-btn">
          Clear
        </button>
      </div>

      {result && (
        <div className="dag-result" data-testid="dag-result">
          <div data-testid="dag-failed">Failed: {result.failed}</div>
          <div data-testid="dag-blocked">Blocked: {result.blocked}</div>
          <div className="dag-mappings" data-testid="dag-mappings">
            <strong>Temp ID Mappings:</strong>
            {result.mappings.length === 0 ? (
              <span> none</span>
            ) : (
              <ul>
                {result.mappings.map(([tempId, serverId]) => (
                  <li key={tempId} data-testid={`dag-mapping-${tempId}`}>
                    {tempId} → {serverId}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="dag-log" data-testid="dag-log">
        <strong>Log:</strong>
        {log.length === 0 ? (
          <p className="empty">No activity</p>
        ) : (
          <ul>
            {log.map((entry, i) => (
              <li key={i} data-testid="dag-log-entry">{entry}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
