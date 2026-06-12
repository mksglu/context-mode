#!/usr/bin/env node
// Render 3 OG preview banners at 1200x630 (X / LinkedIn / Slack / iMessage standard).
// Usage: cd /Users/mksglu/Server/Mert/context-mode/web/og && node render-og.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const ASSETS = [
  { src: 'master-og.html',  out: 'master.png'  },
  { src: 'insight-og.html', out: 'insight.png' },
  { src: 'oss-og.html',     out: 'oss.png'     },
];

const W = 1200, H = 630;

const browser = await chromium.launch({ headless: true });
for (const a of ASSETS) {
  const html = resolve(__dir, a.src);
  const png  = resolve(__dir, a.out);
  const ctx  = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: png, omitBackground: false, type: 'png' });
  await ctx.close();
  console.log(`✓ ${a.out}  (${W * 2}×${H * 2} @ 2x)`);
}
await browser.close();
console.log('\nDone. OG banners at', __dir);
