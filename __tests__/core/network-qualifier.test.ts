import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkQualifier } from '../../src/core/network-qualifier';
import { EventBus } from '../../src/core/event-bus';
import type { INetworkAdapter } from '../../src/core/types';
import type { NetworkStatus, SyncReadiness } from '../../src/core/network-types';

function createMockNetwork(overrides: Partial<INetworkAdapter> = {}): INetworkAdapter {
  return {
    isOnline: vi.fn().mockResolvedValue(true),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('NetworkQualifier', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('returns canSync:true when network is online (basic adapter)', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus);
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.networkStatus.isConnected).toBe(true);
  });

  it('returns canSync:false when device is offline', async () => {
    const network = createMockNetwork({ isOnline: vi.fn().mockResolvedValue(false) });
    const qualifier = new NetworkQualifier(network, eventBus);
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons).toContain('Device is offline');
  });

  it('uses getNetworkStatus() when available', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'wifi',
      downlinkMbps: 50,
      rttMs: 20,
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
    });
    const qualifier = new NetworkQualifier(network, eventBus);
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
    expect(result.networkStatus.connectionType).toBe('wifi');
    expect(result.networkStatus.downlinkMbps).toBe(50);
  });

  it('checks backend reachability via adapter ping()', async () => {
    const network = createMockNetwork({
      ping: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 42 }),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      pingUrl: 'https://api.example.com/health',
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
    expect(network.ping).toHaveBeenCalledWith('https://api.example.com/health', 5000);
    expect(result.networkStatus.rttMs).toBe(42);
  });

  it('returns canSync:false when ping fails', async () => {
    const network = createMockNetwork({
      ping: vi.fn().mockResolvedValue({ reachable: false, latencyMs: -1 }),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      pingUrl: 'https://api.example.com/health',
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons[0]).toContain('Backend unreachable');
  });

  it('enforces requireWifi condition', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'cellular',
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: { requireWifi: true },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons[0]).toContain('Requires WiFi');
  });

  it('allows sync when on wifi and requireWifi is true', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'wifi',
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: { requireWifi: true },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
  });

  it('enforces minDownlinkMbps condition', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'cellular',
      downlinkMbps: 0.5,
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: { minDownlinkMbps: 1.0 },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons[0]).toContain('Downlink 0.5Mbps');
  });

  it('enforces maxRttMs condition', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'wifi',
      rttMs: 3000,
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: { maxRttMs: 1000 },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons[0]).toContain('RTT 3000ms > max 1000ms');
  });

  it('supports custom sync condition function', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: {
        custom: (_status) => false,
      },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(false);
    expect(result.reasons).toContain('Custom sync condition not met');
  });

  it('supports async custom sync condition', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      syncConditions: {
        custom: async (_status) => {
          await new Promise<void>((r) => setTimeout(r, 10));
          return true;
        },
      },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
  });

  it('caches readiness within reachabilityCache window', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      reachabilityCache: 60_000,
    });

    await qualifier.evaluate();
    await qualifier.evaluate();
    await qualifier.evaluate();

    expect(network.isOnline).toHaveBeenCalledTimes(1);
  });

  it('invalidateCache forces re-evaluation', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      reachabilityCache: 60_000,
    });

    await qualifier.evaluate();
    qualifier.invalidateCache();
    await qualifier.evaluate();

    expect(network.isOnline).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh bypasses cache', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      reachabilityCache: 60_000,
    });

    await qualifier.evaluate();
    await qualifier.evaluate(true);

    expect(network.isOnline).toHaveBeenCalledTimes(2);
  });

  it('emits network:readiness-changed on state transitions', async () => {
    const spy = vi.fn();
    eventBus.on('network:readiness-changed', spy);

    const isOnlineFn = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const network = createMockNetwork({ isOnline: isOnlineFn });
    const qualifier = new NetworkQualifier(network, eventBus, {
      reachabilityCache: 0,
    });

    await qualifier.evaluate();
    expect(spy).toHaveBeenCalledTimes(1);

    await qualifier.evaluate(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![0].canSync).toBe(false);
  });

  it('does not emit event when readiness stays the same', async () => {
    const spy = vi.fn();
    eventBus.on('network:readiness-changed', spy);

    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus, {
      reachabilityCache: 0,
    });

    await qualifier.evaluate();
    await qualifier.evaluate(true);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('getLastReadiness returns null before first evaluate', () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus);
    expect(qualifier.getLastReadiness()).toBeNull();
  });

  it('getLastReadiness returns cached result after evaluate', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus);
    const result = await qualifier.evaluate();

    expect(qualifier.getLastReadiness()).toEqual(result);
  });

  it('evaluates multiple conditions - all must pass', async () => {
    const status: NetworkStatus = {
      isConnected: true,
      isInternetReachable: true,
      connectionType: 'wifi',
      downlinkMbps: 10,
      rttMs: 50,
    };
    const network = createMockNetwork({
      getNetworkStatus: vi.fn().mockResolvedValue(status),
      ping: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 50 }),
    });
    const qualifier = new NetworkQualifier(network, eventBus, {
      pingUrl: 'https://api.example.com/health',
      syncConditions: {
        requireWifi: true,
        minDownlinkMbps: 5,
        maxRttMs: 100,
      },
    });
    const result = await qualifier.evaluate();

    expect(result.canSync).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('includes checkedAt timestamp in readiness', async () => {
    const network = createMockNetwork();
    const qualifier = new NetworkQualifier(network, eventBus);
    const before = Date.now();
    const result = await qualifier.evaluate();
    const after = Date.now();

    expect(result.checkedAt).toBeGreaterThanOrEqual(before);
    expect(result.checkedAt).toBeLessThanOrEqual(after);
  });
});
