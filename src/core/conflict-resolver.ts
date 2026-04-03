import type {
  ConflictContext,
  ConflictHandler,
  ConflictStrategy,
  PendingAction,
} from './types';

const strategies: Record<ConflictStrategy, ConflictHandler> = {
  'client-wins': (ctx) => ctx.local,

  'server-wins': () => null,

  'last-write-wins': (ctx) => {
    const remoteTs =
      typeof ctx.remote === 'object' &&
      ctx.remote !== null &&
      'timestamp' in ctx.remote
        ? (ctx.remote as { timestamp: number }).timestamp
        : 0;
    return ctx.local.timestamp >= remoteTs ? ctx.local : null;
  },

  merge: (ctx) => {
    if (
      typeof ctx.remote === 'object' &&
      ctx.remote !== null &&
      typeof ctx.local.payload === 'object' &&
      ctx.local.payload !== null
    ) {
      return {
        ...ctx.local,
        payload: { ...(ctx.remote as object), ...(ctx.local.payload as object) },
      } as PendingAction;
    }
    return ctx.local;
  },

  manual: () => null,
};

export class ConflictResolver {
  private strategy: ConflictStrategy;
  private customHandler?: ConflictHandler;

  constructor(strategy: ConflictStrategy = 'last-write-wins', customHandler?: ConflictHandler) {
    this.strategy = strategy;
    this.customHandler = customHandler;
  }

  resolve<T>(context: ConflictContext<T>): PendingAction<T> | null {
    if (this.customHandler) {
      return this.customHandler(context as ConflictContext) as PendingAction<T> | null;
    }
    return strategies[this.strategy](context as ConflictContext) as PendingAction<T> | null;
  }

  setStrategy(strategy: ConflictStrategy): void {
    this.strategy = strategy;
  }

  setCustomHandler(handler: ConflictHandler | undefined): void {
    this.customHandler = handler;
  }

  getStrategy(): ConflictStrategy {
    return this.strategy;
  }
}
