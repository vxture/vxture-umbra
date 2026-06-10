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
