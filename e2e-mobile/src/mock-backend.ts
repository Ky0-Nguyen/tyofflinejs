import type { SyncExecutor, PendingAction, Result } from '../../src/core/types';

export type FailMode = 'none' | 'error' | 'conflict';

export class MockBackend implements SyncExecutor {
  private store = new Map<string, unknown>();
  private failMode: FailMode = 'none';
  private latencyMs = 50;
  private serverIdCounter = 0;
  public syncLog: Array<{ action: PendingAction; result: 'ok' | 'error' | 'conflict'; ts: number }> = [];
  public tempIdMap = new Map<string, string>();

  setFailMode(mode: FailMode): void {
    this.failMode = mode;
  }

  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  getFailMode(): FailMode {
    return this.failMode;
  }

  getStore(): Map<string, unknown> {
    return new Map(this.store);
  }

  clearLog(): void {
    this.syncLog = [];
  }

  async execute<T>(action: PendingAction<T>): Promise<Result<unknown>> {
    if (this.latencyMs > 0) {
      await new Promise<void>((r) => setTimeout(r, this.latencyMs));
    }

    if (this.failMode === 'error') {
      this.syncLog.push({ action: action as PendingAction, result: 'error', ts: Date.now() });
      return { ok: false, error: new Error('Mock backend error') };
    }

    if (this.failMode === 'conflict') {
      const conflictError = Object.assign(new Error('Conflict'), {
        statusCode: 409,
        remote: { id: action.entityId, title: 'Server version', timestamp: Date.now() },
      });
      this.syncLog.push({ action: action as PendingAction, result: 'conflict', ts: Date.now() });
      return { ok: false, error: conflictError };
    }

    const key = `${action.entity}:${action.entityId}`;
    switch (action.type) {
      case 'create': {
        this.serverIdCounter += 1;
        const serverId = `srv-${action.entity.toLowerCase()}-${this.serverIdCounter}`;
        this.store.set(key, action.payload);
        if (action.tempId) {
          this.tempIdMap.set(action.tempId, serverId);
        }
        this.syncLog.push({ action: action as PendingAction, result: 'ok', ts: Date.now() });
        return { ok: true, value: { id: serverId, ...(action.payload as object) } };
      }
      case 'update':
        this.store.set(key, action.payload);
        break;
      case 'delete':
        this.store.delete(key);
        break;
    }

    this.syncLog.push({ action: action as PendingAction, result: 'ok', ts: Date.now() });
    return { ok: true, value: { id: action.entityId, ...(action.payload as object) } };
  }
}
