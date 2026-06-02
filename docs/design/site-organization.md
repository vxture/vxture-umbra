# Site Code Organization Design

This document defines how Umbra should organize website code as the project
grows from an infrastructure repo into a multi-site platform. It is a design
record only. Migration starts after the plan is confirmed.

## Highest Priority

VPN access and subscription delivery must not be interrupted.

The migration must not change these production runtime contracts:

- Public VPN entry remains `vpn.ruyin.ai:443`.
- REALITY traffic continues through the Nginx stream SNI path to Marzban/Xray.
- Native subscription delivery remains `https://sub.ruyin.ai/sub/<token>`.
- Saved Marzban subscription URLs must continue to return `200` with `GET`.
- Nginx must not expose the internal `:8443` listener in redirects.
- Existing `DATA_DIR` runtime paths remain valid during the migration.

## Current Layout

Before this migration, website-related source code lived in several top-level directories:

```text
account-web/              # Next.js account and invite UI
portals/website/          # ruyin.ai Next public website
portals/console/public/guide/ # guide source served at vpn.ruyin.ai/guide/
services/account/         # account API plus legacy fallback HTML
configs/nginx/vhosts/     # routing for all public web surfaces
```

Deployment renders configs and starts containers:

```text
umbra-website              # serves ruyin.ai
www.ruyin.ai               # redirects to ruyin.ai
```

## Problems

- Top-level `landing/` and `portal/` are too generic for a platform repo.
- Historical standalone site source, Next app source, and service code were not
  grouped by product surface.
- The old `landing/html/` copy-to-apex-and-www model hid the canonical domain
  decision in deploy scripts.
- Guide source used to live outside the console portal boundary.
- Documentation still describes old account HTML flows even though Next now
  owns most user-facing UI.

## Target Layout

Use a `portals/` namespace for browser-facing products, matching the Vxture
repo structure:

```text
portals/
  website/                 # ruyin.ai and www.ruyin.ai public portal
    app/                   # Next routes
    components/            # website shell components
    public/
      favicon.ico
      assets/
        brand/               # Brand identity SVGs, paired with lib/brand.ts
        icons/

  console/                 # console.ruyin.ai user home, default user portal
    app/
    public/
    package.json
    next.config.mjs
    Dockerfile

  admin/                   # temporary admin surface: Marzban + invite console
    app/
    public/
    package.json
    next.config.mjs
    Dockerfile
```

Notes:

- `portals/website` owns the public Ruyin website on `ruyin.ai`.
- `www.ruyin.ai` is a canonical redirect to `ruyin.ai`.
- `portals/console` owns the user self-service console on `console.ruyin.ai`.
- `portals/admin` is the future dedicated management surface. It is currently
  scaffolded but not wired into production routing.
- During the transition, public routing keeps `admin.ruyin.ai/invites` on the
  existing console Next app (`umbra-account-web`) and keeps
  `admin.ruyin.ai/dashboard/` on the Marzban upstream. After the route split,
  `admin.ruyin.ai/invites` should move to `portals/admin`.
- The current legacy guide under `vpn.ruyin.ai/guide/` should be treated as a
  public guide surface. It can either stay under
  `portals/console/public/guide/` or be retired after the new console covers the
  onboarding flow.

Keep service and infra code outside `portals/`:

```text
services/
  account/
  subproxy/

configs/
  nginx/
  marzban/
  xray/

packages/
  # future shared packages and backend package split points
```

Rationale:

- `portals/` matches Vxture and contains browser-facing website, user console,
  and admin surfaces.
- `services/` contains server processes and internal APIs.
- `packages/` is reserved for reusable libraries and future backend package
  extraction.
- `configs/` contains runtime infrastructure templates.
- VPN display is served by `umbra-website`.

## Compatibility Strategy

The first migration must be backward compatible.

`deploy/worker-03/scripts/22-render-runtime-configs.py` renders infrastructure configs. The
Ruyin website is built and served by the `umbra-website` Next container:

```text
portals/console/                    -> legacy fallback account-web/
portals/admin/                      -> scaffolded only, not production-routed yet
```

VPN display is served by `umbra-website`.

```text
portals/console/
  -> Docker image umbra-umbra-account-web

portals/website/
  -> Docker image umbra-website
```

This keeps Nginx mounts, container names, and public URLs stable.

## Migration Phases

### Phase 0: Guard Rails

Before moving any source files:

1. Add or update script contract checks for the new `portals/` layout.
2. Ensure deploy verification checks:
   - `https://vpn.ruyin.ai/`
   - `https://console.ruyin.ai/`
   - `https://admin.ruyin.ai/invites`
   - saved subscription URL `GET`
   - `sub.ruyin.ai` root blocked
   - no `:8443` redirects
3. Keep `22-render-runtime-configs.py` output paths unchanged for VPN and guide surfaces.

No production behavior changes in this phase.

### Phase 1: Add New Layout With Fallbacks

1. Add `portals/` directories.
2. Update render scripts and compose build context to prefer `portals/*`.
3. Keep old directories in place.
4. Verify local render and build behavior.

Production risk is low because old paths remain available.

### Phase 2: Move Source Files

Move source files:

```text
landing/html/**     -> portals/website/public/** or Next components
account-web/**      -> portals/console/**
```

The current `account-web` contains both user pages and invite admin pages. The
first move may keep that code together under `portals/console` for safety, but
the target split is:

```text
account-web/app/page.tsx
account-web/app/login/page.tsx
account-web/app/register/page.tsx
account-web/app/dashboard/page.tsx
  -> portals/console/

account-web/app/invites/page.tsx
account-web/app/ui/invite-console.tsx
  -> portals/admin/
```

Update references:

- `docker-compose.yml` build context.
- legacy `account-web` references in deploy contract checks.
- docs repository layout.
- any script references to old source paths.

Do not change:

- Nginx public route behavior
- Marzban/Xray/subproxy configs

### Phase 3: Deploy With Extra Verification

Server execution should use:

```bash
cd /srv/vxture/repo/umbra
git pull --ff-only origin main
python3 deploy/worker-03/scripts/22-render-runtime-configs.py
bash deploy/worker-03/scripts/23-start-docker-services.sh
bash deploy/worker-03/scripts/24-verify-deployment.sh
```

Manual post-checks:

```bash
curl -skI https://vpn.ruyin.ai/ | head
curl -skI https://console.ruyin.ai/ | head
curl -skI https://admin.ruyin.ai/invites | head
curl -sk https://sub.ruyin.ai/sub/invalid-token -o /dev/null -w "%{http_code}\n"
curl -skI https://admin.ruyin.ai/ | grep -i '^location:' | grep ':8443' && echo BAD || echo OK
```

Saved valid subscription URLs must also be tested through the existing
`24-verify-deployment.sh` database-derived check.

### Phase 4: Remove Old Paths

Only after one successful deploy:

1. Remove fallback lookup from render scripts after one successful deploy.
2. Update docs to show only `portals/`.

This phase should be a separate commit from the file move.

## Future Package Planning

Do not start by splitting everything into packages. First move browser-facing
surfaces under `portals/`, then extract only the code that is actually shared.

Candidate future packages:

```text
packages/
  design/                 # shared Umbra/Vxture-aligned UI tokens/components
  auth-client/            # SSO start/callback helpers once stable
  api-client/             # typed clients for account/admin APIs
  config/                 # shared TypeScript config, lint config, env helpers
```

Candidate backend split after the site move:

```text
services/account/         # keep current Python account API until stable
packages/backend-account/ # optional future extraction, only if reuse appears
```

Backend extraction should not happen in the same commit series as portal file
moves because it would increase deployment risk without helping the directory
cleanup.

## Files That Must Not Change During Site Reorganization

Avoid touching these unless there is a specific bug:

```text
configs/nginx/stream.conf.template
configs/nginx/vhosts/04-sub.conf.template
configs/marzban/clash-subscription.j2
configs/xray/config.json.template
services/subproxy/subproxy.py
```

These files participate directly in VPN transport or subscription delivery.

## Acceptance Criteria

- `bash deploy/worker-03/scripts/24-verify-deployment.sh` passes with zero failures.
- `https://vpn.ruyin.ai/` returns the VPN display page.
- `https://console.ruyin.ai/` returns the Next account UI.
- `https://admin.ruyin.ai/invites` returns the Next invite UI.
- `https://admin.ruyin.ai/` redirects to `/dashboard/` without `:8443`.
- Saved Marzban subscription URLs still return `200` with `GET`.
- Subscription profile title remains normalized.
- No public URL changes are required for users.
- No `docker compose down` or destructive reset is needed.

## Recommended Commit Plan

Use small commits so rollback is simple:

1. `Document site organization migration`
2. `Add portal layout fallbacks`
3. `Migrate website from standalone source to Next`
4. `Move account web under portals console`
5. `Remove legacy site path fallbacks`

Do not combine VPN/subscription config changes with site organization commits.
