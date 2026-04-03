import type { PendingAction } from '../types';
import type { ActionNode, OptimizationResult } from './types';

export class ActionOptimizer {
  optimize(
    graph: Map<string, ActionNode>,
  ): { graph: Map<string, ActionNode>; result: OptimizationResult } {
    const result: OptimizationResult = { merged: 0, skipped: 0, details: [] };

    this.skipCreateThenDelete(graph, result);
    this.collapseCreateThenUpdate(graph, result);
    this.mergeConsecutiveUpdates(graph, result);

    return { graph, result };
  }

  /**
   * If a create and delete target the same entity+entityId
   * and the delete depends on the create, remove both.
   */
  private skipCreateThenDelete(
    graph: Map<string, ActionNode>,
    result: OptimizationResult,
  ): void {
    const toRemove = new Set<string>();

    for (const [id, node] of graph) {
      if (node.action.type !== 'delete') continue;

      for (const parentId of node.parents) {
        const parent = graph.get(parentId);
        if (
          parent &&
          parent.action.type === 'create' &&
          parent.action.entity === node.action.entity &&
          this.sameEntityTarget(parent.action, node.action)
        ) {
          toRemove.add(id);
          toRemove.add(parentId);
          result.skipped += 2;
          result.details.push(
            `Skipped create(${parentId}) + delete(${id}) for ${node.action.entity}`,
          );
        }
      }
    }

    this.removeNodes(graph, toRemove);
  }

  /**
   * If a create is immediately followed by an update to the same entity,
   * fold the update payload into the create and remove the update node.
   */
  private collapseCreateThenUpdate(
    graph: Map<string, ActionNode>,
    result: OptimizationResult,
  ): void {
    const toRemove = new Set<string>();

    for (const [id, node] of graph) {
      if (node.action.type !== 'update') continue;

      for (const parentId of node.parents) {
        const parent = graph.get(parentId);
        if (
          parent &&
          parent.action.type === 'create' &&
          this.sameEntityTarget(parent.action, node.action)
        ) {
          parent.action.payload = this.mergePayloads(
            parent.action.payload,
            node.action.payload,
          );
          parent.action.timestamp = node.action.timestamp;

          for (const childId of node.children) {
            const child = graph.get(childId);
            if (child) {
              child.parents.delete(id);
              child.parents.add(parentId);
              parent.children.add(childId);
            }
          }

          toRemove.add(id);
          result.merged += 1;
          result.details.push(
            `Collapsed update(${id}) into create(${parentId}) for ${node.action.entity}`,
          );
        }
      }
    }

    this.removeNodes(graph, toRemove);
  }

  /**
   * Merge consecutive updates to the same entity+entityId,
   * keeping only the latest payload.
   */
  private mergeConsecutiveUpdates(
    graph: Map<string, ActionNode>,
    result: OptimizationResult,
  ): void {
    const toRemove = new Set<string>();
    const grouped = new Map<string, ActionNode[]>();

    for (const [, node] of graph) {
      if (node.action.type !== 'update') continue;
      const key = `${node.action.entity}:${node.action.entityId}`;
      const group = grouped.get(key) ?? [];
      group.push(node);
      grouped.set(key, group);
    }

    for (const [, group] of grouped) {
      if (group.length <= 1) continue;
      group.sort((a, b) => a.action.timestamp - b.action.timestamp);

      const keeper = group[group.length - 1]!;
      for (let i = 0; i < group.length - 1; i++) {
        const older = group[i]!;
        this.transferEdges(graph, older, keeper);
        toRemove.add(older.action.id);
        result.merged += 1;
        result.details.push(
          `Merged update(${older.action.id}) into update(${keeper.action.id})`,
        );
      }
    }

    this.removeNodes(graph, toRemove);
  }

  private sameEntityTarget(a: PendingAction, b: PendingAction): boolean {
    if (a.entityId === b.entityId) return true;
    if (a.tempId && (a.tempId === b.entityId || a.tempId === b.parentTempId)) return true;
    return false;
  }

  private mergePayloads(base: unknown, overlay: unknown): unknown {
    if (
      typeof base === 'object' && base !== null &&
      typeof overlay === 'object' && overlay !== null
    ) {
      return { ...(base as object), ...(overlay as object) };
    }
    return overlay;
  }

  private transferEdges(
    graph: Map<string, ActionNode>,
    from: ActionNode,
    to: ActionNode,
  ): void {
    for (const childId of from.children) {
      const child = graph.get(childId);
      if (child) {
        child.parents.delete(from.action.id);
        child.parents.add(to.action.id);
        to.children.add(childId);
      }
    }
    for (const parentId of from.parents) {
      const parent = graph.get(parentId);
      if (parent) {
        parent.children.delete(from.action.id);
        parent.children.add(to.action.id);
        to.parents.add(parentId);
      }
    }
  }

  private removeNodes(graph: Map<string, ActionNode>, ids: Set<string>): void {
    for (const id of ids) {
      const node = graph.get(id);
      if (!node) continue;
      for (const parentId of node.parents) {
        graph.get(parentId)?.children.delete(id);
      }
      for (const childId of node.children) {
        graph.get(childId)?.parents.delete(id);
      }
      graph.delete(id);
    }
  }
}
