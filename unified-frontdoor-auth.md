---
name: unified-frontdoor-auth
description: ruyin.ai is the single front door; accounts.vxture.com the single IdP; one login shared across all *.ruyin.ai via parent-domain cookie
metadata: 
  node_type: memory
  type: project
  originSessionId: 78383d3c-0837-4b56-a030-877cc9820108
---

> SUPERSEDED (mechanism) as of 2026-06-18 by [[ruyin-oidc-rp]]: ruyin is now a
> real OIDC RP. The `ry_access_token`/`VXTURE_COOKIE_ACCESS` parent-domain cookie
> rewrite, `/auth/start`, `VXTURE_SSO_URL`, and HS256 verify described below are
> REMOVED. The browser now holds only an opaque `vx_rp_session` cookie; tokens
> live server-side in Redis. The high-level product shape (1 front door + N apps,
> accounts.vxture.com as sole IdP, one login across *.ruyin.ai, auth-vs-
> authorization split) still holds.

Shipped 2026-06-13 (PR #65, in prod). The product is **1 front door + N apps** with **unified identity**:

- **ruyin.ai** = single public front door / brand site. Its header is auth-aware: anonymous shows Sign up / Log in; signed in shows **Workspace** (-> console) + avatar menu (personal info -> console/account, sign out). nginx `01-ruyin` proxies `/api/account/` so the site reads the session same-origin.
- **accounts.vxture.com** = the ONLY identity center (`VXTURE_SSO_URL`/`VXTURE_LOGIN_URL`). `console.vxture.com` is no longer an auth host. All login entries route there; success returns to the caller, failure stays at the IdP.
- **One login, whole site**: the session JWT cookie (`ry_access_token`, name = `VXTURE_COOKIE_ACCESS`) is rewritten onto the **parent domain `RUYIN_COOKIE_DOMAIN=ruyin.ai`** in `console/app/auth/callback/route.ts`, so ruyin.ai + every `*.ruyin.ai` share it. account-api logout clears it on that same domain. This is controlled in-repo (no auth-bff change).
- **console = workspace-only**: anonymous visitors auto-redirect to SSO (no console login page). The old "Continue with Vxture" interstitial is gone. `/auth/start` takes an allowlisted `returnTo` (apex + `*.ruyin.ai`, open-redirect-safe) + `screen_hint`; `/auth/callback` failure lands on the public apex so it can never loop into the auto-redirecting console.
- **auth vs authorization split**: identity is unified; each business app does its own **subscription/entitlement** check (reverse-lookup against the account; `apps_for_account`/`app_bindings` are the basis). See [[admin-console-separation]].

Gotchas / prod deps:
- prod `.env` overrides code defaults. Must have `RUYIN_COOKIE_DOMAIN=ruyin.ai` + accounts.vxture.com URLs. Without `RUYIN_COOKIE_DOMAIN`: ruyin.ai can't read the session AND SSO-failure can loop. (Worker-03 `.env` had a duplicate `VXTURE_LOGIN_URL` line - dotenv last-wins, harmless but clean it up.)
- `screen_hint=signup` is forwarded best-effort; accounts.vxture.com honoring it (signup vs login screen) is an integration follow-up.
- Deploy `verify` only checks apps respond, NOT real login - smoke-test SSO manually after deploy.
