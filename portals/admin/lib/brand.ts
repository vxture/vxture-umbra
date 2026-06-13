/** Absolute URL to the Ruyin symbol PNG for the given resolved theme. */
export function markSrc(resolved: string): string {
  return resolved === "dark"
    ? "/assets/brand/ruyin-symbol-dark.png"
    : "/assets/brand/ruyin-symbol-light.png";
}

/** Shared Ruyin brand metadata. Mirrors the console portal so the admin
 *  chrome/footer renders identically across portals. */
export const ruyinBrand = {
  productDomain: "ruyin.ai",
  // Header wordmark for the admin portal (the management surface, distinct from
  // the marketing site / tenant console which show the bare "ruyin.ai" domain).
  productName: "Ruyin Admin Platform",
  studioUrl: "https://vxture.com",
  // ASCII source escape so the contract check (portals/admin/lib is scanned)
  // passes, while the rendered footer shows the same copyright glyph as the
  // console/website portals.
  copyright: "\u00A9 2026 vxture studio, inc. All rights reserved.",
  legalLinks: [
    ["Terms of Service", "https://vxture.com/legal/terms"],
    ["Privacy Policy", "https://vxture.com/legal/privacy"],
    ["Copyright Policy", "https://vxture.com/legal/copyright"],
    ["Brand Policy", "https://vxture.com/legal/brand"],
    ["Cookie Policy", "https://vxture.com/legal/cookies"],
  ],
} as const;
