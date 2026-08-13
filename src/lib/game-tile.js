import { letterGlyph, numberGlyph, uiGlyph, uiGlyphs } from './content.js';
import { addGlyphBaseline, fitEmLine } from './glyph.js';
import { addWordImage } from './images.js';
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

/** Every word illustration a set of tiles needs, for preload(). */
export function tilePictures(games) {
  return games.map((game) => game.picture).filter(Boolean);
}

/**
 * Measures a set of games, then draws tiles from it.
 *
 * @param {Phaser.Scene} scene
 * @param {object[]} games entries with `ui`, `roman`, `color` and one of
 *   `icon` / `number` / `picture`
 * @param {{width: number, height: number, role?: string}} size every tile in
 *   the set, plus the texture-key prefix its glyphs are filed under — two grids
 *   of different-sized tiles are two roles, and verify:sizing checks each role
 *   is drawn at exactly one size
 * @returns {(game: object, x: number, y: number, onTap: () => void) => Phaser.GameObjects.Container}
 */
export function tileMaker(scene, games, { width, height, role = 'tile' }) {
  // The lines are as deep as they are because Nastaliq's vertical range is
  // enormous: گنتی and لکھو reach two full ems above the baseline, since the
  // ascender on a گ or a ک is drawn as a long rising stroke, while حروف and
  // جوڑے drop half an em below it. Reserving room for both at once is the price
  // of a shared baseline, and it is what decides the sizes here.
  const iconBox = { top: -height * 0.46, height: height * 0.4 };
  const iconFit = fitEmLine(games.map(iconGlyph).filter(Boolean), width * 0.66, iconBox.height);
  // The Urdu name stops a little short of the roman gloss below it. گنتی and
  // جوڑے drop a long way under their baseline, and a box that runs all the way
  // down to the gloss puts that descender through the middle of it.
  const labelTop = -height * 0.09;
  const labelFit = fitEmLine(
    uiGlyphs(games.map((game) => game.ui)),
    width - 34,
    height * 0.38
  );

  /**
   * A tile's picture: a letter, a word illustration or a numeral.
   *
   * Whatever a game is about, drawn the way that game draws it, so the menu
   * previews the thing rather than decorating it.
   */
  const drawIcon = (game) => {
    // A picture has no baseline to sit on, so it is centred in the same box the
    // letters were fitted into, and drawn a little larger than their line: a
    // letter only inks part of its line box, an apple fills all of its own.
    if (game.picture) {
      return addWordImage(
        scene,
        0,
        iconBox.top + iconBox.height / 2,
        game.picture,
        iconBox.height * 1.3
      );
    }
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

    const icon = drawIcon(game);
    if (icon) button.add(icon);

    const nameGlyph = uiGlyph(game.ui);
    if (nameGlyph) {
      button.add(
        addGlyphBaseline(
          scene,
          0,
          labelTop + labelFit.baseline,
          `${role}-label:em${Math.round(labelFit.em)}:${game.ui}`,
          nameGlyph,
          chunkyGlyphEm(labelFit.em)
        )
      );
    }

    button.add(
      label(scene, 0, height * 0.4, game.roman, {
        size: Math.max(12, Math.round(height * 0.1)),
        color: COLORS.onColorDim,
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
