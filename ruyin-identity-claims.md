---
name: ruyin-identity-claims
description: "ruyin RP token claim model (sub+tenant only by default), how email/phone/name flow, the server .env OIDC_SCOPES pin gotcha, and v2.1 contract compliance (3 deviations waived)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5e6192-40d9-43ce-a083-c5873fac15ed
---

**v2.1 contract compliance (2026-06-19, ruled by upstream IdP team):** ruyin RP
is FULLY COMPLIANT with the Ruyin-Vxture OIDC integration contract v2.1. The 4
required changes are all shipped this session: (1) scope adds email/phone,
(2) exact claim-name mapping, (3) read active_org/workspace/roles drop legacy,
(4) no entitlement hard-gating. Three audited deviations were formally WAIVED --
do NOT re-flag them in future audits:
- **Cookie (D-BI):** Domain-scoped opaque cookie `vx_rp_session`
  (Domain=.ruyin.ai, NO __Host- prefix) is APPROVED for multi-subdomain RP; must
  stay Secure + HttpOnly + SameSite=Lax. Strict __Host- is NOT required.
- **logout:** SUPERSEDED 2026-06-19 (main 846a1fb, PR #99) -- logout is now
  GLOBAL SSO logout, not local-only. /auth/logout (logout/route.ts) destroys the
  local RP session + clears the cookie, then top-level redirects to the IdP
  end_session, which kills the central vx_sid (logs out vxture + every sibling
  app), revokes the session tokens, and fan-outs back-channel logout to all
  session clients, then redirects to post_logout https://ruyin.ai/. No
  id_token_hint needed (IdP keys off its vx_sid cookie). Dev fallback: local-only
  to apex home when no post_logout configured. ruyin/vxture are ONE first-party
  suite (gmail.com/google.com analogy), so global is the correct default. Upstream
  already supports it fully: ruyin client has post_logout + back_channel
  registered (vxture seed-catalog.mjs), IdP end_session validates+fans-out.
- **OIDC_RP_ENABLED (D-BJ):** deliberately ABSENT; bridge retired, presence of
  OIDC_ISSUER+OIDC_CLIENT_SECRET is the equivalent gate.

What the `ruyin` OIDC client actually receives, and how human identifiers get
wired. Corrects an earlier wrong belief that email/phone were already populated.

**Real token (verified by decoding a live `rptok` access_token on worker-03,
read-only):** with scope `openid profile ruyin`, the token carried ONLY
`sub` + tenant context (`active_org`/`active_workspace`/`roles`/`userType`) +
`sid`. NO `email`, `phone`, `name`, `preferred_username`, `picture`,
`account_status`. So the account panel showed only account id + tenant context.

**Why / fix (2026-06-19, PR #93+#94, main 13180d2):** upstream commit
`f4984481` lets the `ruyin` client release email/phone. Two-sided:
- `name`/`preferred_username`/`account_status` ride the `profile` scope (already
  requested) -> appear once vxture deploys, no scope change needed.
- `email`/`phone` need the `email`+`phone` scopes. Changed `OIDC_SCOPES` to
  `openid profile email phone ruyin` in config.ts/.env.example/docker-compose.yml.
- Mapping (exact access_token claim names): `claims.ts`+`IdentityClaims` carry
  `display_name`(name)/`username`(preferred_username); `account.py`
  `public_vxture_user` surfaces username/displayName (was hardcoded empty).
- Dropped the retired `active_tenant*` fallback (standard section 8 expired);
  read only live names org/workspace/roles. See [[ruyin-oidc-rp]].
- `email_verified` currently always false (platform doesn't assert it);
  `phone_verified` always true.

**DEPLOY GOTCHA (cost a debugging round):** the worker-03 runtime `.env` at
`/srv/vxture/repo/umbra/.env` explicitly pins `OIDC_SCOPES=...`, which OVERRIDES
the `${OIDC_SCOPES:-default}` in docker-compose.yml. A green release deploy does
NOT change it (`.env` is operator-managed, git-ignored). To apply a scope/env
change you MUST edit that `.env` line AND RECREATE the container (restart alone
reuses old env): `cd /srv/vxture/repo/umbra && docker compose -f
docker-compose.yml -f /srv/vxture/data/umbra/docker-compose.digests.yml up -d
--no-deps umbra-account-web`. Only umbra-account-web (the BFF) uses the scope;
account.py just reads rpsess. Same `-f` digest-override the deploy uses, so the
pinned image is unchanged. See [[ruyin-oidc-promotion-pending]] for other
.env-is-bash-sourced caveats.

**Part 2 (avatar/picture) FULLY SHIPPED** (PR #95 wiring main efd81f4 + PR #96
silhouette default main d68d2d3, 2026-06-19): `picture` claim -> claims.ts/
IdentityClaims `avatar_url` -> rpsess -> account.py DTO `avatarUrl`; console
/auth/session also returns displayName/username/avatarUrl. No scope change
(picture rides profile). Rendered via DS Avatar = @radix-ui/react-avatar (plain
`<img>`, NOT next/image) so the cross-domain accounts.vxture.com URL loads
directly in the browser, never proxied by ruyin (contract section 4) --
headless-verified zero /_next/image.

CORRECTION: upstream picture wiring IS in vxture prod (develop=beta=main
d8ce9ddf): `oidc.service.ts` emits `picture` only when `user.avatarHash` is set
(custom upload OR third-party import on account creation); accounts without a
custom/imported avatar get NO picture, and the platform `/avatar` endpoint 404s
(it does NOT serve a default). So "no picture" is the COMMON case, not "feature
not deployed". Per vxture docs/design/identity-avatar.md v0.2, the default is an
app-side INLINE silhouette SVG (currentColor), NOT initials -- an external
`<img src>` SVG cannot inherit currentColor. ruyin now ships its own
`DefaultAvatar` (inline silhouette) in website + console, replacing the initials
fallback in 3 surfaces (website account menu, console user-dropdown + personal-
info). Local read-only vxture clone at D:/MyWebSite/vxture (remote
git@github.com:vxture/vxture.git). Stray local `brand/avatar-default-*.png` are
NOT the approach (removed in #94); the canonical silhouette is vxture
portals/console/public/assets/icon/avatar-default.svg (batch G: into DS, pending).
