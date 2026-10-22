/* Quiet cream scenery and a single soft material for buttons and tile surfaces. */
import { makeButton } from './theme.js';
import { STUDIO } from './studio-layout.js';

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map((shift) => {
    const c = (n >> shift) & 255;
    return Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)).toString(16).padStart(2, '0');
  }).join('');
}

export function roundSurface(ctx, x, y, width, height, color, radius = 28, shadow = true) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(125,82,37,0.17)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 7;
  }
  const fill = ctx.createLinearGradient(x, y, x + width * 0.25, y + height);
  fill.addColorStop(0, shade(color, 0.14));
  fill.addColorStop(0.6, color);
  fill.addColorStop(1, shade(color, -0.035));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // A fine inset light, never a second frame around the illustration.
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, width - 3, height - 3, Math.max(1, radius - 1.5));
  ctx.stroke();
  ctx.restore();
}

export function studioButton(scene, config) {
  const { color = '#fff9eb', radius = 28, paint, ...rest } = config;
  return makeButton(scene, {
    ...rest, color: 0xffffff, backing: false, rim: false, padding: 18,
    paintKey: `studio:${color}:${radius}:${config.paintKey ?? 'plain'}`,
    paint(ctx, size) {
      roundSurface(ctx, -size.width / 2, -size.height / 2, size.width, size.height, color, radius);
      paint?.(ctx, size);
    },
  });
}

export function paintStudioBackdrop(ctx, layout, image) {
  const { width: w, height: h, leftX } = layout;
  ctx.fillStyle = STUDIO.cream;
  ctx.fillRect(0, 0, w, h);
  if (image) {
    // Keep the clay trees round at wide phone ratios. Only the quiet middle stretches.
    const cap = image.width / 3;
    const capWidth = Math.min(cap * h / image.height, w / 3);
    ctx.drawImage(image, cap, 0, image.width - cap * 2, image.height,
      capWidth, 0, w - capWidth * 2, h);
    ctx.drawImage(image, 0, 0, cap, image.height, 0, 0, capWidth, h);
    ctx.drawImage(image, image.width - cap, 0, cap, image.height, w - capWidth, 0, capWidth, h);
  }
  // The character's warm spotlight belongs to the scenery, not to its sprite.
  const glow = ctx.createRadialGradient(leftX, 383, 35, leftX, 383, 230);
  glow.addColorStop(0, '#ffebd8');
  glow.addColorStop(1, 'rgba(255,235,216,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 220, leftX * 2, 292);
  // The small painted shapes remain a fallback if the scenery download is unavailable.
  if (image) return;
  ctx.fillStyle = '#e7f1d9';
  ctx.beginPath();
  ctx.moveTo(0, h - 25);
  ctx.bezierCurveTo(w * 0.16, h - 90, w * 0.32, h - 7, w * 0.48, h + 8);
  ctx.lineTo(0, h + 8);
  ctx.fill();
  ctx.fillStyle = '#e4efd8';
  ctx.beginPath();
  ctx.moveTo(w * 0.65, h + 4);
  ctx.bezierCurveTo(w * 0.82, h - 63, w * 0.94, h - 15, w, h - 60);
  ctx.lineTo(w, h + 4);
  ctx.fill();
  // Just two little clusters at the very bottom; no landscape behind the grid.
  for (const [x, flip] of [[0, 1], [w, -1]]) {
    ctx.save();
    ctx.translate(x, h);
    ctx.scale(flip, 1);
    for (const [cx, cy, rx, ry, color] of [[8, -10, 37, 59, '#a5ce99'], [39, -4, 30, 39, '#b8d9a9'], [74, 6, 28, 27, '#c5e0b5']]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function addStudioBackdrop(scene, layout, image) {
  const key = `studio:backdrop:${image ? 'garden' : 'fallback'}:${layout.width}x${layout.height}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, layout.width, layout.height);
    paintStudioBackdrop(texture.context, layout, image);
    texture.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(-10);
}

/* Utility icons share their weight and colour, rather than depending on OS glyphs. */
export function paintStudioIcon(ctx, kind, active = true) {
  ctx.save();
  ctx.strokeStyle = active ? STUDIO.blue : '#8b9aaa';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'music') {
    ctx.beginPath();
    ctx.moveTo(-5, 8); ctx.lineTo(-5, -10); ctx.lineTo(12, -14); ctx.lineTo(12, 4);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-10, 10, 6, 4.7, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, 6, 6, 4.7, -0.3, 0, Math.PI * 2); ctx.fill();
    if (!active) { ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(18, 17); ctx.stroke(); }
  } else if (kind === 'fullscreen' || kind === 'restore') {
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      const n = kind === 'restore' ? 6 : 14;
      const m = kind === 'restore' ? 15 : 6;
      ctx.moveTo(x * n, y * m); ctx.lineTo(x * n, y * n); ctx.lineTo(x * m, y * n);
      ctx.stroke();
    }
  } else if (kind === 'settings') {
    ctx.lineWidth = 7;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = STUDIO.cream;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'play') {
    ctx.fillStyle = '#fffdf6';
    ctx.beginPath(); ctx.moveTo(-16, -23); ctx.quadraticCurveTo(-23, -27, -23, -18);
    ctx.lineTo(-23, 20); ctx.quadraticCurveTo(-23, 28, -16, 23);
    ctx.lineTo(19, 4); ctx.quadraticCurveTo(27, 0, 19, -4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function studioIconTexture(scene, kind, active = true) {
  const key = `studio:icon:${kind}:${active}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 88, 88);
    const ctx = texture.context;
    ctx.scale(2, 2); ctx.translate(22, 22);
    paintStudioIcon(ctx, kind, active);
    texture.refresh();
  }
  return key;
}

export function addStudioIcon(scene, kind, active = true) {
  return scene.add.image(0, 0, studioIconTexture(scene, kind, active)).setScale(0.5);
}
