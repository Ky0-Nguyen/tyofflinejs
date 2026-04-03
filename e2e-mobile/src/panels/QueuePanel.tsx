import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { usePendingQueue } from '../../../src/react/use-pending-queue';
import { colors, shared } from '../theme';

const statusColor: Record<string, string> = {
  pending: colors.warning,
  in_progress: colors.accent,
  failed: colors.error,
  completed: colors.success,
  blocked: colors.blocked,
};

export function QueuePanel() {
  const { actions, pendingCount, failedCount, clearQueue, retryFailed } = usePendingQueue();

  return (
    <View style={shared.panel} testID="queue-panel">
      <View style={shared.row}>
        <Text style={shared.panelTitle}>Pending Queue</Text>
        <View style={shared.badge}>
          <Text testID="queue-badge" style={shared.badgeText}>{pendingCount}</Text>
        </View>
      </View>

      <View style={[shared.row, { marginBottom: 10 }]}>
        <TouchableOpacity testID="queue-clear-btn" style={shared.btn} onPress={clearQueue}>
          <Text style={shared.btnText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="queue-retry-btn"
          style={[shared.btn, { backgroundColor: colors.warning }]}
          onPress={retryFailed}
        >
          <Text style={[shared.btnText, { color: '#000' }]}>Retry ({failedCount})</Text>
        </TouchableOpacity>
      </View>

      {actions.length === 0 ? (
        <Text testID="queue-empty" style={shared.empty}>Queue is empty</Text>
      ) : (
        <FlatList
          data={actions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View testID={`queue-row-${item.id}`} style={styles.row}>
              <Text style={[shared.mono, { width: 64 }]}>{item.id.slice(0, 8)}</Text>
              <View style={[styles.typeBadge, { backgroundColor: item.type === 'create' ? colors.success : item.type === 'delete' ? colors.error : colors.warning }]}>
                <Text style={styles.typeBadgeText}>{item.type}</Text>
              </View>
              <Text style={styles.entity}>{item.entity}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor[item.status] ?? colors.textMuted }]}>
                <Text testID={`queue-status-${item.id}`} style={styles.statusText}>{item.status}</Text>
              </View>
              <Text testID={`queue-retry-${item.id}`} style={shared.mono}>
                {item.retryCount}/{item.maxRetries}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  entity: {
    color: colors.text,
    fontSize: 12,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
