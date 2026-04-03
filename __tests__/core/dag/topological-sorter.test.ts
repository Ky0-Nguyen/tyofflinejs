import { describe, it, expect } from 'vitest';
import { TopologicalSorter } from '../../../src/core/dag/topological-sorter';
import { DependencyGraph } from '../../../src/core/dag/dependency-graph';
import { CycleDetectedError } from '../../../src/core/dag/types';
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

describe('TopologicalSorter', () => {
  const sorter = new TopologicalSorter();
  const graphBuilder = new DependencyGraph();

  it('sorts independent actions into a single layer', () => {
    const a1 = makeAction({ id: 'a1', timestamp: 10 });
    const a2 = makeAction({ id: 'a2', timestamp: 20 });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const layers = sorter.sort(graph);

    expect(layers.length).toBe(1);
    expect(layers[0]!.actions.length).toBe(2);
    expect(layers[0]!.depth).toBe(0);
  });

  it('sorts a simple chain into sequential layers', () => {
    const a1 = makeAction({ id: 'a1', tempId: 'tmp-1' });
    const a2 = makeAction({ id: 'a2', parentTempId: 'tmp-1' });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const layers = sorter.sort(graph);

    expect(layers.length).toBe(2);
    expect(layers[0]!.actions[0]!.id).toBe('a1');
    expect(layers[1]!.actions[0]!.id).toBe('a2');
  });

  it('handles diamond dependency', () => {
    const a1 = makeAction({ id: 'a1' });
    const a2 = makeAction({ id: 'a2', dependsOn: ['a1'] });
    const a3 = makeAction({ id: 'a3', dependsOn: ['a1'] });
    const a4 = makeAction({ id: 'a4', dependsOn: ['a2', 'a3'] });
    const graph = graphBuilder.buildGraph([a1, a2, a3, a4]);
    const layers = sorter.sort(graph);

    expect(layers.length).toBe(3);
    expect(layers[0]!.actions.map((a) => a.id)).toEqual(['a1']);
    expect(layers[1]!.actions.map((a) => a.id).sort()).toEqual(['a2', 'a3']);
    expect(layers[2]!.actions.map((a) => a.id)).toEqual(['a4']);
  });

  it('handles parallel independent sub-chains', () => {
    const a1 = makeAction({ id: 'a1', timestamp: 1 });
    const a2 = makeAction({ id: 'a2', dependsOn: ['a1'], timestamp: 2 });
    const b1 = makeAction({ id: 'b1', timestamp: 3 });
    const b2 = makeAction({ id: 'b2', dependsOn: ['b1'], timestamp: 4 });
    const graph = graphBuilder.buildGraph([a1, a2, b1, b2]);
    const layers = sorter.sort(graph);

    expect(layers.length).toBe(2);
    expect(layers[0]!.actions.length).toBe(2);
    expect(layers[1]!.actions.length).toBe(2);
  });

  it('sorts actions within a layer by timestamp ascending', () => {
    const a1 = makeAction({ id: 'a1', timestamp: 200 });
    const a2 = makeAction({ id: 'a2', timestamp: 100 });
    const graph = graphBuilder.buildGraph([a1, a2]);
    const layers = sorter.sort(graph);

    expect(layers[0]!.actions[0]!.id).toBe('a2');
    expect(layers[0]!.actions[1]!.id).toBe('a1');
  });

  it('sets depth on ActionNodes', () => {
    const a1 = makeAction({ id: 'a1', tempId: 'tmp-1' });
    const a2 = makeAction({ id: 'a2', parentTempId: 'tmp-1' });
    const graph = graphBuilder.buildGraph([a1, a2]);
    sorter.sort(graph);

    expect(graph.get('a1')!.depth).toBe(0);
    expect(graph.get('a2')!.depth).toBe(1);
  });
});
