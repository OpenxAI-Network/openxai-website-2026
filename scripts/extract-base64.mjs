// Extract inline base64 data URLs from saved HTML to separate files in /assets/.
// Replaces each data URL with a content-hashed local path so:
//   - HTML shrinks (large pages drop 90%+)
//   - browser can cache + parallelize asset loading
//   - identical images dedupe automatically (same sha256 -> same filename)

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'public', 'assets');

const TARGETS = argv.slice(2);
if (!TARGETS.length) {
  console.error('usage: node extract-base64.mjs <html-file> [html-file...]');
  exit(1);
}

const MIME_EXT = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4':  'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav':  'wav',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
};

// matches:  data:<mime>;base64,<...>
// minimum 100 chars of base64 (skip tiny inline icons that aren't worth extracting)
const RE = /data:([a-zA-Z0-9+\-./]+);base64,([A-Za-z0-9+/=]{100,})/g;

const dedupe = new Map();    // hash -> filename (for stats)
let totalSavings = 0;
let totalExtractions = 0;

for (const file of TARGETS) {
  if (!existsSync(file)) {
    console.warn(`  ✗ not found: ${file}`);
    continue;
  }

  const sizeBefore = (await stat(file)).size;
  let html = await readFile(file, 'utf8');
  const matches = [];

  // collect all matches with positions to avoid replacing inside replacements
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(html)) !== null) {
    matches.push({ full: m[0], mime: m[1], b64: m[2] });
  }

  if (!matches.length) {
    console.log(`  • ${file}: no inline base64 — skipped`);
    continue;
  }

  let extractions = 0;
  let totalB64Bytes = 0;
  // sort by length desc so longest replacements happen first (avoids partial overlap)
  matches.sort((a, b) => b.full.length - a.full.length);

  for (const { full, mime, b64 } of matches) {
    if (!html.includes(full)) continue; // already replaced
    const ext = MIME_EXT[mime.toLowerCase()] || 'bin';
    const buf = Buffer.from(b64, 'base64');
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const fname = `inlined-${hash}.${ext}`;
    const out = join(ASSETS_DIR, fname);
    if (!existsSync(out)) {
      await writeFile(out, buf);
    }
    dedupe.set(hash, fname);

    // replace ALL occurrences of this exact data URL in the HTML
    const localPath = `/assets/${fname}`;
    let count = 0;
    while (html.includes(full)) {
      html = html.replace(full, localPath);
      count++;
    }
    extractions += count;
    totalB64Bytes += full.length * count;
  }

  await writeFile(file, html);
  const sizeAfter = (await stat(file)).size;
  const saved = sizeBefore - sizeAfter;
  totalSavings += saved;
  totalExtractions += extractions;
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`  ✓ ${file}`);
  console.log(`      ${extractions} blobs extracted  ·  ${mb(sizeBefore)} MB -> ${mb(sizeAfter)} MB  (saved ${mb(saved)} MB)`);
}

console.log();
console.log(`total: ${totalExtractions} extractions across ${TARGETS.length} files, ${dedupe.size} unique assets, ~${(totalSavings/1024/1024).toFixed(1)} MB saved`);
