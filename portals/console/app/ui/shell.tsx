"use client";

import type { ReactNode } from "react";
import {
  MetricCard,
  PageHeader as DsPageHeader,
  ShellBrand,
  ShellLegalFooter,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { useLocale } from "../locale-provider";

/** Product wordmark (shared across Ruyin portals). */
const PRODUCT_DOMAIN = "ruyin.ai";
const COPYRIGHT = "(c) 2026 vxture studio, inc. All rights reserved.";

function symbolSrc(theme: string): string {
  return theme === "dark"
    ? "/assets/brand/ruyin-symbol-dark.png"
    : "/assets/brand/ruyin-symbol-light.png";
}

export function Shell({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();

  return (
    <div className="app-shell">
      <header className="topbar">
        <ShellBrand
          href="/"
          logoSrc={symbolSrc(theme)}
          logoAlt=""
          label={PRODUCT_DOMAIN}
        />
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
          {actions}
        </div>
      </header>

      <main className="app-main">{children}</main>

      <ShellLegalFooter copyright={COPYRIGHT} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <DsPageHeader title={title} description={description} actions={actions} />;
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <MetricCard label={label} value={value} />;
}
