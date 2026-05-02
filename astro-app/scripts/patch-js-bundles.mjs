// Comprehensively patch JS bundles to remove all framer*.com runtime URL leaks.
// Replaces every Framer/Framerstatic/Frameruni hostname with local /assets/<file>.

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { basename, join, extname } from 'node:path';

const ROOT = 'public/assets';

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (/\.(mjs|js)$/.test(e)) yield p;
  }
}

let totalChanges = 0;
let filesPatched = 0;

for (const f of walk(ROOT)) {
  let src = await readFile(f, 'utf8');
  const before = src;

  // 1. framerusercontent.com — every shape becomes /assets/<filename>
  //    /modules/<id>/<id>/<file>  ->  /assets/<file>
  src = src.replace(
    /https?:\/\/framerusercontent\.com\/modules\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/([^"'`?\s)]+)/g,
    '/assets/$1',
  );
  //    /sites/<id>/<file>  ->  /assets/<file>
  src = src.replace(
    /https?:\/\/framerusercontent\.com\/sites\/[A-Za-z0-9_-]+\/([^"'`?\s)]+)/g,
    '/assets/$1',
  );
  //    /(images|assets|fonts|scripts|videos|css)/<file>  ->  /assets/<file>
  src = src.replace(
    /https?:\/\/framerusercontent\.com\/(?:images|assets|fonts|scripts|videos|css)\/([^"'`?\s)]+)/g,
    '/assets/$1',
  );
  //    catch-all for anything else under framerusercontent.com
  src = src.replace(
    /https?:\/\/framerusercontent\.com\/([^"'`?\s)]+)/g,
    (_m, p) => `/assets/${basename(p)}`,
  );

  // 2. app.framerstatic.com — fonts mostly
  src = src.replace(
    /https?:\/\/app\.framerstatic\.com\/([^"'`?\s)]+)/g,
    '/assets/$1',
  );

  // 3. framer.com module loaders
  src = src.replace(
    /https?:\/\/framer\.com\/m\/phosphor-icons\/([A-Za-z0-9_-]+)\.js@[0-9.]+/g,
    '/assets/$1.js',
  );
  src = src.replace(
    /https?:\/\/framer\.com\/m\/phosphor-icons\//g,
    '/assets/',
  );
  src = src.replace(
    /https?:\/\/framer\.com\/edit\/init\.mjs/g,
    '/assets/_noop.mjs',
  );

  // 4. api.framer.com — neutralize all (forms, check-iframe-url, telemetry)
  src = src.replace(
    /https?:\/\/api\.framer\.com\/[^"'`?\s)]+/g,
    'data:,',
  );

  // 5. frameruni.link telemetry
  src = src.replace(
    /https?:\/\/frameruni\.link\/[a-z]+/g,
    'data:,',
  );

  if (src !== before) {
    await writeFile(f, src);
    filesPatched++;
    // Count distinct URL changes (rough)
    const beforeCount = (before.match(/framer(static|usercontent)?\.com|frameruni\.link/g) || []).length;
    const afterCount = (src.match(/framer(static|usercontent)?\.com|frameruni\.link/g) || []).length;
    totalChanges += beforeCount - afterCount;
  }
}

console.log(`patched ${filesPatched} JS files / removed ${totalChanges} Framer URL refs`);
