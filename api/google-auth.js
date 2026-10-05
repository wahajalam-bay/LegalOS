/* SIGN IN WITH GOOGLE — verifying the token, and nothing more.
 *
 * The browser gets an ID token from Google Identity Services and posts it here.
 * That token is a JWT signed by Google, and the ONLY thing that makes it worth
 * anything is checking the signature against Google's own published keys. A
 * server that decodes the payload without verifying it will accept a token
 * anybody typed by hand, which is not a login, it is a formality.
 *
 * So every one of these must hold, and a failure names which:
 *
 *   signature   RS256, against the key Google says signed it (JWKS, cached by
 *               `kid`, refetched when an unknown `kid` appears — Google rotates)
 *   iss         accounts.google.com
 *   aud         OUR client id, exactly. Without this check a token minted for
 *               any other Google app would sign somebody in here.
 *   exp / nbf   within its life, with a small clock allowance
 *   email       present and email_verified true
 *
 * WHAT THIS FILE DOES NOT DO: decide who is allowed in. It returns a verified
 * email and hands the question of authorisation to the caller, because "is this
 * really them" and "may they use LegalOS" are different questions and mixing
 * them is how an identity check turns into an access grant.
 *
 * No dependency: Node's crypto verifies RS256 from a JWK directly.
 */
const crypto = require("crypto");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_S = 120;            // a couple of minutes either way

let jwks = { keys: new Map(), fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

async function loadKeys(force) {
  if (!force && jwks.keys.size && Date.now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("could not fetch Google's signing keys (HTTP " + res.status + ")");
  const body = await res.json();
  const map = new Map();
  for (const k of body.keys || []) if (k.kid) map.set(k.kid, k);
  if (!map.size) throw new Error("Google returned no signing keys");
  jwks = { keys: map, fetchedAt: Date.now() };
  return jwks.keys;
}

const b64urlJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/**
 * Verify a Google ID token. Returns { email, name, picture, sub, hd } or throws
 * with a message that says which check failed.
 */
async function verifyIdToken(idToken, clientId) {
  if (!clientId) throw new Error("no Google client id is configured on this server");
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("that is not a Google ID token");

  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); }
  catch (e) { throw new Error("the token could not be read"); }
  if (header.alg !== "RS256") throw new Error("unexpected token algorithm: " + header.alg);

  let keys = await loadKeys(false);
  let jwk = keys.get(header.kid);
  if (!jwk) { keys = await loadKeys(true); jwk = keys.get(header.kid); }   // Google rotated
  if (!jwk) throw new Error("the token was signed by a key Google does not publish");

  const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]),
    { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("the token's signature is not valid");

  if (!ISSUERS.has(String(payload.iss))) throw new Error("the token was not issued by Google");
  /* aud may be a string or an array; ours must be in it. */
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw new Error("the token was issued for a different application");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > Number(payload.exp) + CLOCK_SKEW_S) throw new Error("the sign-in has expired — try again");
  if (payload.nbf && now + CLOCK_SKEW_S < Number(payload.nbf)) throw new Error("the token is not valid yet");

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("Google did not return an email address");
  if (payload.email_verified === false) throw new Error("that Google account's email is not verified");

  return { email, name: payload.name || null, picture: payload.picture || null,
    sub: payload.sub || null, hd: payload.hd || null };
}

module.exports = { verifyIdToken };
