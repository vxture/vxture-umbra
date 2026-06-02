# Ruyin Website Next Migration Plan

## Goal

Migrate the Ruyin public website from the old standalone `index.html` to a
Next.js application that consumes the Vxture design-system as the single design
source. Umbra must not define its own DS.

## Principles

- Use Vxture DS as the only design-system source.
- Keep Ruyin product decisions in Umbra: content, links, product routing, and
  page-specific composition.
- Keep self-built pages in the same shell shape: `header`, `body-section`,
  `footer`.
- Keep public homepage minimal: Ruyin brand, one Hermes entry, no VPN or
  Vaultwarden exposure.
- Make header and footer reusable from the first migration step.
- Do not mutate Vxture from this Umbra migration work.

## Dependency Policy

- Target published packages:
  - `@vxture/design-system@0.1.0`
  - `@vxture/shared@0.1.0`
- Umbra should consume the DS through a package registry or equivalent
  production package source, not by defining local DS tokens.
- `workspace:*` is intentionally not used because Umbra is not part of the
  Vxture workspace.
- The website Docker build requires registry access to the Vxture packages.
- Default scope registry is `https://npm.pkg.github.com`, controlled by
  `VXTURE_NPM_REGISTRY`.
- Local package installs use `portals/website/.npmrc` for the `@vxture` scope.
- Repo-root package checks use `.npmrc` for the same `@vxture` scope.
- `NODE_AUTH_TOKEN` is injected as a Docker BuildKit secret for package read
  access and must remain in `.env` or CI secrets only.
- `11-check-runtime-environment.sh` requires `NODE_AUTH_TOKEN` when
  `VXTURE_NPM_REGISTRY` points to GitHub Packages.
- Do not vendor-copy DS CSS into Umbra as a workaround.
- If DS package publishing is not ready, keep this migration branch un-deployed
  until package resolution is available.
- Target shared package import: `@vxture/shared`.
- Target DS import: `@vxture/design-system`.
- Target global CSS import: `@vxture/design-system/styles/globals.css`.
- Target brand primitives from DS:
  - `vx-brand-lockup`
  - `vx-brand-mark`
  - `vx-brand-name`
  - `vx-brand-separator`
  - `vx-brand-local-name`
- Umbra may add page-local CSS only for layout/composition that DS does not own.

## Tasks

- [x] Create this migration plan.
- [x] Scaffold `portals/website` as a Next.js app.
- [x] Add reusable `SiteHeader` and `SiteFooter` components.
- [x] Rebuild the homepage as a minimal Next page.
- [x] Move/copy public assets needed by the Next app.
- [x] Add a website Dockerfile.
- [x] Add `umbra-website` service to `docker-compose.yml`.
- [x] Update apex/www nginx vhosts to proxy to `umbra-website`.
- [x] Update render/deploy docs so landing pages are no longer copied from the
  old standalone website source.
- [x] Add `umbra-website` to deploy health and verification checks.
- [x] Refresh architecture and site-organization docs for the Next app model.
- [x] Run available deploy contract validation.
- [ ] Validate website type-check/build once dependencies can be installed and
  the Vxture DS package can be resolved in Umbra.

## Open Decisions

- Confirm the published package versions are visible to the package source used
  by Umbra builds.
- `www.ruyin.ai` currently remains a canonical redirect to apex.

## Progress Log

- 2026-05-29: Started plan and migration from standalone HTML to Next.
- 2026-05-29: Added Next app shell, homepage, reusable header/footer, public
  assets, Dockerfile, compose service, nginx proxy, and render-script skip.
- 2026-05-29: Added the website container to deploy health checks and updated
  implementation, deployment, module, architecture, and site-organization docs.
- 2026-05-29: Passed Python syntax checks, `git diff --check`, and
  `scripts/checks/06-check-deploy-contracts.py`.
- 2026-05-29: Website `type-check` is blocked locally because dependencies are
  not installed; `npm install --cache .npm-cache` timed out while fetching
  packages, and the Vxture DS package still needs an accessible package source.
- 2026-05-29: Added published-package registry wiring for
  `@vxture/design-system`; no Vxture repo changes are required or allowed for
  this step.
- 2026-05-29: Switched package auth to Docker BuildKit secret
  `npm_token` sourced from `NODE_AUTH_TOKEN`, and validated compose YAML,
  deploy contracts, and diff whitespace.
- 2026-05-29: Added local website `.npmrc` so local `npm install` and server
  Docker builds both consume the published `@vxture/design-system` package.
- 2026-05-29: Local `npm config get @vxture:registry` resolves to GitHub
  Packages from `portals/website/.npmrc`; local package lookup currently
  returns 404 for `@vxture/design-system@0.1.0`, so the package is not visible
  to the current registry/token yet.
- 2026-05-29: Added repo-root `.npmrc` so server checks from
  `/srv/vxture/repo/umbra` use the same published-package registry.
- 2026-05-29: Server compare showed `npm config get @vxture:registry` as
  `undefined` and no `VXTURE_NPM_REGISTRY` / `NODE_AUTH_TOKEN` entries in
  `.env` or `.env.example`; the server has not received the local package
  registry template changes yet.
- 2026-05-29: Server registry now resolves to GitHub Packages after adding
  `.npmrc`, but package lookup still returns 404. The server `.env` test used
  the placeholder text for `NODE_AUTH_TOKEN`, so token replacement and package
  publication/visibility still need verification.
- 2026-05-29: Updated server compare commands to hide `NODE_AUTH_TOKEN` values
  when printing environment checks.
- 2026-05-30: Added `@vxture/shared@0.1.0` beside
  `@vxture/design-system@0.1.0` as published package dependencies for the
  website app.
- 2026-05-30: Centralized Ruyin product brand content in
  `portals/website/lib/brand.ts`, switched header marks away from Vxture logo
  assets, and kept DS/shared as published package dependencies only.
