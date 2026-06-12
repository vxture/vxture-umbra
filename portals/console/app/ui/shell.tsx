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
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { useLocale } from "../locale-provider";
import { markSrc, ruyinBrand } from "../../lib/brand";
import type { VxtureUser } from "./types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function logout(): Promise<void> {
  try {
    await fetch("/api/account/logout", { method: "POST", credentials: "include" });
  } catch {
    // Ignore: redirect regardless - an expired/missing cookie already means
    // logged out, and the anonymous view will re-prompt SSO sign-in.
  }
  window.location.href = "/";
}

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

  const displayName = user?.displayName || user?.username || user?.email || "";

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
            {actions}
            {user ? (
              <ShellUserMenu
                openLabel="Account menu"
                user={{
                  displayName,
                  uniqueLine: user.email,
                  avatarSrc: user.avatarUrl,
                  avatarAlt: displayName,
                  avatarFallback: initials(displayName),
                  badges: user.role ? [{ key: "role", label: user.role }] : undefined,
                }}
                actions={[
                  {
                    key: "profile",
                    label: "Personal info",
                    icon: "user",
                    onClick: () => {
                      window.location.href = "/account";
                    },
                  },
                  { key: "logout", label: "Log out", icon: "sign-out", onClick: logout },
                ]}
              />
            ) : null}
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
