/**
 * Shape checks over content/strokes.json.
 *
 * The pen paths are seeded by a machine and corrected by a person, and both can
 * leave a file that parses cleanly and is nonsense to follow: a stroke with one
 * point, a dot with fifty, a path that has drifted off its letter. None of that
 * throws at runtime — the guide simply asks a child to trace something wrong.
 *
 * What is *not* here is whether a path covers the letter it claims to write.
 * That needs a rasteriser, so it lives in tools/verify-trace.mjs where there is
 * a browser. This file is the cheap half: everything answerable from the
 * numbers alone, run on every `npm test`.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const strokes = read('strokes.json');
const glyphs = read('glyphs.json');

const entries = Object.entries(strokes.letters ?? {});
/** Only corrected letters are drawn as guides; see src/lib/strokes.js. */
const corrected = entries.filter(([, entry]) => entry.corrected);

describe('stroke paths', () => {
  test('the file describes the font it was drawn against', () => {
    assert.equal(
      strokes.upem,
      glyphs.upem,
      'strokes.json and glyphs.json disagree about the em, so every path is at the wrong scale'
    );
  });

  test('every letter with strokes has a glyph to put them on', () => {
    for (const [id] of entries) {
      assert.ok(
        glyphs.letters[id]?.isolated,
        `${id} has strokes but no isolated glyph — the guide has no letter`
      );
    }
  });

  test('a drag is a line and a dab is a point', () => {
    for (const [id, entry] of entries) {
      assert.ok(entry.strokes.length > 0, `${id} has no strokes at all`);
      // Six is already a lot for one letter; more means the seeder fragmented
      // something and nobody has been through it yet.
      assert.ok(entry.strokes.length <= 12, `${id} has ${entry.strokes.length} strokes`);

      entry.strokes.forEach((stroke, i) => {
        const where = `${id} stroke ${i + 1}`;
        assert.ok(['drag', 'dab'].includes(stroke.kind), `${where}: unknown kind ${stroke.kind}`);

        if (stroke.kind === 'dab') {
          assert.equal(stroke.points.length, 1, `${where}: a dot is one point`);
        } else {
          assert.ok(stroke.points.length >= 2, `${where}: a drag needs two points`);
        }

        for (const point of stroke.points) {
          assert.ok(
            Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
            `${where}: ${JSON.stringify(point)} is not a point`
          );
        }
      });
    }
  });

  test('no stroke doubles back on the same spot', () => {
    // Two identical points in a row make a zero-length segment, and the cursor
    // that walks the path divides by segment length.
    for (const [id, entry] of entries) {
      for (const [i, stroke] of entry.strokes.entries()) {
        for (let p = 1; p < stroke.points.length; p++) {
          const [ax, ay] = stroke.points[p - 1];
          const [bx, by] = stroke.points[p];
          assert.ok(
            Math.hypot(bx - ax, by - ay) > 0.5,
            `${id} stroke ${i + 1}: points ${p} and ${p + 1} are in the same place`
          );
        }
      }
    }
  });

  test('every point is on the letter it belongs to', () => {
    // Inflated by a nib, because a stroke legitimately ends at the very edge of
    // the ink and the pen is round. Anything further out is a path that has
    // drifted off its glyph — which is exactly what a mis-drag in the studio
    // produces, and it looks fine in the file.
    const nib = glyphs.upem * 0.075;
    for (const [id, entry] of entries) {
      const [bx, by, bw, bh] = glyphs.letters[id].isolated.bbox;
      for (const [i, stroke] of entry.strokes.entries()) {
        for (const [x, y] of stroke.points) {
          assert.ok(
            x >= bx - nib && x <= bx + bw + nib && y >= by - nib && y <= by + bh + nib,
            `${id} stroke ${i + 1}: (${x}, ${y}) is outside the letter's box`
          );
        }
      }
    }
  });

  test('at least one letter is ready to be traced', () => {
    // Guided mode falls back to colouring letter by letter, so nothing breaks
    // when a letter has no guide. Nothing breaking is also how the whole
    // feature could quietly stop being reachable.
    assert.ok(corrected.length > 0, 'no letter is marked corrected, so no letter is ever guided');
  });
});
