"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  StatusBadge,
} from "@vxture/design-system";
import { useLocale } from "@umbra/shared/locale-provider";
import type { VxtureUser } from "./types";

const COPY = {
  "en-US": { workspace: "Personal workspace", role: "Role", status: "Status", member: "member" },
  "zh-CN": { workspace: "个人工作区", role: "角色", status: "状态", member: "成员" },
} as const;

/**
 * Org / workspace module (leftmost header dropdown). Real-data only: the IdP
 * exposes no org name/type and umbra has no billing/commerce backend yet
 * (parked), so this shows the workspace context that exists today - role and
 * account status. The billing and switch-organization groups from the design
 * are intentionally omitted until a backend exists.
 */
export function OrgDropdown({ user }: { user: VxtureUser }) {
  const { locale } = useLocale();
  const t = COPY[locale] ?? COPY["en-US"];
  const role = user.roles && user.roles.length ? user.roles.join(", ") : user.role || t.member;
  const status = user.accountStatus || "";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="hdr-trigger" aria-label={t.workspace}>
        <Icon name="buildings" size="sm" className="hdr-trigger-lead" />
        <span className="hdr-trigger-text">{t.workspace}</span>
        <Icon name="arrow-down" size="sm" className="hdr-trigger-caret" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="hdr-menu">
        <DropdownMenuLabel className="hdr-menu-title">{t.workspace}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="hdr-info-row">
          <span className="hdr-info-label">{t.role}</span>
          <StatusBadge tone="info">{role}</StatusBadge>
        </div>
        {status ? (
          <div className="hdr-info-row">
            <span className="hdr-info-label">{t.status}</span>
            <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
