#!/usr/bin/env bash
# Restrict LegalOS to m_ashhad and wahaj_alam only.
#
#   sudo bash /var/www/zameen_bse_reports/LegalOS/legalos/deploy/restrict-access.sh
#
# WHY THIS IS NOT JUST A chmod
# ----------------------------
# The tree is currently wahaj_alam:ubuntu 0775. The `ubuntu` group has 13
# members, so thirteen people can read AND write the Google service-account
# key, the legal.os mailbox password, and the cached registers (2,896 legal
# records including litigation cases).
#
# The service, however, runs as User=ubuntu. Tightening the files WITHOUT
# moving the service off `ubuntu` takes LegalOS down — it can no longer read
# its own source or write its Drive cache. So this script does both, in one
# pass, and refuses to leave the two halves out of step.
#
# After this:
#   owner  wahaj_alam   (unchanged — they built it)
#   group  legalos      (m_ashhad + wahaj_alam, nobody else)
#   others no access at all
#   service runs as wahaj_alam:legalos
set -euo pipefail

BASE=/var/www/zameen_bse_reports/LegalOS
APP="$BASE/legalos"
UNIT=/etc/systemd/system/legalos.service
GROUP=legalos
MEMBERS=(m_ashhad wahaj_alam)
SVC_USER=wahaj_alam

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
[ -d "$APP" ] || { echo "Not found: $APP"; exit 1; }
[ -f "$UNIT" ] || { echo "Not found: $UNIT"; exit 1; }

echo "[1/6] group '$GROUP' ..."
getent group "$GROUP" >/dev/null || groupadd --system "$GROUP"
for u in "${MEMBERS[@]}"; do
  id -u "$u" >/dev/null 2>&1 || { echo "    no such user: $u"; exit 1; }
  usermod -aG "$GROUP" "$u"
  echo "    $u added"
done

echo "[2/6] back up the unit ..."
cp -a "$UNIT" "${UNIT}.bak.$(date +%s)"

echo "[3/6] point the service at $SVC_USER:$GROUP ..."
# The service must belong to the group that can still read the files. Leaving
# it as User=ubuntu after step 4 would break the app instantly.
sed -i "s/^User=.*/User=$SVC_USER/; s/^Group=.*/Group=$GROUP/" "$UNIT"
grep -E "^(User|Group)=" "$UNIT" | sed 's/^/    /'

echo "[4/6] re-own and tighten the tree ..."
chown -R "$SVC_USER:$GROUP" "$BASE"
# setgid on directories so anything created later stays in the legalos group.
find "$BASE" -type d -exec chmod 2770 {} +
find "$BASE" -type f -exec chmod 0660 {} +
# Scripts stay executable for the two owners; still nothing for `others`.
find "$APP/deploy" -type f -name '*.sh' -exec chmod 0770 {} + 2>/dev/null || true
echo "    dirs 2770, files 0660, others: none"

echo "[5/6] reload and restart ..."
systemctl daemon-reload
systemctl restart legalos
sleep 2

echo "[6/6] verify ..."
fail=0
systemctl is-active --quiet legalos && echo "    service: active" || { echo "    service: NOT ACTIVE"; fail=1; }
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4600/ || true)
[ "$code" = "200" ] && echo "    http   : 200" || { echo "    http   : $code"; fail=1; }
# The whole point: a workspace user who is not in the new group must be shut out.
OUTSIDER=$(getent group ubuntu | cut -d: -f4 | tr ',' '\n' | grep -vxF -e m_ashhad -e wahaj_alam | head -1)
if [ -n "$OUTSIDER" ]; then
  if sudo -u "$OUTSIDER" test -r "$APP/config/service-account.json" 2>/dev/null; then
    echo "    LEAK: $OUTSIDER can still read the service-account key"; fail=1
  else
    echo "    $OUTSIDER is correctly locked out"
  fi
fi
for u in "${MEMBERS[@]}"; do
  sudo -u "$u" test -r "$APP/config/legalos.config.json" 2>/dev/null \
    && echo "    $u can read config" || { echo "    $u CANNOT read config"; fail=1; }
done

if [ "$fail" != 0 ]; then
  echo ""
  echo "  SOMETHING IS WRONG. The unit backup is at ${UNIT}.bak.* — restore it,"
  echo "  run 'systemctl daemon-reload && systemctl restart legalos', and"
  echo "  'chown -R wahaj_alam:ubuntu $BASE' to go back."
  exit 1
fi
echo ""
echo "Done. LegalOS is readable and writable by m_ashhad and wahaj_alam only."
echo "NOTE: group membership applies to NEW logins — both users must log out"
echo "      and back in (or run 'newgrp $GROUP') before their shell sees it."
