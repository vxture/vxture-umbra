import { NetworkCanvas } from "@/components/network-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ruyinBrand } from "@/lib/brand";

export default function HomePage() {
  return (
    <div className="ruyin-page">
      <NetworkCanvas />
      <SiteHeader />
      <main className="body-section">
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow">Ruyin Digital Entry</div>
          <div className="signature">
            <img
              className="signature-art"
              src={ruyinBrand.signatureSrc}
              alt={ruyinBrand.fullName}
            />
          </div>
          <h1 id="hero-title" className="hero-title">
            {ruyinBrand.fullName}
          </h1>
          <p className="lead">如影智能入口，连接 Hermes 智能工作台。</p>
          <a className="hero-action" href={ruyinBrand.hermesUrl}>
            打开 Hermes
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
