/* The stroke editor, shared by the desktop studio and the app. */

const COLOURS = ['#e4633c', '#2f86d0', '#2fae74', '#9b5fc9', '#e98a1f', '#d94f8c', '#0f9c8c'];

/* How long a press has to last to count as "remove this point", in ms. */
const LONG_PRESS = 500;

const el = (html) => {
  const holder = document.createElement('div');
  holder.innerHTML = html.trim();
  return holder.firstElementChild;
};

function svgNode(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Builds the editor.
 * @param {object} config
 * @param {object} config.glyphs content/glyphs.json
 * @param {object[]} config.letters content/letters.json's `letters`
 * @param {Record<string, {strokes: object[], corrected?: boolean}>} config.initial
 * @param {(letterId: string, strokes: object[]) => Promise<void>} config.save
 * @param {(letterId: string) => Promise<void>} [config.revert] Restore a letter.
 * @param {(letterId: string) => void} [config.onLetter] which letter is open
 * @param {string} [config.startAt] letter id to open on
 * @returns {{el: HTMLElement, dispose: () => void, current: () => string}}
 */
export function buildStrokeEditor({
  glyphs,
  letters,
  initial,
  save,
  revert,
  onLetter,
  startAt,
  skeletonise,
  seedDefaults,
}) {
  const known = letters.filter((letter) => glyphs.letters[letter.id]?.isolated);
  /* letterId -> { strokes, corrected }. */
  const all = structuredClone(initial ?? {});

  let index = Math.max(0, known.findIndex((l) => l.id === startAt));
  /* The strokes on screen. */
  let strokes = [];
  let selected = 0;
  /* 'edit' or 'draw'. */
  let mode = 'edit';
  let dirty = false;
  let disposed = false;
  /* Snapshots to step back through, newest last. */
  const history = [];
  const HISTORY = 30;

  const root = el(`
    <div class="ste-root">
      <div class="ste-head">
        <button type="button" class="ste-btn" data-act="prev" aria-label="Previous letter">‹</button>
        <h3 class="ste-title"></h3>
        <button type="button" class="ste-btn" data-act="next" aria-label="Next letter">›</button>
        <output class="ste-status"></output>
      </div>
      <nav class="ste-letters" aria-label="Letters"></nav>
      <div class="ste-body">
        <!-- The SVG is wrapped because touch-action is specified to apply to
             elements that take a width and a height, which SVG children do not,
             and without it a drag downwards scrolls the page instead of moving
             the point. -->
        <div class="ste-stage"><svg class="ste-board" tabindex="0"></svg></div>
        <div class="ste-side">
          <details class="ste-seed">
            <summary>Trace it again</summary>
            <p class="ste-seed-note">
              Reads the pen path off the letter's own outline. Every path in the
              app started here; these are the numbers it used.
            </p>
            <div class="ste-knobs"></div>
            <button type="button" class="ste-btn" data-act="reseed">Trace again</button>
          </details>
          <p class="ste-hint">
            Drag a point to move it · tap a stroke to work on it · tap its line
            to add a point · press and hold a point to remove it
          </p>
          <ol class="ste-strokes"></ol>
        </div>
      </div>
      <div class="ste-controls">
        <button type="button" class="ste-btn" data-act="play">▶ Play</button>
        <button type="button" class="ste-btn" data-act="add">+ Stroke</button>
        <button type="button" class="ste-btn" data-act="undo" disabled>↩ Undo</button>
        <button type="button" class="ste-btn" data-act="revert">Start over</button>
        <button type="button" class="ste-btn ste-primary" data-act="save">Save</button>
      </div>
    </div>`);

  const board = root.querySelector('.ste-board');
  const title = root.querySelector('.ste-title');
  const status = root.querySelector('.ste-status');
  const nav = root.querySelector('.ste-letters');
  const list = root.querySelector('.ste-strokes');
  const seedBox = root.querySelector('.ste-seed');
  const knobBox = root.querySelector('.ste-knobs');
  if (!revert) root.querySelector('[data-act="revert"]').hidden = true;
  // Only where the caller handed the tracer in.
  if (!skeletonise) seedBox.hidden = true;

  const current = () => known[index];
  const glyph = () => glyphs.letters[current().id].isolated;
  const say = (message, good = true) => {
    status.textContent = message;
    status.dataset.bad = String(!good);
  };

  /* One em, so a handle is the same size on ا as on ص. */
  const em = () => glyphs.upem;
  /* The unit every mark is sized in. */
  const nib = () => em() * 0.032;

  /* How near a finger has to land, in nibs, to count as touching something. */
  const GRAB = 2.6;
  const NEAR_LINE = 2.2;
  /* How far a finger may wander and still count as held, in screen pixels. */
  const HOLD_SLOP = 12;

  /* The nodes of the selected stroke, so a drag can move them without rebuilding the board. */
  let live = { line: null, handles: [], number: null };

  function render() {
    const [bx, by, bw, bh] = glyph().bbox;
    const pad = Math.max(bw, bh) * 0.12;
    board.setAttribute('viewBox', `${bx - pad} ${by - pad} ${bw + pad * 2} ${bh + pad * 2}`);
    board.replaceChildren();
    board.append(svgNode('path', { d: glyph().d, fill: '#d9d2c0' }));
    live = { line: null, handles: [], number: null };

    strokes.forEach((stroke, s) => {
      const colour = COLOURS[s % COLOURS.length];
      const chosen = s === selected;
      const points = stroke.points;
      if (!points.length) return;

      if (stroke.kind === 'dab') {
        const dot = board.appendChild(
          svgNode('circle', {
            cx: points[0][0],
            cy: points[0][1],
            r: nib() * 1.5,
            fill: 'none',
            stroke: colour,
            'stroke-width': nib() * (chosen ? 0.55 : 0.35),
          })
        );
        if (chosen) live.line = dot;
      } else {
        const line = board.appendChild(
          svgNode('polyline', {
            points: points.map((p) => p.join(',')).join(' '),
            fill: 'none',
            stroke: colour,
            'stroke-width': nib() * (chosen ? 0.7 : 0.45),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: chosen ? 1 : 0.55,
            'data-line': s,
          })
        );
        if (chosen) live.line = line;
        if (points.length > 1) arrow(points[0], points[1], colour);
      }

      const number = svgNode('text', {
        x: points[0][0],
        y: points[0][1] - nib() * 1.6,
        fill: colour,
        'font-size': em() * 0.075,
        'text-anchor': 'middle',
        class: 'ste-number',
      });
      number.textContent = String(s + 1);
      board.append(number);
      if (chosen) live.number = number;

      if (!chosen) return;
      // Only what you can see.
      live.handles = points.map(([px, py], p) =>
        board.appendChild(
          svgNode('circle', {
            cx: px,
            cy: py,
            r: nib() * (p === 0 ? 0.7 : 0.45),
            fill: p === 0 ? colour : '#fff',
            stroke: colour,
            'stroke-width': nib() * 0.22,
            class: 'ste-handle',
            'data-point': p,
          })
        )
      );
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
      svgNode('polygon', {
        points: `${size},0 ${-size * 0.6},${size * 0.7} ${-size * 0.6},${-size * 0.7}`,
        fill: colour,
        transform: `translate(${at[0]} ${at[1]}) rotate(${angle})`,
        class: 'ste-number',
      })
    );
  }

  function renderList() {
    list.replaceChildren(
      ...strokes.map((stroke, s) => {
        const item = document.createElement('li');
        item.dataset.selected = String(s === selected);

        const swatch = document.createElement('span');
        swatch.className = 'ste-swatch';
        swatch.style.background = COLOURS[s % COLOURS.length];

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'ste-grow';
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
          button.className = 'ste-btn ste-tiny';
          button.textContent = text;
          button.title = hint;
          button.onclick = act;
          item.append(button);
        }
        return item;
      })
    );
  }

  /* The four numbers the tracer runs on, as sliders. */
  const KNOBS = [
    { key: 'rasterHeight', label: 'Detail', min: 120, max: 640, step: 10 },
    { key: 'prune', label: 'Trim spurs', min: 0, max: 0.6, step: 0.01 },
    { key: 'simplify', label: 'Smoothing', min: 0.5, max: 6, step: 0.1 },
    { key: 'dabSpan', label: 'Dot size', min: 0.1, max: 0.6, step: 0.01 },
  ];

  /* The live values, starting from what the shipped paths were seeded with. */
  const seed = {
    rasterHeight: seedDefaults?.rasterHeight ?? 320,
    prune: seedDefaults?.prune ?? 0.22,
    simplify: seedDefaults?.simplify ?? 2.2,
    dabSpan: seedDefaults?.dab?.maxSpan ?? 0.34,
  };

  function buildKnobs() {
    knobBox.replaceChildren(
      ...KNOBS.map((knob) => {
        const row = el(`
          <label class="ste-knob">
            <span class="ste-knob-name">${knob.label}</span>
            <input type="range" min="${knob.min}" max="${knob.max}" step="${knob.step}"
              value="${seed[knob.key]}" data-knob="${knob.key}" />
            <output class="ste-knob-value">${seed[knob.key]}</output>
          </label>`);
        const slider = row.querySelector('input');
        const shown = row.querySelector('output');
        // Live while dragging.
        slider.addEventListener('input', () => {
          seed[knob.key] = Number(slider.value);
          shown.textContent = slider.value;
          reseed();
        });
        return row;
      })
    );
  }

  /* Re-reads the pen path off the letter's outline. */
  let tracing = false;
  function reseed() {
    if (!skeletonise) return;
    if (!tracing) {
      remember();
      tracing = true;
    }
    try {
      strokes = skeletonise(glyph(), {
        rasterHeight: seed.rasterHeight,
        prune: seed.prune,
        simplify: seed.simplify,
        dab: { ...(seedDefaults?.dab ?? { aspect: 2.2 }), maxSpan: seed.dabSpan },
      });
    } catch (error) {
      return say(`Could not trace it: ${error.message ?? error}`, false);
    }
    selected = 0;
    mode = 'edit';
    change();
    // Said on every drag.
    const dabs = strokes.filter((stroke) => stroke.kind === 'dab').length;
    say(`Traced: ${strokes.length - dabs} stroke(s), ${dabs} dot(s)`);
  }

  function markNav() {
    for (const button of nav.children) {
      const i = Number(button.dataset.index);
      button.setAttribute('aria-current', String(i === index));
      button.dataset.corrected = String(Boolean(all[known[i].id]?.corrected));
    }
  }

  function show(next) {
    if (dirty && !window.confirm('Leave this letter without saving?')) return;
    index = (next + known.length) % known.length;
    strokes = structuredClone(all[current().id]?.strokes ?? []);
    selected = 0;
    mode = 'edit';
    dirty = false;
    tracing = false;
    history.length = 0;
      // Show the Urdu name; the roman id is only an internal key.
    title.textContent = `${current().name} · ${current().id}`;
    markNav();
    render();
    say('');
    onLetter?.(current().id);
  }

  /* Puts the current shape aside before something changes it. */
  function remember() {
    history.push(structuredClone(strokes));
    if (history.length > HISTORY) history.shift();
    root.querySelector('[data-act="undo"]').disabled = false;
  }

  const change = () => {
    dirty = true;
    render();
  };

  function undoEdit() {
    if (!history.length) return;
    strokes = history.pop();
    selected = Math.max(0, Math.min(selected, strokes.length - 1));
    root.querySelector('[data-act="undo"]').disabled = history.length === 0;
    change();
    say('Undone');
  }

  function move(s, by) {
    const to = s + by;
    if (to < 0 || to >= strokes.length) return;
    remember();
    [strokes[s], strokes[to]] = [strokes[to], strokes[s]];
    selected = to;
    change();
  }

  function flip(s) {
    remember();
    strokes[s].points.reverse();
    change();
  }

  function toggleKind(s) {
    remember();
    const stroke = strokes[s];
    if (stroke.kind === 'dab') {
      stroke.kind = 'drag';
      // A dab is one point and a drag needs two, so give it a stub to pull into shape rather than an invalid stroke.
      const [x, y] = stroke.points[0];
      stroke.points = [
        [x + nib(), y],
        [x - nib(), y],
      ];
    } else {
      // The middle of a stroke is a better guess at where a dot goes than either end.
      stroke.kind = 'dab';
      stroke.points = [stroke.points[Math.floor(stroke.points.length / 2)]];
    }
    selected = s;
    change();
  }

  function remove(s) {
    remember();
    strokes.splice(s, 1);
    selected = Math.max(0, Math.min(selected, strokes.length - 1));
    change();
  }

  /* Board coordinates from a pointer event, in font units. */
  function toBoard(event) {
    const ctm = board.getScreenCTM();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10];
  }

  function distanceToSegment(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length))
      : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  /* The nearest point of a stroke to a place on the board, and how far. */
  function nearestPoint(stroke, at) {
    let best = { index: -1, distance: Infinity };
    stroke?.points.forEach((p, i) => {
      const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
      if (d < best.distance) best = { index: i, distance: d };
    });
    return best;
  }

  /* Which stroke a tap is nearest to, measured against the ink rather than against the DOM. */
  function nearestStroke(at) {
    let best = { index: -1, distance: Infinity, segment: 1 };
    strokes.forEach((stroke, s) => {
      const points = stroke.points;
      if (!points.length) return;
      if (stroke.kind === 'dab' || points.length < 2) {
        const d = Math.hypot(at[0] - points[0][0], at[1] - points[0][1]);
        if (d < best.distance) best = { index: s, distance: d, segment: 0 };
        return;
      }
      for (let i = 1; i < points.length; i++) {
        const d = distanceToSegment(at, points[i - 1], points[i]);
        if (d < best.distance) best = { index: s, distance: d, segment: i };
      }
    });
    return best;
  }

  let holdTimer = null;
  const cancelHold = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = null;
  };

  /* Moves one point of the selected stroke without redrawing the board. */
  function nudge(p, to) {
    strokes[selected].points[p] = to;
    const points = strokes[selected].points;
    if (live.line?.tagName === 'polyline') {
      live.line.setAttribute('points', points.map((q) => q.join(',')).join(' '));
    } else if (live.line) {
      live.line.setAttribute('cx', to[0]);
      live.line.setAttribute('cy', to[1]);
    }
    live.handles[p]?.setAttribute('cx', to[0]);
    live.handles[p]?.setAttribute('cy', to[1]);
    if (p === 0 && live.number) {
      live.number.setAttribute('x', to[0]);
      live.number.setAttribute('y', to[1] - nib() * 1.6);
    }
    dirty = true;
  }

  const onPointerDown = (event) => {
    const point = toBoard(event);

    if (mode === 'draw') {
      if (!strokes[selected] || strokes[selected].kind !== 'drag') return;
      remember();
      strokes[selected].points.push(point);
      change();
      return;
    }

    const grab = nearestPoint(strokes[selected], point);
    if (grab.index >= 0 && grab.distance <= nib() * GRAB) {
      // Everything below this line assumes it owns the gesture, so stop the page taking it for a scroll.
      event.preventDefault();
      const p = grab.index;
      let dragged = false;

      // Press and hold removes the point — the desktop gesture is a right-click, which a tablet does not have.
      cancelHold();
      holdTimer = window.setTimeout(() => {
        if (dragged) return;
        if (strokes[selected].points.length <= 2) return say('A stroke needs two points', false);
        remember();
        strokes[selected].points.splice(p, 1);
        change();
        say('Point removed');
      }, LONG_PRESS);

      const from = { x: event.clientX, y: event.clientY };
      const drag = (moveEvent) => {
        if (!dragged) {
          if (Math.hypot(moveEvent.clientX - from.x, moveEvent.clientY - from.y) < HOLD_SLOP) {
            return;
          }
          // One snapshot for the whole drag: pulling a point across the board is one edit to undo, not forty.
          dragged = true;
          cancelHold();
          remember();
        }
        moveEvent.preventDefault();
        nudge(p, toBoard(moveEvent));
      };
      const drop = () => {
        cancelHold();
        window.removeEventListener('pointermove', drag);
        window.removeEventListener('pointerup', drop);
        // A cancel ends the drag where it got to rather than throwing it away.
        window.removeEventListener('pointercancel', drop);
        if (dragged) render();
      };
      // On window rather than on the board, so a finger that strays off the SVG keeps dragging instead of silently letting go.
      window.addEventListener('pointermove', drag, { passive: false });
      window.addEventListener('pointerup', drop);
      window.addEventListener('pointercancel', drop);
      return;
    }

    const near = nearestStroke(point);
    if (near.index < 0 || near.distance > nib() * NEAR_LINE) return;

    // A tap on a stroke you are not working on selects it, and does nothing else.
    if (near.index !== selected) {
      selected = near.index;
      render();
      return;
    }

    if (strokes[selected].kind !== 'drag') return;
    remember();
    strokes[selected].points.splice(near.segment, 0, point);
    change();
  };

  const onContextMenu = (event) => {
    const at = toBoard(event);
    const grab = nearestPoint(strokes[selected], at);
    if (grab.index < 0 || grab.distance > nib() * GRAB) return;
    event.preventDefault();
    const points = strokes[selected].points;
    if (points.length <= 2) return say('A stroke needs two points', false);
    remember();
    points.splice(grab.index, 1);
    change();
  };

  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('contextmenu', onContextMenu);

  let playing = null;

  /* Runs a marker along the strokes in order, at about the speed a child draws. */
  function play() {
    stopPlaying();
    render();
    const marker = board.appendChild(
      svgNode('circle', { r: nib() * 0.9, fill: '#2b3047', cx: 0, cy: 0, opacity: 0 })
    );
    const trail = board.appendChild(
      svgNode('path', {
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
      if (!stroke.points.length) continue;
      if (stroke.kind === 'dab') {
        steps.push({ at: stroke.points[0], d, hold: 6 });
        d += `M${stroke.points[0][0]},${stroke.points[0][1]}l0.1,0`;
        continue;
      }
      // A constant distance per tick rather than a constant number of ticks per stroke.
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
    playing = window.setInterval(() => {
      if (wait > 0) return void wait--;
      if (i >= steps.length) return stopPlaying(marker);
      const step = steps[i++];
      marker.setAttribute('opacity', 1);
      marker.setAttribute('cx', step.at[0]);
      marker.setAttribute('cy', step.at[1]);
      trail.setAttribute('d', step.d);
      wait = step.hold ?? 0;
    }, 26);
  }

  function stopPlaying(marker) {
    if (playing) window.clearInterval(playing);
    playing = null;
    marker?.setAttribute('opacity', 0);
  }

  async function commit() {
    const bad = strokes.findIndex((s) =>
      s.kind === 'dab' ? s.points.length !== 1 : s.points.length < 2
    );
    if (bad >= 0) return say(`Stroke ${bad + 1} is not usable`, false);

    try {
      await save(current().id, strokes);
    } catch (error) {
      return say(`Could not save: ${error.message ?? error}`, false);
    }
    all[current().id] = { strokes: structuredClone(strokes), corrected: true };
    dirty = false;
    markNav();
    say(`Saved ${current().id}`);
  }

  async function undo() {
    if (!revert) return;
    try {
      await revert(current().id);
    } catch (error) {
      return say(`Could not undo: ${error.message ?? error}`, false);
    }
    delete all[current().id];
    dirty = false;
    show(index);
    say('Back to the version that shipped');
  }

  const onClick = (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') return show(index + 1);
    if (act === 'prev') return show(index - 1);
    if (act === 'save') return void commit();
    if (act === 'play') return play();
    if (act === 'reseed') return void reseed();
    if (act === 'undo') return undoEdit();
    if (act === 'revert') return void undo();
    if (act === 'add') {
      remember();
      strokes.push({ kind: 'drag', points: [] });
      selected = strokes.length - 1;
      mode = 'draw';
      change();
      return say('Tap along the stroke, then Done');
    }
    const letter = event.target.closest('.ste-letters button');
    if (letter) show(Number(letter.dataset.index));
  };

  const onKey = (event) => {
    if (event.target.tagName === 'INPUT') return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      if (mode !== 'draw') return;
      mode = 'edit';
      // An abandoned stroke is thrown away rather than left invalid.
      if (strokes[selected]?.points.length < 2) remove(selected);
      else render();
      return say('');
    }
    if (event.key === ' ') {
      event.preventDefault();
      play();
    }
  };

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  nav.replaceChildren(
    ...known.map((letter, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = letter.id;
      button.dataset.index = String(i);
      return button;
    })
  );
  buildKnobs();
  show(index);

  return {
    el: root,
    current: () => current().id,
    /* True when there are unsaved edits — the caller warns before closing. */
    isDirty: () => dirty,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPlaying();
      cancelHold();
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
