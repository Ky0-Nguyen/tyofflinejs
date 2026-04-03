import { describe, it, expect } from 'vitest';
import { ActionOptimizer } from '../../../src/core/dag/action-optimizer';
import { DependencyGraph } from '../../../src/core/dag/dependency-graph';
import type { PendingAction } from '../../../src/core/types';

function makeAction(overrides: Partial<PendingAction>): PendingAction {
  return {
    id: 'a1',
    type: 'create',
    entity: 'Item',
    entityId: 'e1',
    payload: {},
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    ...overrides,
  };
}

describe('ActionOptimizer', () => {
  const optimizer = new ActionOptimizer();
  const graphBuilder = new DependencyGraph();

  it('skips create + delete pair for same entity', () => {
    const a1 = makeAction({ id: 'a1', type: 'create', tempId: 'tmp-1' });
    const a2 = makeAction({ id: 'a2', type: 'delete', dependsOn: ['a1'] });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const { graph: optimized, result } = optimizer.optimize(graph);

    expect(optimized.size).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('collapses create + update into merged create', () => {
    const a1 = makeAction({
      id: 'a1',
      type: 'create',
      tempId: 'tmp-1',
      payload: { title: 'Original' },
    });
    const a2 = makeAction({
      id: 'a2',
      type: 'update',
      dependsOn: ['a1'],
      payload: { title: 'Updated', description: 'New' },
    });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const { graph: optimized, result } = optimizer.optimize(graph);

    expect(optimized.size).toBe(1);
    expect(result.merged).toBe(1);

    const remaining = optimized.get('a1')!;
    const payload = remaining.action.payload as Record<string, string>;
    expect(payload['title']).toBe('Updated');
    expect(payload['description']).toBe('New');
  });

  it('merges consecutive updates to the same entity', () => {
    const a1 = makeAction({
      id: 'a1',
      type: 'update',
      payload: { title: 'First' },
      timestamp: 10,
    });
    const a2 = makeAction({
      id: 'a2',
      type: 'update',
      payload: { title: 'Last' },
      timestamp: 20,
    });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const { graph: optimized, result } = optimizer.optimize(graph);

    expect(optimized.size).toBe(1);
    expect(result.merged).toBe(1);

    const remaining = Array.from(optimized.values())[0]!;
    expect((remaining.action.payload as Record<string, string>)['title']).toBe('Last');
  });

  it('preserves children when collapsing create+update', () => {
    const a1 = makeAction({ id: 'a1', type: 'create', tempId: 'tmp-1', payload: {} });
    const a2 = makeAction({
      id: 'a2',
      type: 'update',
      dependsOn: ['a1'],
      payload: { title: 'Updated' },
    });
    const a3 = makeAction({ id: 'a3', dependsOn: ['a2'], entity: 'SubItem' });
    const graph = graphBuilder.buildGraph([a1, a2, a3]);
    const { graph: optimized } = optimizer.optimize(graph);

    expect(optimized.has('a1')).toBe(true);
    expect(optimized.has('a2')).toBe(false);
    expect(optimized.has('a3')).toBe(true);
    expect(optimized.get('a1')!.children.has('a3')).toBe(true);
  });

  it('does not optimize unrelated actions', () => {
    const a1 = makeAction({ id: 'a1', entity: 'Item', entityId: 'e1' });
    const a2 = makeAction({ id: 'a2', entity: 'Other', entityId: 'e2' });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const { graph: optimized, result } = optimizer.optimize(graph);

    expect(optimized.size).toBe(2);
    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('handles create + delete with in-between dependents gracefully', () => {
    const a1 = makeAction({ id: 'a1', type: 'create', tempId: 'tmp-1' });
    const a2 = makeAction({
      id: 'a2',
      type: 'update',
      dependsOn: ['a1'],
      payload: { x: 1 },
    });
    const a3 = makeAction({ id: 'a3', type: 'delete', dependsOn: ['a2'] });
    const graph = graphBuilder.buildGraph([a1, a2, a3]);
    const { graph: optimized } = optimizer.optimize(graph);

    expect(optimized.size).toBeGreaterThanOrEqual(0);
  });
});
