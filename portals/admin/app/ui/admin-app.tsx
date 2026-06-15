"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  Icon,
  Input,
  MetricGrid,
  Skeleton,
  StatusBadge,
  useToast,
} from "@vxture/design-system";
import type { IconName, MetricGridItem, StatusBadgeTone } from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { AdminShell } from "./admin-shell";
import { ruyinBrand } from "../../lib/brand";
import { useLocale } from "../locale-provider";
import type { AdminInvitesPayload, AdminUserRow } from "./types";

/**
 * Localized copy for the signed-in invites surface. The English side must keep
 * the literal phrases "Invite link", "Subscription URL", "Copy link", and
 * "Copy code" - a deploy contract check (06-check-deploy-contracts.py) asserts
 * they are present in this file. The pre-auth login screen stays English.
 */
type AdminCopy = {
  title: string;
  description: string;
  vpnConsole: string;
  metrics: { users: string; bound: string; invitePending: string; pendingBinding: string };
  binding: Record<AdminUserRow["bindingState"], string>;
  used: string;
  total: string;
  expire: string;
  lastOnline: string;
  inviteCode: string;
  subscriptionUrl: string;
  inviteLink: string;
  copyUrl: string;
  reset: string;
  copyLink: string;
  copyCode: string;
  revoke: string;
  generate: string;
  emptyTitle: string;
  emptyDesc: string;
  unavailableTitle: string;
  unavailableDesc: string;
  retry: string;
  toastInviteGenerated: string;
  toastInviteDesc: (user: string, url: string) => string;
  toastReset: (user: string) => string;
  toastRevoked: string;
  toastSubCopied: string;
  toastLinkCopied: string;
  toastCodeCopied: string;
};

const MESSAGES: Record<Locale, AdminCopy> = {
  "en-US": {
    title: "Invites & users",
    description:
      "Issue one-time VPN invites for Marzban users and manage bound subscriptions.",
    vpnConsole: "VPN console",
    metrics: {
      users: "Users",
      bound: "Bound",
      invitePending: "Invite pending",
      pendingBinding: "Pending binding",
    },
    binding: { bound: "Bound", invite_pending: "Invite pending", pending_binding: "Pending binding" },
    used: "Used",
    total: "Total",
    expire: "Expire",
    lastOnline: "Last online",
    inviteCode: "Invite code",
    subscriptionUrl: "Subscription URL",
    inviteLink: "Invite link",
    copyUrl: "Copy URL",
    reset: "Reset",
    copyLink: "Copy link",
    copyCode: "Copy code",
    revoke: "Revoke",
    generate: "Generate invite",
    emptyTitle: "No Marzban users",
    emptyDesc: "Create users in the Marzban dashboard first, then generate invites here.",
    unavailableTitle: "Invite console unavailable",
    unavailableDesc: "Marzban could not be reached. Try again after services recover.",
    retry: "Retry",
    toastInviteGenerated: "Invite generated.",
    toastInviteDesc: (user, url) => `Invite link for ${user}: ${url}`,
    toastReset: (user) => `Subscription URL reset requested for ${user}.`,
    toastRevoked: "Invite revoked.",
    toastSubCopied: "Subscription URL copied.",
    toastLinkCopied: "Invite link copied.",
    toastCodeCopied: "Invite code copied.",
  },
  "zh-CN": {
    title: "邀请与用户",
    description: "为 Marzban 用户签发一次性 VPN 邀请，并管理已绑定的订阅。",
    vpnConsole: "VPN 控制台",
    metrics: {
      users: "用户",
      bound: "已绑定",
      invitePending: "待领取邀请",
      pendingBinding: "待绑定",
    },
    binding: { bound: "已绑定", invite_pending: "待领取邀请", pending_binding: "待绑定" },
    used: "已用",
    total: "总量",
    expire: "到期",
    lastOnline: "最近在线",
    inviteCode: "邀请码",
    subscriptionUrl: "订阅地址",
    inviteLink: "邀请链接",
    copyUrl: "复制地址",
    reset: "重置",
    copyLink: "复制链接",
    copyCode: "复制邀请码",
    revoke: "撤销",
    generate: "生成邀请",
    emptyTitle: "暂无 Marzban 用户",
    emptyDesc: "请先在 Marzban 控制台创建用户，然后在此生成邀请。",
    unavailableTitle: "邀请控制台不可用",
    unavailableDesc: "无法连接 Marzban，请在服务恢复后重试。",
    retry: "重试",
    toastInviteGenerated: "邀请已生成。",
    toastInviteDesc: (user, url) => `${user} 的邀请链接：${url}`,
    toastReset: (user) => `已请求重置 ${user} 的订阅地址。`,
    toastRevoked: "邀请已撤销。",
    toastSubCopied: "订阅地址已复制。",
    toastLinkCopied: "邀请链接已复制。",
    toastCodeCopied: "邀请码已复制。",
  },
};

/**
 * Content-area section heading. The DS PageHeader sizes its title from
 * shell-scoped tokens (--vx-platform-page-title-size) that this portal's
 * website-style chrome does not provide, so the title would collapse to a bare
 * default. This mirrors the console's SectionHeading, built on root-level DS
 * typography/color tokens.
 */
function SectionHeading({
  icon,
  title,
  description,
  badge,
  actions,
}: {
  icon: IconName;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading-row">
        <Icon name={icon} size={24} className="section-heading-icon" />
        <h1 className="section-heading-title">{title}</h1>
        {badge ? <span className="section-heading-badge">{badge}</span> : null}
        {actions ? <div className="section-heading-actions">{actions}</div> : null}
      </div>
      {description ? <p className="section-heading-desc">{description}</p> : null}
    </div>
  );
}

const LOGIN_FEATURES: { icon: IconName; label: string }[] = [
  { icon: "users", label: "Issue invites and bind subscriber accounts" },
  { icon: "shield-check", label: "Manage Marzban VPN subscriptions" },
  { icon: "key", label: "Reach the shared password vault" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw Object.assign(new Error("Request failed"), { payload, response });
  }
  return payload;
}

const EMPTY_SUMMARY = { users: 0, bound: 0, invitePending: 0, pendingBinding: 0 };

const BINDING_TONE: Record<AdminUserRow["bindingState"], StatusBadgeTone> = {
  bound: "success",
  invite_pending: "warning",
  pending_binding: "neutral",
};

/** Tone for the upstream Marzban account status (active / limited / expired ...). */
function statusTone(status: string): StatusBadgeTone {
  const value = status.toLowerCase();
  if (value === "active") return "success";
  if (value === "limited" || value === "expired") return "warning";
  if (value === "disabled") return "danger";
  return "neutral";
}

/**
 * Admin management surface (admin.ruyin.ai). Built-in credential login, then the
 * vpn-invites block: every subscription link, invite-code issuance, and bound
 * accounts. The header carries the business nav (VPN access, password security);
 * the Marzban dashboard jump-link sits in the title bar (see AdminShell).
 */
export function AdminApp() {
  const [data, setData] = useState<AdminInvitesPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const { locale } = useLocale();
  const m = MESSAGES[locale];

  async function refresh() {
    setData(await api<AdminInvitesPayload>("/api/account/admin/invites"));
  }

  useEffect(() => {
    refresh().catch((error) => {
      const status =
        error?.payload?.status === "admin_login_required"
          ? "admin_login_required"
          : "marzban_unavailable";
      setData({ status, users: [], summary: EMPTY_SUMMARY });
    });
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("login");
    try {
      await api("/api/account/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setPassword("");
      await refresh();
    } catch {
      toast({ tone: "error", title: "Invalid admin credentials." });
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await api("/api/account/admin/logout", { method: "POST", body: "{}" });
      setData({ status: "admin_login_required", users: [], summary: EMPTY_SUMMARY });
    } finally {
      setBusy("");
    }
  }

  async function generate(user: string) {
    setBusy(user);
    try {
      const payload = await api<{ inviteCode?: string; inviteUrl?: string }>(
        "/api/account/admin/invites",
        { method: "POST", body: JSON.stringify({ username: user }) },
      );
      toast({
        tone: "success",
        title: m.toastInviteGenerated,
        description: payload.inviteUrl ? m.toastInviteDesc(user, payload.inviteUrl) : undefined,
      });
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function reset(user: string) {
    setBusy(user);
    try {
      await api("/api/account/admin/reset-subscription", {
        method: "POST",
        body: JSON.stringify({ username: user }),
      });
      toast({ tone: "success", title: m.toastReset(user) });
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function revoke(id: number | null) {
    if (!id) return;
    setBusy(String(id));
    try {
      await api("/api/account/admin/revoke", { method: "POST", body: JSON.stringify({ id }) });
      toast({ tone: "success", title: m.toastRevoked });
      await refresh();
    } finally {
      setBusy("");
    }
  }

  function copy(value: string, message: string) {
    navigator.clipboard.writeText(value);
    toast({ tone: "success", title: message });
  }

  if (!data) {
    return (
      <AdminShell>
        <section className="admin-login">
          <div className="admin-login-card">
            <div className="admin-login-main">
              <Skeleton variant="line" lines={4} />
            </div>
          </div>
        </section>
      </AdminShell>
    );
  }

  if (data.status === "admin_login_required") {
    return (
      <AdminShell>
        <section className="admin-login">
          <div className="admin-login-card">
            <aside className="admin-login-aside">
              <div className="admin-login-aside-text">
                <p className="admin-login-eyebrow">Management console</p>
                <h2 className="admin-login-aside-title">{ruyinBrand.productName}</h2>
                <p className="admin-login-aside-lead">
                  One secure place to operate invites, VPN subscriptions, and credentials.
                </p>
              </div>
              <ul className="admin-login-features">
                {LOGIN_FEATURES.map((feature) => (
                  <li key={feature.label}>
                    <Icon name={feature.icon} size="sm" />
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="admin-login-main">
              <div className="admin-login-head">
                <p className="admin-login-eyebrow">Admin access</p>
                <h1 className="admin-login-title">Sign in</h1>
                <p className="admin-login-sub">
                  Use your Ruyin management credential to continue.
                </p>
              </div>
              <form className="form" onSubmit={login}>
                <label className="field">
                  Admin username
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Admin password
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                <Button type="submit" disabled={busy === "login"}>
                  <Icon name="arrow-right" size="sm" />
                  Sign in
                </Button>
              </form>
            </div>
          </div>
        </section>
      </AdminShell>
    );
  }

  if (data.status !== "ok") {
    return (
      <AdminShell active="vpn" authed onSignOut={logout}>
        <div className="page-stack">
          <SectionHeading
            icon="warning"
            title={m.unavailableTitle}
            description={m.unavailableDesc}
          />
          <div className="actions">
            <Button variant="secondary" onClick={() => refresh().catch(() => undefined)}>
              <Icon name="clock-counter-clockwise" size="sm" />
              {m.retry}
            </Button>
          </div>
        </div>
      </AdminShell>
    );
  }

  const metrics: MetricGridItem[] = [
    { label: m.metrics.users, value: data.summary.users },
    { label: m.metrics.bound, value: data.summary.bound, tone: "success" },
    { label: m.metrics.invitePending, value: data.summary.invitePending, tone: "warning" },
    { label: m.metrics.pendingBinding, value: data.summary.pendingBinding },
  ];

  function renderActions(row: AdminUserRow): ReactNode {
    if (row.subscriptionUrl) {
      return (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(row.subscriptionUrl || "", m.toastSubCopied)}
          >
            <Icon name="copy" size="sm" />
            {m.copyUrl}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy === row.username}
            onClick={() => reset(row.username)}
          >
            <Icon name="clock-counter-clockwise" size="sm" />
            {m.reset}
          </Button>
        </>
      );
    }
    if (row.inviteCode) {
      return (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(row.inviteUrl || row.inviteCode || "", m.toastLinkCopied)}
          >
            <Icon name="copy" size="sm" />
            {m.copyLink}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(row.inviteCode || "", m.toastCodeCopied)}
          >
            <Icon name="copy" size="sm" />
            {m.copyCode}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy === String(row.inviteId)}
            onClick={() => revoke(row.inviteId)}
          >
            <Icon name="trash" size="sm" />
            {m.revoke}
          </Button>
        </>
      );
    }
    return (
      <Button size="sm" disabled={busy === row.username} onClick={() => generate(row.username)}>
        <Icon name="plus" size="sm" />
        {m.generate}
      </Button>
    );
  }

  return (
    <AdminShell active="vpn" authed onSignOut={logout}>
      <div className="page-stack">
        <SectionHeading
          icon="users"
          title={m.title}
          description={m.description}
          actions={
            <Button asChild variant="secondary" size="sm">
              <a href="/dashboard/" target="_blank" rel="noopener noreferrer">
                <Icon name="shield-check" size="sm" />
                {m.vpnConsole}
              </a>
            </Button>
          }
        />
        <div className="admin-metrics">
          <MetricGrid items={metrics} />
        </div>

        {data.users.length === 0 ? (
          <EmptyState title={m.emptyTitle} description={m.emptyDesc} />
        ) : (
          <ul className="invite-list">
            {data.users.map((row) => {
              // Invite code shows in its own chip below, so the URL box carries
              // only the subscription URL (bound) or the invite URL (unbound).
              const link = row.subscriptionUrl || row.inviteUrl;
              const linkLabel = row.subscriptionUrl
                ? m.subscriptionUrl
                : row.inviteUrl
                  ? m.inviteLink
                  : null;
              return (
                <li key={row.username} className="invite-card">
                  <div className="invite-card-head">
                    <span className="invite-code">{row.username}</span>
                    <StatusBadge tone={statusTone(row.status)} dot>
                      {row.status}
                    </StatusBadge>
                    <StatusBadge tone={BINDING_TONE[row.bindingState]}>
                      {m.binding[row.bindingState]}
                    </StatusBadge>
                    {row.bindingState === "bound" && row.displayName ? (
                      <span className="invite-name">{row.displayName}</span>
                    ) : null}
                    <div className="invite-card-actions">{renderActions(row)}</div>
                  </div>

                  <dl className="invite-meta">
                    <div className="invite-meta-item">
                      <dt>{m.used}</dt>
                      <dd>{row.usedText}</dd>
                    </div>
                    <div className="invite-meta-item">
                      <dt>{m.total}</dt>
                      <dd>{row.dataLimitText}</dd>
                    </div>
                    <div className="invite-meta-item">
                      <dt>{m.expire}</dt>
                      <dd>{row.expireText}</dd>
                    </div>
                    <div className="invite-meta-item">
                      <dt>{m.lastOnline}</dt>
                      <dd>{row.onlineText}</dd>
                    </div>
                  </dl>

                  {row.inviteCode ? (
                    <div className="invite-code-chip">
                      <span className="invite-code-chip-label">{m.inviteCode}</span>
                      <code>{row.inviteCode}</code>
                    </div>
                  ) : null}

                  {link && linkLabel ? (
                    <div className="invite-link">
                      <span className="invite-link-label">{linkLabel}</span>
                      <code className="url-box">{link}</code>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
