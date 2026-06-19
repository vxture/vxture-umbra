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
  Icon,
  StatusBadge,
} from "@vxture/design-system";
import { useLocale } from "@/lib/locale-provider";
import { ruyinBrand } from "@/lib/brand";
import { logout, type SessionUser } from "@/lib/session";
import { DefaultAvatar } from "@/components/default-avatar";

const COPY = {
  "en-US": {
    account: "Account menu",
    email: "Email",
    phone: "Phone",
    verified: "Verified",
    unverified: "Unverified",
    status: "Status",
    type: "Type",
    roles: "Roles",
    org: "Organization",
    workspace: "Workspace",
    accountId: "Account ID",
    profile: "Personal info",
    signout: "Sign out",
    fallbackName: "Account",
    member: "member",
  },
  "zh-CN": {
    account: "账户菜单",
    email: "邮箱",
    phone: "手机",
    verified: "已验证",
    unverified: "未验证",
    status: "状态",
    type: "类型",
    roles: "角色",
    org: "组织",
    workspace: "工作区",
    accountId: "账户 ID",
    profile: "个人信息",
    signout: "退出登录",
    fallbackName: "账号",
    member: "成员",
  },
} as const;

/**
 * Signed-in account menu for the public site header. The IdP exposes no
 * name/username/picture claim, so email + phone are the identifiers; this panel
 * lists every populated identity claim the session carries (email/phone with
 * verification, account status, user type, roles, org, workspace, account id),
 * then the personal-info link and a reliable local logout. Theme + language stay
 * as the header's standalone tools (not duplicated here).
 */
export function UserDropdown({ user }: { user: SessionUser }) {
  const { locale } = useLocale();
  const t = COPY[locale] ?? COPY["en-US"];
  const name = user.displayName || user.username || user.email || user.phone || t.fallbackName;
  const subLine = user.email && name !== user.email ? user.email : user.phone || "";
  const roleText = user.roles && user.roles.length ? user.roles.join(", ") : user.role || t.member;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="acct-trigger" aria-label={t.account}>
        <Avatar className="acct-avatar">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <DefaultAvatar />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="acct-menu">
        <DropdownMenuLabel className="acct-identity">
          <span className="acct-identity-name">{name}</span>
          {subLine ? <span className="acct-identity-line">{subLine}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {user.email ? (
          <div className="acct-row">
            <span className="acct-label">{t.email}</span>
            <span className="acct-value">
              {user.email}
              <StatusBadge tone={user.emailVerified ? "success" : "neutral"} dot>
                {user.emailVerified ? t.verified : t.unverified}
              </StatusBadge>
            </span>
          </div>
        ) : null}

        {user.phone ? (
          <div className="acct-row">
            <span className="acct-label">{t.phone}</span>
            <span className="acct-value">
              {user.phone}
              <StatusBadge tone={user.phoneVerified ? "success" : "neutral"} dot>
                {user.phoneVerified ? t.verified : t.unverified}
              </StatusBadge>
            </span>
          </div>
        ) : null}

        {user.accountStatus ? (
          <div className="acct-row">
            <span className="acct-label">{t.status}</span>
            <span className="acct-value">
              <StatusBadge tone={user.accountStatus === "active" ? "success" : "warning"}>
                {user.accountStatus}
              </StatusBadge>
            </span>
          </div>
        ) : null}

        {user.userType ? (
          <div className="acct-row">
            <span className="acct-label">{t.type}</span>
            <span className="acct-value">{user.userType}</span>
          </div>
        ) : null}

        <div className="acct-row">
          <span className="acct-label">{t.roles}</span>
          <span className="acct-value">
            <StatusBadge tone="info">{roleText}</StatusBadge>
          </span>
        </div>

        {user.orgId ? (
          <div className="acct-row">
            <span className="acct-label">{t.org}</span>
            <span className="acct-value acct-value--mono">{user.orgId}</span>
          </div>
        ) : null}

        {user.workspaceId ? (
          <div className="acct-row">
            <span className="acct-label">{t.workspace}</span>
            <span className="acct-value acct-value--mono">{user.workspaceId}</span>
          </div>
        ) : null}

        {user.id ? (
          <div className="acct-row">
            <span className="acct-label">{t.accountId}</span>
            <span className="acct-value acct-value--mono">{user.id}</span>
          </div>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => window.location.assign(`${ruyinBrand.consoleUrl}/account`)}>
          <Icon name="user" size="sm" />
          {t.profile}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem className="acct-signout" onSelect={() => logout()}>
          <Icon name="sign-out" size="sm" />
          {t.signout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
