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
import { useTranslations } from "@umbra/shared/i18n";
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
  const t = useTranslations("subscription");
  const account = session.account ?? null;

  async function resetSubscription() {
    setBusy(true);
    try {
      const payload = await fetchJson<{ status: string; account?: AccountBinding }>(
        "/api/account/apps/vpn/action/reset",
        { method: "POST", body: "{}" },
      );
      if (payload.status === "updated") {
        toast({ tone: "success", title: t("resetToast") });
      } else if (payload.status === "current") {
        toast({ tone: "info", title: t("resetCurrentToast") });
      } else {
        toast({ tone: "error", title: t("resetFailToast") });
      }
      if (payload.account) {
        setSession((current) => (current ? { ...current, account: payload.account } : current));
      }
    } catch {
      toast({ tone: "error", title: t("resetFailToast") });
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
          title={t("title")}
          description={t("noSubDesc")}
        />
        <p className="muted">{t("activateFirst")}</p>
        <div className="actions">
          <Button asChild>
            <a href="/">
              <Icon name="arrow-left" size="sm" />
              {t("backHome")}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const metrics: MetricGridItem[] = [
    { label: t("metrics.userCode"), value: account.profileName },
    { label: t("metrics.status"), value: account.status },
    { label: t("metrics.used"), value: `${account.usedText} (${account.usagePercent}%)` },
    { label: t("metrics.totalQuota"), value: account.dataLimitText },
    { label: t("metrics.remaining"), value: account.remainingText },
    { label: t("metrics.quotaReset"), value: account.resetText },
    { label: t("metrics.expire"), value: account.expireText },
    { label: t("metrics.lastOnline"), value: account.onlineText },
  ];
  if (account.lastClient) metrics.push({ label: t("metrics.lastClient"), value: account.lastClient });
  if (account.subUpdatedText) metrics.push({ label: t("metrics.subUpdated"), value: account.subUpdatedText });
  if (account.createdText) metrics.push({ label: t("metrics.created"), value: account.createdText });

  return (
    <div className="page-stack">
      <SectionHeading
        icon="chart-bar"
        title={t("title")}
        description={t("detailsDesc")}
        badge={<StatusBadge tone={statusTone(account.status)} dot>{account.status}</StatusBadge>}
      />

      <SectionCard title={t("usageTitle")} description={t("usageDesc")}>
        <MetricGrid items={metrics} />
      </SectionCard>

      <SectionCard
        title={t("subUrlTitle")}
        description={t("subUrlDesc")}
      >
        <div className="card-stack">
          <code className="url-box">{account.subscriptionUrl}</code>
          <div className="actions">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(account.subscriptionUrl);
                toast({ tone: "success", title: t("copyToast") });
              }}
            >
              <Icon name="copy" size="sm" />
              {t("copyUrl")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => setConfirmReset(true)}>
              <Icon name="clock-counter-clockwise" size="sm" />
              {t("resetUrl")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="actions">
        <Button variant="secondary" asChild>
          <a href="/">
            <Icon name="arrow-left" size="sm" />
            {t("back")}
          </a>
        </Button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resetDialogTitle")}</DialogTitle>
            <DialogDescription>{t("resetDialogDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={resetSubscription}>
              {t("resetUrl")}
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
