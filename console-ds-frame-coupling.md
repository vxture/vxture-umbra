---
name: console-ds-frame-coupling
description: "DS high-level platform/auth compositions are coupled to container frames that conflict with the console's website-style chrome"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38750d62-0a46-45ff-8a3e-8cc276881788
---

The Ruyin console (`portals/console`) uses a hand-rolled `Shell` (website-style
fixed glass header + legal footer), NOT the DS console frame. This constrains
which `@vxture/design-system` v1.3 composition components can be adopted in the
content area.

DS components that need a container ancestor (do NOT force-fit into the console):
- `PageSection` titles use `--vx-platform-*-title-size`, defined only inside
  `:where(.vx-shell)` / `:where(.admin-shell)`.
- bare `.vx-shell` is itself a layout frame (`console-shell-layout-frame.css`,
  `console-shell-chrome-surface.css`) — adding the class drags in the sidebar
  console layout, fighting the website-style chrome.
- `AuthField` / `UnifiedAuthPage`: `--vx-auth-accent`, `--vx-auth-muted` etc. are
  defined on `.vx-auth-page` (a full-screen auth container). Field sizing tokens
  (`--vx-auth-field-*`) are root-level, but the accent/focus colors are not, so
  AuthField renders mis-colored outside `.vx-auth-page`.
- `DetailPanel` / `EntityListPage`: access-page / platform scoped.

DS components/primitives that work standalone inside the current Shell (use these):
- `PageHeader` (supports `icon?: IconName`), `SectionCard`, `MetricGrid`/
  `MetricCard`, `DataTable`, `EmptyState`, `StatusBadge`, `Card`, `Skeleton`,
  `Dialog`, `Input`, `Button` (inline-flex + gap, so `<Icon/>` children space
  automatically), `Icon` (self-contained Phosphor SVG, size in px), `PageStack`
  gap token `--vx-layout-stack-gap` is `:root`-global.

Console `globals.css` already `@import`s DS `components.css` + `auth.css` +
`platform.css` via `globals.css`, so these component styles are loaded with no
extra import. Legitimate layout-only composition (`.page-stack`, `.split`,
`.card-grid`, `.actions`, `.app-tile-title`) stays local per guardrail 09 -
[[portal-redesign]]. 2026-06-12: content area refactored to DS components + full
Phosphor icon coverage on this basis.

Guardrail 09 = `scripts/checks/09-check-ds-usage.py` (report-only, NOT in
quality-gate yet; run manually, `--strict` to fail). It flags raw colors
(hex/rgb/hsl), local `--vx-*` token defs, local `@font-face`/literal
font-family, next/font outside layout.tsx, and selectors duplicating DS
components (`.btn`/`.card`/`.metric-card`/`.badge`/`.input`/`.admin-card`...).
Setting `color`/`background` from `var(--vx-*)` tokens is ALLOWED. `ds-allow`
trailing comment opts a line out. As of 2026-06-12 all three portals pass 09.

ASCII caveat: `portals/website/lib` is ASCII-exempt (contract check
`LOCALIZED_CONTENT_PREFIXES`), but `portals/console/lib` and `portals/admin/lib`
are NOT - copyright there must use the `"© ..."` escape (ASCII source,
renders the glyph).

Admin portal (2026-06-12): app-style sidebar+topbar shell, NOT website chrome.
`AdminShell` is the deliberate placeholder for DS `AppShell` (extension request
#2 in `docs/design/ds-extension-requests.md`) - do NOT replace it with the DS
`.vx-shell`/`.admin-shell` frame until DS >= 1.4 ships AppShell. This pass added
a `lib/brand.ts` (mirrors console), a bottom `ShellLegalFooter` (same copyright +
legal links as console, fitted to the app shell), a third "Invites & Users"
home card, and `PageHeader` icons. `/invites` + `/dashboard/` are served by nginx
upstreams (console InviteConsole, Marzban), so they 404 in admin-only local dev.
