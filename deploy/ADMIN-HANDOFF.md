# Three root actions, in this order

Everything in LegalOS is built and verified. These three steps need an
administrator; nothing else does. Run them in order — step 2 depends on step 1
having been thought about, and step 3 makes the day-to-day case need no admin
at all.

## 1. Lock the folder to its two owners

```bash
sudo bash /var/www/zameen_bse_reports/LegalOS/legalos/deploy/restrict-access.sh
```

**Why now:** the tree is `wahaj_alam:ubuntu 0775` and the `ubuntu` group has 13
members. All thirteen can read *and write* the Google service-account key, the
`legal.os` mailbox password, and the cached registers — 2,896 legal records
including live litigation cases.

**What it does:** creates a `legalos` group (m_ashhad + wahaj_alam), re-owns the
tree to `wahaj_alam:legalos`, sets directories `2770` / files `0660` and removes
all access for `others`.

**The part that is easy to get wrong:** the service currently runs as
`User=ubuntu`. Tightening the files without moving the service off `ubuntu`
takes LegalOS down — it can no longer read its own source or write its Drive
cache. The script changes the unit to `wahaj_alam:legalos` in the same pass,
backs the unit up first, and verifies afterwards that the service is up, that a
non-owner is locked out, and that both owners can still read the config. It
exits non-zero and tells you how to roll back if any of that fails.

> Group membership only applies to NEW logins. Both owners should log out and
> back in (or `newgrp legalos`) before their shell sees it.

## 2. Start the new code

```bash
sudo systemctl restart legalos
```

The running service is still the old static-only build. Nothing built in this
round — the Drive library, the registers, the modules, the Knowledge Base screen
— is live until this runs. (Step 1's script already restarts it, so if you have
just run that, this is done.)

## 3. Remove the need for an admin next time

```bash
sudo install -o root -g root -m 0644 \
  /var/www/zameen_bse_reports/LegalOS/legalos/deploy/49-m_ashhad-dashboards.rules \
  /etc/polkit-1/rules.d/49-m_ashhad-dashboards.rules
sudo systemctl restart polkit
journalctl -u polkit -n 5 --no-pager     # expect "Finished loading ... N rules", no parse error
```

Then verify as the harder case — no login session, the way a deploy script runs:

```bash
sudo -u m_ashhad -H systemctl restart legalos
```

After this, `systemctl restart legalos` works for m_ashhad and wahaj_alam with
**no sudo and no password**, and step 2 never needs an administrator again.

The rule grants `manage-units` only, against an explicit unit list and verb
list, and returns `YES` rather than `AUTH_ADMIN`. Each of those is deliberate:

- **Never `manage-unit-files`** — that is enable/disable/mask, and
  `systemctl enable /abs/path.service` links an arbitrary unit into the tree.
- **`YES`, not `AUTH_SELF`/`AUTH_ADMIN`** — an SSH session is not an "active"
  polkit seat, so anything asking for interactive auth dies with "Interactive
  authentication required" inside a non-tty script.
- **nginx gets `reload` only**, never stop or restart — a reload with a bad
  config is rejected and the running config keeps serving; a restart would take
  every dashboard on this box down.

## What still cannot be delegated

Installing a *new* unit file and editing the shared nginx site file are
inherently root. The first deploy of a new dashboard will always need an
administrator. Day-to-day restarts of LegalOS will not.
