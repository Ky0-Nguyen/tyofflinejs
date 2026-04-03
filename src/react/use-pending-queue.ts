import { useCallback, useEffect, useState } from 'react';
import { useEngine } from './offline-provider';
import type { PendingAction } from '../core/types';

export interface PendingQueueResult {
  actions: PendingAction[];
  pendingCount: number;
  failedCount: number;
  clearQueue: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

export function usePendingQueue(): PendingQueueResult {
  const engine = useEngine();
  const [actions, setActions] = useState<PendingAction[]>([]);

  const refresh = useCallback(() => {
    setActions(engine.getPendingActions());
  }, [engine]);

  useEffect(() => {
    refresh();

    const offAdded = engine.on('queue:added', refresh);
    const offUpdated = engine.on('queue:updated', refresh);
    const offRemoved = engine.on('queue:removed', refresh);
    const offCleared = engine.on('queue:cleared', refresh);

    return () => {
      offAdded();
      offUpdated();
      offRemoved();
      offCleared();
    };
  }, [engine, refresh]);

  const clearQueue = useCallback(async () => {
    await engine.queue.clear();
  }, [engine]);

  const retryFailed = useCallback(async () => {
    await engine.retryFailed();
  }, [engine]);

  return {
    actions,
    pendingCount: actions.filter(
      (a) => a.status === 'pending' || a.status === 'in_progress',
    ).length,
    failedCount: actions.filter((a) => a.status === 'failed').length,
    clearQueue,
    retryFailed,
  };
}
