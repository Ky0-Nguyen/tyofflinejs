import { useCallback, useEffect, useState } from 'react';
import { useEngine } from './offline-provider';

export interface OfflineStatus {
  isOnline: boolean;
  checkNow: () => Promise<boolean>;
}

export function useOfflineStatus(): OfflineStatus {
  const engine = useEngine();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    void engine.isOnline().then(setIsOnline);

    const offOnline = engine.on('network:online', () => setIsOnline(true));
    const offOffline = engine.on('network:offline', () => setIsOnline(false));

    return () => {
      offOnline();
      offOffline();
    };
  }, [engine]);

  const checkNow = useCallback(async () => {
    const status = await engine.isOnline();
    setIsOnline(status);
    return status;
  }, [engine]);

  return { isOnline, checkNow };
}
