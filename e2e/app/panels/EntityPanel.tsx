import { useState, useCallback } from 'react';
import { useOfflineMutation } from '../../../src/react/use-offline-mutation';
import { useOfflineQuery } from '../../../src/react/use-offline-query';
import { useEngine } from '../../../src/react/offline-provider';

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
        t.id === (action.payload as Partial<Task>).id ? { ...t, ...(action.payload as object) } : t,
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
    <div className="panel" data-testid="entity-panel">
      <h2>Entities (Tasks)</h2>

      <div className="form-row">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="entity-title-input"
        />
        <input
          type="text"
          placeholder="Entity ID (for update/delete)"
          value={editId}
          onChange={(e) => setEditId(e.target.value)}
          data-testid="entity-id-input"
        />
      </div>

      <div className="button-row">
        <button onClick={handleCreate} data-testid="entity-create-btn">Create</button>
        <button onClick={handleUpdate} data-testid="entity-update-btn">Update</button>
        <button onClick={handleDelete} data-testid="entity-delete-btn">Delete</button>
      </div>

      <div className="entity-list" data-testid="entity-list">
        {tasks && tasks.length > 0 ? (
          <ul>
            {tasks.map((t) => (
              <li key={t.id} data-testid={`entity-item-${t.id}`}>
                <strong>{t.id}</strong>: {t.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No tasks yet</p>
        )}
      </div>
    </div>
  );
}
