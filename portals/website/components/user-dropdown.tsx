"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Icon,
  NativeSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusBadge,
  useTheme,
  type Density,
  type IconName,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import {
  getFontSize,
  persistDensity,
  persistFontSize,
  persistTheme,
  type PrefFontSize,
} from "@umbra/shared/preferences";
import { useLocale } from "@/lib/locale-provider";
import { ruyinBrand } from "@/lib/brand";
import { logout, type SessionUser } from "@/lib/session";

type RoleKey = "owner" | "manager" | "member";
type ThemeMode = "system" | "light" | "dark";

const COPY = {
  "en-US": {
    account: "Account menu",
    verified: "Verified",
    unverified: "Unverified",
    profile: "Personal info",
    org: "Organization",
    workspace: "Workspace",
    language: "Language",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    density: "Density",
    densityCompact: "Compact",
    densityDefault: "Default",
    densityComfortable: "Comfortable",
    fontSize: "Font size",
    fontSmall: "Small",
    fontDefault: "Default",
    fontLarge: "Large",
    switchUser: "Switch account",
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
    org: "组织",
    workspace: "工作区",
    language: "语言",
    theme: "主题",
    themeSystem: "跟随系统",
    themeLight: "亮色",
    themeDark: "暗色",
    density: "密度",
    densityCompact: "紧凑",
    densityDefault: "默认",
    densityComfortable: "宽松",
    fontSize: "字号",
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

/** Drop a leading country code so Chinese users see only the national number:
 *  "+86 138 0000 0000" -> "138 0000 0000". China first, then a generic fallback
 *  for any other "+CC " prefix. Numbers with no country code pass through. */
function nationalPhone(phone: string): string {
  return phone
    .replace(/^\+?\s*86[\s-]*/, "")
    .replace(/^\+\d{1,3}[\s-]*/, "")
    .trim();
}

function primaryRole(user: SessionUser): RoleKey {
  const set = new Set(
    [...(user.roles ?? []), user.role]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.toLowerCase()),
  );
  if (set.has("owner")) return "owner";
  if (set.has("manager") || set.has("admin")) return "manager";
  return "member";
}

/** One avatar (trigger or profile): the session picture when present, otherwise
 *  a neutral user silhouette so the avatar always renders. */
function UserAvatar({ user, large }: { user: SessionUser; large?: boolean }) {
  return (
    <Avatar className={large ? "um-avatar um-avatar--lg" : "um-avatar"}>
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback className="um-avatar-fallback">
        <Icon name="user" size={large ? "lg" : "sm"} />
      </AvatarFallback>
    </Avatar>
  );
}

/** A settings row: aligned leading icon, a label, and a control pushed right.
 *  Shares the .um-row grid with the info and action rows so every icon and
 *  every label lines up across sections 3-5. */
function SettingRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="um-row">
      <span className="um-row-icon">
        <Icon name={icon} size="sm" />
      </span>
      <span className="um-row-main">
        <span className="um-row-label">{label}</span>
        <span className="um-row-control">{children}</span>
      </span>
    </div>
  );
}

/**
 * Signed-in account menu for the public site header. Built on DS primitives
 * (Popover + Avatar + StatusBadge + NativeSelect + Icon) so the layout is fully
 * controlled: an identity block with a right-aligned verification tag, two
 * badges (role + tenant type), a personal-info section (profile link + current
 * org/workspace), an inline preference section (language / theme / density /
 * font size), and the account actions. The popover is controlled and stays open
 * while preferences change so the effect is visible.
 */
export function UserDropdown({ user }: { user: SessionUser }) {
  const { locale, setLocale } = useLocale();
  const { mode, setMode, density, setDensity } = useTheme();
  const t = COPY[locale] ?? COPY["en-US"];

  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState<PrefFontSize>("default");

  useEffect(() => {
    setFontSize(getFontSize());
  }, []);

  const name =
    user.displayName || user.username || user.email || user.phone || t.fallbackName;
  const subLine =
    user.email && name !== user.email
      ? user.email
      : user.phone
        ? nationalPhone(user.phone)
        : user.email || "";
  const verified = Boolean(user.emailVerified || user.phoneVerified);
  const role = primaryRole(user);
  const isOrg = user.userType === "organization" || Boolean(user.orgId);

  const handleFontSize = (next: PrefFontSize) => {
    setFontSize(next);
    // Writes the parent-domain cookie, applies the root font-size, and broadcasts.
    persistFontSize(next);
  };

  const openProfile = () => {
    setOpen(false);
    window.open(`${ruyinBrand.consoleUrl}/account`, "_blank", "noopener,noreferrer");
  };

  const signOut = () => {
    setOpen(false);
    logout();
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button type="button" className="um-trigger" aria-label={t.account}>
          <UserAvatar user={user} />
          <span className="um-trigger-dot" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="um-menu">
        {/* 1. Profile: display name + identifier, verification tag pushed right */}
        <div className="um-profile">
          <UserAvatar user={user} large />
          <div className="um-identity">
            <p className="um-name">{name}</p>
            {subLine ? <p className="um-sub">{subLine}</p> : null}
          </div>
          <StatusBadge
            tone={verified ? "success" : "neutral"}
            className="um-verify"
          >
            <Icon name="check" size="xs" className="um-verify-icon" />
            {verified ? t.verified : t.unverified}
          </StatusBadge>
        </div>

        {/* 2. Badges: role type + tenant type */}
        <div className="um-badges">
          <StatusBadge tone="info">{t.roles[role]}</StatusBadge>
          <StatusBadge tone="neutral">
            {isOrg ? t.tenantOrg : t.tenantPersonal}
          </StatusBadge>
        </div>

        <div className="um-sep" />

        {/* 3. Personal info: profile link (new tab) + current org / workspace */}
        <div className="um-section">
          <button type="button" className="um-row um-row--action" onClick={openProfile}>
            <span className="um-row-icon">
              <Icon name="user" size="sm" />
            </span>
            <span className="um-row-main">
              <span className="um-row-label">{t.profile}</span>
              <Icon name="chevron-right" size="xs" className="um-row-ext" />
            </span>
          </button>

          {user.orgId ? (
            <div className="um-row">
              <span className="um-row-icon">
                <Icon name="building-library" size="sm" />
              </span>
              <span className="um-row-main">
                <span className="um-row-label">{t.org}</span>
                <span className="um-row-value">{user.orgId}</span>
              </span>
            </div>
          ) : null}

          {user.workspaceId ? (
            <div className="um-row">
              <span className="um-row-icon">
                <Icon name="squares-four" size="sm" />
              </span>
              <span className="um-row-main">
                <span className="um-row-label">{t.workspace}</span>
                <span className="um-row-value">{user.workspaceId}</span>
              </span>
            </div>
          ) : null}
        </div>

        <div className="um-sep" />

        {/* 4. Quick settings: icon + dropdown per preference */}
        <div className="um-section">
          <SettingRow icon="globe" label={t.language}>
            <NativeSelect
              className="um-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="en-US">English</option>
              <option value="zh-CN">简体中文</option>
            </NativeSelect>
          </SettingRow>

          <SettingRow icon="sun" label={t.theme}>
            <NativeSelect
              className="um-select"
              value={mode}
              onChange={(e) => {
                const next = e.target.value as ThemeMode;
                setMode(next);
                persistTheme(next);
              }}
            >
              <option value="system">{t.themeSystem}</option>
              <option value="light">{t.themeLight}</option>
              <option value="dark">{t.themeDark}</option>
            </NativeSelect>
          </SettingRow>

          <SettingRow icon="rows" label={t.density}>
            <NativeSelect
              className="um-select"
              value={density}
              onChange={(e) => {
                const next = e.target.value as Density;
                setDensity(next);
                persistDensity(next);
              }}
            >
              <option value="compact">{t.densityCompact}</option>
              <option value="default">{t.densityDefault}</option>
              <option value="comfortable">{t.densityComfortable}</option>
            </NativeSelect>
          </SettingRow>

          <SettingRow icon="text-indent" label={t.fontSize}>
            <NativeSelect
              className="um-select"
              value={fontSize}
              onChange={(e) => handleFontSize(e.target.value as PrefFontSize)}
            >
              <option value="small">{t.fontSmall}</option>
              <option value="default">{t.fontDefault}</option>
              <option value="large">{t.fontLarge}</option>
            </NativeSelect>
          </SettingRow>
        </div>

        <div className="um-sep" />

        {/* 5. Account actions */}
        <div className="um-section">
          <button type="button" className="um-row um-row--action" onClick={signOut}>
            <span className="um-row-icon">
              <Icon name="user-switch" size="sm" />
            </span>
            <span className="um-row-main">
              <span className="um-row-label">{t.switchUser}</span>
            </span>
          </button>
          <button
            type="button"
            className="um-row um-row--action um-row--danger"
            onClick={signOut}
          >
            <span className="um-row-icon">
              <Icon name="sign-out" size="sm" />
            </span>
            <span className="um-row-main">
              <span className="um-row-label">{t.signout}</span>
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
