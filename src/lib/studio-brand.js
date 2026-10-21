import branding from '../../content/brand-glyphs.json';
import { paintGlyph } from './glyph.js';

/* Correctly shaped wordmarks; they do not depend on browser text shaping or imagegen spelling. */
export function paintStudioBrand(ctx, id, width, height, { sticker = false, color = '#0861cd' } = {}) {
  const glyph = branding.labels[id];
  const margin = sticker ? 32 : 2;
  const scale = Math.min((width - margin) / glyph.bbox[2], (height - margin) / glyph.bbox[3]);
  ctx.save();
  ctx.translate(-glyph.bbox[2] * scale / 2, -glyph.bbox[3] * scale / 2);
  if (sticker) {
    ctx.shadowColor = 'rgba(146,93,25,0.18)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 6;
    paintGlyph(ctx, glyph, { scale, color: '#fff0c9', stroke: '#fff0c9', strokeWidth: 24 });
    ctx.shadowColor = 'transparent';
    ctx.translate(0, 2.5);
    paintGlyph(ctx, glyph, { scale, color: '#00459f' });
    ctx.translate(0, -2.5);
  }
  paintGlyph(ctx, glyph, { scale, color });
  ctx.restore();
}

export function addStudioTitle(scene, box) {
  const key = `studio:brand:title:${box.width}x${box.height}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, Math.ceil(box.width * 3), Math.ceil(box.height * 3));
    texture.context.scale(3, 3); texture.context.translate(box.width / 2, box.height / 2);
    paintStudioBrand(texture.context, 'title', box.width, box.height, { sticker: true });
    texture.refresh();
  }
  return scene.add.image(box.x, box.y, key).setScale(1 / 3).setName('app-title');
}
