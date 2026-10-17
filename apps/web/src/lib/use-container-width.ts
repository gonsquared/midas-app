import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Width of an element, measured before paint (no flash) and kept current with ResizeObserver.
 * Returns 0 until measured, and stays 0 where there is no layout (tests); callers treat 0 as
 * "wide" so the full layout is the default.
 */
export function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
