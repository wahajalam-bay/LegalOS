#!/usr/bin/env bash
# Move the static assets onto fresh URLs so no cache can serve the old ones.
#
#   bash tools/bust-cache.sh     # run after ANY edit to src/** or assets/**
#
# WHY THIS EXISTS: server.js sends "no-cache" but the RUNNING process predates
# the ETag that was added to it, so responses carry no validator and a CDN or
# browser may hold an edited file indefinitely. Until someone with sudo runs
#   sudo systemctl restart legalos
# this script is the only reliable way to publish a change. After that restart,
# delete the src-v* symlinks, point the HTML back at src/ and assets/styles.css,
# and delete this script.
#
# The module graph needs a PATH bump, not a query: nested ES imports resolve
# against the importing module's URL and drop "?v=", so only the entry would
# bust. The stylesheet has no @import, so a query is enough there.
set -euo pipefail
cd "$(dirname "$0")/.."

# One counter for BOTH assets, and take the MAX of what is in the file: bumping
# them independently once rewrote the stylesheet from ?v=4 back down to ?v=3 — a
# URL already served with older CSS, which a cache would happily replay.
srcv=$(grep -o 'src-v[0-9]\+/main\.js' index.html | head -1 | sed 's/[^0-9]//g')
cssv=$(grep -o 'styles\.css?v=[0-9]\+' index.html | head -1 | sed 's/[^0-9]//g')
[ -n "$srcv" ] || { echo "could not read the module version from index.html"; exit 1; }
cur=$srcv
[ -n "$cssv" ] && [ "$cssv" -gt "$cur" ] && cur=$cssv
next=$((cur + 1))

ln -sfn src "src-v${next}"
for f in index.html portal/index.html; do
  sed -i -e "s|src-v${cur}/main\.js|src-v${next}/main.js|" \
         -e "s|styles\.css?v=[0-9]\+|styles.css?v=${next}|" "$f"
done

# The suites dynamically import the store to assert against it. They MUST use the
# same graph as the app: a second copy of store.js persists to the same
# localStorage key, so the two fight and records disappear mid-test.
sed -i "s|import(\"/src-v${cur}/|import(\"/src-v${next}/|g" tests/*.js

# Keep the previous version resolvable so a tab loaded mid-deploy does not break
# on its next dynamic import; drop anything older.
for old in src-v*; do
  n=${old#src-v}
  [ "$n" -lt "$((next - 1))" ] 2>/dev/null && rm -f "$old" && echo "  removed stale $old"
done

echo "bumped: src-v${cur} -> src-v${next}   (stylesheet ?v=${next})"
grep -h -o 'src-v[0-9]*/main\.js\|styles\.css?v=[0-9]*' index.html portal/index.html | sed 's/^/  /'
