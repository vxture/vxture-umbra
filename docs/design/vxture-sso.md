# Vxture SSO Integration Design

This document defines the SSO handoff between Umbra/Ruyin and the Vxture
console.

## Status

Umbra already has:

- A Next.js account web app on `https://console.ruyin.ai`.
- An invite console on `https://admin.ruyin.ai/invites`.
- A server callback route at `GET /auth/callback`.
- Account APIs that can read the Vxture access cookie and bind it to an
  existing Marzban invite.

Use the shared Vxture SSO start endpoint:

```env
VXTURE_SSO_URL=https://console.vxture.com/zh-CN/sso/start
```

If the endpoint is unavailable in an environment, set `VXTURE_SSO_URL=` to keep
the old fallback login link behavior.

## Goals

- Let a user start login from `console.ruyin.ai`.
- Redirect the user to Vxture SSO with a structured `ctx` parameter.
- Receive a cross-domain token from Vxture at the Umbra callback route.
- Exchange the cross-domain token for normal Vxture auth cookies.
- Redirect the user to the logged-in Umbra account page.
- Protect the callback against CSRF with a server-generated `state`.

## Non-Goals

- Do not implement a separate Umbra identity provider.
- Do not store Vxture passwords in Umbra.
- Do not expose `AUTH_INTERNAL_TOKEN` or auth-bff credentials to the browser.
- Do not depend on client-side state storage for CSRF protection.

## Public Contract

### Start URL

Umbra should start SSO through a server route:

```text
GET https://console.ruyin.ai/auth/start
```

The route redirects to:

```text
https://console.vxture.com/zh-CN/sso/start?ctx=<json>
```

The `ctx` JSON object:

```json
{
  "from": "ruyin",
  "returnTo": "https://console.ruyin.ai/auth/callback",
  "caller": "Ruyin",
  "state": "<uuid>"
}
```

Notes:

- Umbra should send only `ctx`; it should not append a separate `returnTo`
  query parameter.
- `state` is generated server-side by Umbra.
- `ctx` is JSON-stringified and URL-encoded as the `ctx` query parameter.

### Callback URL

Vxture redirects back to:

```text
GET https://console.ruyin.ai/auth/callback?token=<token>&state=<state>
```

The callback route must:

1. Validate `state` against the HttpOnly state cookie before token exchange.
2. Call `AUTH_BFF_URL/auth/crossdomain/verify` with the received token and
   `source: "ruyin.ai"`.
3. Call `AUTH_BFF_URL/auth/internal/sign` with `source: "ruyin"` after token
   verification.
4. Forward every returned `Set-Cookie` header to the browser.
5. Redirect to `/dashboard`.

The two source values are intentionally different:

- `crossdomain/verify.source = "ruyin.ai"` identifies the target domain and
  must match the token's allowed `targetDomain`.
- `internal/sign.source = "ruyin"` selects the Ruyin cookie namespace such as
  `ry_access_token` and `ry_refresh_token`.

## Server-Side State Design

`/auth/start` must:

1. Generate a cryptographically random UUID state.
2. Store the state in a short-lived HttpOnly cookie.
3. Build the `ctx` object.
4. Redirect to `VXTURE_SSO_URL` with `ctx`.
5. Reject invalid `VXTURE_SSO_URL` values by redirecting to
   `/?sso=bad_config` before sending the user to Vxture.

Production must not infer the public app URL from `Host`. Compose injects:

```env
NEXT_PUBLIC_RUYIN_ACCOUNT_URL=https://${CONSOLE_DOMAIN}
```

If this value is missing in production, `/auth/start` and `/auth/callback`
return `500` instead of constructing redirects from the request host.

Recommended cookie:

```text
Name: umbra_sso_state
HttpOnly: true
Secure: true
SameSite: Lax
Path: /auth
Max-Age: 300
```

`/auth/callback` must:

1. Read `state` from the query string.
2. Read `umbra_sso_state` from the request cookie.
3. Compare both values with a constant-time comparison.
4. Clear `umbra_sso_state` after validation, including failure cases.
5. Reject the request before token exchange if state validation fails.
6. Accept Vxture error callbacks such as
   `/auth/callback?error=sso_token_failed&state=<state>` and redirect to
   `/login?sso=sso_token_failed`.

Failure response:

```text
HTTP 302 Location: /login?sso=state
```

## Environment Variables

Required in the server `.env` for SSO:

```env
VXTURE_SSO_URL=https://console.vxture.com/zh-CN/sso/start
AUTH_BFF_URL=<vxture-auth-bff-origin>
AUTH_INTERNAL_TOKEN=<internal-sign-token>
JWT_SECRET=<same-secret-used-for-ry_access_token>
VXTURE_LOGIN_URL=https://console.vxture.com/zh-CN/signin
```

`NEXT_PUBLIC_RUYIN_ACCOUNT_URL` is not a server `.env` value. Compose injects
it into `umbra-account-web` as:

```env
NEXT_PUBLIC_RUYIN_ACCOUNT_URL=https://${CONSOLE_DOMAIN}
```

Current deployment may keep `VXTURE_SSO_URL=` empty until the Vxture endpoint
is ready. In that mode the login button falls back to `VXTURE_LOGIN_URL`.

## Sequence

```text
Browser
  -> GET console.ruyin.ai/auth/start

Umbra account web
  -> generate state
  -> Set-Cookie: umbra_sso_state=<state>; HttpOnly; Secure; SameSite=Lax
  -> 302 VXTURE_SSO_URL?ctx=<json>

Browser
  -> GET console.vxture.com/zh-CN/sso/start?ctx=<json>

Vxture SSO
  -> authenticate user if needed
  -> issue cross-domain token
  -> 302 https://console.ruyin.ai/auth/callback?token=<token>&state=<state>

Umbra account web
  -> validate state cookie
  -> POST AUTH_BFF_URL/auth/crossdomain/verify { token, source: "ruyin.ai" }
  -> POST AUTH_BFF_URL/auth/internal/sign { source: "ruyin", ...verifiedPayload }
  -> forward Set-Cookie
  -> 302 /dashboard
```

## Invite Activation Flow

Ruyin intentionally uses a two-step activation model:

1. The user signs in with Vxture SSO.
2. Inside Ruyin, the signed-in user enters a one-time invite code.
3. Ruyin binds the Vxture account id to the target Marzban user and reveals the
   subscription URL.

This is safer than embedding invite data into SSO because identity and VPN
entitlement remain separate:

- Vxture proves who the user is.
- Ruyin invite codes decide whether that identity can activate a VPN
  subscription.

The simpler user experience is an invite link, not a different security model:

```text
https://console.ruyin.ai/register?invite=<code>
```

Invite-link handling:

- If anonymous, store the invite code in a short-lived pending activation cookie
  and send the user through `/auth/start`; after callback, land on `/register`
  with the code prefilled.
- If already signed in, show the bind form with the code prefilled.
- The final binding happens only through `POST /api/account/bind-invite` after
  Vxture identity is present.

Invite admins distribute invite links, not bare codes. The invite console shows
the link in the `Subscription / Invite link` column after an invite is
generated; the primary copy action copies the full invite link, and a secondary
action may copy the bare code for compatibility.

## Confirmed Vxture Contract

- Vxture expects `ctx` as raw JSON URL-encoded by `URLSearchParams`.
- Vxture returns `state` as a top-level query parameter named `state`.
- Vxture routes `from: "ruyin"` through the Ruyin policy.
- Vxture redirects back to `returnTo` with:

```text
?token=<one-time-token>&state=<same-state>
```
