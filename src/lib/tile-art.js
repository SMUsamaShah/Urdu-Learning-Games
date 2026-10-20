/* The generated blue frames have opaque white or black outside their corners.
 * Remove only edge-connected matte, not the white cards or black Urdu inside. */

const surfaces = new WeakMap();

/** Clears the exterior matte in place and returns the surviving artwork bounds.
 * Kept independent of canvas so the same pixels can be regression-tested.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 */
export function clearTileMatte({ data, width, height }) {
  const seen = new Uint8Array(width * height);
  const matteKind = new Uint8Array(width * height);
  const stack = [];
  // Never key the centre, even if a future illustration has a break in its frame.
  const band = Math.ceil(Math.min(width, height) * 0.22);
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (x >= band && x < width - band && y >= band && y < height - band) return;
    const pixel = y * width + x;
    if (seen[pixel]) return;
    seen[pixel] = 1;
    const i = pixel * 4;
    const low = Math.min(data[i], data[i + 1], data[i + 2]);
    const high = Math.max(data[i], data[i + 1], data[i + 2]);
    const matte = high - low < 24 && (low > 228 || high < 40);
    if (data[i + 3] > 0 && !matte) return;
    if (data[i + 3] > 0) matteKind[pixel] = low > 228 ? 2 : 1;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    visit(width - 1, y);
  }

  while (stack.length) {
    const pixel = stack.pop();
    const x = pixel % width;
    const y = (pixel - x) / width;
    data[pixel * 4 + 3] = 0;
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }

  // Recover edge coverage from pixels blended against the old matte. Merely
  // deleting solid white/black leaves a light/dark halo around the blue rim.
  const original = data.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const i = pixel * 4;
      if (original[i + 3] !== 255) continue;
      const kind =
        (x > 0 && matteKind[pixel - 1]) ||
        (x < width - 1 && matteKind[pixel + 1]) ||
        (y > 0 && matteKind[pixel - width]) ||
        (y < height - 1 && matteKind[pixel + width]);
      if (!kind) continue;
      const background = kind === 2 ? 255 : 0;
      let reference = i;
      let distance = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = (ny * width + nx) * 4;
          if (original[n + 3] !== 255) continue;
          const score = [0, 1, 2].reduce(
            (sum, channel) => sum + (original[n + channel] - background) ** 2, 0
          );
          if (score > distance) {
            distance = score;
            reference = n;
          }
        }
      }
      if (!distance) continue;
      const alpha = Math.max(0, Math.min(1, [0, 1, 2].reduce(
        (sum, channel) => sum +
          (original[i + channel] - background) *
          (original[reference + channel] - background), 0
      ) / distance));
      if (alpha >= 0.99 || alpha === 0) continue;
      data[i + 3] = Math.round(255 * alpha);
      for (let channel = 0; channel < 3; channel++) {
        data[i + channel] = (original[i + channel] - background * (1 - alpha)) / alpha;
      }
    }
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** One transparent, tightly bounded surface per source image, shared by all tile sizes. */
export function tileArtSurface(image) {
  if (surfaces.has(image)) return surfaces.get(image);
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const bounds = clearTileMatte(pixels);
  ctx.putImageData(pixels, 0, 0);

  const surface = document.createElement('canvas');
  surface.width = bounds.width;
  surface.height = bounds.height;
  surface.getContext('2d').drawImage(
    source, bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height
  );
  surfaces.set(image, surface);
  return surface;
}
