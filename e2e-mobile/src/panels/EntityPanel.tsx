import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useOfflineMutation } from '../../../src/react/use-offline-mutation';
import { useOfflineQuery } from '../../../src/react/use-offline-query';
import { useEngine } from '../../../src/react/offline-provider';
import { colors, shared } from '../theme';

interface Task {
  id: string;
  title: string;
}

export function EntityPanel() {
  const engine = useEngine();
  const [title, setTitle] = useState('');
  const [editId, setEditId] = useState('');
  const [counter, setCounter] = useState(1);

  const { data: tasks, refetch } = useOfflineQuery<Task[]>('tasks-list');

  const { mutate: createTask } = useOfflineMutation<Task>({
    entity: 'tasks',
    entityId: `task-${counter}`,
    type: 'create',
    onSuccess: async (action) => {
      const existing = (await engine.getData<Task[]>('tasks-list')) ?? [];
      await engine.setData('tasks-list', [...existing, action.payload as Task]);
      refetch();
    },
  });

  const { mutate: updateTask } = useOfflineMutation<Partial<Task>>({
    entity: 'tasks',
    entityId: editId || 'task-1',
    type: 'update',
    onSuccess: async (action) => {
      const existing = (await engine.getData<Task[]>('tasks-list')) ?? [];
      const updated = existing.map((t) =>
        t.id === (action.payload as Partial<Task>).id
          ? { ...t, ...(action.payload as object) }
          : t,
      );
      await engine.setData('tasks-list', updated);
      refetch();
    },
  });

  const { mutate: deleteTask } = useOfflineMutation<{ id: string }>({
    entity: 'tasks',
    entityId: editId || 'task-1',
    type: 'delete',
  });

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    const id = `task-${counter}`;
    await createTask({ id, title: title.trim() });
    setCounter((c) => c + 1);
    setTitle('');
  }, [title, counter, createTask]);

  const handleUpdate = useCallback(async () => {
    if (!editId.trim() || !title.trim()) return;
    await updateTask({ id: editId, title: title.trim() });
    setTitle('');
    setEditId('');
  }, [editId, title, updateTask]);

  const handleDelete = useCallback(async () => {
    if (!editId.trim()) return;
    await deleteTask({ id: editId });
    const existing = (await engine.getData<Task[]>('tasks-list')) ?? [];
    await engine.setData('tasks-list', existing.filter((t) => t.id !== editId));
    refetch();
    setEditId('');
  }, [editId, deleteTask, engine, refetch]);

  return (
    <View style={shared.panel} testID="entity-panel">
      <Text style={shared.panelTitle}>Entities (Tasks)</Text>

      <TextInput
        testID="entity-title-input"
        style={[shared.input, { marginBottom: 8 }]}
        placeholder="Task title"
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        testID="entity-id-input"
        style={[shared.input, { marginBottom: 10 }]}
        placeholder="Entity ID (for update/delete)"
        placeholderTextColor={colors.textMuted}
        value={editId}
        onChangeText={setEditId}
      />

      <View style={[shared.row, { marginBottom: 10 }]}>
        <TouchableOpacity testID="entity-create-btn" style={shared.btn} onPress={handleCreate}>
          <Text style={shared.btnText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="entity-update-btn" style={[shared.btn, { backgroundColor: colors.warning }]} onPress={handleUpdate}>
          <Text style={[shared.btnText, { color: '#000' }]}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="entity-delete-btn" style={[shared.btn, { backgroundColor: '#666' }]} onPress={handleDelete}>
          <Text style={shared.btnText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {tasks && tasks.length > 0 ? (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View testID={`entity-item-${item.id}`} style={styles.entityRow}>
              <Text style={shared.mono}>{item.id}</Text>
              <Text style={{ color: colors.text, marginLeft: 8 }}>{item.title}</Text>
            </View>
          )}
        />
      ) : (
        <Text style={shared.empty}>No tasks yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
});
