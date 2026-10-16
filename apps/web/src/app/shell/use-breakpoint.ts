import { useSyncExternalStore } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const TABLET = '(min-width: 768px)';
const DESKTOP = '(min-width: 1024px)';

function subscribe(listener: () => void): () => void {
  const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}

function getSnapshot(): Breakpoint {
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'mobile';
}

/** Mobile below 768, tablet 768 to 1023 (icon rail), desktop 1024+ (full rail). */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'desktop');
}
