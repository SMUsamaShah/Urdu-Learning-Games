import Phaser from 'phaser';
import { letterGlyph, numberGlyph, uiGlyph } from '../lib/content.js';
import { addGlyph, fitGlyphHeight } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { addMascot } from '../lib/mascot.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { addScenery } from '../lib/scenery.js';
import { COLORS, DESIGN, chunkyGlyph, label, makeButton } from '../lib/theme.js';

/**
 * The menu.
 *
 * Games are listed right-to-left to match the reading direction of the script
 * being taught. Each tile carries its Urdu name as a baked glyph plus a small
 * roman gloss for the parent.
 */

/** Games ready to play. Unfinished games are simply absent rather than greyed
 *  out: a tile that does nothing when tapped is worse than no tile. */
const GAMES = [
  {
    scene: 'Flashcards',
    ui: 'letters',
    roman: 'Letters',
    color: 0x3f7fd4,
    // Tiles are illustrated with a real Urdu letter rather than an emoji. The
    // obvious pick, 🔤, is a picture of the Latin alphabet.
    icon: { letter: 'be', form: 'isolated' },
  },
  {
    scene: 'FindLetter',
    ui: 'find-letter',
    roman: 'Find the letter',
    color: 0x5f9e5a,
    icon: { letter: 'sin', form: 'isolated' },
  },
  {
    scene: 'Balloons',
    ui: 'balloons',
    roman: 'Balloons',
    color: 0xb4576d,
    icon: { letter: 'mim', form: 'isolated' },
  },
  {
    scene: 'WordPictures',
    ui: 'words',
    roman: 'Words',
    color: 0x7a5bbd,
    picture: 'seyb',
  },
  {
    scene: 'Numbers',
    ui: 'numbers',
    roman: 'Numbers',
    color: 0x2f8f8a,
    number: 'n3',
  },
  {
    scene: 'Memory',
    ui: 'memory',
    roman: 'Pairs',
    color: 0xc2557f,
    icon: { letter: 'jim', form: 'isolated' },
  },
  {
    scene: 'Sequence',
    ui: 'order',
    roman: 'Order',
    color: 0x4f8f3f,
    icon: { letter: 'te', form: 'isolated' },
  },
  {
    scene: 'Trace',
    ui: 'trace',
    roman: 'Write',
    color: 0xd4762f,
    icon: { letter: 'alif', form: 'isolated' },
  },
];

/**
 * The grid and the title sit right of centre, because the spider sits at the
 * left of every screen including this one. Laid out against this rather than
 * against the canvas, so adding a game shrinks the tiles instead of pushing the
 * last one through the character.
 */
const STAGE = { left: 250, right: DESIGN.width - 60 };
const STAGE_X = (STAGE.left + STAGE.right) / 2;

export default class Home extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  preload() {
    // Only the handful used as tile icons, not the whole set: the menu should
    // be on screen immediately, and the games load the rest themselves.
    queueWordImages(
      this,
      GAMES.map((g) => g.picture).filter(Boolean)
    );
  }

  /**
   * A tile's picture: a letter, a word illustration or a numeral.
   *
   * Whatever a game is about, drawn the way that game draws it, so the menu
   * previews the thing rather than decorating it.
   */
  tileIcon(game, y, size) {
    if (game.picture) {
      return addWordImage(this, 0, y, game.picture, size * 1.5);
    }
    if (game.number) {
      const glyph = numberGlyph(game.number);
      return glyph
        ? addGlyph(
            this,
            0,
            y,
            `ui:tile:${game.number}:${size}:chunky`,
            glyph,
            chunkyGlyph(size)
          )
        : null;
    }
    const glyph = letterGlyph(game.icon.letter, game.icon.form);
    if (!glyph) return null;
    const h = Math.round(fitGlyphHeight(glyph, size * 2.1, size));
    return addGlyph(
      this,
      0,
      y,
      `letter:${game.icon.letter}:${game.icon.form}:${h}:chunky`,
      glyph,
      chunkyGlyph(h)
    );
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    addScenery(this);

    const title = uiGlyph('app-title');
    if (title) {
      addGlyph(this, STAGE_X, 118, 'ui:app-title:96', title, {
        height: 96,
        color: COLORS.accentCss,
      });
    }
    label(this, STAGE_X, 190, 'Urdu Learning Games', { size: 20 });

    // A grid rather than one row. Games keep getting added, and squeezing them
    // all into a single row shrinks every tile until none of them is a
    // comfortable target for a small finger — better to wrap and keep them big.
    const gap = 26;
    const perRow = GAMES.length <= 4 ? GAMES.length : Math.ceil(GAMES.length / 2);
    const rows = Math.ceil(GAMES.length / perRow);
    const tileW = Math.min(
      252,
      (STAGE.right - STAGE.left - gap * (perRow - 1)) / perRow
    );
    const tileH = Math.round(tileW * (rows > 1 ? 0.74 : 0.92));
    const iconSize = Math.round(tileW * 0.32);
    const rowGap = 22;
    // Measured from the top of the grid rather than its centre, so adding a
    // second row grows downwards into the space above the footer instead of
    // pushing the last row through it.
    const gridTop = rows > 1 ? 240 : 300;
    const firstRowY = gridTop + tileH / 2;

    GAMES.forEach((game, index) => {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(GAMES.length - row * perRow, perRow);
      const indexInRow = index % perRow;
      // Right-to-left within each row, matching the script.
      const rowW = inRow * tileW + (inRow - 1) * gap;
      const rowStartX = STAGE_X + rowW / 2 - tileW / 2;

      const button = makeButton(this, {
        x: rowStartX - indexInRow * (tileW + gap),
        y: firstRowY + row * (tileH + rowGap),
        width: tileW,
        height: tileH,
        color: game.color,
        onTap: () => this.scene.start(game.scene),
      });

      const icon = this.tileIcon(game, -tileH * 0.24, iconSize);
      if (icon) button.add(icon);

      // 44 rather than 52: the glyph is scaled by height, so a long name like
      // حرف ڈھونڈو gets wide fast and crowds both the icon above and the tile's
      // own edges.
      const nameGlyph = uiGlyph(game.ui);
      if (nameGlyph) {
        const h = Math.round(fitGlyphHeight(nameGlyph, tileW - 30, 44));
        button.add(
          addGlyph(this, 0, tileH * 0.17, `ui:${game.ui}:${h}:chunky`, nameGlyph, chunkyGlyph(h))
        );
      }

      button.add(
        label(this, 0, tileH * 0.39, game.roman, {
          size: 16,
          color: COLORS.onColorDim,
        })
      );
    });

    label(
      this,
      DESIGN.width / 2,
      DESIGN.height - 34,
      'No ads · No tracking · Works offline',
      { size: 16, color: COLORS.inkDim }
    );

    // The spider, sitting to the left of the grid and pointing at it. Same
    // character, same corner, on the menu as in every game — that consistency
    // is most of what makes it read as somebody rather than as a drawing.
    // Higher up than on the game screens so it stays clear of the Grown-ups
    // button in the corner beneath it.
    addMascot(this, 116, 618, { height: 214 }).point();

    this.buildInstallHint();
    this.buildGrownUpsButton();
  }

  /**
   * Entry to the recording screen, behind a hold and a sum.
   *
   * That screen can delete recordings, so it must not be reachable by a child
   * exploring the menu. Holding rules out a stray tap; the arithmetic rules out
   * a child who worked out that holding does something.
   */
  buildGrownUpsButton() {
    const button = makeButton(this, {
      x: 96,
      y: DESIGN.height - 74,
      width: 148,
      height: 56,
      color: COLORS.panel,
      rim: false,
      // Opening is driven by the hold below, not by a tap.
      onTap: () => {},
    });

    const text = label(this, 0, 0, 'Grown-ups', { size: 15, color: COLORS.inkDim });
    button.add(text);
    // Held so the verification run can press it without depending on where it
    // happens to sit on screen.
    this.grownUpsButton = button;

    // A ring that fills while held, so it is obvious that holding is the point
    // and the button is not simply broken.
    const ring = this.add.graphics();
    button.add(ring);
    const drawRing = (t) => {
      ring.clear();
      if (t <= 0) return;
      ring.lineStyle(3, COLORS.accent, 0.9);
      ring.beginPath();
      ring.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ring.strokePath();
    };

    attachHoldToOpen(this, button, {
      onProgress: drawRing,
      onOpen: async () => {
        drawRing(0);
        if (await askParentalQuestion()) this.openRecorder();
      },
    });
  }

  /**
   * Loaded on demand: the recorder pulls in its own CSS and archive code, none
   * of which a child playing the games ever needs.
   */
  async openRecorder() {
    const { openRecorder } = await import('../ui/recorder.js');
    // Phaser keeps handling keys underneath a DOM overlay, so a space bar meant
    // for the record button would also poke the game.
    this.input.keyboard.enabled = false;
    openRecorder({
      onClose: () => {
        this.input.keyboard.enabled = true;
        this.scene.restart();
      },
    });
  }

  /**
   * Offers "add to home screen" when the browser says it is possible.
   *
   * Deliberately small and in a corner. A parent looks at this screen for a few
   * seconds at a time before handing the phone over, so a banner would mostly
   * be something a child taps by accident.
   */
  buildInstallHint() {
    this.installHint?.destroy(true);
    this.installHint = null;
    if (!canInstall()) return;

    const button = makeButton(this, {
      x: DESIGN.width - 130,
      y: DESIGN.height - 74,
      width: 200,
      height: 64,
      color: COLORS.panel,
      rim: false,
      onTap: () => promptInstall().then(() => this.buildInstallHint()),
    });

    const text = uiGlyph('install');
    if (text) {
      button.add(
        addGlyph(this, 0, -6, 'ui:install:32', text, {
          height: 32,
          color: COLORS.ink,
        })
      );
    }
    button.add(label(this, 0, 20, 'Add to home screen', { size: 13 }));
    this.installHint = button;

    // The event can arrive after this scene is already up.
    this.unsubscribeInstall?.();
    this.unsubscribeInstall = onInstallAvailability(() => this.buildInstallHint());
    this.events.once('shutdown', () => this.unsubscribeInstall?.());
  }
}
