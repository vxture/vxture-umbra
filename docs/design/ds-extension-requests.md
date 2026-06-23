# Design System Extension Requests

Status: proposed
Consumers: Umbra portals (website, console, admin)
Target package: `@vxture/design-system` (proposed >= 1.4)

## Context

The three Umbra portals are being redesigned to consume the Vxture design
system completely. The working rule for this effort:

- Portals use DS React components plus DS token CSS variables (`var(--vx-*)`)
  only.
- Portals must not hand-build design primitives (colors, fonts, shadows, radii)
  or duplicate DS component styles.
- Umbra does not adopt the DS Tailwind utility layer for now. Every requested
  component must therefore ship its own packaged styles and be usable without
  any portal-side utility classes.

DS already exports the shell primitives the portals need for chrome:
`ShellBrand`, `ShellThemeToggle`, `ShellLocaleSwitcher`, `ShellFullscreenToggle`,
`ShellPreferencePanel`, `ShellUserMenu`, and `ShellLegalFooter` (the bottom
legal band). The gaps below are the higher-level compositions that currently
live inside the vxture portal apps and are not yet exported as components.

Reference paths point into the vxture monorepo (the DS origin), so the existing
implementations can be lifted into the package.

## 1. SiteHeader (marketing / portal top bar)

Gap: the fixed marketing/portal top bar is implemented per app. Umbra needs the
same bar across all three portals; it should be a DS component, not a per-portal
copy.

Reference: `portals/website/src/components/layout/Header.tsx`

Proposed API:

```ts
interface SiteHeaderProps {
  brand: ShellBrandProps;                 // reuse existing ShellBrand
  nav?: Array<{ label: ReactNode; href: string; active?: boolean }>; // optional; Umbra website passes none
  tools?: ReactNode;                      // default slot: ShellThemeToggle + ShellLocaleSwitcher
  actions?: ReactNode;                    // guest CTAs (sign up / log in) or ShellUserMenu
  sticky?: boolean;                       // fixed to top
  glassOnScroll?: boolean;                // transparent until scrollY > threshold, then glass + shadow
  scrollThreshold?: number;               // default 50
  maxWidth?: "wide" | "ultrawide" | string; // wide content track (see visual note below)
}
```

Behavior:

- Fixed top, transparent initially, glass background + shadow after scroll
  threshold (the `isScrolled` logic in the reference).
- Responsive; collapses optional nav on small screens.
- Honors light/dark and locale; all colors from tokens.

Acceptance:

- Renders with only `brand` provided (no nav, no actions) and looks complete.
- No portal-side CSS required to position or theme the bar.

## 2. AppShell (sidebar application shell)

Gap: the left-sidebar + top-header application layout lives in the admin app as
`AdminShell.tsx` plus local `admin-shell*.css`. Umbra admin (and later console)
needs this as a DS component with a drastically simpler navigation model. The
key requirement is graceful degradation: a tiny single-group nav, no workspace
switcher, and no search must still look intentional.

Reference: `portals/admin/src/layout/AdminShell.tsx` and
`portals/admin/src/styles/admin-shell*.css`

Proposed API:

```ts
interface AppShellNavItem {
  id: string;
  label: ReactNode;
  href: string;
  icon?: IconName;
  status?: "planned";
  disabled?: boolean;
}

interface AppShellNavSection {
  id: string;
  title?: ReactNode;
  items: AppShellNavItem[];
}

interface AppShellProps {
  brand: ShellBrandProps;
  headerTools?: ReactNode;      // theme / locale / fullscreen
  headerActions?: ReactNode;    // ShellUserMenu, etc.
  search?: ReactNode;           // optional; Umbra passes none
  nav: AppShellNavSection[];    // single short section is a first-class case
  activePath: string;
  collapsible?: boolean;        // default true; collapsed state persisted; tooltips when collapsed
  defaultCollapsed?: boolean;
  onNavigate?: (href: string) => void; // default: anchor navigation
  children: ReactNode;
}
```

Behavior:

- Sidebar with section grouping, collapse, auto-collapse at a narrow breakpoint,
  and collapsed-state tooltips.
- Top header with brand, optional search, tools, and actions slots.
- Content region for `children`.

Acceptance:

- A 3-item, single-section nav with no search and no workspace switcher renders
  cleanly.
- No portal-side shell CSS required.

## 3. Progress / UsageMeter

Gap: DS exports no progress or meter primitive. The VPN self-service surface
needs an at-a-glance used/total quota bar and must not hand-build one.

Proposed API:

```ts
interface ProgressProps {
  value: number;
  max?: number;            // default 100
  tone?: StatusBadgeTone;  // brand by default
  "aria-label"?: string;
}

interface UsageMeterProps {
  used: number;
  total: number;
  usedLabel?: ReactNode;   // preformatted, e.g. "12.3 GB"
  totalLabel?: ReactNode;  // preformatted, e.g. "50 GB"
  thresholds?: { warning?: number; danger?: number }; // ratios; auto tone change
}
```

Acceptance:

- `UsageMeter` shows a filled bar with accessible labelling and changes tone as
  it crosses warning/danger ratios.
- Tokens only; works in light/dark.

## 4. Optional, low priority: NetworkBackground

Umbra's marketing hero uses a particle/network canvas that reads
`--vx-color-primary` and draws connections. It defines no design primitives (it
only reads a token), so it is acceptable as portal content. If the DS wants a
shared decorative background, it could absorb this as `NetworkBackground`.
Otherwise the Umbra usage audit will allowlist that single token read.

Reference: `portals/website/components/network-canvas.tsx` (umbra)

## 6. Add `arrows-left-right` to the Icon dictionary (horizontal swap glyph)

Gap: the DS `iconDictionary` (1.3.0) has no plain horizontal swap glyph. The
only switch-semantic name is `user-switch` (person + arrows), which already
denotes the "Switch user" account action - reusing it for "switch workspace"
collides. The account menu's workspace row needs a neutral left-right swap.

Request: map an `arrows-left-right` name to phosphor `ArrowsLeftRightIcon`
(already a transitive dep the DS re-exports), same as the other arrow glyphs.

Acceptance:

- `<Icon name="arrows-left-right" />` renders the phosphor ArrowsLeftRight glyph
  and the name is part of the exported `IconName` union.

Interim (Umbra, 2026-06-23): `portals/website/components/user-dropdown.tsx`
imports `ArrowsLeftRightIcon` directly from `@phosphor-icons/react` for the
workspace switch affordance. Swap it back to `<Icon name="arrows-left-right" />`
once the DS ships the name.

## 5. Mirror typography size tokens into :root (no-Tailwind consumability)

Gap: the DS is authored for a Tailwind v4 build. `styles/globals.css` does
`@import "tailwindcss"` and `styles/typography.css` declares the typography
tokens inside an `@theme {}` block (sizes, line-heights, letter-spacings, plus
the `--font-*` shorthands). `@theme {}` is a Tailwind construct: a browser does
not understand it and drops the whole block. The tokens only become real `:root`
custom properties after `@tailwindcss/postcss` runs.

That breaks the working rule above ("usable without any portal-side utility
classes"): a consumer that does not run the Tailwind compiler gets every
`--vx-typography-*` token undefined, so any rule using one
(`font-size: var(--vx-typography-heading-2-size)`) becomes invalid and falls
back to the inherited 16px. The DS already half-solves this - it re-declares the
`--font-*` and `--vx-font-*` tokens a second time inside a plain `:root {}` block
in `typography.css`, so font-family resolves without Tailwind. The
`--vx-typography-*` size/line-height/letter-spacing tokens were simply not given
the same `:root` mirror.

Request: in `typography.css`, mirror the `--vx-typography-*` tokens into the
existing `:root {}` block exactly as the `--font-*` tokens already are (or move
them out of `@theme` entirely), so the DS token layer is fully resolvable with
plain CSS. This keeps `@theme` for Tailwind consumers while making the package
framework-agnostic for the no-Tailwind portals.

Acceptance:

- A consumer with no Tailwind/PostCSS build sees every `--vx-typography-*` token
  defined under `:root` (verifiable: the served CSS contains no literal
  `@theme {` and `var(--vx-typography-heading-2-size)` resolves).
- No change in values or behavior for Tailwind consumers.

Interim (Umbra, 2026-06-10): all three portals added `@tailwindcss/postcss` +
`postcss.config.mjs` so `@theme` compiles to `:root`. This unblocks the portals
(brand wordmark, `.lead`, `.eyebrow`, hero CTA) but pulls in the Tailwind
compiler + preflight, which the no-Tailwind rule wanted to avoid. Once the DS
ships the `:root` mirror, Umbra can drop the PostCSS dependency.

## 7. ShellBrand: tag slot, no-link mode, brand typeface

Gaps found wiring the three header brands (2026-06-23, DS 1.3.2):

- **Tag slot.** The header brand needs a small light pill after the name
  (website/console show `vxture studio`, admin shows `Operation Platform`).
  `ShellBrand` has no tag prop, so Umbra renders the tag inside `label`
  (now `ReactNode`) reusing the `.vx-shell-user-badge` class - a pill borrowed
  from the account menu, semantically wrong. Add a first-class `tag?: ReactNode`
  with its own `.vx-shell-brand__tag` pill.
- **No-link mode.** `ShellBrand` always renders an `<a href>` (defaults to `/`).
  The admin brand must NOT navigate, so Umbra hand-rolls the `vx-shell-brand`
  markup as a non-anchor. Add `href?: null` (or `as="span"`) to render a
  non-interactive brand.
- **Brand typeface.** `.vx-shell-brand__label` does not use the brand font; every
  portal adds `.site-brand-name` (Funnel Display at heading-3) to the label.
  Expose a brand-wordmark type option (token-driven) so this is not per-portal.

Reference: `portals/{website,console}/.../site-header|shell.tsx`,
`portals/admin/app/ui/admin-shell.tsx`.

## 8. SiteFooter (marketing / portal bottom bar)

Gap: the legal footer bar (fixed content track, top hairline, copyright + a few
policy links) is per-portal CSS (`.site-footer` / `.site-footer-inner`) wrapping
`ShellLegalFooter`. Sibling to #1 SiteHeader: ship a `SiteFooter` that owns the
bar layout + the `--ruyin-shell-margin-x` content track, so no portal CSS is
needed to position or size it.

Reference: `portals/website/components/site-footer.tsx` + each portal's
`.site-footer*` rules.

## 9. Header action buttons as links keep their variant color

Gap: a DS `Button asChild` that renders an `<a>` loses its variant text color
because the global `a { color: inherit }` reset outranks the button's
zero-specificity color. Every portal re-asserts it with
`.site-actions .vx-btn--default/ghost/outline { color: ... }`. The DS button
should carry its color at a specificity that survives an anchor child.

## 10. Popover / ShellUserMenu content stacking shipped as real CSS

Gap: `PopoverContent` (and the ShellUserMenu popover) set their stacking via a
Tailwind `z-50` utility. The no-Tailwind portals do not emit that utility, so the
portaled menu has no z-index and is overlapped (the hero band / fixed header).
Umbra pins it with `.acct-menu { z-index: 1200 }`. Ship the popover z-index (and
any other component-critical utilities, e.g. `Badge` backgrounds) as real CSS in
the DS stylesheet so no-Tailwind consumers get them. Related to #5.

## 11. ShellUserMenu link with trailing value / control; tenant info panel

Gaps from the account + tenant panels:

- **Link trailing slot.** `ShellUserMenuLink` is label + icon + href only. The
  website account menu's workspace row needs a trailing value (`{org}.{workspace}`)
  and a switch glyph, so it stays a custom `.acct-row`. Add an optional
  `value` / `trailing` slot to the menu link (or a sibling "info row").
- **Tenant info panel.** The console header's Vultr-style tenant panel
  (`tenant-panel.tsx` + `.tenant-*`) is fully custom - identity header + a
  detail card (workspace / role / status / members / plan) + a settings link.
  Consider a DS `ShellTenantMenu` (mirror of `ShellUserMenu`) so this is not
  portal CSS.

Reference: `portals/website/components/user-dropdown.tsx`,
`portals/console/app/ui/tenant-panel.tsx`.

## Notes on tokens and theme

- `brands/ruyin.css` must expose the brand gradient token (`--vx-gradient-brand`)
  and route the brand font through the existing loader slot
  (`--vx-font-loader-brand`, already wired in Umbra `layout.tsx`).
- All requested components must honor light/dark and the density tokens.

## Until DS ships these

Umbra unblocks the non-dependent work first (usage audit, brand-theme wiring,
console VPN self-service using existing DS components, footer via
`ShellLegalFooter`). Header, admin shell, and the usage bar swap to the DS
components above as they land.
