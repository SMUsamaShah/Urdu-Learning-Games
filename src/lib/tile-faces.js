/* The picture on a menu tile, drawn in code. */

import { FRUIT, GRASS, INK, LEAF, PAPER, SLATE, SUN, WATER, WOOD, mix, pen } from './draw-kit.js';

/* A card with a letter on it, the shape half these games are built from. */
function letterCard(d, x, y, w, h, id, form, { rotate = 0, tone = d.p.base } = {}) {
  d.rrect(x, y, w, h, w * 0.18, { fill: PAPER, stroke: tone, lw: 4, rotate });
  d.letter(id, form, x, y, h * 0.5, { fill: tone, rotate, maxWidth: w * 0.66 });
}

/* An empty card: the gap a child is being asked to fill. */
function blankCard(d, x, y, w, h, { rotate = 0 } = {}) {
  d.rrect(x, y, w, h, w * 0.18, {
    fill: PAPER,
    stroke: d.p.mid,
    lw: 3.5,
    dash: [8, 7],
    rotate,
  });
}

function balloon(d, x, y, rx, ry, fill, id) {
  d.ellipse(x, y, rx, ry, { fill });
  d.ellipse(x - rx * 0.34, y - ry * 0.34, rx * 0.22, ry * 0.16, { fill: mix(fill, PAPER, 0.55), rotate: -0.6 });
  d.poly(
    [
      [x - rx * 0.16, y + ry * 0.95],
      [x + rx * 0.16, y + ry * 0.95],
      [x, y + ry * 1.2],
    ],
    { fill: mix(fill, '#101423', 0.2) }
  );
  d.curve(x, y + ry * 1.2, x + rx * 0.7, y + ry * 1.9, x, y + ry * 2.7, {
    stroke: mix(fill, '#101423', 0.25),
    lw: 2.5,
  });
  if (id) d.letter(id, 'isolated', x, y, ry * 0.86, { fill: PAPER, maxWidth: rx * 1.25 });
}

function tick(d, x, y, r) {
  d.circle(x, y, r, { fill: '#2fae74' });
  d.poly(
    [
      [x - r * 0.42, y + r * 0.03],
      [x - r * 0.08, y + r * 0.38],
      [x + r * 0.46, y - r * 0.36],
    ],
    { stroke: PAPER, lw: Math.max(2.5, r * 0.28), close: false }
  );
}

/* A jigsaw piece: a square with a knob on one side. */
function puzzlePiece(d, x, y, size, { fill, stroke, lw = 3, dash, rotate = 0 } = {}) {
  const s = size / 2;
  const knob = size * 0.19;
  d.ctx.save();
  d.ctx.translate(x, y);
  if (rotate) d.ctx.rotate(rotate);
  d.ctx.beginPath();
  d.ctx.moveTo(-s, -s);
  d.ctx.lineTo(s, -s);
  d.ctx.lineTo(s, -knob * 0.8);
  d.ctx.arc(s, 0, knob, -Math.PI / 2, Math.PI / 2);
  d.ctx.lineTo(s, s);
  d.ctx.lineTo(-s, s);
  d.ctx.closePath();
  if (fill) {
    d.ctx.fillStyle = fill;
    d.ctx.fill();
  }
  if (stroke) {
    d.ctx.strokeStyle = stroke;
    d.ctx.lineWidth = lw;
    d.ctx.lineJoin = 'round';
    d.ctx.setLineDash(dash ?? []);
    d.ctx.stroke();
    d.ctx.setLineDash([]);
  }
  d.ctx.restore();
}

function basket(d, x, y, w, h) {
  d.poly(
    [
      [x - w / 2, y - h / 2],
      [x + w / 2, y - h / 2],
      [x + w * 0.34, y + h / 2],
      [x - w * 0.34, y + h / 2],
    ],
    { fill: WOOD, stroke: mix(WOOD, '#101423', 0.3), lw: 3 }
  );
  for (const t of [0.3, 0.6]) {
    d.line(
      x - w / 2 + w * 0.08 * t, y - h / 2 + h * t,
      x + w / 2 - w * 0.08 * t, y - h / 2 + h * t,
      { stroke: mix(WOOD, '#101423', 0.22), lw: 2 }
    );
  }
  d.rrect(x, y - h / 2, w * 1.08, h * 0.2, h * 0.1, { fill: mix(WOOD, PAPER, 0.3) });
}

function pencil(d, x, y, len, angle, body) {
  d.ctx.save();
  d.ctx.translate(x, y);
  d.ctx.rotate(angle);
  d.rrect(0, -len * 0.08, len * 0.22, len * 0.84, len * 0.05, { fill: body });
  d.rrect(-len * 0.055, -len * 0.08, len * 0.055, len * 0.84, 0, { fill: mix(body, PAPER, 0.35) });
  d.poly(
    [
      [-len * 0.11, len * 0.34],
      [len * 0.11, len * 0.34],
      [0, len * 0.56],
    ],
    { fill: mix(WOOD, PAPER, 0.35) }
  );
  d.poly(
    [
      [-len * 0.04, len * 0.48],
      [len * 0.04, len * 0.48],
      [0, len * 0.56],
    ],
    { fill: INK }
  );
  d.rrect(0, -len * 0.46, len * 0.23, len * 0.09, len * 0.03, { fill: '#e79ab0' });
  d.ctx.restore();
}

function brush(d, x, y, len, angle, tip) {
  d.ctx.save();
  d.ctx.translate(x, y);
  d.ctx.rotate(angle);
  d.rrect(0, 0, len * 0.24, len, len * 0.12, { fill: WOOD });
  d.rrect(0, len * 0.38, len * 0.3, len * 0.16, len * 0.06, { fill: '#b9c0d4' });
  d.poly(
    [
      [-len * 0.15, len * 0.46],
      [len * 0.15, len * 0.46],
      [0, len * 0.72],
    ],
    { fill: tip }
  );
  d.ctx.restore();
}

/* Every tile's picture, keyed by scene. */
const FACES = {
  // A card with a letter on it, and the next card behind.
  Flashcards(d) {
    const { w, h, p } = d;
    d.rrect(-w * 0.14, h * 0.01, w * 0.5, h * 0.66, w * 0.07, {
      fill: p.pale, stroke: p.light, lw: 3, rotate: -0.17,
    });
    letterCard(d, w * 0.08, h * 0.01, w * 0.58, h * 0.74, 'be', 'isolated', { rotate: 0.06 });
    d.circle(-w * 0.33, -h * 0.36, w * 0.055, { fill: SUN });
  },

  // The letter as a dashed guide, with the pencil that follows it.
  Trace(d) {
    const { w, h, p } = d;
    // Use a wide letter for this tile.
    d.letter('be', 'isolated', -w * 0.03, -h * 0.04, h * 0.42, {
      fill: mix(p.base, PAPER, 0.42), maxWidth: w * 0.74,
    });
    // Where the pen has been.
    [-0.32, -0.22, -0.12, -0.02].forEach((fx, i) => {
      d.circle(w * fx, h * 0.1, w * 0.024, { fill: mix(p.base, PAPER, 0.55 - i * 0.18) });
    });
    pencil(d, w * 0.19, -h * 0.11, h * 0.46, 0.42, p.dark);
  },

  // Three letters, one of them under the glass.
  FindLetter(d) {
    const { w, h, p } = d;
    d.letter('te', 'isolated', w * 0.3, -h * 0.27, h * 0.17, { fill: p.pale });
    d.letter('se', 'isolated', -w * 0.31, h * 0.3, h * 0.17, { fill: p.pale });
    d.line(w * 0.16, h * 0.13, w * 0.34, h * 0.36, { stroke: p.dark, lw: w * 0.075 });
    d.circle(-w * 0.03, -h * 0.05, w * 0.28, { fill: PAPER, stroke: p.base, lw: w * 0.045 });
    d.letter('be', 'isolated', -w * 0.03, -h * 0.05, h * 0.24, { fill: p.dark, maxWidth: w * 0.4 });
  },

  // A picture and the word for it.
  WordPictures(d) {
    const { w, h, p } = d;
    const cy = -h * 0.16;
    d.ellipse(-w * 0.08, cy, w * 0.17, h * 0.19, { fill: FRUIT });
    d.ellipse(w * 0.08, cy, w * 0.17, h * 0.19, { fill: mix(FRUIT, '#101423', 0.12) });
    d.line(0, cy - h * 0.16, w * 0.01, cy - h * 0.28, { stroke: '#7a5230', lw: 5 });
    d.ellipse(w * 0.09, cy - h * 0.27, w * 0.09, h * 0.045, { fill: LEAF, rotate: -0.4 });
    d.rrect(0, h * 0.31, w * 0.78, h * 0.26, h * 0.1, { fill: p.pale, stroke: p.light, lw: 3 });
    d.word('seyb', 0, h * 0.31, h * 0.15, { fill: p.dark, maxWidth: w * 0.62 });
  },

  // What does this begin with?
  StartsWith(d) {
    const { w, h, p } = d;
    const kx = 0;
    const ky = -h * 0.16;
    d.curve(kx + w * 0.02, ky + h * 0.22, kx + w * 0.22, ky + h * 0.34, kx + w * 0.1, ky + h * 0.52, {
      stroke: p.mid, lw: 4,
    });
    d.poly(
      [
        [kx, ky - h * 0.24],
        [kx + w * 0.19, ky],
        [kx, ky + h * 0.22],
        [kx - w * 0.19, ky],
      ],
      { fill: p.base, stroke: p.dark, lw: 3 }
    );
    d.line(kx, ky - h * 0.24, kx, ky + h * 0.22, { stroke: mix(p.base, PAPER, 0.45), lw: 2.5 });
    d.line(kx - w * 0.19, ky, kx + w * 0.19, ky, { stroke: mix(p.base, PAPER, 0.45), lw: 2.5 });
    const pick = [['pe', p.base], ['be', p.warm], ['te', p.cool]];
    pick.forEach(([id, tone], i) => {
      const x = w * 0.28 - i * w * 0.28;
      d.circle(x, h * 0.33, w * 0.125, { fill: tone, stroke: mix(tone, '#101423', 0.3), lw: 3.5 });
      d.letter(id, 'isolated', x, h * 0.33, h * 0.14, { fill: PAPER, maxWidth: w * 0.18 });
    });
  },

  // A numeral, and that many of something.
  Numbers(d) {
    const { w, h, p } = d;
    d.circle(0, -h * 0.16, w * 0.29, { fill: PAPER, stroke: p.base, lw: w * 0.045 });
    d.numeral('n3', 0, -h * 0.16, h * 0.3, { fill: p.dark, maxWidth: w * 0.34 });
    for (let i = 0; i < 3; i++) {
      const x = w * 0.26 - i * w * 0.26;
      d.circle(x, h * 0.31, w * 0.095, { fill: [p.base, SUN, p.warm][i] });
    }
  },

  Balloons(d) {
    const { w, h, p } = d;
    const tones = [p.base, p.warm, p.cool];
    const ids = ['alif', 'be', 'jim'];
    ids.forEach((id, i) => {
      const x = w * 0.26 - i * w * 0.26;
      const y = -h * 0.16 + (i === 1 ? -h * 0.08 : h * 0.03);
      balloon(d, x, y, w * 0.14, h * 0.17, tones[i], id);
    });
  },

  // Two turned over, two the same.
  Memory(d) {
    const { w, h, p } = d;
    const cw = w * 0.36;
    const ch = h * 0.36;
    const gx = w * 0.2;
    const gy = h * 0.2;
    const back = (x, y, tone) => {
      d.rrect(x, y, cw, ch, cw * 0.18, { fill: tone, stroke: mix(tone, '#101423', 0.3), lw: 3 });
      d.circle(x, y, cw * 0.2, { stroke: mix(tone, PAPER, 0.55), lw: 3.5 });
    };
    back(gx, -gy, p.warm);
    back(-gx, gy, p.cool);
    letterCard(d, -gx, -gy, cw, ch, 'jim', 'isolated');
    letterCard(d, gx, gy, cw, ch, 'jim', 'isolated');
  },

  // The same letter wearing two faces.
  JoinForms(d) {
    const { w, h, p } = d;
    letterCard(d, w * 0.23, -h * 0.02, w * 0.36, h * 0.44, 'be', 'isolated');
    letterCard(d, -w * 0.23, -h * 0.02, w * 0.36, h * 0.44, 'be', 'initial');
    d.ellipse(-w * 0.045, -h * 0.02, w * 0.075, h * 0.062, { stroke: p.base, lw: 6 });
    d.ellipse(w * 0.045, -h * 0.02, w * 0.075, h * 0.062, { stroke: p.dark, lw: 6 });
    tick(d, 0, h * 0.32, w * 0.1);
  },

  // Which one comes next.
  Sequence(d) {
    const { w, h } = d;
    const cw = w * 0.27;
    const ch = h * 0.4;
    letterCard(d, w * 0.3, 0, cw, ch, 'alif', 'isolated');
    letterCard(d, 0, 0, cw, ch, 'be', 'isolated');
    blankCard(d, -w * 0.3, 0, cw, ch);
  },

  // Which door is it behind.
  Doors(d) {
    const { w, h, p } = d;
    d.ground(h * 0.34, mix(WOOD, PAPER, 0.55));
    const door = (x, open) => {
      const dw = w * 0.26;
      const dh = h * 0.56;
      const top = h * 0.34 - dh;
      d.ctx.beginPath();
      d.ctx.moveTo(x - dw / 2, h * 0.34);
      d.ctx.lineTo(x - dw / 2, top + dw * 0.5);
      d.ctx.arc(x, top + dw * 0.5, dw / 2, Math.PI, 0);
      d.ctx.lineTo(x + dw / 2, h * 0.34);
      d.ctx.closePath();
      d.ctx.fillStyle = open ? PAPER : p.base;
      d.ctx.fill();
      d.ctx.strokeStyle = p.dark;
      d.ctx.lineWidth = 3.5;
      d.ctx.stroke();
      if (open) {
        d.letter('dal', 'isolated', x, h * 0.02, h * 0.24, { fill: p.dark, maxWidth: dw * 0.7 });
        d.poly(
          [
            [x - dw / 2, h * 0.34],
            [x - dw * 0.9, h * 0.28],
            [x - dw * 0.9, top + dw * 0.2],
            [x - dw / 2, top + dw * 0.5],
          ],
          { fill: p.mid, stroke: p.dark, lw: 3 }
        );
      } else {
        d.circle(x + dw * 0.28, h * 0.06, w * 0.022, { fill: SUN });
      }
    };
    door(-w * 0.31, false);
    door(w * 0.31, false);
    door(0, true);
  },

  // Find every one of them.
  TapAll(d) {
    const { w, h, p } = d;
    const cells = [
      [-0.28, -0.26, 'sin', true],
      [0.02, -0.3, 'te', false],
      [0.3, -0.22, 'sin', true],
      [-0.3, 0.08, 'be', false],
      [0.0, 0.1, 'sin', true],
      [0.29, 0.14, 'jim', false],
    ];
    for (const [fx, fy, id, wanted] of cells) {
      const x = fx * w;
      const y = fy * h;
      const tone = wanted ? p.base : p.cool;
      d.circle(x, y, w * 0.115, {
        fill: mix(tone, PAPER, wanted ? 0.72 : 0.55),
        stroke: tone,
        lw: 3,
      });
      d.letter(id, 'isolated', x, y, h * 0.13, {
        fill: mix(tone, '#101423', 0.35), maxWidth: w * 0.16,
      });
      if (wanted) tick(d, x + w * 0.09, y + h * 0.09, w * 0.055);
    }
  },

  // The segment that is missing.
  Caterpillar(d) {
    const { w, h, p } = d;
    d.ground(h * 0.36, mix(GRASS, PAPER, 0.6));
    const r = w * 0.115;
    const seat = (i) => ({ x: w * 0.18 - i * w * 0.2, y: h * 0.05 + Math.sin(i * 1.1) * h * 0.07 });
    const head = seat(-1);
    for (let i = 3; i >= 0; i--) {
      const { x, y } = seat(i);
      if (i === 1) {
        d.circle(x, y, r, { fill: SLATE, stroke: p.mid, lw: 3, dash: [7, 6] });
      } else {
        d.circle(x, y, r, { fill: i % 2 ? p.mid : p.base, stroke: p.dark, lw: 3 });
        d.letter(['nun', 'te', 'be', 'sin'][i], 'isolated', x, y, h * 0.13, {
          fill: PAPER, maxWidth: r * 1.4,
        });
      }
    }
    d.line(head.x - w * 0.03, head.y - r, head.x - w * 0.07, head.y - r * 1.9, { stroke: p.dark, lw: 3 });
    d.line(head.x + w * 0.03, head.y - r, head.x + w * 0.06, head.y - r * 1.9, { stroke: p.dark, lw: 3 });
    d.circle(head.x - w * 0.07, head.y - r * 2.05, w * 0.022, { fill: SUN });
    d.circle(head.x + w * 0.06, head.y - r * 2.05, w * 0.022, { fill: SUN });
    d.circle(head.x, head.y, r * 1.1, { fill: p.dark });
    d.circle(head.x - w * 0.04, head.y - h * 0.02, w * 0.028, { fill: PAPER });
    d.circle(head.x + w * 0.03, head.y - h * 0.02, w * 0.028, { fill: PAPER });
    d.circle(head.x - w * 0.035, head.y - h * 0.02, w * 0.014, { fill: INK });
    d.circle(head.x + w * 0.035, head.y - h * 0.02, w * 0.014, { fill: INK });
  },

  // A letter with a piece out of it, and the piece.
  LetterPuzzle(d) {
    const { w, h, p } = d;
    // Whole, then a piece taken out of it.
    d.letter('suad', 'isolated', w * 0.02, -h * 0.1, h * 0.5, { fill: p.base, maxWidth: w * 0.74 });
    puzzlePiece(d, -w * 0.16, h * 0.02, w * 0.24, {
      fill: PAPER, stroke: p.mid, lw: 3.5, dash: [8, 7],
    });
    puzzlePiece(d, w * 0.24, h * 0.29, w * 0.28, {
      fill: p.base, stroke: p.dark, lw: 3, rotate: 0.22,
    });
  },

  Fishing(d) {
    const { w, h, p } = d;
    d.inside(
      (ctx) => {
        ctx.beginPath();
        ctx.moveTo(-w, h * 0.08);
        ctx.quadraticCurveTo(-w * 0.28, -h * 0.14, -w * 0.02, h * 0.02);
        ctx.quadraticCurveTo(w * 0.26, h * 0.16, w, -h * 0.04);
        ctx.lineTo(w, h);
        ctx.lineTo(-w, h);
        ctx.closePath();
      },
      () => d.ground(-h * 0.5, mix(WATER, p.base, 0.25))
    );
    d.line(w * 0.16, -h * 0.5, w * 0.16, -h * 0.02, { stroke: p.dark, lw: 2.5 });
    d.arc(w * 0.12, -h * 0.02, w * 0.045, -0.4, Math.PI * 0.9, { stroke: p.dark, lw: 3.5 });
    const fx = -w * 0.06;
    const fy = h * 0.18;
    d.poly(
      [
        [fx + w * 0.14, fy],
        [fx + w * 0.3, fy - h * 0.11],
        [fx + w * 0.3, fy + h * 0.11],
      ],
      { fill: mix(SUN, FRUIT, 0.4) }
    );
    d.ellipse(fx, fy, w * 0.2, h * 0.14, { fill: SUN, stroke: mix(SUN, '#101423', 0.25), lw: 3 });
    d.letter('mim', 'isolated', fx - w * 0.02, fy, h * 0.13, { fill: p.dark, maxWidth: w * 0.2 });
    d.circle(fx - w * 0.14, fy - h * 0.03, w * 0.028, { fill: PAPER });
    d.circle(fx - w * 0.145, fy - h * 0.03, w * 0.014, { fill: INK });
  },

  // Two baskets, and letters going into the right one.
  Baskets(d) {
    const { w, h, p } = d;
    basket(d, -w * 0.24, h * 0.3, w * 0.38, h * 0.3);
    basket(d, w * 0.24, h * 0.3, w * 0.38, h * 0.3);
    // One already in, one on its way down.
    d.circle(-w * 0.24, h * 0.13, w * 0.11, { fill: PAPER, stroke: p.light, lw: 3 });
    d.letter('te', 'initial', -w * 0.24, h * 0.13, h * 0.13, { fill: p.dark, maxWidth: w * 0.16 });
    d.circle(w * 0.26, -h * 0.19, w * 0.13, { fill: p.base, stroke: p.dark, lw: 3.5 });
    d.letter('be', 'isolated', w * 0.26, -h * 0.19, h * 0.15, { fill: PAPER, maxWidth: w * 0.19 });
    d.line(w * 0.26, -h * 0.42, w * 0.26, -h * 0.35, { stroke: p.light, lw: 4 });
  },

  // Up out of the hole, quickly.
  Whack(d) {
    const { w, h, p } = d;
    d.ground(h * 0.1, GRASS);
    d.ellipse(-w * 0.3, h * 0.28, w * 0.14, h * 0.06, { fill: mix(GRASS, '#101423', 0.45) });
    d.ellipse(w * 0.3, h * 0.28, w * 0.14, h * 0.06, { fill: mix(GRASS, '#101423', 0.45) });
    d.ellipse(0, h * 0.1, w * 0.19, h * 0.075, { fill: mix(GRASS, '#101423', 0.45) });
    d.circle(0, -h * 0.1, w * 0.17, { fill: p.base, stroke: p.dark, lw: 3.5 });
    d.letter('kaf', 'isolated', 0, -h * 0.1, h * 0.19, { fill: PAPER, maxWidth: w * 0.24 });
    d.line(-w * 0.3, -h * 0.2, -w * 0.23, -h * 0.15, { stroke: p.light, lw: 4 });
    d.line(-w * 0.3, -h * 0.06, -w * 0.23, -h * 0.06, { stroke: p.light, lw: 4 });
    d.line(w * 0.3, -h * 0.2, w * 0.23, -h * 0.15, { stroke: p.light, lw: 4 });
    d.line(w * 0.3, -h * 0.06, w * 0.23, -h * 0.06, { stroke: p.light, lw: 4 });
  },

  // Three the same and one that is not.
  OddOne(d) {
    const { w, h, p } = d;
    const ids = ['te', 'te', 'choti-he', 'te'];
    ids.forEach((id, i) => {
      const odd = i === 2;
      const x = w * 0.32 - i * w * 0.215;
      const y = odd ? -h * 0.02 : h * 0.0;
      d.circle(x, y, w * 0.105, {
        fill: odd ? p.base : mix(p.cool, PAPER, 0.35),
        stroke: mix(odd ? p.base : p.cool, '#101423', 0.3),
        lw: 3,
      });
      d.letter(id, 'isolated', x, y, h * 0.13, { fill: PAPER, maxWidth: w * 0.15 });
      if (odd) d.circle(x, y, w * 0.155, { stroke: p.base, lw: 4, dash: [9, 7] });
    });
  },

  // Numbers rising in order.
  InOrder(d) {
    const { w, h, p } = d;
    const seats = [
      [-0.26, 0.24, 0.15, 'n1', p.cool],
      [0.04, 0.02, 0.17, 'n2', p.base],
      [0.3, -0.24, 0.13, 'n3', p.warm],
    ];
    for (const [fx, fy, fr, id, tone] of seats) {
      const x = fx * w;
      const y = fy * h;
      const r = fr * w;
      d.circle(x, y, r, { fill: mix(tone, PAPER, 0.62), stroke: tone, lw: 3.5 });
      d.arc(x, y, r * 0.68, Math.PI * 1.05, Math.PI * 1.45, { stroke: PAPER, lw: 4 });
      d.numeral(id, x, y, h * 0.15, { fill: mix(tone, '#101423', 0.35), maxWidth: r * 1.2 });
    }
    d.circle(-w * 0.36, -h * 0.3, w * 0.04, { fill: p.pale });
    d.circle(w * 0.36, h * 0.32, w * 0.03, { fill: p.pale });
  },

  // Half coloured in.
  Paint(d) {
    const { w, h, p } = d;
    const at = h * 0.02;
    d.letter('ain', 'isolated', -w * 0.05, -h * 0.03, h * 0.46, {
      fill: mix(p.base, PAPER, 0.55), maxWidth: w * 0.56,
    });
    d.inside(
      (ctx) => ctx.rect(-w, at, w * 2, h),
      () => d.letter('ain', 'isolated', -w * 0.05, -h * 0.03, h * 0.46, { fill: p.base, maxWidth: w * 0.56 })
    );
    brush(d, w * 0.3, -h * 0.06, h * 0.44, -0.5, p.base);
    [FRUIT, SUN, WATER].forEach((tone, i) => {
      d.circle(-w * 0.32 + i * w * 0.1, h * 0.36, w * 0.05, { fill: tone });
    });
  },

  // Join each one to its partner.
  ConnectPairs(d) {
    const { w, h, p } = d;
    const right = [-0.28, 0.0, 0.28].map((f) => ({ x: w * 0.28, y: h * f }));
    const left = [-0.28, 0.0, 0.28].map((f) => ({ x: -w * 0.28, y: h * f }));
    d.line(right[0].x, right[0].y, left[1].x, left[1].y, { stroke: p.base, lw: 5 });
    d.line(right[1].x, right[1].y, left[0].x, left[0].y, { stroke: p.light, lw: 5, dash: [9, 8] });
    const pad = (at, id, form, filled, tone) => {
      d.rrect(at.x, at.y, w * 0.3, h * 0.24, w * 0.07, {
        fill: filled ? tone : mix(tone, PAPER, 0.78),
        stroke: mix(tone, '#101423', 0.28),
        lw: 3.5,
      });
      d.letter(id, form, at.x, at.y, h * 0.14, {
        fill: filled ? PAPER : mix(tone, '#101423', 0.4), maxWidth: w * 0.2,
      });
    };
    pad(right[0], 'wao', 'isolated', true, p.base);
    pad(right[1], 'be', 'isolated', false, p.warm);
    pad(right[2], 'sin', 'isolated', false, p.cool);
    pad(left[0], 'be', 'initial', false, p.warm);
    pad(left[1], 'wao', 'final', true, p.base);
    pad(left[2], 'sin', 'initial', false, p.cool);
  },

  // The counting line, with one number away.
  NumberLine(d) {
    const { w, h, p } = d;
    const y = h * 0.12;
    d.line(-w * 0.42, y, w * 0.42, y, { stroke: p.mid, lw: 7 });
    const seats = [w * 0.3, w * 0.1, -w * 0.1, -w * 0.3];
    seats.forEach((x, i) => {
      d.line(x, y - h * 0.04, x, y + h * 0.04, { stroke: p.mid, lw: 4 });
      if (i === 2) {
        d.circle(x, y - h * 0.2, w * 0.1, { fill: SLATE, stroke: p.mid, lw: 3.5, dash: [7, 6] });
      } else {
        d.circle(x, y - h * 0.2, w * 0.1, { fill: PAPER, stroke: p.base, lw: 3.5 });
        d.numeral(['n1', 'n2', null, 'n4'][i], x, y - h * 0.2, h * 0.12, {
          fill: p.dark, maxWidth: w * 0.14,
        });
      }
    });
    d.circle(-w * 0.1, h * 0.36, w * 0.09, { fill: p.base });
    d.numeral('n3', -w * 0.1, h * 0.36, h * 0.11, { fill: PAPER, maxWidth: w * 0.13 });
  },

  // Something behind the bush.
  Hidden(d) {
    const { w, h, p } = d;
    d.letter('khe', 'isolated', w * 0.02, -h * 0.11, h * 0.44, {
      fill: p.dark, maxWidth: w * 0.56,
    });
    d.ground(h * 0.34, mix(GRASS, '#101423', 0.12));
    d.circle(-w * 0.24, h * 0.26, w * 0.17, { fill: LEAF });
    d.circle(w * 0.02, h * 0.2, w * 0.21, { fill: mix(LEAF, PAPER, 0.15) });
    d.circle(w * 0.3, h * 0.27, w * 0.16, { fill: LEAF });
    d.circle(w * 0.14, h * 0.15, w * 0.05, { fill: mix(LEAF, PAPER, 0.35) });
  },

  // A letter on a bouncing ball.
  Bounce(d) {
    const { w, h, p } = d;
    d.ctx.save();
    d.ctx.beginPath();
    d.ctx.moveTo(-w * 0.4, h * 0.24);
    d.ctx.quadraticCurveTo(-w * 0.1, -h * 0.42, w * 0.18, h * 0.24);
    d.ctx.strokeStyle = p.mid;
    d.ctx.lineWidth = 5;
    d.ctx.setLineDash([9, 9]);
    d.ctx.stroke();
    d.ctx.setLineDash([]);
    d.ctx.restore();
    d.ground(h * 0.28, mix(p.pale, PAPER, 0.3));
    d.line(-w * 0.45, h * 0.28, w * 0.45, h * 0.28, { stroke: p.mid, lw: 4 });
    d.ellipse(w * 0.16, h * 0.3, w * 0.13, h * 0.03, { fill: p.pale });
    d.circle(w * 0.16, h * 0.06, w * 0.18, { fill: p.base, stroke: p.dark, lw: 3.5 });
    d.arc(w * 0.16, h * 0.06, w * 0.12, Math.PI * 1.05, Math.PI * 1.45, { stroke: mix(p.base, PAPER, 0.5), lw: 4 });
    d.letter('lam', 'isolated', w * 0.16, h * 0.06, h * 0.2, { fill: PAPER, maxWidth: w * 0.26 });
  },

  // A word being built out of its letters, right to left.
  BuildWord(d) {
    const { w, h, p } = d;
    d.ellipse(0, -h * 0.24, w * 0.15, h * 0.16, { fill: FRUIT });
    d.line(0, -h * 0.38, w * 0.01, -h * 0.46, { stroke: '#7a5230', lw: 5 });
    d.ellipse(w * 0.08, -h * 0.45, w * 0.08, h * 0.04, { fill: LEAF, rotate: -0.4 });
    // Two letters placed and one slot still empty.
    const cell = w * 0.24;
    const ids = ['be', 'kaf', null];
    ids.forEach((id, i) => {
      const x = w * 0.27 - i * (cell + w * 0.03);
      if (!id) {
        d.rrect(x, h * 0.12, cell, cell, cell * 0.18, {
          fill: PAPER, stroke: p.base, lw: 4, dash: [8, 7],
        });
        return;
      }
      d.rrect(x, h * 0.12, cell, cell, cell * 0.18, { fill: [p.base, p.warm][i], stroke: mix([p.base, p.warm][i], '#101423', 0.3), lw: 3 });
      d.letter(id, 'isolated', x, h * 0.12, h * 0.14, { fill: PAPER, maxWidth: cell * 0.7 });
    });
    // And the letter waiting in the tray below.
    d.rrect(-w * 0.27, h * 0.38, cell * 0.9, cell * 0.9, cell * 0.16, {
      fill: p.cool, stroke: mix(p.cool, '#101423', 0.3), lw: 3,
    });
    d.letter('re', 'isolated', -w * 0.27, h * 0.38, h * 0.12, { fill: PAPER, maxWidth: cell * 0.6 });
  },

  // A row with a hole in it, and the letters that might fill it.
  FillLetter(d) {
    const { w, h, p } = d;
    const cell = w * 0.2;
    ['be', null, 're'].forEach((id, i) => {
      const x = w * 0.24 - i * (cell + w * 0.03);
      if (!id) {
        d.rrect(x, -h * 0.16, cell, cell, cell * 0.18, {
          fill: PAPER, stroke: p.base, lw: 4.5, dash: [7, 6],
        });
        d.circle(x, -h * 0.16, cell * 0.12, { fill: p.base });
        return;
      }
      d.rrect(x, -h * 0.16, cell, cell, cell * 0.18, { fill: PAPER, stroke: p.light, lw: 3 });
      d.letter(id, 'isolated', x, -h * 0.16, h * 0.12, { fill: p.dark, maxWidth: cell * 0.7 });
    });
    // Three to choose from, one of them the answer.
    [['kaf', p.base], ['te', p.warm], ['sin', p.cool]].forEach(([id, tone], i) => {
      const x = w * 0.26 - i * w * 0.26;
      d.rrect(x, h * 0.28, w * 0.21, h * 0.22, w * 0.05, {
        fill: tone, stroke: mix(tone, '#101423', 0.3), lw: 3,
      });
      d.letter(id, 'isolated', x, h * 0.28, h * 0.13, { fill: PAPER, maxWidth: w * 0.15 });
    });
  },

  // The same letters, loose and then joined.
  JoinWord(d) {
    const { w, h, p } = d;
    const cell = w * 0.19;
    ['be', 'kaf', 're'].forEach((id, i) => {
      const x = w * 0.23 - i * (cell + w * 0.025);
      d.rrect(x, -h * 0.24, cell, cell, cell * 0.2, { fill: PAPER, stroke: p.light, lw: 3 });
      d.letter(id, 'isolated', x, -h * 0.24, h * 0.11, { fill: p.dark, maxWidth: cell * 0.7 });
    });
    // An arrow down, and the word they turn into.
    d.line(0, -h * 0.06, 0, h * 0.04, { stroke: p.mid, lw: 5 });
    d.poly(
      [
        [-w * 0.05, h * 0.02],
        [w * 0.05, h * 0.02],
        [0, h * 0.12],
      ],
      { fill: p.mid }
    );
    d.rrect(0, h * 0.32, w * 0.74, h * 0.28, w * 0.07, {
      fill: PAPER, stroke: p.base, lw: 4,
    });
    d.word('bakri', 0, h * 0.32, h * 0.16, { fill: p.dark, maxWidth: w * 0.6 });
  },

};

/* Whether a tile has a drawing of its own. */
export function hasTileFace(name) {
  return Boolean(FACES[name]);
}

/** Draws one tile's picture.
 * @param {CanvasRenderingContext2D} ctx origin at the centre of the panel
 * @param {string} name the game's art name
 * @param {{width: number, height: number, color: number}} box the white panel
 * @returns {boolean} whether anything was drawn
 */
export function paintTileFace(ctx, name, { width, height, color }) {
  const face = FACES[name];
  if (!face) return false;
  face(pen(ctx, width, height, color));
  return true;
}

/* For the test: every face this module knows how to draw. */
export const FACE_NAMES = Object.keys(FACES);
