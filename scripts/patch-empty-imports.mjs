// Replace empty-string module specifiers (left over from earlier sed that stripped
// framer.com/edit/init.mjs etc.) with a no-op module path so dynamic import() doesn't crash.

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NOOP = '/scripts/_noop.mjs';

const TARGETS = ['public/scripts'];
let patched = 0;
let totalReplacements = 0;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (/\.(mjs|js)$/.test(e)) yield p;
  }
}

for (const root of TARGETS) {
  for (const f of walk(root)) {
    let src = await readFile(f, 'utf8');
    const before = src;
    // import("")  ->  import("/scripts/_noop.mjs")
    src = src.replace(/import\(\s*(["'`])\s*\1\s*\)/g, `import("${NOOP}")`);
    // from "" -> from "/scripts/_noop.mjs"
    src = src.replace(/from\s+(["'`])\s*\1/g, `from "${NOOP}"`);
    // bare "" being passed to import as variable shouldn't be replaced; only literal cases above.
    if (src !== before) {
      const count = (before.match(/import\(\s*(["'`])\s*\1\s*\)|from\s+(["'`])\s*\2/g) || []).length;
      totalReplacements += count;
      patched++;
      await writeFile(f, src);
      console.log(`  patched ${f.replace('public/scripts/', '')}  (${count} replacements)`);
    }
  }
}

console.log(`patched ${patched} files / ${totalReplacements} total empty specifiers`);
