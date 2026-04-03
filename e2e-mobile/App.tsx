import { useRef, useState, useEffect } from 'react';
import { SafeAreaView, ScrollView, Text, StyleSheet, StatusBar } from 'react-native';
import { OfflineProvider } from '../src/react/offline-provider';
import { MemoryAdapter } from '../src/adapters/storage/memory.adapter';
import type { OfflineConfig } from '../src/core/types';
import { ControllableNetworkAdapter } from './src/mock-network';
import { MockBackend } from './src/mock-backend';
import { NetworkPanel } from './src/panels/NetworkPanel';
import { EntityPanel } from './src/panels/EntityPanel';
import { QueuePanel } from './src/panels/QueuePanel';
import { SyncPanel } from './src/panels/SyncPanel';
import { DependencyPanel } from './src/panels/DependencyPanel';
import { colors } from './src/theme';

const network = new ControllableNetworkAdapter();
const backend = new MockBackend();
const storage = new MemoryAdapter();

const config: OfflineConfig = {
  storage,
  network,
  syncExecutor: backend,
  syncInterval: 0,
  maxRetries: 3,
  conflictStrategy: 'last-write-wins',
  cooldownMs: 0,
};

export default function App() {
  return (
    <OfflineProvider config={config}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.header}>Offline Module – Mobile E2E</Text>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          testID="dashboard-scroll"
        >
          <NetworkPanel network={network} />
          <EntityPanel />
          <QueuePanel />
          <SyncPanel backend={backend} />
          <DependencyPanel />
        </ScrollView>
      </SafeAreaView>
    </OfflineProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 40,
  },
});
