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
  Icon,
  MetricGrid,
  SectionCard,
  StatusBadge,
  useToast,
} from "@vxture/design-system";
import type { MetricGridItem, StatusBadgeTone } from "@vxture/design-system";
import { AccountGate } from "./account-gate";
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

function SubscriptionDetail({
  session,
  setSession,
}: {
  session: SessionPayload;
  setSession: Dispatch<SetStateAction<SessionPayload | null>>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useToast();
  const account = session.account ?? null;

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
        toast({ tone: "info", title: "Subscription URL already up to date." });
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
      <div className="page-stack">
        <SectionHeading
          icon="chart-bar"
          title="Subscription details"
          description="You have no active subscription yet."
        />
        <p className="muted">Activate your network access from the home page first.</p>
        <div className="actions">
          <Button asChild>
            <a href="/">
              <Icon name="arrow-left" size="sm" />
              Back to home
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const metrics: MetricGridItem[] = [
    { label: "User code", value: account.profileName },
    { label: "Status", value: account.status },
    { label: "Used", value: `${account.usedText} (${account.usagePercent}%)` },
    { label: "Total quota", value: account.dataLimitText },
    { label: "Remaining", value: account.remainingText },
    { label: "Quota reset", value: account.resetText },
    { label: "Expire", value: account.expireText },
    { label: "Last online", value: account.onlineText },
  ];
  if (account.lastClient) metrics.push({ label: "Last client", value: account.lastClient });
  if (account.subUpdatedText) metrics.push({ label: "Subscription updated", value: account.subUpdatedText });
  if (account.createdText) metrics.push({ label: "Created", value: account.createdText });

  return (
    <div className="page-stack">
      <SectionHeading
        icon="chart-bar"
        title="Subscription details"
        description="Usage, quota, validity, and client address for your access."
        badge={<StatusBadge tone={statusTone(account.status)} dot>{account.status}</StatusBadge>}
      />

      <SectionCard title="Usage" description="Traffic, quota, and validity for your subscription.">
        <MetricGrid items={metrics} />
      </SectionCard>

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
            <Button variant="destructive" disabled={busy} onClick={() => setConfirmReset(true)}>
              <Icon name="clock-counter-clockwise" size="sm" />
              Reset URL
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="actions">
        <Button variant="secondary" asChild>
          <a href="/">
            <Icon name="arrow-left" size="sm" />
            Back
          </a>
        </Button>
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
    </div>
  );
}

/** Subscription detail page (reached from the home "View details" action). */
export function AccountSubscription() {
  return (
    <AccountGate>
      {(session, setSession) => <SubscriptionDetail session={session} setSession={setSession} />}
    </AccountGate>
  );
}
