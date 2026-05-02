import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CAPTURE_DIR = join(ROOT, '_capture');
const DIFF_DIR = join(CAPTURE_DIR, 'pixmatch-diff');

const LOCAL = process.env.LOCAL_URL || 'http://localhost:3000';
const BREAKPOINTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800  },
  { name: 'wide',    width: 1920, height: 1080 },
];
const THRESHOLD = 0.1;

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
  await page.waitForTimeout(300);
}

async function pixmatch() {
  await mkdir(DIFF_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const bp of BREAKPOINTS) {
    const baselinePath = join(CAPTURE_DIR, 'screenshots', `${bp.name}.png`);
    if (!existsSync(baselinePath)) {
      console.warn(`[pixmatch] no baseline for ${bp.name} — run capture first`);
      continue;
    }

    const ctx = await browser.newContext({
      viewport: { width: bp.width, height: bp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(LOCAL, { waitUntil: 'networkidle' });
    await autoScroll(page);

    const localShot = await page.screenshot({ fullPage: true });
    await ctx.close();

    const baseline = PNG.sync.read(await readFile(baselinePath));
    const local = PNG.sync.read(localShot);

    const w = Math.min(baseline.width, local.width);
    const h = Math.min(baseline.height, local.height);
    const diff = new PNG({ width: w, height: h });

    const diffPixels = pixelmatch(
      baseline.data, local.data, diff.data, w, h,
      { threshold: 0.1, alpha: 0.3, diffColor: [255, 0, 0] },
    );
    const ratio = diffPixels / (w * h);

    await writeFile(join(DIFF_DIR, `${bp.name}.diff.png`), PNG.sync.write(diff));

    const status = ratio < THRESHOLD ? 'PASS' : 'FAIL';
    results.push({ bp: bp.name, ratio, status });
    console.log(
      `[pixmatch] ${bp.name.padEnd(8)} diff=${(ratio * 100).toFixed(2)}% ${status}`,
    );
  }

  await browser.close();
  const failed = results.filter((r) => r.status === 'FAIL').length;
  if (failed > 0) {
    console.error(`[pixmatch] ${failed}/${results.length} breakpoints over ${THRESHOLD * 100}%`);
    process.exit(1);
  }
}

pixmatch().catch((err) => {
  console.error(err);
  process.exit(1);
});
