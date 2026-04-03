import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEngine } from '../../../src/react/offline-provider';
import { useSyncStatus } from '../../../src/react/use-sync-status';
import { colors, shared } from '../theme';
import type { MockBackend, FailMode } from '../mock-backend';

interface Props {
  backend: MockBackend;
}

const modeColors: Record<FailMode, string> = {
  none: colors.success,
  error: colors.error,
  conflict: colors.warning,
};

export function SyncPanel({ backend }: Props) {
  const engine = useEngine();
  const syncProgress = useSyncStatus();
  const [failMode, setFailMode] = useState<FailMode>('none');

  const handleSyncNow = useCallback(async () => {
    await engine.syncNow();
  }, [engine]);

  const cycleMode = useCallback(() => {
    const modes: FailMode[] = ['none', 'error', 'conflict'];
    const next = modes[(modes.indexOf(failMode) + 1) % modes.length]!;
    backend.setFailMode(next);
    setFailMode(next);
  }, [failMode, backend]);

  const lastSync = syncProgress.lastSyncAt
    ? new Date(syncProgress.lastSyncAt).toLocaleTimeString()
    : 'Never';

  return (
    <View style={shared.panel} testID="sync-panel">
      <Text style={shared.panelTitle}>Sync</Text>

      <View style={[shared.row, { marginBottom: 8 }]}>
        <Text style={{ color: colors.textMuted }}>Status: </Text>
        <Text testID="sync-status" style={{ color: colors.text, fontWeight: '600' }}>
          {syncProgress.status}
        </Text>
      </View>

      <View style={[shared.row, { marginBottom: 8 }]}>
        <Text style={{ color: colors.textMuted }}>Last sync: </Text>
        <Text testID="sync-last-time" style={{ color: colors.text }}>
          {lastSync}
        </Text>
      </View>

      <View style={[shared.row, { marginBottom: 10 }]}>
        <Text style={{ color: colors.textMuted }}>Backend: </Text>
        <TouchableOpacity
          testID="backend-mode-btn"
          style={[styles.modeBadge, { backgroundColor: modeColors[failMode] }]}
          onPress={cycleMode}
        >
          <Text testID="backend-mode" style={styles.modeText}>
            {failMode === 'none' ? 'normal' : failMode}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={shared.row}>
        <TouchableOpacity testID="sync-now-btn" style={shared.btn} onPress={handleSyncNow}>
          <Text style={shared.btnText}>Sync Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modeBadge: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
