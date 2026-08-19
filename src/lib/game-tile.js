import { glyphUpem, letterGlyph, numberGlyph, uiGlyph, uiGlyphs } from './content.js';
import { fitEmLine, glyphMetrics, paintGlyph } from './glyph.js';
import { tileArtImage } from './tiles.js';
import { squash } from './liveliness.js';
import { COLORS, chunkyGlyphEm, makeButton } from './theme.js';

/**
 * The tiles the menu is made of.
 *
 * Pulled out of Home because there are now two places that show a grid of games
 * — the menu itself and the panel of extra games behind it — and a tile that
 * looked different in the two would read as two different apps.
 *
 * ## One texture, one quad
 *
 * A tile is five things stacked: the coloured card, the picture, the caption
 * band, the Urdu name and the roman gloss. Built the obvious way that is five
 * objects and five textures each, and on a menu of ten it was 69 objects and 67
 * distinct textures — with three full-tile quads drawn over each other for
 * every tile, most of the first two hidden behind the last.
 *
 * None of it ever changes after the scene opens, so the whole face is painted
 * once into a single cached texture and drawn as one quad. That took the menu
 * to 29 objects and 27 textures, and cut the grid's fill in half.
 *
 * The cost is that a tile cannot animate its parts separately. It never did:
 * tiles bob and squash as a whole.
 *
 * ## Why a factory rather than a function per tile
 *
 * The Urdu names are drawn at one em on one shared baseline **across the whole
 * grid**, which cannot be decided one tile at a time — it is the
 * deepest-descending name in the set that settles the size for all of them. So
 * the set is measured once, up front, and the returned function paints tiles at
 * sizes that are already agreed. Sizing per tile is exactly the bug this shape
 * exists to prevent: it would give a grid where ب comes out twice the size of م
 * and the menu reads as a pile of unrelated buttons.
 */

/**
 * The glyph a tile is illustrated with, where it has one.
 *
 * Exposed so the set can be measured before any of it is drawn. Tiles
 * illustrated with a picture have no glyph and are simply absent from the set.
 */
export function iconGlyph(game) {
  if (game.number) return numberGlyph(game.number);
  if (game.icon) return letterGlyph(game.icon.letter, game.icon.form);
  return null;
}

/** The roman gloss's face, matching label() in theme.js. */
const ROMAN_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Rounded along the bottom two corners only, square where it meets the art. */
function bandPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.closePath();
}

/**
 * Measures a set of games, then draws tiles from it.
 *
 * @param {Phaser.Scene} scene
 * @param {object[]} games entries with `ui`, `roman`, `color`, the name of a
 *   picture in content/tiles.json, and an `icon` or `number` to fall back to
 * @param {{width: number, height: number, role?: string}} size every tile in
 *   the set, plus a name for the set. The name leads the baked face's texture
 *   key and carries the em it was drawn at, so two grids of different-sized
 *   tiles neither share a cached face nor look to verify:sizing like one role
 *   drawn at two sizes
 * @returns {(game: object, x: number, y: number, onTap: () => void) => Phaser.GameObjects.Container}
 */
export function tileMaker(scene, games, { width, height, role = 'tile' }) {
  // The picture, inset so the coloured card shows as a thin frame around it —
  // the reference app's tiles are framed the same way, and the frame is what
  // stops twenty-four pictures on a photographic backdrop reading as clutter.
  const art = { width: width - 12, height: height - 12 };
  // The name sits on a solid band of the game's own colour across the bottom of
  // the picture, not on a gradient over it. A gradient was tried first and it
  // cannot work here: these pictures are pale by house style, the band is 40
  // pixels tall, and white Urdu on a grey wash over a cream illustration was
  // unreadable at tile size on every light one. A solid band gives the same
  // contrast on all twenty-five whatever the picture underneath does.
  const band = { height: art.height * 0.38, radius: art.width * 0.102 };
  band.top = art.height / 2 - band.height;
  const labelFit = fitEmLine(
    uiGlyphs(games.map((game) => game.ui)),
    width - 34,
    band.height * 0.7
  );
  const romanSize = Math.max(11, Math.round(band.height * 0.2));

  // Where the letter goes on a tile with no picture. The line is as deep as it
  // is because Nastaliq's vertical range is enormous: گنتی and لکھو reach two
  // full ems above the baseline, since the ascender on a گ or a ک is drawn as a
  // long rising stroke, while حروف and جوڑے drop half an em below it.
  const iconBox = { top: -height * 0.44, height: height * 0.34 };
  const iconFit = fitEmLine(games.map(iconGlyph).filter(Boolean), width * 0.66, iconBox.height);

  /** Paints one letter centred on x, sitting on the shared baseline. */
  const paintCentred = (ctx, glyph, em, baselineY, options) => {
    const metrics = glyphMetrics(glyph, em);
    ctx.save();
    ctx.translate(-metrics.width / 2, baselineY - metrics.baseline);
    paintGlyph(ctx, glyph, { scale: em / glyphUpem(), ...options });
    ctx.restore();
  };

  /**
   * Everything on a tile's face, painted into the card's own texture.
   *
   * Runs once per distinct tile and never again — see the note at the top on
   * why this is not five objects.
   */
  const paintFace = (game) => (ctx) => {
    const picture = tileArtImage(scene, game);
    if (picture) {
      ctx.drawImage(picture, -art.width / 2, -art.height / 2, art.width, art.height);
    } else {
      // No picture: the letter the tile used to carry, in the same place.
      const glyph = iconGlyph(game);
      const id = game.number ?? (game.icon && `${game.icon.letter}:${game.icon.form}`);
      if (glyph) {
        paintCentred(ctx, glyph, iconFit.em, iconBox.top + iconFit.baseline, chunkyGlyphEm(iconFit.em));
      } else if (id) {
        // A tile that asked for a letter and did not get one still draws — it
        // just comes out as a name with a hole above it, which is exactly what
        // `sad` and `he` did for weeks (the ids are `suad` and `choti-he`).
        // Said out loud, because the verifiers fail on a console error and
        // nothing else was ever going to notice.
        console.error(`menu tile "${game.ui}" has no glyph for ${id}`);
      }
    }

    ctx.fillStyle =
      `rgba(${(game.color >> 16) & 0xff},${(game.color >> 8) & 0xff},${game.color & 0xff},0.94)`;
    bandPath(ctx, -art.width / 2, band.top, art.width, band.height, band.radius);
    ctx.fill();

    const nameGlyph = uiGlyph(game.ui);
    if (nameGlyph) {
      paintCentred(ctx, nameGlyph, labelFit.em, band.top + 2 + labelFit.baseline, chunkyGlyphEm(labelFit.em));
    }

    ctx.fillStyle = COLORS.onColor;
    ctx.font = `500 ${romanSize}px ${ROMAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.roman, 0, band.top + band.height * 0.85);
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
      paintKey: `${role}-face:em${Math.round(labelFit.em)}:${game.ui}`,
    });
    // Named so a check can find the tiles among everything else on the menu
    // without knowing where they were laid out. `role` also tells the menu's
    // tiles apart from the panel's.
    button.setName(role);
    button.on('pointerdown', () => squash(scene, button));
    return button;
  };
}

/**
 * Where each tile in a grid goes, right-to-left within a row.
 *
 * Right to left because that is the direction the script being taught is read
 * in, and a menu that runs the other way teaches the opposite of the lesson
 * every screen behind it is giving.
 *
 * @param {number} count how many tiles
 * @param {object} grid columns, gap, rowGap, tile size, and the centre x and
 *   top y the grid is laid out from
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
