---
name: admin-console-separation
description: Intended business separation of the admin vs console portals (no overlap except shared data layer)
metadata: 
  node_type: memory
  type: project
  originSessionId: 38750d62-0a46-45ff-8a3e-8cc276881788
---

Stated by the user 2026-06-12 (NOT yet implemented). admin and console are two
independently-authorized surfaces, like Vxture's; they share NO UI/content,
only the underlying data layer (account API backend, Marzban, subscriptions).

**admin.ruyin.ai - management surface, its OWN login** (built-in account/password
OR vxture.com admin authorization - method TBD; note: code already has a
Marzban-admin login path in account.py + invite-console.tsx). Three blocks:
1. vpn-invites: show ALL subscription links, generate/issue invite codes, view
   bound accounts + other obtainable info (~= today's InviteConsole, but rendered
   INSIDE the admin app).
2. Link out to Marzban admin (jump only).
3. Link out to Vault admin (jump only).

**console.ruyin.ai - tenant self-service, after SSO login.** Two blocks:
1. Personal info: reverse-looked-up from Vxture (basic profile).
2. Network access (UI must NOT show the word "VPN"): bind an invite code first,
   then a detail page - subscription link, reset subscription link, usage/quota/
   online status for that single subscription account (~= today's vpn-app.tsx).

**The bug being fixed:** invite management (InviteConsole) currently lives in the
CONSOLE app (umbra-account-web) and is cross-proxied onto admin.ruyin.ai/invites
(07-admin.conf), while console.ruyin.ai/invites 302s to admin (05-console.conf).
This conflation is why giving the admin app the root caused a two-Next-app
`/_next/` asset collision. Correct fix: move invite management INTO the admin app
so admin.ruyin.ai serves only the admin Next app (+ Marzban at /dashboard/), and
console stops rendering invites. Then no assetPrefix/basePath hack is needed.

Scope: admin app, console app, account backend (account.py), and nginx vhosts
05-console + 07-admin. Multi-PR.

DECISIONS (2026-06-12): admin auth = built-in dedicated credential
(ACCOUNT_ADMIN_USERNAME / ACCOUNT_ADMIN_PASSWORD env, hmac.compare_digest, no
hashing - independent of Marzban; account.py fetches the Marzban service token
per-request via marzban_admin_token). console "personal info" = render existing
SSO session fields (id/email/username/displayName/avatar/role/tenantId), no new
Vxture call for now.

PHASE 1 DONE - merged to develop as PR #62 (commit f5f9bb0, 2026-06-13): admin app
owns admin.ruyin.ai root behind built-in login + renders the invite block (ported
from console InviteConsole into AdminShell); console drops InviteConsole + /invites;
nginx 07-admin = admin app at `= /` + `/_next/`, account API at /api/account/,
Marzban via catch-all (jump to /dashboard/); 05-console drops /invites redirect.
The `/_next/` two-Next-app collision is gone (only umbra-admin is a Next app on
admin now). Deploy prereq: ACCOUNT_ADMIN_USERNAME/PASSWORD must be in worker-03
.env or 11-check aborts the deploy (>=12 char password). PROMOTED + DEPLOYED to
production 2026-06-13 (release run 27429192693, after fixing the .env below).
Live-verified: admin.ruyin.ai/ = 200 "Ruyin Admin" app; /api/account/admin/invites
= 401; /dashboard/ = Marzban 200; console.ruyin.ai/invites = 404 (no cross-redirect).

GOTCHA (cost 3 failed deploys): worker-03's `.env` is consumed BOTH by shell
`source` (deploy/worker-03/lib/01-env.sh sources `$PROJECT_ROOT/.env` AND
`$WORKER_DEPLOY_DIR/.env` = deploy/worker-03/.env - TWO files) AND by
`docker compose --env-file`. Secret values with shell metacharacters break the
`source` under `set -u`: `*` -> "command not found", `$2` -> "unbound variable".
Quoting is unreliable across the two parsers. Rule: worker .env secret values must
be alphanumeric/hex only (no `* $ \` " ' ; ( ) space`), unquoted, one line
(`openssl rand -hex 16`). This is why the other secrets use base64/hex.

PHASE 2 DONE - merged + deployed to production 2026-06-13 (PR #63, commit bb5a2d6,
release run 27441527764, clean deploy). Console is now tenant self-service:
- Home (`/`) = network-access block (bind one-time invite, then subscription URL +
  copy + "View details"); NO "VPN" wording anywhere in the UI.
- Personal info and subscription detail are their OWN PAGES (not dialogs):
  `/account` (from header user menu) and `/apps/vpn` (from home "View details").
  Shared `AccountGate` loads the session once per page.
- Richer subscription detail: account.py `account_payload` now extracts extra
  fields from Marzban `/sub/{token}/info` (usagePercent, resetText/
  data_limit_reset_strategy, lastClient/sub_last_user_agent, subUpdatedText,
  createdText, lifetimeUsedText) - no new upstream call. `public_vxture_user` adds
  the `phone` claim (phone_number/phone) - OPEN: confirm Vxture's JWT actually
  carries phone, else it shows empty and needs a real Vxture profile reverse-lookup.
- UI conventions established: white page bg = `var(--vx-color-page)` (the brand
  `--vx-color-background` is a tinted wash); `.app-shell` aligns to the header/
  footer inset (max-width = track + 2*margin-x, padding = margin-x + 2xl);
  `SectionHeading` (console-local, in shell.tsx) = left 24px brand-primary Icon +
  bold brand-primary `<h2>` + muted desc + inline `badge` slot, because the DS
  PageHeader title sizing needs shell-scoped tokens this chrome lacks; `.card-stack`
  exists because the DS SectionCard does NOT gap its own children (controls would
  touch the content above). Local console review uses a TEMP mock at
  `portals/console/app/api/account/[...path]/route.ts` (delete before commit).
Related: [[admin-console-separation]] supersedes the earlier plan to wire admin
into nginx as a sub-route - [[console-ds-frame-coupling]].
