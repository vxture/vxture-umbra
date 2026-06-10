import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Funnel_Display } from "next/font/google";
import { ruyinBrand } from "@/lib/brand";
import { themeBootstrapScript } from "@vxture/design-system";
import { Providers } from "./providers";
import "@vxture/design-system/styles/globals.css";
import "@vxture/design-system/styles/brands/ruyin.css";
import "./globals.css";

/** DS brand typeface (Funnel Display) wired to the DS brand-font loader slot. */
const brandFont = Funnel_Display({
  subsets: ["latin"],
  variable: "--vx-font-loader-brand",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ruyin.ai"),
  title: `${ruyinBrand.fullName} ${ruyinBrand.productName}`,
  description: ruyinBrand.description,
  icons: {
    icon: "/favicon.ico",
    apple: "/assets/brand/ruyin-symbol-dark.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: `${ruyinBrand.productName} - ${ruyinBrand.fullName}`,
    description: ruyinBrand.description,
    siteName: ruyinBrand.productName,
    images: [{ url: "/assets/brand/ruyin-hero-light.png", width: 720, height: 360 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${ruyinBrand.productName} - ${ruyinBrand.fullName}`,
    description: ruyinBrand.description,
    images: ["/assets/brand/ruyin-hero-light.png"],
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
