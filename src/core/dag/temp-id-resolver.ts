import type { PendingAction, IStorageAdapter } from '../types';
import { DAG_TEMPID_MAP_KEY } from '../types';
import type { TempIdMap } from './types';

export class TempIdResolver {
  private map: TempIdMap = new Map();

  constructor(private readonly storage?: IStorageAdapter) {}

  async load(): Promise<void> {
    if (!this.storage) return;
    const stored = await this.storage.get<[string, string][]>(DAG_TEMPID_MAP_KEY);
    if (stored) {
      this.map = new Map(stored);
    }
  }

  async persist(): Promise<void> {
    if (!this.storage) return;
    await this.storage.set(DAG_TEMPID_MAP_KEY, Array.from(this.map.entries()));
  }

  register(tempId: string, serverId: string): void {
    this.map.set(tempId, serverId);
  }

  resolve(tempId: string): string | undefined {
    return this.map.get(tempId);
  }

  getMap(): TempIdMap {
    return new Map(this.map);
  }

  /**
   * Deep-traverse the action payload and replace any string value
   * that matches a registered tempId with the corresponding serverId.
   * Also rewrites `entityId` if it matches a tempId.
   */
  resolveAction<T>(action: PendingAction<T>): PendingAction<T> {
    if (this.map.size === 0) return action;

    const resolved = { ...action };

    if (resolved.entityId && this.map.has(resolved.entityId)) {
      resolved.entityId = this.map.get(resolved.entityId)!;
    }

    resolved.payload = this.deepResolve(resolved.payload) as T;
    resolved.resolvedIds = Object.fromEntries(this.map);

    return resolved;
  }

  private deepResolve(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.map.get(value) ?? value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deepResolve(item));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.deepResolve(val);
      }
      return result;
    }

    return value;
  }

  clear(): void {
    this.map.clear();
  }
}
