# Closing the origin bypass (needs root)

## What was measured

| Check | Result |
|---|---|
| `https://zameenpkreports.com/legalos/` | **HTTP 302 from Cloudflare** — Access is enforcing at the edge |
| `http://<public-ip>/legalos/` with a spoofed `Host` | **HTTP 200** — the origin answers without Cloudflare |
| `http://<public-ip>/legalos/api/registers/litigation` | **HTTP 401** — no legal data without a verified identity |
| `Cf-Access-Authenticated-User-Email: maryam.haq@zameen.com` (plaintext only) | **401** — the header alone is never trusted |
| `Cf-Access-Jwt-Assertion: forged.jwt.value` | **401** — signature verified |
| `Cf-Access-Jwt-Assertion:` `alg:none` token | **401** — algorithm confusion rejected |
| 6 wrong passwords in a row | **429** for ~15 min; a correct password is refused while locked |

So: **no legal record is reachable from the open internet**, and identity cannot be forged.
What *is* internet-facing is the static SPA shell and the credential login endpoint.

## The fix

Restrict the vhost to Cloudflare's published ranges so the origin only answers traffic
that came through the edge. This edits `/etc/nginx/sites-enabled/zameen_bse_reports`,
which is shared by every dashboard on this box, so it needs root and a maintenance window.

### Keep the ranges current — do not paste them from memory

Cloudflare publishes its ranges and they change. Generate the include file from the
official endpoint rather than hand-copying, and re-run it on a schedule:

```bash
# writes /etc/nginx/cloudflare-ips.conf  (run as root)
{ echo "# generated $(date -u +%FT%TZ) from https://www.cloudflare.com/ips-v4 and ips-v6";
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4)             $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;";
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/cloudflare-ips.conf

{ echo "# generated $(date -u +%FT%TZ)";
  echo "allow 127.0.0.1;";
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4)             $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "allow $ip;";
  done
  echo "deny all;"
} > /etc/nginx/cloudflare-allow.conf
```

Then reference them (one line each) instead of an inline list:

```nginx
# in the server { } block:
include /etc/nginx/cloudflare-ips.conf;

# in location /legalos/ :
include /etc/nginx/cloudflare-allow.conf;
```

A weekly `cron` entry that regenerates both files and runs `nginx -t && systemctl reload
nginx` keeps this correct without anyone remembering to.

<details><summary>Inline equivalent, if you prefer not to use include files</summary>

```nginx
# --- inside the server { } block, BEFORE the location blocks ---
# Cloudflare IPv4 (https://www.cloudflare.com/ips-v4) — refresh periodically.
set_real_ip_from 173.245.48.0/20;   set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;   set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;   set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;   set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;  set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;    set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;     set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;

# --- inside location /legalos/ ---
# Only Cloudflare may reach the app; everything else is refused at the edge of
# the origin. Keep 127.0.0.1 so local health checks and the test harness work.
allow 127.0.0.1;
allow 173.245.48.0/20;  allow 103.21.244.0/22;  allow 103.22.200.0/22;
allow 103.31.4.0/22;    allow 141.101.64.0/18;  allow 108.162.192.0/18;
allow 190.93.240.0/20;  allow 188.114.96.0/20;  allow 197.234.240.0/22;
allow 198.41.128.0/17;  allow 162.158.0.0/15;   allow 104.16.0.0/13;
allow 104.24.0.0/14;    allow 172.64.0.0/13;    allow 131.0.72.0/22;
deny all;
```
</details>

## Apply, verify, roll back

```bash
# 1. syntax check FIRST — a bad file takes every dashboard on this box down
sudo nginx -t

# 2. reload with no downtime (reload, not restart)
sudo systemctl reload nginx
```

Verify:

```bash
# from OFF the box (or with the box's own public IP):
curl -s -o /dev/null -w 'direct origin : %{http_code}\n' -H 'Host: zameenpkreports.com' http://<public-ip>/legalos/
#   expect 403   (was 200)
curl -s -o /dev/null -w 'via cloudflare: %{http_code}\n' https://zameenpkreports.com/legalos/
#   expect 302   (Cloudflare Access challenge — unchanged)

# on the box, confirm the app itself is untouched:
curl -s -o /dev/null -w 'loopback      : %{http_code}\n' http://127.0.0.1:4600/
#   expect 200   (the allow 127.0.0.1 line keeps health checks and the test harness working)
```

**Rollback** (if anything is wrong, this is immediate and total):

```bash
sudo sed -i 's|^\s*include /etc/nginx/cloudflare-allow.conf;|# &|' /etc/nginx/sites-enabled/zameen_bse_reports
sudo nginx -t && sudo systemctl reload nginx
```

Nothing else in the file changes, so commenting that one include restores today's
behaviour exactly.

**Note:** `set_real_ip_from` must be added together with the allow-list, or
`X-Forwarded-For` and the login lockout will key on Cloudflare's address instead of the
real client — which would turn a per-attacker lockout into a global one.

Until this is applied, the residual exposure is: an anonymous internet user can load the
application shell and reach the login form. They cannot read any legal record, cannot
forge an identity, and get locked out after five password attempts.
