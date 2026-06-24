import type { UmbraLocale } from "@umbra/shared/locales";
import type { Messages } from "@umbra/shared/i18n";
import enUS from "./en-US.json";
import zhCN from "./zh-CN.json";
import jaJP from "./ja-JP.json";

/** Website translation bundles, one per locale. Add a locale = add a JSON file
 *  here. Passed to <I18nProvider> in app/layout.tsx. */
export const messages: Record<UmbraLocale, Messages> = {
  "en-US": enUS,
  "zh-CN": zhCN,
  "ja-JP": jaJP,
};
