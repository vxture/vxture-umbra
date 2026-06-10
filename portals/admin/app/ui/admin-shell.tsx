"use client";

import type { ReactNode } from "react";
import { Icon, ShellBrand, ShellThemeToggle, useTheme } from "@vxture/design-system";
import type { IconName } from "@vxture/design-system";

/**
 * Thin admin shell: sidebar + topbar composed from DS Shell* primitives. This
 * stands in for the DS AppShell (requested in docs/design/ds-extension-requests.md)
 * and swaps to it once that lands. External deep links (Marzban, Vaultwarden)
 * are intentionally left jumping out to the existing tools.
 */

const PRODUCT_DOMAIN = "ruyin.ai";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  external?: boolean;
}

const NAV: NavItem[] = [
  { id: "overview", label: "Overview", href: "/", icon: "squares-four" },
  { id: "invites", label: "Invites & Users", href: "/invites", icon: "users" },
  { id: "marzban", label: "VPN console", href: "/dashboard/", icon: "shield-check", external: true },
  { id: "vault", label: "Passwords", href: "https://pass.ruyin.ai/admin", icon: "key", external: true },
];

function symbolSrc(theme: string): string {
  return theme === "dark"
    ? "/assets/brand/ruyin-symbol-dark.png"
    : "/assets/brand/ruyin-symbol-light.png";
}

export function AdminShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <ShellBrand href="/" logoSrc={symbolSrc(theme)} logoAlt="" label={PRODUCT_DOMAIN} />
        <div className="admin-topbar-end">
          <span className="admin-env" aria-hidden="true">
            Admin
          </span>
          <ShellThemeToggle
            currentTheme={theme}
            buttonLabel="Switch theme"
            onThemeChange={(next) => setTheme(next)}
          />
        </div>
      </header>

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

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
