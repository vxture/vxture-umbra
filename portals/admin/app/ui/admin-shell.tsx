"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  ShellBrand,
  ShellLegalFooter,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { persistTheme, type PrefTheme } from "@umbra/shared/preferences";
import { markSrc, ruyinBrand } from "../../lib/brand";
import { useLocale } from "@umbra/shared/locale-provider";

/**
 * Admin chrome - the same fixed glass-on-scroll header/footer treatment as the
 * marketing site and tenant console, so the three portals read as one product.
 * The brand wordmark is the admin platform name; the right side carries the
 * display tools (theme + language) and, once authenticated, the account menu
 * (avatar + sign out). The signed-in header also carries the two business nav
 * links (VPN access, password security); the Marzban dashboard jump-link lives
 * in the content title bar (see AdminApp).
 */

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  external?: boolean;
}

/** Header nav labels, localized. Account-menu / aria copy stays English. */
const SHELL_COPY: Record<Locale, { navVpn: string; navPass: string; nav: string }> = {
  "en-US": { navVpn: "VPN access", navPass: "Password security", nav: "Admin navigation" },
  "zh-CN": { navVpn: "科学上网", navPass: "密码安全", nav: "管理导航" },
};

export function AdminShell({
  children,
  active,
  authed = false,
  onSignOut,
}: {
  children: ReactNode;
  active?: string;
  authed?: boolean;
  onSignOut?: () => void | Promise<void>;
}) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);

  const m = SHELL_COPY[locale];
  const nav: NavItem[] = [
    { id: "vpn", label: m.navVpn, href: "/", icon: "shield-check" },
    { id: "pass", label: m.navPass, href: "https://pas.ruyin.ai/admin", icon: "key", external: true },
  ];

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
            label={ruyinBrand.productName}
            labelClassName="site-brand-name"
          />
          {authed ? (
            <nav className="site-nav" aria-label={m.nav}>
              {nav.map((item) => {
                const isActive = item.id === active;
                const className = `site-nav-item${isActive ? " is-active" : ""}`;
                const inner = (
                  <>
                    <Icon name={item.icon} size="sm" />
                    <span>{item.label}</span>
                  </>
                );
                return item.external ? (
                  <a
                    key={item.id}
                    className={className}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {inner}
                  </a>
                ) : (
                  <a
                    key={item.id}
                    className={className}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {inner}
                  </a>
                );
              })}
            </nav>
          ) : null}
          <div className="site-actions">
            <div className="site-tools" aria-label="Display controls">
              <ShellThemeToggle
                currentTheme={theme}
                buttonLabel="Switch theme"
                onThemeChange={(next) => {
                  setTheme(next);
                  persistTheme(next as PrefTheme);
                }}
              />
              <ShellLocaleSwitcher
                currentLocale={locale as Locale}
                buttonLabel="Language"
                onLocaleChange={(next) => setLocale(next)}
              />
            </div>
            {authed ? (
              <ShellUserMenu
                openLabel="Account menu"
                user={{
                  displayName: "Administrator",
                  uniqueLine: "admin.ruyin.ai",
                  avatarAlt: "Administrator",
                  avatarFallback: "AD",
                  badges: [{ key: "role", label: "Admin" }],
                }}
                actions={
                  onSignOut
                    ? [{ key: "logout", label: "Sign out", icon: "sign-out", onClick: onSignOut }]
                    : undefined
                }
              />
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-shell">
        {authed ? <div className="admin-content">{children}</div> : children}
      </main>

      <ShellLegalFooter
        className="site-footer"
        innerClassName="site-footer-inner"
        copyright={ruyinBrand.copyright}
        links={ruyinBrand.legalLinks.map(([label, href]) => ({ label, href }))}
      />
    </div>
  );
}
