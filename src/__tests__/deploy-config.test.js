/**
 * Deployment configuration — the bits that are easy to break silently.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('CI workflow', () => {
  let ci;
  beforeEach(() => { ci = read('.github/workflows/ci.yml'); });

  it('exists and runs the same gate as `npm run verify`', () => {
    expect(ci).toContain('npm run lint');
    expect(ci).toContain('npm run test:run');
    expect(ci).toContain('npm run build');
  });

  it('installs from the lockfile rather than resolving afresh', () => {
    expect(ci).toContain('npm ci');
    expect(ci).not.toMatch(/run: npm install\b/);
  });

  it('takes its Node version from .nvmrc, so CI and laptops agree', () => {
    expect(ci).toContain('node-version-file: .nvmrc');
    expect(existsSync(resolve(process.cwd(), '.nvmrc'))).toBe(true);
  });

  it('audits production dependencies only', () => {
    // Dev-tooling advisories never reach a user's browser; failing on them
    // would train people to ignore the job.
    expect(ci).toContain('npm audit --omit=dev');
  });
});

describe('Security headers', () => {
  const configs = { nginx: 'deploy/nginx.conf', static: 'public/_headers' };

  for (const [name, path] of Object.entries(configs)) {
    describe(name, () => {
      let cfg;
      beforeEach(() => { cfg = read(path); });

      it('sets a CSP, HSTS and nosniff', () => {
        expect(cfg).toMatch(/Content-Security-Policy/i);
        expect(cfg).toMatch(/Strict-Transport-Security/i);
        expect(cfg).toMatch(/X-Content-Type-Options/i);
      });

      it('refuses framing and inline script', () => {
        expect(cfg).toContain("frame-ancestors 'none'");
        expect(cfg).toContain("script-src 'self'");
        // The app has no eval and no inline <script>, so this must NOT be
        // loosened — unlike style-src, which genuinely needs it.
        expect(cfg).not.toMatch(/script-src[^;]*unsafe-inline/);
        expect(cfg).not.toMatch(/script-src[^;]*unsafe-eval/);
      });

      it('allows the inline styles the app actually injects', () => {
        // main.js builds a <style> element at runtime and components use
        // style="..." attributes; without this the app renders unstyled.
        expect(cfg).toMatch(/style-src[^;]*'unsafe-inline'/);
      });

      it('allows Jira avatar hosts', () => {
        expect(cfg).toMatch(/img-src[^;]*atlassian\.net/);
        expect(cfg).toMatch(/img-src[^;]*gravatar/);
      });

      it('never lets the service worker be cached', () => {
        // A stale worker would keep serving old code after a fix ships.
        expect(cfg).toMatch(/sw\.js/);
        expect(cfg).toMatch(/no-store/);
      });

      it('caches fingerprinted assets hard', () => {
        expect(cfg).toMatch(/immutable/);
        expect(cfg).toMatch(/max-age=31536000/);
      });
    });
  }
});

describe('nginx proxy', () => {
  let cfg;
  beforeEach(() => { cfg = read('deploy/nginx.conf'); });

  it('proxies the three prefixes the dev server proxies', () => {
    // Atlassian sends no CORS headers, so these must be same-origin.
    const vite = read('vite.config.js');
    for (const prefix of ['rest', 'agile', 'wiki']) {
      expect(vite).toContain(`'/${prefix}'`);
      expect(cfg).toMatch(new RegExp(`\\b${prefix}\\b`));
    }
  });

  it('does not cache authenticated API responses', () => {
    expect(cfg).toContain('proxy_no_cache');
    expect(cfg).toMatch(/Cache-Control "no-store"/);
  });

  it('redirects plain HTTP to HTTPS', () => {
    expect(cfg).toMatch(/listen 80;[\s\S]*return 301 https/);
  });
});

describe('package manifest', () => {
  let pkg;
  beforeEach(() => { pkg = JSON.parse(read('package.json')); });

  it('pins a Node version', () => {
    expect(pkg.engines?.node).toBeTruthy();
  });

  it('carries no unused runtime dependencies', () => {
    // The app uses a hand-rolled IndexedDB wrapper; `idb` was never imported.
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('exposes one command that runs the whole gate', () => {
    expect(pkg.scripts.verify).toContain('lint');
    expect(pkg.scripts.verify).toContain('test:run');
    expect(pkg.scripts.verify).toContain('build');
  });
});

describe('Release runbook', () => {
  let doc;
  beforeEach(() => { doc = read('RELEASING.md'); });

  it('documents the rollback path', () => {
    expect(doc.toLowerCase()).toContain('rollback');
  });

  it('states plainly that browser-stored tokens are not safely stored', () => {
    // This is the risk a public deployment has to answer; the runbook must not
    // let it go unmentioned. Collapse whitespace so prose can rewrap freely.
    const flat = doc.replace(/\s+/g, ' ');
    expect(flat).toMatch(/obfuscation, not encryption/i);
  });

  it('documents the server-side credential mode as the fix', () => {
    const flat = doc.replace(/\s+/g, ' ');
    expect(flat).toContain('VITE_AUTH_MODE=proxy');
    // And is honest about what that mode costs.
    expect(flat).toMatch(/everyone shares one Jira identity/i);
  });

  it('explains why the proxy is required', () => {
    expect(doc).toMatch(/CORS/);
    expect(doc).toContain('VITE_USE_PROXY=true');
  });
});
