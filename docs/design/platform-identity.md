# Ruyin Platform Identity and Multi-App Authorization

This document is the design for evolving the Ruyin account portal from a single
VPN binding into a platform identity that can authorize and bind multiple
application systems (VPN today, Vault and others later). VPN is the first and
only implemented application; the Vault card is present but disabled. The admin
invite console (the platform-local admin login) is a separate system and out of
scope here.

## Context

Authentication is delegated entirely to Vxture SSO; Umbra holds no user
credentials (the legacy local-password identity provider was retired in #31).
The account portal currently fuses identity with the VPN binding: one
`accounts` row equals one Vxture identity plus one Marzban user plus one
subscription. Adding a second application (Vault, etc.) has nowhere to attach.

This design separates identity from per-application entitlements so that
adding an application means adding a binding row and a launcher card, not
reshaping the identity layer.

## Identity Model

Three layers, each with a clear source of truth:

| Layer | Source of truth | What Umbra stores |
| --- | --- | --- |
| Identity (who you are) | Vxture | A projection: `vxture_account_id` plus display fields. No credentials. |
| Application resource | The module system (Marzban for VPN, Vaultwarden for Vault) | A reference only (which resource the identity is bound to) plus a small cache. |
| Authorization (identity to application) | Umbra account DB | The authoritative association graph. |

Umbra's account database is authoritative only for "which identity may use
which application/resource". Everything else is owned by the module systems and
is referenced or cached.

## Data Architecture

### accounts (identity anchor, 1:1 with Vxture)

```sql
accounts(
  id                INTEGER PRIMARY KEY,
  vxture_account_id TEXT UNIQUE,      -- link to the Vxture identity (JWT sub)
  vxture_email      TEXT,
  vxture_tenant_id  TEXT,
  username          TEXT,             -- display handle (Vxture preferred_username)
  display_name      TEXT,             -- human-friendly name (Vxture name)
  avatar_url        TEXT,             -- avatar image URL (Vxture picture)
  created_at        TEXT NOT NULL,
  last_seen_at      TEXT,
  disabled          INTEGER NOT NULL DEFAULT 0
)
```

Notes:

- The Marzban username no longer lives here; it moves to
  `app_bindings.resource_ref`. In this schema `username` is a platform display
  handle, not the VPN user code.
- `username`, `display_name`, and `avatar_url` are display-only fields, sourced
  from Vxture SSO claims and refreshed (upsert) on each callback/session so the
  values stay current. If Vxture does not yet emit a claim, the field stays
  null and the UI falls back (avatar initials, email local-part as handle).
  Vxture backfills these claims later.
- Legacy columns (`password_salt`, `password_hash`, `display_name_key`) are kept
  as inert columns to avoid a destructive rebuild of the production SQLite.

Claim mapping (Vxture JWT -> accounts):

| Vxture claim | accounts column |
| --- | --- |
| sub | vxture_account_id |
| email | vxture_email |
| tenantId | vxture_tenant_id |
| preferred_username (or username) | username |
| name (or display_name) | display_name |
| picture (or avatar) | avatar_url |

`role` and `permissions` are not stored; they are read from the JWT per
request.

### app_bindings (one row per identity x application)

```sql
app_bindings(
  id           INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  app_key      TEXT NOT NULL,         -- 'vpn' | 'vault' | future
  status       TEXT NOT NULL,         -- 'active' | 'pending' | 'unbound'
  resource_ref TEXT,                  -- vpn: Marzban username (USER08)
  metadata     TEXT,                  -- JSON; vpn: {"subscription_url": "..."}
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  UNIQUE(account_id, app_key)         -- one binding per app per identity (for now)
)
```

A generic table plus a JSON `metadata` column is chosen over per-application
tables: adding an application is one registry row plus broker code, with no
schema change.

### invites (redeeming a code creates an app_binding)

```sql
invites(
  id                 INTEGER PRIMARY KEY,
  code_hash          TEXT NOT NULL UNIQUE,
  code_plain         TEXT,            -- cleared after redemption
  app_key            TEXT NOT NULL,   -- which application this grants
  resource_ref       TEXT,           -- vpn: target Marzban username
  metadata           TEXT,           -- JSON; vpn: {"subscription_url": "..."}
  expires_at         TEXT NOT NULL,
  used_at            TEXT,
  used_by_account_id INTEGER REFERENCES accounts(id),
  disabled           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
)
```

### Relationships

```
accounts 1---N app_bindings ...(logical reference)... module resource
   ^                ^
   | redeem creates |
   +---- invites ---+
```

### Migration (idempotent, additive)

Delivered in phases so existing code keeps working at each step:

- Step 1 (this baseline): create `app_bindings`; backfill the existing VPN
  binding from `accounts.username` and `accounts.subscription_url` into a row
  with `app_key='vpn'`. Add `avatar_url` to `accounts` (`display_name` and
  `last_login_at` already exist; `last_login_at` serves as `last_seen_at`). Add
  `app_key`, `resource_ref`, `metadata` to `invites`, defaulting existing rows
  to `app_key='vpn'`.
- Later step: once read paths move onto `app_bindings`, free the legacy
  `accounts.username` (which still holds the Marzban user) and introduce the
  `username` display handle there. Deferring costs nothing because Vxture does
  not emit the handle yet.
- Keep legacy columns (`password_salt`, `password_hash`, `display_name_key`).
  Follow the existing PRAGMA `table_info` migration style in `init_db`.

## Technical Architecture

### Components

No new services are introduced for the VPN-only stage; changes are inside
`umbra-account` (schema, API, brokers) and `umbra-account-web` (launcher and
per-app views).

```
Browser (*.ruyin.ai:443)
  -> umbra-nginx (SNI + vhost)
       console.ruyin.ai/              -> umbra-account-web (launcher + app views)
       console.ruyin.ai/api/account/* -> umbra-account (identity broker + auth DB + module brokers)
       console.ruyin.ai/auth/*        -> umbra-account-web (SSO start/callback)
       vpn.ruyin.ai/                  -> VPN display surface
       pass.ruyin.ai/                 -> umbra-vaultwarden (later)
  umbra-account -> umbra-marzban (VPN source of truth)
External: Vxture SSO + auth-bff (identity provider; signs/verifies ry_access_token)
```

### Authentication and session (one identity across subdomains)

```
Any entry -> /auth/start -> Vxture SSO -> /auth/callback
  -> set ry_access_token (Domain=.ruyin.ai, shared by console/vpn/pass)
  -> every /api/account/* call: umbra-account verifies the JWT
     (stateless; no server-side user session)
```

There is no local user session; the user surface authenticates purely from the
Vxture JWT. On each callback/session the account row is upserted from JWT claims
to keep display fields fresh.

### Module broker abstraction

Each application implements a uniform interface in `umbra-account` so the API
and frontend stay application-agnostic:

```
resolve(account, binding)            -> status/details   (vpn: query Marzban)
bind(account, invite)                -> binding          (vpn: validate Marzban user)
action(account, binding, name, args)                     (vpn: reset subscription)
```

Adding an application = implement a broker + add an APPS registry entry + create
binding rows. The identity layer and the frontend shell do not change.

### API surface (application-agnostic)

```
GET  /api/account/session
     -> { user:{ id, email, username, displayName, avatarUrl, role },
          apps:[ { key, name, status, href, secondaryAuth }, ... ] }
POST /api/account/apps/{app_key}/bind            { inviteCode }
POST /api/account/apps/{app_key}/action/{name}    (e.g., vpn reset)
```

The `apps` array is composed from the APPS registry joined with the identity's
`app_bindings`.

### Frontend structure (console)

```
console/app/
  page.tsx             launcher: render a card per session.apps entry
  apps/[app]/page.tsx  generic per-app view; VPN is the first implementation
                       (unbound -> invite bind; active -> subscription info)
  auth/*               unchanged (may later consolidate to a single callback)
```

### Application registry (drives the cards)

```
APPS = [
  { key:'vpn',   name:'VPN',   href:'/apps/vpn',             enabled:true,  bindable:true, secondaryAuth:false },
  { key:'vault', name:'Vault', href:'https://pass.ruyin.ai', enabled:false, bindable:true, secondaryAuth:true  },
]
```

`secondaryAuth` flows through to the session payload and the card UI, reserving
a place for applications that require their own login on top of the Ruyin
identity (handled case by case later).

## Decisions

1. Generic `app_bindings` with a JSON `metadata` column (not per-application
   tables).
2. `invites` carry `app_key` (plus `resource_ref`/`metadata`) so any
   application can issue grants.
3. One binding per application per identity for now (relax later for
   multi-resource).
4. `ry_access_token` scoped to `Domain=.ruyin.ai` for single sign-on across
   subdomains (requires Vxture sign-side cooperation).
