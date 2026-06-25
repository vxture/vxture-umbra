# Vxture SSO Integration Design (OIDC RP)

How ruyin.ai authenticates against the Vxture identity platform. ruyin is the
first cross-domain application and integrates as a standard OIDC Relying Party.
The authoritative external contract is
[`identity-app-integration-standard.md`](../../identity-app-integration-standard.md)
(Vxture App Integration Standard v1.0); this document records how ruyin
implements it in this repo.

## Status

ruyin is an **OIDC Authorization-Code + PKCE(S256) RP** against
`accounts.vxture.com` (the single identity center for the whole product).

- `client_id`: `ruyin`, `realm`: `tenant`, mode B (cross-domain).
- `redirect_uri`: `https://ruyin.ai/auth/callback`.
- `back_channel_logout_uri`: `https://ruyin.ai/auth/backchannel-logout`.
- `scopes`: `openid profile ruyin`.

> Host note: the platform registers the APEX as the RP base (standard section 11:
> `RUYIN_BASE_URL=https://ruyin.ai`), and the IdP strictly whitelists the
> `redirect_uri`, so it must be `https://ruyin.ai/auth/callback`. The OIDC RP
> endpoints physically run in `umbra-account-web`, so nginx serves `/auth/*` on
> the apex by proxying to that container (`01-ruyin.conf.template`), while the
> marketing site stays at `/` and `/api/account/` proxies to `umbra-account`.
> `console.ruyin.ai` also serves `/auth/*` (its catch-all proxies to the same
> container), but the registered callback host is the apex.

The console portal (`umbra-account-web`) is the RP / app-bff. OIDC tokens live
server-side in Redis; the browser only ever holds an opaque `vx_rp_session`
cookie. The Python account service (`umbra-account`) reads the RP-verified
identity claims from Redis to authenticate `/api/account/*` requests.

This replaces the previous custom cross-domain token handoff (the `ctx` JSON
start parameter, the one-time `token` callback, and the `auth-bff`
`crossdomain/verify` + `internal/sign` calls that minted an HS256
`ry_access_token`). That scheme and its env (`AUTH_BFF_URL`,
`AUTH_INTERNAL_TOKEN`, `VXTURE_SSO_URL`, `JWT_SECRET`, `VXTURE_COOKIE_ACCESS`)
have been removed.

## Goals

- Let a user start login from any ruyin surface and authenticate at
  accounts.vxture.com without ruyin implementing a login UI.
- Keep all OIDC tokens server-side; the browser sees only an opaque session
  cookie.
- Verify every token (id/access/logout) with RS256 + JWKS (iss/aud/exp/nonce).
- Support refresh rotation. Ruyin's own logout button is local (ruyin-only);
  global logout still reaches ruyin inbound via back-channel logout.
- One login shared across ruyin.ai and every *.ruyin.ai app.

## Non-Goals

- Do not implement a separate ruyin identity provider or store Vxture passwords.
- Do not expose OIDC tokens or the client secret to the browser.
- Do not depend on cross-registered-domain cookie sharing or iframe/XHR silent
  authorization.

## Endpoints (RP / app-bff, on the console portal)

| Endpoint | Responsibility |
|---|---|
| `GET /auth/login` | Generate PKCE(S256) + state + nonce, store the authreq in Redis, top-level redirect to `{issuer}/oidc/authorize`. Honors an allowlisted `returnTo` and carries an `invite` through. |
| `GET /auth/callback` | Validate state, fetch+delete the authreq, exchange the code (with the PKCE verifier), verify id_token (nonce) + access_token, create the RP session, set the opaque cookie, redirect to `returnTo` (or `/register?invite=`). |
| `GET /auth/session` | Resolve the opaque cookie to identity claims; refresh the access token server-side when near expiry (rotating the refresh token); tear the session down if the refresh family is revoked. |
| `POST /auth/logout` | Local (ruyin-only) logout: destroy the RP session, clear the cookie, redirect to the ruyin home. Does NOT call `end_session`, so the central session and other apps stay signed in (next ruyin login is therefore silent). |
| `POST /auth/backchannel-logout` | Verify the `logout_token` (RS256, backchannel-logout event, `sid`, no `nonce`) and destroy every RP session for that central `sid`. |

The RP library lives under `portals/console/app/auth/lib/`
(`config`, `pkce`, `oidc`, `claims`, `cookie`, `return-to`, `session-store`).

## Login-flow integrity

- `/auth/login` sets a host-only, `/auth`-scoped `state` binding cookie; `/auth/callback` rejects any `state` that does not match it (login-CSRF / session fixation) before consuming the single-use authreq.
- After token exchange (and on refresh), the id_token and access_token must describe the same `sub`; a future `iat` beyond skew is rejected; the JWKS fetch and token-endpoint calls have timeouts so a hung IdP cannot stall verification.
- `/auth/session` responses are `Cache-Control: no-store`. The back-channel logout receiver is single-use per `jti` (replays are acknowledged but not re-processed, within the token's validity window) and rejects a null backchannel-logout event value.

## Session store (Redis)

Four key families in `umbra-redis`:

- `authreq:<state>` - short-lived login->callback handshake (PKCE verifier,
  nonce, returnTo, invite). TTL ~600s, single-use (fetched with `GETDEL`).
- `rpsess:<rpsid>` - verified **identity claims only** (sub, sid, email, phone,
  active_tenant + role/type/status, account_status). **Read by both** the
  console BFF and the account service. TTL = `RP_SESSION_TTL`.
- `rptok:<rpsid>` - the OIDC token bundle (access/refresh/access_exp/id_claims).
  **Console BFF only**; never read by the account service or the browser.
- `sid:<sid>` - SET of `rpsid` for back-channel logout (one central session can
  map to several RP sessions across the ruyin zone).

## Pending upstream claims (requested from accounts.vxture.com)

The console user panel shows organization and workspace, but the access_token
currently carries only the identifiers `active_org` / `active_workspace`, not
display names - so the panel falls back to showing the id. Requested upstream
(same pattern as the email/phone scopes): add **`active_org_name`** and
**`active_workspace_name`** string claims to the access_token alongside the
existing `active_org` / `active_workspace`. The RP and the panel are already
**name-ready** - `claims.ts` reads the name claims, the account DTO surfaces
`orgName` / `workspaceName`, and the UI prefers the name and falls back to the
id - so no client change is needed once the IdP emits them. No new scope is
expected (they ride the existing tenant context); confirm during provisioning.

## Cookie model

- `vx_rp_session`: opaque random id pointing at the server-side session;
  `HttpOnly; Secure; SameSite=Lax; Path=/`, `Domain=.ruyin.ai` (host-only in
  dev). No tokens or claims in the browser.
- The standard's `__Host-` isolation intent is preserved: ruyin's cookie never
  reaches vxture.com and `vx_sid` never reaches ruyin. Within ruyin's own
  first-party zone the cookie is deliberately parent-scoped so one login covers
  apex + every *.ruyin.ai app.

## Token verification (RP must enforce)

For id_token / access_token / logout_token: `alg` must be RS256 (reject
`none`/HS*); resolve `kid` from `{issuer}/oidc/jwks` (cached, one refresh on
miss); `iss === https://accounts.vxture.com`; `aud === ruyin`; `exp` with 60s
skew; id_token `nonce` must equal the request nonce; logout_token must carry the
backchannel-logout event + `sid` and must not carry `nonce`.

## Environment variables (app-bff)

```env
OIDC_ISSUER=https://accounts.vxture.com
OIDC_CLIENT_ID=ruyin
OIDC_CLIENT_SECRET=<provisioned via secret manager; never committed>
OIDC_REDIRECT_URI=https://ruyin.ai/auth/callback
OIDC_SCOPES=openid profile email phone ruyin
OIDC_POST_LOGOUT_REDIRECT_URI=https://ruyin.ai/
REDIS_URL=redis://umbra-redis:6379
RP_SESSION_TTL=2592000
RP_SESSION_COOKIE_NAME=vx_rp_session
RP_SESSION_COOKIE_DOMAIN=.ruyin.ai
```

`OIDC_ISSUER` + `OIDC_CLIENT_SECRET` must both be present for login to work; the
deploy runtime check (`11-check-runtime-environment.sh`) enforces this.

## Sequence

```text
Browser
  -> GET ruyin surface (anonymous) -> GET console.ruyin.ai/auth/login

Account web (RP)
  -> generate PKCE(S256) + state + nonce; store authreq:<state> in Redis
  -> 302 accounts.vxture.com/oidc/authorize?response_type=code&...&code_challenge=...

accounts.vxture.com
  -> browser is first-party here; if vx_sid present, issue code silently
  -> 302 https://ruyin.ai/auth/callback?code=<code>&state=<state>

Account web (RP)
  -> validate state; GETDEL authreq:<state>
  -> POST /oidc/token (code + verifier + redirect_uri, client_secret_basic)
  -> verify id_token (nonce) + access_token (RS256/iss/aud/exp)
  -> store rpsess:<rpsid> (claims) + rptok:<rpsid> (tokens); index sid:<sid>
  -> 302 returnTo + Set-Cookie vx_rp_session=<rpsid>
```

## Invite activation flow

Identity and VPN entitlement remain separate:

1. The user signs in via OIDC.
2. Inside ruyin, the signed-in user enters a one-time invite code.
3. ruyin binds the Vxture account id (`sub`) to the target Marzban user and
   reveals the subscription URL.

Invite-link handling:

- If anonymous, the invite code is carried through `/auth/login?invite=<code>`
  (persisted in the server-side authreq, not a browser cookie); after callback
  the user lands on `/register` with the code prefilled.
- If already signed in, the bind form shows with the code prefilled.
- The final binding happens only through `POST /api/account/bind-invite` after
  Vxture identity is present.

Invite admins distribute invite links, not bare codes. The invite console shows
the link in the `Subscription / Invite link` column after an invite is
generated; the primary copy action copies the full invite link, and a secondary
action may copy the bare code for compatibility.
