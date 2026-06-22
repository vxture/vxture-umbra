"use client";

import { useTheme } from "@vxture/design-system";
import { useLocale } from "./locale-provider";
import { usePreferenceLiveSync } from "./preferences";

/**
 * Mount once inside the providers (console / admin). Bridges the shared locale
 * context and the DS theme context to the cross-subdomain preference cookies so
 * a change made elsewhere is reflected here on load and live across same-origin
 * tabs. Renders nothing.
 */
export function PreferenceSync() {
  const { setLocale } = useLocale();
  const { setMode, setDensity } = useTheme();
  usePreferenceLiveSync({ setLocale, setMode, setDensity });
  return null;
}
