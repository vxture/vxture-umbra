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
DATA_DIR/portal/html/
```

The legacy guide output path remains mounted by `umbra-portal`.

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
        brand/
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
- `portals/admin` is the temporary management surface. It should include the
  invite console UI and links into Marzban, while Marzban itself remains the
  upstream admin application until it is replaced or embedded more cleanly.
- Public routing should map `admin.ruyin.ai/invites` to `portals/admin` and
  keep `admin.ruyin.ai/dashboard/` on the Marzban upstream during the
  temporary phase.
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
- Public guide source uses `public/guide`, while rendered runtime output stays
  under `DATA_DIR/portal/html`.

## Compatibility Strategy

The first migration must be backward compatible.

`scripts/deploy/04-render-configs.py` renders infrastructure configs. The
Ruyin website is built and served by the `umbra-website` Next container:

```text
portals/console/public/guide/        -> fallback portal/html/
portals/console/                    -> legacy fallback account-web/
portals/admin/                      -> legacy fallback account-web invite route during transition
```

Runtime output for the public guide remains unchanged:

```text
portals/console/public/guide/
  -> DATA_DIR/portal/html/

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
3. Keep `04-render-configs.py` output paths unchanged for VPN and guide surfaces.

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
portal/html/**      -> portals/console/public/guide/**
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

- `DATA_DIR/portal/html`
- Nginx public route behavior
- Marzban/Xray/subproxy configs

### Phase 3: Deploy With Extra Verification

Server execution should use:

```bash
cd /srv/vxture/repo/umbra
git pull --ff-only origin main
python3 scripts/deploy/04-render-configs.py
bash scripts/deploy/05-up.sh
bash scripts/deploy/06-verify.sh
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
`06-verify.sh` database-derived check.

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

- `bash scripts/deploy/06-verify.sh` passes with zero failures.
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
