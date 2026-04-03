import type { PendingAction } from '../types';
import type { ActionNode } from './types';
import { CycleDetectedError } from './types';

export class DependencyGraph {
  private nodes = new Map<string, ActionNode>();

  buildGraph(actions: PendingAction[]): Map<string, ActionNode> {
    this.nodes.clear();

    for (const action of actions) {
      this.nodes.set(action.id, {
        action,
        children: new Set(),
        parents: new Set(),
        depth: -1,
      });
    }

    this.resolveExplicitDeps();
    this.resolveImplicitDeps(actions);
    this.detectCycles();

    return this.nodes;
  }

  /**
   * Wire edges from `dependsOn` arrays.
   */
  private resolveExplicitDeps(): void {
    for (const [id, node] of this.nodes) {
      const deps = node.action.dependsOn;
      if (!deps) continue;
      for (const parentId of deps) {
        const parentNode = this.nodes.get(parentId);
        if (!parentNode) continue;
        parentNode.children.add(id);
        node.parents.add(parentId);
      }
    }
  }

  /**
   * Infer dependencies from `parentTempId` -> matching `tempId`.
   * If action B has `parentTempId === "tmp-1"` and action A has
   * `tempId === "tmp-1"`, then B depends on A.
   */
  private resolveImplicitDeps(actions: PendingAction[]): void {
    const tempIdToActionId = new Map<string, string>();
    for (const action of actions) {
      if (action.tempId) {
        tempIdToActionId.set(action.tempId, action.id);
      }
    }

    for (const [id, node] of this.nodes) {
      const parentTempId = node.action.parentTempId;
      if (!parentTempId) continue;

      const parentActionId = tempIdToActionId.get(parentTempId);
      if (!parentActionId || parentActionId === id) continue;

      const parentNode = this.nodes.get(parentActionId);
      if (!parentNode) continue;

      if (!node.parents.has(parentActionId)) {
        parentNode.children.add(id);
        node.parents.add(parentActionId);
      }
    }
  }

  private detectCycles(): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (inStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        throw new CycleDetectedError([...path.slice(cycleStart), nodeId]);
      }
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const childId of node.children) {
          dfs(childId, [...path]);
        }
      }

      inStack.delete(nodeId);
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }
  }

  getNode(id: string): ActionNode | undefined {
    return this.nodes.get(id);
  }

  getDescendants(actionId: string): Set<string> {
    const descendants = new Set<string>();
    const queue = [actionId];

    while (queue.length > 0) {
      const current = queue.pop()!;
      const node = this.nodes.get(current);
      if (!node) continue;
      for (const childId of node.children) {
        if (!descendants.has(childId)) {
          descendants.add(childId);
          queue.push(childId);
        }
      }
    }

    return descendants;
  }
}
