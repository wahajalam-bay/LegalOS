#!/usr/bin/env bash
# Prove the mailbox credential works. Connects, authenticates, and quits —
# it does NOT send a message to anyone.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
exec /usr/bin/node -e '
const m = require("./api/mail.js");
m.verifyConnection().then(r => {
  if (r.ok) {
    console.log("  SMTP login OK  —  " + r.user + " via " + r.host + ":" + r.port);
    console.log("  Nothing was sent.");
  } else {
    console.log("  SMTP login FAILED: " + r.reason);
    console.log("");
    console.log("  535 / BadCredentials  -> wrong App Password, or a normal");
    console.log("                           account password was used.");
    console.log("  No credential         -> run deploy/set-mail-password.sh first.");
    process.exitCode = 1;
  }
}).catch(e => { console.log("  ERROR: " + e.message); process.exitCode = 1; });
'
