"use client";

import { useTheme } from "@vxture/design-system";
import { usePreferenceLiveSync } from "@umbra/shared/preferences";
import { useLocale } from "@/lib/locale-provider";

/**
 * Bridges the website's own locale context and the DS theme context to the
 * cross-subdomain preference cookies, so a preference set on console / admin (or
 * another tab) is reflected here on load and live across same-origin tabs.
 * Mounted once inside Providers; renders nothing.
 */
export function PreferenceSync() {
  const { setLocale } = useLocale();
  const { setMode, setDensity } = useTheme();
  usePreferenceLiveSync({ setLocale, setMode, setDensity });
  return null;
}
