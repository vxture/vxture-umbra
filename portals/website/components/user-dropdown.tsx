"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Icon,
  ShellPreferencePanel,
  ShellUserMenu,
  useTheme,
  type Density,
  type IconName,
  type ShellFontSizePreference,
  type ShellThemePreference,
} from "@vxture/design-system";
// TEMP: the installed DS (1.3.0) icon dictionary has no horizontal swap glyph,
// so the "switch workspace" affordance pulls ArrowsLeftRight straight from the
// same phosphor package the DS itself re-exports. Pending DS adding an
// `arrows-left-right` name (see docs/design/ds-extension-requests.md); swap this
// back to <Icon name="arrows-left-right" /> once published.
import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import type { Locale } from "@vxture/shared";
import { UMBRA_LOCALE_OPTIONS } from "@umbra/shared/locales";
import {
  getFontSize,
  persistDensity,
  persistFontSize,
  persistTheme,
} from "@umbra/shared/preferences";
import { useTranslations } from "@umbra/shared/i18n";
import { useLocale } from "@/lib/locale-provider";
import { ruyinBrand } from "@/lib/brand";
import { logout, type SessionUser } from "@/lib/session";

type RoleKey = "owner" | "manager" | "member";

/** Default account silhouette when the session carries no picture; the signed-in
 *  menu always represents an online user (offline / fill kept as the contract). */
const DEFAULT_AVATAR = {
  online: "/assets/icons/avatar-default-online.svg",
  offline: "/assets/icons/avatar-default-offline.svg",
  fill: "/assets/icons/avatar-default.svg",
} as const;

/** Drop a leading country code so CN users see only the national number. */
function nationalPhone(phone: string): string {
  return phone
    .replace(/^\+?\s*86[\s-]*/, "")
    .replace(/^\+\d{1,3}[\s-]*/, "")
    .trim();
}

function primaryRole(user: SessionUser): RoleKey {
  const set = new Set(
    [...(user.roles ?? []), user.role]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.toLowerCase()),
  );
  if (set.has("owner")) return "owner";
  if (set.has("manager") || set.has("admin")) return "manager";
  return "member";
}

/** A link / info row that reuses the DS action markup (`vx-shell-user-menu__action`)
 *  so the profile + workspace rows share the icon column with the native switch /
 *  sign-out actions below the preference panel. `value` sits inline right after
 *  the label (close to it); `trailing` is a glyph pinned to the far right with a
 *  comfortable gap from the text. */
function MenuRow({
  icon,
  label,
  value,
  trailing,
  href,
}: {
  icon: IconName;
  label: string;
  value?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <Icon name={icon} className="vx-shell-user-menu__action-icon" />
      <span className="acct-row__label">{label}</span>
      {value ? <span className="acct-row__value">{value}</span> : null}
      {trailing ? <span className="acct-row__trailing">{trailing}</span> : null}
    </>
  );
  return href ? (
    <a
      className="vx-shell-user-menu__action acct-row"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {inner}
    </a>
  ) : (
    <div className="vx-shell-user-menu__action acct-row acct-row--static">
      {inner}
    </div>
  );
}

/**
 * Signed-in account menu for the public site header, aligned to the
 * vxture-website header. The DS ShellUserMenu supplies the avatar trigger, the
 * identity line, the role / tenant badges, the popover chrome and the section
 * separators. Quick settings delegate to the DS ShellPreferencePanel (the same
 * unified control the vxture header uses) - the per-row labels are intentionally
 * omitted so each row renders as icon + control, leaving only the panel title.
 * Switch-user / sign-out are native DS actions and verification is a native DS
 * `statusTag` (next to the name). Personal info + tenant settings are custom rows
 * grouped in one block (the DS `links` section would separate them and has no
 * slot for the tenant value + switch glyph). Preference changes persist to the
 * cross-subdomain cookies (see @umbra/shared/preferences).
 */
export function UserDropdown({ user }: { user: SessionUser }) {
  const { locale, setLocale } = useLocale();
  const { mode, setMode, density, setDensity } = useTheme();
  const t = useTranslations("account");

  const [fontSize, setFontSize] = useState<ShellFontSizePreference>("default");
  useEffect(() => {
    setFontSize(getFontSize());
  }, []);

  const name =
    user.displayName || user.username || user.email || user.phone || t("fallbackName");
  const uniqueLine =
    user.email && name !== user.email
      ? user.email
      : user.phone
        ? nationalPhone(user.phone)
        : user.email || "";
  const verified = Boolean(user.emailVerified || user.phoneVerified);
  const role = primaryRole(user);
  const isOrg = user.userType === "organization" || Boolean(user.orgId);

  // Single workspace line: "{org}.{workspace}" (e.g. vxture.workspace), falling
  // back to whichever part exists so personal tenants still show their workspace.
  const workspacePath = [user.orgId, user.workspaceId].filter(Boolean).join(".");

  const settings = (
    <>
      {/* Personal info + tenant settings in one block (no divider between). Both
          are custom rows: profile links to the console account page; tenant
          settings shows the current {org}.{workspace} with a switch affordance.
          Kept as custom rows (not DS `links`) so they group without the DS link
          section separator. */}
      <MenuRow
        icon="user"
        label={t("profile")}
        href={`${ruyinBrand.consoleUrl}/account`}
      />
      {workspacePath ? (
        <MenuRow
          icon="squares-four"
          label={t("tenantSettings")}
          value={workspacePath}
          trailing={
            <ArrowsLeftRightIcon
              size={16}
              className="acct-row__switch"
              aria-hidden
            />
          }
        />
      ) : (
        <MenuRow icon="squares-four" label={t("tenantSettings")} />
      )}

      {/* Divider between the personal-info block and quick settings. */}
      <div className="acct-div" />

      {/* Quick settings - DS preference panel, labels omitted (icon + control) */}
      <ShellPreferencePanel
        className="acct-prefs"
        locale={locale as Locale}
        localeOptions={UMBRA_LOCALE_OPTIONS}
        theme={mode as ShellThemePreference}
        density={density}
        fontSize={fontSize}
        labels={{
          title: t("settings"),
          themeOptions: {
            system: t("themeSystem"),
            light: t("themeLight"),
            dark: t("themeDark"),
          },
          densityOptions: {
            compact: t("densityCompact"),
            default: t("densityDefault"),
            comfortable: t("densityComfortable"),
          },
          fontSizeOptions: {
            small: t("fontSmall"),
            default: t("fontDefault"),
            large: t("fontLarge"),
          },
        }}
        onLocaleChange={(next) => setLocale(next)}
        onThemeChange={(next) => {
          setMode(next);
          persistTheme(next);
        }}
        onDensityChange={(next: Density) => {
          setDensity(next);
          persistDensity(next);
        }}
        onFontSizeChange={(next) => {
          setFontSize(next);
          persistFontSize(next);
        }}
      />
    </>
  );

  return (
    <ShellUserMenu
      user={{
        displayName: name,
        uniqueLine,
        avatarSrc: user.avatarUrl?.trim() || DEFAULT_AVATAR.online,
        avatarAlt: name,
        avatarFallback: Array.from(name.trim() || "U")[0]?.toLocaleUpperCase() ?? "U",
        // DS native verification tag, rendered next to the name.
        statusTag: { label: verified ? t("verified") : t("unverified"), verified },
        badges: [
          { key: "role", label: t(`roles.${role}`) },
          { key: "tenant", label: isOrg ? t("tenantOrg") : t("tenantPersonal") },
        ],
      }}
      openLabel={t("account")}
      online
      contentClassName="acct-menu"
      settings={settings}
      actions={[
        {
          key: "switch-user",
          label: t("switchUser"),
          icon: "user-switch",
          onClick: () => logout(),
        },
        {
          key: "sign-out",
          label: t("signout"),
          icon: "sign-out",
          onClick: () => logout(),
        },
      ]}
    />
  );
}
