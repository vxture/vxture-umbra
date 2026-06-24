"use client";

import type { ReactNode } from "react";
import {
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusBadge,
  type IconName,
  type StatusBadgeTone,
} from "@vxture/design-system";
import { useTranslations } from "@umbra/shared/i18n";
import type { VxtureUser } from "./types";


/** One tenant detail row: leading icon, muted label, value pinned right. The
 *  value may be plain text or a badge. */
function TenantRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="tenant-row">
      <Icon name={icon} size="sm" className="tenant-row__icon" />
      <span className="tenant-row__label">{label}</span>
      <span className="tenant-row__value">{children}</span>
    </div>
  );
}

/**
 * Tenant info panel (leftmost header module), modeled on Vultr's account/tenant
 * dropdown: an identity header (tenant name + type badge + tenant id) over a
 * sectioned detail card (workspace, role, status, members, plan) and a settings
 * link. Real fields (tenant id, org/workspace, role, status) come from the
 * session; members / plan are placeholders pending a tenancy/billing backend
 * (designed now, to be wired later). The panel reuses the account-menu popover
 * chrome so both header modules read as one system.
 */
export function TenantPanel({ user }: { user: VxtureUser }) {
  const t = useTranslations("tenant");

  const isOrg = user.userType === "organization" || Boolean(user.orgId);
  const tenantName =
    user.orgName?.trim() ||
    (isOrg ? user.orgId : "") ||
    t("personalWorkspace");
  const tenantType = isOrg ? t("tenantOrg") : t("tenantPersonal");
  const tenantId = user.tenantId || user.orgId || "-";

  const workspace =
    user.workspaceName?.trim() || user.workspaceId || t("placeholder");

  const roleKey = (user.roles?.[0] || user.role || "member").toLowerCase();
  const roleLabel =
    (t.raw<string>(`roles.${roleKey}`) ?? user.role) || t("member");

  const status = (user.accountStatus || "active").toLowerCase();
  const statusTone: StatusBadgeTone =
    status === "active" ? "success" : status ? "warning" : "neutral";
  const statusLabel = status === "active" ? t("statusActive") : status;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="tenant-trigger" aria-label={t("open")}>
          <Icon name="buildings" size={24} className="tenant-trigger__lead" />
          <span className="tenant-trigger__text">{tenantName}</span>
          <Icon name="chevron-down" size={14} className="tenant-trigger__caret" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="acct-menu tenant-menu">
        {/* Identity header */}
        <div className="tenant-head">
          <span className="tenant-head__mark">
            <Icon name="buildings" size={20} />
          </span>
          <div className="tenant-head__identity">
            <p className="tenant-head__name">{tenantName}</p>
            <p className="tenant-head__id">
              {t("tenantId")}: {tenantId}
            </p>
          </div>
          <span className="tenant-head__type">{tenantType}</span>
        </div>

        <div className="acct-div" />

        {/* Detail card */}
        <TenantRow icon="squares-four" label={t("workspace")}>
          <span className="tenant-row__text">{workspace}</span>
        </TenantRow>
        <TenantRow icon="role" label={t("role")}>
          <StatusBadge tone="info">{roleLabel}</StatusBadge>
        </TenantRow>
        <TenantRow icon="shield-check" label={t("status")}>
          <StatusBadge tone={statusTone} dot>
            {statusLabel}
          </StatusBadge>
        </TenantRow>
        <TenantRow icon="users" label={t("members")}>
          {/* TODO: real member count once a tenancy backend exists. */}
          <span className="tenant-row__text">{isOrg ? t("placeholder") : "1"}</span>
        </TenantRow>
        <TenantRow icon="medal" label={t("plan")}>
          {/* TODO: real plan / subscription once billing exists. */}
          <span className="tenant-row__text">{t("planFree")}</span>
        </TenantRow>

        <div className="acct-div" />

        {/* Settings link */}
        <button
          type="button"
          className="vx-shell-user-menu__action acct-row"
          onClick={() => window.location.assign("/account")}
        >
          <Icon name="settings" className="vx-shell-user-menu__action-icon" />
          <span className="acct-row__label">{t("settings")}</span>
          <span className="acct-row__trailing">
            <Icon name="chevron-right" size="sm" className="acct-row__go" />
          </span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
