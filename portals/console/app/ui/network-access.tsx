"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Icon, Input, SectionCard, StatusBadge, useToast } from "@vxture/design-system";
import type { StatusBadgeTone } from "@vxture/design-system";
import { SectionHeading } from "./shell";
import { fetchJson } from "./api";
import type { AccountBinding, SessionPayload } from "./types";

function statusTone(status: string): StatusBadgeTone {
  const value = status.toLowerCase();
  if (value === "active") return "success";
  if (value === "limited" || value === "expired") return "warning";
  if (value === "disabled") return "danger";
  return "neutral";
}

/**
 * Tenant network-access block (console home). Unbound: bind a one-time invite
 * code. Bound: subscription URL with quick copy + a link to the full detail page
 * (usage, quota, reset). The product never labels this "VPN" in the UI.
 */
export function NetworkAccess({
  session,
  setSession,
  initialInvite,
}: {
  session: SessionPayload;
  setSession: Dispatch<SetStateAction<SessionPayload | null>>;
  initialInvite?: string;
}) {
  const [inviteCode, setInviteCode] = useState(initialInvite ?? "");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const account = session.account ?? null;

  async function bindInvite() {
    setBusy(true);
    try {
      const payload = await fetchJson<{ account?: AccountBinding; message?: string }>(
        "/api/account/apps/vpn/bind",
        { method: "POST", body: JSON.stringify({ inviteCode }) },
      );
      toast({ tone: "success", title: "Invite bound." });
      setSession((current) => (current ? { ...current, account: payload.account ?? null } : current));
    } catch (error) {
      const payload = (error as { payload?: { message?: string } }).payload;
      toast({ tone: "error", title: "Invite could not be bound.", description: payload?.message });
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <>
        <SectionHeading
          icon="shield-check"
          title="Network access"
          description="Bind your one-time invite code to activate your subscription."
        />
        <SectionCard
          title="Activate"
          description="Your Vxture account is active. Enter the invite code from your administrator."
        >
          <div className="form">
            <label className="field">
              Invite code
              <Input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="RY-XXXX-XXXX-XXXX-XXXX"
              />
            </label>
            <div className="actions">
              <Button onClick={bindInvite} disabled={busy || !inviteCode.trim()}>
                <Icon name="check" size="sm" />
                Bind invite
              </Button>
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <SectionHeading
        icon="shield-check"
        title="Network access"
        description="Your subscription is active. Copy the URL into your client, or view full details."
        badge={<StatusBadge tone={statusTone(account.status)} dot>{account.status}</StatusBadge>}
      />
      <SectionCard
        title="Subscription URL"
        description="Copy this URL into Clash Verge, v2rayN, Stash, or a compatible client."
      >
        <div className="card-stack">
          <code className="url-box">{account.subscriptionUrl}</code>
          <div className="actions">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(account.subscriptionUrl);
                toast({ tone: "success", title: "Subscription URL copied." });
              }}
            >
              <Icon name="copy" size="sm" />
              Copy URL
            </Button>
            <Button variant="secondary" asChild>
              <a href="/apps/vpn">
                <Icon name="chart-bar" size="sm" />
                View details
              </a>
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
