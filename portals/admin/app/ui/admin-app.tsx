"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Icon,
  Input,
  MetricGrid,
  PageHeader,
  Skeleton,
  StatusBadge,
  useTheme,
  useToast,
} from "@vxture/design-system";
import type { DataTableColumn, IconName, MetricGridItem, StatusBadgeTone } from "@vxture/design-system";
import { AdminShell } from "./admin-shell";
import { markSrc, ruyinBrand } from "../../lib/brand";
import type { AdminInvitesPayload, AdminUserRow } from "./types";

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

function bindingLabel(row: AdminUserRow): string {
  if (row.bindingState === "bound") return `Bound: ${row.displayName ?? row.username}`;
  if (row.bindingState === "invite_pending") return "Invite pending";
  return "Pending binding";
}

/**
 * Admin management surface (admin.ruyin.ai). Built-in credential login, then the
 * vpn-invites block: every subscription link, invite-code issuance, and bound
 * accounts. Marzban and Vault are sidebar jump-links (see AdminShell).
 */
export function AdminApp() {
  const [data, setData] = useState<AdminInvitesPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { theme } = useTheme();
  const { toast } = useToast();

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
        title: "Invite generated.",
        description: payload.inviteUrl ? `Invite link for ${user}: ${payload.inviteUrl}` : undefined,
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
      toast({ tone: "success", title: `Subscription URL reset requested for ${user}.` });
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
      toast({ tone: "success", title: "Invite revoked." });
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
              <img className="admin-login-mark" src={markSrc(theme)} alt="" />
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
      <AdminShell active="invites" authed onSignOut={logout}>
        <div className="page-stack">
          <PageHeader
            icon="warning"
            title="Invite Console Unavailable"
            description="Marzban could not be reached. Try again after services recover."
          />
          <div className="actions">
            <Button variant="secondary" onClick={() => refresh().catch(() => undefined)}>
              <Icon name="clock-counter-clockwise" size="sm" />
              Retry
            </Button>
          </div>
        </div>
      </AdminShell>
    );
  }

  const metrics: MetricGridItem[] = [
    { label: "Users", value: data.summary.users },
    { label: "Bound", value: data.summary.bound, tone: "success" },
    { label: "Invite pending", value: data.summary.invitePending, tone: "warning" },
    { label: "Pending binding", value: data.summary.pendingBinding },
  ];

  const columns: DataTableColumn<AdminUserRow>[] = [
    { id: "username", header: "User code", cell: (row) => row.username },
    { id: "status", header: "Status", cell: (row) => row.status },
    { id: "used", header: "Used", cell: (row) => row.usedText },
    { id: "total", header: "Total", cell: (row) => row.dataLimitText },
    { id: "expire", header: "Expire", cell: (row) => row.expireText },
    { id: "online", header: "Last online", cell: (row) => row.onlineText },
    {
      id: "binding",
      header: "Binding",
      cell: (row) => <StatusBadge tone={BINDING_TONE[row.bindingState]}>{bindingLabel(row)}</StatusBadge>,
    },
    {
      id: "link",
      header: "Subscription / Invite link",
      cell: (row) =>
        row.subscriptionUrl || row.inviteUrl || row.inviteCode ? (
          <code className="url-box">{row.subscriptionUrl || row.inviteUrl || row.inviteCode}</code>
        ) : (
          <span className="muted">-</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="actions">
          {row.subscriptionUrl ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(row.subscriptionUrl || "", "Subscription URL copied.")}
              >
                <Icon name="copy" size="sm" />
                Copy
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy === row.username}
                onClick={() => reset(row.username)}
              >
                <Icon name="clock-counter-clockwise" size="sm" />
                Reset
              </Button>
            </>
          ) : row.inviteCode ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(row.inviteUrl || row.inviteCode || "", "Invite link copied.")}
              >
                <Icon name="copy" size="sm" />
                Copy link
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(row.inviteCode || "", "Invite code copied.")}
              >
                <Icon name="copy" size="sm" />
                Copy code
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === String(row.inviteId)}
                onClick={() => revoke(row.inviteId)}
              >
                <Icon name="trash" size="sm" />
                Revoke
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy === row.username} onClick={() => generate(row.username)}>
              <Icon name="plus" size="sm" />
              Generate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminShell active="invites" authed onSignOut={logout}>
      <div className="page-stack">
        <PageHeader
          icon="users"
          title="Invites & Users"
          description="Issue one-time VPN invites for Marzban users and manage bound subscriptions."
        />
        <MetricGrid items={metrics} />
        <DataTable
          columns={columns}
          rows={data.users}
          rowKey={(row) => row.username}
          empty={
            <EmptyState
              title="No Marzban users"
              description="Create users in the Marzban dashboard first, then generate invites here."
            />
          }
        />
      </div>
    </AdminShell>
  );
}
