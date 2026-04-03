import type { INetworkAdapter } from '../../src/core/types';

export class ControllableNetworkAdapter implements INetworkAdapter {
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

  getStatus(): boolean {
    return this.online;
  }
}
