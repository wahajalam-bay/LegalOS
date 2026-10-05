#!/usr/bin/env node
/* FREEZE TODAY'S DOCUMENT ACCESS, THEN PROVE NOTHING MOVED.
 *
 * Authorization used to be recomputed from the record graph on every request,
 * so deduplicating contracts silently widened one document's readership and
 * narrowed three others'. This writes an explicit scope for every document,
 * seeded from exactly what the old rule grants right now, and then diffs the
 * two. A non-empty diff means the migration changed somebody's access and must
 * not be promoted.
 *
 *   node tools/document-scope-migrate.js           build + verify
 *   node tools/document-scope-migrate.js --verify  verify only
 */
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const scope = require("../api/document-scope.js");

(async () => {
  const verifyOnly = process.argv.includes("--verify");
  await drive.ensureIndex();
  const st = await registers.ensure();
  const files = drive.indexFiles();

  if (!verifyOnly) {
    const summary = scope.build({ files, registers: st.registers, reason: "migration" });
    console.log("scope written:", JSON.stringify(summary, null, 1));
  }

  const d = scope.diff({ files, registers: st.registers });
  console.log("\n=== SECURITY DIFF (old citation rule vs recorded scope) ===");
  console.log("  documents checked   ", d.checked);
  console.log("  widened             ", d.widened.length);
  console.log("  narrowed            ", d.narrowed.length);
  console.log("  no scope at all     ", d.unscoped.length);
  for (const w of d.widened.slice(0, 8)) console.log("    WIDENED  " + w.name + "  " + w.from.join("+") + " -> " + w.to.join("+"));
  for (const n of d.narrowed.slice(0, 8)) console.log("    NARROWED " + n.name + "  " + n.from.join("+") + " -> " + n.to.join("+"));
  for (const u of d.unscoped.slice(0, 8)) console.log("    NO SCOPE " + u.name + "  (" + u.root + ")");
  console.log(d.clean ? "\n  UNEXPLAINED SECURITY CHANGES = 0" : "\n  MIGRATION CHANGES ACCESS — do not promote");
  process.exit(d.clean ? 0 : 1);
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
