import type { INetworkAdapter, OfflineConfig, SyncExecutor, Result } from '../src/core/types';
import { MemoryAdapter } from '../src/adapters/storage/memory.adapter';
import { OfflineEngine } from '../src/core/offline-engine';

export class MockNetworkAdapter implements INetworkAdapter {
  private online = true;
  private listeners = new Set<(online: boolean) => void>();

  setOnline(value: boolean): void {
    this.online = value;
    for (const listener of this.listeners) {
      listener(value);
    }
  }

  async isOnline(): Promise<boolean> {
    return this.online;
  }

  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export class MockSyncExecutor implements SyncExecutor {
  public calls: unknown[] = [];
  public shouldFail = false;
  public failWithConflict = false;
  public customHandler: ((action: unknown) => Result<unknown>) | null = null;

  async execute<T>(action: T): Promise<Result<unknown>> {
    this.calls.push(action);

    if (this.customHandler) {
      return this.customHandler(action);
    }

    if (this.failWithConflict) {
      const error = Object.assign(new Error('Conflict'), {
        statusCode: 409,
        remote: { id: 'remote-1', timestamp: Date.now() },
      });
      return { ok: false, error };
    }

    if (this.shouldFail) {
      return { ok: false, error: new Error('Sync failed') };
    }

    return { ok: true, value: { success: true } };
  }

  reset(): void {
    this.calls = [];
    this.shouldFail = false;
    this.failWithConflict = false;
    this.customHandler = null;
  }
}

export function createTestEngine(overrides: Partial<OfflineConfig> = {}): {
  engine: OfflineEngine;
  storage: MemoryAdapter;
  network: MockNetworkAdapter;
  executor: MockSyncExecutor;
} {
  const storage = new MemoryAdapter();
  const network = new MockNetworkAdapter();
  const executor = new MockSyncExecutor();

  const engine = new OfflineEngine({
    storage,
    network,
    syncExecutor: executor,
    syncInterval: 0,
    cooldownMs: 0,
    networkStabilizationMs: 0,
    executionTimeoutMs: 30_000,
    ...overrides,
  });

  return { engine, storage, network, executor };
}
