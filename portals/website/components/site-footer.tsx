import { ruyinBrand } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-copy">{ruyinBrand.copyright}</p>
        <nav className="footer-links" aria-label="Legal links">
          {ruyinBrand.legalLinks.map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
