import type { PendingAction } from '../types';

export interface ActionNode {
  action: PendingAction;
  children: Set<string>;
  parents: Set<string>;
  depth: number;
}

export interface ExecutionLayer {
  depth: number;
  actions: PendingAction[];
}

export interface ExecutionPlan {
  layers: ExecutionLayer[];
  graph: Map<string, ActionNode>;
  optimizations: OptimizationResult;
}

export interface OptimizationResult {
  merged: number;
  skipped: number;
  details: string[];
}

export type TempIdMap = Map<string, string>;

export class CycleDetectedError extends Error {
  public readonly cycle: string[];
  constructor(cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'CycleDetectedError';
    this.cycle = cycle;
  }
}

export class DependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyError';
  }
}
