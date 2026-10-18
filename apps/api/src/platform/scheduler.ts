import type { Counter } from './metrics.js';

/** Cancellation flag handed to tasks so a shutdown can stop work between units of work. */
export interface TaskSignal {
  aborted: boolean;
}

export interface ScheduledTask {
  name: string;
  run(signal: TaskSignal): Promise<unknown>;
}

export interface SchedulerLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface SchedulerOptions {
  tasks: readonly ScheduledTask[];
  intervalMs: number;
  /** Delay before the first pass; keeps boot fast and spreads instances. Default 5 s. */
  initialDelayMs?: number;
  logger: SchedulerLogger;
  counter?: Counter | undefined;
}

/**
 * In-process periodic runner (ADR-011). Passes never overlap inside one process: the next timer is
 * armed only after the current pass finished. Coordination between processes is the task's job
 * (the recurring generator uses row locks with SKIP LOCKED and a unique run key). A task that
 * throws is logged and counted and never stops the loop or the other tasks.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;
  private readonly signal: TaskSignal = { aborted: false };

  constructor(private readonly options: SchedulerOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.signal.aborted = false;
    this.arm(this.options.initialDelayMs ?? 5_000);
  }

  /** Stops arming timers and waits for a pass that is already running to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.signal.aborted = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
  }

  /** One pass over every task, outside the timer. Used by `cli jobs:run` and by tests. */
  async runOnce(signal: TaskSignal = this.signal): Promise<void> {
    for (const task of this.options.tasks) {
      if (signal.aborted) return;
      try {
        await task.run(signal);
        this.options.counter?.inc({ task: task.name, result: 'ok' });
      } catch (error) {
        this.options.counter?.inc({ task: task.name, result: 'error' });
        this.options.logger.error({ err: error, task: task.name }, 'scheduled task failed');
      }
    }
  }

  private arm(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce().finally(() => {
        this.running = undefined;
        this.arm(this.options.intervalMs);
      });
    }, delayMs);
    // The timer must never keep the process alive on its own.
    this.timer.unref();
  }
}
