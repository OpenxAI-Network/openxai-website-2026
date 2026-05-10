import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CAPTURE_DIR = join(ROOT, '_capture');

const SITE = process.env.CAPTURE_URL || 'https://openxai.org';
const BREAKPOINTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800  },
  { name: 'wide',    width: 1920, height: 1080 },
];

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
  await page.waitForTimeout(500);
}

async function capture() {
  await mkdir(join(CAPTURE_DIR, 'screenshots'), { recursive: true });
  await mkdir(join(CAPTURE_DIR, 'dom'), { recursive: true });

  const browser = await chromium.launch();

  for (const bp of BREAKPOINTS) {
    console.log(`[capture] ${SITE} @ ${bp.name} (${bp.width}x${bp.height})`);
    const ctx = await browser.newContext({
      viewport: { width: bp.width, height: bp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60000 });
    await autoScroll(page);

    await page.screenshot({
      path: join(CAPTURE_DIR, 'screenshots', `${bp.name}.png`),
      fullPage: true,
    });

    const html = await page.content();
    await writeFile(join(CAPTURE_DIR, 'dom', `${bp.name}.html`), html);

    const styles = await page.evaluate(() => {
      const out = {};
      const tags = ['body', 'h1', 'h2', 'h3', 'p', 'a', 'button', 'nav'];
      for (const tag of tags) {
        const el = document.querySelector(tag);
        if (!el) continue;
        const cs = getComputedStyle(el);
        out[tag] = {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          color: cs.color,
          background: cs.backgroundColor,
          letterSpacing: cs.letterSpacing,
        };
      }
      return out;
    });
    await writeFile(
      join(CAPTURE_DIR, 'dom', `${bp.name}.styles.json`),
      JSON.stringify(styles, null, 2),
    );

    await ctx.close();
  }

  await browser.close();
  console.log(`[capture] done -> ${CAPTURE_DIR}`);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
