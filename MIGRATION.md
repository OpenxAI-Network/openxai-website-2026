# OpenxAI Website — Framer → Astro Migration

## Goal

Migrate the OpenxAI marketing site (`https://openxai.org`) off Framer onto a
self-hosted Astro app deployable to xnode infrastructure. **Zero spend** on
font licenses, Framer plugins, or third-party export tools.

## Status (2026-05-02)

| Aspect | Status |
|---|---|
| **Visual fidelity** | ✅ 100% pixel-perfect to live site (user-confirmed) |
| **Spline 3D globe** | ✅ Renders in real browsers (false negative in Playwright headless — WebGL disabled there) |
| **Hero looping video + section videos** | ✅ Plays |
| **All 4 pages migrated** | ✅ `/`, `/about-us`, `/industry-gaps-and-untapped-opportunities`, `/openxais-innovation-breakthroughs` |
| **Sovereignty (runtime)** | ✅ 0 requests to Framer/Figma hosts. Only externals: `api.dexscreener.com` (live $OPENX price) and `prod.spline.design` (Spline 3D engine, kept on purpose) |
| **Static source code clean** | ✅ Zero `framer.com` / `framerusercontent.com` / `framerstatic.com` / `figma.com` URL refs in HTML/CSS/JS |
| **Cybersec scan** | ✅ Clean — no API keys, JWTs, private IPs, local paths, or secrets in committable content |
| **Repo size for GitHub** | ✅ 78.2 MB / 433 files — zero files >10 MB, no GitHub size warnings |
| **Form submissions** | ❌ Disabled (Framer's form endpoint stripped). If forms are needed, wire to a separate backend. |
| **xnode deployment** | ⏳ Nix flake exists; ready for `om app deploy` |
| **openmesh.network migration** | ⏳ Pending — same process to repeat |

## Repo layout

```
openxai-website-2026/
├── astro-app/                    # Astro 6 + Node SSR adapter
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro                            # serves public/index.html
│   │   │   ├── about-us.astro                         # serves public/about-us/index.html
│   │   │   ├── industry-gaps-and-untapped-opportunities.astro
│   │   │   ├── openxais-innovation-breakthroughs.astro
│   │   │   └── v2.astro                               # parked: hand-built Astro rebuild (kept for future)
│   │   ├── components/                                # parked Astro components from V2 attempt
│   │   ├── layouts/RootLayout.astro
│   │   ├── lib/utils.ts
│   │   └── middleware.ts                              # permissive headers; CSP loosened for migrated bundle
│   ├── public/                   # SELF-HOSTED EVERYTHING
│   │   ├── index.html            # rewritten saved-page-as for /
│   │   ├── about-us/index.html
│   │   ├── industry-gaps-and-untapped-opportunities/index.html
│   │   ├── openxais-innovation-breakthroughs/index.html
│   │   ├── assets/               # FLATTENED bucket — all assets hard-linked here so /assets/<file> works
│   │   ├── fonts/                # 83 woff2 (General Sans + Inter variants stripped from framerstatic)
│   │   ├── scripts/              # 33+ Framer .mjs bundles + spline-viewer.js + phosphor-icons + _noop.mjs
│   │   ├── images/               # 152 webp/png/svg/jpg
│   │   ├── videos/               # 5 webm/mp4
│   │   └── css/                  # extracted styles
│   ├── scripts/
│   │   ├── rewrite-saved.mjs     # rewrites browser-saved HTML to use local paths
│   │   ├── patch-empty-imports.mjs  # fixes empty module specifiers in JS bundles
│   │   ├── capture.mjs           # Playwright reference capture
│   │   └── pixmatch.mjs          # Playwright pixel-diff harness
│   ├── astro.config.mjs          # output: 'server', adapter: @astrojs/node
│   ├── tailwind.config.js
│   ├── package.json
│   └── .nvmrc                    # 22 (matches xnode nodejs_22 deployment)
├── website-save/                 # USER MANUALLY SAVES PAGES HERE
│   ├── OpenxAI Network _ The Open and Borderless AI Network.html  +  *_files/
│   ├── about-us - ...html  +  *_files/
│   ├── industry-gaps-... .html  +  *_files/
│   └── openxais-innovation-... .html  +  *_files/
├── flake.nix                     # Nix flake matching x-studio/apps/buildnow pattern
├── nix/{package.nix,nixos-module.nix}
└── xnode-config/{hostname,host-platform,state-version}
```

## Migration approach: "browser save + scrub"

The core trick — **chosen after rejecting paid Framer plugins (unframer, MCP, React Export)
and abandoning a hand-rebuild as too slow**:

1. **User does ⌘S → "Webpage, Complete"** in Chrome on each page of the live site.
2. **`scripts/rewrite-saved.mjs`** processes each saved HTML:
   - Rewrites `framerusercontent.com/...` URLs → local `/{fonts,scripts,images,videos}/<file>`.
   - Rewrites `app.framerstatic.com/...` URLs → local.
   - Rewrites `prod.spline.design/<id>/scene.splinecode` → local `/assets/<id>_scene.splinecode`.
   - Strips Framer editor bootstrap script + generator meta tag.
   - Copies all referenced files from saved `_files/` into `/public/` buckets by extension.
3. **Pull missing assets** the saved page didn't capture (responsive image variants, dynamic JS modules, fonts, Spline scene files).
4. **Patch JS bundles** in-place (sed) to replace any string-literal Framer URLs with local paths. Includes:
   - `framerusercontent.com` (all subpaths)
   - `framerstatic.com` (Inter font variants — all 7 unicode ranges)
   - `framer.com/edit/init.mjs` → `/scripts/_noop.mjs`
   - `framer.com/m/phosphor-icons/<X>.js` → `/assets/<X>.js`
   - `api.framer.com/forms/.../submit` → `data:,` (forms disabled)
   - `frameruni.link/ds` → `data:,`
5. **Flatten asset folders**: hard-link all files in `fonts/`, `scripts/`, `images/`, `videos/` into `/assets/` so any code path expecting `/assets/<file>` works regardless of the original bucket.
6. **`pages/<route>.astro`** reads the rewritten HTML and returns it as a `Response`.

## Key scripts

### `scripts/rewrite-saved.mjs`
Run for each saved page:
```bash
node scripts/rewrite-saved.mjs \
  "../website-save/<saved-page>.html" \
  "public/<route>/index.html"
```
Now writes everything to `/public/assets/` (single canonical folder, no buckets).

### `scripts/patch-js-bundles.mjs`
Strips ALL Framer hostnames from the saved JS bundles in one pass:
- `framerusercontent.com/{modules,sites,images,assets,...}` → `/assets/<file>`
- `app.framerstatic.com/<file>` → `/assets/<file>`
- `framer.com/m/phosphor-icons/<X>.js@<ver>` → `/assets/<X>.js`
- `framer.com/edit/init.mjs` → `/assets/_noop.mjs`
- `api.framer.com/...` and `frameruni.link/...` → `data:,` (neutralized)

```bash
node scripts/patch-js-bundles.mjs
```

### `scripts/extract-base64.mjs`
Extracts inline `data:<mime>;base64,...` blobs from HTML to separate hashed files.
Index.html dropped from 57 MB → 0.9 MB (98% shrink) — most of those bytes were
inline-encoded PNGs.

```bash
node scripts/extract-base64.mjs public/index.html public/about-us/index.html ...
```

### `scripts/patch-empty-imports.mjs`
Fixes empty module specifiers (`import("")`) left over from URL stripping.

### `scripts/capture.mjs` + `scripts/pixmatch.mjs`
Playwright reference capture + pixel-diff harness.

### To process a NEW page (e.g. `/foo`)
1. Open `https://openxai.org/foo` in Chrome → ⌘S → save into `website-save/`.
2. Run `node scripts/rewrite-saved.mjs "../website-save/foo - ...html" "public/foo/index.html"`.
3. Run `node scripts/patch-js-bundles.mjs` (catches new Framer bundle URL leaks).
4. Run `node scripts/extract-base64.mjs public/foo/index.html` (shrinks page).
5. Create `src/pages/foo.astro` that reads `public/foo/index.html` and returns it as `Response`.

## Deploy to xnode-1 via `om` CLI

```bash
# 1. Push the repo (one-time)
cd openxai-website-2026
git init
git add .
git commit -m "Initial migration of openxai.org to self-hosted Astro"
git branch -M main
git remote add origin https://github.com/johnforfar/openxai-website-2026.git
git push -u origin main

# 2. Deploy to xnode-1
om app deploy openxai-website --flake github:johnforfar/openxai-website-2026
om app expose openxai-website \
  --domain openxai-website.build.openmesh.cloud \
  --port 8080

# 3. Verify
open https://openxai-website.build.openmesh.cloud
```

## Sovereignty audit

```bash
cd astro-app
npm run dev   # http://localhost:3001
# In another terminal:
node -e "...playwright host audit..."
```

Expected output:
```
localhost:3001          (self)
api.dexscreener.com     (live $OPENX price)
prod.spline.design      (Spline 3D engine, optional)
```

**Banned hosts (must be 0)**: `framer.com`, `framerusercontent.com`, `framerstatic.com`, `api.framer.com`, `frameruni.link`, `figma.com`.

## Known gaps / future work

1. **Forms are disabled.** The Framer form endpoint was stripped. Wire to your own backend if needed.
2. **Spline 3D engine** still loads from `prod.spline.design` at runtime (textures, runtime). Could be self-hosted by ripping all Spline runtime requests too — not done because Spline is a separate company from Framer and the user explicitly wanted to keep it.
3. **Dexscreener** price ticker hits `api.dexscreener.com`. Kept intentionally for live $OPENX price.
4. **Hand-rebuild parked at `/v2`** — clean Astro components if we ever want to refactor away from the Framer bundle entirely.
5. **`openmesh.network`** — same process to repeat.

## Stack alignment with `/openx-2026`

- **Astro 6 + @astrojs/node SSR** (matches `x-studio/apps/buildnow`)
- **Node 22** locally via `.nvmrc` (matches `pkgs.nodejs_22` in all Nix package.nix in fleet)
- **Nix flake + nixosModule** (matches `x-studio/apps/*` deployment pattern)
- **xnode-config** trio (`hostname`/`host-platform`/`state-version`) — ready for xnode deployment

## Run locally

```bash
cd astro-app
nvm use                # picks up .nvmrc → Node 22
npm install
npm run dev            # http://localhost:3001
```
