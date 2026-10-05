// Real identity, from Cloudflare Access.
//
// SECURITY — why this verifies a signature instead of reading a header.
// nginx passes `Cf-Access-Authenticated-User-Email` through from the incoming
// request ($http_cf_access_authenticated_user_email). Anything that reaches the
// origin directly — the box's own IP, another vhost, a container on the host —
// can therefore SET that header and be believed. It is attacker-controlled and
// must never be treated as identity.
//
// The `Cf-Access-Jwt-Assertion` header is different: Cloudflare signs it with a
// key we fetch from Cloudflare, and it names the application it was minted for.
// Verifying the signature, the audience, the issuer and the expiry is the only
// way to know who the caller is. That is what this module does.
const crypto = require("crypto");
const { load } = require("./config");

let jwks = { keys: [], fetchedAt: 0, domain: "" };
const JWKS_TTL_MS = 10 * 60 * 1000;

async function getKeys(teamDomain) {
  const fresh = Date.now() - jwks.fetchedAt < JWKS_TTL_MS;
  if (fresh && jwks.domain === teamDomain && jwks.keys.length) return jwks.keys;
  const url = "https://" + teamDomain + "/cdn-cgi/access/certs";
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("JWKS fetch failed: HTTP " + res.status);
  const body = await res.json();
  if (!body || !Array.isArray(body.keys) || !body.keys.length) throw new Error("JWKS response had no keys");
  jwks = { keys: body.keys, fetchedAt: Date.now(), domain: teamDomain };
  return jwks.keys;
}

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Verify an Access JWT and return its claims, or throw with a reason.
async function verifyToken(token, cfg) {
  if (!token || typeof token !== "string") throw new Error("no token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h64, p64, s64] = parts;

  let header, claims;
  try {
    header = JSON.parse(b64urlToBuf(h64).toString("utf8"));
    claims = JSON.parse(b64urlToBuf(p64).toString("utf8"));
  } catch (e) { throw new Error("unparseable token"); }

  // Only RS256. Refusing "none"/HS256 explicitly is what stops an algorithm
  // confusion attack, where a forged token asks us to verify it with a key we
  // would otherwise treat as a shared secret.
  if (header.alg !== "RS256") throw new Error("unexpected alg: " + header.alg);

  const keys = await getKeys(cfg.access.teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("signing key not found for kid");

  const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(h64 + "." + p64), pub, b64urlToBuf(s64));
  if (!ok) throw new Error("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now >= claims.exp) throw new Error("token expired");
  if (claims.nbf && now < claims.nbf - 60) throw new Error("token not yet valid");

  const expectedIss = "https://" + cfg.access.teamDomain;
  if (claims.iss !== expectedIss) throw new Error("issuer mismatch");

  // The audience binds the token to THIS application. Without this check a
  // valid token for any other Access app on the same team would be accepted.
  if (cfg.access.aud) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(cfg.access.aud)) throw new Error("audience mismatch");
  }
  if (!claims.email) throw new Error("token carries no email");
  return claims;
}

// The dev bypass is gated on an ENVIRONMENT VARIABLE, not on the request.
//
// A loopback check would be worthless here: nginx proxies to 127.0.0.1, so
// real traffic from the public internet arrives from the loopback address too.
// "Is this connection local" therefore cannot distinguish a developer from an
// attacker. LEGALOS_DEV is absent from the systemd unit, so production cannot
// enable the bypass even if enforce:false is left in the config by mistake.
function devModeAllowed(req) {
  if (process.env.LEGALOS_DEV !== "1") return false;
  const a = (req.socket && req.socket.remoteAddress) || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

// Resolve the caller's verified email, or null.
// Returns { email, via, reason }.
async function identify(req) {
  const cfg = load();
  const token = req.headers["cf-access-jwt-assertion"];

  if (token) {
    try {
      const claims = await verifyToken(token, cfg);
      return { email: String(claims.email).toLowerCase(), via: "cloudflare-access", reason: "" };
    } catch (e) {
      // A present-but-invalid token is a hard failure. Never fall back to the
      // unverified header here — that would hand an attacker the bypass the
      // signature check exists to prevent.
      return { email: null, via: "cloudflare-access", reason: e.message };
    }
  }

  // No token. In production that is simply unauthenticated.
  if (cfg.access.enforce) {
    return { email: null, via: "none", reason: "no Cf-Access-Jwt-Assertion header" };
  }
  // Development escape hatch — requires LEGALOS_DEV=1 in the environment, which the
  // production unit does not set. See devModeAllowed above for why.
  if (cfg.access.devBypassEmail && devModeAllowed(req)) {
    return { email: String(cfg.access.devBypassEmail).toLowerCase(), via: "dev-bypass", reason: "" };
  }
  return { email: null, via: "none", reason: "unauthenticated (enforcement off, no dev bypass)" };
}

module.exports = { identify, verifyToken };
