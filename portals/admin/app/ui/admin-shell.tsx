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
import { DEFAULT_LOCALE, LOCALE_CONSTANTS, SUPPORTED_LOCALES } from "@vxture/shared";
import { markSrc, ruyinBrand } from "../../lib/brand";

/**
 * Minimal locale state for the header language switcher. The admin app has a
 * single locale consumer, so it needs only persisted state wired to the shared
 * locale constants - not the full React context provider the console/website
 * carry for their many locale-aware components.
 */
function useAdminLocale() {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_CONSTANTS.STORAGE_KEY) as Locale | null;
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_CONSTANTS.STORAGE_KEY, next);
    document.documentElement.lang = next;
  };

  return { locale, setLocale };
}

/**
 * Admin chrome - the same fixed glass-on-scroll header/footer treatment as the
 * marketing site and tenant console, so the three portals read as one product.
 * The brand wordmark is the admin platform name; the right side carries the
 * display tools (theme + language) and, once authenticated, the account menu
 * (avatar + sign out). The signed-in body adds a left nav rail for the two
 * external jump-links (Marzban, Vaultwarden) plus the in-app invites surface.
 */

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  external?: boolean;
}

const NAV: NavItem[] = [
  { id: "invites", label: "Invites & Users", href: "/", icon: "users" },
  { id: "marzban", label: "VPN console", href: "/dashboard/", icon: "shield-check", external: true },
  { id: "vault", label: "Passwords", href: "https://pass.ruyin.ai/admin", icon: "key", external: true },
];

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
  const { locale, setLocale } = useAdminLocale();
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
            label={ruyinBrand.productName}
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
        {authed ? (
          <div className="admin-body">
            <aside className="admin-sidebar" aria-label="Admin navigation">
              <nav className="admin-nav">
                {NAV.map((item) => {
                  const isActive = item.id === active;
                  const className = `admin-nav-item${isActive ? " is-active" : ""}`;
                  const inner = (
                    <>
                      <Icon name={item.icon} size="md" />
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
            </aside>

            <div className="admin-content">{children}</div>
          </div>
        ) : (
          children
        )}
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
