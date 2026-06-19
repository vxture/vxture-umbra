/**
 * Hero signature wordmark ("Ruyin" calligraphy) as an inline SVG. Inlining lets
 * it recolor instantly with the theme instead of swapping a per-theme PNG, which
 * reloaded an image and stuttered on every theme toggle. Per-theme look: light =
 * solid brand blue via currentColor; dark = a luminous cool-blue metallic
 * gradient (the #ruyin-hero-dark-fill gradient below, applied by
 * .dark .hero-signature-art in globals.css) that glows against the dark navy
 * background while staying in the brand hue. Decorative: the accessible name is
 * the sr-only <h1> in hero-section.tsx, so this is aria-hidden. Source:
 * brand/ruyin-hero.svg.
 */
export function HeroSignature() {
  return (
    <svg
      className="hero-signature-art"
      viewBox="0 0 720 360"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Dark-theme fill: a luminous cool-blue metallic gradient built from DS
            brand-scale tokens, so it stays in sync with the palette and needs no
            raw colors. Highlight -> vivid -> deep -> highlight gives the sheen. */}
        <linearGradient id="ruyin-hero-dark-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--vx-color-brand-200)" />
          <stop offset="40%" stopColor="var(--vx-color-brand-400)" />
          <stop offset="58%" stopColor="var(--vx-color-brand-500)" />
          <stop offset="100%" stopColor="var(--vx-color-brand-300)" />
        </linearGradient>
      </defs>
      <path d="m281 82 3 7 7 20c2 7 4 16 6 19 4 11 4 12-3 13q-6 0-2 11 0 10 8 1c9-8 25-16 19-9l-9 11-10 10q-8 5-4 11c1 5 1 6-13 15q-17 12-11 20c3 3 14 1 18-3 3-3 3-3 19-3 18 1 19 0 20-23 1-11 1-11 7-18l12-14q16-21 9-7l-5 13-5 10c-4 7 0 16 5 11 9-7 16-7 12 1-5 11-7 14-11 17q-8 7-5 14c2 6 1 6 17 2 6-1 0 4-35 27a160 160 0 0 1-128 27c-2 3 35 14 44 14l5 1q1 3 18-1c11-3 11-3 9-1q-6 4 5 0l17-8 3-2c2 0 18-9 25-15 7-5 18-12 25-15l7-4 6-3c4 0 13-5 12-7l4-5c8-8 2-25-8-21q-7 3-3-3c6-8 11-21 8-22l-1-3c0-6-11-12-16-9-7 3-6-1 6-26l5-5q7-2 1-7-8-6-12 0l-3 4-9 8c-16 15-16 15-18 14h-6l-2 1-1 1-1 1c-1-1 18-20 21-22q3-2 1-4-3-3 2-9 12-15 10-24c-4-15-53-3-53 12q-1 7-3-1c-2-16-15-31-19-22m67 10c5 1-10 29-17 31q-7 3-4-6 3-4 1-9-3-15-5 0c0 8-11 25-14 20-2-3-2-19 0-22 4-9 28-18 39-14m-26 93-2 9c-2 2-22 5-22 3q1-4 12-12l9-7q4-6 3 7m240-76c-5 4-16 16-16 18q0 3 4-2c5-8 18-13 17-7l-4 10-17 28q-9 15 12 8 20-7-6 15-11 9-7 13 3 5 5 1c1-2 19-10 20-9 2 3-21 20-29 22l-6 1-12 2q-15 1-24 9-3 4 5 1c5-1 24 0 28 2 3 2 17 1 24-2l6-7 7-10c12-14 14-19 10-23q-3-6-9-1-15 7-6-3 24-26 4-22-7 1-1-5 24-28 7-39-6-6-12 0" />
      <path d="m460 111-2 2c0 10-9 21-18 21-6 0-1 10 5 10q3 0 1 8l-2 10q-1 7-3 1c-4-8-12-14-12-10 0 2 5 9 7 11q4 3-2 7t1 10q9 5-7 12-8 5-7 0 1-1-1-11-4-27 9-40 8-8-6-9-3-2-13 5l-16 8q-10 3-2 9c3 3 3 3 3 23 0 32 8 44 12 18l2-7c1 0 9 9 8 10q-2 4 13 7l19 4c23 6 47 3 56-7 6-5-11-8-32-4-10 1-44 1-48-1l6-3q18-7 8-15-6-5 1-10 5-6 4 7 0 17 6 18 6-1 7-7-1-5 5 1 12 14 13-13 3-27-7-25-12 3-16 30 0 8-2 7c-4 0-1-22 4-29l2-4q1-9 11-12 6-1 11-4l9-6q11-6-5-11-7-1-7-4-7-12-15-7m-47 48q-1 9 2 24v4q-3 0-5-5 0-3-3-1c-2 2-6-5-6-11 0-10 1-12 6-14l4-3q2-4 2 6m-218-47q-6 3-4 7c7 15-7 38-14 24-12-22-19-10-10 16 2 4 2 4-6 12-12 14-15 20-10 28l5 9q4 10 13 4c4-2 15-19 17-24h6q14 2 6-9c-4-5-4-6 3-20l7-17q1-5 6-6c7-2 8 1 6 24q-3 26 8 13 4-9 7-1 4 6 12 7 7 1 1 2-7 1-1 3c11 1 41-27 37-34l-1-3c0-4-10-12-16-14-8-2-27 10-35 22q-7 9-6 2 6-29-10-24-6 3-4-4 1-9-2-14c-4-3-12-5-16-3m66 30c3 5-15 23-22 22q-7 0-1-7c9-12 21-20 23-15m-85 33c4 7 4 9-3 27q-4 13-13-4c-6-12 9-33 16-23" />
      <path d="m528 127-26 10c-7 2-3 11 4 11 6 0 4 10-3 14-10 5-11 19-1 15l4-1 1 5q3 17 8 7c2-4 3-9 1-6v2l-2 1c-2 0-3-10-1-12q12-8 10 3c-2 10 3 15 5 5 3-18 4-19 9-22q9-6 2-5c-4 0-4-8 0-12v-2l5-8 1-2q0-3-2-1-1 2-3-1-3-3-13-1" />
    </svg>
  );
}
