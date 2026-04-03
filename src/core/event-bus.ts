import type { OfflineEvents } from './types';

type EventKey = keyof OfflineEvents;
type EventCallback<K extends EventKey> = OfflineEvents[K] extends undefined
  ? () => void
  : (payload: OfflineEvents[K]) => void;

export class EventBus {
  private listeners = new Map<EventKey, Set<EventCallback<never>>>();

  on<K extends EventKey>(event: K, callback: EventCallback<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback as EventCallback<never>);

    return () => {
      set.delete(callback as EventCallback<never>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  off<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback as EventCallback<never>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends EventKey>(
    event: K,
    ...args: OfflineEvents[K] extends undefined ? [] : [OfflineEvents[K]]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of set) {
      try {
        (callback as (...a: unknown[]) => void)(...args);
      } catch {
        // Listener errors must not break the event loop
      }
    }
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: EventKey): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
