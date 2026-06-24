"use client";

import { useEffect, useState } from "react";
import {
  ShellPreferencePanel,
  ShellUserMenu,
  useTheme,
  type Density,
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
} from "@umbra/shared/preferences";
import { useLocale } from "@umbra/shared/locale-provider";
import { useTranslations } from "@umbra/shared/i18n";
import type { VxtureUser } from "./types";

type RoleKey = "owner" | "manager" | "member";

/** Drop a leading country code so CN users see only the national number. */
function nationalPhone(phone: string): string {
  return phone
    .replace(/^\+?\s*86[\s-]*/, "")
    .replace(/^\+\d{1,3}[\s-]*/, "")
    .trim();
}

function primaryRole(user: VxtureUser): RoleKey {
  const set = new Set(
    [...(user.roles ?? []), user.role]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.toLowerCase()),
  );
  if (set.has("owner")) return "owner";
  if (set.has("manager") || set.has("admin")) return "manager";
  return "member";
}

/**
 * Console account menu - the same panel the public site header uses. The DS
 * ShellUserMenu supplies the avatar trigger, identity, role / tenant badges,
 * popover chrome and separators; the DS ShellPreferencePanel renders quick
 * settings (row labels omitted so each row is icon + control). Switch-user /
 * sign-out are native DS actions. The org / workspace context lives in the
 * dedicated tenant panel (see tenant-panel.tsx), so this menu stays focused on
 * the person + preferences. Preference changes persist to the cross-subdomain
 * cookies (see @umbra/shared/preferences).
 */
export function UserDropdown({ user }: { user: VxtureUser }) {
  const { locale, setLocale } = useLocale();
  const { mode, setMode, density, setDensity } = useTheme();
  const t = useTranslations("account");

  const [fontSize, setFontSize] = useState<ShellFontSizePreference>("default");
  useEffect(() => {
    setFontSize(getFontSize());
  }, []);

  const name =
    user.displayName || user.username || user.email || user.phone || t("fallbackName");
  const uniqueLine =
    user.email && name !== user.email
      ? user.email
      : user.phone
        ? nationalPhone(user.phone)
        : user.email || "";
  const verified = Boolean(user.emailVerified || user.phoneVerified);
  const role = primaryRole(user);
  const isOrg = user.userType === "organization" || Boolean(user.orgId);

  const settings = (
    /* Quick settings - DS preference panel, row labels omitted. */
      <ShellPreferencePanel
        className="acct-prefs"
        locale={locale as Locale}
        localeOptions={UMBRA_LOCALE_OPTIONS}
        theme={mode as ShellThemePreference}
        density={density}
        fontSize={fontSize}
        labels={{
          title: t("settings"),
          themeOptions: {
            system: t("themeSystem"),
            light: t("themeLight"),
            dark: t("themeDark"),
          },
          densityOptions: {
            compact: t("densityCompact"),
            default: t("densityDefault"),
            comfortable: t("densityComfortable"),
          },
          fontSizeOptions: {
            small: t("fontSmall"),
            default: t("fontDefault"),
            large: t("fontLarge"),
          },
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
    <ShellUserMenu
      user={{
        displayName: name,
        uniqueLine,
        avatarSrc: user.avatarUrl?.trim() || undefined,
        avatarAlt: name,
        // DS native verification tag, rendered next to the name.
        statusTag: { label: verified ? t("verified") : t("unverified"), verified },
        badges: [
          { key: "role", label: t(`roles.${role}`) },
          { key: "tenant", label: isOrg ? t("tenantOrg") : t("tenantPersonal") },
        ],
      }}
      openLabel={t("account")}
      online
      contentClassName="acct-menu"
      links={[
        {
          key: "profile",
          label: t("profile"),
          icon: "user",
          href: "/account",
        },
      ]}
      settings={settings}
      actions={[
        {
          key: "switch-user",
          label: t("switchUser"),
          icon: "user-switch",
          // Re-authenticate as someone else via the OIDC RP login entry.
          onClick: () => window.location.assign("/auth/login"),
        },
        {
          key: "sign-out",
          label: t("signout"),
          icon: "sign-out",
          onClick: () => window.location.assign("/auth/logout"),
        },
      ]}
    />
  );
}
