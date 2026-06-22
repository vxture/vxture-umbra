import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Funnel_Display } from "next/font/google";
import { themeBootstrapScript } from "@vxture/design-system";
import "@vxture/design-system/styles/globals.css";
import "@vxture/design-system/styles/brands/ruyin.css";
import "./globals.css";
import { Providers } from "@umbra/shared/providers";

/** DS brand typeface (Funnel Display) wired to the DS brand-font loader slot. */
const brandFont = Funnel_Display({
  subsets: ["latin"],
  variable: "--vx-font-loader-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ruyin Admin",
  description: "Ruyin VPN & password management",
  icons: {
    icon: "/favicon.ico",
    apple: "/assets/brand/ruyin-symbol-dark.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US" className={brandFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
