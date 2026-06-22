"use client";

import type { ReactNode } from "react";
import { ThemeProvider, ToastProvider } from "@vxture/design-system";
import { LocaleProvider } from "./locale-provider";
import { PreferenceSync } from "./preference-sync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultMode="system" defaultDensity="default">
      <LocaleProvider>
        <ToastProvider>
          <PreferenceSync />
          {children}
        </ToastProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
