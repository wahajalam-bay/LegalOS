// ROUTING / CREDENTIAL INTEGRITY — proof that work always goes to the RIGHT
// person and never "to someone else":
//   • every routing default is a counsel ON the team that owns the work
//   • paralegals are never the suggested OWNER (they execute tasks)
//   • the login credential cards name real people whose team/department
//     matches the view label
//   • end to end: a Labour request lands with the litigation employment
//     counsel AND notifies the litigation team lead; IP lands with IP counsel.
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";  // Windows dev default
const BASE = `http://localhost:${process.env.LEGALOS_PORT || "4600"}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(500);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(600);

  const audit = await p.evaluate(() => Promise.all([
    import("/src/data.js"), import("/src/store.js"), import("/src/org.js"), import("/src/pages/login.js"),
  ]).then(([D, S, O, L]) => {
    const problems = [];
    const teamOf = (uid) => (D.byId(uid) || {}).legalTeam || null;
    const rbacOf = (uid) => (D.byId(uid) || {}).rbac || null;
    const nameOf = (uid) => (D.byId(uid) || {}).name || uid;

    // 1) Intake nature routing: owner exists, is not a paralegal, and sits on
    //    the team that owns the sub-division.
    Object.entries(D.PORTAL_ROUTING).forEach(([nature, r]) => {
      if (!r.owner) return;
      if (!D.byId(r.owner)) problems.push(`${nature}: owner ${r.owner} does not exist`);
      else {
        if (rbacOf(r.owner) === "paralegal") problems.push(`${nature}: routed to a paralegal (${nameOf(r.owner)})`);
        const should = O.teamOfSubdivision(r.subdivision);
        if (teamOf(r.owner) !== should) problems.push(`${nature}: ${nameOf(r.owner)} is on ${teamOf(r.owner)}, sub-division belongs to ${should}`);
      }
    });

    // 2) Category → suggested owner: right team, counsel (member/lead), never paralegal.
    const catChecks = {};
    ["Contract Drafting / Review", "Amendment / Renewal / Termination", "Legal Opinion / Advisory",
     "Dispute / Litigation", "Regulatory / Compliance", "IP", "Triage required"].forEach((cat) => {
      const uid = S.suggestOwner({ category: cat });
      catChecks[cat] = uid ? `${nameOf(uid)} (${teamOf(uid)}/${rbacOf(uid)})` : "none";
      if (!uid) problems.push(`${cat}: no suggested owner`);
      else if (rbacOf(uid) === "paralegal") problems.push(`${cat}: suggested owner is a paralegal`);
    });
    const disputeTeam = teamOf(S.suggestOwner({ category: "Dispute / Litigation" }));
    if (disputeTeam !== "litigation") problems.push(`Dispute suggestion went to ${disputeTeam}`);
    const ipTeam = teamOf(S.suggestOwner({ category: "IP" }));
    if (ipTeam !== "litigation") problems.push(`IP suggestion went to ${ipTeam}`);
    const regTeam = teamOf(S.suggestOwner({ category: "Regulatory / Compliance" }));
    if (regTeam !== "compliance") problems.push(`Regulatory suggestion went to ${regTeam}`);

    // 3) Matter expert auto-assign per practice area: right team, member/lead only.
    const practiceTeam = { commercial: "commercial", administrative: "commercial", advisory: "commercial", realestate: "commercial", corporate: "compliance", regulatory: "compliance", disputes: "litigation", ip: "litigation", employment: "litigation" };
    Object.entries(practiceTeam).forEach(([pa, team]) => {
      const uid = S.suggestMatterOwner(pa);
      if (!uid) { problems.push(`matter expert for ${pa}: none`); return; }
      if (teamOf(uid) !== team) problems.push(`matter expert for ${pa}: ${nameOf(uid)} is on ${teamOf(uid)}, expected ${team}`);
      if (rbacOf(uid) === "paralegal") problems.push(`matter expert for ${pa} is a paralegal`);
    });

    // 4) Credential cards: every id exists; legal labels match the person's
    //    team; business labels match the person's department.
    const teamWord = { commercial: /Commercial/i, litigation: /Litigation/i, compliance: /Compliance/i };
    L.CREDENTIAL_GROUPS.forEach((g) => g.people.forEach((pp) => {
      const u = D.byId(pp.id);
      if (!u) { problems.push(`credential ${pp.id} (${pp.view}) does not exist`); return; }
      if (/Leadership/.test(g.section) && u.rbac !== "head") problems.push(`${u.name} listed as leadership but rbac=${u.rbac}`);
      if (/Senior Managers/.test(g.section) && u.rbac !== "lead") problems.push(`${u.name} listed as Senior Manager but rbac=${u.rbac}`);
      if (/Associates/.test(g.section) && !["member", "paralegal"].includes(u.rbac)) problems.push(`${u.name} listed as associate/paralegal but rbac=${u.rbac}`);
      if (/Business departments/.test(g.section)) {
        if (u.legalTeam) problems.push(`${u.name} listed as business but is legal staff`);
        const deptMap = { "Finance": "Finance", "Human Resources": "HR", "Procurement": "Procurement", "Sales & Marketing": "Sales & Marketing" };
        const label = pp.view.split("—")[0].trim();
        if (deptMap[label] && u.dept !== deptMap[label]) problems.push(`${u.name}: card says "${pp.view}" but dept is ${u.dept}`);
      } else if (u.legalTeam && teamWord[u.legalTeam] && / · /.test(pp.view)) {
        if (!teamWord[u.legalTeam].test(pp.view)) problems.push(`${u.name}: card says "${pp.view}" but team is ${u.legalTeam}`);
      }
    }));

    return { problems, catChecks };
  }));
  console.log("   suggested owners:", JSON.stringify(audit.catChecks));
  if (audit.problems.length) audit.problems.forEach((x) => console.log("   ✗ " + x));
  ok("no routing/credential mismatches anywhere", audit.problems.length === 0);

  // 5) END TO END: a Labour request goes to the employment counsel on the
  //    litigation team, and the LITIGATION lead is notified — not someone else.
  const e2e = await p.evaluate(() => Promise.all([import("/src/store.js"), import("/src/data.js")]).then(([S, D]) => {
    const res = S.submitLegalRequest({ title: "Dismissal dispute — warehouse staff", requestType: "New", entityId: "CO-19", requesterId: "u14", natureOfMatter: "Labour Matters", subdivision: "Labour/Employment", category: "Dispute / Litigation", urgencyBand: "Important", description: "x" });
    const owner = D.byId(res.owner) || {};
    const notifs = (S.getCollection("notifs") || []).filter((n) => n.title && n.title.includes(res.id));
    const leadNotified = notifs.some((n) => n.forUserId === "u6"); // David — litigation lead
    const wrongLead = notifs.some((n) => ["u3", "u20"].includes(n.forUserId)); // other teams' leads
    const ip = S.submitLegalRequest({ title: "Trademark filing — brand mark", requestType: "New", entityId: "CO-19", requesterId: "u14", natureOfMatter: "Intellectual Property", subdivision: "IP", category: "IP", urgencyBand: "Important", description: "x" });
    return { owner: owner.name, ownerTeam: owner.legalTeam, ownerRbac: owner.rbac, leadNotified, wrongLead, ipOwner: (D.byId(ip.owner) || {}).name, ipOwnerTeam: (D.byId(ip.owner) || {}).legalTeam };
  }));
  console.log("   labour →", e2e.owner, "(" + e2e.ownerTeam + ")", "· IP →", e2e.ipOwner, "(" + e2e.ipOwnerTeam + ")");
  ok("labour request lands with a LITIGATION counsel (not another team)", e2e.ownerTeam === "litigation" && e2e.ownerRbac !== "paralegal");
  ok("the LITIGATION team lead is notified — and no other team's lead", e2e.leadNotified && !e2e.wrongLead);
  ok("IP request lands with the IP desk on litigation", e2e.ipOwnerTeam === "litigation");

  console.log("console errors:", errs.length, errs.slice(0, 6).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} routing-integrity checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
