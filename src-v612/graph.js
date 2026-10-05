// The legal graph — one entity-joined view over every live register, so any
// record can find its related records (and their documents) across modules.
// This is what powers the universal Record 360 drill-down.
import { useMemo } from "./core.js";
import { useRegister } from "./live.js";

export const normEntity = (s) => String(s || "").toLowerCase()
  .replace(/\(.*?\)/g, " ")
  .replace(/\b(private|pvt|limited|ltd|smc|company|group|the|and|co)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
// Distinct lowercase word tokens of length >= 3.
const nameTokens = (s) => [...new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((t) => t.length >= 3))];

// Which field names the entity for each record kind.
export const ENTITY_OF = {
  contract: (r) => r.entityName,
  litigation: (r) => r.entity,
  notice: (r) => r.recipient,
  licence: (r) => r.entity,
  loan: (r) => r.borrower,
  resolution: (r) => r.entity,
  property: (r) => r.entity,
};
const EMPTY = { contract: [], litigation: [], notice: [], licence: [], loan: [], resolution: [], property: [] };

// The OTHER party on a record — not the group entity. For a case "Zameen v. X"
// it is X; for a contract it is the counterparty; for a notice it is whichever
// side is not Zameen; for a loan it is the lender.
export const OTHER_PARTY = {
  contract: (r) => r.counterparty || "",
  litigation: (r) => {
    const n = String(r.caseName || r.title || "");
    const parts = n.split(/\s+(?:v\.?|vs\.?|versus)\s+/i);
    const nonZ = parts.find((p) => !/zameen/i.test(p)) || parts[parts.length - 1] || "";
    return nonZ.replace(/^\s*(the\s+)?state\b/i, "").trim();
  },
  notice: (r) => (/zameen/i.test(r.recipient || "") ? r.sender : r.recipient) || "",
  loan: (r) => r.lender || "",
};
// Party name tokens, minus the group-company words and generic legal/business
// words that would falsely join unrelated parties. Length >= 4 to stay distinctive.
const PARTY_STOP = new Set(("zameen media developments development pvt private limited ltd smc company companies group holding holdings corp the and for co llc inc " +
  "marketing real estate builder builders developer developers society associates enterprises trading services consulting international national " +
  // generic case/party words that must never join two unrelated parties
  "another other others ors anr etc versus mr mrs messrs miss sons brothers store stores general").split(" "));
const partyTokens = (s) => nameTokens(s).filter((t) => t.length >= 4 && !PARTY_STOP.has(t));

export function useLegalGraph() {
  const C = useRegister("contracts"), L = useRegister("litigation"), N = useRegister("notices");
  const Li = useRegister("licences"), Lo = useRegister("loans"), R = useRegister("resolutions"), P = useRegister("properties");
  const loading = C.loading || L.loading || N.loading || Li.loading || Lo.loading || R.loading || P.loading;
  const byEntity = useMemo(() => {
    const m = new Map();
    const push = (kind, raw, r) => {
      const k = normEntity(raw);
      if (!k || k.length < 3) return;
      let e = m.get(k);
      if (!e) { e = { key: k, name: raw, contract: [], litigation: [], notice: [], licence: [], loan: [], resolution: [], property: [] }; m.set(k, e); }
      if (raw && String(raw).length > String(e.name).length) e.name = raw;
      e[kind].push(r);
    };
    (C.rows || []).forEach((r) => push("contract", r.entityName, r));
    (L.rows || []).forEach((r) => push("litigation", r.entity, r));
    (N.rows || []).forEach((r) => push("notice", r.recipient, r));
    (Li.rows || []).forEach((r) => push("licence", r.entity, r));
    (Lo.rows || []).forEach((r) => push("loan", r.borrower, r));
    (R.rows || []).forEach((r) => push("resolution", r.entity, r));
    (P.rows || []).forEach((r) => push("property", r.entity, r));
    return m;
  }, [C.rows, L.rows, N.rows, Li.rows, Lo.rows, R.rows, P.rows]);

  // Everything sharing a record's entity, across families. This is the ENTITY
  // hub view (used by /companies) — deliberately broad.
  const relatedTo = (kind, rec) => {
    const raw = (ENTITY_OF[kind] || (() => null))(rec);
    if (!raw) return { name: "", ...EMPTY };
    return byEntity.get(normEntity(raw)) || { name: raw, ...EMPTY };
  };

  // Records that share the OTHER PARTY — the counterparty in a contract, the
  // opponent in a case, the lender on a loan, the non-Zameen side of a notice.
  // The group entity (Zameen Media) owns almost the whole book, so it is a
  // useless "relation"; the counterparty is what actually connects two records.
  const partyIdx = useMemo(() => {
    const idx = new Map(), df = new Map();
    const add = (kind, rec) => {
      const toks = [...new Set(partyTokens((OTHER_PARTY[kind] || (() => ""))(rec)))];
      for (const t of toks) { if (!idx.has(t)) idx.set(t, []); idx.get(t).push({ kind, rec }); df.set(t, (df.get(t) || 0) + 1); }
    };
    (C.rows || []).forEach((r) => add("contract", r));
    (L.rows || []).forEach((r) => add("litigation", r));
    (N.rows || []).forEach((r) => add("notice", r));
    (Lo.rows || []).forEach((r) => add("loan", r));
    return { idx, df };
  }, [C.rows, L.rows, N.rows, Lo.rows]);

  const relatedByParty = (kind, rec) => {
    const party = (OTHER_PARTY[kind] || (() => ""))(rec);
    const toks = [...new Set(partyTokens(party))];
    const groups = { ...EMPTY };
    if (!toks.length) return { name: party, groups, count: 0 };
    const seen = new Map(); // rec -> {kind, rec, shared, rare}
    for (const t of toks) {
      const df = partyIdx.df.get(t) || 0;
      if (df > 12) continue; // too common (e.g. "Muhammad", "Ahmed") to mean "same party"
      for (const cand of partyIdx.idx.get(t) || []) {
        if (cand.rec === rec) continue;
        const e = seen.get(cand.rec) || { kind: cand.kind, rec: cand.rec, shared: 0, rare: false };
        e.shared++; if (df <= 4) e.rare = true; seen.set(cand.rec, e);
      }
    }
    let count = 0;
    // Accept only a genuine party match: two shared name tokens, or one that is
    // truly distinctive (a rare surname/company word). A single common-ish token
    // never links two people.
    for (const v of seen.values()) { if (v.shared >= 2 || v.rare) { groups[v.kind].push(v.rec); count++; } }
    return { name: party, groups, count };
  };
  return { loading, byEntity, relatedTo, relatedByParty };
}
