import { describe, expect, it } from 'vitest';
import { assertSafeBuild, resolveDevSkipAuth, type BuildContext } from '../build-guard';

const prodBuild: BuildContext = {
  command: 'build',
  mode: 'production',
  nodeEnv: 'production',
  devSkipAuth: undefined,
};

describe('assertSafeBuild', () => {
  it('allows a normal production build', () => {
    expect(() => assertSafeBuild(prodBuild)).not.toThrow();
    expect(() => assertSafeBuild({ ...prodBuild, nodeEnv: undefined })).not.toThrow();
  });

  it('fails a build when VITE_DEV_SKIP_AUTH is set, whatever its value', () => {
    expect(() => assertSafeBuild({ ...prodBuild, devSkipAuth: 'true' })).toThrow(
      /VITE_DEV_SKIP_AUTH/,
    );
    expect(() => assertSafeBuild({ ...prodBuild, devSkipAuth: 'false' })).toThrow(
      /VITE_DEV_SKIP_AUTH/,
    );
  });

  it('fails a build whose mode or NODE_ENV is not production', () => {
    expect(() => assertSafeBuild({ ...prodBuild, mode: 'development' })).toThrow(/mode/);
    expect(() => assertSafeBuild({ ...prodBuild, nodeEnv: 'development' })).toThrow(/NODE_ENV/);
  });

  it('never blocks the dev server', () => {
    expect(() =>
      assertSafeBuild({
        command: 'serve',
        mode: 'development',
        nodeEnv: 'development',
        devSkipAuth: 'true',
      }),
    ).not.toThrow();
  });
});

describe('resolveDevSkipAuth', () => {
  it('is true only on the dev server in development with the opt-in', () => {
    const dev: BuildContext = {
      command: 'serve',
      mode: 'development',
      nodeEnv: 'development',
      devSkipAuth: 'true',
    };
    expect(resolveDevSkipAuth(dev)).toBe(true);
    expect(resolveDevSkipAuth({ ...dev, devSkipAuth: undefined })).toBe(false);
    expect(resolveDevSkipAuth({ ...dev, mode: 'test' })).toBe(false);
    expect(resolveDevSkipAuth({ ...dev, command: 'build' })).toBe(false);
  });
});
