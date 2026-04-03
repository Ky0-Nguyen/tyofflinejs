import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { OfflineProvider, useEngine } from '../../src/react/offline-provider';
import type { OfflineConfig } from '../../src/core/types';
import { MemoryAdapter } from '../../src/adapters/storage/memory.adapter';
import { ControllableNetworkAdapter } from './mock-network';
import { MockBackend } from './mock-backend';
import { App } from './App';
import './app.css';

const network = new ControllableNetworkAdapter();
const backend = new MockBackend();
const storage = new MemoryAdapter();

(window as Window).__test__ = { network, backend } as Window['__test__'];

const config: OfflineConfig = {
  storage,
  network,
  syncExecutor: backend,
  syncInterval: 0,
  maxRetries: 3,
  conflictStrategy: 'last-write-wins',
  cooldownMs: 0,
};

function EngineExposer() {
  const engine = useEngine();
  useEffect(() => {
    window.__test__.engine = engine;
  }, [engine]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <OfflineProvider config={config}>
    <EngineExposer />
    <App network={network} backend={backend} />
  </OfflineProvider>,
);
