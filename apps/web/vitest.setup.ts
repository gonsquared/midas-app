import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';
import { clearSession } from './src/lib/session';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
// Lazy route chunks and Radix popovers are slow when the whole suite runs in parallel.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

// jsdom has no layout or matchMedia. Tests that care install their own via `setViewport`.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
window.scrollTo = () => undefined;
HTMLCanvasElement.prototype.getContext = () => null;
