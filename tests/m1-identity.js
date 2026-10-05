// Identity boundary: Cloudflare Access token -> LegalOS user -> effective access.
//
// Interactive SSO cannot be completed from a server, so the verification layer
// is exercised with a TEST RSA key: this suite stands up a local JWKS endpoint,
// points a throwaway config at it, and mints correctly-signed tokens. No
// production key, secret or token is used or written anywhere.
//
// It proves the application side end to end: signature, audience, issuer,
// expiry, algorithm, then the roster mapping and the permission engine.
//
//   node tests/m1-identity.js
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

(async () => {
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-ident-"));
  const r = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (r.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));

  // ---- a TEST key pair and a local JWKS endpoint ----
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const KID = "legalos-test-key";
  const jwks = { keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid: KID, n: jwk.n, e: jwk.e }] };

  const jwksServer = http.createServer((req, res) => {
    if (req.url.startsWith("/cdn-cgi/access/certs")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(jwks));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((rs) => jwksServer.listen(0, "127.0.0.1", rs));
  const port = jwksServer.address().port;
  const TEAM = `127.0.0.1:${port}`;
  const AUD = "test-audience-" + crypto.randomBytes(6).toString("hex");

  // access.js builds https://<teamDomain>/cdn-cgi/access/certs — serve that over
  // plain http by overriding the fetch it uses. Simplest: patch the module's
  // getKeys through its own config + a local https-less shim.
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  cfg.access.teamDomain = TEAM; cfg.access.aud = AUD;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  // access.js fetches https://TEAM/... — rewrite to http for the test only.
  const accessPath = path.join(SANDBOX, "api", "access.js");
  let accessSrc = fs.readFileSync(accessPath, "utf8");
  accessSrc = accessSrc.replace('const url = "https://" + teamDomain + "/cdn-cgi/access/certs";',
                                'const url = (process.env.LEGALOS_TEST_JWKS_HTTP === "1" ? "http://" : "https://") + teamDomain + "/cdn-cgi/access/certs";');
  fs.writeFileSync(accessPath, accessSrc);
  process.env.LEGALOS_TEST_JWKS_HTTP = "1";
  process.env.LEGALOS_NO_WARM = "1";

  const access = require(path.join(SANDBOX, "api", "access.js"));
  const identity = require(path.join(SANDBOX, "api", "identity.js"));
  const permissions = require(path.join(SANDBOX, "api", "permissions.js"));

  const mint = (claims, { alg = "RS256", kid = KID, sign = true } = {}) => {
    const header = b64url(JSON.stringify({ alg, kid, typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(JSON.stringify(Object.assign({
      iss: "https://" + TEAM, aud: AUD, exp: now + 600, iat: now,
    }, claims)));
    if (!sign) return `${header}.${payload}.`;
    const sig = crypto.sign("RSA-SHA256", Buffer.from(header + "." + payload), privateKey);
    return `${header}.${payload}.${b64url(sig)}`;
  };
  const verify = async (token) => {
    try { return { ok: true, claims: await access.verifyToken(token, cfg) }; }
    catch (e) { return { ok: false, error: e.message }; }
  };

  console.log("1. Cloudflare Access token validation (test key)");
  const good = await verify(mint({ email: "maryam.haq@zameen.com" }));
  check("a correctly signed token is accepted", good.ok, good.error);
  check("the email is extracted from the token", good.ok && good.claims.email === "maryam.haq@zameen.com");

  const wrongAud = await verify(mint({ email: "maryam.haq@zameen.com", aud: "some-other-app" }));
  check("wrong audience is rejected", !wrongAud.ok && /audience/i.test(wrongAud.error || ""), wrongAud.error);

  const wrongIss = await verify(mint({ email: "maryam.haq@zameen.com", iss: "https://evil.example" }));
  check("wrong issuer is rejected", !wrongIss.ok && /issuer/i.test(wrongIss.error || ""), wrongIss.error);

  const expired = await verify(mint({ email: "maryam.haq@zameen.com", exp: Math.floor(Date.now() / 1000) - 60 }));
  check("expired token is rejected", !expired.ok && /expired/i.test(expired.error || ""), expired.error);

  const badSig = (() => { const t = mint({ email: "maryam.haq@zameen.com" }).split("."); return t[0] + "." + t[1] + "." + b64url(crypto.randomBytes(256)); })();
  check("invalid signature is rejected", !(await verify(badSig)).ok);

  const algNone = await verify(mint({ email: "maryam.haq@zameen.com" }, { alg: "none", sign: false }));
  check("alg:none is rejected", !algNone.ok && /alg/i.test(algNone.error || ""), algNone.error);

  const hs256 = await verify(mint({ email: "maryam.haq@zameen.com" }, { alg: "HS256" }));
  check("HS256 (algorithm confusion) is rejected", !hs256.ok && /alg/i.test(hs256.error || ""), hs256.error);

  const unknownKid = await verify(mint({ email: "maryam.haq@zameen.com" }, { kid: "not-a-real-kid" }));
  check("unknown signing key is rejected", !unknownKid.ok && /key/i.test(unknownKid.error || ""), unknownKid.error);

  const noEmail = await verify(mint({}));
  check("a token with no email yields no identity", !noEmail.ok || !noEmail.claims.email, JSON.stringify(noEmail.claims || {}).slice(0, 60));

  console.log("\n2. Identity -> LegalOS user");
  const forSuper = ["u1", "u3", "u6"].map((id) => {
    const u = identity.listRoster().find((x) => x.id === id);
    return { id, email: u && u.email, name: u && u.name };
  });
  for (const s of forSuper) {
    const p = identity.principalFor(s.email);
    const eff = permissions.effectiveFor({ id: p.id, rbac: p.rbac, legalTeam: p.legalTeam, admin: p.admin });
    const full = eff.groups && Object.values(eff.groups).every((v) => v === "full");
    check(`${s.name} (${s.id}) resolves from their roster email to a full-access principal`,
      p.id === s.id && p.provisioned && full, `id=${p.id} role=${eff.role} groups=${JSON.stringify(eff.groups)}`);
  }

  console.log("\n3. Case and whitespace normalisation");
  const base = identity.principalFor(forSuper[0].email);
  for (const variant of [forSuper[0].email.toUpperCase(), "  " + forSuper[0].email + "  ",
    forSuper[0].email.replace(/^./, (c) => c.toUpperCase())]) {
    const p = identity.principalFor(variant);
    check(`${JSON.stringify(variant.slice(0, 26))} resolves to the same user`, p.id === base.id, "got " + p.id);
  }

  console.log("\n4. Unknown, disabled and conflicting identities");
  const unknown = identity.principalFor("someone.new@zameen.com");
  check("an unknown authenticated identity is NOT provisioned", unknown.provisioned === false);
  check("...and is not a legal user", unknown.canReadKnowledge === false && unknown.id === null);
  check("...and is not an administrator", !unknown.admin);

  // deactivate a roster user through the engine, then re-resolve
  const victim = "u10";
  const before = permissions.listUsers().find((u) => u.id === victim);
  permissions.updateUser(victim, { status: "inactive" }, "identity-test");
  const disabledUser = identity.listRoster().find((u) => u.id === victim);
  const dp = identity.principalFor(disabledUser.email);
  check("a deactivated account is refused even with a valid token", dp.disabled === true, JSON.stringify({ disabled: dp.disabled, rbac: dp.rbac }));
  check("...and carries no knowledge access", dp.canReadKnowledge === false);
  permissions.updateUser(victim, { status: "active", groups: before.groups }, "identity-test");
  check("the fixture user is restored", permissions.listUsers().find((u) => u.id === victim).status === "active");

  check("no identity conflicts in the current roster", identity.identityConflicts().length === 0,
    JSON.stringify(identity.identityConflicts()));

  // simulate a conflict by pointing two roster rows at one address
  const dataFile = path.join(SANDBOX, "src", "data.js");
  const orig = fs.readFileSync(dataFile, "utf8");
  const dupEmail = forSuper[0].email;
  const patched = orig.replace(/email: "ali\.raza@zameen\.com"/, `email: "${dupEmail}"`);
  if (patched !== orig) {
    fs.writeFileSync(dataFile, patched);
    delete require.cache[require.resolve(path.join(SANDBOX, "api", "identity.js"))];
    const ident2 = require(path.join(SANDBOX, "api", "identity.js"));
    const conflicts = ident2.identityConflicts();
    check("two rows claiming one login are detected", conflicts.length === 1, JSON.stringify(conflicts));
    const cp = ident2.principalFor(dupEmail);
    check("...and the principal is refused rather than guessed", !!cp.identityConflict && cp.provisioned === false,
      JSON.stringify({ conflict: cp.identityConflict, provisioned: cp.provisioned }));
    fs.writeFileSync(dataFile, orig);
  } else {
    check("conflict fixture applied", false, "could not patch a duplicate email into the test roster");
  }

  jwksServer.close();
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR:", e); process.exit(1); });
