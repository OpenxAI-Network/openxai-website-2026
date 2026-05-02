# openxai-website-2026

Astro rebuild of [openxai.org](https://openxai.org), migrating off Framer.

## Stack

- Astro 6 + Node SSR (matches `x-studio/apps/buildnow` pattern)
- Tailwind 3 + Inter font
- React 19 islands for any interactive bits
- Playwright for visual capture + pixel-diff verification
- Nix flake + NixOS module for xnode deployment

## Layout

```
openxai-website-2026/
├── astro-app/             # the site
│   ├── src/{components,layouts,pages,lib,styles}
│   ├── scripts/
│   │   ├── capture.mjs    # Playwright: scrape live openxai.org as visual spec
│   │   └── pixmatch.mjs   # Playwright: diff local build vs captured baseline
│   └── _capture/          # capture output (gitignored)
├── flake.nix
├── nix/{package.nix,nixos-module.nix}
└── xnode-config/
```

## Workflow

```bash
cd astro-app
npm install
npm run capture        # 1. snapshot live openxai.org at 4 breakpoints (one-time)
npm run dev            # 2. build sections against the captured screenshots
npm run pixmatch       # 3. diff local vs baseline, iterate until <0.1% pixel diff
npm run build
```

## Migration approach

Framer source is not exportable, so we rebuild section-by-section against
Playwright-captured screenshots of the live site. The pixel-diff harness
verifies fidelity at 375 / 768 / 1280 / 1920 viewports.
