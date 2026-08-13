import Phaser from 'phaser';
import { uiGlyph } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { addMascot } from '../lib/mascot.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { addScenery } from '../lib/scenery.js';
import { gridPlaces, tileMaker } from '../lib/game-tile.js';
import { openGamesPanel } from '../lib/games-panel.js';
import { bob, popIn, squash } from '../lib/liveliness.js';
import { musicOn, setMusicOn, startMusic } from '../lib/music.js';
import { prepareFlourishes } from '../lib/flourish.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, label, makeButton } from '../lib/theme.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { queueTileArt } from '../lib/tiles.js';
import { FEATURED, GAMES, MORE, MORE_TILE } from '../lib/games.js';

/**
 * The menu.
 *
 * Games are listed right-to-left to match the reading direction of the script
 * being taught. Each tile carries its Urdu name as a baked glyph plus a small
 * roman gloss for the parent.
 *
 * ## Nine here, the rest one tap away
 *
 * `featured` picks the nine that live on this screen; everything else is behind
 * the tenth tile, in `games-panel.js`, which is where the reasoning for the
 * split is written down. The nine are the learning path — meet the letters,
 * write one, find one, meet a word, hear what it starts with, then the counting
 * and the three games that drill what has been met. The other fifteen are
 * variations on those, so any of them is a fine thing to not find first.
 */

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
    // Every tile's picture, including the panel's — the panel opens on a tap
    // and has no loading screen of its own to hide behind.
    queueTileArt(this, [...GAMES, MORE_TILE]);
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

    // Ten tiles: the nine on the learning path and the door to the other
    // fifteen. Five across and two down, sized to fill the stage rather than to
    // a number typed here, so the one number that decides the whole grid is
    // COLUMNS.
    const COLUMNS = 5;
    const gap = 26;
    const shown = [...FEATURED, MORE_TILE];
    const tileW = Math.min(
      252,
      (STAGE.right - STAGE.left - gap * (COLUMNS - 1)) / COLUMNS
    );
    const tileH = Math.round(tileW * 1.04);
    const rowGap = 24;
    // Measured from the top of the grid rather than its centre, so a second row
    // grows downwards into the space above the footer instead of pushing the
    // last row through it.
    const places = gridPlaces(shown.length, {
      columns: COLUMNS,
      gap,
      rowGap,
      width: tileW,
      height: tileH,
      centerX: STAGE_X,
      top: 228,
    });

    const makeTile = tileMaker(this, shown, { width: tileW, height: tileH });
    const tiles = shown.map((game, index) =>
      makeTile(game, places[index].x, places[index].y, () => {
        sfx.whoosh();
        // A beat between the tap and the screen changing, so the tile is seen
        // to react. Leaving instantly makes the tap feel like it went to the
        // next screen rather than to the thing that was pressed.
        this.time.delayedCall(150, () =>
          game.scene ? this.scene.start(game.scene) : this.openMore()
        );
      })
    );

    // The grid assembles itself instead of being there already. Reading order,
    // so it builds right to left the way the script does, and quickly — this is
    // a menu a child comes back to twenty times a day and a slow flourish
    // becomes an obstacle by the third visit.
    tiles.forEach((tile, index) => popIn(this, tile, { delay: 60 + index * 55 }));
    // Then they breathe, out of phase, for as long as the menu is up. Ten
    // still rectangles read as a form; ten that move a hair read as things
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

  /** The other fifteen, over the menu. */
  openMore() {
    if (this.morePanel?.active) return;
    this.morePanel = openGamesPanel(this, MORE, (game) => this.scene.start(game.scene));
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
