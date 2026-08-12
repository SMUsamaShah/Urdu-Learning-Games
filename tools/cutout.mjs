/**
 * Removes a white background from a flat illustration and resizes it.
 *
 * Shared by the word pictures and the mascot. It lives on its own because the
 * keying is the fiddly part of both, and two copies of it would drift: the
 * moment one of them is tuned, the other quietly starts producing different
 * edges on images that sit side by side on the same screen.
 *
 * ## Why a flood fill and not a threshold
 *
 * The cut is a flood fill seeded from the border, **not** a threshold over the
 * whole image. That distinction is the whole trick: a threshold would also
 * erase white *inside* the subject — the football's panels, the zebra's
 * stripes, the white of an eye — while a fill only takes white that is
 * connected to the edge. These are flat illustrations on a solid background, so
 * the background is exactly one connected region, and the fill cannot leak into
 * the subject unless the subject touches the frame.
 *
 * The fill produces a hard-edged mask, which would look cut out with scissors.
 * Downscaling afterwards resolves that on its own: high-quality smoothing
 * averages the binary alpha into a smooth edge, so the anti-aliasing comes free
 * from a step that had to happen anyway.
 *
 * Chromium does the pixel work because Playwright is already a dependency for
 * the verification runs, and this needs a canvas and a WebP encoder.
 */

import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

/**
 * Opens a browser to cut images in. Close it when done.
 *
 * @returns {Promise<{cut: (png: Buffer, size: number) => Promise<{webp: Buffer, clearedRatio: number}>, close: () => Promise<void>}>}
 */
export async function openCutter() {
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage();

  return {
    /**
     * @param {Buffer} png
     * @param {number} size output edge length
     * @param {{scale?: number, tx?: number, ty?: number}} [transform] applied in
     *   source pixels before the downscale, for lining a set of images up with
     *   each other. Identity by default.
     */
    async cut(png, size, transform) {
      const dataUrl = 'data:image/png;base64,' + png.toString('base64');
      const result = await page.evaluate(cutInPage, [dataUrl, size, transform ?? null]);
      return {
        webp: Buffer.from(result.url.split(',')[1], 'base64'),
        clearedRatio: result.clearedRatio,
        metrics: result.metrics,
      };
    },
    close: () => browser.close(),
  };
}

/**
 * Runs inside the page. Kept as a named function so it reads as code rather
 * than as a string, but it must not close over anything out here.
 */
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

  // Background: bright and near-neutral. These illustrations are saturated, so
  // a colour with almost no saturation is either background or a highlight, and
  // a highlight is not connected to the border.
  const isBackground = (i) => {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const min = Math.min(r, g, b);
    return min > 228 && Math.max(r, g, b) - min < 20;
  };

  // Iterative: a recursive fill blows the stack on a million-pixel image.
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) stack.push(y * w, w - 1 + y * w);

  let cleared = 0;
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

  // Where the subject actually is, so a set of images can be lined up on it.
  // The foot band — the bottom slice of the subject — is the anchor that works
  // for a character: the full bounding box moves whenever a limb is raised,
  // whereas whatever is standing on the ground stays where it is.
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

  return { url: out.toDataURL('image/webp', 0.85), clearedRatio: cleared / (w * h), metrics };
}

/**
 * Whether a cut looks like it worked.
 *
 * Almost nothing removed means the fill found no background; almost everything
 * removed means it leaked into the subject. Either way the picture is wrong in
 * a way that only shows up when somebody looks at the screen it lands on.
 */
export function cutLooksWrong(clearedRatio) {
  return clearedRatio < 0.04 || clearedRatio > 0.97;
}
