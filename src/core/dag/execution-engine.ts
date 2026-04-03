import type { PendingAction, SyncExecutor, IStorageAdapter } from '../types';
import type { ExecutionPlan } from './types';
import { EventBus } from '../event-bus';
import { PendingQueue } from '../pending-queue';
import { DependencyGraph } from './dependency-graph';
import { TopologicalSorter } from './topological-sorter';
import { TempIdResolver } from './temp-id-resolver';
import { ActionOptimizer } from './action-optimizer';

export interface ExecutionResult {
  completed: number;
  failed: number;
  blocked: number;
  tempIdMappings: Map<string, string>;
}

export class ExecutionEngine {
  private readonly graph: DependencyGraph;
  private readonly sorter: TopologicalSorter;
  private readonly resolver: TempIdResolver;
  private readonly optimizer: ActionOptimizer;

  constructor(
    private readonly queue: PendingQueue,
    private readonly executor: SyncExecutor,
    private readonly eventBus: EventBus,
    storage?: IStorageAdapter,
  ) {
    this.graph = new DependencyGraph();
    this.sorter = new TopologicalSorter();
    this.resolver = new TempIdResolver(storage);
    this.optimizer = new ActionOptimizer();
  }

  async init(): Promise<void> {
    await this.resolver.load();
  }

  async executeQueue(actions: PendingAction[]): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      completed: 0,
      failed: 0,
      blocked: 0,
      tempIdMappings: new Map(),
    };

    if (actions.length === 0) return result;

    const plan = this.buildPlan(actions);

    this.eventBus.emit('dag:plan-created', {
      layers: plan.layers.length,
      total: plan.layers.reduce((sum, l) => sum + l.actions.length, 0),
      optimizations: {
        merged: plan.optimizations.merged,
        skipped: plan.optimizations.skipped,
      },
    });

    for (const layer of plan.layers) {
      this.eventBus.emit('dag:layer-start', {
        depth: layer.depth,
        count: layer.actions.length,
      });

      let layerCompleted = 0;
      let layerFailed = 0;

      for (const action of layer.actions) {
        if (action.status === 'blocked') {
          continue;
        }

        const resolved = this.resolver.resolveAction(action);
        await this.queue.updateStatus(action.id, 'in_progress');

        const execResult = await this.executor.execute(resolved);

        if (execResult.ok) {
          await this.queue.remove(action.id);
          layerCompleted += 1;
          result.completed += 1;

          this.handleCreateSuccess(action, execResult.value);
        } else {
          await this.queue.updateStatus(action.id, 'failed');
          layerFailed += 1;
          result.failed += 1;

          this.pauseDescendants(action.id, plan, result);

          this.eventBus.emit('sync:error', {
            error: execResult.error,
            action,
          });
        }
      }

      this.eventBus.emit('dag:layer-complete', {
        depth: layer.depth,
        completed: layerCompleted,
        failed: layerFailed,
      });
    }

    result.tempIdMappings = this.resolver.getMap();
    await this.resolver.persist();

    return result;
  }

  buildPlan(actions: PendingAction[]): ExecutionPlan {
    const graph = this.graph.buildGraph(actions);
    const { graph: optimized, result: optimizations } =
      this.optimizer.optimize(graph);
    const layers = this.sorter.sort(optimized);
    return { layers, graph: optimized, optimizations };
  }

  private handleCreateSuccess(action: PendingAction, response: unknown): void {
    if (action.type !== 'create' || !action.tempId) return;

    const serverId = this.extractServerId(response);
    if (!serverId) return;

    this.resolver.register(action.tempId, serverId);
    this.eventBus.emit('dag:tempid-resolved', {
      tempId: action.tempId,
      serverId,
    });
  }

  private extractServerId(response: unknown): string | undefined {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      if (typeof obj['id'] === 'string') return obj['id'];
      if (typeof obj['serverId'] === 'string') return obj['serverId'];
      if (typeof obj['_id'] === 'string') return obj['_id'];
    }
    return undefined;
  }

  private pauseDescendants(
    actionId: string,
    plan: ExecutionPlan,
    result: ExecutionResult,
  ): void {
    const descendants = this.graph.getDescendants(actionId);

    for (const layer of plan.layers) {
      for (const action of layer.actions) {
        if (descendants.has(action.id) && action.status !== 'blocked') {
          action.status = 'blocked';
          result.blocked += 1;
          void this.queue.updateStatus(action.id, 'blocked');
          this.eventBus.emit('dag:action-blocked', action);
        }
      }
    }
  }

  getResolver(): TempIdResolver {
    return this.resolver;
  }

  getDependencyGraph(): DependencyGraph {
    return this.graph;
  }
}
