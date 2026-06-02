# Umbra Project Structure Plan

## Goal

Keep Umbra as a clean product repository for Ruyin. Vxture packages are consumed
only as published dependencies, while product brand, runtime configuration,
deployment scripts, and Ruyin-specific content stay in this repository.

## Current Top-Level Structure

```text
umbra/
|-- brand/                   # Canonical brand identity SVGs (single source)
|-- configs/                 # Runtime templates: nginx, marzban, xray
|-- docs/                    # Product, design, implementation, deployment docs
|-- portals/                 # Browser-facing apps and compatibility pages
|   |-- website/             # ruyin.ai public website, now migrating to Next
|   |-- console/             # console.ruyin.ai account UI and legacy guide
|   `-- admin/               # Scaffolded admin surface with dashboard cards
|-- scripts/                 # Server, deploy, and ops entrypoints
|-- services/                # Internal Python services
|-- docker-compose.yml
|-- .env.example
`-- .npmrc                   # @vxture package registry only
```

This structure is directionally correct. The cleanup should focus on portal
internals, assets, and clear ownership boundaries.

## Target Top-Level Structure

```text
umbra/
|-- brand/                   # Canonical brand identity SVGs (single source)
|-- configs/
|   |-- nginx/
|   |-- marzban/
|   `-- xray/
|-- docs/
|   |-- specs/
|   |-- design/
|   |-- implementation/
|   |-- deployment/
|   `-- operations/
|-- portals/
|   |-- website/
|   |-- console/
|   `-- admin/
|-- scripts/
|   |-- deploy/
|   |-- lib/
|   |-- ops/
|   `-- server/
|-- services/
|   |-- account/             # Current lightweight Python account API
|   `-- subproxy/            # Lightweight Python subscription adapter
|-- docker-compose.yml
|-- .env.example
`-- .npmrc
```

No new local `packages/` directory should be added now. Shared logic should come
from published packages such as `@vxture/shared`; Umbra-specific shared code can
live under the owning portal or service until reuse is real.

## Backend Stack Policy

Current Python usage is limited to deployment tooling and small runtime
adapters:

- `deploy/worker-03/scripts/*.py`: deployment-time config rendering and checks.
- `services/account/account.py`: current lightweight account/invite API.
- `services/subproxy/subproxy.py`: subscription metadata adapter.

`services/account/account.py` is the only current Ruyin-owned business API. It
exists as a lightweight implementation for the edge node, not as the target
long-term backend stack. `services/subproxy/subproxy.py` is not a business
backend; it is a narrow adapter between nginx and Marzban subscription output.

Policy:

- Keep Python for deployment scripts and small edge adapters.
- Use NestJS for new formal business backends.
- Migrate `services/account/account.py` to a NestJS service when account,
  invite, billing, audit, or admin workflows grow beyond the current edge-node
  scope.
- Do not introduce a NestJS service only to wrap a tiny adapter.

Target future backend layout:

```text
services/
|-- account-api/             # Future NestJS account/invite/admin API
|   |-- src/
|   |-- Dockerfile
|   |-- package.json
|   `-- tsconfig.json
`-- subproxy/                # Keep as Python until complexity justifies moving
    `-- subproxy.py
```

## Local And Production Port Allocation

Umbra uses an independent local development port block so it does not collide
with the Vxture monorepo ports. These ports are local-only direct access points
and internal container upstreams.

Reserved Umbra local ports:

| Port | Owner | Purpose |
|------|-------|---------|
| 3210 | `portals/website` / `umbra-website` | Ruyin public website |
| 3220 | `portals/console` / `umbra-account-web` | User console and invite UI |
| 3281 | `services/account` / `umbra-account` | Lightweight account/invite API |

Requirements for other task lines:

- Do not allocate Vxture local services on `3210`, `3220`, or `3281`.
- If Vxture SSO validates callback origins, allow `http://localhost:3220` for
  the Umbra console callback during local development.
- Keep Vxture's existing `3010-3031`, `3090-3122`, `8000`, and `8090` ranges
  reserved for Vxture services.
- Production must expose only host ports `80` and `443`; Nginx proxies to
  `3210`, `3220`, and `3281` over the Docker network.

## Portal Ownership

### `portals/website`

Owns `ruyin.ai` public website.

Target:

```text
portals/website/
|-- app/                     # Next app routes and app-local styles
|-- components/              # Website-only React components
|-- lib/
|   `-- brand.ts             # Ruyin product brand/content constants
|-- public/
|   |-- favicon.ico
|   `-- assets/
|       |-- brand/            # Brand identity SVGs, paired with lib/brand.ts
|       |-- icons/
|       `-- social/
|-- Dockerfile
|-- next.config.mjs
|-- package.json
`-- tsconfig.json
```

Rules:

- Next `public/` is the only source for active website assets.
- Brand content belongs in `lib/brand.ts`, not inside DS packages.
- DS styling must come from `@vxture/design-system`.
- Cross-product helpers must come from `@vxture/shared` when needed.
- Brand image assets live under `assets/brand/`, paired with the `lib/brand.ts` module.

### `portals/console`

Owns `console.ruyin.ai` user account and invite UI.

Target:

```text
portals/console/
|-- app/
|   |-- auth/
|   |-- dashboard/
|   |-- login/
|   |-- providers.tsx        # ThemeProvider wrapper
|   |-- register/
|   `-- ui/
|       `-- shell.tsx
|-- public/
|   |-- assets/
|   |   |-- brand/           # Brand identity SVGs
|   |   `-- icons/
|   `-- guide/               # Public guide under vpn.ruyin.ai/guide/
|-- Dockerfile
|-- next.config.mjs
|-- package.json
`-- tsconfig.json
```

Rules:

- Console should also use Ruyin brand resources, not Vxture logo assets.
- `public/guide/` is standalone guide content and should be retired or rebuilt
  after the console covers onboarding.
- DS is imported via `@vxture/design-system/styles/globals.css` in layout.tsx.
- Theme provider wraps the app shell with `defaultMode="system"`.
- Admin invite UI currently lives here; split to `portals/admin` only when the
  route boundary is ready.

### `portals/admin`

Scaffolded Next.js app serving `admin.ruyin.ai` with a dashboard card UI
linking to VPN Management (Marzban) and Password Management (Vaultwarden).

Current structure:

```text
portals/admin/
|-- app/
|   |-- ui/
|   |   `-- admin-home.tsx
|   |-- globals.css
|   |-- layout.tsx
|   `-- page.tsx
|-- public/
|   `-- assets/
|       |-- brand/
|       |   `-- ruyin-symbol-dark.svg
|       `-- icons/
|           `-- ruyin-icon-64.svg
|-- Dockerfile
|-- next.config.mjs
|-- package.json
`-- tsconfig.json
```

Near-term rule:

- Add DS integration (`ThemeProvider`, `globals.css`) when the admin UI
  grows beyond static cards.
- Move invite admin UI from `portals/console/app/invites` to `portals/admin`
  only after nginx routing and deploy checks are ready.

## Brand Resource Source Of Truth

Brand identity SVGs are stored in a single canonical directory at repo root:

```text
umbra/brand/
|-- ruyin-symbol-dark.svg
|-- ruyin-symbol-light.svg
|-- ruyin-lockup-dark.svg
|-- ruyin-lockup-light.svg
|-- ruyin-wordmark-dark.svg
`-- ruyin-wordmark-light.svg
```

This directory is the **single source of truth** - all edits to brand SVGs must
be made here, then the files are propagated to each portal's
`public/assets/brand/` for local development.

During Docker build, `docker compose` injects
[`additional_contexts`](https://docs.docker.com/compose/compose-file/build/#additional_contexts)
named `brand_context`, and each
[`Dockerfile`](portals/website/Dockerfile) copies the SVGs into
`public/assets/brand/` via:

```dockerfile
COPY --from=brand_context / ./public/assets/brand/
```

This eliminates duplication across three portals while keeping the SVGs
accessible at `/assets/brand/...` at runtime.

### Per-portal copies for local dev

Each portal keeps its own copy of the subset of SVGs it needs, committed to
git. These are kept in sync manually from the canonical `brand/` directory.
They are not the source of truth - they are local dev copies.

```text
portals/website/public/assets/brand/   # All 6 SVGs (symbol, lockup, wordmark)
portals/console/public/assets/brand/   # symbol dark/light + lockup dark
portals/admin/public/assets/brand/     # symbol dark only
```

Standalone `public/guide/` content should keep only the assets it directly uses
until the guide is rebuilt or retired.

## Brand Assets To Provide

| Asset | Required | Target path | Notes |
|---|---:|---|---|
| Ruyin symbol dark | Yes | `portals/website/public/assets/brand/ruyin-symbol-dark.svg` | Small header mark on dark backgrounds |
| Ruyin symbol light | Yes | `portals/website/public/assets/brand/ruyin-symbol-light.svg` | Small header mark on light backgrounds |
| Ruyin lockup dark | Yes | `portals/website/public/assets/brand/ruyin-lockup-dark.svg` | Logo + Ruyin + CN name or full lockup |
| Ruyin lockup light | Yes | `portals/website/public/assets/brand/ruyin-lockup-light.svg` | Light-theme equivalent |
| Ruyin wordmark dark | Recommended | `portals/website/public/assets/brand/ruyin-wordmark-dark.svg` | Large hero/signature image |
| Ruyin wordmark light | Recommended | `portals/website/public/assets/brand/ruyin-wordmark-light.svg` | Large hero/signature image |
| Favicon ico | Yes | `portals/website/public/favicon.ico` | Browser favicon |
| App icon 32 | Recommended | `portals/website/public/assets/icons/ruyin-icon-32.svg` | Small browser/UI icon |
| App icon 64 | Yes | `portals/website/public/assets/icons/ruyin-icon-64.svg` | Header fallback and general UI |
| App icon 180 | Recommended | `portals/website/public/assets/icons/ruyin-icon-180.svg` | Apple touch icon |
| App icon 512 | Recommended | `portals/website/public/assets/icons/ruyin-icon-512.svg` | PWA/social reuse |
| Open Graph image | Recommended | `portals/website/public/assets/social/ruyin-og-image.svg` | 1200x630 |
| Twitter card image | Optional | `portals/website/public/assets/social/ruyin-twitter-card.png` | 1200x630 or 1200x600 |

The duplicate old website source has been removed. Brand identity SVGs live
in `assets/brand/` alongside the `lib/brand.ts` code module. The console guide
is standalone public content and currently uses its local favicon as the header
mark until the new Ruyin brand pack is provided.

## Cleanup Phases

### Phase 1: Brand Pack Intake [done]

- Created canonical [`brand/`](brand/) directory at repo root as single source of truth
  for all brand identity SVGs (symbol, lockup, wordmark in dark/light variants).
- Each portal keeps a local dev copy in `public/assets/brand/`, synced from canonical
  source.
- [`portals/website/lib/brand.ts`](portals/website/lib/brand.ts) provides theme-aware
  `markSrc(theme)` and `signatureSrc(theme)` functions.
- Docker builds use `additional_contexts` in
  [`docker-compose.yml`](docker-compose.yml) and `COPY --from=brand_context` in each
  [`Dockerfile`](portals/website/Dockerfile) to inject brand SVGs at build time.

### Phase 2: Guide Retirement

- Keep `portals/console/public/guide/` until the guide is rebuilt or retired.

### Phase 3: Console DS Alignment [done]

- Added `@vxture/design-system` and `@vxture/shared` to console dependencies.
- Imported `@vxture/design-system/styles/globals.css` in console `layout.tsx`.
- Removed duplicated `:root` / `.dark` CSS token blocks from [`portals/console/app/globals.css`](portals/console/app/globals.css).
- Added `ThemeProvider` with `defaultMode="system"` wrapping the console app shell.
- Added `themeBootstrapScript` for FOUC prevention.
- Console now uses DS-provided semantic `--vx-*` tokens.

### Phase 4: Admin Boundary [done]

- Scaffolded `portals/admin` as a standalone Next.js app with Marzban and
  Vaultwarden dashboard cards.
- Admin app scaffold and Dockerfile are in place; production routing still
  points `/` and `/dashboard/` to Marzban, with `/invites` served by
  `umbra-account-web`.
- Move invite admin UI from `portals/console/app/invites` to `portals/admin`
  only after nginx routing and deploy checks are ready (still pending).

## Non-Goals

- Do not edit the Vxture repository.
- Do not define a separate Umbra design system.
- Do not introduce a local monorepo package just for brand constants.
- Do not deploy copied Vxture brand assets as Ruyin brand resources.
