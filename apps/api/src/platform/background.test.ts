import { describe, expect, it } from 'vitest';
import { BackgroundCapacityError, BackgroundTasks } from './background.js';

describe('BackgroundTasks', () => {
  it('runs tasks after the caller yields and drains them', async () => {
    const errors: unknown[] = [];
    const tasks = new BackgroundTasks((e) => errors.push(e));
    let ran = false;
    expect(
      tasks.run(async () => {
        ran = true;
      }),
    ).toBe(true);
    expect(ran).toBe(false);
    await tasks.drain();
    expect(ran).toBe(true);
    expect(errors).toEqual([]);
  });

  it('reports task failures instead of throwing', async () => {
    const errors: unknown[] = [];
    const tasks = new BackgroundTasks((e) => errors.push(e));
    tasks.run(async () => {
      throw new Error('boom');
    });
    await tasks.drain();
    expect(errors).toHaveLength(1);
  });

  it('drops work beyond the concurrency cap and reports it, then recovers', async () => {
    const errors: unknown[] = [];
    const tasks = new BackgroundTasks((e) => errors.push(e), 2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const slow = async () => {
      started++;
      await gate;
    };
    expect(tasks.run(slow)).toBe(true);
    expect(tasks.run(slow)).toBe(true);
    expect(tasks.run(slow)).toBe(false);
    expect(errors[0]).toBeInstanceOf(BackgroundCapacityError);
    release();
    await tasks.drain();
    expect(started).toBe(2);
    expect(tasks.run(async () => undefined)).toBe(true);
    await tasks.drain();
  });
});
