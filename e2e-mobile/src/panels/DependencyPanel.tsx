import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useEngine } from '../../../src/react/offline-provider';
import { colors, shared } from '../theme';

interface DagResult {
  completed: number;
  failed: number;
  blocked: number;
  mappings: Array<[string, string]>;
}

export function DependencyPanel() {
  const engine = useEngine();
  const [result, setResult] = useState<DagResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, msg]);
  }, []);

  const handleCreateChain = useCallback(async () => {
    setResult(null);
    setLog([]);
    addLog('Enqueueing Item (tmp-item-1)...');

    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'Item',
      entityId: 'tmp-item-1',
      payload: { name: 'Test Item' },
      tempId: 'tmp-item-1',
    });

    const createAction = engine.getPendingActions().find((a) => a.tempId === 'tmp-item-1');

    addLog('Enqueueing Update Item...');
    await engine.enqueueWithDeps({
      type: 'update',
      entity: 'Item',
      entityId: 'tmp-item-1',
      payload: { name: 'Updated Item' },
      dependsOn: createAction ? [createAction.id] : [],
    });

    addLog('Enqueueing SubItem (tmp-sub-1)...');
    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'SubItem',
      entityId: 'tmp-sub-1',
      payload: { itemId: 'tmp-item-1', name: 'Sub 1' },
      tempId: 'tmp-sub-1',
      parentTempId: 'tmp-item-1',
    });

    addLog('Enqueueing SubSubItem (tmp-subsub-1)...');
    await engine.enqueueWithDeps({
      type: 'create',
      entity: 'SubSubItem',
      entityId: 'tmp-subsub-1',
      payload: { subItemId: 'tmp-sub-1', name: 'SubSub 1' },
      tempId: 'tmp-subsub-1',
      parentTempId: 'tmp-sub-1',
    });

    addLog(`Enqueued ${engine.getPendingActions().length} actions`);
  }, [engine, addLog]);

  const handleSyncDag = useCallback(async () => {
    addLog('Starting DAG sync...');
    try {
      await engine.syncWithDeps();
      const actions = engine.getPendingActions();
      const mappings = engine.executionEngine.getResolver().getMap();

      const dagResult: DagResult = {
        completed: actions.filter((a) => a.status === 'completed').length,
        failed: actions.filter((a) => a.status === 'failed').length,
        blocked: actions.filter((a) => a.status === 'blocked').length,
        mappings: Array.from(mappings.entries()),
      };

      addLog(`Sync done. Remaining: ${actions.length}`);
      addLog(`Mappings: ${dagResult.mappings.length}`);
      for (const [tempId, serverId] of dagResult.mappings) {
        addLog(`  ${tempId} → ${serverId}`);
      }
      setResult(dagResult);
    } catch (e) {
      addLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [engine, addLog]);

  const handleClear = useCallback(() => {
    setResult(null);
    setLog([]);
  }, []);

  return (
    <View style={shared.panel} testID="dag-panel">
      <Text style={shared.panelTitle}>DAG Execution Engine</Text>

      <View style={[shared.row, { marginBottom: 10, flexWrap: 'wrap', gap: 6 }]}>
        <TouchableOpacity testID="dag-create-chain-btn" style={shared.btn} onPress={handleCreateChain}>
          <Text style={shared.btnText}>Create Chain</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="dag-sync-btn" style={[shared.btn, { backgroundColor: colors.success }]} onPress={handleSyncDag}>
          <Text style={shared.btnText}>DAG Sync</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="dag-clear-btn" style={[shared.btn, { backgroundColor: '#666' }]} onPress={handleClear}>
          <Text style={shared.btnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {result && (
        <View testID="dag-result" style={styles.resultBox}>
          <Text testID="dag-failed" style={{ color: colors.error, fontSize: 13 }}>
            Failed: {result.failed}
          </Text>
          <Text testID="dag-blocked" style={{ color: colors.blocked, fontSize: 13 }}>
            Blocked: {result.blocked}
          </Text>
          {result.mappings.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                Temp ID Mappings:
              </Text>
              {result.mappings.map(([tempId, serverId]) => (
                <Text testID={`dag-mapping-${tempId}`} key={tempId} style={shared.mono}>
                  {tempId} → {serverId}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, marginBottom: 4 }}>
        Log:
      </Text>
      {log.length === 0 ? (
        <Text testID="dag-log-empty" style={shared.empty}>No activity</Text>
      ) : (
        <FlatList
          data={log}
          keyExtractor={(_, i) => String(i)}
          style={{ maxHeight: 160 }}
          renderItem={({ item }) => (
            <Text testID="dag-log-entry" style={[shared.mono, { paddingVertical: 1 }]}>
              {item}
            </Text>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  resultBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 10,
  },
});
