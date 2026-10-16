/** Time source injected into services so tests control it (architecture 2.2). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
