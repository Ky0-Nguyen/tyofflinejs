import { useCallback, useState } from 'react';
import { useEngine } from './offline-provider';
import type { ActionType, PendingAction } from '../core/types';

export interface DagMutationOptions<T> {
  entity: string;
  type: ActionType;
  tempId?: string;
  dependsOn?: string[];
  parentTempId?: string;
  meta?: Record<string, unknown>;
  onSuccess?: (action: PendingAction<T>) => void;
  onError?: (error: Error) => void;
}

export interface DagMutationResult<T> {
  mutate: (entityId: string, payload: T) => Promise<PendingAction<T>>;
  isLoading: boolean;
  error: Error | null;
  lastAction: PendingAction<T> | null;
  reset: () => void;
}

export function useOfflineDagMutation<T = unknown>(
  options: DagMutationOptions<T>,
): DagMutationResult<T> {
  const engine = useEngine();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastAction, setLastAction] = useState<PendingAction<T> | null>(null);

  const mutate = useCallback(
    async (entityId: string, payload: T): Promise<PendingAction<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        const action = await engine.enqueueWithDeps<T>({
          type: options.type,
          entity: options.entity,
          entityId,
          payload,
          tempId: options.tempId,
          dependsOn: options.dependsOn,
          parentTempId: options.parentTempId,
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
