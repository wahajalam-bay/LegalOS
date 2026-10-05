# Cloudflare SSO smoke test (human, ~5 minutes)

Everything on the application side of the Access boundary is covered by
`tests/m1-identity.js` (signature, audience, issuer, expiry, `alg:none`, unknown key,
unknown user, disabled user, roster mapping). This is the last 1%: a real browser
completing a real Access login. Run it after any change to the Access policy, the team
domain, or the AUD tag.

Do not paste tokens, cookies or passwords into any ticket or log.

| # | Step | Expected |
|---|---|---|
| 1 | Open `https://zameenpkreports.com/legalos/` in a **private** window | Cloudflare Access login appears (not the app) |
| 2 | Sign in as a **restricted** test user (e.g. a Compliance-only account) | The app loads |
| 3 | Check the user menu, bottom-left | Shows that person's real name and role |
| 4 | Open `…/legalos/api/me` in the same tab | `principal.email` is them; `provisioned: true`; `id` is their roster id |
| 5 | Confirm the sidebar | Only their team's modules. No Administration |
| 6 | Type an unauthorised address, e.g. `…/legalos/#/litigation` (for a Compliance user) | "You do not have access to this page" |
| 7 | Open `…/legalos/api/registers/litigation?limit=1` directly | **403** (not data) |
| 8 | Sign out, then repeat 1–5 as a **super admin** (Maryam Haq / Imran Tariq / Salman Rashid) | Full navigation; `…/api/registers/health` returns JSON |

**Also worth one look:** a company address that is **not** on the LegalOS roster. Expected:
Access lets them through, then LegalOS answers **403 `not_provisioned`** on every API route
except the requester intake — they are not given Legal access by default.

If step 4 shows an email that differs from the roster spelling (e.g. `salman.khann` vs
`salman.khan`), that is the known SSO/roster mismatch: the app falls back to the verified
app-session account so a valid sign-in is never downgraded. Fix it by correcting the
address in `src/data.js` USERS, not by loosening the gate.
