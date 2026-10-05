// Google service-account auth — JWT bearer flow, no npm dependencies.
//
// This is the same recipe every other sync job on this box uses: sign a JWT
// with the service account's private key, exchange it at the token endpoint,
// cache the access token until shortly before it expires.
//
// The key never leaves the server. The browser talks only to /api/*; Drive is
// reached from here.
const fs = require("fs");
const crypto = require("crypto");
const { load, resolve } = require("./config");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let token = { value: "", expiresAt: 0, scope: "" };

function readServiceAccount() {
  const cfg = load();
  const file = resolve(cfg.drive.serviceAccountFile);
  if (!file || !fs.existsSync(file)) {
    const err = new Error("service account key not found at " + (cfg.drive.serviceAccountFile || "(unset)"));
    err.code = "NO_SERVICE_ACCOUNT";
    throw err;
  }
  const sa = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!sa.client_email || !sa.private_key) {
    const err = new Error("service account key is missing client_email/private_key");
    err.code = "BAD_SERVICE_ACCOUNT";
    throw err;
  }
  return sa;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

async function getAccessToken() {
  // 60s of headroom so a token never expires mid-request.
  if (token.value && Date.now() < token.expiresAt - 60000 && token.scope === SCOPE) return token.value;

  const sa = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const claims = b64url({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  });
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(header + "." + claims), sa.private_key)
    .toString("base64url");
  const assertion = header + "." + claims + "." + signature;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("token exchange failed: HTTP " + res.status + " " + text.slice(0, 300));
  const json = JSON.parse(text);
  if (!json.access_token) throw new Error("token exchange returned no access_token");

  token = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    scope: SCOPE,
  };
  return token.value;
}

// Authenticated Drive call. Returns the parsed JSON body.
async function driveJson(pathAndQuery) {
  const at = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3" + pathAndQuery, {
    headers: { Authorization: "Bearer " + at },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    // A 404 here almost always means "the folder exists but was never shared
    // with the service account" — auth succeeded, the object is just invisible.
    const err = new Error("Drive API " + res.status + ": " + text.slice(0, 300));
    err.status = res.status;
    if (res.status === 404) err.hint = "Not shared with the service account, or the id is wrong.";
    throw err;
  }
  return JSON.parse(text);
}

// Authenticated Drive call returning the raw response (for file bytes).
async function driveRaw(pathAndQuery) {
  const at = await getAccessToken();
  return fetch("https://www.googleapis.com/drive/v3" + pathAndQuery, {
    headers: { Authorization: "Bearer " + at },
    signal: AbortSignal.timeout(120000),
  });
}

function serviceAccountEmail() {
  try { return readServiceAccount().client_email; } catch (e) { return ""; }
}

module.exports = { getAccessToken, driveJson, driveRaw, serviceAccountEmail, SCOPE };
