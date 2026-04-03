import { useCallback, useEffect, useState } from 'react';
import { useEngine } from './offline-provider';

export interface OfflineQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Cache-first data reading hook. Reads from local storage first, then optionally
 * fetches fresh data via the provided fetcher and caches the result.
 */
export function useOfflineQuery<T>(
  key: string,
  fetcher?: () => Promise<T>,
): OfflineQueryResult<T> {
  const engine = useEngine();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cached = await engine.getData<T>(key);
      if (cached !== null) {
        setData(cached);
      }

      if (fetcher) {
        const online = await engine.isOnline();
        if (online) {
          const fresh = await fetcher();
          await engine.setData(key, fresh);
          setData(fresh);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [engine, key, fetcher]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch };
}
