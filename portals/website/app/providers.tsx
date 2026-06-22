"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@vxture/design-system";
import { LocaleProvider } from "@/lib/locale-provider";
import { PreferenceSync } from "@/components/preference-sync";

/**
 * Root providers for the Ruyin website.
 *
 * - ThemeProvider from @vxture/design-system wraps next-themes and adds density.
 * - LocaleProvider manages en-US / zh-CN toggling (ja-JP is not in @vxture/shared).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultMode="system" defaultDensity="default">
      <LocaleProvider>
        <PreferenceSync />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}
