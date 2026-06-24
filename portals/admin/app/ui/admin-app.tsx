"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  Icon,
  Input,
  MetricCard,
  Skeleton,
  StatusBadge,
  useToast,
} from "@vxture/design-system";
import type { IconName, StatusBadgeTone } from "@vxture/design-system";
import type { UmbraLocale } from "@umbra/shared/locales";
import { AdminShell } from "./admin-shell";
import { ruyinBrand } from "../../lib/brand";
import { useLocale } from "@umbra/shared/locale-provider";
import { useTranslations } from "@umbra/shared/i18n";
import type { AdminInvitesPayload, AdminUserRow } from "./types";

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

/** Icons pair positionally with copy.loginFeatures (label text is localized). */
const LOGIN_FEATURE_ICONS: IconName[] = ["users", "shield-check", "key"];

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

/**
 * Relative "x days/hours ago" tag from an ISO timestamp, localized via
 * Intl.RelativeTimeFormat. Returns null when there is no usable timestamp so
 * the caller can fall back to the absolute string alone.
 */
function relativeOnline(iso: string | null, locale: UmbraLocale): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

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
  const m = useTranslations("invites");
  const loginFeatures = m.raw<string[]>("loginFeatures") ?? [];

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
      toast({ tone: "error", title: m("toastInvalidCreds") });
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
        title: m("toastInviteGenerated"),
        description: payload.inviteUrl ? m("toastInviteDesc", { user, url: payload.inviteUrl }) : undefined,
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
      toast({ tone: "success", title: m("toastReset", { user }) });
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
      toast({ tone: "success", title: m("toastRevoked") });
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
                <p className="admin-login-eyebrow">{m("loginAsideEyebrow")}</p>
                <h2 className="admin-login-aside-title">{ruyinBrand.productName}</h2>
                <p className="admin-login-aside-lead">{m("loginAsideLead")}</p>
              </div>
              <ul className="admin-login-features">
                {LOGIN_FEATURE_ICONS.map((icon, i) => (
                  <li key={icon}>
                    <Icon name={icon} size="sm" />
                    <span>{loginFeatures[i]}</span>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="admin-login-main">
              <div className="admin-login-head">
                <p className="admin-login-eyebrow">{m("loginEyebrow")}</p>
                <h1 className="admin-login-title">{m("loginTitle")}</h1>
                <p className="admin-login-sub">{m("loginSub")}</p>
              </div>
              <form className="form" onSubmit={login}>
                <label className="field">
                  {m("loginUsername")}
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  {m("loginPassword")}
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
                  {m("loginSubmit")}
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
            title={m("unavailableTitle")}
            description={m("unavailableDesc")}
          />
          <div className="actions">
            <Button variant="secondary" onClick={() => refresh().catch(() => undefined)}>
              <Icon name="clock-counter-clockwise" size="sm" />
              {m("retry")}
            </Button>
          </div>
        </div>
      </AdminShell>
    );
  }

  const metrics: { key: string; label: string; value: number; icon: IconName; tone: string }[] = [
    { key: "users", label: m("metrics.users"), value: data.summary.users, icon: "users", tone: "neutral" },
    { key: "bound", label: m("metrics.bound"), value: data.summary.bound, icon: "shield-check", tone: "success" },
    {
      key: "invitePending",
      label: m("metrics.invitePending"),
      value: data.summary.invitePending,
      icon: "clock-counter-clockwise",
      tone: "warning",
    },
    {
      key: "pendingBinding",
      label: m("metrics.pendingBinding"),
      value: data.summary.pendingBinding,
      icon: "user-switch",
      tone: "neutral",
    },
  ];

  /**
   * Inline "Label: [value] [copy] [action]" row. URL rows (truncate) stay on a
   * single line and ellipsis-clip the value when the viewport is too narrow; the
   * action button (Reset / Revoke) sits at the far right of its own row.
   */
  function copyLine(opts: {
    label: string;
    copyLabel: string;
    copyValue: string;
    toastMsg: string;
    value?: string;
    truncate?: boolean;
    action?: ReactNode;
  }): ReactNode {
    return (
      <div className={`invite-line${opts.truncate ? " invite-line--url" : ""}`}>
        <span className="invite-line-label">{opts.label}</span>
        {opts.value ? (
          <code
            className={`invite-line-value${opts.truncate ? " invite-line-value--truncate" : ""}`}
          >
            {opts.value}
          </code>
        ) : null}
        <button
          type="button"
          className="invite-copy"
          aria-label={opts.copyLabel}
          title={opts.copyLabel}
          onClick={() => copy(opts.copyValue, opts.toastMsg)}
        >
          <Icon name="copy" size="sm" />
        </button>
        {opts.action ?? null}
      </div>
    );
  }

  return (
    <AdminShell active="vpn" authed onSignOut={logout}>
      <div className="page-stack">
        <SectionHeading
          icon="users"
          title={m("title")}
          description={m("description")}
          actions={
            <Button asChild variant="secondary" size="sm">
              <a href="/dashboard/" target="_blank" rel="noopener noreferrer">
                <Icon name="shield-check" size="sm" />
                {m("vpnConsole")}
              </a>
            </Button>
          }
        />
        <div className="admin-metrics">
          {metrics.map((x) => (
            <MetricCard
              key={x.key}
              className={`admin-metric admin-metric--${x.tone}`}
              icon={<Icon name={x.icon} size="sm" />}
              label={x.label}
              value={x.value}
            />
          ))}
        </div>

        {data.users.length === 0 ? (
          <EmptyState title={m("emptyTitle")} description={m("emptyDesc")} />
        ) : (
          <ul className="invite-list">
            {data.users.map((row) => {
              const online = relativeOnline(row.onlineAt, locale);
              return (
                <li key={row.username} className="invite-card">
                  <div className="invite-card-head">
                    <span className="invite-code">{row.username}</span>
                    <StatusBadge tone={statusTone(row.status)} dot>
                      {row.status}
                    </StatusBadge>
                    <StatusBadge tone={BINDING_TONE[row.bindingState]}>
                      {m(`binding.${row.bindingState}`)}
                    </StatusBadge>
                    {row.bindingState === "bound" && row.displayName ? (
                      <span className="invite-name">{row.displayName}</span>
                    ) : null}
                  </div>

                  <div className="invite-card-body">
                    <dl className="invite-meta">
                      <div className="invite-meta-item">
                        <dt>{m("used")}</dt>
                        <dd>{row.usedText}</dd>
                      </div>
                      <div className="invite-meta-item">
                        <dt>{m("total")}</dt>
                        <dd>{row.dataLimitText}</dd>
                      </div>
                      <div className="invite-meta-item">
                        <dt>{m("expire")}</dt>
                        <dd>{row.expireText}</dd>
                      </div>
                      <div className="invite-meta-item">
                        <dt>{m("lastOnline")}</dt>
                        <dd className="invite-online">
                          {online ? <StatusBadge tone="neutral">{online}</StatusBadge> : null}
                          <span>{row.onlineText}</span>
                        </dd>
                      </div>
                    </dl>

                    {/* Invite code stays visible whether or not the account is bound.
                        Revoke sits on this row while the invite is still pending; with
                        no code yet, the Generate invite button takes the row instead. */}
                    {row.inviteCode ? (
                      copyLine({
                        label: m("inviteCode"),
                        copyLabel: m("copyCode"),
                        copyValue: row.inviteCode,
                        toastMsg: m("toastCodeCopied"),
                        value: row.inviteCode,
                        action: row.subscriptionUrl ? undefined : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="invite-line-action"
                            disabled={busy === String(row.inviteId)}
                            onClick={() => revoke(row.inviteId)}
                          >
                            <Icon name="trash" size="sm" />
                            {m("revoke")}
                          </Button>
                        ),
                      })
                    ) : row.subscriptionUrl ? null : (
                      <div className="invite-line invite-line--generate">
                        <Button
                          size="sm"
                          disabled={busy === row.username}
                          onClick={() => generate(row.username)}
                        >
                          <Icon name="plus" size="sm" />
                          {m("generate")}
                        </Button>
                      </div>
                    )}

                    {/* After binding: subscription URL (+ Reset). Before: invite link. */}
                    {row.subscriptionUrl
                      ? copyLine({
                          label: m("subscriptionUrl"),
                          copyLabel: m("copyUrl"),
                          copyValue: row.subscriptionUrl,
                          toastMsg: m("toastSubCopied"),
                          value: row.subscriptionUrl,
                          truncate: true,
                          action: (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="invite-line-action"
                              disabled={busy === row.username}
                              onClick={() => reset(row.username)}
                            >
                              <Icon name="clock-counter-clockwise" size="sm" />
                              {m("reset")}
                            </Button>
                          ),
                        })
                      : row.inviteUrl
                        ? copyLine({
                            label: m("inviteLink"),
                            copyLabel: m("copyLink"),
                            copyValue: row.inviteUrl,
                            toastMsg: m("toastLinkCopied"),
                            value: row.inviteUrl,
                            truncate: true,
                          })
                        : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
