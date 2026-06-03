/** Absolute URL to the Ruyin symbol PNG for the given resolved theme. */
export function markSrc(resolved: string): string {
  return resolved === "dark"
    ? "/assets/brand/ruyin-symbol-dark.png"
    : "/assets/brand/ruyin-symbol-light.png";
}

/** Absolute URL to the Ruyin hero PNG for the given resolved theme. */
export function signatureSrc(resolved: string): string {
  return resolved === "dark"
    ? "/assets/brand/ruyin-hero-dark.png"
    : "/assets/brand/ruyin-hero-light.png";
}

export const ruyinBrand = {
  productName: "Ruyin",
  localName: "如影",
  fullName: "如影随形",
  description: "Ruyin intelligent entry for Hermes workspace.",
  hermesUrl: "https://hermes.vxture.com",
  copyright: "© 2026 vxture studio, inc. All rights reserved.",
  legalLinks: [
    ["Terms of Service", "https://vxture.com/legal/terms"],
    ["Privacy Policy", "https://vxture.com/legal/privacy"],
    ["Copyright Policy", "https://vxture.com/legal/copyright"],
    ["Brand Policy", "https://vxture.com/legal/brand"],
    ["Cookie Policy", "https://vxture.com/legal/cookies"],
  ],
} as const;
