/**
 * PostCSS config for the website portal.
 *
 * The @vxture/design-system stylesheets are authored for Tailwind v4: they
 * `@import "tailwindcss"` and declare design tokens inside `@theme {}` blocks
 * (typography sizes, font-family slots, theme colors). Those blocks only become
 * real `:root` custom properties after the Tailwind v4 compiler runs. Without
 * this plugin the browser drops every `@theme {}` block, leaving all
 * `--vx-typography-*` / `--font-*` tokens undefined (e.g. the brand wordmark
 * collapsing to the inherited 16px). This does not pull Tailwind utility
 * classes into our markup; it only materializes the DS token layer.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
