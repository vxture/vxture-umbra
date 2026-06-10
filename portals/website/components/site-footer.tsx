import { ShellLegalFooter } from "@vxture/design-system";
import { ruyinBrand } from "@/lib/brand";

export function SiteFooter() {
  return (
    <ShellLegalFooter
      className="site-footer"
      innerClassName="site-footer-inner"
      copyright={ruyinBrand.copyright}
      links={ruyinBrand.legalLinks.map(([label, href]) => ({ label, href }))}
    />
  );
}
