# LegalOS — security audit

Generated from `tests/m1-security.js` (56 checks), `tests/m1-identity.js` (25),
`tests/m1-concurrency.js` (26) and live probes against the deployed edge and origin.
**No token, key, credential or secret value appears in this document or in any test
artifact.**

Every row asserts what the **server** does. A hidden navigation row proves nothing; the API
returning 403/404 is the control.

Severity: **P0** unauthorised legal data access, document leakage, privilege escalation,
auth bypass, data loss · **P1** important access-control weakness · **P2** hardening ·
**P3** defence-in-depth.

---

## Findings

### SEC-001 — Any legal user could download any document · **P0 · FIXED**

| | |
|---|---|
| Area | Object-level authorization / document security |
| Scenario | Sign in as Sana Hurmat (`compliance: edit`, `litigation: none`). `GET /api/registers/litigation` → **403**. Then `GET /api/knowledge/file/<litigation case pdf id>` |
| User | Compliance-only |
| Expected | Refused — she may not read the litigation register, so she may not read its documents |
| **Actual** | **HTTP 200 and 4,515,058 bytes of a litigation contempt application.** `/api/knowledge/search?q=vs` returned **60 cross-team hits**, and `/api/knowledge/tree` exposed every root |
| Root cause | The knowledge routes were gated on `me.canReadKnowledge` — "are you in the legal department" — and never consulted the caller's module permissions. The register gating added earlier was therefore theatre: the rows were hidden, the documents were not |
| Fix | Document scope resolved deterministically: the families whose records link the file, else the Drive root it is filed under (the legal team files by practice area), else shared material. `mayReadFile()` gates the file stream, folder listings, search, the folder tree and content matching. An unauthorised document returns **404**, identical to a missing one, so existence is not disclosed |
| Regression | `tests/m1-security.js` §2–3 |
| **Result** | compliance-only → litigation doc **404**, contract doc **404**, search **0 hits**, tree shows only her own root. Litigation-only → own doc **200**, contract doc **404**. Admin → both **200** |

### SEC-002 — Document search leaked the existence of restricted matters · **P1 · FIXED**

Covered by the same fix. Search now filters to readable documents before truncating to the
caller's limit, so a restricted user cannot infer a matter from a title.

### SEC-003 — `.docx` and `.xlsx` content rendered as raw HTML · **P1 · FIXED**

| | |
|---|---|
| Area | XSS |
| Scenario | A contract or counterparty document is previewed in-app. `mammoth` converts the `.docx` to HTML and SheetJS renders a sheet to a table; both were inserted with `dangerouslySetInnerHTML` |
| Expected | Document content is data, never executable |
| Actual | A crafted document could run script in the application's own origin, with the viewer's session |
| Fix | `sanitizeDocHtml()` parses the markup with `DOMParser`, keeps an allowlist of formatting tags/attributes, drops every `on*` handler, removes non-`data:` images, forces `rel="noopener noreferrer nofollow"` on links and rejects non-http(s) hrefs. Parsing rather than regex-stripping means obfuscated markup is normalised before inspection |
| Regression | CSP additionally blocks inline execution paths; verified no CSP violation in normal use |
| **Result** | **FIXED** |

### SEC-004 — CSV export was open to formula injection · **P2 · FIXED**

| | |
|---|---|
| Area | Export security |
| Scenario | A tracker cell beginning `=`, `+`, `-`, `@`, tab or CR is exported and opened in Excel/Sheets |
| Actual | Executed as a formula. Contract titles and counterparty names come from hand-maintained Drive trackers, so this is reachable without any compromise |
| Fix | Values starting with a formula character are prefixed with a single quote in the CSV only; the record itself is untouched |
| **Result** | **FIXED** |

### SEC-005 — No security headers beyond `X-Content-Type-Options` · **P2 · FIXED**

| | |
|---|---|
| Area | Headers / clickjacking |
| Actual | No CSP, no `Referrer-Policy`, no frame protection, no `Permissions-Policy` |
| Fix | Served on every document: a CSP scoped to what the app actually loads (`esm.sh` for modules, Google Fonts for typography, Drive for document frames), `frame-ancestors 'none'` plus `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling geolocation/mic/camera/payment/USB, `base-uri` and `form-action` pinned to self |
| Verification | **Tested in a browser, not just asserted**: all 8 sampled routes render, the `esm.sh` dynamic import used by the document viewer still loads, **0 CSP violations, 0 console errors** |
| Note | HSTS is deliberately not set at the origin — TLS terminates at Cloudflare and this origin also answers plain HTTP on loopback for health checks |
| **Result** | **FIXED** |

### SEC-006 — Unsafe object spread on request intake · **P2 · FIXED**

| | |
|---|---|
| Area | Mass assignment |
| Actual | `requests.create` spread the client body wholesale; identity fields were overwritten afterwards, but a client could still inject internal `__`-prefixed keys and server-owned fields |
| Fix | Client fields are filtered before the spread: `__`-prefixed keys and the server-owned set (`requestedBy*`, `receivedAt`, `source`, `updatedBy/At`, `history`) are stripped |
| Verification | A forged `requestedByEmail: maryam.haq@…` submitted by Salman Khan is stored as **salman.khan@…**; a forged `receivedAt` of 1999 is ignored; `__quality` is stripped |
| **Result** | **FIXED** |

---

## Test matrix

| Area | Scenario | User | Expected | Actual | Status |
|---|---|---|---|---|---|
| Authentication | Anonymous hits 5 sensitive APIs | — | 401 | 401 | PASS |
| Authentication | Plaintext CF email header only | forged | 401 | 401 | PASS |
| Authentication | Forged / `alg:none` / HS256 / wrong aud / wrong iss / expired / unknown kid JWT | forged | rejected | rejected (9/9) | PASS |
| Default deny | Unknown authenticated identity | new address | not provisioned | 403 `not_provisioned` on every route but requester intake | PASS |
| Default deny | Deactivated account | u10 | refused | 403 `account_disabled` | PASS |
| Default deny | Two rows claiming one login | conflict | refuse, never guess | 403 `identity_conflict` | PASS |
| Module authorization | 7 registers × 2 restricted roles | compliance / litigation | own families only | 14/14 correct | PASS |
| Object authorization | Download another team's document by id | compliance / litigation | refused | 404 (indistinguishable from missing) | PASS |
| Search security | `q=vs` across teams | compliance | only permitted material | 0 hits (admin: 60) | PASS |
| Folder tree | Root listing | compliance | only permitted roots | 1 of 4 | PASS |
| Requester isolation | Requester reads the queue | requester | own requests only | own only | PASS |
| Admin security | user list / audit / Data Health | non-admin | 403 | 403 | PASS |
| Privilege escalation | Grant self admin / superAdmin role / deactivate Director | member | refused, state unchanged | 403 ×3, unchanged | PASS |
| Lockout | Deactivate self / last admin | admin | refused | 400 with reason | PASS |
| Revocation | Module removed mid-session | active user | next call refused | 403 | PASS |
| Mass assignment | Forge identity, arrival time, internals | member | ignored | overwritten/stripped | PASS |
| HTTP methods | GET on a mutation route | admin | not accepted | 404/405 | PASS |
| Headers | CSP, XFO, Referrer, Permissions, nosniff | — | present | present, app unbroken | PASS |
| CORS | Wildcard with credentials | — | none | none (same-origin) | PASS |
| Cookies | Session flags | — | HttpOnly, SameSite, path-scoped | all present | PASS |
| Cookies | Failed login | — | no session issued | none | PASS |
| Caching | API responses | — | `no-store` | `no-store` | PASS |
| Secrets | Repository scan | — | none committed | none; credential files gitignored | PASS |
| Frontend secrets | Bundled assets | — | no server secret | none (Drive credentials never leave the server) | PASS |
| Path traversal | User input reaching `fs` | — | none | no user-controlled path | PASS (N/A) |
| SSRF | User-supplied URL fetched server-side | — | none | the app fetches only Google APIs from fixed paths | PASS (N/A) |
| SQL injection | — | — | — | **N/A** — no database; the dataset is an in-memory normalized cache from Drive | N/A |

## Not applicable, and why

- **SQL injection** — there is no database. Records come from Drive spreadsheets into an
  in-memory structure; queries are JavaScript array filters over that structure.
- **SSRF** — no endpoint accepts a user-supplied URL for the server to fetch. Drive calls
  use fixed API paths with an id from the server's own index.
- **File upload** — the application does not accept uploads; Drive is read-only
  (`drive.readonly`) and is the system of record.
- **Open redirect** — navigation is hash-based within one origin; no endpoint takes a
  return URL.

## Residual

| Item | Level | Detail |
|---|---|---|
| Origin reachable without Cloudflare | Moderate, contained | Application auth is independent and holds (401 on every API). Closing the network path needs root: `deploy/harden-origin.md` |
| Dependency audit | Low | The app ships no bundler and pins its browser modules to `esm.sh` at explicit versions; the server has a minimal dependency set. A formal `npm audit` gate is not wired into CI |
| Formal WCAG certification | — | Not claimed. A practical accessibility pass was done; see `UI_UX_AUDIT.md` |

---

# Document & knowledge authorization — the stated rules

The knowledge bypass (SEC-001) was fixed in the previous pass. This pass wrote
down the rules it implies, found one endpoint that did not follow them, and
proved the rest across the entire corpus rather than on samples.

Exercised by `tests/m1-document-auth.js`, which asks **every persona for every
one of the 3,476 indexed files** and compares each answer against an expectation
derived independently from the register data and the Drive roots.

## The corpus

| Drive root | Files | Module group |
|---|---:|---|
| Compliance Data _LegalOS | 1,772 | compliance |
| Commercial_Zameen Media Contracts | 995 | commercial |
| Litigation & Dispute - LegalOS | 401 | litigation |
| Commercial_ZD Projects Master Data and Tracker | 308 | commercial |

2,575 files are cited by at least one register record; **132 are cited by
records in more than one module**, which is precisely the case §25 asks to be
decided explicitly rather than by accident.

## Rule 1 — a record's documents follow the record

A document cited by a record you may read is part of that record's file. If a
document is cited by records in several modules, **any** of those modules grants
it.

*Why this and not the stricter alternative.* A contract's Documents tab must be
able to open the contract's own attachments. Denying a commercially-authorised
user a document because a litigation matter also cites it would mean a record
listing attachments it cannot open — which is how people conclude the system is
broken and start emailing files instead. The rule is deliberate, stated here, and
asserted for all 132 multi-module documents rather than assumed.

## Rule 2 — everything else follows its Drive root

A document no record cites — a project file, a module document, a reference, a
template — is scoped to the module whose Drive root it is filed under. This is
what keeps PROJECT_DOCUMENT and REFERENCE material from becoming global.

## Rule 3 — an unrecognised root is denied

**Changed in this pass.** The fallback previously granted any caller with
`shared` access. Every root in this workspace maps to a module, so that branch
was unreachable — but an unreachable branch that fails *open* is a trap for the
next Drive root somebody adds. It now denies. Administrators are unaffected;
they are allowed earlier.

## SEC-007 (P2, fixed) — the template library listed what it would not open

`GET /api/knowledge/templates` was the one knowledge route that returned
metadata without asking. A Compliance-only account received every template's
name, id, folder path and size — **406** listed entries out of the 413 files
under that tree, the difference being Word's own lock files, which the endpoint
already filtered — and then got `404` on every attempt to open one.

A filename is information. §27 asks that TEMPLATE and REFERENCE material have an
*explicit* scope rather than defaulting to every legal user, and this endpoint
had no scope at all. It now filters through the same predicate as every other
knowledge route. All 413 templates sit under the Commercial root, so commercial
access is what lists them — a permissions decision, changed by moving the tree or
granting the group, not by leaving the endpoint open.

Measured after the fix: admin **406**, commercial **406**, compliance **0**,
litigation **0**, and 0 listed entries that the caller could not open.

## Every knowledge surface, and how it is filtered

| Endpoint | Filter | Leak tested |
|---|---|---|
| `knowledge/file/:id` | `mayReadFile` per document; 404 when denied | every file × every persona |
| `knowledge/search` | each hit filtered before the response | 10 broad terms per persona |
| `knowledge/tree` | roots dropped entirely; folders kept only under surviving roots | root and folder names |
| `knowledge/files` | each file filtered | another module's folder named directly |
| `knowledge/matches` | ids filtered **before** the content match runs | 30 unauthorized ids per persona |
| `knowledge/templates` | each file filtered (**SEC-007**) | listed ids vs openable ids |
| `registers/:family` | module group per family | all 7 families × 3 personas |

There is no vector or semantic search in this system, so there is no unfiltered
embedding path to close.

## 403 versus 404 — the convention

| Situation | Response | Why |
|---|---|---|
| Module endpoint the caller lacks (`/api/registers/litigation`) | **403** | the module's existence is not secret; the org chart is public inside the company |
| An individual document the caller lacks | **404** | byte-identical to a missing file, so existence is not disclosed |
| No session at all | **401** | authenticate first |

The suite asserts a forbidden document and a non-existent one return the same
status, the same body, and are not separable by an obvious timing difference.

## Cache safety

Register responses are cached by query **and** build timestamp, and the
permission check runs before the cache is consulted. The suite warms every cache
as the administrator, then repeats each request as a restricted user, and
asserts the restricted answer is neither the admin's nor contains anything
outside that user's scope.

## UI copy for a refusal

A denied user sees "You do not have access to this area." — not the family name,
the user id, or the rule that refused them. Those belong in the server response
detail and the admin audit log.
