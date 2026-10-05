# LegalOS — identity & access security report

Generated from `tests/m1-identity.js` (25 checks) plus live probes against the deployed
edge and origin. **No token, key or secret appears in this document or in any test
artifact.** The JWT tests use a throwaway RSA key pair generated at run time.

---

## 1. The production authentication chain, as implemented

```
Browser
  │  https://zameenpkreports.com/legalos/
  ▼
Cloudflare  ──────────────────────────────── verified: returns HTTP 302 (Access challenge)
  │  Access policy on the hostname
  ▼
Cloudflare Access issues a signed assertion
  │  header: Cf-Access-Jwt-Assertion   (RS256)
  ▼
nginx  /etc/nginx/sites-enabled/zameen_bse_reports
  │  proxy_pass → 127.0.0.1:4600, forwards Cf-Access-* and Cf-Ray
  │  NOTE: no Cloudflare IP allow-list — see §6
  ▼
api/access.js  identify(req)
  │  1. reads Cf-Access-Jwt-Assertion (the PLAINTEXT email header is never trusted alone)
  │  2. fetches the team JWKS: https://<teamDomain>/cdn-cgi/access/certs  (cached 10 min)
  │  3. header.alg must be RS256          — "none"/HS256 refused explicitly
  │  4. header.kid must match a JWKS key  — unknown kid refused
  │  5. crypto.verify("RSA-SHA256", …)    — signature
  │  6. claims.exp                        — expiry
  │  7. claims.iss === https://<teamDomain>
  │  8. claims.aud includes the configured Access AUD tag
  │  → { email, via: "cloudflare-access" }   or   { email: null }
  ▼
api/auth.js  sessionFromReq(req)                       (the second, independent source)
  │  scrypt-verified credential login → HttpOnly cookie `legalos_sess`
  │  12h absolute / 60min idle; per-(ip, account) lockout after 5 failures
  ▼
api/router.js  identity precedence
  │  CF identity wins when it is a KNOWN roster address; otherwise the verified
  │  app-session account is used (an SSO address that differs from the roster must
  │  not downgrade a valid sign-in to no-access)
  ▼
api/identity.js  principalFor(email)
  │  email normalised (trimmed, lower-cased)
  │  ├─ two roster rows claim it      → identityConflict, REFUSED
  │  ├─ roster row + status inactive  → disabled, REFUSED
  │  ├─ on the config admins list     → provisioned, admin
  │  ├─ on the roster                 → provisioned, real role/team
  │  └─ none of the above             → provisioned: FALSE
  ▼
api/router.js  gates (in this order)
  │  identityConflict → 403 identity_conflict
  │  disabled         → 403 account_disabled
  │  !provisioned     → 403 not_provisioned  (except the requester intake routes)
  ▼
api/permissions.js  effectiveFor(principal)
  │  role template + per-user overrides → module GROUP × LEVEL, default-DENY
  ▼
API authorization
  │  registers gated per family on the owning group
  │  admin surfaces gated on admin === "full"
  ▼
record / document scope
```

**Cloudflare establishes identity. LegalOS establishes authorization.** A Cloudflare-
authenticated email grants nothing by itself: it must resolve to a provisioned, active
roster user, and that user's effective permissions decide every read.

## 2. Token validation

| Case | Expected | Result |
|---|---|---|
| Correctly signed token | accepted, email extracted | PASS |
| Wrong audience | rejected | PASS — "audience mismatch" |
| Wrong issuer | rejected | PASS — "issuer mismatch" |
| Expired | rejected | PASS — "token expired" |
| Invalid signature | rejected | PASS |
| `alg: none` | rejected | PASS — "unexpected alg" |
| `HS256` (algorithm confusion) | rejected | PASS — "unexpected alg" |
| Unknown `kid` | rejected | PASS — "signing key not found" |
| No email claim | yields no identity | PASS |

Probed additionally against the **live origin**: a plaintext
`Cf-Access-Authenticated-User-Email: maryam.haq@zameen.com`, a forged
`Cf-Access-Jwt-Assertion`, and an `alg:none` token each returned **401**.

## 3. Identity → roster mapping

Verified through stable roster ids, not display names:

| Roster id | Name | Resolves from their roster email | Effective access |
|---|---|---|---|
| `u1` | Maryam Haq | PASS | all six groups `full` |
| `u3` | Imran Tariq Mir | PASS | all six groups `full` |
| `u6` | Salman Rashid | PASS | all six groups `full` |

Full access is **configured through the permission engine**, not granted by name, by email
pattern, or by being authenticated at the edge.

## 4. Normalisation, unknown, disabled, conflicting

| Case | Expected | Result |
|---|---|---|
| `MARYAM.HAQ@…` (upper) | same user | PASS — `u1` |
| `  maryam.haq@…  ` (padded) | same user | PASS — `u1` |
| `Maryam.haq@…` (mixed) | same user | PASS — `u1` |
| Unknown but authenticated address | **not provisioned**, not a legal user, not admin | PASS |
| Roster user, status inactive | refused despite a valid token | PASS — `disabled`, no knowledge access |
| Two roster rows claiming one login | refuse, never pick one | PASS — `identity_conflict`, surfaced in Data Health |

**Unknown identity behaviour.** An authenticated address LegalOS has never seen is
`provisioned: false`. Every API route returns **403 `not_provisioned`** with an explicit
message, except the requester intake routes (`/api/requests`), which are the business
front door by design — that surface stores nothing but the caller's own requests and reads
back only their own. It is not general Legal access, not a legal role, and not admin.

## 5. Session behaviour

| Case | Result |
|---|---|
| Login | scrypt verified, HttpOnly cookie, 12h absolute / 60min idle |
| 5 wrong passwords | 429 for ~15 min, per (ip, account) |
| Correct password during lockout | still refused — deliberate; the window is short and scoped, so one attacker cannot hold an account down indefinitely |
| Permission revoked mid-session | refused on the **next** call (evaluated per request, never cached in the token) |
| Account deactivated mid-session | **403 `account_disabled`** on the next call |
| Self-deactivation | refused — would be an unrecoverable lockout |
| Last administrator deactivated | refused — at least one active admin must remain |

## 6. Edge and origin

| Control | Status |
|---|---|
| Cloudflare Access on the hostname | **PASS** — `https://zameenpkreports.com/legalos/` → 302 from Cloudflare |
| Application authentication at the origin | **PASS** — every `/api/*` route → 401 without a verified identity |
| Header spoofing | **PASS** — plaintext email header, forged JWT and `alg:none` all → 401 |
| Network restriction of the origin | **REQUIRES PRIVILEGED DEPLOYMENT** — the box answers on its public IP with a spoofed `Host`. The static shell and the login endpoint are internet-facing; no legal record is. Closing it edits a shared nginx file and needs root: `deploy/harden-origin.md` |

## 7. View-As remains non-authoritative

View-As is an administrative preview rendered entirely in the browser. It does not mint a
credential, does not alter the session cookie, and is never sent to the server — every API
answer is scoped to the **signed-in** principal. The preview renders the *viewed* person's
effective permissions (fetched from the engine), never the viewer's; regression-tested in
`tests/m1-resilience.js` and `tests/m1-rbac-matrix.js`.

## 8. What remains manual

Completing an interactive Cloudflare Access SSO login requires a human browser session.
Everything on the application side of that boundary is tested above with a test key. The
one remaining human check is `deploy/CLOUDFLARE_SSO_SMOKE_TEST.md` — eight steps.
