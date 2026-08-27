/* Removes a white background from a flat illustration and resizes it. */

import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

/** Opens a browser-based image cutter.
 * @returns {Promise<{cut: (png: Buffer, size: number) => Promise<{webp: Buffer, clearedRatio: number, keyed: boolean}>, close: () => Promise<void>}>}
 */
export async function openCutter() {
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage();

  return {
    /** Cuts one image and returns its encoded result.
 * @param {Buffer} png
 * @param {number} size output edge length
 * @param {{scale?: number, tx?: number, ty?: number}} [transform] Optional crop transform.
 */
    async cut(png, size, transform) {
      const dataUrl = 'data:image/png;base64,' + png.toString('base64');
      const result = await page.evaluate(cutInPage, [dataUrl, size, transform ?? null]);
      return {
        webp: Buffer.from(result.url.split(',')[1], 'base64'),
        clearedRatio: result.clearedRatio,
        // Whether the fill had to run.
        keyed: result.keyed,
        metrics: result.metrics,
      };
    },
    close: () => browser.close(),
  };
}

/* Runs inside the page. */
async function cutInPage([src, size, transform]) {
  const image = new Image();
  image.src = src;
  await image.decode();

  const full = document.createElement('canvas');
  full.width = image.width;
  full.height = image.height;
  const fctx = full.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(image, 0, 0);

  const { width: w, height: h } = full;
  const data = fctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Background: bright and near-neutral.
  const isBackground = (i) => {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const min = Math.min(r, g, b);
    return min > 228 && Math.max(r, g, b) - min < 20;
  };

  // The border ring.
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) border.push(y * w, w - 1 + y * w);

  const clear = border.filter((p) => px[p * 4 + 3] < 8).length;
  // Require nearly all pixels to be opaque or transparent.
  const keyed = clear < border.length * 0.9;

  let cleared = 0;
  if (!keyed) {
    // Already transparent.
    for (let p = 0; p < w * h; p++) if (px[p * 4 + 3] < 8) cleared++;
  } else {
    // Iterative: a recursive fill blows the stack on a million-pixel image.
    const seen = new Uint8Array(w * h);
    const stack = border.slice();

    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      seen[p] = 1;
      if (!isBackground(p * 4)) continue;
      px[p * 4 + 3] = 0;
      cleared++;

      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    }

    fctx.putImageData(data, 0, 0);
  }

  // Where the subject actually is, so a set of images can be lined up on it.
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let footLeft = w;
  let footRight = -1;
  const bandTop = maxY - Math.round((maxY - minY) * 0.22);
  for (let y = Math.max(0, bandTop); y <= maxY; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < 24) continue;
      if (x < footLeft) footLeft = x;
      if (x > footRight) footRight = x;
    }
  }

  const metrics = {
    bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    bottom: maxY,
    footCentre: (footLeft + footRight) / 2,
    footWidth: footRight - footLeft + 1,
  };

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';

  const f = size / w;
  if (transform) {
    const s = transform.scale ?? 1;
    octx.setTransform(f * s, 0, 0, f * s, f * (transform.tx ?? 0), f * (transform.ty ?? 0));
    octx.drawImage(full, 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    octx.drawImage(full, 0, 0, size, size);
  }

  return { url: out.toDataURL('image/webp', 0.85), clearedRatio: cleared / (w * h), keyed, metrics };
}

/* Whether a cut looks like it worked. */
export function cutLooksWrong(clearedRatio) {
  return clearedRatio < 0.04 || clearedRatio > 0.97;
}
