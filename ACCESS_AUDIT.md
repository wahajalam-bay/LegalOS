# LegalOS — Access Control Audit (pre-implementation)

Audited 2026-09-16 before building the Users & Access framework.

## Existing identities (source of truth: `src/data.js` USERS, read server-side by `api/identity.js`)
Credentials live in `config/users.json` (scrypt only). An account's role/team come from the roster row matched by email, NOT from the credential file. The three users to grant full access resolve to stable IDs — **no emails fabricated**:
- **Maryam Haq** — `u1` — Director Legal — rbac `head` — legalTeam `null`.
- **Imran Tariq Mir** — `u3` — Head of Commercial Contracts — rbac `lead` — legalTeam `commercial`.
- **Salman Rashid** — `u6` — AD Legal / Head of Litigation & Disputes — rbac `lead` — legalTeam `litigation`.

## Existing access logic (before this change)
- **Roles** (`rbac`): head, lead, member, paralegal, requester (`RBAC_ROLES` in `src/org.js`).
- **Teams** (`legalTeam`): commercial | compliance | litigation | null.
- **Gate**: `canOpenPath(user, path)` in `src/rbac.js` — team-scoped as of v165 (commercial/compliance/litigation see only their own group; head sees all). `navForUser` hides any row the gate refuses. `canBrowseModule` gates `/m/<key>` by module `def.team`.
- **Landing** per role: head→/exec, lead→/team, member/paralegal→/me.

## Findings / gaps this framework fixes
1. **Access was code-derived, not configurable** — an admin could not change a person's access without editing `data.js`/`rbac.js`. FIX: a persisted, editable per-user config (`config/access.json`) + admin UI.
2. **No per-user override** — only role/team. FIX: per-user group levels overriding the role template.
3. **No audit trail** of access changes. FIX: append-only audit log in the config, surfaced in the UI.
4. **No admin surface** to view/set who-can-see-what. FIX: Administration → Users & Access.
5. **Default behaviour** was team-derived (safe). FIX: keep team-derived defaults for un-configured users, but explicit config is default-DENY for anything not granted; inactive users get nothing.

## Enforcement layers (single engine)
- Server computes each identity's **effective permissions** (`api/permissions.js` → `effectiveFor`) and returns them in `/api/auth/login` and `/api/auth/session`, so a change reflects on the next session revalidation without restart.
- Client `src/access.js` reads those effective perms; `canOpenPath`/`navForUser` consult them, so **nav is hidden AND direct URLs are refused** (NoAccess), and dashboards/registers only render the modules the user may open (a hidden module's KPIs never render).
- Writes to the config are **head/admin-only** (`/api/access/*`).

## Honest scope note
Granularity is at **module-group + access-level** (commercial/compliance/litigation/shared/insight/admin × none/view/edit/full) with per-user overrides, roles as templates, and an audit log — a genuine configurable engine, not name hardcoding. Full per-submodule action matrices and per-record "assigned-only" scope are represented in the UI but enforced at group level, because the underlying Drive registers are org-wide trackers with no per-user record ownership to scope on.
