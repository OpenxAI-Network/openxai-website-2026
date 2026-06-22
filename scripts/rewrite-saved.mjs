// Rewrites a saved-page-as-complete HTML to use local asset paths.
//
// Handles BOTH:
//   - framerusercontent.com / app.framerstatic.com URLs  (CDN refs)
//   - "<savedfile>_files/<asset>" RELATIVE refs           (local saved-bundle refs)
//
// All assets get copied into /public/{fonts,scripts,css,images,videos}/ by extension
// and references rewritten to those paths.

import { readFile, writeFile, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, basename, join, extname } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const SRC  = argv[2];
const DEST = argv[3];

if (!SRC || !DEST) {
  console.error('usage: node rewrite-saved.mjs <source.html> <dest.html>');
  exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const FILES_DIR = SRC.replace(/\.html$/, '_files');

// All recognized assets land in a single /public/assets/ folder.
// Single canonical path simplifies git diffs, JS-bundle URL rewrites, and
// avoids hard-link doubling that bloats the repo.
function bucketFor(file) {
  const ext = (extname(file) || '').toLowerCase().slice(1);
  const known = new Set([
    'woff2','woff','ttf',           // fonts
    'mjs','js','json',              // scripts
    'css',                          // styles
    'webm','mp4',                   // videos
    'png','jpg','jpeg','webp','svg','gif','avif', // images
    'splinecode',                   // spline scenes
  ]);
  return known.has(ext) ? 'assets' : null;
}

async function copyFromSavedFiles(file) {
  const src = join(FILES_DIR, file);
  if (!existsSync(src)) return null;
  const bucket = bucketFor(file);
  if (!bucket) return null;
  const dst = join(PUBLIC, bucket, file);
  if (!existsSync(dst)) {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
  return `/${bucket}/${file}`;
}

let html = await readFile(SRC, 'utf8');

// 1) framerusercontent.com URLs ---------------------------------------------
html = html.replace(/https?:\/\/framerusercontent\.com\/[^"'\s)]+/g, (raw) => {
  const u = raw.replace(/&amp;/g, '&').replace(/\?[^"'\s)]*/g, '');
  const file = basename(u);
  const bucket = bucketFor(file) || 'images';
  return `/${bucket}/${file}`;
});

// 2) app.framerstatic.com URLs ----------------------------------------------
html = html.replace(/https?:\/\/app\.framerstatic\.com\/[^"'\s)]+/g, (raw) => {
  const u = raw.replace(/&amp;/g, '&').replace(/\?[^"'\s)]*/g, '');
  const file = basename(u);
  const bucket = bucketFor(file) || 'fonts';
  return `/${bucket}/${file}`;
});

// 3) relative <savedfile>_files/<asset> references --------------------------
//    (URL-encoded form: e.g. "OpenxAI%20Network%20_%20...%20Network_files/foo.mjs")
//    OR raw form when the HTML has actual spaces inside attribute values.
const filesBase = basename(FILES_DIR);
const filesBaseEnc = encodeURIComponent(filesBase);

const SAVED_REFS = new Set();
const reEnc = new RegExp(`${filesBaseEnc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"'\\s)?]+)`, 'g');
const reRaw = new RegExp(`${filesBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"'\\s)?]+)`, 'g');

for (const re of [reEnc, reRaw]) {
  let m;
  while ((m = re.exec(html)) !== null) SAVED_REFS.add(m[1]);
}

const copyResults = [];
for (const ref of SAVED_REFS) {
  const file = decodeURIComponent(ref);
  const newPath = await copyFromSavedFiles(file);
  copyResults.push({ ref, file, newPath });
}

// rewrite each unique reference
for (const { ref, file, newPath } of copyResults) {
  if (!newPath) continue;
  // both encoded and decoded forms can appear in the document
  const variants = new Set([ref, encodeURIComponent(file).replace(/%2F/g, '/')]);
  for (const v of variants) {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(
      new RegExp(`${filesBaseEnc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${escaped}`, 'g'),
      newPath,
    );
    html = html.replace(
      new RegExp(`${filesBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${escaped}`, 'g'),
      newPath,
    );
  }
}

// 4) strip Framer editor bootstrap ------------------------------------------
html = html.replace(
  /<script[^>]*>\s*try\s*\{\s*if\s*\(localStorage\.get\("__framer_force[\s\S]*?<\/script>/g,
  '',
);

// 5) strip <link>/<script> to framer.com / framerstatic.com -----------------
html = html.replace(
  /<(?:script|link)[^>]*(?:framer\.com|framerstatic\.com)[^>]*>(?:[\s\S]*?<\/script>)?/g,
  '',
);

// 5a) strip Framer preview editor bootstrap (only in *.framer.app preview saves)
//     script_main loads the editor canvas/editorbar — 404s as a standalone deploy
html = html.replace(/<script[^>]*script_main[^>]*>\s*<\/script>/g, '');
html = html.replace(/<script[^>]*script_main[^>]*>/g, '');

// 5a2) strip Framer event/telemetry scripts whose URL was scrubbed to an empty/dot
//      src (e.g. `<script src="./" data-fid=...>`) — they refetch the page as HTML
html = html.replace(/<script[^>]*\ssrc="\.?\/?"[^>]*>\s*<\/script>/g, '');
html = html.replace(/<script[^>]*\ssrc="\.?\/?"[^>]*>/g, '');

// 5b) strip browser-extension junk captured during the save (chrome-extension://)
html = html.replace(/<link[^>]*chrome-extension:\/\/[^>]*>/g, '');
html = html.replace(/["'][^"']*chrome-extension:\/\/[^"']*["']/g, '""');

// 6) cosmetic strips --------------------------------------------------------
html = html.replace(/<meta\s+name="generator"\s+content="Framer[^"]*"\s*\/?>/g, '');
html = html.replace(/\s+data-framer-(name|component|appear-id|search-index)="[^"]*"/g, '');

// 7) drop dangling refs to non-asset _files paths (e.g. .../js  .../script  .../edit.html)
//    these are folders or HTML pages that browser saved as side-effects; we never serve them.
html = html.replace(
  new RegExp(`${filesBaseEnc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"'\\s)]+`, 'g'),
  '',
);
html = html.replace(
  new RegExp(`${filesBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"'\\s)]+`, 'g'),
  '',
);

// 8) normalize malformed asset prefixes ('.//assets/', './assets/') to root-absolute
html = html.replace(/\.{1,2}\/+assets\//g, '/assets/');

// 9) strip Framer-preview-project domains so internal nav links resolve locally
//    (Ashton's redesign project; canonical/og already point at openxai.org)
for (const host of ['streamlined-plans-270737.framer.app']) {
  html = html.replace(new RegExp(`https?:\\/\\/${host.replace(/\./g, '\\.')}`, 'g'), '');
}

// 10) FINAL: drop scripts left with an empty/dot src by the strips above — they
//     refetch the page HTML and throw "Unexpected token '<'". Must run last.
html = html.replace(/<script[^>]*\ssrc="\.?\/?"[^>]*>\s*<\/script>/g, '');
html = html.replace(/<script[^>]*\ssrc="\.?\/?"[^>]*>/g, '');

await mkdir(dirname(DEST), { recursive: true });
await writeFile(DEST, html);

const banned = ['framer.com', 'framerusercontent.com', 'framerstatic.com', 'figma.com'];
const remaining = banned.filter((d) => html.includes(d));
const copied = copyResults.filter((c) => c.newPath).length;
console.log(`[rewrite] ${SRC.split('/').pop()}`);
console.log(`[rewrite]   wrote ${DEST}  (${html.length.toLocaleString()} bytes)`);
console.log(`[rewrite]   copied ${copied} bundle assets from _files/ to /public/`);
console.log(`[rewrite]   remaining banned domain refs: ${remaining.length === 0 ? 'NONE ✓' : remaining.join(', ')}`);
