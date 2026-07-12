---
name: ruyin-oidc-rp
description: ruyin migrated from custom cross-domain SSO to a real OIDC Authorization-Code + PKCE RP with a Redis session store
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5e6192-40d9-43ce-a083-c5873fac15ed
---

ruyin.ai is now an OIDC Authorization-Code + PKCE(S256) Relying Party against
`accounts.vxture.com` (issuer), per the Vxture App Integration Standard v1.0
(`identity-app-integration-standard.md`, vendored at repo root). This replaced
the old custom cross-domain handoff (the `ctx` JSON start param, one-time
`token` callback, `AUTH_BFF_URL` crossdomain/verify + internal/sign, and the
HS256 `ry_access_token`) — all removed. Supersedes the mechanism in
[[unified-frontdoor-auth]].

Architecture:
- The console portal (`umbra-account-web`) is the OIDC RP / app-bff. New deps:
  `jose` (RS256/JWKS verify) + `ioredis`. RP lib lives at
  `portals/console/app/auth/lib/` (config/pkce/oidc/claims/cookie/return-to/
  session-store); endpoints at `portals/console/app/auth/`: `/auth/login`,
  `/auth/callback`, `/auth/session`, `/auth/logout`, `/auth/backchannel-logout`.
- New `umbra-redis` (redis:7-alpine) is the server-side store. Keys: `authreq:<state>`
  (login handshake), `rpsess:<rpsid>` (identity claims ONLY — read by both the
  console BFF and account.py), `rptok:<rpsid>` (token bundle — BFF only),
  `sid:<sid>` (SET of rpsid for back-channel logout).
- Tokens NEVER reach the browser. The browser holds only an opaque
  `vx_rp_session` cookie (Domain=.ruyin.ai for shared login across *.ruyin.ai;
  deliberate, security-equivalent deviation from the standard's `__Host-` prefix).
- `services/account/account.py` no longer parses JWTs; `vxture_payload_from_session`
  reads `rpsess:<rpsid>` from Redis (redis-py added to the account Docker image).
  `verify_vxture_jwt` (HS256) deleted.
- Logout (website + console) is a top-level POST to `/auth/logout` -> IdP
  `end_session` + back-channel; not an XHR (must follow the redirect).

Shipped as 3 squash-merged PRs into develop: #77 (RP core, dormant), #78
(cutover), #79 (legacy removal + docs). develop tip after #79 = `83e765d`.
Retired env: JWT_SECRET(HS256), AUTH_BFF_URL, AUTH_INTERNAL_TOKEN, VXTURE_SSO_URL,
VXTURE_LOGIN_URL, VXTURE_COOKIE_ACCESS. Required now: OIDC_ISSUER,
OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI, REDIS_URL (deploy check 11 enforces).
Promotion to main is gated — see [[ruyin-oidc-promotion-pending]].
