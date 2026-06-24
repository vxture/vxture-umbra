"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LOCALE_CONSTANTS } from "@vxture/shared";
import {
  UMBRA_DEFAULT_LOCALE,
  UMBRA_LOCALES,
  isUmbraLocale,
  type UmbraLocale,
} from "./locales";
import { persistLocale } from "./preferences";

const LOCALE_CYCLE: UmbraLocale[] = [...UMBRA_LOCALES]; // en-US -> zh-CN -> ja-JP

interface LocaleContextValue {
  locale: UmbraLocale;
  setLocale: (locale: UmbraLocale) => void;
  toggle: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getStoredLocale(): UmbraLocale {
  if (typeof window === "undefined") return UMBRA_DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_CONSTANTS.STORAGE_KEY);
  if (isUmbraLocale(stored)) return stored;
  return UMBRA_DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UmbraLocale>(UMBRA_DEFAULT_LOCALE);

  useEffect(() => {
    const initial = getStoredLocale();
    setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  const setLocale = (next: UmbraLocale) => {
    setLocaleState(next);
    // Mirror to the parent-domain cookie (+ localStorage + lang + broadcast) so
    // the choice syncs across every *.ruyin.ai app.
    persistLocale(next);
  };

  const toggle = () => {
    const idx = LOCALE_CYCLE.indexOf(locale);
    const next = LOCALE_CYCLE[(idx + 1) % LOCALE_CYCLE.length];
    setLocale(next);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggle }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
