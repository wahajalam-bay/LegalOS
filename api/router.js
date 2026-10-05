// The /api surface. Every route except /api/health requires a Cloudflare
// Access identity that this server verified itself — see access.js.
const zlib = require("zlib");
const fs = require("fs");
const { identify } = require("./access");
const auth = require("./auth");
const { principalFor, rosterSummary } = require("./identity");
const { redactedStatus, load } = require("./config");
const drive = require("./drive");
const registers = require("./registers");
const docScope = require("./document-scope");
const tplLib = require("./template-library");
const mail = require("./mail");

const MAX_BODY = 256 * 1024;

// Register payloads are large — the contracts list alone is ~1MB of JSON, and
// it compresses to about 7% of that. Compressing here rather than at nginx
// keeps the change inside this app instead of altering a shared config every
// other dashboard on this box depends on.
function json(res, code, obj, req) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  const wants = req && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (wants && body.length > 1400) {
    const gz = zlib.gzipSync(body, { level: 6 });
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = gz.length;
    res.writeHead(code, headers);
    return res.end(gz);
  }
  headers["Content-Length"] = body.length;
  res.writeHead(code, headers);
  res.end(body);
}

/* ---------------------------------------------------------------- document scope

   A document belongs to the module that owns it, and module access is what
   decides who may read it. Without this, the register gate was theatre: a
   Compliance-only account was correctly refused /api/registers/litigation and
   then downloaded a litigation case file byte-for-byte through
   /api/knowledge/file/<id>, because the knowledge routes only asked "are you in
   the legal department".

   Scope is resolved deterministically, never by guesswork:
     1. the families whose records LINK the file (the mapping the ingest built);
     2. otherwise the Drive ROOT it is filed under — the legal team files by
        practice area, so the root IS the classification;
     3. otherwise it is unscoped shared material (templates, precedents), which
        needs the `shared` group.
*/
const FAMILY_GROUP = {
  contracts: "commercial", properties: "commercial",
  litigation: "litigation", notices: "litigation",
  licences: "compliance", loans: "compliance", resolutions: "compliance",
};
/* The module group that owns each Drive root. Delegated to the authorization
   module so the classification and the policy that depends on it cannot drift
   apart. */
const rootGroup = docScope.rootGroup;

let DOC_SCOPE = { builtAt: 0, byFile: new Map() };
async function documentScope() {
  const st = await registers.ensure();
  if (DOC_SCOPE.builtAt === st.builtAt && DOC_SCOPE.byFile.size) return DOC_SCOPE.byFile;
  const byFile = new Map();
  for (const [famKey, rows] of Object.entries(st.registers || {})) {
    const grp = FAMILY_GROUP[famKey];
    if (!grp || !Array.isArray(rows)) continue;
    for (const r of rows) for (const f of r.driveFiles || []) {
      if (!byFile.has(f.id)) byFile.set(f.id, new Set());
      byFile.get(f.id).add(grp);
    }
  }
  DOC_SCOPE = { builtAt: st.builtAt, byFile };
  return byFile;
}
/* MAY THIS CALLER READ THIS DRIVE FILE?
   One function, one policy, for every document surface: stream, preview,
   download, metadata, search, tree, folder listing and counts.

   It used to decide from the LIVE record graph — readable by whichever groups
   cite it, else by its Drive root. That made record identity a security
   decision, and deduplicating eight contracts proved it: a merge dropped one
   document's only citation and the no-citation fallback handed it to everyone
   with access to the root it sat in, while the correction pulled three
   Compliance-root files out of Compliance's reach. Neither was intended.

   The scope is now recorded per document in config/document-scope.json, seeded
   from exactly what the old rule granted at migration (diff: 0 widened, 0
   narrowed, 0 unscoped). Citations still explain a document's place in the
   estate; they no longer decide who may open it. */
async function mayReadFile(file, groups, isAdmin) {
  if (!file) return false;
  return docScope.canAccessDocument(file.id, file, groups, isAdmin).allow;
}

/* Serialized register responses, keyed by (query + build timestamp). Cleared
   wholesale when it grows — every key carries builtAt, so stale entries can
   never be served after a rebuild. */
const REGISTER_CACHE = new Map();
function sendCached(res, req, entry) {
  const wants = req && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  if (wants && entry.gz) {
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = entry.gz.length;
    res.writeHead(200, headers);
    return res.end(entry.gz);
  }
  headers["Content-Length"] = entry.body.length;
  res.writeHead(200, headers);
  res.end(entry.body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(new Error("body is not valid JSON")); }
    });
    req.on("error", reject);
  });
}

async function handle(req, res, urlPath, query) {
  const route = urlPath.replace(/^\/api\/?/, "").replace(/\/+$/, "");

  // Liveness + configuration state. Deliberately says whether a credential is
  // PRESENT, never what it is, so it is safe to read while setting the app up.
  /* Security posture, for administrators only.
     Every field is a STATE, never a secret: whether a control is on, not what
     its value is. No key material, no session ids, no Drive credentials, no
     header contents beyond the names of the policies in force. An ordinary
     legal user or a requester gets 403 — telling someone which defences are
     active is itself a small disclosure. */
  if (route === "health/security") {
    // This route sits above the shared identity resolution, so it resolves the
    // caller the same way /api/health does: a verified Cloudflare assertion, or
    // an app session cookie. No session, no answer.
    let who2 = await identify(req);
    if (!who2.email) { const s2 = auth.sessionFromReq(req); if (s2) who2 = { email: s2.account.email, via: "app-session" }; }
    if (!who2.email) return json(res, 401, { error: "unauthenticated" }, req);
    const me2 = principalFor(who2.email);
    const p2 = require("./permissions").effectiveFor({ id: me2.id, rbac: me2.rbac, legalTeam: me2.legalTeam, admin: me2.admin });
    const isAdmin2 = !!me2.admin || ((p2 && p2.groups && p2.groups.admin) === "full");
    if (!isAdmin2) return json(res, 403, { error: "forbidden", detail: "Security diagnostics are restricted to administrators." }, req);
    const cfg2 = load();
    const st2 = await registers.ensure();
    const scope = await documentScope();
    let originRestricted = false, originRanges = 0;
    try {
      const inc = fs.readFileSync("/etc/nginx/snippets/legalos-cloudflare-allow.inc", "utf8");
      originRestricted = /deny all;/.test(inc);
      originRanges = (inc.match(/^allow /gm) || []).length;
    } catch (e) { /* not installed */ }
    // The interface the app process is bound to. Loopback-only means a
    // request cannot reach it without passing through nginx.
    const bind = process.env.HOST || process.env.BIND_HOST || "127.0.0.1";
    return json(res, 200, {
      checkedAt: new Date().toISOString(),
      edge: {
        cloudflareAccessEnforced: !!cfg2.access.enforce,
        devBypassActive: !!cfg2.access.devBypassEmail,     // must be false in production
      },
      origin: {
        appBindHost: bind,
        appLoopbackOnly: bind === "127.0.0.1" || bind === "localhost",
        nginxCloudflareAllowList: originRestricted,
        nginxAllowRules: originRanges,
      },
      application: {
        securityHeaders: true,
        contentSecurityPolicy: true,
        frameAncestorsNone: true,
        sessionCookieHttpOnly: true,
        documentsScoped: scope.size,
        /* Authorization is no longer derived from these citations — it is
           recorded per document. Both numbers are shown because "how many
           documents a record cites" and "how many documents have an explicit
           scope" are different questions, and conflating them is what let a
           dedup move the security boundary. */
        documentAuthorization: (() => {
          const st = docScope.stats();
          return {
            documentsWithExplicitScope: st.documents,
            builtAt: st.builtAt,
            seededFromCitations: st.summary && st.summary.seededFromCitations,
            seededFromSourceRoot: st.summary && st.summary.seededFromSourceRoot,
            withNoScope: (st.summary && st.summary.withNoScope) || 0,
          };
        })(),
        registersGatedPerFamily: true,
      },
      data: {
        records: Object.values(st2.registers || {}).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0),
        lastBuiltAt: st2.builtAt || 0,
        lastDegradedIngest: (st2.diagnostics && st2.diagnostics.lastDegradedIngest) || null,
      },
    }, req);
  }

  if (route === "health") {
    let who = await identify(req);
    if (!who.email) {
      const s = auth.sessionFromReq(req);
      if (s) who = { email: s.account.email, via: "app-session", reason: "" };
    }
    return json(res, 200, {
      ok: true,
      service: "legalos-api",
      time: new Date().toISOString(),
      /* Who this process is, so a test can prove the port belongs to the
         sandbox IT started. "Something answered on 4821" is not proof — a
         leftover server from a previous run answers exactly the same way, and
         then every assertion is about the wrong build. The harness sets
         LEGALOS_SANDBOX_ID when it spawns a server and refuses any other value. */
      sandbox: process.env.LEGALOS_SANDBOX_ID || null,
      /* The build the page ACTUALLY loads, read from index.html. This used to
         be whichever src-v* directory readdir returned first, which reported
         v267 while v268 was live — a health endpoint that misstates the build
         is worse than one that omits it, because it is consulted precisely when
         someone is trying to work out what is running. */
      build: (() => {
        try {
          const fs = require("fs"), P = require("path"), root = P.join(__dirname, "..");
          const m = fs.readFileSync(P.join(root, "index.html"), "utf8").match(/src-v(\d+)/);
          if (m) return "src-v" + m[1];
          return fs.readdirSync(root).filter((d) => /^src-v\d+$/.test(d))
            .sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10)).pop() || null;
        } catch (e) { return null; }
      })(),
      pid: process.pid,
      authenticated: !!who.email,
      authVia: who.via,
      authReason: who.reason || undefined,
      // Who the caller actually is, as this server sees them. This is the
      // self-diagnosis tool: if Cloudflare presents a different address than
      // expected, it is visible here rather than being guessed at.
      you: who.email ? (() => { const me = principalFor(who.email, req);
        return { email: me.email, known: me.known, admin: !!me.admin, role: me.role, canReadKnowledge: me.canReadKnowledge }; })() : null,
      config: redactedStatus(),
      drive: drive.status(),
      roster: rosterSummary(),
    }, req);
  }

  // Credential sign-in stands OUTSIDE the identity gate below: the login call
  // IS the credential, so it cannot require one. It carries its own defences —
  // scrypt verification, a same-time answer for unknown accounts, and a
  // per-(address, account) lockout. See auth.js.
  if (route.startsWith("auth")) return auth.handle(req, res, route, json, readBody);

  // Two ways to be someone: a Cloudflare Access assertion (verified signature),
  // or an app session minted by a correct password. CF gates the perimeter, but
  // the credential login is authoritative for WHO the app runs as: if the CF
  // identity is not a recognised app user (e.g. the SSO email differs from the
  // roster — salman.khann vs salman.khan), fall back to the verified app-session
  // account so a valid sign-in is never downgraded to no-access (which was
  // showing legal users an empty register on the live domain).
  let who = await identify(req);
  let appSession = auth.sessionFromReq(req);
  if (appSession) {
    const cfKnown = who.email && principalFor(who.email).known;
    if (!cfKnown) who = { email: appSession.account.email, via: "app-session", reason: "" };
  }
  if (!who.email) {
    return json(res, 401, {
      error: "unauthenticated",
      detail: who.reason,
      hint: "This API trusts a Cloudflare Access signed assertion (Cf-Access-Jwt-Assertion) or a LegalOS session cookie from /api/auth/login.",
    }, req);
  }
  let me = principalFor(who.email);
  // An account flagged admin in config/users.json gets admin rights even if the
  // email is missing from the Access admins list — the two lists stay in step
  // for ashhad today, but the credential file must be self-sufficient.
  if (appSession && appSession.account.admin && !me.admin) {
    me = { ...me, known: true, admin: true, canReadKnowledge: true, rbac: me.id ? me.rbac : "head", role: me.id ? me.role : "System administrator" };
  }

  /* IDENTITY IS NOT AUTHORIZATION.
     Cloudflare proves WHO someone is. Whether that person may use LegalOS is
     decided here, against the roster and the permission engine:
       • identity conflict  — two roster rows claim one login: refuse, never guess
       • deactivated        — the account is off, regardless of a valid CF token
       • not provisioned    — authenticated, but LegalOS has never heard of them.
                              They are NOT a legal user. The only surface open to
                              them is raising a request and reading their own,
                              which is the business requester flow; everything
                              else is denied by default. */
  if (me.identityConflict) {
    return json(res, 403, { error: "identity_conflict",
      detail: "Two LegalOS records claim this login address. An administrator must resolve it.",
      claimants: me.identityConflict }, req);
  }
  if (me.disabled) {
    return json(res, 403, { error: "account_disabled",
      detail: "This LegalOS account is deactivated." }, req);
  }
  if (route === "me") return json(res, 200, { principal: me, via: who.via }, req);

  if (!me.provisioned) {
    // Requester surfaces only. `requests` scopes reads to the caller's own rows.
    const requesterOk = route === "requests" || route.startsWith("requests/")
      || route === "views" || route.startsWith("views/");
    if (!requesterOk) {
      return json(res, 403, { error: "not_provisioned",
        detail: "You are signed in, but this account has not been given access to LegalOS. Ask the Legal team to provision it.",
        you: me.email }, req);
    }
  }

  /* ---- Companies: the primary compliance object ----
     Gated on COMPLIANCE, because that is the family the register belongs to.
     The record LISTS inside a company are then trimmed per family to the
     caller's own groups: a compliance lawyer sees the licences, loans,
     resolutions and statutory estate in full, and is told how many contracts
     and cases the company has without being handed either. A count is not the
     same disclosure as a record, and hiding both would make the page lie about
     the size of the company. */
  if (route === "companies" || route.startsWith("companies/")) {
    const perms = require("./permissions");
    const eff = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const g = (eff && eff.groups) || {};
    if ((g.compliance || "none") === "none") {
      return json(res, 403, { error: "forbidden", detail: "The company register is part of Compliance." }, req);
    }
    const companies = require("./companies");
    if (route === "companies") return json(res, 200, await companies.list(), req);
    if (route === "companies/structure") return json(res, 200, await companies.structure(), req);
    const m = route.match(/^companies\/(.+)$/);
    if (m) {
      const d = await companies.detail(decodeURIComponent(m[1]));
      if (!d) return json(res, 404, { error: "not found" }, req);
      const allowed = {
        contracts: (g.commercial || "none") !== "none",
        properties: (g.commercial || "none") !== "none",
        litigation: (g.litigation || "none") !== "none",
        notices: (g.litigation || "none") !== "none",
        licences: true, loans: true, resolutions: true,
      };
      const withheld = [];
      const recs = {};
      for (const [fam, list] of Object.entries(d.records)) {
        if (allowed[fam]) recs[fam] = list;
        else { recs[fam] = []; withheld.push(fam); }
      }
      return json(res, 200, { ...d, records: recs, withheld }, req);
    }
    return json(res, 404, { error: "not found" }, req);
  }

  /* ---- Legal divisions, their people, and the routing rules ----
     READ is open to any signed-in legal user: a requester has to be able to be
     told who their point of contact is, and a lawyer has to be able to see who
     an escalation would go to. WRITING the org chart is administration. */
  if (route === "divisions" || route.startsWith("divisions/")) {
    const divisions = require("./divisions");
    if (req.method === "GET") return json(res, 200, divisions.list(), req);
    if (req.method === "POST" || req.method === "PUT") {
      const permissions = require("./permissions");
      const eff = permissions.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
      const canAdmin = !!me.admin || (eff.groups && eff.groups.admin === "full");
      if (!canAdmin) return json(res, 403, { error: "forbidden", detail: "Changing the division chart is restricted to administrators." }, req);
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const out = divisions.save(body, { email: me.email, name: me.name });
      return json(res, out.error ? 400 : 200, out, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  // ---- Users & Access (admin-only) ----
  if (route.startsWith("access")) {
    const permissions = require("./permissions");
    const eff = permissions.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const canAdmin = !!me.admin || (eff.groups && eff.groups.admin === "full");
    // Any signed-in user may read their own effective access; only admins may
    // list/edit everyone.
    if (route === "access/me") return json(res, 200, { permissions: eff, id: me.id, name: me.name }, req);
    if (!canAdmin) return json(res, 403, { error: "forbidden", detail: "Access management is restricted to administrators." }, req);
    if (route === "access/users") return json(res, 200, { users: permissions.listUsers(), roles: permissions.roles(), groups: permissions.GROUPS, levels: permissions.LEVELS }, req);
    if (route === "access/roles") return json(res, 200, { roles: permissions.roles() }, req);
    if (route === "access/audit") return json(res, 200, { audit: permissions.auditLog(300) }, req);
    const m = route.match(/^access\/user\/(.+)$/);
    if (m && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const by = (appSession && appSession.account && appSession.account.name) || me.name || me.email;
      // The actor's id is passed so the engine can refuse self-deactivation —
      // a disabled account is stopped at the identity gate and could never
      // re-enable itself.
      const r = permissions.updateUser(decodeURIComponent(m[1]), body || {}, by, me.id);
      return json(res, r.error ? 400 : 200, r, req);
    }
    return json(res, 404, { error: "unknown access route" }, req);
  }

  // ---- Legal request intake (the requester portal → Legal's triage queue) ----
  // Deliberately open to ANY verified caller for the POST: a business requester
  // is not on the legal roster, so principalFor() does not know them — and that
  // is exactly who is supposed to be raising requests. The perimeter (Cloudflare
  // Access, or a LegalOS session) has already proved they are a real person, and
  // requests.js stamps that verified identity onto the record rather than
  // trusting the body. Reading is scoped in requests.js: Legal sees the queue,
  // a requester sees only their own.
  /* ---- Saved views (a user's named filter states) ----
     Open to any verified caller, like the request intake: a saved view carries
     no data and no authority, only UI criteria, and views.js keys every one to
     the verified email rather than anything in the body. Applying a view sets
     filters; the register endpoints decide, every time, which rows that user may
     actually see. A revoked permission cannot be restored by reopening a view. */
  if (route === "views" || route.startsWith("views/")) {
    const views = require("./views");
    if (!who.email) return json(res, 401, { error: "unauthenticated" }, req);

    if (route === "views" && req.method === "GET") {
      return json(res, 200, { views: views.list(who, query.get("register") || "") }, req);
    }
    if (route === "views" && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = views.create(body || {}, who, me);
      return json(res, r.error ? 400 : 201, r, req);
    }
    const dup = route.match(/^views\/([^/]+)\/duplicate$/);
    if (dup && req.method === "POST") {
      const r = views.duplicate(decodeURIComponent(dup[1]), who, me);
      return json(res, r.error ? (r.error === "not_found" ? 404 : 400) : 201, r, req);
    }
    const one = route.match(/^views\/([^/]+)$/);
    if (one && (req.method === "PATCH" || req.method === "POST")) {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = views.update(decodeURIComponent(one[1]), body || {}, who, me);
      return json(res, r.error ? (r.error === "not_found" ? 404 : 400) : 200, r, req);
    }
    if (one && req.method === "DELETE") {
      const r = views.remove(decodeURIComponent(one[1]), who);
      return json(res, r.error ? (r.error === "not_found" ? 404 : 400) : 200, r, req);
    }
    return json(res, 404, { error: "unknown views route" }, req);
  }

  /* ---- Compliance workspace (loans, leases, services, resolutions,
     licences, SECP) -------------------------------------------------------
     Gated on the caller's effective COMPLIANCE level, computed by the same
     engine the registers use. The level is passed through to the workflow
     engine, which refuses any action the level does not grant -- so a direct
     API call is refused exactly like a hidden button would have been. */
  if (route === "compliance" || route.startsWith("compliance/")) {
    const complianceRoutes = require("./compliance-routes");
    const perms = require("./permissions");
    const eff = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const perm = ((eff && eff.groups) || {}).compliance || "none";
    if (perm === "none") {
      return json(res, 403, { error: "forbidden",
        detail: "You do not have access to the Compliance module." }, req);
    }
    const cGroups = (eff && eff.groups) || {};
    const cAdmin = !!me.admin || cGroups.admin === "full";
    return complianceRoutes.handle(req, res, route, query, {
      json, readBody, me, perm,
      // Document visibility uses the SAME predicate as every other Drive
      // surface (mayReadFile), so the template picker can never list a file the
      // caller could not open -- the SEC-007 hole, not reopened here.
      visible: async (f) => mayReadFile(f, cGroups, cAdmin),
    });
  }

  /* ---- Archiving: taking a finished record off the working book ----
     An overlay, keyed by family + record id, so a row that came out of a Drive
     workbook can be archived without anything being written back to Drive. */
  if (route === "archive" || route.startsWith("archive/")) {
    const archive = require("./archive");
    const u2 = new URL(req.url, "http://x");
    if (route === "archive" && req.method === "GET") {
      return json(res, 200, { reasons: archive.ARCHIVE_REASONS,
        records: archive.list(u2.searchParams.get("family") || null) }, req);
    }
    if (route === "archive" && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = archive.archive((body || {}).family, (body || {}).id, (body || {}).reason, me || who);
      return json(res, r.error ? 400 : 200, r, req);
    }
    const am = route.match(/^archive\/([^/]+)\/(.+)$/);
    if (am && req.method === "DELETE") {
      const r = archive.unarchive(decodeURIComponent(am[1]), decodeURIComponent(am[2]), me || who);
      return json(res, r.error ? 400 : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  if (route === "requests" || route.startsWith("requests/")) {
    const requests = require("./requests");
    if (route === "requests" && req.method === "GET") {
      return json(res, 200, { requests: requests.list(who, me,
        { withDeleted: new URL(req.url, "http://x").searchParams.get("deleted") === "1" }) }, req);
    }
    if (route === "requests" && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = requests.create(body, who, me);
      return json(res, r.error ? 400 : 201, r, req);
    }
    /* ATTACH A DOCUMENT TO A REQUEST.
       The file is stored on this server, not in Drive -- LegalOS never writes
       to the Drive estate, and an intake attachment is not yet a filed
       document. Authorization is the request's own: the person who raised it,
       or Legal. */
    /* THE DOCUMENT LIST, FROM THE SERVER.
       The browser keeps its own copy of a request, and that copy can be stale:
       it went on rendering attachment rows that had been cleared here, so a
       Preview opened and answered not_found. The documents on a request are
       whatever this says they are. */
    let am = route.match(/^requests\/([^/]+)\/attachments$/);
    if (am && req.method === "GET") {
      const rec = requests.byId(decodeURIComponent(am[1]));
      /* A COLLECTION ANSWERS WITH A COLLECTION, AND AN EMPTY ONE IS AN ANSWER.
         This returned 404 when the id was not a request we hold. The documents
         panel is rendered on the record spine for EVERY record -- contracts,
         admin, employment, registration -- and only some of those are legal
         requests, so browsing the register fired a 404 per record and filled
         the console with failures that were not failures. Nothing was broken;
         the question was simply "does this record have requester documents",
         and the honest answer is "no".

         It is also the more private answer: unknown, not-yours and genuinely
         empty are now indistinguishable, where a 404 confirmed which ids exist.
         Individual attachment routes below still 404 -- a specific document
         that is not there is a different question from an empty set. */
      if (!rec || !requests.canSee(rec, who, me)) return json(res, 200, { attachments: [] }, req);
      const stamped = requests.stampAttachments(rec);
      return json(res, 200, { attachments: stamped.attachments || [] }, req);
    }
    if (am && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = requests.attach(decodeURIComponent(am[1]), body || {}, who, me);
      if (r.error === "not_found") return json(res, 404, r, req);
      if (r.error === "forbidden") return json(res, 403, r, req);
      return json(res, r.error ? 400 : 201, r, req);
    }

    /* PUT THE FILE BACK ON AN ATTACHMENT THAT NEVER HAD ONE.
       Rows recorded before uploads were durable carry a name and no bytes.
       This restores the file in place -- same row, same category, same request
       -- so nobody has to delete a request and lose its approvals to fix it. */
    am = route.match(/^requests\/([^/]+)\/attachments\/([^/]+)\/replace$/);
    if (am && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = requests.replaceAttachment(decodeURIComponent(am[1]), decodeURIComponent(am[2]), body || {}, who, me);
      if (r.error === "not_found") return json(res, 404, r, req);
      if (r.error === "forbidden") return json(res, 403, r, req);
      return json(res, r.error ? 400 : 200, r, req);
    }

    /* READ A WORD OR EXCEL ATTACHMENT IN THE APP.
       The commonest thing a requester attaches is a .docx, and making the
       approver download it to find out what they are approving is how a
       decision gets taken without reading the document. Converted through the
       same sanitised pipeline the contract-request documents use. */
    am = route.match(/^requests\/([^/]+)\/attachments\/([^/]+)\/render$/);
    if (am && req.method === "GET") {
      const r = requests.attachment(decodeURIComponent(am[1]), decodeURIComponent(am[2]), who, me);
      if (r.error) return json(res, 404, { error: "not_found" }, req);
      const os = require("os");
      const fsx = require("fs");
      const pathx = require("path");
      /* The renderer reads from a path; these bytes live in the upload store,
         so they are handed over as a temporary file and removed straight after. */
      const tmp = pathx.join(os.tmpdir(), "legalos-render-" + Date.now() + "-"
        + String(r.attachment.name).replace(/[^A-Za-z0-9._-]/g, "_").slice(-60));
      try {
        fsx.writeFileSync(tmp, r.buffer);
        await require("./crf-routes").renderDocument(res, tmp, r.attachment.name, r.attachment.mime || "");
      } finally { try { fsx.unlinkSync(tmp); } catch (e) { /* already gone */ } }
      return;
    }

    /* READ ONE BACK, IN THE APP. Streamed with a content type so the browser
       renders it in place rather than punting the reader to a download. */
    am = route.match(/^requests\/([^/]+)\/attachments\/([^/]+)$/);
    if (am && req.method === "GET") {
      const r = requests.attachment(decodeURIComponent(am[1]), decodeURIComponent(am[2]), who, me);
      // An unauthorised attachment is indistinguishable from a missing one.
      if (r.error) return json(res, 404, { error: "not_found" }, req);
      res.writeHead(200, {
        "Content-Type": r.attachment.mime || "application/octet-stream",
        "Content-Length": r.buffer.length,
        "Content-Disposition": "inline; filename=\"" + String(r.attachment.name).replace(/"/g, "") + "\"",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(r.buffer);
    }

    /* REMOVE / RESTORE A REQUEST (§95/§99).
       Soft, reasoned, and decided by api/requests.js — the browser asks, it
       does not authorise. A refusal comes back as 409 `approval_required` with
       the sentence the dialog shows, so the client never has to guess why. */
    const rm = route.match(/^requests\/([^/]+)\/restore$/);
    if (rm && req.method === "POST") {
      const r = requests.restore(decodeURIComponent(rm[1]), who, me);
      return json(res, r.error ? 400 : 200, r, req);
    }
    const dm = route.match(/^requests\/([^/]+)$/);
    if (dm && req.method === "DELETE") {
      let body; try { body = await readBody(req); } catch (e) { body = {}; }
      const r = requests.remove(decodeURIComponent(dm[1]), (body || {}).reason, who, me);
      const code = r.error === "approval_required" ? 409
        : r.error === "no such request" ? 404
        : r.error ? 400 : 200;
      return json(res, code, r, req);
    }

    const pm = route.match(/^requests\/(.+)$/);
    if (pm && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = requests.patch(decodeURIComponent(pm[1]), body || {}, who, me);
      return json(res, r.error ? (r.error === "forbidden" ? 403 : 400) : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  /* ---- Notifications ----
     Held on the server because a notification addressed to somebody else and
     stored in YOUR browser is not a notification. */
  if (route === "notifications" || route.startsWith("notifications/")) {
    const notifications = require("./notifications");
    if (route === "notifications" && req.method === "GET") {
      return json(res, 200, notifications.list(who.email), req);
    }
    if (route === "notifications" && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = notifications.create(body, who.email);
      return json(res, r.error ? (r.error === "forbidden" ? 403 : 400) : 201, r, req);
    }
    if (route === "notifications/read" && req.method === "POST") {
      const r = notifications.markRead(who.email);
      return json(res, r.error ? 403 : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  /* ---- Configuration proposals (Lead proposes, Director publishes) ----
     Held on the server because a proposal that lives in the proposer's browser
     never reaches the person who has to decide it. */
  if (route === "config-proposals" || route.startsWith("config-proposals/")) {
    const proposals = require("./config-proposals");
    if (route === "config-proposals" && req.method === "GET") {
      const r = proposals.list(who.email);
      return json(res, r.error ? 403 : 200, r, req);
    }
    if (route === "config-proposals" && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = proposals.create(body, who.email);
      return json(res, r.error ? (r.error === "forbidden" ? 403 : 400) : 201, r, req);
    }
    const cm = route.match(/^config-proposals\/([^/]+)\/decision$/);
    if (cm && req.method === "POST") {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = proposals.decide(decodeURIComponent(cm[1]), body && body.decision, who.email);
      const code = r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : r.error ? 400 : 200;
      return json(res, code, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  // ---- Knowledge base (Drive, read-only) ----
  if (route.startsWith("knowledge")) {
    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "The knowledge base is restricted to the legal department.", you: me.role }, req);
    }
    // Being in Legal is not the same as being allowed to read every team's
    // documents. Every answer below is filtered to the caller's module access.
    const kperms = require("./permissions").effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const kgroups = (kperms && kperms.groups) || {};
    const kAdmin = !!me.admin || kgroups.admin === "full";
    const visible = async (f) => mayReadFile(f, kgroups, kAdmin);
    const cfg = load();
    // "Not connected yet" is a STATE, not a failure. Answering 503 made the
    // browser log a failed resource on every load of a correctly-working,
    // not-yet-configured install — noise that also failed the test suite.
    // The shape below lets the UI render its own empty state silently.
    const anyFolderSource = !!(cfg.drive.autoDiscover || cfg.drive.knowledgeFolderId || (cfg.drive.knowledgeFolderIds || []).length);
    if (!anyFolderSource) {
      if (route === "knowledge/tree") {
        return json(res, 200, { configured: false, indexedAt: 0, fileCount: 0, folderCount: 0, totalBytes: 0, folders: [], error: "" }, req);
      }
      if (route === "knowledge/search") {
        return json(res, 200, { configured: false, results: [], term: "", contentHits: 0, indexedAt: 0 }, req);
      }
      return json(res, 503, { error: "not_configured", detail: "No Drive knowledge folder is configured yet." }, req);
    }

    if (route === "knowledge/tree") {
      const t = await drive.tree();
      // A root the caller may not read is not listed at all — its existence,
      // folder names and file counts are themselves information.
      const roots = [];
      for (const r of t.roots || []) {
        const g = rootGroup(r.name);
        /* Fail CLOSED on an unrecognised root, exactly as mayReadFile does.
           This read `|| !g ||`, so a root nobody had classified was listed to
           everyone — and the comment above says the opposite is the rule. The
           two must agree: a corpus whose every document is denied must not
           advertise its name, its folder names or how much of it there is. */
        if (kAdmin || (g && (kgroups[g] || "none") !== "none")) roots.push(r);
      }
      return json(res, 200, Object.assign({}, t, {
        roots,
        rootCount: roots.length,
        fileCount: roots.reduce((n, r) => n + (r.fileCount || 0), 0),
        folders: (t.folders || []).filter((f) => roots.some((r) => String(f.name || "").startsWith(r.name))),
      }), req);
    }

    // One folder's files, straight from the warm index — this is what expanding
    // a section in the UI calls, so it must not cost a Drive round trip.
    if (route === "knowledge/files") {
      const folder = (query.get("folder") || "").slice(0, 500);
      const root = (query.get("root") || "").slice(0, 200);
      await drive.ensureIndex();
      const listed = drive.filesIn(folder, { root });
      const allowed = [];
      for (const f of listed) if (await visible(f)) allowed.push(f);
      return json(res, 200, { folder, root, files: allowed }, req);
    }

    // The Pakistan Contract Templates library — the standard-form documents the
    // legal team drafts FROM (413 files in the "Zameen - Pakistan Contract
    // Templates" tree). These are template documents, not executed contracts, so
    // they never enter the contracts register; they surface on the Templates page
    // (/templates) and stream in-app through knowledge/file/:id like any other
    // Drive document. The category is the immediate subfolder under the tree.
    if (route === "knowledge/templates") {
      await drive.ensureIndex();
      /* The template library is scoped like every other document.
         It used to be the one knowledge route that returned metadata without
         asking: a Compliance-only account received all 413 template names, ids,
         paths and sizes, and then got 404 on every attempt to open one. A list
         and its documents must answer the same question — a filename is
         information, and an endpoint that leaks names while the stream denies
         them is a hole with a confusing UI on top.
         These files live under the Commercial Drive root, so commercial access
         is what grants them. That is a permissions decision, changed by moving
         the tree or granting the group — not by leaving this endpoint open. */
      const visibleTemplates = [];
      for (const f of drive.indexFiles()) {
        if (!/Pakistan Contract Templates/i.test(f.folderPath || "")) continue;
        if (await visible(f)) visibleTemplates.push(f);
      }
      /* WHAT EACH FILE IS, NOT JUST THAT IT IS HERE.
         This list used to be undifferentiated, and that is the same failure as
         attaching blank templates to live records, seen from the other side.
         Sixteen of these files are executed instruments -- a Google advertising
         agreement stamped by Google's legal department, digital marketing
         agreements with three banks under seal, seventeen DHA allotment letters
         signed by the Director Transfer & Record. Listing them as "templates"
         is how a signed contract gets lost in the template library.
         Each file now carries the state it was classified into and the evidence
         for it. Nothing is hidden: a signed agreement is still shown, it is just
         no longer described as a blank form. */
      const items = visibleTemplates
        // Drop Word's own temp/lock files (~$name, ~160 bytes) and OS cruft —
        // they are not documents, just artefacts of a doc being open.
        .filter((f) => !/^~\$/.test(f.name || "") && !/^\.|desktop\.ini$|\.tmp$/i.test(f.name || ""))
        .map((f) => {
          const segs = String(f.folderPath || "").split(" / ");
          const at = segs.findIndex((s) => /Pakistan Contract Templates/i.test(s));
          const category = (at >= 0 && segs[at + 1]) ? segs[at + 1] : "General";
          const state = tplLib.classificationOf(f.id);
          return {
            id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
            modifiedTime: f.modifiedTime || "", folderPath: f.folderPath || "",
            webViewLink: f.webViewLink || "", category,
            state: state || null,
            stateLabel: state ? tplLib.label(state) : null,
            isExecuted: tplLib.isExecuted(f.id),
            basis: tplLib.basisOf(f.id),
          };
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      const executed = items.filter((i) => i.isExecuted);
      return json(res, 200, {
        total: items.length, items,
        /* Counted for the page header, so "some of these are signed agreements"
           is visible before anyone scrolls. */
        executedCount: executed.length,
        unclassifiedCount: items.filter((i) => !i.state).length,
        byState: items.reduce((m, i) => (m[i.state || "UNCLASSIFIED"] = (m[i.state || "UNCLASSIFIED"] || 0) + 1, m), {}),
      }, req);
    }

    if (route === "knowledge/search") {
      const q = (query.get("q") || "").slice(0, 200);
      const limit = Math.min(parseInt(query.get("limit") || "60", 10) || 60, 200);
      // Search must not reveal even the EXISTENCE of a document the caller may
      // not open: an unauthorised matter behaves as if it does not exist.
      const found = await drive.search(q, { limit: limit * 4 });
      const kept = [];
      for (const f of found.results || []) { if (await visible(f)) kept.push(f); if (kept.length >= limit) break; }
      return json(res, 200, Object.assign({}, found, {
        results: kept,
        contentHits: kept.filter((m) => m.match === "content").length,
      }), req);
    }

    // Which of the given documents (one contract's files) mention a phrase.
    if (route === "knowledge/matches") {
      const q = (query.get("q") || "").slice(0, 200);
      const asked = (query.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
      await drive.ensureIndex();
      const ids = [];
      for (const fid of asked) { const f = drive.fileById(fid); if (f && await visible(f)) ids.push(fid); }
      const matches = await drive.matchesIn(q, ids);
      return json(res, 200, { term: q, checked: ids.length, matches }, req);
    }

    if (route.startsWith("knowledge/file/")) {
      const id = decodeURIComponent(route.slice("knowledge/file/".length));
      if (!id) return json(res, 400, { error: "no file id" }, req);
      // OBJECT-LEVEL AUTHORIZATION. Knowing a file id must not be enough to read
      // it: this is where a Compliance-only account was able to download a
      // litigation case file in full. The document's own scope decides.
      await drive.ensureIndex();
      const meta = drive.fileById(id);
      if (!meta) return json(res, 404, { error: "not_found" }, req);
      if (!(await visible(meta))) {
        // Deliberately the same shape a missing file gets: an unauthorised
        // document should not be distinguishable from one that is not there.
        return json(res, 404, { error: "not_found" }, req);
      }
      return drive.streamFile(id, res);
    }

    if (route === "knowledge/refresh" && req.method === "POST") {
      // Same contract as registers/refresh: a failed crawl must not look like a
      // server fault, and must not imply the index was lost.
      let idx;
      try {
        idx = await drive.rebuild(true);
      } catch (e) {
        console.error("[api] knowledge/refresh failed:", e && e.message);
        return json(res, 503, {
          error: "refresh_failed",
          detail: "The Drive index could not be rebuilt just now. The existing index is still in use.",
          reason: String((e && e.message) || e).slice(0, 200),
        }, req);
      }
      return json(res, 200, { rebuilt: true, fileCount: idx.files.length, error: idx.error || undefined }, req);
    }
    return json(res, 404, { error: "unknown knowledge route" }, req);
  }

  // ---- Registers: the trackers, turned into module records ----
  /* ------------------------------------------------------- the assistant --
     Claude, asked about the caller's OWN records and nothing else.

     Two rules hold this together, and both are enforced here rather than in
     the model's instructions:

     1. SCOPE. The assistant is handed the families this caller may already
        read, computed by the same permission engine the register endpoint
        uses. A Compliance-only account's question is answered from compliance
        records; it cannot be talked into seeing a contract, because the
        contract was never in the payload.

     2. NO DOCUMENT TEXT. api/claude-cli.js copies records across an explicit
        field allowlist and refuses anything prose-shaped. The bodies of
        agreements are not transmitted — that is the estate owner's decision,
        and it is why the assistant can answer "which leases expire in March"
        but not "what does clause 7 say". */
  /* ------------------------------------------- the Commercial review queue
     Steward material: it exposes source filenames, folder paths and the
     documents the source got wrong, so it sits behind the same bar as Data
     Health rather than being visible to every legal user. */
  /* Projects that exist in Drive with their own folder and documents, but which
     no tracker row names. They are real — Zameen Eon has eleven documents — and
     leaving them out of the Projects screen made the estate look smaller than
     it is. Scoped like any other commercial register read. */
  if (route === "commercial/project-only" && req.method === "GET") {
    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "Register data is restricted to the legal department." }, req);
    }
    const perms = require("./permissions");
    const eff = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    if (((eff && eff.groups && eff.groups.commercial) || "none") === "none") {
      return json(res, 403, { error: "forbidden", detail: "Commercial records are not in your access." }, req);
    }
    let recs = [];
    try { recs = JSON.parse(fs.readFileSync(path.join(ROOT, "audit", "commercial-project-only-records.json"), "utf8")); }
    catch (e) { recs = []; }
    await drive.ensureIndex();
    const isDoc = (f) => !/\.(xlsx?|tmp)$/i.test(f.name || "") && !/^~\$/.test(f.name || "") && !/^\./.test(f.name || "");
    const out = recs.map((r) => {
      const files = drive.indexFiles().filter((f) => isDoc(f) && String(f.folderPath || "").includes(r.sourceFolder));
      return {
        id: r.id, project: r.displayName, sourceFolder: r.sourceFolder,
        // Never invented: the source does not state an entity for these.
        entity: r.entity, quality: r.quality,
        documents: files.map((f) => ({
          id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
          folderPath: f.folderPath || "", webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "",
        })),
      };
    });
    return json(res, 200, { records: out }, req);
  }

  if (route.startsWith("commercial/review")) {
    const review = require("./commercial-review");
    if (!me.admin && me.rbac !== "head" && me.rbac !== "lead") {
      return json(res, 403, { error: "forbidden", detail: "The review queue is for data stewards.", you: me.role }, req);
    }
    if (route === "commercial/review" && req.method === "GET") {
      return json(res, 200, { summary: review.summary(), items: review.queue(), decisions: review.DECISIONS }, req);
    }
    if (route === "commercial/review/decide" && req.method === "POST") {
      let body = null;
      try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = review.decide(Object.assign({}, body || {}, { who: me }));
      if (r.error) return json(res, r.error === "not_found" ? 404 : 400, r, req);
      return json(res, 200, r, req);
    }
    return json(res, 404, { error: "not_found" }, req);
  }

  if (route.startsWith("assistant")) {
    const claude = require("./claude-cli");

    if (route === "assistant/status") {
      return json(res, 200, Object.assign({}, claude.status(), {
        // What a user may ask about, so the UI can say so plainly.
        scope: "records you can already open · structured facts only",
      }), req);
    }

    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "The assistant is restricted to the legal department.", you: me.role }, req);
    }
    /* Reading a document is a different act from answering about records, and
       it is gated separately. These two routes only REPORT the gate — they can
       neither open it nor send anything. */
    if (route === "assistant/reader/status") {
      return json(res, 200, require("./claude-reader").status(), req);
    }

    /* One record, summarised from its own fields and its documents' METADATA.
       Not their contents: this can say "three amendments, the latest dated
       March 2022, one of them a novation" and cannot say what any clause
       provides. The screen says so too, because a summary that sounds like it
       read the contract is worse than no summary. */
    if (route === "assistant/record" && req.method === "POST") {
      let body = null;
      try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      body = body || {};
      const fam = String(body.family || "");
      const id = String(body.id || "");
      const perms = require("./permissions");
      const effective = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
      const groups = (effective && effective.groups) || {};
      const FAMILY_GROUP = {
        contracts: "commercial", properties: "commercial",
        litigation: "litigation", notices: "litigation",
        licences: "compliance", loans: "compliance", resolutions: "compliance",
      };
      const g = FAMILY_GROUP[fam];
      if (g && (groups[g] || "none") === "none") {
        return json(res, 403, { error: "forbidden", detail: "You cannot read that register." }, req);
      }
      const st2 = await registers.ensure();
      const rows = ((st2 && st2.registers) || {})[fam] || [];
      const rec = rows.find((r) => r.id === id);
      if (!rec) return json(res, 404, { error: "not_found" }, req);

      /* Document METADATA only — the filename, what kind of instrument it is,
         where it sits in the agreement's life. Never the text. */
      const docs = (rec.driveFiles || []).slice(0, 40).map((d) => ({
        filename: d.name, documentType: d.ctype || null, contentState: d.cread || null,
        via: d.via, folderPath: d.folderPath,
      }));
      const question = String(body.ask || "Summarise this record and its documents. Note anything missing or inconsistent.").slice(0, 500);
      const out = await claude.ask({
        question,
        context: { record: rec, documents: docs },
        system: [
          "You are summarising ONE record in LegalOS for the legal team.",
          "You have the record's fields and its documents' METADATA — filenames, instrument types, lifecycle stages.",
          "You do NOT have the text of any document and must never imply that you have read one.",
          "Say what the record is, what documents it holds, and what is missing or inconsistent.",
          "Be brief. Do not invent parties, dates, amounts or obligations.",
        ].join(" "),
      });
      return json(res, 200, {
        ok: !!out.ok, answer: out.ok ? out.text : null, error: out.ok ? null : out.error,
        documents: docs.length, redactions: out.redactions || null,
      }, req);
    }

    if (route === "assistant/ask" && req.method === "POST") {
      let body = null;
      try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      body = body || {};
      const question = body && typeof body.question === "string" ? body.question.trim() : "";
      if (!question) return json(res, 400, { error: "bad_request", detail: "Ask a question." }, req);

      const perms = require("./permissions");
      const effective = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
      const groups = (effective && effective.groups) || {};
      const FAMILY_GROUP = {
        contracts: "commercial", properties: "commercial",
        litigation: "litigation", notices: "litigation",
        licences: "compliance", loans: "compliance", resolutions: "compliance",
      };
      const mayRead = (fam) => { const g = FAMILY_GROUP[fam]; return !g || (groups[g] || "none") !== "none"; };

      const st = await registers.ensure();
      const regs = (st && st.registers) || {};
      const wanted = String(body.families || "").split(",").map((x) => x.trim()).filter(Boolean);
      const context = {};
      const trueTotals = {};
      let total = 0;
      for (const [fam, rows] of Object.entries(regs)) {
        if (!Array.isArray(rows) || !mayRead(fam)) continue;
        if (wanted.length && !wanted.includes(fam)) continue;
        /* A cap per family: this is a question-answering surface, not a bulk
           export, and the whole book will not fit in one prompt anyway. */
        const slice = rows.slice(0, 120);
        context[fam] = slice;
        trueTotals[fam] = rows.length;          // the size of the register itself
        total += slice.length;
      }
      if (!total) return json(res, 200, { ok: false, error: "You have no register access to answer from." }, req);

      /* A dry run answers the question "what WOULD be sent, and to whom is it
         scoped" without calling Claude at all. It is how the test suite checks
         the permission scoping and the data boundary on every run without
         spending the account's plan, and it is the first thing to look at when
         someone asks why an answer was thin. */
      if (body.dry) {
        const preview = {};
        let redacted = 0; const fields = new Set();
        for (const [fam, rows] of Object.entries(context)) {
          preview[fam] = rows.slice(0, 3).map((r) => {
            const before = Object.keys(r).length;
            const after = claude.project(r, fam) || {};
            if (Object.keys(after).length < before) { redacted++; }
            for (const k of Object.keys(r)) if (!claude.ALLOWED_FIELDS.has(k)) fields.add(k);
            return after;
          });
        }
        return json(res, 200, {
          ok: true, dry: true,
          askedOver: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, v.length])),
          registerTotals: trueTotals,
          sample: preview,
          withheldFieldNames: [...fields].sort(),
        }, req);
      }

      let out;
      try {
        out = await claude.ask({ question, context, trueTotals });
      } catch (e) {
        // A boundary refusal is a bug worth surfacing, not a generic failure.
        if (e instanceof claude.BoundaryError) {
          return json(res, 500, { error: "boundary", detail: "Refused to send: " + e.message }, req);
        }
        return json(res, 500, { error: "assistant_failed", detail: String(e.message || e).slice(0, 200) }, req);
      }
      return json(res, 200, {
        ok: !!out.ok,
        answer: out.ok ? out.text : null,
        error: out.ok ? null : out.error,
        askedOver: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, v.length])),
        // Long free-text fields are withheld by the data boundary. Say so, so an
        // answer drawn from partial facts is never mistaken for a full one.
        redactions: out.redactions || null,
        // How many rows of each register were actually in front of the model,
        // and whether that was the whole register.
        considered: out.considered || null,
        registerTotals: trueTotals,
        partial: !!out.partial,
        usage: out.usage || null,
      }, req);
    }
    return json(res, 404, { error: "not_found" }, req);
  }

  /* ---- Contract Requests (CRF-01..09) and their documents ----
     One intake module for Commercial -> Legal, and one durable document store
     behind it. Reading needs legal-department access; who may act on a given
     request, and who may read a given document, is decided per request in
     api/contract-requests.js and api/request-documents.js -- because a
     requester is entitled to their own request and to nothing else. */
  if (route === "contract-requests" || route.startsWith("contract-requests/")
    || route === "request-documents" || route.startsWith("request-documents/")) {
    /* A business requester raises contract requests and reads their OWN, so
       the module is not behind the legal-department gate. Being authenticated
       gets you through this door; permissionsFor() on each request decides
       what you may actually see and do, and a request you are not part of
       answers 404. */
    if (!me.known) {
      return json(res, 403, { error: "forbidden", detail: "Sign in to raise or read a contract request." }, req);
    }
    return require("./crf-routes").handle({ req, res, route, json, readBody, who, me, registers });
  }

  /* ---- Deletions: a request, decided by the head of the module's team ----
     Mounted here and not under litigation, because a deletion can be raised in
     any module -- compliance visits and commercial contracts included -- and
     gating them all behind the litigation permission would mean a compliance
     lead could not decide about a compliance record.

     Reading the queue needs legal access; raising or deciding needs write
     access somewhere. Who may DECIDE a given request is decided per request in
     api/deletion-approvals.js, by the team that owns the module. */
  if (route === "deletions" || route.startsWith("deletions/")) {
    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "Deletion approvals are restricted to the legal department." }, req);
    }
    const del = require("./deletion-approvals");
    const dm = route.match(/^deletions(?:\/([A-Za-z0-9-]+))?(?:\/([a-z]+))?$/);
    if (!dm) return json(res, 404, { error: "not_found" }, req);
    const [, delId, action] = dm;
    const mine = (r) => r.requestedBy && r.requestedBy.email && me.email
      && String(r.requestedBy.email).toLowerCase() === String(me.email).toLowerCase();

    if (req.method === "GET" && !delId) {
      const u = new URL(req.url, "http://x");
      const rows = del.list({ status: u.searchParams.get("status") || "", module: u.searchParams.get("module") || "" });
      /* The screen has to know which of these THIS reader may decide, or it
         offers an Approve button the server will refuse. */
      return json(res, 200, {
        requests: rows.map((r) => ({ ...r, canDecide: del.mayDecide(me, r.module) && !mine(r), mine: mine(r) })),
        pending: del.pendingIndex(),
        youDecideFor: Object.keys(del.MODULE_TEAM).filter((k) => del.mayDecide(me, k)),
      }, req);
    }

    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const code = (r) => (r.error === "not found" ? 404 : r.error === "forbidden" ? 403 : r.error ? 400 : 200);

    if (req.method === "POST" && !delId) {
      const r = del.raise(body || {}, me);
      return json(res, r.error ? (r.error === "forbidden" ? 403 : 400) : 201, r, req);
    }
    if (req.method === "POST" && delId && action === "decide") {
      const r = del.decide(delId, body || {}, me);
      return json(res, code(r), r, req);
    }
    if (req.method === "POST" && delId && action === "withdraw") {
      const r = del.withdraw(delId, me);
      return json(res, code(r), r, req);
    }
    return json(res, 405, { error: "method_not_allowed" }, req);
  }

  /* ---- Litigation: raise and run a case ----
     Every entry point (manual, request, notice, contract, uploaded document,
     assistant) goes through api/litigation-routes.js and then through the one
     engine in api/litigation-cases.js.

     This sits OUTSIDE the `registers` block on purpose. Nested inside it the
     path never matched — that block is entered only for routes beginning
     "registers", so every call answered 404 while looking, in the source,
     exactly as though it were wired up. */
  if (route === "litigation" || route.startsWith("litigation/")) {
    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "Litigation data is restricted to the legal department." }, req);
    }
    const perms = require("./permissions");
    const effective = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const level = ((effective && effective.groups) || {}).litigation || "none";
    if (level === "none") {
      return json(res, 403, { error: "forbidden", detail: "Your access does not include the litigation register." }, req);
    }
    return require("./litigation-routes").handle({ req, res, route, json, readBody, who, me, registers, level });
  }

  if (route.startsWith("registers")) {
    if (!me.canReadKnowledge) {
      return json(res, 403, { error: "forbidden", detail: "Register data is restricted to the legal department.", you: me.role }, req);
    }
    // Belonging to Legal is not the same as being allowed to read every team's
    // book. Hiding the navigation is NOT access control — the register endpoint
    // was returning all 331 litigation cases and all 1,341 contracts to a
    // Compliance-only account that asked for them directly. Each family is now
    // gated on the caller's effective permission GROUP, computed by the same
    // engine the UI consults, so a permission change alters the DATA a person
    // receives and not merely the buttons they see.
    const perms = require("./permissions");
    const effective = perms.effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    const groups = (effective && effective.groups) || {};
    const FAMILY_GROUP = {
      contracts: "commercial", properties: "commercial",
      litigation: "litigation", notices: "litigation",
      licences: "compliance", loans: "compliance", resolutions: "compliance",
    };
    const mayRead = (famKey) => {
      const g = FAMILY_GROUP[famKey];
      if (!g) return true;                       // a family with no owning group
      return (groups[g] || "none") !== "none";
    };

    if (route === "registers") {
      // The SUMMARY leaks just as surely as the rows: counts, source filenames
      // and duplicate figures for a book you may not open. Scope it.
      const sum = await registers.summary();
      const allowed = Object.keys(sum.counts || {}).filter(mayRead);
      const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => allowed.includes(k)));
      return json(res, 200, Object.assign({}, sum, {
        counts: pick(sum.counts),
        labels: pick(sum.labels),
        duplicates: pick(sum.duplicates),
        surfaces: pick(sum.surfaces),
        sources: (sum.sources || []).filter((x) => (x.families || []).some(mayRead)),
        restricted: Object.keys(sum.counts || {}).filter((k) => !mayRead(k)),
      }), req);
    }

    // One combined picture for the Knowledge Base screen in Settings: the
    // library, every register, where each one surfaces, and — the part worth
    // having — the spreadsheets in Drive that NOTHING is reading.
    // Data Health — the integrity picture behind the whole pipeline. Restricted
    // to administrators: it exposes source filenames, row numbers and the
    // records the source got wrong, which is steward material, not business
    // reading.
    if (route === "registers/health") {
      const canAdmin = !!me.admin || (groups.admin === "full");
      if (!canAdmin) return json(res, 403, { error: "forbidden", detail: "Data Health is restricted to administrators." }, req);
      return json(res, 200, await registers.health(), req);
    }

    // Defects found INSIDE stored documents — a signed agreement whose footer
    // names another project, an executed PPA with a blank schedule, a stamp from
    // the wrong jurisdiction. These are source quality issues, not application
    // faults, and Drive is never altered to hide them. Admin and Legal may see
    // them; ordinary readers get the badge on the record, not this table.
    if (route === "registers/source-quality") {
      const canAdmin = !!me.admin || (groups.admin === "full");
      const canLegal = canAdmin || groups.commercial === "full" || groups.commercial === "edit";
      if (!canLegal) return json(res, 403, { error: "forbidden", detail: "Document integrity is restricted to Legal and administrators." }, req);
      const sq = require("./source-quality");
      return json(res, 200, { summary: sq.summary(), rows: sq.all() }, req);
    }

    // The Compliance rebuild's reconciliation: where every source row went and
    // what every Drive file is. Admin-only, like the rest of Data Health.
    if (route === "registers/compliance-reconciliation") {
      const canAdmin = !!me.admin || (groups.admin === "full");
      if (!canAdmin) return json(res, 403, { error: "forbidden", detail: "Data Health is restricted to administrators." }, req);
      return json(res, 200, await require("./datahealth-compliance").reconciliation(), req);
    }

    /* The statutory estate's integrity picture. Same admin gate as the rest of
       Data Health: it names source folders and the files the source misfiled.
       Every figure is recomputed here from the model, never read back from the
       audit artifacts on disk -- a stale artifact must not be able to report a
       green panel over a broken register. */
    if (route === "registers/secp-health") {
      const canAdmin = !!me.admin || (groups.admin === "full");
      if (!canAdmin) return json(res, 403, { error: "forbidden", detail: "Data Health is restricted to administrators." }, req);
      await drive.ensureIndex();
      const rec = require("./secp-records");
      const src = require("./secp-source");
      const ROOT = "Entities data for secp filing";
      const files = drive.indexFiles().filter((f) => String(f.folderPath || "").startsWith(ROOT));
      const annual = rec.annualCompliance(), events = rec.eventFilings(), regs = rec.statutoryRegisters();
      const g = src.get() || {};
      const ents = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});

      const placed = new Set();
      const ids = new Map();
      for (const list of [annual, events, regs]) {
        for (const r of list) {
          ids.set(r.id, (ids.get(r.id) || 0) + 1);
          for (const d of (r.documents || [])) placed.add(d.id);
        }
      }
      const byId = new Set(files.map((f) => f.id));
      const broken = [];
      for (const list of [annual, events, regs]) {
        for (const r of list) for (const d of (r.documents || [])) if (!byId.has(d.id)) broken.push({ record: r.id, file: d.id });
      }
      const rootChildren = {};
      for (const f of files) {
        const seg = String(f.folderPath).split(" / ").map((x) => x.trim());
        if (seg[1]) rootChildren[seg[1]] = (rootChildren[seg[1]] || 0) + 1;
      }
      const unknownRoot = Object.keys(rootChildren).filter((k) => !/^(Group|Non-Group) Entities$/i.test(k));
      const noDocs = annual.filter((r) => r.documentCount === 0).length;
      const countMismatch = [...annual, ...events, ...regs]
        .filter((r) => r.documentCount !== (r.documents || []).length).length;

      const payload = {
        source: { root: ROOT, files: files.length, rootChildren },
        entities: {
          total: ents.length,
          group: ents.filter((e) => e.group === "group").length,
          nonGroup: ents.filter((e) => e.group !== "group").length,
        },
        /* SOURCE-BACKED AND SYSTEM-GENERATED ARE NEVER ONE NUMBER.
           Everything under `records` exists because a Drive folder exists.
           `generated` is computed from the statutory rules and asserted by
           nothing in Drive. Adding them together would be the same mistake as
           printing FY 2028 above ten years of real filings. */
        records: {
          entityYears: annual.length,
          eventFilings: events.length,
          statutoryRegisters: regs.length,
          documentsMapped: placed.size,
          evidenceOnly: annual.filter((r) => r.filingStatus !== "EVIDENCE_OF_SUBMISSION").length,
          noSourceDocuments: noDocs,
        },
        generated: {
          futureObligationRecords: rec.upcomingObligations().length,
          basis: "config/compliance-rules.json statutory rules; no Drive folder asserts these",
        },
        sourceYears: (() => {
          /* Year FOLDERS in Drive against year RECORDS in LegalOS, both ways. */
          const YR = /^(CY|FY)\s*((19|20)\d{4}|(19|20)\d{2})$/i;
          const E = require("./entities.js");
          const segOf = (p) => String(p || "").split(" / ").map((x) => x.trim()).filter(Boolean);
          const known = new Set();
          for (const f of files) { const g = segOf(f.folderPath); if (g[2]) known.add(E.entityKey(g[2])); }
          const pairs = new Set();
          for (const fo of (drive.indexFolders() || [])) {
            const path = String(fo.path || "");
            if (!path.startsWith(ROOT) || !YR.test(fo.name)) continue;
            const g = segOf(path);
            let oi = 2;
            for (let i = 3; i < g.length - 1; i++) if (known.has(E.entityKey(g[i]))) oi = i;
            pairs.add(E.entityKey(g[oi]) + "||" + String(fo.name).toUpperCase());
          }
          const recKeys = new Set(annual.map((r) => r.entityKey + "||" + String(r.sourcePeriodLabel).toUpperCase()));
          return {
            driveYearFolders: (drive.indexFolders() || []).filter((fo) => String(fo.path || "").startsWith(ROOT) && YR.test(fo.name)).length,
            distinctEntityYearsInDrive: pairs.size,
            sourceBackedRecords: annual.length,
            driveYearsMissingFromUI: [...pairs].filter((k) => !recKeys.has(k)).length,
            uiYearsAbsentFromDrive: [...recKeys].filter((k) => !pairs.has(k)).length,
          };
        })(),
        gates: {
          unknownRootFolders: unknownRoot.length,
          filesWithoutDisposition: files.length - placed.size,
          brokenLinks: broken.length,
          documentCountMismatch: countMismatch,
          duplicateRecordIds: [...ids.values()].filter((n) => n > 1).length,
        },
        unknownRootFolders: unknownRoot,
      };
      payload.gates.driveYearsMissingFromUI = payload.sourceYears.driveYearsMissingFromUI;
      payload.gates.uiYearsAbsentFromDrive = payload.sourceYears.uiYearsAbsentFromDrive;
      return json(res, 200, payload, req);
    }

    if (route === "registers/coverage") {
      const sum = await registers.summary();
      const cls = registers.classify();
      return json(res, 200, {
        drive: await drive.tree().then((t) => ({
          indexedAt: t.indexedAt, fileCount: t.fileCount, folderCount: t.folderCount,
          totalBytes: t.totalBytes, roots: (t.roots || []).map((r) => ({ name: r.name, fileCount: r.fileCount, bytes: r.bytes, sections: r.folders.length })),
        })),
        registers: sum,
        coverage: {
          spreadsheetsClaimed: cls.claimed.length,
          spreadsheetsUnclaimed: cls.unclaimed.length,
          unclaimed: cls.unclaimed.sort((a, b) => b.size - a.size).slice(0, 60),
          emptySources: (sum.sources || []).filter((x) => !x.records).map((x) => ({ file: x.file, root: x.root, families: x.families })),
        },
      }, req);
    }

    // Query INSIDE the documents: which contracts have a scanned copy whose
    // text contains the phrase. One Drive full-text query, mapped back through
    // each record's attached driveFiles.
    if (route === "registers/docmatches") {
      if (!mayRead("contracts")) return json(res, 403, { error: "forbidden", detail: "Your access does not include the contract register." }, req);
      const q = (query.get("q") || "").slice(0, 200).trim();
      if (!q) return json(res, 200, { term: "", contracts: [], files: 0 }, req);
      const rows = await registers.get("contracts");
      const fileToContracts = new Map();
      for (const r of rows) for (const f of r.driveFiles || []) {
        if (!fileToContracts.has(f.id)) fileToContracts.set(f.id, []);
        fileToContracts.get(f.id).push(r);
      }
      const hitIds = await drive.matchesIn(q, [...fileToContracts.keys()]);
      const seen = new Map();
      for (const id of hitIds) for (const r of fileToContracts.get(id) || []) {
        if (!seen.has(r.__source ? r.title + "|" + (r.__source.file || "") : r.title)) {
          seen.set(r.title + "|" + ((r.__source && r.__source.file) || ""), { title: r.title, ref: r.ref || "" });
        }
      }
      return json(res, 200, { term: q, files: hitIds.length, fileIds: hitIds,
        contracts: [...seen.values()].slice(0, 300) }, req);
    }

    if (route === "registers/refresh" && req.method === "POST") {
      if (me.rbac !== "head" && me.rbac !== "lead") {
        return json(res, 403, { error: "forbidden", detail: "A full re-read of every tracker is a Director/Lead action." }, req);
      }
      /* A re-read can fail for reasons that are not this caller's fault: Drive
         throttling, a revoked service account, a workbook that will not parse.
         The ingest deliberately REFUSES a degraded read rather than overwrite
         good records with a partial one — so the correct answer is "nothing
         changed, here is why", not an unhandled 500 that tells the user nothing
         and leaves them unsure whether the register was damaged. */
      let st;
      try {
        st = await registers.rebuild(true);
      } catch (e) {
        const held = await registers.ensure().catch(() => null);
        console.error("[api] registers/refresh failed:", e && e.message);
        return json(res, 503, {
          error: "refresh_failed",
          detail: "Drive could not be re-read just now. The last good data is still being served — nothing was changed or lost.",
          reason: String((e && e.message) || e).slice(0, 200),
          heldRecords: held ? Object.values(held.registers || {}).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0) : null,
        }, req);
      }
      return json(res, 200, { rebuilt: true, builtAt: st.builtAt, counts: Object.fromEntries(Object.entries(st.registers).map(([k, v]) => [k, v.length])) }, req);
    }

    const m = route.match(/^registers\/([a-z]+)$/);
    if (m) {
      const key = m[1];
      if (!registers.FAMILIES.some((f) => f.key === key)) {
        return json(res, 404, { error: "unknown register", key, known: registers.FAMILIES.map((f) => f.key) }, req);
      }
      if (!mayRead(key)) {
        return json(res, 403, { error: "forbidden", key,
          detail: "Your access does not include this register." }, req);
      }
      const all = await registers.get(key);
      // Lineage (the untouched source cells and the file/sheet/row trail) is
      // steward material: 27% of the contracts payload, re-serialized and
      // re-gzipped for every table render. It stays in the cache and is served
      // on request (?lineage=1, used by Data Health and the audit), not shipped
      // to every list.
      const wantLineage = query.get("lineage") === "1";
      const lean = (r) => { if (wantLineage) return r; const c = { ...r }; delete c.__raw; delete c.__lineage; return c; };
      // Paged: the contracts register is thousands of rows and the browser does
      // not need them all to draw the first screen.
      const limit = Math.min(parseInt(query.get("limit") || "500", 10) || 500, 5000);
      const offset = Math.max(parseInt(query.get("offset") || "0", 10) || 0, 0);
      const q = (query.get("q") || "").trim().toLowerCase();
      let rows = all;
      if (q) {
        rows = all.filter((r) => Object.entries(r).some(([k, v]) =>
          !k.startsWith("__") && String(v).toLowerCase().includes(q)));
      }
      /* RESPONSE CACHE.
         A register only changes when the ingest promotes a new dataset, so the
         same query produces byte-identical output until then. Without this the
         server re-serialized ~3MB of JSON and gzipped it synchronously on every
         request: at 50 concurrent readers the full contracts payload took 2.7s
         and the event loop was the bottleneck. Keyed on the build timestamp, so
         a new ingest invalidates everything automatically. */
      const st = await registers.ensure();
      /* The litigation register also changes when a case is raised in the app,
         which does not rebuild the book and so does not move builtAt. Its stamp
         joins the key, or readers keep being served the payload from before the
         case existed. Notices behave the same way once one is recorded here. */
      const ck = [key, limit, offset, q, wantLineage ? "L" : "-", st.builtAt,
        key === "litigation" ? registers.localCaseStamp()
          : key === "notices" ? registers.localNoticeStamp() : ""].join("|");
      const hit = REGISTER_CACHE.get(ck);
      if (hit) return sendCached(res, req, hit);
      const payload = {
        key, total: all.length, matched: rows.length, offset, limit,
        records: rows.slice(offset, offset + limit).map(lean),
      };
      const body = Buffer.from(JSON.stringify(payload), "utf8");
      const entry = { body, gz: body.length > 1400 ? zlib.gzipSync(body, { level: 6 }) : null };
      if (REGISTER_CACHE.size > 40) REGISTER_CACHE.clear();   // bounded; keys carry builtAt
      REGISTER_CACHE.set(ck, entry);
      return sendCached(res, req, entry);
    }
    return json(res, 404, { error: "unknown registers route" }, req);
  }

  // ---- Email ----
  if (route.startsWith("mail")) {
    if (route === "mail/status") {
      const c = load().mail;
      return json(res, 200, { host: c.host, port: c.port, user: c.user, credentialPresent: !!c.pass, enabled: !!c.enabled }, req);
    }
    if (route === "mail/log") return json(res, 200, { sent: mail.recentLog(50) }, req);

    // Proving the credential works is an administrative act, not a daily one.
    if (route === "mail/verify" && req.method === "POST") {
      if (me.rbac !== "head") return json(res, 403, { error: "forbidden", detail: "Director Legal only." }, req);
      return json(res, 200, await mail.verifyConnection(), req);
    }

    if (route === "mail/send" && req.method === "POST") {
      if (me.rbac !== "head") return json(res, 403, { error: "forbidden", detail: "Director Legal only while the send path is being commissioned." }, req);
      let body;
      try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const to = [].concat(body.to || []).filter(Boolean);
      if (!to.length) return json(res, 400, { error: "no recipient" }, req);
      if (!body.subject) return json(res, 400, { error: "no subject" }, req);
      try {
        const rec = await mail.sendMail({ to, cc: body.cc || [], subject: body.subject, text: body.text || "", html: body.html || "" });
        return json(res, 200, Object.assign({ ok: true, sentBy: me.email }, rec), req);
      } catch (e) {
        return json(res, 502, { error: "send_failed", detail: e.message }, req);
      }
    }
    return json(res, 404, { error: "unknown mail route" }, req);
  }

  return json(res, 404, { error: "unknown route", route }, req);
}

module.exports = { handle };
