import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { OfflineEngine } from '../core/offline-engine';
import type { OfflineConfig } from '../core/types';

const OfflineContext = createContext<OfflineEngine | null>(null);

export function useEngine(): OfflineEngine {
  const engine = useContext(OfflineContext);
  if (!engine) {
    throw new Error(
      'useEngine must be used within <OfflineProvider>. Wrap your app in <OfflineProvider config={...}>.',
    );
  }
  return engine;
}

export interface OfflineProviderProps {
  config: OfflineConfig;
  children: ReactNode;
}

export function OfflineProvider({ config, children }: OfflineProviderProps) {
  const engineRef = useRef<OfflineEngine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const engine = new OfflineEngine(config);
    engineRef.current = engine;

    engine.init().then(() => {
      setReady(true);
    });

    return () => {
      void engine.destroy();
      engineRef.current = null;
      setReady(false);
    };
    // Engine should only be created once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !engineRef.current) return null;

  return (
    <OfflineContext.Provider value={engineRef.current}>
      {children}
    </OfflineContext.Provider>
  );
}
