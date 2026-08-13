import { letterGlyph, numberGlyph, uiGlyph, uiGlyphs } from './content.js';
import { addGlyphBaseline, fitEmLine } from './glyph.js';
import { addTileArt } from './tiles.js';
import { squash } from './liveliness.js';
import { COLORS, chunkyGlyphEm, label, makeButton } from './theme.js';

/**
 * The tiles the menu is made of.
 *
 * Pulled out of Home because there are now two places that show a grid of games
 * — the menu itself and the panel of extra games behind it — and a tile that
 * looked different in the two would read as two different apps.
 *
 * ## Why a factory rather than a function per tile
 *
 * A tile is three stacked lines: the icon, the Urdu name, the roman gloss. The
 * two Urdu lines are drawn at one em on one shared baseline **across the whole
 * grid**, which cannot be decided one tile at a time — it is the tallest icon
 * and the deepest-descending name in the set that settle the size for all of
 * them. So the set is measured once, up front, and the returned function draws
 * tiles at sizes that are already agreed. Sizing per tile is exactly the bug
 * this shape exists to prevent: it would give a grid where ب comes out twice
 * the size of م and the menu reads as a pile of unrelated buttons.
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

/**
 * Measures a set of games, then draws tiles from it.
 *
 * @param {Phaser.Scene} scene
 * @param {object[]} games entries with `ui`, `roman`, `color`, the name of a
 *   picture in content/tiles.json, and an `icon` or `number` to fall back to
 * @param {{width: number, height: number, role?: string}} size every tile in
 *   the set, plus the texture-key prefix its glyphs are filed under — two grids
 *   of different-sized tiles are two roles, and verify:sizing checks each role
 *   is drawn at exactly one size
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
  const band = { height: art.height * 0.38, radius: (width - 12) * 0.102 };
  band.top = art.height / 2 - band.height;
  const labelFit = fitEmLine(
    uiGlyphs(games.map((game) => game.ui)),
    width - 34,
    band.height * 0.7
  );

  // Where the letter goes on a tile with no picture. The lines are as deep as
  // they are because Nastaliq's vertical range is enormous: گنتی and لکھو reach
  // two full ems above the baseline, since the ascender on a گ or a ک is drawn
  // as a long rising stroke, while حروف and جوڑے drop half an em below it.
  const iconBox = { top: -height * 0.44, height: height * 0.34 };
  const iconFit = fitEmLine(games.map(iconGlyph).filter(Boolean), width * 0.66, iconBox.height);

  /** The letter a tile falls back to when its picture is missing. */
  const drawIcon = (game) => {
    const glyph = iconGlyph(game);
    const id = game.number ?? (game.icon && `${game.icon.letter}:${game.icon.form}`);
    if (!glyph) {
      // A tile that asked for a letter and did not get one still draws — it
      // just comes out as a name with a hole above it, which is exactly what
      // `sad` and `he` did for weeks (the ids are `suad` and `choti-he`). Said
      // out loud, because the verifiers fail on a console error and nothing
      // else was ever going to notice.
      if (id) console.error(`menu tile "${game.ui}" has no glyph for ${id}`);
      return null;
    }
    return addGlyphBaseline(
      scene,
      0,
      iconBox.top + iconFit.baseline,
      `${role}-icon:em${Math.round(iconFit.em)}:${id}`,
      glyph,
      chunkyGlyphEm(iconFit.em)
    );
  };

  return (game, x, y, onTap) => {
    const button = makeButton(scene, {
      x,
      y,
      width,
      height,
      color: game.color,
      onTap,
    });
    button.on('pointerdown', () => squash(scene, button));

    // The picture if there is one, and the letter only if there is not. A game
    // added without art still gets a tile that looks like the others rather
    // than a blank one, and the fallback is the tile this menu had before.
    const picture = addTileArt(scene, game, art.width, art.height);
    if (picture) {
      button.add(picture);
      // Only the bottom corners are rounded, matching the picture's own baked
      // ones. Phaser takes a radius per corner, which is what makes a band
      // across the bottom of a rounded rectangle possible without a mask.
      const caption = scene.add.graphics();
      caption.fillStyle(game.color, 0.94);
      caption.fillRoundedRect(-art.width / 2, band.top, art.width, band.height, {
        tl: 0,
        tr: 0,
        bl: band.radius,
        br: band.radius,
      });
      button.add(caption);
    } else {
      const icon = drawIcon(game);
      if (icon) button.add(icon);
    }

    const nameGlyph = uiGlyph(game.ui);
    if (nameGlyph) {
      button.add(
        addGlyphBaseline(
          scene,
          0,
          band.top + 2 + labelFit.baseline,
          `${role}-label:em${Math.round(labelFit.em)}:${game.ui}`,
          nameGlyph,
          chunkyGlyphEm(labelFit.em)
        )
      );
    }

    button.add(
      label(scene, 0, band.top + band.height * 0.85, game.roman, {
        size: Math.max(11, Math.round(band.height * 0.2)),
        color: COLORS.onColor,
      })
    );

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
