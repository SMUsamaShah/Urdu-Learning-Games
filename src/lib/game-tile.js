import { glyphUpem, letterGlyph, numberGlyph } from './content.js';
import { fitEmLine, paintGlyph } from './glyph.js';
import { artName } from './games.js';
import { paintTileFace } from './tile-faces.js';
import { hasTileArt, TILE_FRAME_KEY, tileArtImage } from './tiles.js';
import { squash } from './liveliness.js';
import { COLORS, makeButton } from './theme.js';

/* The tiles the menu is made of. */

/* The glyph a tile falls back to when it has no drawing. */
export function iconGlyph(game) {
  if (game.number) return numberGlyph(game.number);
  if (game.icon) return letterGlyph(game.icon.letter, game.icon.form);
  return null;
}

/* The artwork panel, inset beneath the generated frame. */
export function tilePanel(width, height) {
  const inset = Math.round(Math.min(width, height) * FRAME);
  const panel = { width: width - inset * 2, height: height - inset * 2 };
  panel.radius = Math.round(Math.min(panel.width, panel.height) * 0.13);
  return panel;
}

/** The panel and the drawing on it, into a context whose origin is the tile's centre.
 * @returns {boolean} whether a drawing was found.
 */
export function paintTilePanel(ctx, game, panel, picture = null) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-panel.width / 2, -panel.height / 2, panel.width, panel.height, panel.radius);
  // Not white. A picture on white is a diagram.
  const wash = ctx.createLinearGradient(0, -panel.height / 2, 0, panel.height / 2);
  wash.addColorStop(0, tint(game.color, 0.62));
  wash.addColorStop(0.62, tint(game.color, 0.87));
  wash.addColorStop(1, tint(game.color, 0.96));
  ctx.fillStyle = wash;
  ctx.fill();
  // Clip artwork to the tile panel.
  ctx.clip();
  // Prefer generated artwork when available.
  const drawn = picture
    ? Boolean(
        ctx.drawImage(
          picture,
          GENERATED_BEZEL,
          GENERATED_BEZEL,
          picture.width - GENERATED_BEZEL * 2,
          picture.height - GENERATED_BEZEL * 2,
          -panel.width / 2,
          -panel.height / 2,
          panel.width,
          panel.height
        ) ?? true
      )
    : paintTileFace(ctx, artName(game), {
        width: panel.width,
        height: panel.height,
        color: game.color,
      });
  ctx.restore();
  return drawn;
}

/* The game's colour, mixed that far towards white. */
function tint(color, towards) {
  const to = (shift) => {
    const channel = (color >> shift) & 0xff;
    return Math.round(channel + (255 - channel) * towards)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${to(16)}${to(8)}${to(0)}`;
}

/* How thick the coloured frame is, as a fraction of the tile. */
const FRAME = 0.055;

/* Generated tile files include their own outer bezel; the coded card owns that edge. */
const GENERATED_BEZEL = 28;

/** Measures a set of games, then draws tiles from it.
 * @param {Phaser.Scene} scene
 * @param {object[]} games menu entries with `color` and `scene` or `art`
 * @param {{width: number, height: number, role?: string}} size of each tile
 * @returns {(game: object, x: number, y: number, onTap: () => void) => Phaser.GameObjects.Container}
 */
export function tileMaker(scene, games, { width, height, role = 'tile' }) {
  const panel = tilePanel(width, height);

  // Where the letter goes on a tile with no drawing.
  const iconBox = { height: height * 0.42 };
  const iconFit = fitEmLine(games.map(iconGlyph).filter(Boolean), width * 0.7, iconBox.height);

  /* Everything on a tile's face, painted into the card's own texture. */
  const paintFace = (game) => (ctx) => {
    if (paintTilePanel(ctx, game, panel, tileArtImage(scene, game))) return;

    // Show a centred fallback letter when artwork is missing.
    const glyph = iconGlyph(game);
    const id = game.number ?? (game.icon && `${game.icon.letter}:${game.icon.form}`);
    if (glyph) {
      // The ink centred on the panel.
      const scale = iconFit.em / glyphUpem();
      const [, , inkWidth, inkHeight] = glyph.bbox;
      ctx.save();
      ctx.translate((-inkWidth * scale) / 2, (-inkHeight * scale) / 2);
      paintGlyph(ctx, glyph, { scale, color: COLORS.outlineCss });
      ctx.restore();
    } else if (id) {
      // A tile that asked for a letter and did not get one still draws.
      console.error(`menu tile "${game.ui}" has nothing to draw: no face, and no glyph for ${id}`);
    }
  };

  return (game, x, y, onTap) => {
    const button = makeButton(scene, {
      x,
      y,
      width,
      height,
      color: game.color,
      onTap,
      paint: paintFace(game),
      backing: false,
      rim: false,
      // The panel's height stands in for an em here.
      paintKey:
        `${role}-face:em${Math.round(panel.height)}:${artName(game)}` +
        (hasTileArt(game) ? ':art' : ':drawn'),
    });
    // Keep the frame separate so its transparent opening reveals the artwork.
    button.add(scene.add.image(0, 0, TILE_FRAME_KEY).setDisplaySize(width, height));
    // Named so a check can find the tiles among everything else on the menu without knowing where they were laid out.
    button.setName(role);
    button.on('pointerdown', () => squash(scene, button));
    return button;
  };
}

/** Where each tile in a grid goes, right-to-left within a row.
 * @param {number} count how many tiles
 * @param {object} grid columns, gaps, tile size, and centre position
 */
export function gridPlaces(count, { columns, gap, rowGap, width, height, centerX, top }) {
  return Array.from({ length: count }, (unused, index) => {
    const row = Math.floor(index / columns);
    const inRow = Math.min(count - row * columns, columns);
    const rowWidth = inRow * width + (inRow - 1) * gap;
    return {
      x: centerX + rowWidth / 2 - width / 2 - (index % columns) * (width + gap),
      y: top + height / 2 + row * (height + rowGap),
    };
  });
}
