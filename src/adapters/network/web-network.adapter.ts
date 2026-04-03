import type { INetworkAdapter } from '../../core/types';
import { NetworkError } from '../../core/types';
import type { NetworkStatus, ConnectionType, EffectiveConnectionType } from '../../core/network-types';

interface NavigatorConnection {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export interface WebNetworkOptions {
  pingUrl?: string;
  debounceMs?: number;
}

export class WebNetworkAdapter implements INetworkAdapter {
  private listeners = new Set<(online: boolean) => void>();
  private readonly pingUrl?: string;
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WebNetworkOptions = {}) {
    if (typeof window === 'undefined') {
      throw new NetworkError('WebNetworkAdapter requires a browser environment');
    }
    this.pingUrl = options.pingUrl;
    this.debounceMs = options.debounceMs ?? 2000;
  }

  async isOnline(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.onLine) return false;

    if (this.pingUrl) {
      const { reachable } = await this.ping(this.pingUrl, 5000);
      return reachable;
    }

    return navigator.onLine;
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const isConnected = typeof navigator !== 'undefined' && navigator.onLine;
    const conn = (navigator as Navigator & { connection?: NavigatorConnection }).connection;

    const connectionType = this.mapConnectionType(conn?.type);
    const effectiveType = this.mapEffectiveType(conn?.effectiveType);

    return {
      isConnected,
      isInternetReachable: null,
      connectionType,
      effectiveType,
      downlinkMbps: conn?.downlink,
      rttMs: conn?.rtt,
    };
  }

  async ping(url: string, timeoutMs = 5000): Promise<{ reachable: boolean; latencyMs: number }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeout);
      return { reachable: true, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false, latencyMs: -1 };
    }
  }

  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);

    const handleOnline = () => this.debouncedNotify(true);
    const handleOffline = () => this.debouncedNotify(false);

    if (this.listeners.size === 1) {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }

  private debouncedNotify(online: boolean): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      for (const listener of this.listeners) {
        try {
          listener(online);
        } catch {
          // Listener errors must not propagate
        }
      }
    }, this.debounceMs);
  }

  private mapConnectionType(type?: string): ConnectionType {
    switch (type) {
      case 'wifi': return 'wifi';
      case 'cellular': return 'cellular';
      case 'ethernet': return 'ethernet';
      case 'bluetooth': return 'bluetooth';
      case 'none': return 'none';
      default: return 'unknown';
    }
  }

  private mapEffectiveType(type?: string): EffectiveConnectionType | undefined {
    switch (type) {
      case '4g': return '4g';
      case '3g': return '3g';
      case '2g': return '2g';
      case 'slow-2g': return 'slow-2g';
      default: return undefined;
    }
  }
}
