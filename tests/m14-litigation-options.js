// EVERY DROP-DOWN IN "RAISE A CASE", DRIVEN THE WAY A LAWYER DRIVES IT.
//
// THE INCIDENT THIS ENCODES
// The wizard shipped with every menu empty. Step 2 offered a Case Type list
// containing only "Select…", a Nature field captioned "0 already used in the
// register" and an Internal Entity field captioned "0 entities in the
// register" -- beside a live register holding 357 cases, 61 courts, 24 case
// categories and 37 entity spellings.
//
// TWO faults produced that one screen, and only the second is a coding bug:
//
//   1. The live server was running a build started a day before
//      api/litigation-routes.js was written, so GET /api/litigation/meta
//      answered 404 {"error":"unknown route"}. Node resolves require() once at
//      start-up: a NEW server file is not picked up by a running process the
//      way a path-versioned front-end file is. Nothing in the test suite could
//      have caught this, because every suite starts its own fresh server --
//      which is exactly why it went unnoticed.
//
//   2. The client turned ANY failure into `{ caseTypes: [], suggest: {} }`.
//      A dead endpoint and a genuinely empty estate rendered identically. The
//      screen reported a data problem that did not exist and concealed a
//      deployment problem that did.
//
// Fault 2 is the one that must never come back, so the checks below care less
// about "are there options" than about "can a zero ever be a lie". A count of
// zero is a claim about this business; an outage must never be able to make
// that claim.
//
//   node tests/m14-litigation-options.js
const H = require("./_harness.js");

H.runSuite("m14-litigation-options — a zero is a fact about the estate, never an outage", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_OPTS_PORT", portFallback: "4852", prefix: "legalos-opts-",
  }));

  const cookie = await H.loginApi(sb, H.USERS.litLead.email);
  const meta = await H.request(sb.base, "GET", "/api/litigation/meta", { cookie });
  check("the option endpoint answers at all", meta.status === 200,
    "HTTP " + meta.status + (meta.status === 404 ? " — the route is missing from THIS build" : ""));
  const body = meta.body || {};
  const L = body.lists || {};

  /* ---- 1. SOURCE -> API, for every menu the wizard opens ------------------
     The counts are read out of the register the server is actually serving, so
     this reconciles rather than asserting numbers somebody typed into a test.
     A hard-coded 61 would start failing the day the business files its 62nd
     court, which is not a defect. */
  const reg = await H.request(sb.base, "GET", "/api/registers/litigation?limit=2000", { cookie });
  const rows = (reg.body && (reg.body.rows || reg.body.records || reg.body.items)) || [];
  check("the litigation register is readable, so source counts can be derived",
    rows.length > 0, rows.length + " rows");

  const distinct = (f) => {
    const s = new Set();
    for (const r of rows) { const v = String(r[f] == null ? "" : r[f]).trim(); if (v) s.add(v.toLowerCase()); }
    return s.size;
  };
  const apiCount = (k) => (L[k] ? L[k].count : -1);

  /* Derived lists fold near-duplicate spellings ("Civil Dispute" absorbs the
     four rows filed as "Civil Dipute"), so the API count is allowed to be at
     or below the raw distinct count, never above it by more than the canonical
     vocabulary padded in behind. What must NEVER happen is an empty API list
     against a populated source. */
  const reconcile = (label, key, sourceField) => {
    const src = distinct(sourceField), api = apiCount(key);
    check("source -> API reconciles for " + label,
      src > 0 ? api > 0 : true,
      "source=" + src + "  api=" + api + "  status=" + (L[key] && L[key].status));
  };
  reconcile("case categories", "categories", "nature");
  reconcile("courts", "courts", "court");
  reconcile("counsel", "counsel", "counsel");
  reconcile("party roles", "positions", "position");

  check("entities come from the canonical registry, not only the litigation column",
    apiCount("entities") >= distinct("entity"),
    "registry+register=" + apiCount("entities") + "  litigation column alone=" + distinct("entity"));
  check("case owners are real accounts", apiCount("owners") > 0, apiCount("owners") + " people on the roster");

  /* ---- 2. NO MENU IS SILENTLY EMPTY -------------------------------------- */
  const empty = Object.entries(L).filter(([, v]) => (v.count || 0) === 0);
  check("no option list is empty", empty.length === 0,
    empty.length ? empty.map(([k, v]) => k + " (" + v.status + ")").join(", ") : Object.keys(L).length + " lists, all populated");
  const failed = Object.entries(L).filter(([, v]) => v.status !== "ok");
  check("no option list reports a failure", failed.length === 0,
    failed.length ? failed.map(([k, v]) => k + ": " + (v.error || v.status)).join(" | ") : "all ok");

  /* ---- 3. EVERY LIST CARRIES ITS OWN STATE -------------------------------
     This is the check that makes fault 2 impossible to reintroduce: a count is
     never returned without the status that explains it. */
  const statusless = Object.entries(L).filter(([, v]) => typeof v.status !== "string");
  check("every list reports loading/ok/failed alongside its count", statusless.length === 0,
    statusless.map(([k]) => k).join(", ") || "all lists carry a status");

  /* ---- 4. THE CLASSIFICATION IS ONE FIELD, NOT TWO ----------------------- */
  const cats = (L.categories && L.categories.options) || [];
  const fromRegister = cats.filter((c) => c.inRegister).length;
  check("the case categories offered are the ones the register is filed under",
    fromRegister > 0 && cats.some((c) => /civil dispute/i.test(c.name)),
    fromRegister + " of " + cats.length + " categories are in live use");
  const civil = cats.find((c) => /^civil dispute$/i.test(c.name));
  check("a misspelling is folded into the spelling the business actually uses",
    !!civil && (civil.aliases || []).some((a) => /dipute/i.test(a)),
    civil ? "Civil Dispute absorbs " + JSON.stringify(civil.aliases) + " (n=" + civil.n + ")" : "not found");
  check("the benchmark family is derived from the category, not asked for separately",
    !!(body.families && body.families["Employee Dispute"]),
    "Employee Dispute -> " + (body.families || {})["Employee Dispute"]);

  /* ---- 5. PICKING A COURT FILLS IN WHAT THE COURT ALREADY TELLS US ------- */
  const cm = body.courtMeta || {};
  const withCity = Object.values(cm).filter((c) => c.city).length;
  check("choosing a forum derives its city", withCity > 0,
    withCity + " of " + Object.keys(cm).length + " courts resolve a city");
  check("choosing a forum derives its jurisdiction",
    Object.values(cm).filter((c) => c.jurisdiction).length > 0,
    "e.g. " + JSON.stringify(Object.entries(cm)[0] || []));

  /* ---- 6. THE CLIENT IS NOT A SECURITY BOUNDARY (§29/§30) ---------------- */
  const bad = async (payload, what) => {
    const r = await H.request(sb.base, "POST", "/api/litigation/cases", { cookie, body: payload });
    check(what, r.status >= 400, "HTTP " + r.status + " " + JSON.stringify((r.body || {}).errors || ""));
  };
  await bad({ title: "Injected direction", direction: "Whatever I Like" }, "a direction outside the vocabulary is refused");
  await bad({ title: "Injected risk", risk: "Catastrophic" }, "a risk outside the vocabulary is refused");
  await bad({ title: "Injected priority", priority: "Immediately" }, "a priority outside the vocabulary is refused");
  await bad({ title: "Injected owner", ownership: { owner: "attacker@example.com" } },
    "a case owner who has no account is refused");

  /* An open list still accepts a genuinely new value -- a forum this business
     has not used before is a real event, not an attack. */
  const okNew = await H.request(sb.base, "POST", "/api/litigation/cases", {
    cookie, body: { title: "A forum we have not used before", court: { name: "Gilgit-Baltistan Chief Court" }, allowDuplicate: true },
  });
  check("an open list still accepts a value the register has not seen", okNew.status === 200 || okNew.status === 201,
    "HTTP " + okNew.status);

  /* ---- 7. A CASE MADE ONLY FROM MENU CHOICES COMES BACK INTACT (§38) ----- */
  const chosen = {
    title: "Options end-to-end fixture",
    nature: (cats[0] || {}).name,
    direction: (L.directions.options || [])[1],
    entity: ((L.entities.options || [])[0] || {}).name,
    court: { name: Object.keys(cm)[0] },
    risk: (L.risks.options || [])[0],
    priority: (L.priorities.options || [])[0],
    ownership: { owner: ((L.owners.options || [])[0] || {}).email },
    allowDuplicate: true,
  };
  const made = await H.request(sb.base, "POST", "/api/litigation/cases", { cookie, body: chosen });
  check("a case built only from menu selections is created", made.status === 200 || made.status === 201,
    "HTTP " + made.status + " " + JSON.stringify((made.body || {}).errors || ""));
  const id = made.body && made.body.id;
  const got = id ? await H.request(sb.base, "GET", "/api/litigation/cases/" + id, { cookie }) : { body: {} };
  const c = (got.body && (got.body.case || got.body)) || {};
  const same = (label, a, b) => check("the created case keeps the chosen " + label, a === b, JSON.stringify(a) + " vs " + JSON.stringify(b));
  same("category", c.nature, chosen.nature);
  same("direction", c.direction, chosen.direction);
  same("entity", c.entity, chosen.entity);
  same("court", c.court && c.court.name, chosen.court.name);
  same("risk", c.risk, chosen.risk);
  same("priority", c.priority, chosen.priority);
  same("owner", c.ownership && c.ownership.owner, chosen.ownership.owner);
  check("the benchmark family was derived rather than left blank", !!c.caseType,
    chosen.nature + " -> " + c.caseType);

  /* ---- 7b. EXPOSURE AND RECOVERABLE ARE HELD IN BOTH CURRENCIES ----------
     The imported register carries exposurePKR/exposureUSD and recoverablePKR/
     recoverableUSD. A case raised in the app that could only record one
     currency would not reconcile against the 357 rows already there. */
  const fx = await H.request(sb.base, "POST", "/api/litigation/cases", {
    cookie, body: {
      title: "Both currencies fixture", allowDuplicate: true,
      financial: { exposurePKR: 5000000, exposureUSD: 18000, recoverablePKR: 750000, recoverableUSD: 2700 },
    },
  });
  check("a case can be raised with both currencies", fx.status === 200 || fx.status === 201, "HTTP " + fx.status);
  const fxId = fx.body && fx.body.id;
  const fxGot = fxId ? await H.request(sb.base, "GET", "/api/litigation/cases/" + fxId, { cookie }) : { body: {} };
  const ff = ((fxGot.body && (fxGot.body.case || fxGot.body)) || {}).financial || {};
  check("exposure is kept in PKR and USD", Number(ff.exposurePKR) === 5000000 && Number(ff.exposureUSD) === 18000,
    JSON.stringify({ pkr: ff.exposurePKR, usd: ff.exposureUSD }));
  check("recoverable is kept in PKR and USD", Number(ff.recoverablePKR) === 750000 && Number(ff.recoverableUSD) === 2700,
    JSON.stringify({ pkr: ff.recoverablePKR, usd: ff.recoverableUSD }));

  const fxReg = await H.request(sb.base, "GET", "/api/registers/litigation?limit=2000", { cookie });
  const fxRow = ((fxReg.body && (fxReg.body.rows || fxReg.body.records || fxReg.body.items)) || [])
    .find((r) => r.id === fxId);
  check("both currencies reach the register row, in the register's own columns",
    !!fxRow && Number(fxRow.exposureUSD) === 18000 && Number(fxRow.recoverableUSD) === 2700,
    fxRow ? JSON.stringify({ ePKR: fxRow.exposurePKR, eUSD: fxRow.exposureUSD, rPKR: fxRow.recoverablePKR, rUSD: fxRow.recoverableUSD }) : "row not found");

  const csv = await H.request(sb.base, "GET", "/api/litigation/export", { cookie });
  const head = String(csv.body || csv.text || "").split("\n")[0];
  check("the export carries both currencies too",
    /Exposure \(USD\)/.test(head) && /Recoverable \(USD\)/.test(head), head.slice(0, 200));

  /* ---- 8. AND THE REGISTER SHOWS IT --------------------------------------- */
  const after = await H.request(sb.base, "GET", "/api/registers/litigation?limit=2000", { cookie });
  const arows = (after.body && (after.body.rows || after.body.records || after.body.items)) || [];
  const mine = arows.find((r) => r.id === id || /Options end-to-end fixture/.test(String(r.caseName || r.title || "")));
  check("the new case appears in the litigation register", !!mine,
    mine ? "found as " + (mine.id || mine.caseName) : "not in " + arows.length + " rows");
});
