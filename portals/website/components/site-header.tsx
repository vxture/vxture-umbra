"use client";

import {
  Button,
  ShellBrand,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { ruyinBrand, markSrc } from "@/lib/brand";
import { useLocale } from "@/lib/locale-provider";
import { logout, useSession } from "@/lib/session";

const HEADER_TEXT: Record<string, {
  register: string;
  login: string;
  workspace: string;
  profile: string;
  signout: string;
  account: string;
}> = {
  "en-US": {
    register: "Sign up",
    login: "Log in",
    workspace: "Workspace",
    profile: "Personal info",
    signout: "Sign out",
    account: "Account menu",
  },
  "zh-CN": {
    register: "注册",
    login: "登录",
    workspace: "工作台",
    profile: "个人信息",
    signout: "退出登录",
    account: "账户菜单",
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** All login entries route through the OIDC RP login on the apex front door
 *  (ruyin.ai/auth/*, proxied to umbra-account-web), which redirects to
 *  accounts.vxture.com and comes back to this site. The IdP hosts the
 *  login/signup UI, so the screen hint is no longer forwarded. */
function authStartUrl(_hint: "login" | "signup"): string {
  const returnTo = encodeURIComponent(ruyinBrand.siteUrl);
  return `${ruyinBrand.siteUrl}/auth/login?returnTo=${returnTo}`;
}

export function SiteHeader() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const session = useSession();
  const text = HEADER_TEXT[locale] ?? HEADER_TEXT["en-US"];

  const user = session.user;
  const displayName = user?.displayName || user?.username || user?.email || user?.phone || "";
  const uniqueLine = user?.email || user?.phone || "";
  const userBadges = user
    ? [
        ...(user.accountStatus ? [{ key: "status", label: user.accountStatus }] : []),
        ...(user.roles ?? []).map((r, i) => ({ key: `role-${i}`, label: r })),
      ]
    : [];

  return (
    <header className="site-header" aria-label={ruyinBrand.productName}>
      <div className="site-header-inner">
        <ShellBrand
          href="/"
          logoSrc={markSrc(theme)}
          logoAlt=""
          label={ruyinBrand.productDomain}
          labelClassName="site-brand-name"
        />

        <div className="site-actions">
          <div className="site-tools" aria-label="Display controls">
            <ShellThemeToggle
              currentTheme={theme}
              buttonLabel="Switch theme"
              onThemeChange={(next) => setTheme(next)}
            />
            <ShellLocaleSwitcher
              currentLocale={locale as Locale}
              buttonLabel="Language"
              onLocaleChange={(next) => setLocale(next)}
            />
          </div>

          {session.status === "loading" ? null : session.status === "active" && user ? (
            <>
              <Button variant="outline" asChild>
                <a href={ruyinBrand.consoleUrl}>{text.workspace}</a>
              </Button>
              <ShellUserMenu
                openLabel={text.account}
                user={{
                  displayName,
                  uniqueLine,
                  avatarSrc: user.avatarUrl,
                  avatarAlt: displayName,
                  avatarFallback: initials(displayName),
                  badges: userBadges.length ? userBadges : undefined,
                }}
                actions={[
                  {
                    key: "profile",
                    label: text.profile,
                    icon: "user",
                    onClick: () => {
                      window.location.href = `${ruyinBrand.consoleUrl}/account`;
                    },
                  },
                  { key: "logout", label: text.signout, icon: "sign-out", onClick: logout },
                ]}
              />
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <a href={authStartUrl("signup")}>{text.register}</a>
              </Button>
              <Button asChild>
                <a href={authStartUrl("login")}>{text.login}</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
