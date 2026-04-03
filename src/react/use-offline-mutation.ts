import { useCallback, useState } from 'react';
import { useEngine } from './offline-provider';
import type { ActionType, PendingAction } from '../core/types';

export interface MutationOptions<T> {
  entity: string;
  entityId: string;
  type: ActionType;
  meta?: Record<string, unknown>;
  onSuccess?: (action: PendingAction<T>) => void;
  onError?: (error: Error) => void;
}

export interface OfflineMutationResult<T> {
  mutate: (payload: T) => Promise<PendingAction<T>>;
  isLoading: boolean;
  error: Error | null;
  lastAction: PendingAction<T> | null;
  reset: () => void;
}

export function useOfflineMutation<T = unknown>(
  options: MutationOptions<T>,
): OfflineMutationResult<T> {
  const engine = useEngine();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastAction, setLastAction] = useState<PendingAction<T> | null>(null);

  const mutate = useCallback(
    async (payload: T): Promise<PendingAction<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        const action = await engine.enqueue<T>({
          type: options.type,
          entity: options.entity,
          entityId: options.entityId,
          payload,
          meta: options.meta,
        });
        setLastAction(action);
        options.onSuccess?.(action);
        return action;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        options.onError?.(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [engine, options],
  );

  const reset = useCallback(() => {
    setError(null);
    setLastAction(null);
  }, []);

  return { mutate, isLoading, error, lastAction, reset };
}
