import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ruyinBrand } from "@/lib/brand";
import "@vxture/design-system/styles/globals.css";
import "./globals.css";

export const metadata: Metadata = {
  title: `${ruyinBrand.fullName} ${ruyinBrand.productName}`,
  description: ruyinBrand.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body>{children}</body>
    </html>
  );
}
