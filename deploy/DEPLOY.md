# LegalOS — deployment

**Target:** `https://zameenpkreports.com/legalos`
**Requester portal:** `https://zameenpkreports.com/legalos/portal/`

| | |
|---|---|
| Stack | Static files served by `server.js` (Node built-ins only, **zero dependencies**) |
| Port | `4600` (localhost only; nginx is the sole entry point) |
| systemd service | `legalos` |
| App root | `/var/www/zameen_bse_reports/LegalOS/legalos` |
| Server-side state | **none** — the prototype keeps everything in the browser's `localStorage` |
| Runtime | `/usr/bin/node` (v18). Nothing to build, nothing to install. |

---

## 1. Deploy — run as root

```bash
sudo bash /var/www/zameen_bse_reports/LegalOS/legalos/deploy/go.sh
```

Idempotent and self-validating: it installs the service, health-checks the app
locally, inserts its nginx `location` block (skipping if already present),
backs up nginx and **restores the backup automatically if `nginx -t` fails**,
then verifies the route through the domain. Safe to re-run.

## 2. Then, in the Cloudflare dashboard (not this box)

Add `/legalos*` to **Cloudflare Access**, admitting `@zameen.com` only, mirroring
the existing `/kpi_sales_dashboard*` policy.

> **This step is load-bearing.** Unlike Mall 35, LegalOS has **no real
> authentication**. Its sign-in screen is a demo persona picker — you pick an
> identity, it writes a flag to `localStorage`, and that is all. Nothing is
> checked server-side and no password exists. Cloudflare Access is therefore the
> *only* thing deciding who can reach LegalOS. Until the policy is live,
> `/legalos` is open to anyone who knows the URL.
>
> The app does not read `Cf-Access-Authenticated-User-Email` (the header is
> forwarded for parity with the other dashboards, in case a later module wants
> it). So the roles you see inside the app are a *demo* of the permission model,
> not enforcement of it.

## 3. Verify

```bash
systemctl status legalos --no-pager

# app answers locally
curl -s -o /dev/null -w "shell   %{http_code}\n" http://127.0.0.1:4600/
curl -s -o /dev/null -w "portal  %{http_code}\n" http://127.0.0.1:4600/portal/

# route answers through nginx
curl -s -o /dev/null -w "/legalos/         %{http_code}\n" -H 'Host: zameenpkreports.com' http://127.0.0.1/legalos/
curl -s -o /dev/null -w "/legalos/portal/  %{http_code}\n" -H 'Host: zameenpkreports.com' http://127.0.0.1/legalos/portal/
curl -s -o /dev/null -w "/legalos (no /)   %{http_code}\n" -H 'Host: zameenpkreports.com' http://127.0.0.1/legalos
```

Expected: service `active (running)`, local checks `200`, `/legalos/` and
`/legalos/portal/` `200`, `/legalos` `301`. `go.sh` runs all of these itself and
fails loudly if any is wrong.

## 4. Operate

```bash
journalctl -u legalos -n 100 -f      # logs
sudo systemctl restart legalos       # after a change to server.js ONLY
sudo nginx -t && sudo systemctl reload nginx
```

The service is `enabled`, so it survives reboots.

### Updating

The app is static and the server sends `Cache-Control: no-cache`, so:

- **Content/UI change** (`index.html`, `src/**`, `assets/**`, `portal/**`) —
  goes live on the next browser reload. **No restart, no deploy run.** If a
  change "isn't showing", it is a stale browser tab: hard-reload it.
- **`server.js` change** — `sudo systemctl restart legalos`.
- **nginx block change** — re-run `go.sh`, or edit and reload nginx.

## 5. Rollback

```bash
sudo systemctl disable --now legalos

# restore the previous nginx config (go.sh saved a timestamped backup)
ls -t /etc/nginx/sites-available/zameen_bse_reports.bak.* | head -1
sudo cp <that-file> /etc/nginx/sites-available/zameen_bse_reports
sudo nginx -t && sudo systemctl reload nginx
```

---

## How it serves under a path prefix

`proxy_pass http://127.0.0.1:4600/` (**trailing slash**) strips `/legalos`, so
the app serves its tree from the root exactly as in local dev. Nothing hardcodes
the mount point:

- every asset, script and cross-app link is **relative**;
- in-app navigation is **hash-based** (`#/exec`, `#/requests`), so deep links
  need no SPA fallback and no nginx rewrite.

Two trailing-slash redirects make that work, and both are required, not cosmetic
— without them the browser resolves the page's relative assets against the
parent directory and every asset 404s:

1. nginx: `location = /legalos { return 301 /legalos/; }`
2. `server.js`: any directory URL without a trailing slash (e.g.
   `/legalos/portal`) gets a `301`. Its `Location` is **relative** on purpose —
   nginx has already stripped the prefix, so an absolute `/portal/` would send
   the browser outside the mount point.

### What is deliberately not served

`server.js` returns `404` for dotfiles (`.git` above all), `*.docx`/`*.bat`/`*.log`,
`package.json`, `node_modules/`, `tests/`, `app/`, and the stale nested
`legalos/` duplicate of this same tree. `go.sh` asserts each of these is blocked
before it touches nginx.

### Client-side CDN dependency

The prototype loads React and `htm` from **`esm.sh`** at runtime (see the
`importmap` in `index.html`). That is a **viewer's-browser** requirement, not a
server one: a user whose network blocks `esm.sh` gets the app's
"React CDN was blocked" error screen instead of LegalOS. `esm.sh` is reachable
from this box and from the office network; worth knowing if a remote user ever
reports a boot failure. Vendoring those three modules locally would remove the
dependency and is the obvious hardening step if it becomes a problem.

---

## The `app/` directory is not deployed

`app/` is the TypeScript/Vite "Module 1 foundation" being built alongside the
prototype. It is not part of what is served (it is in `.vercelignore` and in the
server's block list). When it takes over, it will need its own deploy step —
a Vite build plus pointing this same mount at `app/dist`.

## Running the test suite (dev machines, not the server)

```bash
# needs Node 20+ (puppeteer-core is ESM-only) and a Chrome binary
export PATH=/home/ubuntu/.nvm/versions/node/v20.20.2/bin:$PATH
CHROME=/usr/bin/google-chrome-stable node tests/run-all.js
```

The suites default to the Windows Chrome path and honour `CHROME` /
`PUPPETEER_EXECUTABLE_PATH`. The **service** does not need Node 20 — `server.js`
is built-ins only and runs on the system's Node 18.
