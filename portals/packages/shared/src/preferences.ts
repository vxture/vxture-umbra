"use client";

/**
 * preferences.ts - Cross-subdomain user-preference sync for *.ruyin.ai.
 *
 * Locale / theme / density / font-size are written to PARENT-DOMAIN cookies
 * (.ruyin.ai) so they travel across website, console, admin, and any
 * self-built business app under the apex. Each app, on boot, seeds its DS /
 * provider localStorage from those cookies (see `preferenceBootstrapScript`,
 * injected in every <head>), and same-origin tabs stay live via the storage
 * event + a same-document custom event.
 *
 * Cookie keys are the canonical platform keys from @vxture/shared
 * (NEXT_LOCALE / vx-theme / vx-density); font-size has no platform key yet, so
 * it uses "vx-fontsize". Business apps adopt the same contract to participate.
 */

import { useEffect, useRef } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CONSTANTS,
  PREFERENCE_CONSTANTS,
  SUPPORTED_LOCALES,
  THEME_CONSTANTS,
  type Locale,
} from "@vxture/shared";

export type PrefTheme = "system" | "light" | "dark";
export type PrefDensity = "compact" | "default" | "comfortable";
export type PrefFontSize = "small" | "default" | "large";

const FONT_SIZE_LS_KEY = "vx-fontsize";

/** Cookie name per preference (parent-domain, cross-subdomain). */
const COOKIE = {
  locale: LOCALE_CONSTANTS.COOKIE_KEY, // "NEXT_LOCALE"
  theme: THEME_CONSTANTS.COOKIE_KEY, // "vx-theme"
  density: PREFERENCE_CONSTANTS.DENSITY_COOKIE_KEY, // "vx-density"
  fontSize: FONT_SIZE_LS_KEY, // "vx-fontsize"
} as const;

/** localStorage keys the DS / providers already read, so cookie mirrors land
 *  exactly where each consumer looks for its value. */
const LS = {
  locale: LOCALE_CONSTANTS.STORAGE_KEY, // "locale-storage"
  theme: THEME_CONSTANTS.STORAGE_KEY, // "theme-storage"
  density: PREFERENCE_CONSTANTS.DENSITY_STORAGE_KEY, // "vx-density"
  fontSize: FONT_SIZE_LS_KEY, // "vx-fontsize"
} as const;

export const FONT_SIZE_PX: Record<PrefFontSize, string> = {
  small: "15px",
  default: "16px",
  large: "18px",
};

const DENSITIES: readonly PrefDensity[] = ["compact", "default", "comfortable"];

const isTheme = (v: unknown): v is PrefTheme =>
  v === "system" || v === "light" || v === "dark";
const isDensity = (v: unknown): v is PrefDensity =>
  v === "compact" || v === "default" || v === "comfortable";
const isFontSize = (v: unknown): v is PrefFontSize =>
  v === "small" || v === "default" || v === "large";
const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);

/** Highest registrable parent domain so the cookie is shared by every
 *  subdomain. Returns undefined on localhost / bare IPs (host-only cookie). */
function parentDomain(): string | undefined {
  if (typeof location === "undefined") return undefined;
  const host = location.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d+(\.\d+){3}$/.test(host)
  ) {
    return undefined;
  }
  const parts = host.split(".");
  if (parts.length <= 2) return `.${host}`;
  return `.${parts.slice(-2).join(".")}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${escaped}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const domain = parentDomain();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const domainPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREFERENCE_CONSTANTS.COOKIE_MAX_AGE}; SameSite=Lax${domainPart}${secure}`;
}

function setLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable (privacy mode); cookie still carries it */
  }
}

/** Notify the same document (custom event) and other same-origin tabs (storage
 *  event on the shared snapshot key) of a preference change. */
function broadcast(partial: Record<string, string>): void {
  try {
    localStorage.setItem(
      PREFERENCE_CONSTANTS.SYNC_STORAGE_KEY,
      JSON.stringify({ ...partial, ts: Date.now() }),
    );
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(PREFERENCE_CONSTANTS.SYNC_EVENT, { detail: partial }),
    );
  } catch {
    /* ignore */
  }
}

// -- Apply (DOM) -------------------------------------------------------------

export function applyTheme(theme: PrefTheme): void {
  if (typeof document === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function applyFontSize(size: PrefFontSize): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = FONT_SIZE_PX[size];
}

// -- Persist (write cookie + mirror localStorage + broadcast) ----------------
// Theme and density are owned by the DS ThemeProvider, which applies the DOM
// change itself; these only persist + broadcast. Locale is mirrored for the
// providers; font-size has no owner, so it is applied here too.

export function persistLocale(locale: Locale): void {
  writeCookie(COOKIE.locale, locale);
  setLocalStorage(LS.locale, locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  broadcast({ locale });
}

export function persistTheme(theme: PrefTheme): void {
  writeCookie(COOKIE.theme, theme);
  setLocalStorage(LS.theme, theme);
  broadcast({ theme });
}

export function persistDensity(density: PrefDensity): void {
  writeCookie(COOKIE.density, density);
  setLocalStorage(LS.density, density);
  broadcast({ density });
}

export function persistFontSize(size: PrefFontSize): void {
  writeCookie(COOKIE.fontSize, size);
  setLocalStorage(LS.fontSize, size);
  applyFontSize(size);
  broadcast({ fontSize: size });
}

/** Current font-size preference (cookie first, then localStorage). */
export function getFontSize(): PrefFontSize {
  const fromCookie = readCookie(COOKIE.fontSize);
  if (isFontSize(fromCookie)) return fromCookie;
  if (typeof localStorage !== "undefined") {
    const fromLs = localStorage.getItem(LS.fontSize);
    if (isFontSize(fromLs)) return fromLs;
  }
  return "default";
}

/** Inline <head> script: cookie-first bootstrap that seeds each origin's
 *  localStorage and applies theme/density/font-size before first paint, so a
 *  preference set on one subdomain lands correctly on the next without FOUC.
 *  Supersedes the DS themeBootstrapScript (it also covers density + font-size +
 *  locale). Kept dependency-free and defensive for the pre-hydration context. */
export const preferenceBootstrapScript = `(function(){try{
var ck=function(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;};
var ls=function(k,v){try{if(v!=null)localStorage.setItem(k,v);}catch(e){}};
var de=document.documentElement;
var theme=ck('${COOKIE.theme}')||localStorage.getItem('${LS.theme}')||'${THEME_CONSTANTS.DEFAULT_THEME}';
ls('${LS.theme}',theme);
var dark=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
de.classList.toggle('dark',dark);
de.style.colorScheme=dark?'dark':'light';
var d=ck('${COOKIE.density}')||localStorage.getItem('${LS.density}');
if(d){ls('${LS.density}',d);['compact','default','comfortable'].forEach(function(x){de.classList.remove('density-'+x);});de.classList.add('density-'+d);}
var fp={small:'15px',default:'16px',large:'18px'};
var f=ck('${COOKIE.fontSize}')||localStorage.getItem('${LS.fontSize}');
if(f&&fp[f]){ls('${LS.fontSize}',f);de.style.fontSize=fp[f];}
var loc=ck('${COOKIE.locale}');
if(loc){ls('${LS.locale}',loc);de.lang=loc;}
}catch(e){}})();`;

export interface PreferenceSetters {
  setLocale?: ((locale: Locale) => void) | undefined;
  setMode?: ((mode: PrefTheme) => void) | undefined;
  setDensity?: ((density: PrefDensity) => void) | undefined;
}

/**
 * Keeps this tab's React preference state in sync with the cross-subdomain
 * cookies: reconciles once on mount (adopting a value set on another
 * subdomain), then live-updates on the storage event (other same-origin tabs)
 * and the same-document custom event. Pass the app's own provider setters so it
 * works whether the locale context is website-local or from @umbra/shared.
 */
export function usePreferenceLiveSync(setters: PreferenceSetters): void {
  const ref = useRef(setters);
  ref.current = setters;

  useEffect(() => {
    const apply = () => {
      const { setLocale, setMode, setDensity } = ref.current;
      const loc = readCookie(COOKIE.locale);
      if (setLocale && isLocale(loc)) setLocale(loc);
      const theme = readCookie(COOKIE.theme);
      if (setMode && isTheme(theme)) setMode(theme);
      const density = readCookie(COOKIE.density);
      if (setDensity && isDensity(density)) setDensity(density);
      applyFontSize(getFontSize());
    };

    apply();

    const watched = new Set<string>([
      PREFERENCE_CONSTANTS.SYNC_STORAGE_KEY,
      LS.locale,
      LS.theme,
      LS.density,
      LS.fontSize,
    ]);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || watched.has(e.key)) apply();
    };
    const onEvent = () => apply();

    window.addEventListener("storage", onStorage);
    window.addEventListener(PREFERENCE_CONSTANTS.SYNC_EVENT, onEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PREFERENCE_CONSTANTS.SYNC_EVENT, onEvent);
    };
  }, []);
}

/** Default locale, re-exported so callers need not import @vxture/shared. */
export { DEFAULT_LOCALE };
