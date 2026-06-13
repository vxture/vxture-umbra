"use client";

import type { ReactNode } from "react";
import { ThemeProvider, ToastProvider } from "@vxture/design-system";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultMode="system" defaultDensity="default">
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
