#!/usr/bin/env node
// Renders the README figures: <name>.html with ?theme=dark|light to ../<name>-<theme>.png.
//   node render.mjs            all figures
//   node render.mjs hero       one figure
//   node render.mjs star-history npm-downloads   the figures with these names or pages (the daily job, D-README-NPM-1)
// Needs Playwright. Set PLAYWRIGHT_DIR to a node_modules folder that holds it (default /tmp/web-sol/node_modules).
// Fonts are in ./fonts (Geist, Geist Mono, IBM Plex Sans 600); no network needed. No regex.
// A figure with `data` gets that JSON file from ../data as window.COMPANIES before its page script runs (D-README-STARRED-1).
// When sharp is in PLAYWRIGHT_DIR too, each PNG is saved as a 256-colour palette PNG, about a third of the size (the 2 MB
// README image budget in build/readme-links.mjs); the daily job installs Playwright and sharp, so its PNGs match.
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync, statSync, writeFileSync } from 'fs';
import { chartInkProblems, drawProblems } from './render-guard.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const nm = process.env.PLAYWRIGHT_DIR || '/tmp/web-sol/node_modules';
const req = createRequire(join(nm, 'x.js'));
const { chromium } = req('playwright');
let sharp = null;
try { sharp = req('sharp'); } catch { sharp = null; }
const FIGS = [
  { name: 'hero', w: 1280, h: 640 },
  { name: 'fig-saving', w: 1280, h: 720 },
  { name: 'fig-flow', w: 1280, h: 640 },
  { name: 'fig-oss', w: 1280, h: 720 },
  { name: 'star-history', w: 1280, h: 640, drawn: true }, // drawn from star-data.js: wait for window.__drawn (D-README-STAR-1)
  { name: 'stargazers', w: 1280, h: 440, data: 'stargazer-companies.json' }, // D-README-STARRED-1
  // D-README-NPM-1, D-README-COUNT-1: one image, npm downloads per day (the README cell is half the page wide), drawn from
  // npm-data.js (build/npm-downloads.mjs); same frame as star-history. npm-downloads.html?view=daily draws one view full size.
  { name: 'npm-downloads', view: 'daily', w: 1280, h: 640, drawn: true },
];
const MAX = 400 * 1024; // 2x PNGs; the README total stays under 2 MB (build/readme-links.mjs)
const only = process.argv.slice(2);
const browser = await chromium.launch();
let bad = 0;
for (const f of FIGS) {
  if (only.length && !only.includes(f.name) && !only.includes(f.page)) continue;
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('page error: ' + e.message));
    if (f.data) await page.addInitScript('window.COMPANIES = ' + readFileSync(join(dir, '..', 'data', f.data), 'utf8') + ';');
    await page.goto(pathToFileURL(join(dir, (f.page || f.name) + '.html')).href + '?theme=' + theme + (f.view ? '&view=' + f.view : ''));
    await page.evaluate(() => document.fonts.ready);
    if (f.drawn) await page.waitForFunction(() => window.__drawn !== undefined, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
    // checks: fonts loaded, nothing outside the canvas, no text wider than its box
    const probs = await page.evaluate(() => {
      const out = [];
      for (const n of ['Geist', 'Geist Mono', 'IBM Plex Sans']) {
        if (n !== 'IBM Plex Sans' && !document.fonts.check('16px "' + n + '"')) out.push('font not loaded: ' + n);
      }
      const art = document.getElementById('art').getBoundingClientRect();
      for (const e of document.querySelectorAll('.art *')) {
        if (e.closest('svg') || e.classList.contains('dots')) continue;
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        if (r.right > art.right + 0.5 || r.bottom > art.bottom + 0.5 || r.left < -0.5) out.push('outside canvas: ' + e.className + ' ' + (e.textContent || '').slice(0, 30));
      }
      for (const b of document.querySelectorAll('[data-box]')) {
        if (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1) out.push('box overflow: ' + (b.textContent || '').slice(0, 30));
      }
      return out;
    });
    probs.unshift(...errors);
    if (f.drawn) probs.push(...drawProblems(await page.evaluate(() => window.__drawn)));
    const file = join(dir, '..', f.name + '-' + theme + '.png');
    await page.screenshot({ path: file });
    if (f.drawn) probs.push(...chartInkProblems(readFileSync(file), theme));
    if (sharp) writeFileSync(file, await sharp(readFileSync(file)).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toBuffer());
    const kb = statSync(file).size / 1024;
    if (probs.length || statSync(file).size > MAX) { bad++; console.log(f.name, theme, kb.toFixed(0) + ' KB', probs.join(' | ')); }
    else console.log(f.name, theme, kb.toFixed(0) + ' KB ok');
    await page.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
