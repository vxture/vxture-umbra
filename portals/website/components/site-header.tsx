"use client";

import {
  Button,
  ShellBrand,
  ShellFullscreenToggle,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { persistTheme, type PrefTheme } from "@umbra/shared/preferences";
import { useTranslations } from "@umbra/shared/i18n";
import { UMBRA_LOCALE_OPTIONS } from "@umbra/shared/locales";
import { ruyinBrand, markSrc } from "@/lib/brand";
import { useLocale } from "@/lib/locale-provider";
import { useSession } from "@/lib/session";
import { UserDropdown } from "@/components/user-dropdown";

/** Element the fullscreen toggle expands; the homepage root carries this id. */
const PAGE_FULLSCREEN_ID = "ruyin-page-root";

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
  const t = useTranslations("header");
  const session = useSession();

  const user = session.user;

  return (
    <header className="site-header" aria-label={ruyinBrand.productName}>
      <div className="site-header-inner">
        {/* Logo + name link to the ruyin.ai homepage (website root). The studio
            tag reuses the DS pill class (no custom CSS). */}
        <ShellBrand
          href="/"
          logoSrc={markSrc(theme)}
          logoAlt=""
          label={
            <span className="site-brand-lockup">
              <span className="site-brand-name">{ruyinBrand.productDomain}</span>
              <span className="site-brand-tag">vxture studio</span>
            </span>
          }
        />

        <div className="site-actions">
          {/* Grouped quick controls [theme | language | fullscreen], mirroring
              the vxture-console header action group. */}
          <div
            className="vx-shell-header__action-group"
            role="group"
            aria-label={t("display")}
          >
            <ShellThemeToggle
              currentTheme={theme}
              buttonLabel={t("theme")}
              className="vx-shell-icon-button vx-shell-icon-button--toolbar"
              activeClassName="vx-shell-icon-button--active"
              onThemeChange={(next) => {
                setTheme(next);
                persistTheme(next as PrefTheme);
              }}
            />
            <ShellLocaleSwitcher
              currentLocale={locale as Locale}
              options={UMBRA_LOCALE_OPTIONS}
              buttonLabel={t("language")}
              buttonClassName="vx-shell-icon-button vx-shell-icon-button--toolbar"
              activeButtonClassName="vx-shell-icon-button--active"
              onLocaleChange={(next) => setLocale(next)}
            />
            <ShellFullscreenToggle
              targetId={PAGE_FULLSCREEN_ID}
              enterLabel={t("fullscreenEnter")}
              exitLabel={t("fullscreenExit")}
              className="vx-shell-icon-button vx-shell-icon-button--toolbar"
              activeClassName="vx-shell-icon-button--active"
            />
          </div>

          {session.status === "loading" ? null : session.status === "active" && user ? (
            <>
              <Button variant="ghost" className="site-workspace-btn" asChild>
                <a href={ruyinBrand.consoleUrl}>{t("workspace")}</a>
              </Button>
              <UserDropdown user={user} />
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <a href={authStartUrl("signup")}>{t("signUp")}</a>
              </Button>
              <Button asChild>
                <a href={authStartUrl("login")}>{t("signIn")}</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
