import { glyphUpem, letterGlyph, numberGlyph } from './content.js';
import { fitEmLine, paintGlyph } from './glyph.js';
import { artName } from './games.js';
import { paintTileFace } from './tile-faces.js';
import { hasTileArt, tileArtImage } from './tiles.js';
import { squash } from './liveliness.js';
import { COLORS, makeButton } from './theme.js';

/**
 * The tiles the menu is made of.
 *
 * Pulled out of Home because there are now two places that show a grid of games
 * — the menu itself and the panel of extra games behind it — and a tile that
 * looked different in the two would read as two different apps.
 *
 * ## A picture, and nothing else
 *
 * A tile is a white card with the game's colour as its frame, and a drawing of
 * the game filling it. It used to carry a caption too: the Urdu name on a solid
 * band of the game's colour, with a roman gloss under it.
 *
 * The band is gone, and it is the child it is gone for. A three-year-old cannot
 * read either line, so the band spent a third of every tile saying nothing to
 * the person choosing — while covering the part of the picture that could have
 * said it. The reference apps this menu is chasing have no text on their tiles
 * at all, and their menus work for exactly this age. The picture is the label
 * now, which is why the pictures had to get good first (see tile-faces.js).
 *
 * The names have not disappeared from the app: every game's screen opens with
 * its own instruction ribbon in Urdu, which is where a name is worth reading
 * because there is one of them rather than twenty-five.
 *
 * ## One texture, one quad
 *
 * Built the obvious way a tile is a card, a picture and two lines of writing —
 * five objects and five textures each, and on a menu of ten that was 69 objects
 * and 67 distinct textures. None of it ever changes after the scene opens, so
 * the whole face is painted once into a single cached texture and drawn as one
 * quad. The cost is that a tile cannot animate its parts separately; it never
 * did, tiles bob and squash as a whole.
 *
 * ## Why a factory rather than a function per tile
 *
 * The fallback letter — what a game with no drawing of its own shows — is drawn
 * at one em **across the whole grid**, which cannot be decided one tile at a
 * time: it is the deepest-descending letter in the set that settles the size
 * for all of them. So the set is measured once, up front, and the returned
 * function paints tiles at sizes that are already agreed.
 */

/**
 * The glyph a tile falls back to when it has no drawing.
 *
 * Exposed so the set can be measured before any of it is drawn. Tiles with a
 * drawing have no fallback glyph and are simply absent from the set.
 */
export function iconGlyph(game) {
  if (game.number) return numberGlyph(game.number);
  if (game.icon) return letterGlyph(game.icon.letter, game.icon.form);
  return null;
}

/**
 * The panel a tile's drawing goes on, inset so the card shows as a frame.
 *
 * Exported with the painter below because `npm run preview-tiles` draws the
 * same twenty-five tiles onto a sheet, and it used to work this out for itself.
 * That was harmless while both painted a plain white panel and stopped being
 * harmless the moment one of them did anything else: the sheet went on showing
 * white cards for a change that had already landed in the app. A preview that
 * can disagree with the thing it previews is worse than no preview.
 */
export function tilePanel(width, height) {
  const inset = Math.round(Math.min(width, height) * FRAME);
  const panel = { width: width - inset * 2, height: height - inset * 2 };
  panel.radius = Math.round(Math.min(panel.width, panel.height) * 0.13);
  return panel;
}

/**
 * The panel and the drawing on it, into a context whose origin is the tile's
 * centre.
 *
 * @returns {boolean} whether a drawing was found. False means the caller should
 *   fall back to the letter the tile carries.
 */
export function paintTilePanel(ctx, game, panel, picture = null) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-panel.width / 2, -panel.height / 2, panel.width, panel.height, panel.radius);
  // Not white. A picture on white is a diagram; the tiles this menu is chasing
  // are little scenes, and the first thing that made ours read as muted was
  // twenty-five drawings on twenty-five white cards. A wash of the game's own
  // colour, palest at the bottom where the ground usually goes, gives every
  // tile some air in it and still leaves the drawing the strongest thing on it.
  const wash = ctx.createLinearGradient(0, -panel.height / 2, 0, panel.height / 2);
  wash.addColorStop(0, tint(game.color, 0.62));
  wash.addColorStop(0.62, tint(game.color, 0.87));
  wash.addColorStop(1, tint(game.color, 0.96));
  ctx.fillStyle = wash;
  ctx.fill();
  // Clipped, so a drawing can run its ground and its water to the edge of the
  // panel rather than stopping short of it in a way no illustration would.
  ctx.clip();
  // The picture if there is one, the drawing if there is not. Bled to the edges
  // of the panel rather than inset: these are illustrations of a whole scene and
  // a margin round one reads as a photograph in a frame.
  const drawn = picture
    ? Boolean(
        ctx.drawImage(
          picture,
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

/** The game's colour, mixed that far towards white. */
function tint(color, towards) {
  const to = (shift) => {
    const channel = (color >> shift) & 0xff;
    return Math.round(channel + (255 - channel) * towards)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${to(16)}${to(8)}${to(0)}`;
}

/**
 * How thick the coloured frame is, as a fraction of the tile.
 *
 * A fraction rather than a pixel count because the same tile is drawn at 234px
 * on the menu and at 178px in the panel, and a frame fixed in pixels turns from
 * a border into a bezel on the smaller one.
 */
const FRAME = 0.055;

/**
 * Measures a set of games, then draws tiles from it.
 *
 * @param {Phaser.Scene} scene
 * @param {object[]} games entries with `color`, a `scene` (or `art`) naming the
 *   drawing in tile-faces.js, and an `icon` or `number` to fall back to
 * @param {{width: number, height: number, role?: string}} size every tile in
 *   the set, plus a name for the set. The name leads the baked face's texture
 *   key and carries the size it was drawn at, so two grids of different-sized
 *   tiles neither share a cached face nor look to verify:sizing like one role
 *   drawn at two sizes
 * @returns {(game: object, x: number, y: number, onTap: () => void) => Phaser.GameObjects.Container}
 */
export function tileMaker(scene, games, { width, height, role = 'tile' }) {
  const panel = tilePanel(width, height);

  // Where the letter goes on a tile with no drawing. The line is as deep as it
  // is because Nastaliq's vertical range is enormous: گنتی and لکھو reach two
  // full ems above the baseline, since the ascender on a گ or a ک is drawn as a
  // long rising stroke, while حروف and جوڑے drop half an em below it.
  const iconBox = { height: height * 0.42 };
  const iconFit = fitEmLine(games.map(iconGlyph).filter(Boolean), width * 0.7, iconBox.height);

  /**
   * Everything on a tile's face, painted into the card's own texture.
   *
   * Runs once per distinct tile and never again — see the note at the top on
   * why this is not five objects.
   */
  const paintFace = (game) => (ctx) => {
    if (paintTilePanel(ctx, game, panel, tileArtImage(scene, game))) return;

    // No drawing: the letter the tile used to carry, centred on the panel.
    const glyph = iconGlyph(game);
    const id = game.number ?? (game.icon && `${game.icon.letter}:${game.icon.form}`);
    if (glyph) {
      // The ink centred on the panel, not the em box: a fallback letter is the
      // whole picture, so what should look centred is the letter itself.
      const scale = iconFit.em / glyphUpem();
      const [, , inkWidth, inkHeight] = glyph.bbox;
      ctx.save();
      ctx.translate((-inkWidth * scale) / 2, (-inkHeight * scale) / 2);
      paintGlyph(ctx, glyph, { scale, color: COLORS.outlineCss });
      ctx.restore();
    } else if (id) {
      // A tile that asked for a letter and did not get one still draws — it
      // just comes out blank, which is exactly what `sad` and `he` did for
      // weeks (the ids are `suad` and `choti-he`). Said out loud, because the
      // verifiers fail on a console error and nothing else was ever going to
      // notice.
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
      // The panel's height stands in for an em here: every letter inside a
      // drawing is a fraction of it, so it is the one number that decides how
      // big the writing on a tile comes out. verify:sizing reads it to check
      // that one role is never drawn at two sizes.
      // `art` or `drawn` in the key: a tile whose picture had not loaded when
      // the menu was built would otherwise share a cached texture with the same
      // tile drawn from the picture, and the menu would keep whichever it made
      // first for the rest of the session.
      paintKey:
        `${role}-face:em${Math.round(panel.height)}:${artName(game)}` +
        (hasTileArt(game) ? ':art' : ':drawn'),
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
