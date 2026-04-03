// ─── Connection Quality ─────────────────────────────────────────────────────

export type ConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'bluetooth'
  | 'vpn'
  | 'none'
  | 'unknown';

export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: ConnectionType;
  effectiveType?: EffectiveConnectionType;
  downlinkMbps?: number;
  rttMs?: number;
}

// ─── Sync Readiness ─────────────────────────────────────────────────────────

export interface SyncReadiness {
  canSync: boolean;
  reasons: string[];
  networkStatus: NetworkStatus;
  checkedAt: number;
}

// ─── Sync Conditions (user-configurable) ────────────────────────────────────

export interface SyncConditions {
  requireWifi?: boolean;
  minDownlinkMbps?: number;
  maxRttMs?: number;
  requireReachability?: boolean;
  custom?: (status: NetworkStatus) => boolean | Promise<boolean>;
}

// ─── Enhanced Network Adapter ───────────────────────────────────────────────

export interface INetworkAdapterEnhanced {
  isOnline(): Promise<boolean>;
  subscribe(callback: (online: boolean) => void): () => void;
  getNetworkStatus?(): Promise<NetworkStatus>;
  ping?(url: string, timeoutMs?: number): Promise<{ reachable: boolean; latencyMs: number }>;
}

// ─── Network Qualifier Config ───────────────────────────────────────────────

export interface NetworkQualifierConfig {
  pingUrl?: string;
  pingTimeoutMs?: number;
  pingIntervalMs?: number;
  reachabilityCache?: number;
  syncConditions?: SyncConditions;
}

export const DEFAULT_PING_TIMEOUT_MS = 5_000;
export const DEFAULT_REACHABILITY_CACHE_MS = 10_000;
