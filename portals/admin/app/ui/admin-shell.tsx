"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  ShellFullscreenToggle,
  ShellLegalFooter,
  ShellLocaleSwitcher,
  ShellPreferencePanel,
  ShellThemeToggle,
  ShellUserMenu,
  useTheme,
  type Density,
  type IconName,
  type ShellFontSizePreference,
  type ShellThemePreference,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { UMBRA_LOCALE_OPTIONS } from "@umbra/shared/locales";
import {
  getFontSize,
  persistDensity,
  persistFontSize,
  persistTheme,
  type PrefTheme,
} from "@umbra/shared/preferences";
import { markSrc, ruyinBrand } from "../../lib/brand";
import { useLocale } from "@umbra/shared/locale-provider";
import { useTranslations } from "@umbra/shared/i18n";

/**
 * Admin chrome - the same header/footer treatment as the marketing site and the
 * tenant console, so the three portals read as one product. The right side
 * carries the grouped quick-controls pill [theme | language | fullscreen] and,
 * once authenticated, the account menu (avatar + preferences + sign out). The
 * signed-in header also carries the two business nav links (VPN access, password
 * security); the Marzban dashboard jump-link lives in the content title bar.
 */

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  external?: boolean;
}

/** Element the fullscreen toggle expands; the page root carries this id. */
const PAGE_FULLSCREEN_ID = "admin-page-root";


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
  const { theme, setTheme, mode, setMode, density, setDensity } = useTheme();
  const { locale, setLocale } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);

  const [fontSize, setFontSize] = useState<ShellFontSizePreference>("default");
  useEffect(() => {
    setFontSize(getFontSize());
  }, []);

  const m = useTranslations("shell");
  const nav: NavItem[] = [
    { id: "vpn", label: m("navVpn"), href: "/", icon: "shield-check" },
    { id: "pass", label: m("navPass"), href: "https://pas.ruyin.ai/admin", icon: "key", external: true },
  ];

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 50);
    update();
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);

  const accountSettings = (
    <ShellPreferencePanel
      className="acct-prefs"
      locale={locale as Locale}
      localeOptions={UMBRA_LOCALE_OPTIONS}
      theme={mode as ShellThemePreference}
      density={density}
      fontSize={fontSize}
      labels={{
        title: m("settings"),
        themeOptions: { system: m("themeSystem"), light: m("themeLight"), dark: m("themeDark") },
        densityOptions: {
          compact: m("densityCompact"),
          default: m("densityDefault"),
          comfortable: m("densityComfortable"),
        },
        fontSizeOptions: { small: m("fontSmall"), default: m("fontDefault"), large: m("fontLarge") },
      }}
      onLocaleChange={(next) => setLocale(next)}
      onThemeChange={(next) => {
        setMode(next);
        persistTheme(next);
      }}
      onDensityChange={(next: Density) => {
        setDensity(next);
        persistDensity(next);
      }}
      onFontSizeChange={(next) => {
        setFontSize(next);
        persistFontSize(next);
      }}
    />
  );

  return (
    <div id={PAGE_FULLSCREEN_ID} className="app-page">
      <header className={`site-header${isScrolled ? " is-scrolled" : ""}`}>
        <div className="site-header-inner">
          {/* Admin brand is NOT a link (no navigation). The DS ShellBrand always
              renders an <a>, so render the same DS `vx-shell-brand` markup as a
              non-anchor - DS semantic classes only, no custom CSS. The studio /
              platform tag reuses the DS pill class. */}
          <div className="vx-shell-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="vx-shell-brand__logo"
              src={markSrc(theme)}
              alt=""
              aria-hidden
              width={24}
              height={24}
              draggable={false}
            />
            <span className="vx-shell-brand__label">
              <span className="site-brand-lockup">
                <span className="site-brand-name">{ruyinBrand.productDomain}</span>
                <span className="site-brand-tag">Operation Platform</span>
              </span>
            </span>
          </div>
          {authed ? (
            <nav className="site-nav" aria-label={m("nav")}>
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
            {/* Grouped quick controls [theme | language | fullscreen], mirroring
                the website / console header action group. */}
            <div
              className="vx-shell-header__action-group"
              role="group"
              aria-label={m("display")}
            >
              <ShellThemeToggle
                currentTheme={theme}
                buttonLabel={m("theme")}
                className="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeClassName="vx-shell-icon-button--active"
                onThemeChange={(next) => {
                  setTheme(next);
                  persistTheme(next as PrefTheme);
                }}
              />
              <ShellLocaleSwitcher
                currentLocale={locale as Locale}
                options={UMBRA_LOCALE_OPTIONS}
                buttonLabel={m("language")}
                buttonClassName="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeButtonClassName="vx-shell-icon-button--active"
                onLocaleChange={(next) => setLocale(next)}
              />
              <ShellFullscreenToggle
                targetId={PAGE_FULLSCREEN_ID}
                enterLabel={m("fullscreenEnter")}
                exitLabel={m("fullscreenExit")}
                className="vx-shell-icon-button vx-shell-icon-button--toolbar"
                activeClassName="vx-shell-icon-button--active"
              />
            </div>

            {authed ? (
              <ShellUserMenu
                openLabel={m("account")}
                online
                contentClassName="acct-menu"
                user={{
                  displayName: "Administrator",
                  uniqueLine: "admin.ruyin.ai",
                  // No avatarSrc -> the DS ShellUserMenu renders its default
                  // AvatarSilhouette (the DS-native default avatar).
                  avatarAlt: "Administrator",
                  badges: [{ key: "role", label: "Admin" }],
                }}
                links={[
                  {
                    key: "profile",
                    label: m("profile"),
                    icon: "user",
                    href: "https://console.ruyin.ai/account",
                    newTab: true,
                  },
                ]}
                settings={accountSettings}
                actions={
                  onSignOut
                    ? [{ key: "logout", label: m("signout"), icon: "sign-out", onClick: onSignOut }]
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
        links={ruyinBrand.legalLinks
          .filter(([label]) =>
            /Terms of Service|Privacy Policy|Cookie Policy/.test(label),
          )
          .map(([label, href]) => ({ label, href }))}
      />
    </div>
  );
}
