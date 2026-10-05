#!/usr/bin/env bash
# One-shot deploy: LegalOS -> https://zameenpkreports.com/legalos
# Run as root:   sudo bash /var/www/zameen_bse_reports/LegalOS/legalos/deploy/go.sh
#
# Idempotent + self-validating (restores nginx if the config goes bad). Mirrors
# Mall35_Rentals/deploy/go.sh.
#
# There is NOTHING to build and no dependency to install: server.js is
# zero-dependency (Node built-ins only) and the app is static files. So this
# script only installs the service and the nginx route — re-running it after a
# code change is harmless, and a pure content change needs no run at all
# (see DEPLOY.md, "Updating").
set -euo pipefail

BASE=/var/www/zameen_bse_reports/LegalOS/legalos
SVC="$BASE/deploy/legalos.service"
BLOCK="$BASE/deploy/nginx-legalos.conf"
NGINX=/etc/nginx/sites-available/zameen_bse_reports
PORT=4600
NAME=legalos

echo "[1/5] preflight ..."
test -f "$BASE/server.js"        || { echo "    MISSING $BASE/server.js"; exit 1; }
test -f "$BASE/index.html"       || { echo "    MISSING $BASE/index.html"; exit 1; }
test -f "$BASE/portal/index.html" || { echo "    MISSING $BASE/portal/index.html"; exit 1; }
/usr/bin/node --check "$BASE/server.js" || { echo "    server.js does not parse"; exit 1; }
# Everything is world-readable already; assert it rather than chmod'ing blindly.
sudo -u ubuntu test -r "$BASE/index.html" || { echo "    ubuntu cannot read the app tree"; exit 1; }
echo "    ok — nothing to build (static app, zero deps)"

echo "[2/5] systemd service on :$PORT ..."
fuser -k ${PORT}/tcp 2>/dev/null || true       # free the port from any dev instance
sleep 1
cp "$SVC" /etc/systemd/system/${NAME}.service
systemctl daemon-reload
systemctl enable --now ${NAME}
sleep 3
if systemctl is-active --quiet ${NAME}; then echo "    service: active"; else
  echo "    SERVICE FAILED:"; journalctl -u ${NAME} -n 30 --no-pager; exit 1; fi

echo "[3/5] local health checks ..."
fail=0
check () { # path  expected  label
  c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}$1" || true)
  printf "    %-28s HTTP %-3s (want %s)\n" "$3" "$c" "$2"
  [ "$c" = "$2" ] || fail=1
}
check /                     200 "shell"
check /portal/              200 "requester portal"
check /assets/styles.css    200 "stylesheet"
check /src/main.js          200 "app entry"
check /src/portal/main.js   200 "portal entry"
check /portal              301 "dir redirect"
# These must NOT be served: source docs, the stale nested copy, the git dir.
check /.git/config          404 "blocked: .git"
check /package.json         404 "blocked: package.json"
check /legalos/index.html   404 "blocked: stale nested copy"
check /tests/run-all.js     404 "blocked: tests"
# The credentials the API reads. If either of these ever answers 200 the Google
# key and the mailbox password are being handed out as static files.
check /config/legalos.config.json  404 "blocked: secrets"
check /config/service-account.json 404 "blocked: SA key"
# The API itself: health is public, everything else demands a verified
# Cloudflare Access assertion. A 200 on /api/me here would mean the API is
# answering to anyone who can reach the port.
check /api/health           200 "api health"
check /api/me               401 "api requires auth"
if [ "$fail" != 0 ]; then
  echo "    LOCAL CHECKS FAILED"; journalctl -u ${NAME} -n 30 --no-pager; exit 1; fi
echo "    all local checks passed"

echo "[4/5] nginx /${NAME} route ..."
if grep -q "location /${NAME}/" "$NGINX"; then
  echo "    already present — skipping insert"
else
  cp "$NGINX" "${NGINX}.bak.$(date +%s)"
  awk -v bf="$BLOCK" '
    /location = \/ \{/ && !ins {
      print "    # >>> '"${NAME}"' (added by deploy/go.sh)";
      while((getline l < bf) > 0){ if (l !~ /^[[:space:]]*#/ && l !~ /^[[:space:]]*$/) print "    " l }
      print "    # <<< '"${NAME}"'";
      ins=1
    }
    { print }
  ' "$NGINX" > "${NGINX}.new"
  mv "${NGINX}.new" "$NGINX"
  echo "    inserted location block"
fi

echo "[5/5] validate + reload nginx, then verify through the domain ..."
if nginx -t; then systemctl reload nginx; echo "    nginx reloaded"; else
  echo "    INVALID nginx config — restoring backup"; cp "$(ls -t ${NGINX}.bak.* | head -1)" "$NGINX"; exit 1; fi

H='Host: zameenpkreports.com'

# `systemctl reload nginx` returns as soon as the master process accepts the
# signal, but the OLD workers keep serving until their in-flight requests drain.
# Check straight away and those workers answer — from the config that has NO
# /legalos route — so every check below 404s and the deploy reports failure even
# though it did everything right. Wait for a NEW worker to answer first.
printf "    waiting for reloaded workers "
ready=0
for i in $(seq 1 20); do
  c=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" http://127.0.0.1/legalos/ || true)
  if [ "$c" = "200" ]; then ready=1; break; fi
  printf "."
  sleep 1
done
if [ "$ready" = 1 ]; then echo " ok (${i}s)"; else
  echo " TIMED OUT after 20s (last HTTP $c) — checks below will show the detail"; fi

dfail=0
dcheck () { # path  expected
  # Retry briefly: a straggler worker can still win a race the wait above lost.
  for a in 1 2 3; do
    c=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "http://127.0.0.1$1" || true)
    if [ "$c" = "$2" ]; then break; fi
    sleep 1
  done
  printf "    %-34s HTTP %-3s (want %s)\n" "$1" "$c" "$2"
  [ "$c" = "$2" ] || dfail=1
}
dcheck /legalos                    301
dcheck /legalos/                   200
dcheck /legalos/assets/styles.css  200
dcheck /legalos/src/main.js        200
dcheck /legalos/portal/            200
dcheck /legalos/.git/config        404
dcheck /legalos/config/legalos.config.json 404
dcheck /legalos/api/me             401
if [ "$dfail" != 0 ]; then
  echo ""
  echo "    ⚠ ROUTE CHECKS FAILED — the service is up but the domain route is wrong."
  echo "      Inspect: grep -n -A20 'legalos' $NGINX"
  exit 1
fi

echo ""
echo "✅ DONE → https://zameenpkreports.com/legalos"
echo "         requester portal → https://zameenpkreports.com/legalos/portal/"
echo ""
echo "   REMAINING (Cloudflare dashboard, not this box):"
echo "   add /legalos* to Cloudflare Access, admitting @zameen.com only,"
echo "   mirroring the existing /kpi_sales_dashboard* policy."
echo ""
echo "   ⚠ THIS IS LOAD-BEARING, not a formality. Unlike Mall 35, LegalOS has NO"
echo "     real authentication — its sign-in screen is a demo persona picker that"
echo "     anyone can click through, and it enforces nothing server-side. Until"
echo "     the Access policy is live, /legalos is open to anyone who knows the URL."
