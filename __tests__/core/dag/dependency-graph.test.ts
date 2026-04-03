import { describe, it, expect } from 'vitest';
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

describe('DependencyGraph', () => {
  it('builds a graph with no dependencies', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1' });
    const a2 = makeAction({ id: 'a2', type: 'update' });

    const nodes = graph.buildGraph([a1, a2]);

    expect(nodes.size).toBe(2);
    expect(nodes.get('a1')!.parents.size).toBe(0);
    expect(nodes.get('a1')!.children.size).toBe(0);
  });

  it('wires explicit dependsOn edges', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1' });
    const a2 = makeAction({ id: 'a2', type: 'update', dependsOn: ['a1'] });

    const nodes = graph.buildGraph([a1, a2]);

    expect(nodes.get('a1')!.children.has('a2')).toBe(true);
    expect(nodes.get('a2')!.parents.has('a1')).toBe(true);
  });

  it('infers implicit deps from parentTempId -> tempId', () => {
    const graph = new DependencyGraph();
    const parent = makeAction({ id: 'a1', tempId: 'tmp-item-1' });
    const child = makeAction({
      id: 'a2',
      entity: 'SubItem',
      parentTempId: 'tmp-item-1',
    });

    const nodes = graph.buildGraph([parent, child]);

    expect(nodes.get('a1')!.children.has('a2')).toBe(true);
    expect(nodes.get('a2')!.parents.has('a1')).toBe(true);
  });

  it('combines explicit and implicit deps without duplicates', () => {
    const graph = new DependencyGraph();
    const parent = makeAction({ id: 'a1', tempId: 'tmp-1' });
    const child = makeAction({
      id: 'a2',
      dependsOn: ['a1'],
      parentTempId: 'tmp-1',
    });

    const nodes = graph.buildGraph([parent, child]);

    expect(nodes.get('a1')!.children.size).toBe(1);
    expect(nodes.get('a2')!.parents.size).toBe(1);
  });

  it('throws CycleDetectedError on circular dependencies', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1', dependsOn: ['a2'] });
    const a2 = makeAction({ id: 'a2', dependsOn: ['a1'] });

    expect(() => graph.buildGraph([a1, a2])).toThrow(CycleDetectedError);
  });

  it('ignores dependsOn referencing non-existent actions', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1', dependsOn: ['nonexistent'] });

    const nodes = graph.buildGraph([a1]);
    expect(nodes.get('a1')!.parents.size).toBe(0);
  });

  it('builds a deep chain (Item -> SubItem -> SubSubItem)', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1', tempId: 'tmp-item' });
    const a2 = makeAction({
      id: 'a2',
      entity: 'SubItem',
      tempId: 'tmp-sub',
      parentTempId: 'tmp-item',
    });
    const a3 = makeAction({
      id: 'a3',
      entity: 'SubSubItem',
      parentTempId: 'tmp-sub',
    });

    const nodes = graph.buildGraph([a1, a2, a3]);

    expect(nodes.get('a1')!.children.has('a2')).toBe(true);
    expect(nodes.get('a2')!.children.has('a3')).toBe(true);
    expect(nodes.get('a3')!.parents.has('a2')).toBe(true);
  });

  it('getDescendants returns all transitive children', () => {
    const graph = new DependencyGraph();
    const a1 = makeAction({ id: 'a1', tempId: 'tmp-1' });
    const a2 = makeAction({ id: 'a2', parentTempId: 'tmp-1', tempId: 'tmp-2' });
    const a3 = makeAction({ id: 'a3', parentTempId: 'tmp-2' });

    graph.buildGraph([a1, a2, a3]);

    const descendants = graph.getDescendants('a1');
    expect(descendants.has('a2')).toBe(true);
    expect(descendants.has('a3')).toBe(true);
    expect(descendants.size).toBe(2);
  });
});
