# Brand Assets

`brand/` is the canonical source for Ruyin visual assets. The project uses PNG
and ICO files only for brand images. Do not add Ruyin SVG brand assets.

## Required Source Files

| File | Required | Size in current pack | Used for |
|---|---:|---:|---|
| `brand/favicon.ico` | Yes | 64x64 | Browser favicon for website, console, admin, and guide |
| `brand/ruyin-symbol-dark.png` | Yes | 256x256 | Header/admin mark on dark surfaces |
| `brand/ruyin-symbol-light.png` | Yes | 256x256 | Header mark on light surfaces |
| `brand/ruyin-hero-dark.png` | Yes | 720x360 | Website hero/signature image in dark mode |
| `brand/ruyin-hero-light.png` | Yes | 720x360 | Website hero/signature image in light mode, Open Graph, Twitter card |
| `brand/vxture-logo-dark.png` | Optional | 256x256 | Reserved cross-brand mark |
| `brand/vxture-logo-light.png` | Optional | 256x256 | Reserved cross-brand mark |
| `brand/vxture-logo.png` | Optional | 256x256 | Reserved cross-brand mark |

## Propagation

Each portal keeps local development copies under `public/assets/brand/`.
Production Docker builds also inject the canonical `brand/` directory through
`brand_context=./brand`, then copy it into `public/assets/brand/`.

Favicon files are copied to:

- `portals/website/public/favicon.ico`
- `portals/console/public/favicon.ico`
- `portals/console/public/guide/favicon.ico`
- `portals/admin/public/favicon.ico`

## Adding New Material

When new material is needed, provide it first under `brand/` with the final file
name, format, and aspect ratio. Then sync the file into each portal that serves
it locally and update code references to use `/assets/brand/<file>.png` or
`/favicon.ico`.
