# Releasing

The app is a static bundle plus a reverse proxy. There is no server-side
application code to deploy.

## Before you ship

```bash
npm ci
npm run verify      # lint + tests + build, the same gate CI runs
```

CI runs the identical command on every push and PR
(`.github/workflows/ci.yml`). A red CI means do not ship.

## Build

```bash
npm run build       # -> dist/
```

Environment variables are baked in **at build time**, not read at runtime.
Changing one means rebuilding. See `.env.example`; everything `VITE_`-prefixed
is compiled into the bundle and readable by anyone who loads the page, so it
must not hold secrets.

For a proxied deployment (the normal case — see below):

```bash
VITE_USE_PROXY=true npm run build
```

To also keep the Atlassian credential off the browser:

```bash
VITE_USE_PROXY=true VITE_AUTH_MODE=proxy \
VITE_JIRA_DOMAIN=your-site.atlassian.net npm run build
```

See "Server-side credentials" below for what the proxy then needs.

## Deploy

Copy `dist/` to the web root and reload the proxy.

```bash
rsync -a --delete dist/ deploy-target:/var/www/jira-planner/
ssh deploy-target 'nginx -t && systemctl reload nginx'
```

`deploy/nginx.conf` is the reference config. Substitute `PLANNER_HOST`,
`ATLASSIAN_SITE` and the TLS paths.

### The proxy is not optional

Atlassian Cloud's REST API sends no CORS headers for arbitrary origins. A
browser on `https://planner.example.com` calling
`https://your-site.atlassian.net/rest/...` is blocked before the request
leaves the page. That is why the Vite dev server proxies `/rest`, `/agile` and
`/wiki`, and why production needs the same. Deploy behind the proxy and build
with `VITE_USE_PROXY=true`.

A pure static host (Netlify, Cloudflare Pages, S3) cannot fix this on its own.
`public/_headers` covers the header rules for those hosts, but you still need a
worker or function proxying the three prefixes.

## Verify the deploy

1. Load the page — it should reach the Jira connection screen.
2. Connect, and confirm a sync completes.
3. Check the response headers:

```bash
curl -sI https://PLANNER_HOST | grep -i 'content-security-policy\|strict-transport'
curl -sI https://PLANNER_HOST/sw.js | grep -i cache-control    # expect no-store
```

4. Open the Product Board and confirm cards render with linked issues.

## Rollback

Keep the previous `dist/` and swap it back:

```bash
rsync -a --delete dist-previous/ deploy-target:/var/www/jira-planner/
ssh deploy-target 'systemctl reload nginx'
```

Users holding a cached service worker matter here: `sw.js` is served
`no-store`, so a reload picks up the rolled-back version rather than serving
the bad one from cache indefinitely.

## Server-side credentials

With `VITE_AUTH_MODE=proxy` the browser never holds an Atlassian token: there
is no connection form, nothing is written to localStorage, and `JiraClient`
sends no `Authorization` header. The proxy attaches it.

Three things this requires, none of them optional:

1. **A credential file the proxy reads**, outside the repo:

   ```bash
   printf '%s' 'svc-jira@example.com:API_TOKEN' | base64 -w0
   # write into /etc/nginx/atlassian-auth.inc as:
   #   proxy_set_header Authorization "Basic <that string>";
   sudo chown root:nginx /etc/nginx/atlassian-auth.inc
   sudo chmod 640 /etc/nginx/atlassian-auth.inc
   ```

2. **Your own authentication in front of the proxied routes.** Anyone who can
   reach `/rest` can now read Jira as the service account. `deploy/nginx.conf`
   guards them with `auth_request /_authz`; the stub returns 403, so a
   half-finished deploy fails closed. Point it at your SSO or session check.

3. **A read-only Atlassian account.** The app never writes to Jira, so the
   token needs no write scope. Every user of the deployment appears as that
   account in Jira's audit log — if you need per-user attribution, this mode
   is the wrong shape and you want per-user OAuth instead.

Rotating the token means editing the credential file and reloading nginx. No
rebuild, and no user has to do anything.

## Known constraints

These are real and unresolved. Decide whether they are acceptable before
opening the app to a public URL.

- **In the default `browser` auth mode, API tokens are stored in the browser.**
  `src/utils/storage.js` encrypts them with AES-GCM but derives the key from
  the domain and email — neither secret — so it is obfuscation, not
  encryption. Anyone with access to the machine, or a successful XSS, can
  recover the token. Set `VITE_AUTH_MODE=proxy` for any public deployment; see
  "Server-side credentials" above.
- **Under `proxy` auth, everyone shares one Jira identity.** The trust boundary
  moves rather than disappearing: the proxy's authentication becomes the thing
  protecting Jira, and Jira's audit log shows the service account for every
  action.
- **`VITE_` variables are public.** They are compiled into the bundle. Board
  ids and project keys are fine there; tokens are not.
- **Data lives in the browser.** Each user's IndexedDB holds their own synced
  copy of the Jira data. Clearing site data resets the app; there is nothing
  server-side to restore from.
