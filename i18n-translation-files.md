---
name: i18n-translation-files
description: "In-house i18n — per-portal messages/{en-US,zh-CN}.json + useTranslations from @umbra/shared/i18n; ASCII-exempt gotcha"
metadata: 
  node_type: memory
  type: project
  originSessionId: 03a76e6a-6260-4afc-b2d0-8e515c19ebee
---

The three portals use an in-house i18n (no next-intl). UI copy lives in
independent JSON, NOT hardcoded in components. Built + shipped 2026-06-24
(PR #141, main).

**How it works**
- Core: `@umbra/shared/i18n` (`portals/packages/shared/src/i18n.tsx`) exports
  `I18nProvider` + `useTranslations(namespace)` -> `t(key, vars?)` ({var}
  interpolation) + `t.raw(key)` (arrays/objects). Driven by the shared
  `useLocale()`.
- Strings: `portals/<portal>/messages/{en-US,zh-CN}.json` + `index.ts`,
  namespaced per feature (website: header/hero/account; console:
  header/account/tenant/personalInfo; admin: shell/invites).
- Wiring: each `app/layout.tsx` wraps children in `<I18nProvider messages={messages}>`
  INSIDE `<Providers>` (needs `useLocale`). To localize a component:
  `const t = useTranslations("<ns>")` then `t("key")`.
- `website/lib/locale-provider.tsx` is now a RE-EXPORT of
  `@umbra/shared/locale-provider` (was a duplicate) so all portals share ONE
  locale context.

**Gotchas (don't re-trip)**
- `zh-CN.json` is non-ASCII. Guardrail `06-check-deploy-contracts.py` ASCII-scans
  `portals`; the three `portals/*/messages` dirs are exempted via
  `LOCALIZED_CONTENT_PREFIXES`. New non-ASCII content must live under an exempt
  prefix (also website/app|components|lib|public, console/app, admin/app).
- 06 asserts admin invite labels: `inviteUrl` on `admin-app.tsx`; the 4 phrases
  ("Invite link"/"Subscription URL"/"Copy link"/"Copy code") on
  `admin/messages/en-US.json`. Keep both.
- Locales are umbra-LOCAL, not `@vxture/shared` (its `Locale` is pinned to
  en-US/zh-CN). The set lives in `@umbra/shared/locales`
  (`UmbraLocale = Locale | "ja-JP"`, `UMBRA_LOCALES`, `UMBRA_LOCALE_NATIVE`,
  `UMBRA_LOCALE_OPTIONS`). Live locales (2026-06-24, PR #142): en-US, zh-CN, ja-JP.
- Add a locale: (1) add it to `UMBRA_LOCALES` + native name in
  `packages/shared/src/locales.ts`; (2) drop `<locale>.json` per portal + list in
  `messages/index.ts`. The header `ShellLocaleSwitcher` + account
  `ShellPreferencePanel` already consume `UMBRA_LOCALE_OPTIONS` (all locales).
- DS boundary: ja-JP is cast `as Locale` at `ShellLocaleSwitcher`/
  `ShellPreferencePanel` (DS treats it as an opaque cookie/display string).
- `packages/shared/src/locales.ts` is ALSO 06-ASCII-exempt (holds CJK native
  names). The tool/shell mangles literal `\uXXXX` escapes - just exempt the file
  and keep readable CJK.
- SonarCloud (non-required) flags the parallel en/zh JSON + identical
  `messages/index.ts` as duplication; expected, non-blocking. See
  [[sonarcloud-duplication-gate]].
