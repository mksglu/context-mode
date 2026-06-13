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
  { src: 'context-saving-og.html', out: 'context-saving.png' },
];

const W = 1200, H = 630;
const STATS_URL = 'https://raw.githubusercontent.com/mksglu/context-mode/main/stats.json';

function toLongForm(short) {
  if (!short) return null;
  const m = String(short).match(/^([\d.]+)\s*([kKmM])?\+?$/);
  if (!m) return short;
  let num = parseFloat(m[1]);
  if (m[2] && /k/i.test(m[2])) num *= 1000;
  else if (m[2] && /m/i.test(m[2])) num *= 1000000;
  return Math.round(num).toLocaleString('en-US') + '+';
}

// Fetch the live count once so every OG bakes the same number in
let liveCount = null;
try {
  const r = await fetch(STATS_URL);
  const d = await r.json();
  liveCount = d.message_long || d.users_long || toLongForm(d.message);
  console.log(`→ Live user count: ${liveCount}`);
} catch (e) {
  console.warn(`⚠ stats.json fetch failed (${e.message}); using HTML defaults`);
}

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
  if (liveCount) {
    await page.evaluate((c) => {
      document.querySelectorAll('.js-user-count').forEach(el => { el.textContent = c; });
    }, liveCount);
  }
  await page.screenshot({ path: png, omitBackground: false, type: 'png' });
  await ctx.close();
  console.log(`✓ ${a.out}  (${W * 2}×${H * 2} @ 2x)`);
}
await browser.close();
console.log('\nDone. OG banners at', __dir);
