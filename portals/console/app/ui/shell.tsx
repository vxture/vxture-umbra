"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  MetricCard,
  PageHeader as DsPageHeader,
  ShellBrand,
  ShellLegalFooter,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { useLocale } from "@umbra/shared/locale-provider";
import { markSrc, ruyinBrand } from "../../lib/brand";
import { OrgDropdown } from "./org-dropdown";
import { UserDropdown } from "./user-dropdown";
import type { VxtureUser } from "./types";

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
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 50);
    update();
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="app-page">
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
            {user ? (
              // Signed-in: org/workspace + user dropdowns (theme/locale live
              // inside the user dropdown).
              <div className="header-modules">
                <OrgDropdown user={user} />
                <UserDropdown user={user} />
              </div>
            ) : (
              // Anonymous / admin views: standalone display controls.
              <div className="site-tools" aria-label="Display controls">
                <ShellThemeToggle
                  currentTheme={theme}
                  buttonLabel="Switch theme"
                  onThemeChange={(next) => setTheme(next)}
                />
                <ShellLocaleSwitcher
                  currentLocale={locale as Locale}
                  buttonLabel="Language"
                  onLocaleChange={(next) => setLocale(next)}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-shell">{children}</main>

      <ShellLegalFooter
        className="site-footer"
        innerClassName="site-footer-inner"
        copyright={ruyinBrand.copyright}
        links={ruyinBrand.legalLinks.map(([label, href]) => ({ label, href }))}
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
