/**
 * The tracing studio.
 *
 * Everything is drawn and edited in **font units** — the coordinate space of
 * content/glyphs.json and content/strokes.json — by making that the SVG's
 * viewBox. Nothing here converts between spaces, so a path cannot drift from
 * the letter it belongs to, and what is saved is exactly what was seen.
 *
 * The letter itself is the baked `d` string straight out of glyphs.json, so the
 * outline on screen is the same geometry the game draws. There is nothing to
 * import from src/lib for that: an SVG path and a canvas Path2D take the same
 * string.
 */

const COLOURS = ['#e4633c', '#2f86d0', '#2fae74', '#9b5fc9', '#e98a1f', '#d94f8c', '#0f9c8c'];

const board = document.getElementById('board');
const title = document.getElementById('title');
const status = document.getElementById('status');
const nav = document.getElementById('letters');
const list = document.getElementById('strokes');

let glyphs = null;
let letters = [];
/** letterId -> { strokes, corrected } */
let all = {};
let index = 0;
/** The strokes of the letter on screen. Edited in place, saved on demand. */
let strokes = [];
let selected = 0;
/** 'edit' or 'draw'. In draw mode a click on the board extends a new stroke. */
let mode = 'edit';
let dirty = false;

const current = () => letters[index];
const glyph = () => glyphs.letters[current().id].isolated;

const say = (message, good = true) => {
  status.textContent = message;
  status.style.color = good ? 'var(--good)' : '#d94f5c';
};

// ---------------------------------------------------------------- loading

async function load() {
  [glyphs, { letters }, all] = await Promise.all([
    fetch('/glyphs.json').then((r) => r.json()),
    fetch('/letters.json').then((r) => r.json()),
    fetch('/api/strokes')
      .then((r) => r.json())
      .then((d) => d.letters),
  ]);
  letters = letters.filter((letter) => glyphs.letters[letter.id]?.isolated);
  buildNav();
  show(0);
}

function buildNav() {
  nav.replaceChildren(
    ...letters.map((letter, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = letter.id;
      button.dataset.index = String(i);
      return button;
    })
  );
  markNav();
}

function markNav() {
  for (const button of nav.children) {
    const i = Number(button.dataset.index);
    button.setAttribute('aria-current', String(i === index));
    button.dataset.corrected = String(Boolean(all[letters[i].id]?.corrected));
  }
}

function show(next) {
  if (dirty && !window.confirm('Leave without saving?')) return;
  index = (next + letters.length) % letters.length;
  strokes = structuredClone(all[current().id]?.strokes ?? []);
  selected = 0;
  mode = 'edit';
  dirty = false;
  // The Urdu name, not the roman id twice over — this is a screen for somebody
  // who reads Urdu, and the name is what tells them which letter this is.
  title.textContent = `${current().name} · ${current().id}`;
  markNav();
  render();
  say('');
}

// ----------------------------------------------------------------- render

/** One em, in font units, so sizes here are independent of how big a letter is. */
const em = () => glyphs.upem;
/**
 * The unit every mark on the board is sized in.
 *
 * A fraction of the em rather than of the letter, so a handle is the same size
 * on ا as on ص — the alternative gives ا enormous dots and ص invisible ones.
 * Small: a 25-point path with fat handles hides the letter it is supposed to be
 * following, which is the one thing the board exists to show.
 */
const nib = () => em() * 0.032;

function svg(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function render() {
  const [bx, by, bw, bh] = glyph().bbox;
  const pad = Math.max(bw, bh) * 0.12;
  board.setAttribute('viewBox', `${bx - pad} ${by - pad} ${bw + pad * 2} ${bh + pad * 2}`);
  board.replaceChildren();

  // The letter, pale, because it is the thing being annotated rather than read.
  board.append(svg('path', { d: glyph().d, fill: '#d9d2c0' }));

  strokes.forEach((stroke, s) => {
    const colour = COLOURS[s % COLOURS.length];
    const chosen = s === selected;
    const points = stroke.points;

    if (stroke.kind === 'dab') {
      board.append(
        svg('circle', {
          cx: points[0][0],
          cy: points[0][1],
          r: nib() * 1.5,
          fill: 'none',
          stroke: colour,
          'stroke-width': nib() * (chosen ? 0.55 : 0.35),
        })
      );
    } else {
      board.append(
        svg('polyline', {
          points: points.map((p) => p.join(',')).join(' '),
          fill: 'none',
          stroke: colour,
          'stroke-width': nib() * (chosen ? 0.7 : 0.45),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: chosen ? 1 : 0.55,
          'data-line': s,
          style: 'cursor: copy',
        })
      );
      // An arrow a little way in from the start, which is the only thing on
      // screen that says which way the stroke is written.
      if (points.length > 1) arrow(points[0], points[1], colour);
    }

    // The number, and a filled first handle: where the child starts.
    const [hx, hy] = points[0];
    const number = svg('text', {
      x: hx,
      y: hy - nib() * 1.6,
      fill: colour,
      'font-size': em() * 0.075,
      'text-anchor': 'middle',
      style: 'pointer-events: none; font-family: system-ui',
    });
    number.textContent = String(s + 1);
    board.append(number);

    if (!chosen) return;
    points.forEach(([px, py], p) => {
      board.append(
        svg('circle', {
          cx: px,
          cy: py,
          r: nib() * (p === 0 ? 0.7 : 0.45),
          fill: p === 0 ? colour : '#fff',
          stroke: colour,
          'stroke-width': nib() * 0.22,
          'data-point': p,
          style: 'cursor: grab',
        })
      );
    });
  });

  renderList();
}

function arrow(from, to, colour) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const at = [from[0] + (dx / length) * nib() * 2.4, from[1] + (dy / length) * nib() * 2.4];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const size = nib() * 0.8;
  board.append(
    svg('polygon', {
      points: `${size},0 ${-size * 0.6},${size * 0.7} ${-size * 0.6},${-size * 0.7}`,
      fill: colour,
      transform: `translate(${at[0]} ${at[1]}) rotate(${angle})`,
      style: 'pointer-events: none',
    })
  );
}

function renderList() {
  list.replaceChildren(
    ...strokes.map((stroke, s) => {
      const item = document.createElement('li');
      item.dataset.selected = String(s === selected);

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = COLOURS[s % COLOURS.length];

      const label = document.createElement('span');
      label.className = 'grow';
      label.textContent =
        stroke.kind === 'dab' ? `${s + 1}. dot` : `${s + 1}. ${stroke.points.length} points`;
      label.onclick = () => {
        selected = s;
        render();
      };

      item.append(swatch, label);
      for (const [text, hint, act] of [
        ['↑', 'Earlier', () => move(s, -1)],
        ['↓', 'Later', () => move(s, 1)],
        ['⇄', 'Start from the other end', () => flip(s)],
        [stroke.kind === 'dab' ? '✐' : '•', 'Drag or dab', () => toggleKind(s)],
        ['×', 'Delete', () => remove(s)],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.title = hint;
        button.onclick = act;
        item.append(button);
      }
      return item;
    })
  );
}

// ------------------------------------------------------------------ edits

const change = () => {
  dirty = true;
  render();
};

function move(s, by) {
  const to = s + by;
  if (to < 0 || to >= strokes.length) return;
  [strokes[s], strokes[to]] = [strokes[to], strokes[s]];
  selected = to;
  change();
}

function flip(s) {
  strokes[s].points.reverse();
  change();
}

function toggleKind(s) {
  const stroke = strokes[s];
  if (stroke.kind === 'dab') {
    stroke.kind = 'drag';
    // A dab is one point; a drag needs two, so give it a short stub to pull
    // into shape rather than an invalid stroke.
    const [x, y] = stroke.points[0];
    stroke.points = [[x + nib(), y], [x - nib(), y]];
  } else {
    // The middle of the stroke is a better guess at where a dot goes than
    // either end.
    stroke.kind = 'dab';
    stroke.points = [stroke.points[Math.floor(stroke.points.length / 2)]];
  }
  selected = s;
  change();
}

function remove(s) {
  strokes.splice(s, 1);
  selected = Math.max(0, Math.min(selected, strokes.length - 1));
  change();
}

/** Board coordinates from a pointer event, in font units. */
function toBoard(event) {
  const ctm = board.getScreenCTM();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10];
}

board.addEventListener('pointerdown', (event) => {
  const point = toBoard(event);

  if (mode === 'draw') {
    if (!strokes[selected] || strokes[selected].kind !== 'drag') return;
    strokes[selected].points.push(point);
    change();
    return;
  }

  const handle = event.target.dataset?.point;
  if (handle !== undefined) {
    const p = Number(handle);
    if (event.button === 2) return;
    board.setPointerCapture(event.pointerId);
    const drag = (move) => {
      strokes[selected].points[p] = toBoard(move);
      dirty = true;
      render();
    };
    const drop = () => {
      board.removeEventListener('pointermove', drag);
      board.removeEventListener('pointerup', drop);
    };
    board.addEventListener('pointermove', drag);
    board.addEventListener('pointerup', drop);
    return;
  }

  // A click on a stroke inserts a point into the nearest segment of it.
  const line = event.target.dataset?.line;
  if (line !== undefined) {
    const s = Number(line);
    selected = s;
    const points = strokes[s].points;
    let best = 1;
    let closest = Infinity;
    for (let i = 1; i < points.length; i++) {
      const d = distanceToSegment(point, points[i - 1], points[i]);
      if (d < closest) {
        closest = d;
        best = i;
      }
    }
    points.splice(best, 0, point);
    change();
  }
});

// Right-click removes a point, which is the one gesture with no obvious button.
board.addEventListener('contextmenu', (event) => {
  const handle = event.target.dataset?.point;
  if (handle === undefined) return;
  event.preventDefault();
  const points = strokes[selected].points;
  if (points.length <= 2) return say('A stroke needs two points', false);
  points.splice(Number(handle), 1);
  change();
});

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// ---------------------------------------------------------------- playback

let playing = null;

/**
 * Runs a marker along the strokes in order, at about the speed a child draws.
 *
 * The only honest test of a stroke order. Reading a numbered diagram it is easy
 * to convince yourself an order is fine; watching it drawn, a wrong one is
 * obvious immediately.
 */
function play() {
  if (playing) {
    clearInterval(playing);
    playing = null;
  }
  render();
  const marker = board.appendChild(
    svg('circle', { r: nib() * 0.9, fill: '#2b3047', cx: 0, cy: 0, opacity: 0 })
  );
  const trail = board.appendChild(
    svg('path', {
      d: '',
      fill: 'none',
      stroke: '#2b3047',
      'stroke-width': nib(),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0.75,
    })
  );

  const steps = [];
  let d = '';
  for (const stroke of strokes) {
    if (stroke.kind === 'dab') {
      steps.push({ at: stroke.points[0], d, hold: 6 });
      d += `M${stroke.points[0][0]},${stroke.points[0][1]}l0.1,0`;
      continue;
    }
    // Walked at a constant distance per tick rather than a constant number of
    // ticks per stroke, so a long stroke really does take longer.
    const step = em() * 0.06;
    let line = '';
    for (let i = 1; i < stroke.points.length; i++) {
      const [ax, ay] = stroke.points[i - 1];
      const [bx, by] = stroke.points[i];
      const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 1; k <= count; k++) {
        const t = k / count;
        const at = [ax + (bx - ax) * t, ay + (by - ay) * t];
        line += line ? `L${at[0]},${at[1]}` : `M${ax},${ay}L${at[0]},${at[1]}`;
        steps.push({ at, d: d + line });
      }
    }
    d += line;
    steps.push({ at: stroke.points[stroke.points.length - 1], d, hold: 8 });
  }

  let i = 0;
  let wait = 0;
  playing = setInterval(() => {
    if (wait > 0) {
      wait--;
      return;
    }
    if (i >= steps.length) {
      clearInterval(playing);
      playing = null;
      marker.setAttribute('opacity', 0);
      return;
    }
    const step = steps[i++];
    marker.setAttribute('opacity', 1);
    marker.setAttribute('cx', step.at[0]);
    marker.setAttribute('cy', step.at[1]);
    trail.setAttribute('d', step.d);
    wait = step.hold ?? 0;
  }, 26);
}

// ------------------------------------------------------------------- saving

async function save() {
  const bad = strokes.findIndex(
    (s) => (s.kind === 'dab' ? s.points.length !== 1 : s.points.length < 2)
  );
  if (bad >= 0) return say(`Stroke ${bad + 1} is not usable`, false);

  const response = await fetch(`/api/strokes/${encodeURIComponent(current().id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ strokes }),
  });
  if (!response.ok) return say(`Save failed: ${(await response.json()).error}`, false);

  all[current().id] = { strokes: structuredClone(strokes), corrected: true };
  dirty = false;
  markNav();
  say(`Saved ${current().id}`);
}

document.addEventListener('click', (event) => {
  const act = event.target.closest('[data-act]')?.dataset.act;
  if (act === 'next') return show(index + 1);
  if (act === 'prev') return show(index - 1);
  if (act === 'save') return void save();
  if (act === 'play') return play();
  if (act === 'reseed') {
    strokes = structuredClone(all[current().id]?.strokes ?? []);
    dirty = false;
    render();
    return say('Back to the last save');
  }
  if (act === 'add') {
    strokes.push({ kind: 'drag', points: [] });
    selected = strokes.length - 1;
    mode = 'draw';
    change();
    return say('Click along the stroke, then press Enter');
  }
  const letter = event.target.closest('nav button');
  if (letter) show(Number(letter.dataset.index));
});

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT') return;
  if (event.key === 'Enter' || event.key === 'Escape') {
    if (mode !== 'draw') return;
    mode = 'edit';
    // An abandoned stroke is thrown away rather than left invalid.
    if (strokes[selected]?.points.length < 2) remove(selected);
    else render();
    return say('');
  }
  if (event.key === 'ArrowLeft') show(index + 1);
  if (event.key === 'ArrowRight') show(index - 1);
  if (event.key === ' ') {
    event.preventDefault();
    play();
  }
  if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void save();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});

await load();
