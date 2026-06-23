"use client";

import type { ReactNode } from "react";
import {
  FullscreenProvider,
  ThemeProvider,
  ToastProvider,
} from "@vxture/design-system";
import { LocaleProvider } from "./locale-provider";
import { PreferenceSync } from "./preference-sync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultMode="system" defaultDensity="default">
      <LocaleProvider>
        <ToastProvider>
          {/* FullscreenProvider backs the header's ShellFullscreenToggle. */}
          <FullscreenProvider>
            <PreferenceSync />
            {children}
          </FullscreenProvider>
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
