import { NetworkCanvas } from "@/components/network-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { HeroSection } from "@/components/hero-section";

/**
 * Homepage = three stacked sections over a full-viewport network backdrop:
 *   SiteHeader (64px) + HeroSection (fills) + SiteFooter (48px) = one screen.
 * Each section lives in its own component; this file only composes them.
 */
export default function HomePage() {
  return (
    <div className="ruyin-page">
      <NetworkCanvas />
      <SiteHeader />
      <HeroSection />
      <SiteFooter />
    </div>
  );
}
