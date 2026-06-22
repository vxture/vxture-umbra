"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  Icon,
  StatusBadge,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { useLocale } from "@umbra/shared/locale-provider";
import type { VxtureUser } from "./types";
import { DefaultAvatar } from "./default-avatar";

const COPY = {
  "en-US": {
    account: "Account menu",
    email: "Email",
    phone: "Phone",
    verified: "verified",
    unverified: "unverified",
    language: "Language",
    theme: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
    profile: "Personal info",
    signout: "Sign out",
    fallbackName: "Account",
  },
  "zh-CN": {
    account: "账户菜单",
    email: "邮箱",
    phone: "手机",
    verified: "已验证",
    unverified: "未验证",
    language: "语言",
    theme: "主题",
    system: "跟随系统",
    light: "亮色",
    dark: "暗色",
    profile: "个人信息",
    signout: "退出登录",
    fallbackName: "账号",
  },
} as const;

const LOCALE_LABELS: Record<string, string> = { "en-US": "English", "zh-CN": "简体中文" };

/**
 * User module (middle header dropdown). All real data: identity (no IdP name
 * claim, so email/phone are the identifiers), language + theme preferences, and
 * local logout. "Switch account" from the design is omitted (no multi-account
 * backend); logout is a plain GET navigation (reliable from the popover).
 */
export function UserDropdown({ user }: { user: VxtureUser }) {
  const { locale, setLocale } = useLocale();
  const { mode, setMode } = useTheme();
  const t = COPY[locale] ?? COPY["en-US"];
  const name = user.displayName || user.username || user.email || user.phone || t.fallbackName;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="hdr-trigger" aria-label={t.account}>
        <Avatar className="hdr-avatar">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <DefaultAvatar />
          </AvatarFallback>
        </Avatar>
        <span className="hdr-trigger-text">{name}</span>
        <Icon name="arrow-down" size="sm" className="hdr-trigger-caret" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="hdr-menu">
        <DropdownMenuLabel className="hdr-identity">
          <span className="hdr-identity-name">{name}</span>
          {user.email ? <span className="hdr-identity-line">{user.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {user.email ? (
          <div className="hdr-info-row">
            <span className="hdr-info-label">{t.email}</span>
            <span className="hdr-info-value">{user.email}</span>
            <StatusBadge tone={user.emailVerified ? "success" : "neutral"} dot>
              {user.emailVerified ? t.verified : t.unverified}
            </StatusBadge>
          </div>
        ) : null}
        {user.phone ? (
          <div className="hdr-info-row">
            <span className="hdr-info-label">{t.phone}</span>
            <span className="hdr-info-value">{user.phone}</span>
            <StatusBadge tone={user.phoneVerified ? "success" : "neutral"} dot>
              {user.phoneVerified ? t.verified : t.unverified}
            </StatusBadge>
          </div>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => window.location.assign("/account")}>
          <Icon name="user" size="sm" />
          {t.profile}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="hdr-group-title">{t.language}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          {(["en-US", "zh-CN"] as Locale[]).map((loc) => (
            <DropdownMenuRadioItem key={loc} value={loc}>
              {LOCALE_LABELS[loc] ?? loc}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="hdr-group-title">{t.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as "light" | "dark" | "system")}>
          <DropdownMenuRadioItem value="system">{t.system}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t.dark}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="hdr-signout"
          onSelect={() => {
            // Local logout via a plain GET navigation (reliable from the popover).
            window.location.assign("/auth/logout");
          }}
        >
          <Icon name="sign-out" size="sm" />
          {t.signout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
