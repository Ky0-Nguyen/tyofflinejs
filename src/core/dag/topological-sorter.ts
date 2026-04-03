import type { ActionNode, ExecutionLayer } from './types';
import { CycleDetectedError } from './types';

/**
 * Kahn's algorithm producing ExecutionLayer[] where each layer
 * contains actions whose dependencies are all in earlier layers.
 */
export class TopologicalSorter {
  sort(graph: Map<string, ActionNode>): ExecutionLayer[] {
    const inDegree = new Map<string, number>();
    for (const [id, node] of graph) {
      inDegree.set(id, node.parents.size);
    }

    const layers: ExecutionLayer[] = [];
    const remaining = new Set(graph.keys());

    while (remaining.size > 0) {
      const currentLayer: string[] = [];

      for (const id of remaining) {
        if ((inDegree.get(id) ?? 0) === 0) {
          currentLayer.push(id);
        }
      }

      if (currentLayer.length === 0) {
        throw new CycleDetectedError(Array.from(remaining));
      }

      const depth = layers.length;
      const actions = currentLayer.map((id) => {
        const node = graph.get(id)!;
        node.depth = depth;
        return node.action;
      });

      actions.sort((a, b) => a.timestamp - b.timestamp);
      layers.push({ depth, actions });

      for (const id of currentLayer) {
        remaining.delete(id);
        const node = graph.get(id)!;
        for (const childId of node.children) {
          inDegree.set(childId, (inDegree.get(childId) ?? 1) - 1);
        }
      }
    }

    return layers;
  }
}
