/** Absolute URL to the Ruyin symbol PNG for the given resolved theme. */
export function markSrc(resolved: string): string {
  return resolved === "dark"
    ? "/assets/brand/ruyin-symbol-dark.png"
    : "/assets/brand/ruyin-symbol-light.png";
}

/** Shared Ruyin brand metadata. Mirrors the website portal so the console
 *  header/footer chrome renders identically. */
export const ruyinBrand = {
  productDomain: "ruyin.ai",
  studioUrl: "https://vxture.com",
  copyright: "(c) 2026 vxture studio, inc. All rights reserved.",
  legalLinks: [
    ["Terms of Service", "https://vxture.com/legal/terms"],
    ["Privacy Policy", "https://vxture.com/legal/privacy"],
    ["Copyright Policy", "https://vxture.com/legal/copyright"],
    ["Brand Policy", "https://vxture.com/legal/brand"],
    ["Cookie Policy", "https://vxture.com/legal/cookies"],
  ],
} as const;
