# Umbra Project Structure Plan

## Goal

Keep Umbra as a clean product repository for Ruyin. Vxture packages are consumed
only as published dependencies, while product brand, runtime configuration,
deployment scripts, and Ruyin-specific content stay in this repository.

## Current Top-Level Structure

```text
umbra/
|-- configs/                 # Runtime templates: nginx, marzban, xray
|-- docs/                    # Product, design, implementation, deployment docs
|-- portals/                 # Browser-facing apps and compatibility pages
|   |-- website/             # ruyin.ai public website, now migrating to Next
|   |-- console/             # console.ruyin.ai account UI and legacy guide
|   `-- admin/               # Reserved admin surface boundary
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

- `scripts/deploy/*.py`: deployment-time config rendering and checks.
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
|       |-- brand/
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

### `portals/console`

Owns `console.ruyin.ai` user account and invite UI.

Target:

```text
portals/console/
|-- app/
|   |-- auth/
|   |-- dashboard/
|   |-- login/
|   |-- register/
|   `-- ui/
|-- public/
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
- Admin invite UI currently lives here; split to `portals/admin` only when the
  route boundary is ready.

### `portals/admin`

Reserved for the future dedicated admin surface.

Near-term rule:

- Keep only boundary docs here until admin routes are moved from console.

## Brand Resource Source Of Truth

Active Ruyin brand resources should live in portal `public/assets/` paths.
Standalone `public/guide/` content should keep only the assets it directly uses
until the guide is rebuilt or retired.

Target active website assets:

```text
portals/website/public/assets/
|-- brand/
|   |-- ruyin-lockup-dark.png
|   |-- ruyin-lockup-light.png
|   |-- ruyin-wordmark-dark.png
|   |-- ruyin-wordmark-light.png
|   |-- ruyin-symbol-dark.svg
|   `-- ruyin-symbol-light.svg
|-- icons/
|   |-- ruyin-icon-32.png
|   |-- ruyin-icon-64.png
|   |-- ruyin-icon-180.png
|   `-- ruyin-icon-512.png
`-- social/
    |-- ruyin-og-image.png
    `-- ruyin-twitter-card.png
```

Target console assets:

```text
portals/console/public/assets/
|-- brand/
|   |-- ruyin-lockup-dark.png
|   `-- ruyin-lockup-light.png
`-- icons/
    |-- ruyin-icon-64.png
    `-- ruyin-icon-180.png
```

## Brand Assets To Provide

Please provide these replacement assets for Ruyin:

| Asset | Required | Target path | Notes |
|---|---:|---|---|
| Ruyin symbol dark | Yes | `portals/website/public/assets/brand/ruyin-symbol-dark.svg` | Small header mark on dark backgrounds |
| Ruyin symbol light | Yes | `portals/website/public/assets/brand/ruyin-symbol-light.svg` | Small header mark on light backgrounds |
| Ruyin lockup dark | Yes | `portals/website/public/assets/brand/ruyin-lockup-dark.png` | Logo + Ruyin + CN name or full lockup |
| Ruyin lockup light | Yes | `portals/website/public/assets/brand/ruyin-lockup-light.png` | Light-theme equivalent |
| Ruyin wordmark dark | Recommended | `portals/website/public/assets/brand/ruyin-wordmark-dark.png` | Large hero/signature image |
| Ruyin wordmark light | Recommended | `portals/website/public/assets/brand/ruyin-wordmark-light.png` | Large hero/signature image |
| Favicon ico | Yes | `portals/website/public/favicon.ico` | Browser favicon |
| App icon 32 | Recommended | `portals/website/public/assets/icons/ruyin-icon-32.png` | Small browser/UI icon |
| App icon 64 | Yes | `portals/website/public/assets/icons/ruyin-icon-64.png` | Header fallback and general UI |
| App icon 180 | Recommended | `portals/website/public/assets/icons/ruyin-icon-180.png` | Apple touch icon |
| App icon 512 | Recommended | `portals/website/public/assets/icons/ruyin-icon-512.png` | PWA/social reuse |
| Open Graph image | Recommended | `portals/website/public/assets/social/ruyin-og-image.png` | 1200x630 |
| Twitter card image | Optional | `portals/website/public/assets/social/ruyin-twitter-card.png` | 1200x630 or 1200x600 |

If a single SVG source exists, prefer providing SVG for symbol/lockup plus PNG
exports for favicon/app/social surfaces.

## Current Brand Assets

```text
portals/website/public/assets/brand/ruyin-dark.png
portals/website/public/assets/brand/ruyin-light.png
portals/website/public/assets/icons/agent-icon-64.gif
portals/website/public/favicon.ico
portals/console/public/guide/favicon.ico
```

The duplicate old website source has been removed. The console guide is
standalone public content and currently uses its local favicon as the header
mark until the new Ruyin brand pack is provided.

## Cleanup Phases

### Phase 1: Brand Pack Intake

- Add new Ruyin assets under `portals/website/public/assets/`.
- Add console assets under `portals/console/public/assets/` when the console UI
  starts consuming public brand assets.
- Update `portals/website/lib/brand.ts` to point to the new active asset names.

### Phase 2: Guide Retirement

- Keep `portals/console/public/guide/` until the guide is rebuilt or retired.

### Phase 3: Console DS Alignment

- Import `@vxture/design-system/styles/globals.css` into console.
- Replace local duplicated UI tokens with DS semantic tokens.
- Move Ruyin brand constants for console into a console-owned brand module or a
  shared Umbra-local config only if both website and console genuinely need it.

### Phase 4: Admin Boundary

- Move invite admin UI from `portals/console/app/invites` to `portals/admin`
  only after nginx routing and deploy checks are ready.

## Non-Goals

- Do not edit the Vxture repository.
- Do not define a separate Umbra design system.
- Do not introduce a local monorepo package just for brand constants.
- Do not deploy copied Vxture brand assets as Ruyin brand resources.
