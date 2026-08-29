/* Bakes every Urdu glyph the app needs into SVG path data at build time. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import wawoff2 from 'wawoff2';
import { FONT_WOFF2, fontFingerprint } from './font.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');

/* Everything lands in one file. */
const OUT_FILE = path.join(CONTENT, 'glyphs.json');

/* Zero-width joiner. */
const ZWJ = '‍';

/* The four Arabic positional forms, expressed as the string to shape. */
const FORMS = {
  isolated: (c) => c,
  initial: (c) => c + ZWJ,
  medial: (c) => ZWJ + c + ZWJ,
  final: (c) => ZWJ + c,
};

/* Which positional forms exist, keyed by the letter's `joins` value. */
const FORMS_BY_JOINING = {
  both: ['isolated', 'initial', 'medial', 'final'],
  right: ['isolated', 'final'],
  none: ['isolated'],
};

/**
 * @typedef {object} BakedGlyph
 * @property {string} d SVG path data, y-down, in font units.
 * @property {number[]} bbox [x, y, width, height] of the inked area.
 * @property {number} advance Total advance width of the run.
 * @property {number} upem Font units per em, so the runtime can scale.
 */

async function loadFont() {
  if (!fs.existsSync(FONT_WOFF2)) {
    throw new Error(
      `Font not found at ${FONT_WOFF2}\nRun \`npm install\` first.`
    );
  }
  const ttf = await wawoff2.decompress(fs.readFileSync(FONT_WOFF2));
  const face = new hb.Face(new hb.Blob(new Uint8Array(ttf)), 0);
  return { face, font: new hb.Font(face) };
}

/** Shapes a string and flattens the whole glyph run into one path.
 * @param {hb.Font} font
 * @param {string} text
 * @returns {BakedGlyph}
 */
function bakeRun(font, text) {
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(font, buf);

  const infos = buf.getGlyphInfos();
  const positions = buf.getGlyphPositions();

  let cursorX = 0;
  let cursorY = 0;
  const parts = [];
  /* One entry per output glyph: which source characters it covers, and its own outline. */
  const pieces = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < infos.length; i++) {
    const pos = positions[i];
    const commands = font.glyphToJson(infos[i].codepoint);
    const mine = [];

    // ZWJ and other zero-ink glyphs shape to empty outlines.
    if (commands.length > 0) {
      const originX = cursorX + pos.xOffset;
      const originY = cursorY + pos.yOffset;

      for (const cmd of commands) {
        const values = [];
        for (let v = 0; v < cmd.values.length; v += 2) {
          const x = originX + cmd.values[v];
          const y = -(originY + cmd.values[v + 1]); // flip to y-down
          values.push(round(x), round(y));
          if (cmd.type !== 'Z') {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        mine.push(cmd.type + values.join(','));
      }
      parts.push(...mine);
    }

    pieces.push({ cluster: infos[i].cluster, d: mine.join('') });

    cursorX += pos.xAdvance;
    cursorY += pos.yAdvance;
  }

  if (parts.length === 0) {
    return {
      d: '',
      bbox: [0, 0, 0, 0],
      advance: cursorX,
      upem: font.face.upem,
      clusters: [],
    };
  }

  return {
    d: parts.join(''),
    bbox: [round(minX), round(minY), round(maxX - minX), round(maxY - minY)],
    advance: round(cursorX),
    upem: font.face.upem,
    clusters: clustersOf(pieces, [...text].length),
  };
}

/* Which source characters each output glyph covers, and that glyph's outline. */
function clustersOf(pieces, length) {
  const byStart = new Map();
  for (const piece of pieces) {
    const at = byStart.get(piece.cluster);
    if (at) at.d += piece.d;
    else byStart.set(piece.cluster, { from: piece.cluster, d: piece.d });
  }
  const starts = [...byStart.values()].sort((a, b) => a.from - b.from);
  return starts.map((entry, i) => ({
    from: entry.from,
    to: i + 1 < starts.length ? starts[i + 1].from : length,
    d: entry.d,
  }));
}

/* Two decimals is well below one screen pixel at any size we render. */
function round(n) {
  return Math.round(n * 100) / 100;
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, name), 'utf8'));
}

async function main() {
  const { font } = await loadFont();
  const { letters } = readJson('letters.json');
  const { numbers } = readJson('numbers.json');
  const { words } = readJson('words.json');
  const { strings } = readJson('ui.json');

  const out = {
    upem: 0,
    font: fontFingerprint(),
    letters: {},
    names: {},
    numbers: {},
    words: {},
    ui: {},
  };
  let written = 0;
  const empties = [];

  const record = (baked, label, { clusters = false } = {}) => {
    if (!baked.d) empties.push(label);
    out.upem ||= baked.upem;
    written++;
    // upem is identical for every glyph; hoist it and drop the per-glyph copy.
    const { upem, clusters: pieces, ...rest } = baked;
    return clusters ? { ...rest, clusters: pieces } : rest;
  };

  for (const letter of letters) {
    const forms = FORMS_BY_JOINING[letter.joins];
    if (!forms) {
      throw new Error(
        `Letter "${letter.id}" has joins: ${JSON.stringify(letter.joins)}. ` +
          `Expected one of: ${Object.keys(FORMS_BY_JOINING).join(', ')}`
      );
    }
    out.letters[letter.id] = {};
    for (const form of forms) {
      const baked = bakeRun(font, FORMS[form](letter.char));
      out.letters[letter.id][form] = record(baked, `${letter.id}.${form}`);
    }

    // The letter's spoken name (بے) as its own glyph.
    out.names[letter.id] = record(bakeRun(font, letter.name), `name:${letter.id}`);
  }

  for (const number of numbers) {
    out.numbers[number.id] = record(bakeRun(font, number.char), number.id);
  }

  // Words are shaped whole.
  for (const word of words) {
    // With clusters: the Letters screen colours the taught letter inside its word where the face leaves it separable.
    out.words[word.id] = record(bakeRun(font, word.word), word.id, { clusters: true });
  }

  // Menu labels go through the same pipeline as gameplay glyphs.
  for (const string of strings) {
    out.ui[string.id] = record(bakeRun(font, string.text), `ui:${string.id}`);
  }

  fs.rmSync(path.join(CONTENT, 'glyphs'), { recursive: true, force: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(`Baked ${written} glyphs to content/glyphs.json (${kb} KB)`);
  if (empties.length) {
    console.error(`\nEMPTY OUTLINES (font is missing these): ${empties.join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
