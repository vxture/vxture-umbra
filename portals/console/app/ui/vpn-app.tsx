"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  MetricGrid,
  SectionCard,
  StatusBadge,
  useToast,
} from "@vxture/design-system";
import type { MetricGridItem, StatusBadgeTone } from "@vxture/design-system";
import { PageHeader, Shell } from "./shell";
import { fetchJson } from "./api";
import type { AccountBinding, SessionPayload } from "./types";

function statusTone(status: string): StatusBadgeTone {
  const value = status.toLowerCase();
  if (value === "active") return "success";
  if (value === "limited" || value === "expired") return "warning";
  if (value === "disabled") return "danger";
  return "neutral";
}

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
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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

  async function resetSubscription() {
    setBusy(true);
    try {
      const payload = await fetchJson<{ status: string; account?: AccountBinding }>(
        "/api/account/apps/vpn/action/reset",
        { method: "POST", body: "{}" },
      );
      if (payload.status === "updated") {
        toast({ tone: "success", title: "Subscription URL reset." });
      } else if (payload.status === "current") {
        toast({ tone: "info", title: "Subscription URL already matches Marzban." });
      } else {
        toast({ tone: "error", title: "Subscription URL could not be reset." });
      }
      if (payload.account) {
        setSession((current) => (current ? { ...current, account: payload.account } : current));
      }
    } catch {
      toast({ tone: "error", title: "Subscription URL could not be reset." });
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  if (!account) {
    return (
      <Shell user={session.user}>
        <section className="auth-card page-stack">
          <PageHeader
            title="Set up VPN"
            description="Your Vxture account is active. Bind the one-time invite code to reveal your VPN subscription."
          />
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
                Bind invite
              </Button>
              <Button variant="secondary" asChild>
                <a href="/">Back to apps</a>
              </Button>
            </div>
          </div>
        </section>
      </Shell>
    );
  }

  const metrics: MetricGridItem[] = [
    { label: "User code", value: account.profileName },
    { label: "Used traffic", value: account.usedText },
    { label: "Total traffic", value: account.dataLimitText },
    { label: "Remaining", value: account.remainingText },
    { label: "Expire", value: account.expireText },
    { label: "Last online", value: account.onlineText },
  ];

  return (
    <Shell user={session.user}>
      <div className="page-stack">
        <PageHeader
          title={account.displayName}
          description="Your Ruyin VPN subscription status and client address."
          actions={<StatusBadge tone={statusTone(account.status)} dot>{account.status}</StatusBadge>}
        />
        <div className="split">
          <SectionCard title="Usage" description="Traffic and validity for your VPN access.">
            <MetricGrid items={metrics} />
          </SectionCard>
          <SectionCard
            title="Subscription URL"
            description="Copy this URL into Clash Verge, v2rayN, Stash, or a compatible client."
          >
            <code className="url-box">{account.subscriptionUrl}</code>
            <div className="actions">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(account.subscriptionUrl);
                  toast({ tone: "success", title: "Subscription URL copied." });
                }}
              >
                Copy URL
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => setConfirmReset(true)}>
                Reset URL
              </Button>
              <Button variant="secondary" asChild>
                <a href="/">Back to apps</a>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset subscription URL?</DialogTitle>
            <DialogDescription>
              This changes the URL your clients use. You will need to copy the new URL into every
              device again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={resetSubscription}>
              Reset URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
