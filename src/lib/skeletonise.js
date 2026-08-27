/* A first draft of a letter's pen path, read off its outline. */

/* The knobs, and what each is for. */
export const SEED_DEFAULTS = {
  /* How tall the glyph is rasterised for thinning, in pixels. */
  rasterHeight: 320,
  /* A component this small, and this close to round, is a dot rather than a stroke: dabbed, not dragged. */
  dab: { maxSpan: 0.34, aspect: 2.2 },
  /* Spurs shorter than this fraction of the longest path are thinning noise. */
  prune: 0.22,
  /* Ramer–Douglas–Peucker tolerance, in raster pixels. */
  simplify: 2.2,
};

/** Traces one glyph.
 * @param {{d: string, bbox: number[]}} glyph one form out of glyphs.json
 * @param {Partial<typeof SEED_DEFAULTS>} [options]
 * @returns {{kind: 'drag'|'dab', points: [number, number][]}[]} in font units,
 */
export function skeletonise(glyph, options = {}) {
  const { rasterHeight, dab, prune, simplify } = { ...SEED_DEFAULTS, ...options };
  const { d, bbox } = glyph;
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

  /* 1 where there is ink. */
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = alpha[i * 4 + 3] > 128 ? 1 : 0;

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
          // Transitions from 0 to 1 going round the ring.
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

    /* How many separate ways the skeleton leaves this pixel. */
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
    // Ends and junctions are where a path can begin or stop; everything else is the middle of one.
    const nodes = live.filter((p) => degree.get(p) !== 2);
    const used = new Set();
    const paths = [];

    const walk = (start, first) => {
      const path = [start];
      // Tracked rather than just remembering the previous pixel.
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

  /* Stitches the fragments back into strokes. */
  const chain = (paths) => {
    const key = (p) => `${p.x},${p.y}`;
    /* Unit vector leaving `end`, measured a few pixels in so noise averages out. */
    const heading = (points, fromStart) => {
      const ordered = fromStart ? points : [...points].reverse();
      const a = ordered[0];
      const b = ordered[Math.min(ordered.length - 1, 6)];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    };

    /* Every path end, grouped by the point it sits on. */
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
      // Greedy: the straightest pair first, then the straightest of what is left.
      const candidates = [];
      for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
          if (ends[i].index === ends[j].index) continue;
          // Both headings point away from the shared point, so carrying straight on means they point opposite ways.
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

      // Walk back to one end of this chain first, so the result is not cut in half at whichever piece happened to come first.
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

  /* Ramer–Douglas–Peucker. */
  const reduce = (points, tolerance) => {
    if (points.length < 3) return points;
    // Split closed loops at their farthest point.
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

    // Prune before chaining and again after.
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
}
