import type { Locale } from "@vxture/shared";
import { DEFAULT_LOCALE } from "@vxture/shared";
import type { LocaleSelectOption } from "@vxture/design-system";

/**
 * Umbra's locale set. `@vxture/shared`'s `Locale` is pinned to en-US / zh-CN, so
 * the third locale (ja-JP) is umbra-local until the upstream package adds it.
 * `UmbraLocale` is a superset of `Locale`; at DS boundaries that demand the
 * narrower `Locale` we cast (the DS only uses it as an opaque string key for the
 * cookie / display, so this is runtime-safe).
 */
export type UmbraLocale = Locale | "ja-JP";

export const UMBRA_LOCALES: readonly UmbraLocale[] = ["en-US", "zh-CN", "ja-JP"];

export const UMBRA_DEFAULT_LOCALE: UmbraLocale = DEFAULT_LOCALE;

/** Native display name per locale, for the switcher + preference panel. This
 *  file is exempt from the 06 ASCII scan (it is localized content - locale
 *  display names). */
export const UMBRA_LOCALE_NATIVE: Record<UmbraLocale, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
  "ja-JP": "日本語",
};

export const isUmbraLocale = (v: unknown): v is UmbraLocale =>
  typeof v === "string" && (UMBRA_LOCALES as readonly string[]).includes(v);

/** Ready-made options for ShellLocaleSwitcher / ShellPreferencePanel. The DS
 *  `LocaleSelectOption.locale` is typed `Locale`; ja-JP is cast (opaque string
 *  to the DS). */
export const UMBRA_LOCALE_OPTIONS: LocaleSelectOption[] = UMBRA_LOCALES.map(
  (loc) => ({ locale: loc as Locale, nativeName: UMBRA_LOCALE_NATIVE[loc] }),
);
