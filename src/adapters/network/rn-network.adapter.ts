import type { INetworkAdapter } from '../../core/types';
import { NetworkError } from '../../core/types';
import type { NetworkStatus, ConnectionType } from '../../core/network-types';

interface NetInfoState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type?: string;
  details?: { cellularGeneration?: string } | null;
}

interface NetInfoModule {
  fetch(): Promise<NetInfoState>;
  addEventListener(listener: (state: NetInfoState) => void): () => void;
}

export interface RNNetworkOptions {
  debounceMs?: number;
}

export class RNNetworkAdapter implements INetworkAdapter {
  private readonly netInfo: NetInfoModule;
  private readonly debounceMs: number;
  private listeners = new Set<(online: boolean) => void>();
  private netInfoUnsubscribe: (() => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReportedState: boolean | null = null;

  constructor(netInfo: NetInfoModule, options: RNNetworkOptions = {}) {
    if (!netInfo) {
      throw new NetworkError(
        'RNNetworkAdapter requires @react-native-community/netinfo to be passed in',
      );
    }
    this.netInfo = netInfo;
    this.debounceMs = options.debounceMs ?? 2000;
  }

  async isOnline(): Promise<boolean> {
    const state = await this.netInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const state = await this.netInfo.fetch();
    return {
      isConnected: state.isConnected === true,
      isInternetReachable: state.isInternetReachable,
      connectionType: this.mapConnectionType(state.type),
      effectiveType: this.mapCellularGeneration(state.details?.cellularGeneration),
    };
  }

  async ping(url: string, timeoutMs = 5000): Promise<{ reachable: boolean; latencyMs: number }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      return { reachable: true, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false, latencyMs: -1 };
    }
  }

  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);

    if (this.listeners.size === 1) {
      this.netInfoUnsubscribe = this.netInfo.addEventListener((state) => {
        const online = state.isConnected === true && state.isInternetReachable !== false;
        this.debouncedNotify(online);
      });
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.netInfoUnsubscribe) {
        this.netInfoUnsubscribe();
        this.netInfoUnsubscribe = null;
        this.lastReportedState = null;
      }
    };
  }

  private debouncedNotify(online: boolean): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (online === this.lastReportedState) return;
      this.lastReportedState = online;
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
      case 'vpn': return 'vpn';
      case 'none': return 'none';
      default: return 'unknown';
    }
  }

  private mapCellularGeneration(gen?: string) {
    switch (gen) {
      case '4g': return '4g' as const;
      case '3g': return '3g' as const;
      case '2g': return '2g' as const;
      default: return undefined;
    }
  }
}
