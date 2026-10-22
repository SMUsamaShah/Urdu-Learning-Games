/* A finished image owns the whole face. This wrapper supplies sizing and input. */
import { label, makeButton } from './theme.js';

const surfaces = new WeakMap();

/* Scale uniformly, so lettering and objects keep their proportions at every viewport width. */
export function imagePlacement(sourceWidth, sourceHeight, width, height, fit = 'cover') {
  const scale = (fit === 'contain' ? Math.min : Math.max)(width / sourceWidth, height / sourceHeight);
  return {
    x: (width - sourceWidth * scale) / 2,
    y: (height - sourceHeight * scale) / 2,
    width: sourceWidth * scale, height: sourceHeight * scale,
  };
}

function faceSurface(image, { width, height, fit, radius }) {
  let sizes = surfaces.get(image);
  if (!sizes) { sizes = new Map(); surfaces.set(image, sizes); }
  const key = `${width}x${height}:${fit}:${radius}`;
  if (sizes.has(key)) return sizes.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  if (radius > 0) {
    ctx.beginPath(); ctx.roundRect(0, 0, width, height, radius); ctx.clip();
  }
  const placed = imagePlacement(image.width, image.height, width, height, fit);
  ctx.drawImage(image, placed.x, placed.y, placed.width, placed.height);
  sizes.set(key, canvas);
  return canvas;
}

export function paintImageButton(ctx, image, { width, height, fit = 'cover', radius = 30, shadow = true }) {
  if (!image) return;
  ctx.save();
  if (shadow) {
    // Canvas shadows use texture pixels, while the face is baked at twice its display size.
    ctx.shadowColor = 'rgba(92,67,38,0.30)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 18;
  }
  ctx.drawImage(faceSurface(image, { width, height, fit, radius }), -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function imageButton(scene, { image, fit = 'cover', radius = 30, shadow = true, fallback = '', ...config }) {
  const button = makeButton(scene, {
    // Leave room outside the image for the full shadow, including below the rounded corners.
    ...config, backing: !image, rim: false, padding: shadow ? 32 : 18,
    paint: ctx => paintImageButton(ctx, image, { ...config, fit, radius, shadow }),
  });
  // A failed first download still leaves a readable, tappable game entry.
  if (!image && fallback) button.add(label(scene, 0, 0, fallback, { size: 22 }));
  return button;
}
