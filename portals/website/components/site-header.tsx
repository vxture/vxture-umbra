"use client";

import { useEffect, useState } from "react";
import { ruyinBrand } from "@/lib/brand";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 50);
    update();
    window.addEventListener("scroll", update);
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={`site-header${isScrolled ? " is-scrolled" : ""}`}
      aria-label={ruyinBrand.productName}
    >
      <div className="site-header-inner">
        <a
          className="vx-brand-lockup"
          href="/"
          aria-label={`${ruyinBrand.productName} home`}
        >
          <img className="vx-brand-mark" src={ruyinBrand.markSrc} alt="" />
          <span className="vx-brand-name">{ruyinBrand.productName}</span>
          <span className="vx-brand-separator" aria-hidden="true">
            |
          </span>
          <span className="vx-brand-local-name">{ruyinBrand.localName}</span>
        </a>

        <div className="site-tools" aria-label="Display controls">
          <button
            className="site-tool-button"
            type="button"
            aria-label="Switch language"
            title="Switch language"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
          <button
            className="site-tool-button"
            type="button"
            aria-label="Switch theme"
            title="Switch theme"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
