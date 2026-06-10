"use client";

import { NetworkCanvas } from "@/components/network-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useTheme } from "@vxture/design-system";
import { useLocale } from "@/lib/locale-provider";
import { ruyinBrand, signatureSrc } from "@/lib/brand";
import type { Locale } from "@vxture/shared";

const HERO_TEXT: Record<Locale, { eyebrow: string; lead: string; action: string }> = {
  "en-US": {
    eyebrow: "Ruyin Digital Entry",
    lead: "Secure, intelligent network access by vxture studio.",
    action: "VXTURE STUDIO",
  },
  "zh-CN": {
    eyebrow: "如影数字入口",
    lead: "如影智能安全入口，连接你与世界。",
    action: "VXTURE STUDIO",
  },
};

export default function HomePage() {
  const { theme } = useTheme(); // resolved light/dark
  const { locale } = useLocale();
  const text = HERO_TEXT[locale] ?? HERO_TEXT["en-US"];

  return (
    <div className="ruyin-page">
      <NetworkCanvas />
      <SiteHeader />
      <main className="body-section">
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow">{text.eyebrow}</div>
          <div className="signature">
            <img
              className="signature-art"
              src={signatureSrc(theme)}
              alt={ruyinBrand.fullName}
            />
          </div>
          <h1 id="hero-title" className="hero-title">
            {ruyinBrand.fullName}
          </h1>
          <p className="lead">{text.lead}</p>
          <a className="hero-action" href={ruyinBrand.studioUrl}>
            {text.action}
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
