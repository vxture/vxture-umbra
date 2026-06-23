"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  ShellPreferencePanel,
  ShellUserMenu,
  useTheme,
  type Density,
  type IconName,
  type LocaleSelectOption,
  type ShellFontSizePreference,
  type ShellThemePreference,
} from "@vxture/design-system";
import { LOCALE_CONFIGS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import {
  getFontSize,
  persistDensity,
  persistFontSize,
  persistTheme,
} from "@umbra/shared/preferences";
import { useLocale } from "@umbra/shared/locale-provider";
import type { VxtureUser } from "./types";

type RoleKey = "owner" | "manager" | "member";

const COPY = {
  "en-US": {
    account: "Account menu",
    verified: "Verified",
    unverified: "Unverified",
    profile: "Personal info",
    settings: "Preferences",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    densityCompact: "Compact",
    densityDefault: "Default",
    densityComfortable: "Comfortable",
    fontSmall: "Small",
    fontDefault: "Default",
    fontLarge: "Large",
    switchUser: "Switch user",
    signout: "Sign out",
    fallbackName: "Account",
    roles: { owner: "Owner", manager: "Manager", member: "Member" },
    tenantOrg: "Organization",
    tenantPersonal: "Personal",
  },
  "zh-CN": {
    account: "账户菜单",
    verified: "已认证",
    unverified: "未认证",
    profile: "个人信息",
    settings: "偏好设置",
    themeSystem: "跟随系统",
    themeLight: "亮色",
    themeDark: "暗色",
    densityCompact: "紧凑",
    densityDefault: "默认",
    densityComfortable: "宽松",
    fontSmall: "小",
    fontDefault: "默认",
    fontLarge: "大",
    switchUser: "切换用户",
    signout: "退出登录",
    fallbackName: "账号",
    roles: { owner: "拥有者", manager: "管理员", member: "成员" },
    tenantOrg: "组织租户",
    tenantPersonal: "个人租户",
  },
} as const;

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

/** A link / info row reusing the DS action markup so it shares the icon column
 *  with the native switch / sign-out actions below the preference panel. */
function MenuRow({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon: IconName;
  label: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="vx-shell-user-menu__action acct-row"
      onClick={onClick}
    >
      <Icon name={icon} className="vx-shell-user-menu__action-icon" />
      <span className="acct-row__label">{label}</span>
      {trailing ? <span className="acct-row__trailing">{trailing}</span> : null}
    </button>
  );
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
  const t = COPY[locale] ?? COPY["en-US"];

  const [fontSize, setFontSize] = useState<ShellFontSizePreference>("default");
  useEffect(() => {
    setFontSize(getFontSize());
  }, []);

  const name =
    user.displayName || user.username || user.email || user.phone || t.fallbackName;
  const uniqueLine =
    user.email && name !== user.email
      ? user.email
      : user.phone
        ? nationalPhone(user.phone)
        : user.email || "";
  const verified = Boolean(user.emailVerified || user.phoneVerified);
  const role = primaryRole(user);
  const isOrg = user.userType === "organization" || Boolean(user.orgId);

  const localeOptions: LocaleSelectOption[] = SUPPORTED_LOCALES.map((loc) => ({
    locale: loc,
    nativeName: LOCALE_CONFIGS[loc]?.nativeName ?? loc,
  }));

  const settings = (
    <>
      {/* Personal info link (same-app navigation, console is the account home). */}
      <MenuRow
        icon="user"
        label={t.profile}
        trailing={<Icon name="chevron-right" size="sm" className="acct-row__go" />}
        onClick={() => window.location.assign("/account")}
      />

      <div className="acct-div" />

      {/* Quick settings - DS preference panel, row labels omitted. */}
      <ShellPreferencePanel
        className="acct-prefs"
        locale={locale}
        localeOptions={localeOptions}
        theme={mode as ShellThemePreference}
        density={density}
        fontSize={fontSize}
        labels={{
          title: t.settings,
          themeOptions: {
            system: t.themeSystem,
            light: t.themeLight,
            dark: t.themeDark,
          },
          densityOptions: {
            compact: t.densityCompact,
            default: t.densityDefault,
            comfortable: t.densityComfortable,
          },
          fontSizeOptions: {
            small: t.fontSmall,
            default: t.fontDefault,
            large: t.fontLarge,
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
    </>
  );

  return (
    <ShellUserMenu
      user={{
        displayName: name,
        uniqueLine,
        avatarSrc: user.avatarUrl?.trim() || undefined,
        avatarAlt: name,
        avatarFallback: Array.from(name.trim() || "U")[0]?.toLocaleUpperCase() ?? "U",
        meta: (
          <span className={`acct-verify${verified ? " acct-verify--ok" : ""}`}>
            <Icon name={verified ? "shield-check" : "warning"} size="xs" />
            {verified ? t.verified : t.unverified}
          </span>
        ),
        badges: [
          { key: "role", label: t.roles[role] },
          { key: "tenant", label: isOrg ? t.tenantOrg : t.tenantPersonal },
        ],
      }}
      openLabel={t.account}
      online
      contentClassName="acct-menu"
      settings={settings}
      actions={[
        {
          key: "switch-user",
          label: t.switchUser,
          icon: "user-switch",
          // Re-authenticate as someone else via the OIDC RP login entry.
          onClick: () => window.location.assign("/auth/login"),
        },
        {
          key: "sign-out",
          label: t.signout,
          icon: "sign-out",
          onClick: () => window.location.assign("/auth/logout"),
        },
      ]}
    />
  );
}
