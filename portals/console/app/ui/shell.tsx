"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  MetricCard,
  PageHeader as DsPageHeader,
  ShellBrand,
  ShellFullscreenToggle,
  ShellLegalFooter,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { persistTheme, type PrefTheme } from "@umbra/shared/preferences";
import { useLocale } from "@umbra/shared/locale-provider";
import { markSrc, ruyinBrand } from "../../lib/brand";
import { TenantPanel } from "./tenant-panel";
import { UserDropdown } from "./user-dropdown";
import type { VxtureUser } from "./types";

/** Element the fullscreen toggle expands; the page root carries this id. */
const PAGE_FULLSCREEN_ID = "console-page-root";

const TOOL_COPY = {
  "en-US": {
    display: "Display controls",
    theme: "Switch theme",
    language: "Language",
    fullscreenEnter: "Enter fullscreen",
    fullscreenExit: "Exit fullscreen",
  },
  "zh-CN": {
    display: "显示设置",
    theme: "切换主题",
    language: "切换语言",
    fullscreenEnter: "进入全屏",
    fullscreenExit: "退出全屏",
  },
} as const;

/**
 * Console chrome - the same header/footer treatment as the marketing site
 * (fixed glass-on-scroll bar, brand wordmark, content-aligned legal footer).
 * Auth-aware: pass `user` (from the session) to render the DS user menu;
 * omit it (anonymous / admin views) and the right side shows only the
 * theme + locale tools.
 */
export function Shell({
  children,
  actions,
  user,
}: {
  children: ReactNode;
  actions?: ReactNode;
  user?: VxtureUser;
}) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const tt = TOOL_COPY[locale] ?? TOOL_COPY["en-US"];
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 50);
    update();
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div id={PAGE_FULLSCREEN_ID} className="app-page">
      <header className={`site-header${isScrolled ? " is-scrolled" : ""}`}>
        <div className="site-header-inner">
          <ShellBrand
            href="/"
            logoSrc={markSrc(theme)}
            logoAlt=""
            label={ruyinBrand.productDomain}
            labelClassName="site-brand-name"
          />
          <div className="site-actions">
            {actions}

            {/* Grouped quick controls [theme | language | fullscreen], mirroring
                the website / vxture-console header action group. */}
            <div
              className="vx-shell-header__action-group"
              role="group"
              aria-label={tt.display}
            >
              <ShellThemeToggle
                currentTheme={theme}
                buttonLabel={tt.theme}
                className="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeClassName="vx-shell-icon-button--active"
                onThemeChange={(next) => {
                  setTheme(next);
                  persistTheme(next as PrefTheme);
                }}
              />
              <ShellLocaleSwitcher
                currentLocale={locale as Locale}
                buttonLabel={tt.language}
                buttonClassName="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeButtonClassName="vx-shell-icon-button--active"
                onLocaleChange={(next) => setLocale(next)}
              />
              <ShellFullscreenToggle
                targetId={PAGE_FULLSCREEN_ID}
                enterLabel={tt.fullscreenEnter}
                exitLabel={tt.fullscreenExit}
                className="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeClassName="vx-shell-icon-button--active"
              />
            </div>

            {/* Signed-in: tenant panel + account menu. */}
            {user ? (
              <div className="header-modules">
                <TenantPanel user={user} />
                <UserDropdown user={user} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-shell">{children}</main>

      <ShellLegalFooter
        className="site-footer"
        innerClassName="site-footer-inner"
        copyright={ruyinBrand.copyright}
        links={ruyinBrand.legalLinks
          .filter(([label]) =>
            /Terms of Service|Privacy Policy|Cookie Policy/.test(label),
          )
          .map(([label, href]) => ({ label, href }))}
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description: string;
  icon?: IconName;
  actions?: ReactNode;
}) {
  return <DsPageHeader icon={icon} title={title} description={description} actions={actions} />;
}

/**
 * Left-aligned section heading: a 24px brand-primary icon at the far left, a
 * bold brand-primary title, and a muted description below. Used for console
 * content sections; the DS PageHeader's title sizing relies on shell-scoped
 * tokens this portal's website-style chrome does not provide.
 */
export function SectionHeading({
  icon,
  title,
  description,
  badge,
  actions,
}: {
  icon: IconName;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading-row">
        <Icon name={icon} size={24} className="section-heading-icon" />
        <h2 className="section-heading-title">{title}</h2>
        {badge ? <span className="section-heading-badge">{badge}</span> : null}
        {actions ? <div className="section-heading-actions">{actions}</div> : null}
      </div>
      {description ? <p className="section-heading-desc">{description}</p> : null}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <MetricCard label={label} value={value} />;
}
