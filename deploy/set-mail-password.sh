#!/usr/bin/env bash
# Set (or rotate) the legal.os@zameen.com mailbox credential.
#
#   bash deploy/set-mail-password.sh
#
# The password is read with `read -s`, so it is never echoed to the screen,
# never written to shell history, and never passed as an argument (which would
# make it visible in `ps`). It goes straight into config/legalos.config.json,
# which is gitignored and is never served.
set -euo pipefail

CFG="$(cd "$(dirname "$0")/.." && pwd)/config/legalos.config.json"
[ -f "$CFG" ] || { echo "No config at $CFG"; exit 1; }

echo "App Password for legal.os@zameen.com"
echo "(16 characters, spaces are fine and will be stripped — input is hidden)"
printf "  paste it now: "
read -rs PW
echo
printf "  once more to confirm: "
read -rs PW2
echo

[ -n "$PW" ] || { echo "Nothing entered — no change made."; exit 1; }
[ "$PW" = "$PW2" ] || { echo "They did not match — no change made."; exit 1; }

# Python does the edit so the JSON stays valid, and reads the secret from the
# environment rather than argv so it never appears in the process list.
MAILPW="$PW" python3 - "$CFG" <<'PY'
import json, os, sys
path = sys.argv[1]
pw = os.environ["MAILPW"].replace(" ", "").strip()
cfg = json.load(open(path))
cfg.setdefault("mail", {})["pass"] = pw
json.dump(cfg, open(path, "w"), indent=2)
print("  stored %d characters into mail.pass" % len(pw))
PY

chmod 640 "$CFG"
echo
echo "Stored. Nothing has been emailed to anyone: mail.enabled is still false."
echo "Next: verify the credential without sending anything —"
echo "  bash deploy/verify-mail.sh"
