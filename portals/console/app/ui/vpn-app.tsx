"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Metric, PageHeader, Shell } from "./shell";
import { fetchJson } from "./api";
import type { AccountBinding, SessionPayload } from "./types";

export function VpnApp({
  session,
  setSession,
  initialInvite,
}: {
  session: SessionPayload;
  setSession: Dispatch<SetStateAction<SessionPayload | null>>;
  initialInvite?: string;
}) {
  const [inviteCode, setInviteCode] = useState(initialInvite ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const account = session.account ?? null;

  async function bindInvite() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await fetchJson<{ account?: AccountBinding; message?: string }>(
        "/api/account/apps/vpn/bind",
        { method: "POST", body: JSON.stringify({ inviteCode }) },
      );
      setMessage("Invite bound.");
      setSession((current) => (current ? { ...current, account: payload.account ?? null } : current));
    } catch (error) {
      const payload = (error as { payload?: { message?: string } }).payload;
      setMessage(payload?.message || "Invite could not be bound.");
    } finally {
      setBusy(false);
    }
  }

  async function resetSubscription() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await fetchJson<{ status: string; account?: AccountBinding }>(
        "/api/account/apps/vpn/action/reset",
        { method: "POST", body: "{}" },
      );
      setMessage(
        payload.status === "updated"
          ? "Subscription URL reset."
          : payload.status === "current"
            ? "Subscription URL already matches Marzban."
            : "Subscription URL could not be reset.",
      );
      if (payload.account) {
        setSession((current) => (current ? { ...current, account: payload.account } : current));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <Shell>
        <section className="section-card auth-card page-stack">
          <PageHeader
            title="Set up VPN"
            description="Your Vxture account is active. Bind the one-time invite code to reveal your VPN subscription."
          />
          {message ? <div className="notice">{message}</div> : null}
          <div className="form">
            <label className="field">
              Invite code
              <input
                className="input"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="RY-XXXX-XXXX-XXXX-XXXX"
              />
            </label>
            <button className="btn btn-primary" disabled={busy} onClick={bindInvite}>
              Bind invite
            </button>
            <a className="btn btn-secondary" href="/">
              Back to apps
            </a>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page-stack">
        <PageHeader
          title={account.displayName}
          description="Your Ruyin VPN subscription status and client address."
        />
        {message ? <div className="notice">{message}</div> : null}
        <section className="split">
          <div className="section-card page-stack">
            <div className="grid">
              <Metric label="User code" value={account.profileName} />
              <Metric label="Status" value={account.status} />
              <Metric label="Used traffic" value={account.usedText} />
              <Metric label="Total traffic" value={account.dataLimitText} />
              <Metric label="Remaining" value={account.remainingText} />
              <Metric label="Expire" value={account.expireText} />
              <Metric label="Last online" value={account.onlineText} />
            </div>
          </div>
          <aside className="section-card page-stack">
            <h2>Subscription URL</h2>
            <code className="code-box" id="subscription-url">
              {account.subscriptionUrl}
            </code>
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={() => navigator.clipboard.writeText(account.subscriptionUrl)}
              >
                Copy URL
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={resetSubscription}>
                Reset URL
              </button>
              <a className="btn btn-secondary" href="/">
                Back to apps
              </a>
            </div>
            <p className="muted">
              Copy this URL into Clash Verge, v2rayN, Stash, or a compatible client.
            </p>
          </aside>
        </section>
      </div>
    </Shell>
  );
}
