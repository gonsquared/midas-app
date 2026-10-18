import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler, type ScheduledTask } from './scheduler.js';

const logger = { info: vi.fn(), error: vi.fn() };

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logger.error.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the tasks after the initial delay and then every interval', async () => {
    const run = vi.fn(async () => undefined);
    const scheduler = new Scheduler({
      tasks: [{ name: 'a', run }],
      intervalMs: 1000,
      initialDelayMs: 100,
      logger,
    });
    scheduler.start();
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(4);
    await scheduler.stop();
  });

  it('never overlaps two passes, even when a pass is slower than the interval', async () => {
    let active = 0;
    let maxActive = 0;
    const slow: ScheduledTask = {
      name: 'slow',
      async run() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        active -= 1;
      },
    };
    const scheduler = new Scheduler({
      tasks: [slow],
      intervalMs: 1000,
      initialDelayMs: 0,
      logger,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(maxActive).toBe(1);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(6000);
    await stopping;
  });

  it('logs a failing task and keeps running the other tasks and later passes', async () => {
    const good = vi.fn(async () => undefined);
    const counter = { inc: vi.fn() };
    const scheduler = new Scheduler({
      tasks: [
        {
          name: 'bad',
          run: async () => {
            throw new Error('boom');
          },
        },
        { name: 'good', run: good },
      ],
      intervalMs: 500,
      initialDelayMs: 0,
      logger,
      counter: counter as never,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1100);
    expect(good).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(counter.inc).toHaveBeenCalledWith({ task: 'bad', result: 'error' });
    expect(counter.inc).toHaveBeenCalledWith({ task: 'good', result: 'ok' });
    await scheduler.stop();
  });

  it('stop() prevents further passes and waits for the running one (graceful shutdown)', async () => {
    let finished = false;
    const scheduler = new Scheduler({
      tasks: [
        {
          name: 'work',
          async run() {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            finished = true;
          },
        },
      ],
      intervalMs: 1000,
      initialDelayMs: 0,
      logger,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(3000);
    await stopping;
    expect(finished).toBe(true);
    const runs = vi.getTimerCount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.getTimerCount()).toBe(runs);
  });

  it('tells a running task to stop through the signal', async () => {
    const seen: boolean[] = [];
    const scheduler = new Scheduler({
      tasks: [
        {
          name: 'cooperative',
          async run(signal) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            seen.push(signal.aborted);
          },
        },
      ],
      intervalMs: 1000,
      initialDelayMs: 0,
      logger,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(200);
    await stopping;
    expect(seen).toEqual([true]);
  });
});
