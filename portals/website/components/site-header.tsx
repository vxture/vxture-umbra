"use client";

import { useEffect, useState } from "react";
import {
  Button,
  ShellBrand,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import type { Locale } from "@vxture/shared";
import { ruyinBrand, markSrc } from "@/lib/brand";
import { useLocale } from "@/lib/locale-provider";

const HEADER_TEXT: Record<string, { register: string; login: string }> = {
  "en-US": { register: "Sign up", login: "Log in" },
  "zh-CN": { register: "注册", login: "登录" },
};

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const text = HEADER_TEXT[locale] ?? HEADER_TEXT["en-US"];

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 50);
    update();
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={`site-header${isScrolled ? " is-scrolled" : ""}`}
      aria-label={ruyinBrand.productName}
    >
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

          <Button variant="secondary" asChild>
            <a href={ruyinBrand.registerUrl}>{text.register}</a>
          </Button>
          <Button asChild>
            <a href={ruyinBrand.loginUrl}>{text.login}</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
