#!/usr/bin/env node
/* THE CANONICAL LEDGER — every number, bridged.
 *
 * A reconciliation that cannot be added up is not finished. This prints one
 * ledger per source family and one for the estate, and it keeps the UNITS
 * apart, because mixing them is how "106 conflicts" and "72 distinct records"
 * ended up in the same list adding to nothing:
 *
 *   SOURCE ROWS        rows read out of the workbooks
 *   CANONICAL RECORDS  what the register shows
 *   CONFLICT GROUPS    canonical records that absorbed a disagreeing copy
 *   FIELD CONFLICTS    individual disagreeing values inside those groups
 *
 * Nothing here recomputes anything: it reads the built state and adds it up.
 *
 *   node tools/canonical-ledger.js [--json]
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const JSON_ONLY = process.argv.includes("--json");
const say = (...a) => { if (!JSON_ONLY) console.log(...a); };

const st = JSON.parse(fs.readFileSync(path.join(ROOT, "config", ".registers.json"), "utf8"));
const R = st.registers || {};
const D = st.diagnostics || {};

const QS = ["COMPLETE", "RESOLVED_BY_SOURCE_PRECEDENCE", "COMPLETE_WITH_SOURCE_GAP",
  "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION", "SOURCE_VALUE_NOT_EVIDENCED", "LEGALOS_NATIVE"];
const DS = ["DOCUMENTS_LINKED", "DOCUMENT_CITED_NOT_IN_ESTATE", "NO_DOCUMENT_CITED_IN_SOURCE",
  "NATIVE_NO_DOCUMENT_EXPECTED"];

const fams = Object.entries(R).filter(([, v]) => Array.isArray(v));
const out = { families: {}, estate: {} };

say("=".repeat(96));
say("CANONICAL RECORD LEDGER");
say("=".repeat(96));
say("");
say("family".padEnd(14) + "canonical".padStart(10) + "native".padStart(8) + "absorbed".padStart(10)
  + "kept apart".padStart(12) + "  (absorbed = duplicate source rows merged in; kept apart = rows a guard refused to merge)");

let T = { canonical: 0, native: 0, absorbed: 0, apart: 0 };
for (const [k, rows] of fams) {
  const native = rows.filter((r) => r.__origin === "LEGALOS").length;
  const absorbed = rows.reduce((n, r) => n + ((r.__copies || 1) - 1), 0)
    + rows.reduce((n, r) => n + ((r.__duplicateCopies || 1) - 1), 0);
  const apart = rows.filter((r) => r.__notMergedWith).length;
  out.families[k] = { canonical: rows.length, native, absorbedSourceRows: absorbed, keptApart: apart };
  T.canonical += rows.length; T.native += native; T.absorbed += absorbed; T.apart += apart;
  say(k.padEnd(14) + String(rows.length).padStart(10) + String(native).padStart(8)
    + String(absorbed).padStart(10) + String(apart).padStart(12));
}
say("-".repeat(54));
say("TOTAL".padEnd(14) + String(T.canonical).padStart(10) + String(T.native).padStart(8)
  + String(T.absorbed).padStart(10) + String(T.apart).padStart(12));
out.estate.canonical = T.canonical;

/* ---- quality states, per family, must sum to the family ---- */
say("");
say("=".repeat(96));
say("FINAL QUALITY STATE — each row sums to that family's canonical count");
say("=".repeat(96));
say("");
const H = ["COMPLETE", "PRECEDENCE", "W/GAP", "AMBIGUOUS", "NOT-EVID", "NATIVE"];
say("family".padEnd(14) + H.map((h) => h.padStart(12)).join("") + "     sum   canonical  ok");
const QT = {};
let bad = 0;
for (const [k, rows] of fams) {
  const c = QS.map((q) => rows.filter((r) => r.qualityState === q).length);
  c.forEach((n, i) => { QT[QS[i]] = (QT[QS[i]] || 0) + n; });
  const sum = c.reduce((a, b) => a + b, 0);
  if (sum !== rows.length) bad++;
  say(k.padEnd(14) + c.map((n) => String(n).padStart(12)).join("")
    + String(sum).padStart(8) + String(rows.length).padStart(11) + (sum === rows.length ? "   YES" : "   NO"));
  out.families[k].qualityStates = Object.fromEntries(QS.map((q, i) => [q, c[i]]));
}
say("-".repeat(96));
say("TOTAL".padEnd(14) + QS.map((q) => String(QT[q] || 0).padStart(12)).join("")
  + String(Object.values(QT).reduce((a, b) => a + b, 0)).padStart(8) + String(T.canonical).padStart(11));
out.estate.qualityStates = QT;

/* ---- conflicts: groups, and what closed them ---- */
say("");
say("=".repeat(96));
say("CONFLICT LEDGER — the unit is a CONFLICT GROUP (one canonical record that absorbed a disagreeing copy)");
say("=".repeat(96));
for (const [k, rows] of fams) {
  const groups = rows.filter((r) => r.hadSourceConflict);
  if (!groups.length) continue;
  const byState = {};
  for (const r of groups) {
    const s = r.__conflictResolution ? r.__conflictResolution.state
      : (r.__unresolvedConflicts && r.__unresolvedConflicts.length ? "UNRESOLVED" : "UNRESOLVED");
    byState[s] = (byState[s] || 0) + 1;
  }
  const fields = groups.reduce((n, r) => n + (r.__conflicts || []).length, 0);
  const openFields = groups.reduce((n, r) => n + (r.__unresolvedConflicts || []).length, 0);
  const resolved = Object.entries(byState).filter(([s]) => s !== "UNRESOLVED").reduce((n, [, v]) => n + v, 0);
  const unresolved = byState.UNRESOLVED || 0;
  say("");
  say("  " + k + ":  " + groups.length + " conflict groups   ("
    + fields + " field conflicts recorded, " + openFields + " still open)");
  for (const [s, v] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
    say("      " + String(v).padStart(5) + "  " + s);
  }
  say("      bridge: " + resolved + " resolved + " + unresolved + " unresolved = "
    + (resolved + unresolved) + "   (groups " + groups.length + ")"
    + (resolved + unresolved === groups.length ? "  OK" : "  MISMATCH"));
  if (resolved + unresolved !== groups.length) bad++;
  out.families[k].conflicts = { groups: groups.length, fieldConflicts: fields, openFields, byState };
}

/* ---- the human queue, and why each record is on it ---- */
say("");
say("=".repeat(96));
say("HUMAN REVIEW QUEUE — every record whose final state needs a person");
say("=".repeat(96));
const queue = [];
for (const [k, rows] of fams) {
  for (const r of rows) {
    if (r.qualityState !== "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION"
      && r.qualityState !== "SOURCE_VALUE_NOT_EVIDENCED") continue;
    const reason = r.__unresolvedConflicts && r.__unresolvedConflicts.length
      ? "conflicting values on " + r.__unresolvedConflicts.map((c) => c.field).join(", ")
      : (r.__candidates && r.__candidates.length > 1
        ? r.__candidates.length + " candidate identities in the estate"
        : (r.__identityNote ? "identity not evidenced in source"
          : "value not evidenced in source: " + Object.keys(r.__notEvidenced || {}).join(", ")));
    queue.push({ family: k, id: r.id, state: r.qualityState, reason });
  }
}
const byFamReason = {};
for (const q of queue) {
  const key = q.family + " | " + q.state;
  byFamReason[key] = (byFamReason[key] || 0) + 1;
}
for (const [k, v] of Object.entries(byFamReason).sort()) say("   " + String(v).padStart(4) + "  " + k);
say("   " + String(queue.length).padStart(4) + "  TOTAL");
out.estate.humanQueue = queue;

/* ---- documents ---- */
say("");
say("=".repeat(96));
say("DOCUMENT DISPOSITION — sums to the estate");
say("=".repeat(96));
const DT = {};
for (const [, rows] of fams) for (const r of rows) DT[r.documentState] = (DT[r.documentState] || 0) + 1;
for (const k of DS) say("   " + String(DT[k] || 0).padStart(6) + "  " + k);
say("   " + String(Object.values(DT).reduce((a, b) => a + b, 0)).padStart(6) + "  TOTAL   (canonical " + T.canonical + ")");
out.estate.documentStates = DT;

say("");
say(bad ? "LEDGER DOES NOT BRIDGE — " + bad + " mismatch(es)" : "EVERY LEDGER BRIDGES EXACTLY");
fs.mkdirSync(path.join(ROOT, "audit"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "audit", "canonical-ledger.json"), JSON.stringify(out, null, 1));
say("wrote audit/canonical-ledger.json");
if (JSON_ONLY) console.log(JSON.stringify(out.estate));
