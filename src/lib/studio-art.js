/* Generated objects, composed with real Urdu glyphs on reusable tile surfaces. */
import { letterGlyph, numberGlyph } from './content.js';
import { paintGlyph } from './glyph.js';
import { STUDIO } from './studio-layout.js';
import { roundSurface, studioButton } from './studio-ui.js';
import { strokesFor } from './strokes.js';

const BASE = import.meta.env.BASE_URL ?? '/';
export const STUDIO_OBJECTS = ['goat', 'grapes', 'apple', 'pencil', 'magnifier', 'puzzle', 'balloons'];
const key = (name) => `studio:object:${name}`;

export function queueStudioArt(scene) {
  for (const name of STUDIO_OBJECTS) {
    if (!scene.textures.exists(key(name))) scene.load.image(key(name), `${BASE}images/studio/${name}.webp`);
  }
}

export function studioImages(scene) {
  return Object.fromEntries(STUDIO_OBJECTS.map((name) => [name,
    scene.textures.exists(key(name)) ? scene.textures.get(key(name)).getSourceImage() : null,
  ]));
}

const TONES = {
  Flashcards: '#fff0ac', Trace: '#c8eafa', FindLetter: '#fbd5df',
  WordPictures: '#d0f2d6', StartsWith: '#e4d9fb', Numbers: '#fbd5df',
};

export function studioTileColor(game, index = 0) {
  return TONES[game.scene] ?? STUDIO.pastels[index % STUDIO.pastels.length];
}

function object(ctx, image, x, y, width, height, angle = 0) {
  if (!image) return false;
  const scale = Math.min(width / image.width, height / image.height);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.drawImage(image, -image.width * scale / 2, -image.height * scale / 2, image.width * scale, image.height * scale);
  ctx.restore();
  return true;
}

function ink(ctx, id, x, y, width, height, color = STUDIO.blue, form = 'isolated') {
  const glyph = id.startsWith('n') && /^n\d+$/.test(id) ? numberGlyph(id) : letterGlyph(id, form);
  if (!glyph) return;
  const scale = Math.min(width / glyph.bbox[2], height / glyph.bbox[3]);
  ctx.save();
  ctx.translate(x - glyph.bbox[2] * scale / 2, y - glyph.bbox[3] * scale / 2);
  ctx.shadowColor = 'rgba(70,40,25,0.13)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 2;
  paintGlyph(ctx, glyph, { scale, color });
  ctx.restore();
}

function card(ctx, x, y, w, h, id, color = '#fffdf6', letterColor = STUDIO.blue, angle = 0, form = 'isolated') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  roundSurface(ctx, -w / 2, -h / 2, w, h, color, Math.min(14, w * 0.18));
  if (id) ink(ctx, id, 0, 0, w * 0.72, h * 0.6, letterColor, form);
  ctx.restore();
}

function line(ctx, points, color = STUDIO.blue, weight = 6, dashed = false) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = weight;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([2, 9]);
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke(); ctx.restore();
}

function ball(ctx, x, y, r, color) {
  ctx.save();
  ctx.shadowColor = 'rgba(72,81,60,0.15)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  const fill = ctx.createRadialGradient(x - r * 0.38, y - r * 0.45, 1, x, y, r * 1.18);
  fill.addColorStop(0, color); fill.addColorStop(0.7, color); fill.addColorStop(1, '#8ab085');
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function sparks(ctx, x, y, color = '#ffbf29') {
  line(ctx, [[x, y], [x - 4, y - 10]], color, 6);
  line(ctx, [[x + 13, y - 1], [x + 16, y - 12]], color, 6);
}

/* No baked frame or background lives in these object images. All ink is real content. */
export function paintStudioArt(ctx, game, { width, height }, images = {}) {
  const scale = Math.min(width / 256, height / 246);
  ctx.save(); ctx.scale(scale, scale);
  const o = (name, x, y, w, h, angle = 0) => object(ctx, images[name], x, y, w, h, angle);
  const threeCards = (ids, y = 0) => ids.forEach((id, i) => card(ctx, 70 - i * 70, y, 60, 78, id, ['#1687ec', '#ffce44', '#fb7e85'][i], '#fffdf6', (i - 1) * 0.05));

  switch (game.scene) {
    case 'Flashcards':
      card(ctx, -43, 1, 114, 155, 'be', '#fffdf6', '#e93639', -0.15);
      card(ctx, 51, 6, 109, 160, null, '#fffdf6', STUDIO.blue, 0.08);
      o('goat', 48, 7, 112, 148);
      sparks(ctx, -15, -91);
      break;
    case 'Trace':
      {
        const glyph = letterGlyph('alif');
        const guideScale = 158 / glyph.bbox[3];
        const strokes = strokesFor('alif', { scale: guideScale, origin: { x: -61, y: -79 }, bbox: glyph.bbox });
        if (strokes.length) {
          for (const stroke of strokes) line(ctx, stroke.points.map(({ x, y }) => [x, y]), '#374b63', 6, true);
        } else {
          ink(ctx, 'alif', -45, 0, 43, 154, '#6d94b3');
        }
      }
      o('pencil', 35, -18, 135, 179);
      break;
    case 'FindLetter':
      ink(ctx, 'sin', 13, -12, 112, 90, '#ed3d49');
      o('magnifier', -1, 0, 209, 207);
      break;
    case 'WordPictures':
      o('grapes', -27, 9, 155, 190);
      ink(ctx, 'alif', 72, 8, 46, 130, '#7623bd');
      break;
    case 'StartsWith':
      o('goat', 39, -9, 135, 175);
      card(ctx, -61, -43, 62, 70, 'be', '#1687ec', '#fffdf6', -0.07);
      card(ctx, -61, 43, 62, 70, 'pe', '#fffdf6', '#ac91cc', 0.04);
      break;
    case 'Numbers':
      o('apple', -49, -44, 91, 100, -0.08);
      o('apple', -78, 46, 88, 96, -0.04);
      o('apple', -6, 48, 91, 100, 0.06);
      ink(ctx, 'n3', 67, 10, 60, 135, '#ed3d49');
      break;
    case 'Balloons':
      o('balloons', -19, 2, 183, 207);
      ink(ctx, 'mim', 74, 45, 49, 73, '#0876cd');
      break;
    case 'Memory':
      card(ctx, -45, -13, 104, 144, null, '#fffdf6', STUDIO.blue, -0.12);
      o('apple', -47, -12, 78, 93, -0.12);
      card(ctx, 49, 18, 104, 144, null, '#fffdf6', STUDIO.blue, 0.12);
      o('apple', 48, 19, 78, 93, 0.12);
      break;
    case 'LetterPuzzle':
      o('puzzle', 0, 8, 224, 182);
      ink(ctx, 'be', -44, 13, 65, 53, '#fffdf6');
      ink(ctx, 'be', 58, 13, 65, 53, '#fffdf6');
      break;
    case 'JoinForms':
      card(ctx, -57, -25, 100, 110, 'be', '#1687ec', '#fffdf6', -0.08);
      card(ctx, 56, 25, 100, 110, 'be', '#ffca36', '#fffdf6', 0.08, 'initial');
      break;
    case 'Sequence': case 'InOrder':
      threeCards(['alif', 'be', 'pe']);
      line(ctx, [[85, 66], [-85, 66]], '#5598ce', 4);
      line(ctx, [[-74, 57], [-85, 66], [-74, 75]], '#5598ce', 4);
      break;
    case 'Doors':
      card(ctx, -58, 5, 89, 169, 'dal', '#ffbb56', '#fffdf6', -0.04);
      card(ctx, 54, 5, 89, 169, 're', '#66cbb7', '#fffdf6', 0.04);
      ball(ctx, -28, 31, 5, '#ffebaf'); ball(ctx, 83, 31, 5, '#e9f8e7');
      break;
    case 'TapAll':
      ['sin', 'be', 'sin', 'mim', 'sin', 'pe'].forEach((id, i) => {
        card(ctx, 69 - i % 3 * 69, -44 + Math.floor(i / 3) * 87, 59, 72, id,
          id === 'sin' ? '#1687ec' : '#fffdf6', id === 'sin' ? '#fffdf6' : '#a392b5');
      });
      break;
    case 'Caterpillar':
      for (let i = 4; i >= 0; i--) {
        const x = -77 + i * 38;
        ball(ctx, x, 24 + Math.sin(i) * 13, i === 4 ? 33 : 29, i === 4 ? '#9ed777' : '#b9e493');
        if (i < 4) ink(ctx, ['alif', 'be', 'pe', 'te'][i], x, 24 + Math.sin(i) * 13, 23, 28, '#397d48');
      }
      ball(ctx, 79, 12, 5, '#344a39'); ball(ctx, 92, 12, 5, '#344a39');
      line(ctx, [[78, -14], [76, -28]], '#62a852', 4); line(ctx, [[94, -12], [99, -26]], '#62a852', 4);
      break;
    case 'Fishing':
      roundSurface(ctx, -106, -77, 212, 159, '#b9e7f8', 70);
      for (const [x, y, c, id] of [[-44, -23, '#ffb347', 'be'], [44, 25, '#fb7e85', 'mim']]) {
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-40, -17); ctx.lineTo(-40, 17); ctx.fill();
        roundSurface(ctx, -25, -23, 64, 46, c, 23);
        ink(ctx, id, 7, 1, 28, 26, '#fffdf6'); ctx.restore();
      }
      line(ctx, [[82, -105], [64, -58], [31, -50]], '#aa7445', 5);
      break;
    case 'Baskets':
      o('apple', -39, -48, 76, 88); o('apple', 39, -39, 76, 88);
      roundSurface(ctx, -93, -2, 186, 83, '#e8af67', 19);
      line(ctx, [[-96, 1], [96, 1]], '#f6ce91', 14);
      for (let i = 0; i < 4; i++) line(ctx, [[-60 + i * 40, 19], [-53 + i * 35, 67]], '#f6ce91', 5);
      ink(ctx, 'be', 0, 40, 52, 44, '#fffdf6');
      break;
    case 'Whack':
      roundSurface(ctx, -88, 14, 176, 77, '#dcb489', 38);
      card(ctx, 6, -25, 102, 118, 'kaf', '#a995ed', '#fffdf6', 0.07);
      sparks(ctx, -66, -58, '#a995ed');
      break;
    case 'OddOne':
      [[-53, -47], [48, -47], [-53, 51]].forEach(([x, y]) => o('apple', x, y, 88, 90));
      o('grapes', 50, 48, 88, 94);
      break;
    case 'Paint':
      roundSurface(ctx, -94, -73, 156, 155, '#fffdf6', 20);
      ink(ctx, 'alif', -14, 1, 57, 113, '#9664d8');
      o('pencil', 56, -8, 110, 180, -0.1);
      break;
    case 'ConnectPairs':
      line(ctx, [[-61, -50], [59, 45]], '#f7bd3e', 7);
      line(ctx, [[-61, 45], [59, -50]], '#69c6b6', 7);
      [[-65, -52, 'be', '#1687ec'], [65, 47, 'be', '#1687ec'], [-65, 47, 'mim', '#fb7e85'], [65, -52, 'mim', '#fb7e85']]
        .forEach(([x, y, id, color]) => card(ctx, x, y, 61, 72, id, color, '#fffdf6'));
      break;
    case 'NumberLine':
      line(ctx, [[-99, 8], [99, 8]], '#a4b5c8', 5);
      ['n1', 'n2', 'n3'].forEach((id, i) => card(ctx, 75 - i * 75, i === 1 ? -9 : 8, 62, 84, id, i === 1 ? '#1687ec' : '#fffdf6', i === 1 ? '#fffdf6' : STUDIO.blue));
      break;
    case 'Hidden':
      o('grapes', -38, 9, 135, 181);
      o('magnifier', 34, 13, 163, 170);
      break;
    case 'Bounce':
      roundSurface(ctx, -95, 53, 190, 26, '#85bfdc', 13);
      line(ctx, [[-65, 76], [-74, 94]], '#8cabbc', 7); line(ctx, [[65, 76], [74, 94]], '#8cabbc', 7);
      card(ctx, 0, -30, 112, 115, 'lam', '#1687ec', '#fffdf6', -0.15);
      break;
    case 'BuildWord':
      o('apple', 0, -53, 88, 90);
      threeCards(['be', 'kaf', 're'], 48);
      break;
    case 'FillLetter':
      threeCards(['be', null, 're'], -26);
      card(ctx, 0, 66, 57, 65, 'kaf', '#1687ec', '#fffdf6', -0.12);
      break;
    case 'JoinWord':
      card(ctx, -55, -22, 100, 102, 'be', '#1687ec', '#fffdf6', -0.08, 'initial');
      card(ctx, 55, 20, 100, 102, 're', '#ffca36', '#fffdf6', 0.08);
      line(ctx, [[-28, 72], [28, 72]], '#9c78d4', 6);
      break;
    default:
      ink(ctx, game.icon?.letter ?? 'be', 0, 0, 160, 160, STUDIO.blue);
  }
  ctx.restore();
}

export function studioTileMaker(scene, games, size) {
  const images = studioImages(scene);
  return (game, x, y, onTap) => {
    const index = games.findIndex((one) => one.scene === game.scene);
    const button = studioButton(scene, {
      x, y, ...size, color: studioTileColor(game, index), radius: 30,
      onTap, paintKey: `tile:${game.scene}`,
      paint: (ctx) => paintStudioArt(ctx, game, size, images),
    });
    button.setName('tile');
    button.gameKey = game.scene;
    return button;
  };
}
