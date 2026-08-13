import Phaser from 'phaser';
import { letterGlyph, numberGlyph, uiGlyph, uiGlyphs } from '../lib/content.js';
import { addGlyph, addGlyphBaseline, fitEmLine } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { addMascot } from '../lib/mascot.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { addScenery } from '../lib/scenery.js';
import { bob, popIn, squash } from '../lib/liveliness.js';
import { musicOn, setMusicOn, startMusic } from '../lib/music.js';
import { prepareFlourishes } from '../lib/flourish.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, chunkyGlyphEm, label, makeButton } from '../lib/theme.js';
import { queueBackdrop } from '../lib/backdrops.js';

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
    scene: 'JoinForms',
    ui: 'forms',
    roman: 'Shapes',
    color: 0x8a6ad0,
    // The initial form, because the tile is advertising the thing the game is
    // about: a letter wearing a face the flashcards never showed.
    icon: { letter: 'be', form: 'initial' },
  },
  {
    scene: 'StartsWith',
    ui: 'first-letter',
    roman: 'Starts with',
    color: 0xc9713f,
    picture: 'bakri',
  },
  {
    scene: 'Doors',
    ui: 'doors',
    roman: 'Doors',
    color: 0x3f8f7a,
    icon: { letter: 'dal', form: 'isolated' },
  },
  {
    scene: 'TapAll',
    ui: 'find-all',
    roman: 'Find them all',
    color: 0xb05fa8,
    icon: { letter: 'sin', form: 'initial' },
  },
  {
    scene: 'Caterpillar',
    ui: 'gaps',
    roman: 'Gaps',
    color: 0x5b8f2f,
    icon: { letter: 'nun', form: 'isolated' },
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
    queueBackdrop(this);
    // Only the handful used as tile icons, not the whole set: the menu should
    // be on screen immediately, and the games load the rest themselves.
    queueWordImages(
      this,
      GAMES.map((g) => g.picture).filter(Boolean)
    );
  }

  /**
   * The glyph a tile is illustrated with, where it has one.
   *
   * Pulled out so the icons can be measured as a set before any of them is
   * drawn — see fitEmLine. Tiles illustrated with a picture have no glyph and are
   * simply absent from the set.
   */
  static iconGlyph(game) {
    if (game.number) return numberGlyph(game.number);
    if (game.icon) return letterGlyph(game.icon.letter, game.icon.form);
    return null;
  }

  /**
   * A tile's picture: a letter, a word illustration or a numeral.
   *
   * Whatever a game is about, drawn the way that game draws it, so the menu
   * previews the thing rather than decorating it.
   *
   * The letters and the numeral share one baseline and one em, for the same
   * reason the names below them do: a row of tiles where ب is twice the size of
   * م looks like eight unrelated buttons rather than one menu.
   */
  tileIcon(game, baselineY, box, fit) {
    // A picture has no baseline to sit on, so it is centred in the same box the
    // letters were fitted into, and drawn a little larger than their line: a
    // letter only inks part of its line box, an apple fills all of its own.
    if (game.picture) {
      return addWordImage(this, 0, box.top + box.height / 2, game.picture, box.height * 1.3);
    }
    const glyph = Home.iconGlyph(game);
    if (!glyph) return null;
    const id = game.number ?? `${game.icon.letter}:${game.icon.form}`;
    return addGlyphBaseline(
      this,
      0,
      baselineY,
      `tile-icon:em${Math.round(fit.em)}:${id}`,
      glyph,
      chunkyGlyphEm(fit.em)
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

    /** @type {Phaser.GameObjects.Container[]} */
    const tiles = [];

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
    const rowGap = 22;

    // A tile is three stacked lines: the icon, the Urdu name, the roman gloss.
    // The first two are Urdu, and each is drawn at one em on one baseline across
    // all eight tiles — measured here rather than typed as a number, because the
    // tiles resize with the grid and because the whole point is that no tile's
    // letters come out bigger than its neighbour's.
    //
    // The lines are as deep as they are because Nastaliq's vertical range is
    // enormous: گنتی and لکھو reach two full ems above the baseline, since the
    // ascender on a گ or a ک is drawn as a long rising stroke, while حروف and
    // جوڑے drop half an em below it. Reserving room for both at once is the
    // price of a shared baseline, and it is what decides the sizes below.
    const iconBox = { top: -tileH * 0.46, height: tileH * 0.4 };
    const iconFit = fitEmLine(
      GAMES.map(Home.iconGlyph).filter(Boolean),
      tileW * 0.66,
      iconBox.height
    );
    const labelTop = -tileH * 0.07;
    const labelFit = fitEmLine(
      uiGlyphs(GAMES.map((game) => game.ui)),
      tileW - 40,
      tileH * 0.41
    );
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
        onTap: () => {
          sfx.whoosh();
          // A beat between the tap and the screen changing, so the tile is
          // seen to react. Leaving instantly makes the tap feel like it went
          // to the next screen rather than to the thing that was pressed.
          this.time.delayedCall(150, () => this.scene.start(game.scene));
        },
      });
      button.on('pointerdown', () => squash(this, button));
      tiles.push(button);

      const icon = this.tileIcon(game, iconBox.top + iconFit.baseline, iconBox, iconFit);
      if (icon) button.add(icon);

      const nameGlyph = uiGlyph(game.ui);
      if (nameGlyph) {
        button.add(
          addGlyphBaseline(
            this,
            0,
            labelTop + labelFit.baseline,
            `tile-label:em${Math.round(labelFit.em)}:${game.ui}`,
            nameGlyph,
            chunkyGlyphEm(labelFit.em)
          )
        );
      }

      button.add(
        label(this, 0, tileH * 0.4, game.roman, {
          size: 16,
          color: COLORS.onColorDim,
        })
      );
    });

    // The grid assembles itself instead of being there already. Reading order,
    // so it builds right to left the way the script does, and quickly — this is
    // a menu a child comes back to twenty times a day and a slow flourish
    // becomes an obstacle by the third visit.
    tiles.forEach((tile, index) => popIn(this, tile, { delay: 60 + index * 55 }));
    // Then they breathe, out of phase, for as long as the menu is up. Eight
    // still rectangles read as a form; eight that move a hair read as things
    // waiting to be picked up.
    this.time.delayedCall(60 + tiles.length * 55 + 380, () => {
      tiles.forEach((tile, index) =>
        bob(this, tile, { distance: 4, duration: 2200, delay: index * 180 })
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
    // Higher up than on the game screens so it stays clear of the Settings
    // button in the corner beneath it.
    addMascot(this, 116, 618, { height: 214 }).point();

    this.buildInstallHint();
    this.buildSettingsButton();
    this.buildMusicToggle();

    // The browser only lets audio play after the page has been touched, so the
    // tune starts at whatever the child taps first. Harmless if it is already
    // going — startMusic returns immediately.
    this.input.once('pointerdown', () => {
      startMusic();
      // Fetches the reward instrument now, so the first right answer of a
      // session gets the real sound rather than the synthesised fallback.
      prepareFlourishes();
    });
  }

  /**
   * The music switch, where a child can reach it.
   *
   * Not behind the grown-ups gate, unlike the frame-rate readout. Music is the
   * one setting in this app that somebody may want to change several times a
   * day — in a waiting room, in a car, at bedtime — and a switch that needs a
   * hold and a sum first is a switch nobody uses. It is small, in a corner, and
   * the worst a child can do with it is turn the music off.
   */
  buildMusicToggle() {
    const button = makeButton(this, {
      x: DESIGN.width - 74,
      y: 60,
      width: 84,
      height: 68,
      color: COLORS.panel,
      rim: false,
      onTap: () => {
        const on = !musicOn();
        setMusicOn(on);
        icon.setText(on ? '\u266a' : '\u266a\u0338');
        icon.setColor(on ? COLORS.accentCss : COLORS.inkDim);
        squash(this, button);
        if (on) ringBurst(this, button.x, button.y, COLORS.accent);
        else sfx.nudge();
      },
    });
    const icon = this.add
      .text(0, -2, musicOn() ? '\u266a' : '\u266a\u0338', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: musicOn() ? COLORS.accentCss : COLORS.inkDim,
      })
      .setOrigin(0.5);
    button.add(icon);
    // Held so the verification run can press it without hunting by pixel.
    this.musicButton = button;
  }

  /**
   * Entry to the recording screen, behind a hold and a sum.
   *
   * That screen can delete recordings, so it must not be reachable by a child
   * exploring the menu. Holding rules out a stray tap; the arithmetic rules out
   * a child who worked out that holding does something.
   */
  buildSettingsButton() {
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

    const text = label(this, 0, 0, 'Settings', { size: 15, color: COLORS.inkDim });
    button.add(text);
    // Held so the verification run can press it without depending on where it
    // happens to sit on screen.
    this.settingsButton = button;

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
        if (await askParentalQuestion()) this.openSettings();
      },
    });
  }

  /**
   * Loaded on demand: settings pulls in its own CSS, and the recorder behind it
   * pulls in a zip writer and the take-polishing code — none of which a child
   * playing the games ever needs.
   */
  async openSettings() {
    const { openSettings } = await import('../ui/settings.js');
    // Phaser keeps handling keys underneath a DOM overlay, so a space bar meant
    // for the record button would also poke the game.
    this.input.keyboard.enabled = false;
    openSettings({
      onClose: () => {
        this.input.keyboard.enabled = true;
        // Restarted rather than resumed: the music switch and the recordings
        // both change what this screen should show.
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
