"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@vxture/design-system";
import type { VxtureUser } from "./types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Personal-info body (avatar + identity rows) from the SSO session - no extra
 * Vxture call. Rendered on the personal-info detail page (wrapped in a card).
 */
export function PersonalInfo({ user }: { user?: VxtureUser }) {
  if (!user) return null;
  const name = user.displayName || user.username || user.email || "Account";

  const rows: Array<{ label: string; value: string }> = [
    { label: "Email", value: user.email },
  ];
  if (user.phone) rows.push({ label: "Phone", value: user.phone });
  if (user.username) rows.push({ label: "Username", value: user.username });
  rows.push({ label: "Role", value: user.role || "member" });

  return (
    <>
      <div className="info-head">
        <Avatar>
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="info-head-text">
          <strong>{name}</strong>
        </div>
      </div>
      <div className="info-grid">
        {rows.map((row) => (
          <div className="info-row" key={row.label}>
            <span className="info-label">{row.label}</span>
            <span className="info-value">{row.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
