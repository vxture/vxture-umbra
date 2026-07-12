---
name: repo-brand-rename
description: GitHub repo renamed vxture/umbra -> vxture/vxture-Umbra 2026-07-07; product brand ruyin -> umbra in code while ruyin.ai domains stay; website homepage still shows Ruyin to users
metadata: 
  node_type: memory
  type: project
  originSessionId: 5ce43862-5d93-4643-9093-1fee9aa9e179
---

# Repo + Brand Rename (2026-07-07, PR #169/#170)

## GitHub repo

`vxture/umbra` -> `vxture/vxture-Umbra` (applied 2026-07-07 via `gh api -X PATCH`).
Remote URL: `https://github.com/vxture/vxture-Umbra.git`.
GitHub redirects old URLs automatically.

**Why:** align the repo name with the product name Umbra.
**How to apply:** use `vxture/vxture-Umbra` in all `gh` commands, CLAUDE.md rulesets
queries, and any scripts referencing the repo slug.

## Internal brand rename: ruyin -> umbra

All product-level names changed in the codebase. Domains and URLs left intact.

| Changed | Old | New |
|---|---|---|
| Code identifiers | `ruyinBrand`, `ruyinBrandCore` | `umbraBrand`, `umbraBrandCore` |
| Product display name | `"Ruyin"` | `"Umbra"` |
| Env var names | `RUYIN_COOKIE_DOMAIN`, `RUYIN_BASE_URL` | `UMBRA_COOKIE_DOMAIN`, `UMBRA_BASE_URL` |
| OIDC client_id (default) | `ruyin` | `umbra` |
| OIDC custom scope | `ruyin` | `umbra` |
| Docker images (GHCR/ACR) | `ruyin-nginx`, `ruyin-account-api`, ... | `umbra-nginx`, `umbra-account-api`, ... |
| Dockerfile | `docker/ruyin-nginx.Dockerfile` | `docker/umbra-nginx.Dockerfile` |
| Nginx vhost file | `01-ruyin.conf.template` | `01-umbra.conf.template` |
| Brand assets | `ruyin-symbol-*.png`, `ruyin-hero-*.png`, `ruyin-logo-*.png` | `umbra-*` |

**Preserved as-is:** all `ruyin.ai` / `*.ruyin.ai` domain values and URL strings.

**OIDC note:** `OIDC_CLIENT_ID=umbra` and scope `umbra` are in `.env.example` / code,
but the IdP registration on `accounts.vxture.com` still uses `ruyin` until manually
updated there (out-of-band action, not done in this PR).

## Website homepage exception

The website portal (`portals/website`) overrides `productName: "Ruyin"` in its own
`lib/brand.ts`, so end users at `ruyin.ai` continue to see "Ruyin" / "Ruyin Agent".
Internally, `umbraBrandCore.productName` is `"Umbra"` (used by admin/console portals).

## DS brand CSS

`@vxture/design-system/styles/brands/ruyin.css` is the actual published file name.
The three portal `layout.tsx` files import `ruyin.css` (not `umbra.css`) until the DS
package ships a `brands/umbra.css` export. Guardrail `09-check-ds-usage.py` checks
for `ruyin.css` accordingly. `brands/umbra.css` is tracked as a DS extension request.

## CI gotchas from this rename

- `[System.Text.Encoding]::UTF8` in PowerShell writes UTF-8 WITH BOM; the ASCII
  contract check rejects BOM. Use `New-Object System.Text.UTF8Encoding($false)`.
- Design system package exports must not be renamed in code without updating the
  package itself first (or simultaneously).
