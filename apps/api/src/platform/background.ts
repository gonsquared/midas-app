export const DEFAULT_MAX_PENDING_TASKS = 100;

export class BackgroundCapacityError extends Error {
  constructor(limit: number) {
    super(`Background task dropped: ${limit} tasks already pending`);
    this.name = 'BackgroundCapacityError';
  }
}

/**
 * Fire-and-forget work that must start after the HTTP response (for example sending email, so
 * response timing does not depend on whether an account exists). Failures are reported through
 * `onError`, never thrown. `drain()` lets tests and graceful shutdown wait for pending work.
 * At most `maxPending` tasks are queued or running, so a request flood cannot grow memory
 * or exhaust the pool through background work.
 */
export class BackgroundTasks {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly onError: (error: unknown) => void,
    /** Upper bound on tasks queued or running; extra tasks are dropped and reported. */
    private readonly maxPending = DEFAULT_MAX_PENDING_TASKS,
  ) {}

  /** Returns false (and reports through `onError`) when the task was dropped at capacity. */
  run(task: () => Promise<void>): boolean {
    if (this.pending.size >= this.maxPending) {
      this.onError(new BackgroundCapacityError(this.maxPending));
      return false;
    }
    const promise = (async () => {
      // Yield first so the response is flushed before the task starts.
      await new Promise<void>((resolve) => setImmediate(resolve));
      try {
        await task();
      } catch (error) {
        this.onError(error);
      }
    })();
    this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise));
    return true;
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }
}
