/**
 * Bakes every Urdu glyph the app needs into SVG path data at build time.
 *
 * Why this exists
 * ---------------
 * Phaser renders text by calling canvas `fillText` on a hidden DOM canvas and
 * uploading the result as a texture. For Nastaliq that is fragile: the output
 * depends on the platform text shaper, it races font loading, and it hands back
 * pixels rather than geometry. Tracing needs geometry.
 *
 * The glyph inventory here is finite and small, so we shape everything once with
 * HarfBuzz and ship the resulting outlines as JSON. At runtime the app only ever
 * draws paths, never text. Rendering becomes identical on every device and the
 * tracing screen gets the outline it needs for free.
 *
 * HarfBuzz does both halves of the job: `shape()` picks the right positional
 * glyphs and `glyphToJson()` returns their outlines, so the glyph ids and the
 * outlines can never disagree.
 *
 * Usage: npm run bake
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import wawoff2 from 'wawoff2';
import { FONT_WOFF2, fontFingerprint } from './font.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');

/**
 * Everything lands in one file. The whole inventory is ~220 KB raw and ~75 KB
 * over the wire, so a single request beats 169 of them, and it gives the
 * service worker exactly one asset to cache for offline play.
 */
const OUT_FILE = path.join(CONTENT, 'glyphs.json');

/** Zero-width joiner. Forces a letter into a joined positional form. */
const ZWJ = '‍';

/**
 * The four Arabic positional forms, expressed as the string to shape.
 * Wrapping a letter in ZWJ is the standard way to ask a shaper for a specific
 * form without inventing a neighbouring letter that would change the result.
 */
const FORMS = {
  isolated: (c) => c,
  initial: (c) => c + ZWJ,
  medial: (c) => ZWJ + c + ZWJ,
  final: (c) => ZWJ + c,
};

/**
 * Which positional forms exist, keyed by the letter's `joins` value.
 * Asking a shaper for a form a letter does not have just returns the isolated
 * glyph again, so baking them anyway would ship silent duplicates.
 */
const FORMS_BY_JOINING = {
  both: ['isolated', 'initial', 'medial', 'final'],
  right: ['isolated', 'final'],
  none: ['isolated'],
};

/**
 * @typedef {object} BakedGlyph
 * @property {string} d      SVG path data, y-down, in font units.
 * @property {number[]} bbox [x, y, width, height] of the inked area.
 * @property {number} advance Total advance width of the run.
 * @property {number} upem   Font units per em, so the runtime can scale.
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

/**
 * Shapes a string and flattens the whole glyph run into one path.
 *
 * Two details matter and both are easy to miss:
 *
 * 1. Dots are separate mark glyphs. Shaping `be` returns two glyphs, the base
 *    shape and `OneDotBelowNS`, and the dot is placed by GPOS offsets. Ignoring
 *    xOffset/yOffset drops every dot onto the origin, which turns the entire
 *    be-family into the same letter.
 *
 * 2. Nastaliq has a sloped baseline, and fonts get it two different ways.
 *    Noto Nastaliq builds a word out of one glyph per letter and stacks them
 *    with large GPOS yOffsets — مچھلی is seven glyphs there, and ignoring
 *    yOffset/yAdvance would lay it out flat and wrong. AlQalam Taj, which is
 *    what this app ships, is a ligature face in the InPage tradition: the same
 *    word is a *single* glyph with the whole slope drawn into its outline, and
 *    every yOffset is zero. Both are handled by the same code below, which is
 *    the point of doing this through HarfBuzz rather than by hand.
 *
 * HarfBuzz emits outlines y-up in font units; SVG and canvas are y-down, so the
 * sign of every y is flipped on the way out.
 *
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
  /** One entry per output glyph: which source characters it covers, and its
   *  own outline. See the note on clusters below. */
  const pieces = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < infos.length; i++) {
    const pos = positions[i];
    const commands = font.glyphToJson(infos[i].codepoint);
    const mine = [];

    // ZWJ and other zero-ink glyphs shape to empty outlines. They still carry
    // advances, so skip the path but let the cursor move.
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

/**
 * Which source characters each output glyph covers, and that glyph's outline.
 *
 * HarfBuzz gives every output glyph a *cluster*: the lowest index, in the
 * original string, of the characters that went into it. It does not say where a
 * cluster ends — the next one's start is the only clue, and the last one runs
 * to the end of the text. That is what this works out.
 *
 * It matters because AlQalam Taj is a ligature face. In a font that keeps one
 * glyph per letter, every cluster spans one character and any letter can be
 * picked out of a word. Here پتنگ shapes to a *single* glyph covering all four,
 * so its cluster is `{from: 0, to: 4}` and there is no way to colour the ت
 * inside it short of cutting the outline, which is not a thing to do to a
 * typeface. Of the 37 words in the app the taught letter has its own glyph in
 * 10; those 10 can be coloured and the rest are drawn plain. Callers decide
 * that by looking at `from`/`to`, which is why both are recorded rather than
 * just the start.
 *
 * Written for a right-to-left run, where the glyphs come out in visual order
 * and the clusters therefore *descend*. Sorting by `cluster` before pairing
 * each with the next is what makes the direction stop mattering.
 */
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

/** Two decimals is well below one screen pixel at any size we render. */
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
    // Clusters are dropped too unless somebody asked: only the words need them,
    // and carrying a second copy of every outline for the other 330 glyphs
    // would about double the file for nothing.
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

    // The letter's spoken name (بے) as its own glyph. Distinct from the letter
    // itself (ب), and needed wherever the name is shown rather than the shape —
    // the recording studio prompts with it.
    out.names[letter.id] = record(bakeRun(font, letter.name), `name:${letter.id}`);
  }

  for (const number of numbers) {
    out.numbers[number.id] = record(bakeRun(font, number.char), number.id);
  }

  // Words are shaped whole. Nastaliq applies contextual substitution across the
  // entire word, so a word assembled from individually baked letters would not
  // be readable Urdu.
  for (const word of words) {
    // With clusters: the Letters screen colours the taught letter inside its
    // word where the face leaves it separable. See clustersOf().
    out.words[word.id] = record(bakeRun(font, word.word), word.id, { clusters: true });
  }

  // Menu labels go through the same pipeline as gameplay glyphs, so no Urdu in
  // the app ever depends on the platform text shaper.
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
