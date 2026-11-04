// Checks for render.mjs (D-README-STAR-1): a figure that draws from data must say it drew, and its PNG must show ink.
// A broken page script once left the star chart empty (NS is not defined) and the PNG still shipped; these checks stop that.
// No dependencies: the PNG decoder reads 8-bit RGB, RGBA or palette, non-interlaced (Chromium writes RGB/RGBA; a compressor may write a palette). No regex.
import { inflateSync } from 'zlib';

/** Problems with the page's drawn signal: { points, pathLength } set by the page after it drew. [] when it is fine. */
export function drawProblems(drawn) {
  if (!drawn || typeof drawn !== 'object') return ['no drawn signal from the page'];
  const out = [];
  if (!Number.isInteger(drawn.points) || drawn.points < 2) out.push('fewer than 2 data points: ' + String(drawn.points));
  if (!(typeof drawn.pathLength === 'number' && drawn.pathLength > 0)) out.push('drawn path is empty');
  return out;
}

/** { width, height, channels, px } from PNG bytes. Throws on a format it does not read. */
export function decodePng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!SIG.every((b, i) => buf[i] === b)) throw new Error('not a PNG');
  let at = 8, width = 0, height = 0, channels = 0, palette = null;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8], color = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 3 && color !== 6)) throw new Error('PNG format not read: depth ' + depth + ' color ' + color + ' interlace ' + interlace);
      channels = color === 6 ? 4 : color === 3 ? 1 : 3;
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[dst + x - channels] : 0;
      const b = y ? px[dst - stride + x] : 0;
      const c = y && x >= channels ? px[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error('PNG filter ' + f);
      px[dst + x] = v & 255;
    }
  }
  if (channels !== 1) return { width, height, channels, px };
  if (!palette) throw new Error('palette PNG without PLTE');
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) palette.copy(rgb, i * 3, px[i] * 3, px[i] * 3 + 3);
  return { width, height, channels: 3, px: rgb };
}

/** Share (0..1) of pixels in rect {x, y, w, h} (image pixels) whose largest channel distance from bg [r, g, b] is above minDiff. */
export function inkShare(img, rect, bg, minDiff = 60) {
  let ink = 0, all = 0;
  for (let y = rect.y; y < rect.y + rect.h && y < img.height; y++) {
    for (let x = rect.x; x < rect.x + rect.w && x < img.width; x++) {
      const i = (y * img.width + x) * img.channels;
      all++;
      if (Math.max(Math.abs(img.px[i] - bg[0]), Math.abs(img.px[i + 1] - bg[1]), Math.abs(img.px[i + 2] - bg[2])) > minDiff) ink++;
    }
  }
  return all ? ink / all : 0;
}

// The star chart: the svg box in CSS px (star-history.html), its background per theme (cm.css), the least ink a drawn chart has.
export const STAR_CHART = { css: { x: 64, y: 150, w: 1152, h: 400 }, bg: { dark: [10, 10, 10], light: [255, 255, 255] }, minInk: 0.005 };

/** Problems with a star-history PNG: the chart box must carry ink. [] when it is fine. */
export function chartInkProblems(buf, theme, scale = 2) {
  const img = decodePng(buf);
  const c = STAR_CHART.css;
  const share = inkShare(img, { x: c.x * scale, y: c.y * scale, w: c.w * scale, h: c.h * scale }, STAR_CHART.bg[theme]);
  return share >= STAR_CHART.minInk ? [] : ['chart area is empty: ink ' + (share * 100).toFixed(2) + '% < ' + (STAR_CHART.minInk * 100) + '%'];
}
