// THE ASSISTANT — scope, and the data boundary.
//
// Two things about this surface can go wrong quietly, and both would be
// invisible from the screen:
//
//   1. It could answer from records the asker may not read. Nothing in the
//      answer would say so.
//   2. It could send the contents of documents to Anthropic. The answer would
//      look better, and nobody would know.
//
// Most of this suite runs in DRY mode, which builds exactly the payload that
// would be sent and returns it without calling Claude — so scope and the
// boundary are checked on every single run, for free, without spending the
// account's plan. One live call at the end proves the CLI path still works.
//
//   node tests/m5-assistant.js
const H = require("./_harness.js");

H.runSuite("m5-assistant — scoped to the asker, and no document text leaves", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_ASSISTANT_PORT", portFallback: "4862", prefix: "legalos-as-",
  }));

  /* ------------------------------------------------------------ the boundary
     Checked against the module directly, because this is the rule that matters
     most and it should not depend on a route being wired correctly. */
  const claude = require("../api/claude-cli.js");

  const withText = {
    id: "CTR-1", title: "Lease Agreement", counterParty: "Zaheer Iqbal",
    proceedings: "The court observed that the respondent had failed to appear.",
    outcome: "Decided in favour of the plaintiff with costs.",
    driveFiles: [{ id: "x", name: "lease.pdf" }],
    __raw: { sheet: "Contracts", row: 44 },
    evidence: [{ quote: "WHEREAS the Lessor hereby demises" }],
  };
  const sent = claude.project(withText, "t") || {};
  check("a record crosses the boundary with its identifying fields",
    sent.id === "CTR-1" && sent.counterParty === "Zaheer Iqbal", JSON.stringify(sent));
  check("narrative fields never cross (proceedings, outcome)",
    !("proceedings" in sent) && !("outcome" in sent), Object.keys(sent).join(","));
  check("file lists and raw source rows never cross",
    !("driveFiles" in sent) && !("__raw" in sent), Object.keys(sent).join(","));
  check("evidence quotations never cross — 80 characters of a contract is still the contract",
    !("evidence" in sent), Object.keys(sent).join(","));

  const prosey = claude.project({ id: "X", title: ("the parties hereby agree ").repeat(20) }, "t") || {};
  check("an allowlisted field holding prose is dropped, not sent",
    !prosey.title, JSON.stringify(prosey).slice(0, 60));

  /* The module must not READ the document caches. Grepping the raw source for
     "cache/content" matched the comment that says it never does — a check that
     failed on the sentence promising the thing it was checking. Strip comments
     first, then look at the code. */
  {
    const src = require("fs").readFileSync(require.resolve("../api/claude-cli.js"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    check("the module's CODE never opens the document caches",
      !/cache["'\s,)\]]*[\/+].{0,20}(content|commercial)/.test(code) && !/deepText|textOf/.test(code),
      "no read of cache/content or cache/commercial in executable code");
  }

  /* ------------------------------------------------------------------ scope */
  const admin = await H.loginApi(sb, H.USERS.director.email);
  const st = await H.request(sb.base, "GET", "/api/assistant/status", { cookie: admin });
  check("status reports how it is authenticated", st.status === 200 && !!st.body.policy,
    JSON.stringify(st.body).slice(0, 120));

  const anon = await H.request(sb.base, "GET", "/api/assistant/status", {});
  check("an unauthenticated caller is refused", anon.status === 401, "HTTP " + anon.status);

  /* The assistant must see EXACTLY the families the register endpoint already
     gives this person — not one more. Comparing the two is the check; hard-
     coding a family list would only encode today's permissions. */
  for (const key of ["complLead", "complMember", "litMember", "commMember", "director"]) {
    const email = H.USERS[key].email;
    const cookie = await H.loginApi(sb, email);
    const reg = await H.request(sb.base, "GET", "/api/registers", { cookie });
    const regFams = Object.keys((reg.body && reg.body.counts) || {}).sort();
    const dry = await H.request(sb.base, "POST", "/api/assistant/ask", { cookie, body: { question: "x", dry: true } });
    const aiFams = Object.keys((dry.body && dry.body.askedOver) || {}).sort();
    check(key + ": the assistant sees exactly the registers they may read",
      JSON.stringify(regFams) === JSON.stringify(aiFams),
      "registers [" + regFams.join(",") + "] vs assistant [" + aiFams.join(",") + "]");
  }

  /* Nothing narrative in the payload that would actually be sent. */
  const cookie = await H.loginApi(sb, H.USERS.director.email);
  const dry = await H.request(sb.base, "POST", "/api/assistant/ask", { cookie, body: { question: "x", dry: true } });
  const flat = JSON.stringify(dry.body.sample || {});
  check("the payload carries no narrative field",
    !/"(proceedings|outcome|details|comments)":/.test(flat), flat.slice(0, 80));
  check("the payload carries no document list",
    !/"driveFiles":/.test(flat) && !/"__source":/.test(flat), flat.slice(0, 80));
  check("the withheld fields are reported, not silently dropped",
    Array.isArray(dry.body.withheldFieldNames) && dry.body.withheldFieldNames.length > 0,
    (dry.body.withheldFieldNames || []).slice(0, 6).join(", "));

  /* The true size of each register must travel with the sample, or a count
     drawn from 120 rows gets stated as the size of a 357-row book. */
  check("the true register sizes accompany the sample",
    dry.body.registerTotals && dry.body.registerTotals.litigation > dry.body.askedOver.litigation,
    "sent " + dry.body.askedOver.litigation + " of " + (dry.body.registerTotals || {}).litigation);

  /* --------------------------------------------- the document-reading gate
     This is the one path that CAN transmit a document. It must be shut unless
     a person has named folders, and it must say so rather than implying it is
     merely unavailable. */
  const gate = await H.request(sb.base, "GET", "/api/assistant/reader/status", { cookie });
  check("the document reader reports its gate", gate.status === 200 && typeof gate.body.transmitsDocuments === "boolean",
    JSON.stringify(gate.body).slice(0, 140));
  /* The gate is OPEN for Commercial, by the estate owner's explicit instruction.
     So the invariant worth defending is no longer "nothing is allowlisted" — it
     is that the allowlist contains ONLY what was authorised. A disclosure
     decision must never widen by accident, and the modules that were not
     authorised are named here so adding one fails this suite loudly. */
  const allow = gate.body.allowlist || [];
  check("every allowlisted folder is one that was authorised (Commercial only)",
    allow.length > 0 && allow.every((a) => /^Commercial/.test(a)),
    JSON.stringify(allow));
  for (const forbidden of ["Compliance Data", "Litigation & Dispute", "Entities data for secp filing"]) {
    check("the " + forbidden + " root is NOT allowlisted for transmission",
      !allow.some((a) => String(a).startsWith(forbidden)),
      JSON.stringify(allow));
  }

  const reader = require("../api/claude-reader.js");
  const someFile = { id: "x", name: "a.pdf", folderPath: "Commercial_Zameen Media Contracts / anything", size: 1000 };
  check("the gate refuses a document whose folder is not allowlisted",
    reader.maySend(someFile, { enabled: true, allow: ["Compliance Data"] }).ok === false,
    reader.maySend(someFile, { enabled: true, allow: ["Compliance Data"] }).why);
  check("the gate refuses everything when the allowlist is empty",
    reader.maySend(someFile, { enabled: true, allow: [] }).ok === false,
    reader.maySend(someFile, { enabled: true, allow: [] }).why);
  check("an allowlisted folder prefix does permit its documents",
    reader.maySend(someFile, { enabled: true, allow: ["Commercial_Zameen Media Contracts"] }).ok === true);

  /* ------------------------------------------------------ one record, scoped */
  const cRows = await H.request(sb.base, "GET", "/api/registers/contracts?limit=5", { cookie });
  const rows = (cRows.body && (cRows.body.rows || cRows.body.records || cRows.body.items)) || [];
  if (rows.length) {
    const target = rows.find((r) => (r.driveFiles || []).length) || rows[0];
    const denied = await H.request(sb.base, "POST", "/api/assistant/record", {
      cookie: await H.loginApi(sb, H.USERS.complLead.email),
      body: { family: "contracts", id: target.id },
    });
    check("a compliance account cannot summarise a contract record",
      denied.status === 403, "HTTP " + denied.status);
  }

  /* ------------------------------------------------------------- one live call
     Skipped, loudly, when the server has no Claude credentials — a missing
     login is a deployment fact, not a test failure. */
  const status = st.body || {};
  if (!status.installed || !status.signedIn) {
    check("live call skipped: the server is not signed in to Claude", true,
      "installed=" + status.installed + " signedIn=" + status.signedIn);
  } else {
    const live = await H.request(sb.base, "POST", "/api/assistant/ask", {
      cookie, body: { question: "How many litigation matters does the register hold? Answer with the number only." },
    });
    check("a real question is answered through the CLI",
      live.status === 200 && live.body.ok && typeof live.body.answer === "string" && live.body.answer.length > 0,
      String(live.body && (live.body.answer || live.body.error)).slice(0, 100));
    /* Compared against the register's ACTUAL total, not a literal. Hardcoding
       the number made this fail the moment the legal team raised a case in
       LegalOS -- the assistant was right and the assertion was stale. */
    const litTotal = ((await H.request(sb.base, "GET", "/api/registers/litigation?limit=1", { cookie })).body || {}).total;
    check("the answer states the true register size, not the sample size",
      !!litTotal && new RegExp("\\b" + litTotal + "\\b").test(String(live.body && live.body.answer)),
      "register holds " + litTotal + "; answer: " + String(live.body && live.body.answer).slice(0, 90));
    check("the response declares that it answered from a sample",
      live.body && live.body.partial === true, "partial=" + (live.body && live.body.partial));
  }
});
