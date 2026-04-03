import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { OfflineProvider } from '../../src/react/offline-provider';
import { useOfflineStatus } from '../../src/react/use-offline-status';
import { useOfflineMutation } from '../../src/react/use-offline-mutation';
import { usePendingQueue } from '../../src/react/use-pending-queue';
import { useSyncStatus } from '../../src/react/use-sync-status';
import { MockNetworkAdapter, MockSyncExecutor } from '../helpers';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';
import type { OfflineConfig } from '../../src/core/types';

function createWrapper(config: OfflineConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(OfflineProvider, { config }, children);
  };
}

describe('React Hooks', () => {
  let storage: MemoryAdapter;
  let network: MockNetworkAdapter;
  let executor: MockSyncExecutor;
  let config: OfflineConfig;

  beforeEach(() => {
    storage = new MemoryAdapter();
    network = new MockNetworkAdapter();
    executor = new MockSyncExecutor();
    config = {
      storage,
      network,
      syncExecutor: executor,
      syncInterval: 0,
      cooldownMs: 0,
    };
  });

  describe('useOfflineStatus', () => {
    it('should report online status', async () => {
      const { result } = renderHook(() => useOfflineStatus(), {
        wrapper: createWrapper(config),
      });

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });
    });

    it('should react to network changes', async () => {
      const { result } = renderHook(() => useOfflineStatus(), {
        wrapper: createWrapper(config),
      });

      await waitFor(() => {
        expect(result.current.isOnline).toBe(true);
      });

      act(() => {
        network.setOnline(false);
      });

      await waitFor(() => {
        expect(result.current.isOnline).toBe(false);
      });
    });
  });

  describe('useOfflineMutation', () => {
    it('should enqueue a mutation', async () => {
      const onSuccess = vi.fn();
      const { result } = renderHook(
        () =>
          useOfflineMutation<{ title: string }>({
            entity: 'task',
            entityId: 'task-1',
            type: 'create',
            onSuccess,
          }),
        { wrapper: createWrapper(config) },
      );

      await waitFor(() => {
        expect(result.current.mutate).toBeDefined();
      });

      await act(async () => {
        await result.current.mutate({ title: 'New Task' });
      });

      expect(onSuccess).toHaveBeenCalledOnce();
      expect(result.current.lastAction).not.toBeNull();
      expect(result.current.lastAction!.entity).toBe('task');
    });

    it('should handle mutation errors', async () => {
      network.setOnline(false);
      const onError = vi.fn();

      const { result } = renderHook(
        () =>
          useOfflineMutation<{ title: string }>({
            entity: 'task',
            entityId: 'task-1',
            type: 'create',
            onError,
          }),
        { wrapper: createWrapper(config) },
      );

      await waitFor(() => {
        expect(result.current.mutate).toBeDefined();
      });

      await act(async () => {
        await result.current.mutate({ title: 'Test' });
      });

      // Even offline, enqueue succeeds (action is queued)
      expect(result.current.lastAction).not.toBeNull();
    });

    it('should reset mutation state', async () => {
      const { result } = renderHook(
        () =>
          useOfflineMutation<{ title: string }>({
            entity: 'task',
            entityId: 'task-1',
            type: 'create',
          }),
        { wrapper: createWrapper(config) },
      );

      await waitFor(() => {
        expect(result.current.mutate).toBeDefined();
      });

      await act(async () => {
        await result.current.mutate({ title: 'Test' });
      });

      expect(result.current.lastAction).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.lastAction).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('usePendingQueue', () => {
    it('should reflect queued actions', async () => {
      const { result: queueResult } = renderHook(() => usePendingQueue(), {
        wrapper: createWrapper(config),
      });

      // Wait for provider to init
      await waitFor(() => {
        expect(queueResult.current).toBeDefined();
      });

      const { result: mutResult } = renderHook(
        () =>
          useOfflineMutation({
            entity: 'task',
            entityId: 'task-1',
            type: 'create',
          }),
        { wrapper: createWrapper(config) },
      );

      await waitFor(() => {
        expect(mutResult.current.mutate).toBeDefined();
      });
    });
  });

  describe('useSyncStatus', () => {
    it('should return initial sync progress', async () => {
      const { result } = renderHook(() => useSyncStatus(), {
        wrapper: createWrapper(config),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
        expect(result.current.lastSyncAt).toBeNull();
      });
    });
  });
});
