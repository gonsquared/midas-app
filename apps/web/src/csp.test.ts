import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('index.html satisfies a strict CSP (script-src self, style-src self)', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('has no inline scripts, only external ones', () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toMatch(/\ssrc="/);
    expect(html).not.toMatch(/<script\b[^>]*>\s*[^<\s]/);
  });

  it('loads the theme script from head, before the app bundle', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain('<script src="/theme-init.js"></script>');
  });

  it('has no inline styles, style tags or inline event handlers', () => {
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
});
