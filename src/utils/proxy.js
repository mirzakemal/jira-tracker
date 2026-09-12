/**
 * Whether Jira calls should go through a same-origin reverse proxy.
 *
 * This matters more than it looks. Atlassian Cloud's REST API does not send
 * CORS headers for arbitrary origins, so a browser on https://your-host
 * calling https://your-site.atlassian.net/rest/... is blocked outright. That is
 * why the Vite dev server proxies /rest, /agile and /wiki, and why any
 * deployment that is not localhost needs the same proxy in front of it.
 *
 * `true` makes JiraClient use relative URLs, which the proxy then forwards.
 */

/**
 * @returns {boolean}
 */
export function shouldUseProxy() {
  // Explicit wins: set VITE_USE_PROXY=true when deploying behind a reverse
  // proxy (see deploy/nginx.conf), or false to call Atlassian directly.
  const configured = import.meta.env?.VITE_USE_PROXY;
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  // Unset: the dev server proxies, so localhost is the only place a direct
  // call is known to be wrong.
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}
