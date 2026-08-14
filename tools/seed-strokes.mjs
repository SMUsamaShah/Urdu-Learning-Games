/**
 * A first draft of the pen path for each letter.
 *
 * ## Why this cannot just be read off the glyph
 *
 * content/glyphs.json stores *outlines*: the boundary of the ink. A pen path is
 * a *centreline*, and the two are not the same curve. Nor can the pieces be
 * told apart by counting contours — ص has two because its loop encloses a
 * counter, ٹ has three because of its toe, ت has two for two dots because the
 * pair is drawn as one shape. Only 19 of 38 letters fit "one body plus one
 * contour per dot".
 *
 * So the centreline is recovered the way it always is: rasterise the shape,
 * thin it to one pixel wide, and trace what is left. That is a decent
 * approximation of where a broad nib travelled, and it is the only part of this
 * a machine can do well.
 *
 * ## Why the output is a draft and not an answer
 *
 * Thinning knows nothing about writing. It produces spurious branches at every
 * terminal, it cannot tell which end of a stroke a pen starts from, and where
 * two strokes cross it sees one junction rather than two passes. The ordering
 * below is a rule of thumb — rightmost first, because Urdu is written right to
 * left — and it will be wrong for letters written in an order that is not
 * simply right-to-left.
 *
 * Every one of those needs a person who can write Urdu to fix, which is what
 * tools/trace-studio is for. This gets that person 80% of the way to a path
 * instead of asking them to draw 38 letters from nothing.
 *
 * Existing entries are never touched, so re-running after a correction session
 * is safe. `--force` re-seeds, `--only alif,be` narrows.
 *
 * Usage: node tools/seed-strokes.mjs [--force] [--only alif,be]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR } from './audio-keys.mjs';

const OUT_FILE = path.join(CONTENT_DIR, 'strokes.json');

/**
 * How tall the glyph is rasterised for thinning, in pixels.
 *
 * Big enough that a Nastaliq hairline is several pixels across — the thinner
 * needs a few pixels of width to find a middle — and small enough that thinning
 * 38 letters is a second's work. The skeleton is mapped back to font units at
 * the end, so this number never escapes this file.
 */
const RASTER_HEIGHT = 320;

/**
 * A component this small, and this close to round, is a dot rather than a
 * stroke: dabbed, not dragged.
 *
 * Measured as the component's box against the glyph's box in *both* directions,
 * relative rather than absolute because ا is a tenth the width of ص. Ink area
 * was the obvious measure and it is wrong: a Nastaliq curve is thin, so ژ's
 * body covers under a twentieth of its own bounding box and was being called a
 * dot — the letter came back as three dots and no letter.
 */
const DAB = { maxSpan: 0.34, aspect: 2.2 };

/** Spurs shorter than this fraction of the longest path are thinning noise. */
const PRUNE = 0.22;
/** Ramer–Douglas–Peucker tolerance, in raster pixels. */
const SIMPLIFY = 2.2;

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const glyphs = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json'), 'utf8'));
const { letters } = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'letters.json'), 'utf8'));

const existing = fs.existsSync(OUT_FILE)
  ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
  : { letters: {} };

const wanted = letters
  .map((letter) => letter.id)
  .filter((id) => glyphs.letters[id]?.isolated)
  .filter((id) => !only || only.has(id));

const todo = wanted.filter((id) => force || !existing.letters?.[id]);

if (!todo.length) {
  console.log(`Nothing to seed: all ${wanted.length} letters already have strokes.`);
  process.exit(0);
}

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/**
 * Rasterises one glyph and returns its skeleton, in font units.
 *
 * All of the pixel work happens in the page because that is where a canvas is.
 * Nothing about it is browser-specific beyond `getImageData`.
 */
async function skeletonise(glyph) {
  return page.evaluate(
    async ([d, bbox, rasterHeight, dab, prune, simplify]) => {
      const [bx, by, bw, bh] = bbox;
      const scale = rasterHeight / bh;
      const pad = 4;
      const width = Math.ceil(bw * scale) + pad * 2;
      const height = Math.ceil(bh * scale) + pad * 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.translate(pad - bx * scale, pad - by * scale);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#000';
      ctx.fill(new Path2D(d), 'nonzero');

      const alpha = ctx.getImageData(0, 0, width, height).data;
      const at = (grid, x, y) =>
        x < 0 || y < 0 || x >= width || y >= height ? 0 : grid[y * width + x];

      /** 1 where there is ink. */
      const ink = new Uint8Array(width * height);
      for (let i = 0; i < ink.length; i++) ink[i] = alpha[i * 4 + 3] > 128 ? 1 : 0;

      // --- connected components of the ink, so dots can be told from strokes

      const label = new Int32Array(width * height).fill(-1);
      const components = [];
      for (let start = 0; start < ink.length; start++) {
        if (!ink[start] || label[start] >= 0) continue;
        const id = components.length;
        const pixels = [];
        const queue = [start];
        label[start] = id;
        let minX = width;
        let maxX = 0;
        let minY = height;
        let maxY = 0;
        while (queue.length) {
          const p = queue.pop();
          pixels.push(p);
          const x = p % width;
          const y = (p - x) / width;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const n = ny * width + nx;
              if (ink[n] && label[n] < 0) {
                label[n] = id;
                queue.push(n);
              }
            }
          }
        }
        components.push({ id, pixels, minX, maxX, minY, maxY });
      }

      // --- Zhang–Suen thinning, one component at a time

      const thin = (pixels) => {
        const grid = new Uint8Array(width * height);
        for (const p of pixels) grid[p] = 1;

        const neighbours = (x, y) => [
          at(grid, x, y - 1),
          at(grid, x + 1, y - 1),
          at(grid, x + 1, y),
          at(grid, x + 1, y + 1),
          at(grid, x, y + 1),
          at(grid, x - 1, y + 1),
          at(grid, x - 1, y),
          at(grid, x - 1, y - 1),
        ];

        for (let pass = 0; pass < 200; pass++) {
          let removedAny = false;
          for (const step of [0, 1]) {
            const doomed = [];
            for (const p of pixels) {
              if (!grid[p]) continue;
              const x = p % width;
              const y = (p - x) / width;
              const n = neighbours(x, y);
              const filled = n.reduce((a, b) => a + b, 0);
              if (filled < 2 || filled > 6) continue;
              // Transitions from 0 to 1 going round the ring. Exactly one means
              // removing this pixel cannot break the shape in two.
              let transitions = 0;
              for (let i = 0; i < 8; i++) {
                if (n[i] === 0 && n[(i + 1) % 8] === 1) transitions++;
              }
              if (transitions !== 1) continue;
              const [N, NE, E, SE, S, SW, W, NW] = n;
              if (step === 0) {
                if (N * E * S !== 0 || E * S * W !== 0) continue;
              } else if (N * E * W !== 0 || N * S * W !== 0) continue;
              void NE;
              void SE;
              void SW;
              void NW;
              doomed.push(p);
            }
            for (const p of doomed) grid[p] = 0;
            if (doomed.length) removedAny = true;
          }
          if (!removedAny) break;
        }
        return grid;
      };

      // --- trace a thinned component into polylines

      const trace = (grid, pixels) => {
        const live = pixels.filter((p) => grid[p]);
        const around = (p) => {
          const x = p % width;
          const y = (p - x) / width;
          const found = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const n = ny * width + nx;
              if (grid[n]) found.push(n);
            }
          }
          return found;
        };

        /**
         * How many separate ways the skeleton leaves this pixel.
         *
         * Counted as runs of ink around the eight-neighbour ring, not as a
         * number of neighbours, and the difference is the whole reason this
         * function exists. A skeleton climbing diagonally goes
         *
         *     . X        and the corner pixels have three neighbours each
         *     X X        while plainly being the middle of one line.
         *
         * Counting neighbours therefore reads a smooth curve as a chain of
         * junctions, which cut ر — a single arc — into six two-point stubs.
         * Runs give 2 there and 3 at a real branch.
         */
        const degreeAt = (p) => {
          const x = p % width;
          const y = (p - x) / width;
          const ring = [
            at(grid, x, y - 1),
            at(grid, x + 1, y - 1),
            at(grid, x + 1, y),
            at(grid, x + 1, y + 1),
            at(grid, x, y + 1),
            at(grid, x - 1, y + 1),
            at(grid, x - 1, y),
            at(grid, x - 1, y - 1),
          ];
          let runs = 0;
          for (let i = 0; i < 8; i++) {
            if (ring[i] === 1 && ring[(i + 7) % 8] === 0) runs++;
          }
          return runs;
        };

        const degree = new Map(live.map((p) => [p, degreeAt(p)]));
        // Ends and junctions are where a path can begin or stop; everything
        // else is the middle of one.
        const nodes = live.filter((p) => degree.get(p) !== 2);
        const used = new Set();
        const paths = [];

        const walk = (start, first) => {
          const path = [start];
          // Tracked rather than just remembering the previous pixel: on a
          // diagonal staircase the next pixel along *is* adjacent to the one
          // before it, so "anything but where I came from" walks in circles.
          const seen = new Set([start]);
          let current = first;
          for (;;) {
            path.push(current);
            seen.add(current);
            if (degree.get(current) !== 2) break;
            const next = around(current).find((p) => !seen.has(p));
            if (next === undefined) break;
            current = next;
          }
          return path;
        };

        for (const node of nodes) {
          for (const first of around(node)) {
            const key = `${node}:${first}`;
            if (used.has(key)) continue;
            const path = walk(node, first);
            used.add(key);
            used.add(`${path[path.length - 1]}:${path[path.length - 2]}`);
            paths.push(path);
          }
        }

        // A closed loop with no ends or junctions at all — ه, the bowl of ص.
        if (!paths.length && live.length > 2) {
          const seen = new Set([live[0]]);
          const loop = [live[0]];
          let current = around(live[0])[0];
          while (current !== undefined && !seen.has(current)) {
            seen.add(current);
            loop.push(current);
            current = around(current).find((p) => !seen.has(p));
          }
          loop.push(live[0]);
          paths.push(loop);
        }

        return paths.map((p) => p.map((q) => ({ x: q % width, y: (q - (q % width)) / width })));
      };

      /**
       * Stitches the fragments back into strokes.
       *
       * Tracing has to stop wherever the skeleton branches, so one pen stroke
       * that happens to pass a junction comes back as several pieces. Left
       * alone that is what turned ڑ into seventeen strokes and ھ into fourteen.
       *
       * At each junction the pieces are paired by which two carry on straightest
       * through it — a pen going round a curve barely turns, where a real branch
       * like the toe of ٹ leaves at an angle. Pairs are then walked into chains.
       * Whatever is left unpaired stays its own stroke, which is the right
       * answer for a branch.
       */
      const chain = (paths) => {
        const key = (p) => `${p.x},${p.y}`;
        /** Unit vector leaving `end`, measured a few pixels in so noise averages out. */
        const heading = (points, fromStart) => {
          const ordered = fromStart ? points : [...points].reverse();
          const a = ordered[0];
          const b = ordered[Math.min(ordered.length - 1, 6)];
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
        };

        /** Every path end, grouped by the point it sits on. */
        const atPoint = new Map();
        paths.forEach((points, index) => {
          for (const fromStart of [true, false]) {
            const end = fromStart ? points[0] : points[points.length - 1];
            const list = atPoint.get(key(end)) ?? [];
            list.push({ index, fromStart, dir: heading(points, fromStart) });
            atPoint.set(key(end), list);
          }
        });

        // partner[index][end] = the path this one continues into, if any.
        const partner = paths.map(() => ({ start: null, end: null }));
        for (const ends of atPoint.values()) {
          if (ends.length < 2) continue;
          const taken = new Set();
          // Greedy: the straightest pair first, then the straightest of what is
          // left. Two passes over a handful of ends, so the cost is nothing.
          const candidates = [];
          for (let i = 0; i < ends.length; i++) {
            for (let j = i + 1; j < ends.length; j++) {
              if (ends[i].index === ends[j].index) continue;
              // Both headings point away from the shared point, so carrying
              // straight on means they point opposite ways.
              const dot = ends[i].dir.x * ends[j].dir.x + ends[i].dir.y * ends[j].dir.y;
              candidates.push({ i, j, dot });
            }
          }
          candidates.sort((a, b) => a.dot - b.dot);
          for (const { i, j, dot } of candidates) {
            if (dot > -0.3) break;
            if (taken.has(i) || taken.has(j)) continue;
            taken.add(i);
            taken.add(j);
            const a = ends[i];
            const b = ends[j];
            partner[a.index][a.fromStart ? 'start' : 'end'] = { index: b.index, fromStart: b.fromStart };
            partner[b.index][b.fromStart ? 'start' : 'end'] = { index: a.index, fromStart: a.fromStart };
          }
        }

        const used = new Set();
        const chains = [];
        for (let seed = 0; seed < paths.length; seed++) {
          if (used.has(seed)) continue;

          // Walk back to one end of this chain first, so the result is not cut
          // in half at whichever piece happened to come first.
          let head = seed;
          let headFromStart = true;
          const seen = new Set([seed]);
          for (;;) {
            const next = partner[head][headFromStart ? 'start' : 'end'];
            if (!next || seen.has(next.index)) break;
            seen.add(next.index);
            head = next.index;
            headFromStart = !next.fromStart;
          }

          let points = headFromStart ? [...paths[head]] : [...paths[head]].reverse();
          used.add(head);
          let current = head;
          let currentFromStart = headFromStart;
          for (;;) {
            const next = partner[current][currentFromStart ? 'end' : 'start'];
            if (!next || used.has(next.index)) break;
            const piece = next.fromStart ? paths[next.index] : [...paths[next.index]].reverse();
            points = points.concat(piece.slice(1));
            used.add(next.index);
            current = next.index;
            currentFromStart = next.fromStart;
          }
          chains.push(points);
        }
        return chains;
      };

      const length = (points) => {
        let total = 0;
        for (let i = 1; i < points.length; i++) {
          total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        }
        return total;
      };

      /** Ramer–Douglas–Peucker. */
      const reduce = (points, tolerance) => {
        if (points.length < 3) return points;
        // A closed loop — ہ, the bowl of ص — has its first and last point in the
        // same place, and the perpendicular distance to a zero-length line is
        // meaningless: every point measures the same and the whole loop reduces
        // to two points. Split it at the point furthest from the start and
        // reduce each half against a line that actually exists.
        const [head] = points;
        const tail = points[points.length - 1];
        if (Math.hypot(tail.x - head.x, tail.y - head.y) < 1.5) {
          let far = 1;
          let best = -1;
          for (let i = 1; i < points.length - 1; i++) {
            const d = Math.hypot(points[i].x - head.x, points[i].y - head.y);
            if (d > best) {
              best = d;
              far = i;
            }
          }
          return [
            ...reduce(points.slice(0, far + 1), tolerance).slice(0, -1),
            ...reduce(points.slice(far), tolerance),
          ];
        }
        let worst = 0;
        let index = 0;
        const [a] = points;
        const b = points[points.length - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const span = Math.hypot(dx, dy) || 1;
        for (let i = 1; i < points.length - 1; i++) {
          const d =
            Math.abs(dy * points[i].x - dx * points[i].y + b.x * a.y - b.y * a.x) / span;
          if (d > worst) {
            worst = d;
            index = i;
          }
        }
        if (worst <= tolerance) return [a, b];
        return [
          ...reduce(points.slice(0, index + 1), tolerance).slice(0, -1),
          ...reduce(points.slice(index), tolerance),
        ];
      };

      // --- put it together

      const out = [];

      for (const component of components) {
        const w = component.maxX - component.minX + 1;
        const h = component.maxY - component.minY + 1;
        const aspect = Math.max(w / h, h / w);
        const isDab =
          w < bw * scale * dab.maxSpan && h < bh * scale * dab.maxSpan && aspect < dab.aspect;

        if (isDab) {
          out.push({
            kind: 'dab',
            right: component.maxX,
            points: [{ x: (component.minX + component.maxX) / 2, y: (component.minY + component.maxY) / 2 }],
          });
          continue;
        }

        const grid = thin(component.pixels);
        let paths = trace(grid, component.pixels);
        if (!paths.length) continue;

        // Prune before chaining and again after. Before, so a spur at a
        // terminal is not stitched into the stroke it hangs off; after, because
        // chaining can leave a genuinely short leftover.
        const spur = Math.max(...paths.map(length)) * prune;
        paths = chain(paths.filter((p) => length(p) >= spur));
        const longest = Math.max(...paths.map(length));
        paths = paths.filter((p) => length(p) >= longest * prune);

        for (const raw of paths) {
          const points = reduce(raw, simplify);
          if (points.length < 2) continue;
          // Urdu is written right to left, so a stroke starts at its right end.
          const ordered = points[0].x >= points[points.length - 1].x ? points : [...points].reverse();
          out.push({ kind: 'drag', right: Math.max(...points.map((p) => p.x)), points: ordered });
        }
      }

      // Rightmost stroke first, again because of the direction of the script.
      out.sort((a, b) => b.right - a.right);

      // Back to font units, which is the only space the rest of the app knows.
      return out.map((stroke) => ({
        kind: stroke.kind,
        points: stroke.points.map((p) => [
          Math.round(((p.x - pad) / scale + bx) * 10) / 10,
          Math.round(((p.y - pad) / scale + by) * 10) / 10,
        ]),
      }));
    },
    [glyph.d, glyph.bbox, RASTER_HEIGHT, DAB, PRUNE, SIMPLIFY]
  );
}

const result = { letters: { ...(existing.letters ?? {}) } };
let dabs = 0;
let drags = 0;

for (const id of todo) {
  const strokes = await skeletonise(glyphs.letters[id].isolated);
  result.letters[id] = { strokes };
  dabs += strokes.filter((s) => s.kind === 'dab').length;
  drags += strokes.filter((s) => s.kind === 'drag').length;
  const shape = strokes.map((s) => (s.kind === 'dab' ? '•' : s.points.length)).join(' ');
  console.log(`  ${id.padEnd(14)} ${strokes.length} stroke(s): ${shape}`);
}

await browser.close();

// Sorted by the alphabet rather than by when each was seeded, so a diff after a
// correction session shows what changed instead of what moved.
const ordered = {};
for (const letter of letters) {
  if (result.letters[letter.id]) ordered[letter.id] = result.letters[letter.id];
}

fs.writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      $comment: [
        'Pen paths for tracing, in font units, y-down — the same space as the',
        'outlines in glyphs.json, so the game maps a stroke with exactly the',
        'transform it already uses to draw the letter.',
        '',
        'Seeded by tools/seed-strokes.mjs and then corrected by hand in',
        'tools/trace-studio. The seeder cannot know which end a pen starts',
        'from; a person who writes Urdu has to say. Do not re-seed a letter',
        'that has been corrected — the tool will not, unless asked with --force.',
      ],
      upem: glyphs.upem,
      letters: ordered,
    },
    null,
    2
  )}\n`
);

console.log(
  `\n${todo.length} letter(s) seeded, ${Object.keys(ordered).length} in the file: ` +
    `${drags} strokes to drag, ${dabs} dots to dab.\n` +
    'Every one of these is a guess at stroke order. Fix them: npm run trace-studio'
);
