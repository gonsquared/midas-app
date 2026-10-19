import type { BrowserContext } from '@playwright/test';
import { expect, test as base } from '@playwright/test';

/**
 * True when the target is the API-served production build (CI job "production image"), which
 * sends the real Content-Security-Policy header. The Vite dev server injects inline scripts and
 * sends no CSP, so the guard below only makes sense against the served build.
 */
export const SERVED_BUILD = Boolean(process.env['E2E_SERVED_BUILD']);

/**
 * Records every `securitypolicyviolation` event (and every browser console message about the
 * policy) in any page of the context. The binding lives on the context, so violations survive
 * navigations and also cover pages the app opens.
 */
export async function watchCspViolations(context: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  await context.exposeFunction('__midasReportCsp', (detail: string) => {
    violations.push(detail);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __midasReportCsp?: (detail: string) => void })
        .__midasReportCsp;
      report?.(
        `${event.violatedDirective} blocked=${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`,
      );
    });
  });
  context.on('console', (message) => {
    if (
      /Content Security Policy|Refused to (apply|execute|load|connect|frame)/i.test(message.text())
    ) {
      violations.push(`console: ${message.text()}`);
    }
  });
  return violations;
}

/**
 * Every spec imports `test` from here. Against the served build an automatic fixture fails the
 * test if the browser reported any CSP violation. `cspGuard: false` (test.use) turns it off for
 * the one spec that triggers a violation on purpose.
 */
export const test = base.extend<{ cspGuardEnabled: boolean; cspGuard: void }>({
  cspGuardEnabled: [true, { option: true }],
  cspGuard: [
    async ({ context, cspGuardEnabled }, use) => {
      if (!SERVED_BUILD || !cspGuardEnabled) {
        await use();
        return;
      }
      const violations = await watchCspViolations(context);
      await use();
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
