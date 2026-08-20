import { uiGlyph } from './content.js';
import { addGlyph } from './glyph.js';
import { gridPlaces, tileMaker } from './game-tile.js';
import { popIn, squash } from './liveliness.js';
import * as sfx from './sfx.js';
import { COLORS, DESIGN, makeButton } from './theme.js';

/**
 * The panel of extra games, over the menu.
 *
 * ## Why the menu is split at all
 *
 * There are twenty-four games. Laid out as one grid they came out fifty-seven
 * pixels wide with their names overlapping into a smear — the grid was written
 * to shrink its tiles rather than overflow, which is the right failure but not a
 * usable one at this many. Something had to give: either the tiles get small, or
 * the menu scrolls, or it splits.
 *
 * It splits, the way the app this is modelled on splits: nine on the menu, the
 * rest behind one more tile. That is worth more than paging the whole set,
 * because the nine never move. A three-year-old does not read the tiles — they
 * remember that letters is top right and writing is next to it, and any layout
 * where today's top right is tomorrow's second page throws that away.
 *
 * ## Pages, not a scroll
 *
 * The remaining fifteen are shown eight at a time with an arrow either side.
 * Scrolling would need momentum, bounds and a scrollbar to be usable, and a
 * dragged list steals the drag from the tiles underneath it — a child pressing a
 * tile and moving their finger a few pixels would scroll instead of choosing.
 * Two big arrows have neither problem.
 */

import { goBack, pushScreen } from './history.js';

const COLUMNS = 4;
const ROWS = 2;
const PER_PAGE = COLUMNS * ROWS;

const PANEL = { width: 1120, height: 600, y: 376 };

/**
 * The panel, sized to what is actually going in it.
 *
 * Fifteen games need two rows and the paging dots under them. Three need one
 * row and no dots, and drawn at the full height they sat in the top corner of a
 * mostly empty cream rectangle, which reads as a page that failed to load
 * rather than as a short list.
 */
function panelFor(count) {
  const rows = Math.max(1, Math.min(ROWS, Math.ceil(count / COLUMNS)));
  const dots = count > PER_PAGE ? 46 : 0;
  const height = HEADER + 40 + rows * TILE.height + (rows - 1) * ROW_GAP + 40 + dots;
  return { width: PANEL.width, height, y: PANEL.y - (PANEL.height - height) / 2 };
}
/** The coloured title bar across the top of the panel. */
const HEADER = 84;
/**
 * The same shape as a menu tile, so one drawing serves both grids. The menu's
 * tiles are 173x180; this is that at 1.13x, and the art is generated to fit it.
 */
const TILE = { width: 196, height: 204 };
const GAP = 24;
const ROW_GAP = 22;

/**
 * @param {Phaser.Scene} scene
 * @param {object[]} games tiles to show, in order
 * @param {(game: object) => void} onPick
 * @param {{title?: string}} [options] the ui.json string across the header.
 *   Defaults to "more games" because that is what this was built for; it is a
 *   parameter because it now also holds the spelling group, and a panel that
 *   says "more games" over the spelling games would be lying about where you
 *   are.
 * @returns {Phaser.GameObjects.Container} destroy it to close the panel
 */
export function openGamesPanel(scene, games, onPick, { title = 'more-games' } = {}) {
  const layer = scene.add.container(0, 0).setDepth(60);
  // Everything that dismisses the panel goes through the history, so the phone's
  // back button and the ← in the corner are one path. See src/lib/history.js.
  const close = () => goBack();
  pushScreen('games-panel', () => {
    sfx.swoosh();
    layer.destroy(true);
  });

  // A dim sheet that also swallows taps. Without it a finger landing between
  // two tiles would reach the menu underneath and start a game nobody chose.
  const dim = scene.add
    .rectangle(DESIGN.width / 2, DESIGN.height / 2, DESIGN.width, DESIGN.height, 0x1b2033, 0.55)
    .setInteractive();
  dim.on('pointerup', close);
  layer.add(dim);

  const box = panelFor(games.length);
  const card = scene.add.graphics();
  const left = (DESIGN.width - box.width) / 2;
  const top = box.y - box.height / 2;
  card.fillStyle(COLORS.shadow, 0.3);
  card.fillRoundedRect(left, top + 10, box.width, box.height, 34);
  // A coloured bar across the top, the paper below it. Without the bar the
  // panel is a cream rectangle on a cream menu behind a grey wash, and its top
  // edge — the one thing that says "this is a separate place you can leave" —
  // is the faintest line on screen.
  card.fillStyle(COLORS.accent, 1);
  card.fillRoundedRect(left, top, box.width, box.height, 34);
  card.fillStyle(COLORS.bg, 1);
  card.fillRoundedRect(left, top + HEADER, box.width, box.height - HEADER, 34);
  card.fillRect(left, top + HEADER, box.width, 34);
  layer.add(card);

  const heading = uiGlyph(title);
  if (heading) {
    layer.add(
      addGlyph(scene, DESIGN.width / 2, top + HEADER / 2, `ui:${title}:52`, heading, {
        height: 52,
        color: COLORS.onColor,
      })
    );
  }

  const back = makeButton(scene, {
    x: left + 62,
    y: top + HEADER / 2,
    width: 84,
    height: 62,
    color: COLORS.panel,
    rim: false,
    onTap: close,
  });
  back.add(scene.add.text(0, 0, '←', { fontSize: '34px', color: COLORS.ink }).setOrigin(0.5));
  layer.add(back);

  // Measured across every game in the panel, not per page: a tile must not
  // change size when the page it happens to be on changes.
  const makeTile = tileMaker(scene, games, { ...TILE, role: 'panel-tile' });
  const pages = Math.ceil(games.length / PER_PAGE);
  const gridTop = top + HEADER + 22;
  const board = scene.add.container(0, 0);
  layer.add(board);

  const dots = [];
  const dotsY = top + box.height - 40;
  for (let i = 0; i < pages; i++) {
    // Right to left, like everything else here: the first page is the
    // rightmost dot.
    const dot = scene.add.circle(
      DESIGN.width / 2 - (i - (pages - 1) / 2) * 28,
      dotsY,
      7,
      COLORS.accent
    );
    dots.push(dot);
    layer.add(dot);
  }

  let page = 0;

  const arrow = (x, step, glyph) => {
    const button = makeButton(scene, {
      x,
      y: box.y + 6,
      width: 74,
      height: 132,
      color: COLORS.panel,
      rim: false,
      onTap: () => {
        // Wraps, so neither arrow is ever the dead one. A button that does
        // nothing on the last page reads as broken rather than as the end.
        page = (page + step + pages) % pages;
        sfx.swoosh();
        squash(scene, button);
        showPage();
      },
    });
    button.add(
      scene.add.text(0, 0, glyph, { fontSize: '40px', color: COLORS.ink }).setOrigin(0.5)
    );
    layer.add(button);
    return button;
  };

  function showPage() {
    board.removeAll(true);
    const shown = games.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    const places = gridPlaces(shown.length, {
      columns: COLUMNS,
      gap: GAP,
      rowGap: ROW_GAP,
      width: TILE.width,
      height: TILE.height,
      centerX: DESIGN.width / 2,
      top: gridTop,
    });
    shown.forEach((game, index) => {
      const tile = makeTile(game, places[index].x, places[index].y, () => {
        sfx.whoosh();
        scene.time.delayedCall(150, () => onPick(game));
      });
      board.add(tile);
      popIn(scene, tile, { delay: index * 40, duration: 260 });
    });
    dots.forEach((dot, index) => dot.setAlpha(index === page ? 1 : 0.28));
    // Held on the panel so the verifier can tell a page turn from a missed tap.
    layer.page = page;
  }

  if (pages > 1) {
    // Forward is leftward. The tiles run right to left, so a left-pointing
    // arrow is the one that carries on rather than the one that goes back.
    arrow(left + 48, 1, '‹');
    arrow(left + box.width - 48, -1, '›');
  } else {
    dots.forEach((dot) => dot.destroy());
  }
  showPage();

  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 180 });
  return layer;
}
