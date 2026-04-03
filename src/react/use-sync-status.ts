import { useEffect, useState } from 'react';
import { useEngine } from './offline-provider';
import type { SyncProgress } from '../core/types';

export function useSyncStatus(): SyncProgress {
  const engine = useEngine();
  const [progress, setProgress] = useState<SyncProgress>(() =>
    engine.getSyncProgress(),
  );

  useEffect(() => {
    const offProgress = engine.on('sync:progress', (p) => setProgress(p));
    const offComplete = engine.on('sync:complete', (p) => setProgress(p));
    const offStart = engine.on('sync:start', () =>
      setProgress((prev) => ({ ...prev, status: 'syncing' })),
    );

    return () => {
      offProgress();
      offComplete();
      offStart();
    };
  }, [engine]);

  return progress;
}
