// RBAC matrix — every role, every gated surface.
//
// Two rules this suite exists to hold down, because both have regressed before:
//
//   1. EXACTLY ONE dashboard per identity. The rail carries /exec, /team and
//      /me; a person must see their own and no other. The department-wide
//      /exec view additionally requires FULL access to Insight & Governance.
//   2. TEAM ISOLATION. Commercial sees Commercial, Compliance sees Compliance,
//      Litigation sees Litigation — registers, group hubs, module pages and the
//      /rec/<kind> detail all move together, and the nav can never offer a row
//      the router would refuse.
//
// It drives the REAL rbac.js in a real browser (the rules are browser ESM and
// import the store), against an isolated instance. Nothing here touches the
// live service.
//
//   node tests/m1-rbac-matrix.js
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const puppeteer = require("./_puppeteer.js");

const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_RBAC_PORT || "4715";
const BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
}

/* Refuse to run against a server that is already listening.
   A leftover instance from a crashed run keeps the port; this run's server then
   fails to bind silently and every request goes to the STALE sandbox — which
   produces confident nonsense (duplicate record ids, an empty store, "not
   signed in") that reads exactly like a product bug. */
function refuseIfPortBusy(port) {
  const { execSync } = require("child_process");
  let busy = false;
  try { busy = execSync(`ss -tln 2>/dev/null | grep -c ":${port} " || true`, { encoding: "utf8" }).trim() !== "0"; }
  catch (e) { busy = false; }
  if (busy) {
    console.error(`\n  port ${port} is already in use — a previous run did not shut down.`);
    console.error("  Stop it first. Refusing to test a stale instance.\n");
    process.exit(2);
  }
}
refuseIfPortBusy(PORT);

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-rbac-"));
let server = null;
const ping = () => new Promise((resolve) => {
  const req = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on("error", () => resolve(false));
  req.setTimeout(1200, () => { req.destroy(); resolve(false); });
});

/* The permission engine's own role templates, as effective group maps. These
   mirror api/permissions.js ROLE_TEMPLATES; the point is to prove canOpenPath
   obeys whatever the engine hands it. */
const FULL = { commercial: "full", compliance: "full", litigation: "full", shared: "full", insight: "full", admin: "full" };
const none = { commercial: "none", compliance: "none", litigation: "none", shared: "none", insight: "none", admin: "none" };
const teamOf = (team, level, extra) => Object.assign({}, none, { [team]: level, shared: "view" }, extra || {});

(async () => {
  console.log("RBAC matrix — one dashboard per role, and team isolation\n");
  const r = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (r.status !== 0) throw new Error("copy failed");
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT } });
  for (let i = 0; i < 30 && !(await ping()); i++) await w(400);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await browser.newPage();
  p.on("pageerror", (e) => console.log("  PAGEERROR:", e.message));
  await p.goto(BASE + "/#/login", { waitUntil: "networkidle2", timeout: 60000 });
  await w(2500);
  const ver = await p.evaluate(() => {
    const s = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x));
    return (s && s.match(/src-v\d+/) || ["src"])[0];
  });
  console.log("  build:", ver, "\n");

  // One evaluation helper: given a synthetic identity, return what the rules say.
  const probe = (user, paths) => p.evaluate(async (ver, user, paths) => {
    const rbac = await import(`./${ver}/rbac.js`);
    const out = { nav: [], can: {} };
    paths.forEach((path) => { out.can[path] = rbac.canOpenPath(user, path); });
    try {
      /* SECTION LABELS COUNT AS NAVIGATION, BECAUSE THEY ARE NAVIGATION.
         This read item labels only. That was the whole nav while each module
         family was a single row; families are disclosures now and their name is
         the SECTION label, so the team-isolation check below was matching
         against a list that no longer contained "Litigation & Disputes" at all
         and saw zero families for everyone. The family name is what a person
         sees in the rail either way. */
      out.nav = rbac.navForUser(user).flatMap((s) =>
        [...(s.section ? [s.section] : []), ...(s.items || []).map((i) => i.label)]);
    } catch (e) { out.nav = ["ERR:" + e.message]; }
    return out;
  }, ver, user, paths);

  const DASH = ["/exec", "/team", "/me"];
  const dashLabels = (nav) => nav.filter((l) => /^(Dashboard|Team Dashboard|My Dashboard)$/.test(l));

  /* ---------------- 1. one dashboard per role ---------------- */
  console.log("1. Exactly one dashboard per identity");
  const ROLES = [
    { label: "Director Legal (head, full access)", user: { id: "u1", rbac: "head", legalTeam: null, permissions: { status: "active", groups: FULL } }, want: "/exec", navWant: "Dashboard" },
    { label: "Team Lead — Litigation", user: { id: "u6", rbac: "lead", legalTeam: "litigation", permissions: { status: "active", groups: teamOf("litigation", "edit", { insight: "view" }) } }, want: "/team", navWant: "Team Dashboard" },
    { label: "Associate — Commercial", user: { id: "u5", rbac: "member", legalTeam: "commercial", permissions: { status: "active", groups: teamOf("commercial", "edit") } }, want: "/me", navWant: "My Dashboard" },
    { label: "Paralegal", user: { id: "u10", rbac: "paralegal", legalTeam: "commercial", permissions: { status: "active", groups: teamOf("commercial", "view") } }, want: "/me", navWant: "My Dashboard" },
  ];
  for (const role of ROLES) {
    const got = await probe(role.user, DASH);
    const allowed = DASH.filter((d) => got.can[d]);
    check(`${role.label}: exactly one dashboard`, allowed.length === 1, "allowed=" + JSON.stringify(allowed));
    check(`${role.label}: it is ${role.want}`, allowed[0] === role.want, "got " + allowed[0]);
    const dl = dashLabels(got.nav);
    check(`${role.label}: nav shows one dashboard row (${role.navWant})`,
      dl.length === 1 && dl[0] === role.navWant, "nav=" + JSON.stringify(dl));
  }

  /* ---- the three super admins all see the SAME thing ---- */
  console.log("\n1b. Super admins see the same view regardless of job title");
  const SUPERS = [
    { label: "Maryam Haq (head)",    user: { id: "u1", rbac: "head", legalTeam: null,         permissions: { status: "active", groups: FULL } } },
    { label: "Imran Tariq (lead)",   user: { id: "u3", rbac: "lead", legalTeam: "commercial", permissions: { status: "active", groups: FULL } } },
    { label: "Salman Rashid (lead)", user: { id: "u6", rbac: "lead", legalTeam: "litigation", permissions: { status: "active", groups: FULL } } },
  ];
  const SUPER_SURFACES = ["/exec", "/team", "/me", "/contracts", "/compliance", "/litigation",
    "/g/commercial", "/g/compliance", "/g/litigation", "/access", "/organization", "/reports"];
  let baseline = null;
  for (const sa of SUPERS) {
    const got = await probe(sa.user, SUPER_SURFACES);
    const allowedDash = DASH.filter((d) => got.can[d]);
    check(`${sa.label}: lands on the department Dashboard`, allowedDash.length === 1 && allowedDash[0] === "/exec",
      "dashboards=" + JSON.stringify(allowedDash));
    const denied = SUPER_SURFACES.filter((x) => x !== "/team" && x !== "/me" && !got.can[x]);
    check(`${sa.label}: opens every surface`, denied.length === 0, "refused: " + JSON.stringify(denied));
    const sig = JSON.stringify(got.can);
    if (!baseline) baseline = { sig, label: sa.label };
    else check(`${sa.label}: identical access to ${baseline.label}`, sig === baseline.sig);
  }

  /* ---------------- 2. /exec needs FULL insight ---------------- */
  console.log("\n2. The department-wide Dashboard is full-access only");
  const headViewOnly = { id: "u1", rbac: "head", legalTeam: null, permissions: { status: "active", groups: Object.assign({}, FULL, { insight: "view" }) } };
  let g = await probe(headViewOnly, DASH);
  check("head with insight=view is refused /exec", g.can["/exec"] === false);
  check("...and is not silently left with no home (/me opens)", g.can["/me"] === true);
  const leadNoInsight = { id: "u6", rbac: "lead", legalTeam: "litigation", permissions: { status: "active", groups: teamOf("litigation", "edit") } };
  g = await probe(leadNoInsight, DASH);
  check("lead with insight=none is refused /team", g.can["/team"] === false);

  /* ---------------- 3. team isolation ---------------- */
  console.log("\n3. Team isolation (registers, hubs, modules, record detail)");
  const SURFACES = ["/contracts", "/tracker", "/projects", "/compliance", "/licenses", "/litigation",
    "/g/commercial", "/g/compliance", "/g/litigation",
    "/m/contracts", "/m/licenses", "/m/cases",
    "/rec/contract/X", "/rec/licence/X", "/rec/litigation/X", "/access"];
  const TEAMS = [
    { team: "commercial", allow: ["/contracts", "/tracker", "/projects", "/g/commercial", "/m/contracts", "/rec/contract/X"], deny: ["/compliance", "/licenses", "/litigation", "/g/compliance", "/g/litigation", "/m/licenses", "/m/cases", "/rec/licence/X", "/rec/litigation/X", "/access"] },
    { team: "compliance", allow: ["/compliance", "/licenses", "/g/compliance", "/m/licenses", "/rec/licence/X"], deny: ["/contracts", "/tracker", "/litigation", "/g/commercial", "/g/litigation", "/m/contracts", "/m/cases", "/rec/contract/X", "/rec/litigation/X", "/access"] },
    { team: "litigation", allow: ["/litigation", "/g/litigation", "/m/cases", "/rec/litigation/X"], deny: ["/contracts", "/tracker", "/compliance", "/licenses", "/g/commercial", "/g/compliance", "/m/contracts", "/m/licenses", "/rec/contract/X", "/rec/licence/X", "/access"] },
  ];
  for (const t of TEAMS) {
    const user = { id: "x", rbac: "member", legalTeam: t.team, permissions: { status: "active", groups: teamOf(t.team, "edit") } };
    const got = await probe(user, SURFACES);
    const wrongAllow = t.allow.filter((s) => !got.can[s]);
    const wrongDeny = t.deny.filter((s) => got.can[s]);
    check(`${t.team}: opens its own surfaces`, wrongAllow.length === 0, "refused: " + JSON.stringify(wrongAllow));
    check(`${t.team}: is refused every other team's`, wrongDeny.length === 0, "leaked: " + JSON.stringify(wrongDeny));
    const navTeams = got.nav.filter((l) => /Commercial & Risk|Compliance & Licences|Litigation & Disputes/.test(l));
    check(`${t.team}: the rail shows only its own family`, navTeams.length === 1, "families in the rail=" + JSON.stringify(navTeams));
  }

  /* ---------------- 4. admin surface ---------------- */
  console.log("\n4. Administration");
  g = await probe({ id: "u1", rbac: "head", legalTeam: null, permissions: { status: "active", groups: FULL } }, ["/access", "/organization", "/settings"]);
  check("a full-access admin opens Users & Access", g.can["/access"] === true);
  g = await probe({ id: "u5", rbac: "member", legalTeam: "commercial", permissions: { status: "active", groups: teamOf("commercial", "edit") } }, ["/access", "/organization"]);
  check("a non-admin is refused Users & Access", g.can["/access"] === false);
  check("a non-admin is refused Organization", g.can["/organization"] === false);

  /* ---------------- 5. requesters and deactivated accounts ---------------- */
  console.log("\n5. Business requesters & deactivated accounts");
  const requester = { id: "dept-finance", rbac: "bizHead", legalTeam: null, dept: "Finance" };
  g = await probe(requester, ["/raise", "/requests", "/my-requests", "/contracts", "/litigation", "/exec", "/team", "/me", "/access", "/g/commercial"]);
  check("requester may raise", g.can["/raise"] === true);
  check("requester may track their requests", g.can["/requests"] === true);
  const leaked = ["/contracts", "/litigation", "/exec", "/team", "/me", "/access", "/g/commercial"].filter((s) => g.can[s]);
  check("requester is refused every legal surface", leaked.length === 0, "leaked: " + JSON.stringify(leaked));

  const legalUser = { id: "u5", rbac: "member", legalTeam: "commercial", permissions: { status: "active", groups: teamOf("commercial", "edit") } };
  g = await probe(legalUser, ["/raise"]);
  check("legal staff may NOT raise (the business does)", g.can["/raise"] === false);

  const dead = { id: "u5", rbac: "member", legalTeam: "commercial", permissions: { status: "inactive", groups: teamOf("commercial", "edit") } };
  g = await probe(dead, ["/contracts", "/me", "/workspace", "/login"]);
  const stillOpen = ["/contracts", "/me", "/workspace"].filter((s) => g.can[s]);
  check("a deactivated account opens nothing but /login", stillOpen.length === 0, "open: " + JSON.stringify(stillOpen));
  check("...and /login stays reachable", g.can["/login"] === true);

  /* ---------------- 5b. View-As must not carry the viewer's access -------- */
  console.log("\n5c. View-As renders the VIEWED person's access, not the viewer's");
  const viewAs = await p.evaluate(async (ver) => {
    const rbac = await import(`./${ver}/rbac.js`);
    const store = await import(`./${ver}/store.js`);
    // A super admin is signed in...
    store.setSession({
      account: { id: "u1", name: "Maryam Haq", email: "maryam.haq@zameen.com", rbac: "head",
        permissions: { status: "active", groups: { commercial: "full", compliance: "full", litigation: "full", shared: "full", insight: "full", admin: "full" } } },
      viewAsId: "u1", viewAsPermissions: null,
    });
    const asSelf = rbac.activeUser();
    // ...and previews a litigation associate (Afzal Chaudhary).
    store.setSession({ viewAsId: "u19", viewAsPermissions: null });
    const previewed = rbac.activeUser();
    const paths = ["/contracts", "/tracker", "/compliance", "/licenses", "/litigation",
      "/g/commercial", "/g/compliance", "/g/litigation", "/access", "/organization", "/exec", "/team", "/me"];
    const can = {}; paths.forEach((x) => { can[x] = rbac.canOpenPath(previewed, x); });
    return {
      selfName: asSelf.name, selfPerms: !!(asSelf.permissions),
      name: previewed.name, team: previewed.legalTeam, rbac: previewed.rbac,
      inheritedAdminGrant: !!(previewed.permissions && previewed.permissions.groups && previewed.permissions.groups.admin === "full"),
      can,
      nav: rbac.navForUser(previewed).flatMap((x) =>
        [...(x.section ? [x.section] : []), ...(x.items || []).map((i) => i.label)]),
    };
  }, ver);
  check("the signed-in super admin keeps their own permissions", viewAs.selfPerms === true);
  check("View-As renders the viewed person", /Afzal/i.test(viewAs.name || ""), "name=" + viewAs.name);
  check("the viewer's admin grant is NOT inherited", viewAs.inheritedAdminGrant === false);
  const vaLeaks = ["/contracts", "/tracker", "/compliance", "/licenses", "/g/commercial", "/g/compliance", "/access", "/organization", "/exec"]
    .filter((x) => viewAs.can[x]);
  check("previewed associate cannot open other teams / admin / exec", vaLeaks.length === 0, "leaked: " + JSON.stringify(vaLeaks));
  check("previewed associate CAN open their own team", viewAs.can["/litigation"] === true);
  check("previewed associate gets My Dashboard only", viewAs.can["/me"] === true && viewAs.can["/team"] === false && viewAs.can["/exec"] === false);
  const vaNavLeaks = (viewAs.nav || []).filter((l) => /Commercial & Risk|Compliance & Licences|Administration|^Contracts$|^Dashboard$|Team Dashboard/.test(l));
  check("previewed associate's NAV shows no other team, no admin, no exec", vaNavLeaks.length === 0, "nav leaked: " + JSON.stringify(vaNavLeaks));

  /* ---------------- 6. nav can never offer what the router refuses -------- */
  console.log("\n6. The menu never offers a refused row");
  for (const t of TEAMS) {
    const user = { id: "x", rbac: "member", legalTeam: t.team, permissions: { status: "active", groups: teamOf(t.team, "edit") } };
    const bad = await p.evaluate(async (ver, user) => {
      const rbac = await import(`./${ver}/rbac.js`);
      const nav = rbac.navForUser(user);
      const rows = nav.flatMap((s) => s.items || []);
      return rows.filter((i) => !rbac.canOpenPath(user, i.path)).map((i) => i.label);
    }, ver, user);
    check(`${t.team}: every visible row is openable`, bad.length === 0, "unopenable: " + JSON.stringify(bad));
  }

  await browser.close();
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error("SUITE ERROR:", e);
  try { server.kill("SIGKILL"); } catch (x) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});
