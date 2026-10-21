/* Two bold Urdu brand labels, shaped to paths so every device renders them identically. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const face = new hb.Face(new hb.Blob(new Uint8Array(fs.readFileSync(path.join(ROOT, 'tools/fonts/baloo-bhaijaan-2.ttf')))), 0);
const font = new hb.Font(face);
font.setVariations([new hb.Variation('wght', 800)]);
const out = { font: 'Baloo Bhaijaan 2', weight: 800, labels: {} };
const round = (n) => Math.round(n * 100) / 100;
for (const [id, text] of [['title', 'اردو کھیل'], ['chalo', 'چلو']]) {
  const buffer = new hb.Buffer(); buffer.addText(text); buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const infos = buffer.getGlyphInfos(), positions = buffer.getGlyphPositions();
  let cursorX = 0, cursorY = 0, left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const parts = [];
  for (let i = 0; i < infos.length; i++) {
    if (infos[i].codepoint === 0) throw Error(`Brand font is missing a character in ${text}`);
    const pos = positions[i];
    for (const command of font.glyphToJson(infos[i].codepoint)) {
      const values = [];
      for (let v = 0; v < command.values.length; v += 2) {
        const x = cursorX + pos.xOffset + command.values[v];
        const y = -(cursorY + pos.yOffset + command.values[v + 1]);
        values.push(round(x), round(y));
        if (command.type !== 'Z') {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      parts.push(command.type + values.join(','));
    }
    cursorX += pos.xAdvance; cursorY += pos.yAdvance;
  }
  out.labels[id] = { text, d: parts.join(''), bbox: [left, top, right - left, bottom - top], advance: cursorX };
}
fs.writeFileSync(path.join(ROOT, 'content/brand-glyphs.json'), JSON.stringify(out));
console.log('Baked bold title and Chalo outlines');
