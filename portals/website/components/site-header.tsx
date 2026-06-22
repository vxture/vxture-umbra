"use client";

import {
  Button,
  ShellBrand,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { persistTheme, type PrefTheme } from "@umbra/shared/preferences";
import { ruyinBrand, markSrc } from "@/lib/brand";
import { useLocale } from "@/lib/locale-provider";
import { useSession } from "@/lib/session";
import { UserDropdown } from "@/components/user-dropdown";

const HEADER_TEXT: Record<string, { register: string; login: string; workspace: string }> = {
  "en-US": { register: "Sign up", login: "Log in", workspace: "Workspace" },
  "zh-CN": { register: "注册", login: "登录", workspace: "工作台" },
};

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
              onThemeChange={(next) => {
                setTheme(next);
                persistTheme(next as PrefTheme);
              }}
            />
            <ShellLocaleSwitcher
              currentLocale={locale as Locale}
              buttonLabel="Language"
              onLocaleChange={(next) => setLocale(next)}
            />
          </div>

          {session.status === "loading" ? null : session.status === "active" && user ? (
            <>
              <Button variant="ghost" className="site-workspace-btn" asChild>
                <a href={ruyinBrand.consoleUrl}>{text.workspace}</a>
              </Button>
              <UserDropdown user={user} />
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
