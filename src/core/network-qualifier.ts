import type { INetworkAdapter } from './types';
import type {
  NetworkStatus,
  SyncConditions,
  SyncReadiness,
  NetworkQualifierConfig,
} from './network-types';
import {
  DEFAULT_PING_TIMEOUT_MS,
  DEFAULT_REACHABILITY_CACHE_MS,
} from './network-types';
import { EventBus } from './event-bus';

export class NetworkQualifier {
  private readonly pingUrl?: string;
  private readonly pingTimeoutMs: number;
  private readonly cacheMs: number;
  private readonly conditions?: SyncConditions;

  private cachedReadiness: SyncReadiness | null = null;
  private lastCheck = 0;

  constructor(
    private readonly network: INetworkAdapter,
    private readonly eventBus: EventBus,
    config: NetworkQualifierConfig = {},
  ) {
    this.pingUrl = config.pingUrl;
    this.pingTimeoutMs = config.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS;
    this.cacheMs = config.reachabilityCache ?? DEFAULT_REACHABILITY_CACHE_MS;
    this.conditions = config.syncConditions;
  }

  async evaluate(forceRefresh = false): Promise<SyncReadiness> {
    if (!forceRefresh && this.cachedReadiness && Date.now() - this.lastCheck < this.cacheMs) {
      return this.cachedReadiness;
    }

    const status = await this.getNetworkStatus();
    const reasons: string[] = [];
    let canSync = true;

    if (!status.isConnected) {
      canSync = false;
      reasons.push('Device is offline');
    }

    if (canSync && this.pingUrl) {
      const reachability = await this.checkReachability(status);
      status.isInternetReachable = reachability;
      if (!reachability) {
        canSync = false;
        reasons.push(`Backend unreachable (${this.pingUrl})`);
      }
    }

    if (canSync && this.conditions) {
      const conditionResult = await this.evaluateConditions(status, reasons);
      if (!conditionResult) canSync = false;
    }

    const readiness: SyncReadiness = {
      canSync,
      reasons,
      networkStatus: status,
      checkedAt: Date.now(),
    };

    const changed = this.cachedReadiness?.canSync !== canSync;
    this.cachedReadiness = readiness;
    this.lastCheck = Date.now();

    if (changed) {
      this.eventBus.emit('network:readiness-changed', readiness);
    }

    return readiness;
  }

  private async getNetworkStatus(): Promise<NetworkStatus> {
    if (this.network.getNetworkStatus) {
      return this.network.getNetworkStatus();
    }

    const isConnected = await this.network.isOnline();
    return {
      isConnected,
      isInternetReachable: null,
      connectionType: 'unknown',
    };
  }

  private async checkReachability(status: NetworkStatus): Promise<boolean> {
    if (!this.pingUrl) return status.isConnected;

    if (this.network.ping) {
      const result = await this.network.ping(this.pingUrl, this.pingTimeoutMs);
      if (result.latencyMs > 0) {
        status.rttMs = result.latencyMs;
      }
      return result.reachable;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.pingTimeoutMs);
      const start = Date.now();
      await fetch(this.pingUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      status.rttMs = Date.now() - start;
      return true;
    } catch {
      return false;
    }
  }

  private async evaluateConditions(
    status: NetworkStatus,
    reasons: string[],
  ): Promise<boolean> {
    const c = this.conditions;
    if (!c) return true;

    if (c.requireWifi && status.connectionType !== 'wifi') {
      reasons.push(`Requires WiFi, current: ${status.connectionType}`);
      return false;
    }

    if (c.requireReachability && status.isInternetReachable === false) {
      reasons.push('Requires confirmed internet reachability');
      return false;
    }

    if (c.minDownlinkMbps && status.downlinkMbps !== undefined) {
      if (status.downlinkMbps < c.minDownlinkMbps) {
        reasons.push(
          `Downlink ${status.downlinkMbps}Mbps < required ${c.minDownlinkMbps}Mbps`,
        );
        return false;
      }
    }

    if (c.maxRttMs && status.rttMs !== undefined) {
      if (status.rttMs > c.maxRttMs) {
        reasons.push(`RTT ${status.rttMs}ms > max ${c.maxRttMs}ms`);
        return false;
      }
    }

    if (c.custom) {
      const customResult = await c.custom(status);
      if (!customResult) {
        reasons.push('Custom sync condition not met');
        return false;
      }
    }

    return true;
  }

  getLastReadiness(): SyncReadiness | null {
    return this.cachedReadiness;
  }

  invalidateCache(): void {
    this.cachedReadiness = null;
    this.lastCheck = 0;
  }
}
