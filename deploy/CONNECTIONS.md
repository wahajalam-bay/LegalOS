# Connecting LegalOS to Google Drive and email

LegalOS was a static prototype: every piece of state lived in the browser's
`localStorage` and the server only handed out files. Connecting it to Drive and
to a mailbox needed a server-side layer, because a Google key or a mailbox
password can never be shipped to a browser. That layer is `api/`, and this is
how it is commissioned.

Nothing below is live until the three values in **Step 1–3** are filled in and
the service is restarted (**Step 5**). Until then LegalOS behaves exactly as it
did before, and the knowledge page shows an honest "Not connected yet" panel.

---

## What was built

| Piece | File | What it does |
|---|---|---|
| Config + secrets | `api/config.js` | Reads `config/legalos.config.json`. Re-reads on change — no restart to rotate a credential. |
| Real identity | `api/access.js` | Verifies the **Cloudflare Access** signed assertion. |
| Google auth | `api/google.js` | Service-account JWT → access token. No npm dependencies. |
| Knowledge base | `api/drive.js` | Read-only mirror of one Drive folder tree + search. |
| Email | `api/mail.js` | SMTP client for `legal.os@zameen.com`. No npm dependencies. |
| Roster mapping | `api/identity.js` | Verified email → the person in `src/data.js` → their role. |
| Routes | `api/router.js` | The `/api/*` surface, authenticated on every route but `/api/health`. |

### Why identity is taken from a signature, not a header

nginx forwards `Cf-Access-Authenticated-User-Email` straight from the incoming
request. Anything that reaches the origin directly can therefore set that header
and be believed — it is attacker-controlled and is never used here.

`Cf-Access-Jwt-Assertion` is signed by Cloudflare. `api/access.js` fetches
Cloudflare's public keys and checks the signature, the audience, the issuer and
the expiry. That is the only identity this API trusts.

---

## Step 1 — Share the Drive folders  ✅ DONE

The knowledge base is **read-only by construction**: the service account holds
`drive.readonly`, so no bug in LegalOS can alter or delete a legal document.
Drive stays the system of record.

**Sharing a folder IS the act of adding it.** There is no folder id to paste.
On every refresh LegalOS asks Drive which folders are shared with its service
account and indexes all of them, so the legal team can add a fifth folder
tomorrow without anyone touching this server.

To add a folder: share it — **Viewer** — with
`zameen-bse-dashboard-prod@zameen-bse-dashboard-prod.iam.gserviceaccount.com`.

Connected as of 2026-09-13 (all owned by `legal.os@zameen.com`):

| Folder | Documents | Size |
|---|---|---|
| Commercial_Zameen Media Contracts | 995 | 5.0 GB |
| Compliance Data _LegalOS | 1,772 | 2.2 GB |
| Litigation & Dispute - LegalOS | 401 | 1.5 GB |
| Commercial_ZD Projects Master Data and Tracker | 308 | 2.0 GB |
| **Total** | **3,476** | **11 GB** in 856 folders |

To pin an explicit set instead of discovering them, put ids in
`drive.knowledgeFolderIds` — that overrides discovery.

> **A 404 from Drive means "not shared yet"**, not "wrong id" — auth succeeds and
> the folder is simply invisible to the service account.

### How the index behaves

A full crawl is ~50 seconds, so **no request ever waits for one**. The index is
cached to `config/.drive-index.json`, warmed a few seconds after boot, and
refreshed on a timer; requests are served from the warm copy and a stale index
refreshes in the background. Only a genuinely cold start (no cache at all) waits,
because there is nothing else to show.

Search uses Drive's own full-text index, which already covers the text **inside**
PDFs and Docs — a query for "indemnity" finds it in the body of a construction
contract whose filename never mentions it. That is why there is no PDF parser in
this codebase.

## Step 2 — Point at the Cloudflare Access application  ✅ DONE

`access.aud` is set to `b355cceb…85b3a0`, recovered from the `kid` parameter of
the Access login redirect and cross-checked against the `aud` claim in that
redirect's own meta token.

**Worth confirming:** that AUD belongs to the application covering
`zameenpkreports.com`. If it is a domain-wide Access app rather than one scoped
to `/legalos`, any valid token for this domain satisfies the audience check. A
dedicated Access application for `/legalos` would be tighter, given what now sits
behind it.

Without it, a token minted for *any other* Access application on the same team
would be accepted. `enforce` must stay `true`.

## Step 3 — The mailbox credential

`legal.os@zameen.com` needs an **App Password** (Google account → Security →
2-Step Verification → App passwords). A normal account password will not work
for SMTP. Put it in `mail.pass`.

Ports 587 and 465 are both open from this host and the client was verified
against Gmail on both (TLS session established, stopping before AUTH); 587
(STARTTLS) is the default.

If your Workspace admin has disabled App Passwords — common, and it presents as
the option simply not existing — the alternative is **domain-wide delegation**:
a super-admin authorises the existing service account for the Gmail send scope,
and it then sends *as* `legal.os@zameen.com` with no password at all. That is
also what would later unlock reading the inbox.

`mail.enabled` is `false` on purpose. While it is false the whole send path runs
and records the message but stops before the wire, so a misconfiguration cannot
reach a real inbox. Set it to `true` when you want mail to actually leave.

## Step 4 — Check it without sending anything

```bash
curl -s localhost:4600/api/health | python3 -m json.tool     # what is configured
```

Then, signed in through the browser:

- `GET  /legalos/api/me`                — who Cloudflare says you are
- `GET  /legalos/api/knowledge/tree`    — the folder overview
- `POST /legalos/api/mail/verify`       — proves the mailbox credential, sends nothing

## Step 5 — Restart the service (needs an administrator)

```bash
sudo systemctl restart legalos
```

There is no NOPASSWD grant for `legalos`, so this currently requires an admin.
A polkit `manage-units` rule for the `ubuntu` group would remove the need for
sudo here permanently — that is the pattern used elsewhere on this box.

---

## What is deliberately NOT built

- **No write access to Drive.** Read-only was chosen so LegalOS can never damage
  a legal record. Filing documents *into* Drive needs a broader scope and a
  rethink of folder permissions.
- **No inbound email.** Mail is send-only. Turning an email to
  `legal.os@zameen.com` into a legal request needs the Gmail API via
  domain-wide delegation (a Workspace super-admin must authorise it) or a
  one-time OAuth sign-in as that account.
- **`mail/send` is Director-only** while the path is being commissioned, so a
  half-configured mailbox cannot be used to mail the company.

## The security note that still stands

The app's own sign-in remains a **demo persona picker** — it enforces nothing.
What changed is that the *API* no longer believes it: every `/api` answer is
scoped to the identity Cloudflare verified, regardless of which persona the
browser is displaying. A business requester who signs in through Access cannot
read the legal document library even if the UI lets them pick "Director Legal".

Replacing the persona picker with the verified identity in the UI is the natural
next step, and `serverPrincipal()` in `src/api.js` already exposes it.
