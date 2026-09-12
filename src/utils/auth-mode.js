/**
 * Where the Atlassian credential lives.
 *
 *   'browser' — the user types an API token; it is kept in localStorage and
 *               sent as a Basic auth header on every request. Default, and the
 *               only option when there is no proxy.
 *
 *   'proxy'   — the browser holds NO credential. The reverse proxy attaches the
 *               Authorization header (see deploy/nginx.conf), so a token never
 *               reaches the page and cannot be read by script or by anyone with
 *               access to the machine.
 *
 * 'proxy' shifts the trust boundary rather than removing it: anyone who can
 * reach the proxy can read Jira through it. The proxy MUST therefore sit behind
 * your own authentication, and its credential should be a read-only Atlassian
 * account. RELEASING.md spells this out.
 */

import { shouldUseProxy } from './proxy.js';

/** @returns {boolean} true when the proxy supplies the credential. */
export function usesServerAuth() {
  return (import.meta.env?.VITE_AUTH_MODE || 'browser') === 'proxy';
}

/**
 * Site to address, e.g. "tenderboard.atlassian.net".
 *
 * Under server auth there is no connection form to type it into, so it has to
 * come from build config.
 *
 * @returns {string}
 */
export function configuredDomain() {
  return (import.meta.env?.VITE_JIRA_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

/**
 * Why server auth cannot be used, or null when it is usable.
 *
 * Server auth only works through a same-origin proxy: calling Atlassian
 * directly with no Authorization header just returns 401.
 *
 * @returns {string|null}
 */
export function serverAuthProblem() {
  if (!usesServerAuth()) return null;
  if (!shouldUseProxy()) {
    return 'VITE_AUTH_MODE=proxy requires VITE_USE_PROXY=true — the credential '
      + 'is attached by the proxy, so requests must be same-origin.';
  }
  if (!configuredDomain()) {
    return 'VITE_AUTH_MODE=proxy requires VITE_JIRA_DOMAIN — there is no '
      + 'connection form to supply the site.';
  }
  return null;
}
