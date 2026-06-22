"use client";

import { Avatar, AvatarFallback, AvatarImage, StatusBadge } from "@vxture/design-system";
import { useLocale } from "@umbra/shared/locale-provider";
import type { VxtureUser } from "./types";
import { DefaultAvatar } from "./default-avatar";

const COPY = {
  "en-US": {
    accountId: "Account ID",
    email: "Email",
    phone: "Phone",
    accountStatus: "Account status",
    org: "Organization",
    workspace: "Workspace",
    roles: "Roles",
    userType: "User type",
    verified: "verified",
    unverified: "unverified",
    none: "-",
    fallbackName: "Account",
  },
  "zh-CN": {
    accountId: "账号 ID",
    email: "邮箱",
    phone: "手机",
    accountStatus: "账号状态",
    org: "组织",
    workspace: "工作空间",
    roles: "角色",
    userType: "用户类型",
    verified: "已验证",
    unverified: "未验证",
    none: "-",
    fallbackName: "账号",
  },
} as const;

/**
 * Personal-info body (avatar + identity rows) from the OIDC session - no extra
 * Vxture call. Shows every claim the IdP provides (it exposes no name/username,
 * so email/phone are the identity); empty fields render as "-" so the full set
 * is visible. Rendered on the personal-info detail page (wrapped in a card).
 */
export function PersonalInfo({ user }: { user?: VxtureUser }) {
  const { locale } = useLocale();
  const t = COPY[locale] ?? COPY["en-US"];
  if (!user) return null;

  const name = user.displayName || user.username || user.email || user.phone || t.fallbackName;
  const dash = (v?: string) => (v && v.trim() ? v : t.none);
  const verifyTag = (verified?: boolean) => (
    <StatusBadge tone={verified ? "success" : "neutral"} dot>
      {verified ? t.verified : t.unverified}
    </StatusBadge>
  );

  return (
    <>
      <div className="info-head">
        <Avatar>
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <DefaultAvatar />
          </AvatarFallback>
        </Avatar>
        <div className="info-head-text">
          <strong>{name}</strong>
          {user.accountStatus ? (
            <StatusBadge tone={user.accountStatus === "active" ? "success" : "warning"}>
              {user.accountStatus}
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <div className="info-grid">
        <div className="info-row">
          <span className="info-label">{t.email}</span>
          <span className="info-value">
            {dash(user.email)}
            {user.email ? <span className="info-tag">{verifyTag(user.emailVerified)}</span> : null}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.phone}</span>
          <span className="info-value">
            {dash(user.phone)}
            {user.phone ? <span className="info-tag">{verifyTag(user.phoneVerified)}</span> : null}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.roles}</span>
          <span className="info-value">{user.roles && user.roles.length ? user.roles.join(", ") : t.none}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.accountStatus}</span>
          <span className="info-value">{dash(user.accountStatus)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.org}</span>
          <span className="info-value">{dash(user.orgId)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.workspace}</span>
          <span className="info-value">{dash(user.workspaceId)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.userType}</span>
          <span className="info-value">{dash(user.userType)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t.accountId}</span>
          <span className="info-value info-value--mono">{dash(user.id)}</span>
        </div>
      </div>
    </>
  );
}
