import type { ControllableNetworkAdapter } from './mock-network';
import type { MockBackend } from './mock-backend';
import type { OfflineEngine } from '../../src/core/offline-engine';

declare global {
  interface Window {
    __test__: {
      network: ControllableNetworkAdapter;
      backend: MockBackend;
      engine: OfflineEngine;
    };
  }
}
