"use client";

/**
 * i18n.tsx - tiny in-house translation layer for the *.ruyin.ai portals.
 *
 * Strings live in independent per-portal JSON files (one per locale); this
 * module just selects the active locale's bundle (driven by the shared
 * `useLocale()`) and resolves dot-path keys with `{var}` interpolation. No
 * third-party i18n dependency. Add a locale by dropping another JSON file into a
 * portal's `messages/` and listing it in that portal's `messages/index.ts`.
 */

import { createContext, useContext, type ReactNode } from "react";
import { UMBRA_DEFAULT_LOCALE, type UmbraLocale } from "./locales";
import { useLocale } from "./locale-provider";

/** A namespaced, possibly-nested bundle of strings for one locale. */
export type Messages = Record<string, unknown>;

const MessagesContext = createContext<Messages>({});

/**
 * Provides the active locale's message bundle to `useTranslations`. Must render
 * inside the shared `LocaleProvider` (it reads `useLocale()`); pass the portal's
 * full `{ "en-US": ..., "zh-CN": ... }` map.
 */
export function I18nProvider({
  messages,
  children,
}: {
  messages: Partial<Record<UmbraLocale, Messages>>;
  children: ReactNode;
}) {
  const { locale } = useLocale();
  const active = messages[locale] ?? messages[UMBRA_DEFAULT_LOCALE] ?? {};
  return (
    <MessagesContext.Provider value={active}>
      {children}
    </MessagesContext.Provider>
  );
}

function resolve(messages: Messages, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (
      acc != null &&
      typeof acc === "object" &&
      part in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export interface TranslateFn {
  /** Resolve a string key (within the namespace), interpolating `{var}`. */
  (key: string, vars?: Record<string, string | number>): string;
  /** Raw (non-string) value at a key - arrays / objects (e.g. feature lists). */
  raw: <T = unknown>(key: string) => T | undefined;
}

/**
 * Returns a translator scoped to `namespace` (e.g. "account"). `t("profile")`
 * resolves `account.profile` in the active bundle; `t("greeting", { name })`
 * interpolates `{name}`; `t.raw("loginFeatures")` returns a non-string value.
 * Missing keys return the key itself (and warn in development).
 */
export function useTranslations(namespace?: string): TranslateFn {
  const messages = useContext(MessagesContext);
  const prefix = namespace ? `${namespace}.` : "";

  const t = ((key: string, vars?: Record<string, string | number>): string => {
    const value = resolve(messages, prefix + key);
    if (typeof value === "string") return interpolate(value, vars);
    if (value == null) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${prefix}${key}`);
      }
      return key;
    }
    return String(value);
  }) as TranslateFn;

  t.raw = <T = unknown,>(key: string): T | undefined =>
    resolve(messages, prefix + key) as T | undefined;

  return t;
}
