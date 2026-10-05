#!/usr/bin/env bash
#
# LegalOS — origin network restriction.
#
# WHAT THIS DOES
#   Restricts the nginx `location /legalos/` block to Cloudflare's official
#   proxy ranges (plus loopback), so the LegalOS origin stops answering
#   arbitrary public traffic that bypasses Cloudflare Access.
#
#       Internet -> Cloudflare -> Cloudflare Access -> nginx -> LegalOS
#
#   Anything arriving at the origin from outside those ranges is refused at
#   nginx with 403 before it ever reaches the app.
#
# WHAT THIS DELIBERATELY DOES NOT DO
#   * It does NOT touch the server{} block, so no OTHER dashboard on this
#     shared vhost changes behaviour. Blast radius is the /legalos/ route only.
#   * It does NOT replace application security. LegalOS still enforces
#     Cloudflare Access assertion / session auth and full RBAC on every API.
#     Network restriction is defence in depth, not a substitute.
#   * It NEVER uses IP ranges from memory. Ranges come from Cloudflare's
#     official published lists at run time, and the script aborts rather than
#     guessing if they cannot be fetched or do not look sane.
#
# USAGE
#   sudo ./deploy/apply-origin-hardening.sh              # apply
#   sudo ./deploy/apply-origin-hardening.sh --dry-run    # generate + validate, change nothing
#   sudo ./deploy/apply-origin-hardening.sh --verify     # test current state, change nothing
#   sudo ./deploy/apply-origin-hardening.sh --rollback   # undo, restore newest backup
#
# EXIT CODES
#   0 ok   1 validation/apply failed (rolled back)   2 precondition not met
set -euo pipefail

SITE=/etc/nginx/sites-available/zameen_bse_reports
SNIPPET=/etc/nginx/snippets/legalos-cloudflare-allow.inc
INCLUDE_LINE='        include    snippets/legalos-cloudflare-allow.inc;   # origin restriction'
MARKER='snippets/legalos-cloudflare-allow.inc'
BACKUP_DIR=/etc/nginx/sites-available
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$BACKUP_DIR/zameen_bse_reports.bak-legalos-origin-$STAMP"
CF_V4_URL=https://www.cloudflare.com/ips-v4
CF_V6_URL=https://www.cloudflare.com/ips-v6

MODE=apply
case "${1:-}" in
  --dry-run)  MODE=dryrun ;;
  --verify)   MODE=verify ;;
  --rollback) MODE=rollback ;;
  "")         MODE=apply ;;
  *) echo "unknown option: $1"; sed -n '1,30p' "$0"; exit 2 ;;
esac

say()  { printf '  %s\n' "$*"; }
head1() { printf '\n== %s ==\n' "$*"; }
die()  { printf '\nFAILED: %s\n' "$*" >&2; exit "${2:-1}"; }

# ---------------------------------------------------------------- privilege --
need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    cat >&2 <<EOF

This step changes /etc/nginx and must run as root.

    sudo $0 ${1:-}

EOF
    exit 2
  fi
}

# ------------------------------------------------------------- verification --
# Proves the restriction from a NON-loopback source address. Connecting to the
# instance's own private IP makes nginx see a real non-loopback \$remote_addr,
# which is exactly what a public client looks like to the allow-list.
verify_state() {
  local ip; ip=$(hostname -I | awk '{print $1}')
  local host=zameenpkreports.com
  head1 "Verification (origin = $ip)"

  local a b c d
  a=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $host" "http://$ip/legalos/"            || true)
  b=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $host" "http://$ip/legalos/api/registers/contracts" || true)
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $host" "http://127.0.0.1/legalos/"      || true)
  d=$(curl -s -o /dev/null -m 6  -w '%{http_code}' "http://$ip:4600/"                                || true)

  say "A public-source shell   http://$ip/legalos/                -> $a   (want 403)"
  say "B public-source API     http://$ip/legalos/api/registers/  -> $b   (want 403)"
  say "C loopback health       http://127.0.0.1/legalos/          -> $c   (want 200)"
  say "D app port direct       http://$ip:4600/                   -> $d   (want 000 = refused)"

  head1 "Cloudflare edge (unauthenticated -> Access login)"
  local e; e=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://$host/legalos/" || true)
  say "E https://$host/legalos/ -> $e   (want 302)"

  local ok=1
  [ "$a" = 403 ] || ok=0
  [ "$b" = 403 ] || ok=0
  [ "$c" = 200 ] || ok=0
  [ "$d" = 000 ] || ok=0
  [ "$e" = 302 ] || ok=0
  if [ "$ok" = 1 ]; then printf '\nORIGIN HARDENING: PASS\n'; return 0; fi
  printf '\nORIGIN HARDENING: NOT IN TARGET STATE\n'; return 1
}

if [ "$MODE" = verify ]; then verify_state; exit $?; fi

# ---------------------------------------------------------------- rollback ---
if [ "$MODE" = rollback ]; then
  need_root --rollback
  head1 "Rollback"
  newest=$(ls -1t "$BACKUP_DIR"/zameen_bse_reports.bak-legalos-origin-* 2>/dev/null | head -1 || true)
  if [ -n "$newest" ]; then
    say "restoring $newest"
    cp -a "$SITE" "$SITE.pre-rollback-$STAMP"
    cp -a "$newest" "$SITE"
  else
    say "no origin-hardening backup found; stripping the include line in place"
    grep -v "$MARKER" "$SITE" > "$SITE.tmp.$$" && mv "$SITE.tmp.$$" "$SITE"
  fi
  rm -f "$SNIPPET"
  if ! nginx -t; then die "nginx -t failed AFTER rollback - manual intervention needed" 1; fi
  systemctl reload nginx
  say "rolled back and reloaded"
  verify_state || true
  exit 0
fi

# --------------------------------------------------------------- apply path --
# A dry run writes nothing, so it does not need root: anyone can inspect exactly
# what the privileged run would install before handing it to someone who can.
[ "$MODE" = dryrun ] || need_root
[ -f "$SITE" ] || die "site file not found: $SITE" 2
command -v nginx >/dev/null || die "nginx not on PATH" 2
grep -q 'location /legalos/ {' "$SITE" || die "no 'location /legalos/' block in $SITE" 2

head1 "1. Fetch official Cloudflare ranges"
tmp4=$(mktemp); tmp6=$(mktemp); trap 'rm -f "$tmp4" "$tmp6"' EXIT
curl -fsS -m 30 "$CF_V4_URL" -o "$tmp4" || die "could not fetch $CF_V4_URL - refusing to guess ranges" 2
curl -fsS -m 30 "$CF_V6_URL" -o "$tmp6" || die "could not fetch $CF_V6_URL - refusing to guess ranges" 2
# Sanity: only well-formed CIDRs, and a plausible count. A truncated or
# hijacked response must never become a lockout.
v4=$(grep -cE '^[0-9]+(\.[0-9]+){3}/[0-9]{1,2}$' "$tmp4" || true)
v6=$(grep -cE '^[0-9a-fA-F:]+/[0-9]{1,3}$'       "$tmp6" || true)
bad4=$(grep -vcE '^[0-9]+(\.[0-9]+){3}/[0-9]{1,2}$|^$' "$tmp4" || true)
bad6=$(grep -vcE '^[0-9a-fA-F:]+/[0-9]{1,3}$|^$'       "$tmp6" || true)
say "IPv4 CIDRs: $v4   IPv6 CIDRs: $v6   (malformed: v4=$bad4 v6=$bad6)"
[ "$v4" -ge 10 ] || die "only $v4 IPv4 ranges returned - looks wrong, aborting" 2
[ "$v6" -ge 5  ] || die "only $v6 IPv6 ranges returned - looks wrong, aborting" 2
[ "$bad4" -eq 0 ] && [ "$bad6" -eq 0 ] || die "malformed CIDR in Cloudflare response, aborting" 2

head1 "2. Generate snippet"
gen=$(mktemp)
{
  echo "# LegalOS origin restriction - GENERATED $(date -Is) by deploy/apply-origin-hardening.sh"
  echo "# Source: $CF_V4_URL and $CF_V6_URL (fetched at apply time, never hardcoded)."
  echo "# Re-run the script to refresh; Cloudflare does change these."
  echo "#"
  echo "# Keep in mind: this is defence in depth. LegalOS still independently"
  echo "# enforces Cloudflare Access / session auth and RBAC on every request."
  echo ""
  echo "# -- loopback: local health checks and the monitoring curl --"
  echo "allow 127.0.0.1;"
  echo "allow ::1;"
  echo ""
  echo "# -- Cloudflare IPv4 --"
  grep -E '^[0-9]+(\.[0-9]+){3}/[0-9]{1,2}$' "$tmp4" | sed 's/^/allow /; s/$/;/'
  echo ""
  echo "# -- Cloudflare IPv6 --"
  grep -E '^[0-9a-fA-F:]+/[0-9]{1,3}$' "$tmp6" | sed 's/^/allow /; s/$/;/'
  echo ""
  echo "deny all;"
} > "$gen"
say "$(grep -c '^allow' "$gen") allow rules + deny all"

if [ "$MODE" = dryrun ]; then
  head1 "DRY RUN - generated snippet"
  sed 's/^/    /' "$gen"
  head1 "DRY RUN - would insert into $SITE"
  say "$INCLUDE_LINE"
  say "(as the first line inside 'location /legalos/ {')"
  rm -f "$gen"
  say "nothing was changed"
  exit 0
fi

head1 "3. Back up current config"
cp -a "$SITE" "$BACKUP"
say "site  -> $BACKUP"
[ -f "$SNIPPET" ] && { cp -a "$SNIPPET" "$SNIPPET.bak-$STAMP"; say "snippet -> $SNIPPET.bak-$STAMP"; }

head1 "4. Install snippet + include"
install -m 0644 -o root -g root "$gen" "$SNIPPET"; rm -f "$gen"
say "wrote $SNIPPET"
if grep -q "$MARKER" "$SITE"; then
  say "include already present - snippet refreshed, site file untouched"
else
  awk -v line="$INCLUDE_LINE" '
    { print }
    /location \/legalos\/ \{/ && !done { print line; done=1 }
  ' "$SITE" > "$SITE.new.$$"
  grep -q "$MARKER" "$SITE.new.$$" || { rm -f "$SITE.new.$$"; die "include insertion produced no change" 1; }
  mv "$SITE.new.$$" "$SITE"
  say "inserted include into location /legalos/"
fi

head1 "5. Diff"
diff -u "$BACKUP" "$SITE" | sed 's/^/    /' || true

head1 "6. Validate (nginx -t)"
if ! nginx -t; then
  say "VALIDATION FAILED - restoring backup"
  cp -a "$BACKUP" "$SITE"; rm -f "$SNIPPET"
  nginx -t && say "restored config validates" || say "RESTORED CONFIG ALSO FAILS - INSPECT $SITE NOW"
  die "nginx -t rejected the candidate config; nothing was reloaded" 1
fi
say "config valid"

head1 "7. Reload"
if ! systemctl reload nginx; then
  say "RELOAD FAILED - restoring backup"
  cp -a "$BACKUP" "$SITE"; rm -f "$SNIPPET"
  nginx -t && systemctl reload nginx || true
  die "reload failed; rolled back" 1
fi
say "nginx reloaded"

sleep 2
if verify_state; then
  head1 "Done"
  say "To undo:  sudo $0 --rollback"
  say "NOTE: the shared-site route guard keeps a known-good snapshot. Because"
  say "      this change adds no route, the guard will not fight it, but a"
  say "      future restore could drop it. Re-baseline the guard afterwards:"
  say "          sudo /usr/local/sbin/zameen-nginx-route-guard --status"
  exit 0
fi

head1 "Post-apply verification did NOT reach target state"
say "The config applied and nginx reloaded, but the checks above disagree."
say "Inspect before deciding. To undo:  sudo $0 --rollback"
exit 1
