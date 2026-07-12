---
name: b5-invite-product-decisions
description: "Invite/binding lifecycle + B5 services decisions: invites are PERSISTENT (not show-once), admin unbind rotates token + detaches, keep subproxy bearer + hysteria2 shared pw"
metadata:
  node_type: memory
  type: project
  originSessionId: 03a76e6a-6260-4afc-b2d0-8e515c19ebee
---

Invite / binding / subscription lifecycle, centred on the fixed Marzban user (USER01..N as the VPN identity; the subscription token rotates, the USER name never changes). Implemented + production-verified on USER02 2026-06-25 (PRs #166 + #167, account.py):

- **Invites are PERSISTENT and re-verifiable (NOT show-once).** This SUPERSEDES the earlier "show-once" decision. Binding keeps `code_plain` (admin can re-show the link) and only records `used_at`; only disabled/expired invalidates. `code_hash` (HMAC) stays valid for repeat verification.
- **Admin "unbind" = the single deauthorize action** (replaced admin "reset subscription"). All-or-nothing: `marzban_revoke_sub` (old `/sub/<token>` dies immediately, no grace) -> `binding=revoked` + `account.disabled=1` + the disabled row's `username` is renamed to `<name>#<id>` (frees the UNIQUE name for re-bind, keeps the audit row) + invite disabled. Restore = admin regenerates an invite + user re-binds (USER name reused).
- **Subscription reset is user-side only** (admin has none): rotates the token via `revoke_sub` for an active binding, all-or-nothing; the new URL is shown in the console (which already confirms + displays it).
- **`accounts.password_salt/password_hash` dropped** (retired local-IdP columns; OIDC is sole IdP) via DROP COLUMN migration.
- **subproxy `/sub/<token>`: keep the bearer-token model**; hardened transport/SSRF/header-allowlist around it (B5), not the authZ model.
- **hysteria2: keep the single shared password** for now; per-user auth is a future upgrade (see [[hysteria2-fallback]]).

Part of the review-driven batch plan ([[project-overview]]). Ops note: re-binding/rotation revokes the Marzban token, so the user must reconfigure their client with the new sub URL each time.
