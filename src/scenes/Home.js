import Phaser from 'phaser';
import { uiGlyph } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { addMascot } from '../lib/mascot.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../lib/fullscreen.js';

import { dropScreen, pushScreen, replaceScreen } from '../lib/history.js';
import { addScenery } from '../lib/scenery.js';
import { gridPlaces, tileMaker } from '../lib/game-tile.js';
import { breathe, popIn, squash } from '../lib/liveliness.js';
import { musicOn, setMusicOn, startMusic } from '../lib/music.js';
import { prepareFlourishes } from '../lib/flourish.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, label, makeButton } from '../lib/theme.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { running as chaloRunning, startRun, stopRun } from '../lib/chalo.js';
import { GAMES } from '../lib/games.js';
import { PER_PAGE, menuGames, pagesOf } from '../lib/menu.js';
import { watchSwipe } from '../lib/swipe.js';
import { watchMenu } from '../lib/time-up.js';
import { queueTileArt } from '../lib/tiles.js';

/* The menu. Games are listed right-to-left to match the reading direction of the script being taught. */

/* The grid and the title sit right of centre, because the spider sits at the left of every screen including this one. */
const STAGE = { left: 250, right: DESIGN.width - 60 };
const STAGE_X = (STAGE.left + STAGE.right) / 2;

/* The چلو button, and where the grid starts beneath it. */
const CHALO = { y: 252, width: 340, height: 84 };
/* The band the grid gets. */
const GRID = { top: 318, bottom: DESIGN.height - 56 };

/* How far a finger must travel across the grid to turn the page. */
const SWIPE_PAGE = 70;

/* The row of page dots: how tall a strip it needs, and how big each one is. */
const DOTS = { room: 44, size: 30 };

export default class Home extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  preload() {
    queueBackdrop(this);
    // Every game's picture.
    queueTileArt(this, GAMES);
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    addScenery(this);
    // Nothing has been tapped yet.
    this.leaving = false;

    const title = uiGlyph('app-title');
    if (title) {
      addGlyph(this, STAGE_X, 118, 'ui:app-title:96', title, {
        height: 96,
        color: COLORS.accentCss,
      });
    }
    label(this, STAGE_X, 190, 'Urdu Learning Games', { size: 20 });

    // Five across and two down.
    const COLUMNS = 5;
    const gap = 26;
    const rowGap = 24;
    this.pages = pagesOf(menuGames());
    this.page = Math.min(this.page ?? 0, this.pages.length - 1);
    // Measured across a full page rather than across this one.
    const rows = Math.ceil(PER_PAGE / COLUMNS);
    // The strip the dots stand in, taken off the grid before the tiles are sized rather than found afterwards.
    const dotsRoom = this.pages.length > 1 ? DOTS.room : 0;
    // Two limits, and the tighter one wins.
    const tileW = Math.min(
      252,
      (STAGE.right - STAGE.left - gap * (COLUMNS - 1)) / COLUMNS,
      (GRID.bottom - dotsRoom - GRID.top - rowGap * (rows - 1)) / rows / 1.04
    );
    const tileH = Math.round(tileW * 1.04);
    // Measured from the top of the grid rather than its centre.
    const places = gridPlaces(PER_PAGE, {
      columns: COLUMNS,
      gap,
      rowGap,
      width: tileW,
      height: tileH,
      centerX: STAGE_X,
      top: GRID.top,
    });

    // One maker for every game in the app.
    const makeTile = tileMaker(this, menuGames(), { width: tileW, height: tileH });
    this.board = this.add.container(0, 0);
    const tiles = this.pages[this.page].map((game, index) =>
      makeTile(game, places[index].x, places[index].y, () => {
        // A swipe that happened to end on a tile is not a choice.
        if (this.swipe?.moved()) return;
        sfx.whoosh();
        this.leave(() => this.openGame(game.scene));
      })
    );
    for (const tile of tiles) this.board.add(tile);

    this.buildPager(places, tileH);
    this.buildChalo();
    // If the day has run out.
    watchMenu(this);

    // The grid assembles itself instead of being there already.
    tiles.forEach((tile, index) => popIn(this, tile, { delay: 60 + index * 55 }));
    // And then they stop.

    label(
      this,
      DESIGN.width / 2,
      DESIGN.height - 34,
      'No ads · No tracking · Works offline',
      { size: 16, color: COLORS.inkDim }
    );

    // The spider, sitting to the left of the grid and pointing at it.
    addMascot(this, 116, 618, { height: 214 }).point();

    // No progress indicator here.

    this.buildInstallHint();
    this.buildSettingsButton();
    this.buildMusicToggle();
    this.buildFullscreenToggle();

    // The browser only lets audio play after the page has been touched, so the tune starts at whatever the child taps first.
    this.input.once('pointerdown', () => {
      startMusic();
      // Fetches the reward instrument now.
      prepareFlourishes();
    });
  }

  /* چلو — the button that plays the app for you. */
  buildChalo() {
    const button = makeButton(this, {
      x: STAGE_X,
      y: CHALO.y,
      width: CHALO.width,
      height: CHALO.height,
      color: COLORS.accent,
      onTap: () => this.startChalo(),
    });
    button.setName('chalo-button');

    const word = uiGlyph('chalo');
    if (word) {
      button.add(
        addGlyph(this, -34, -6, 'ui:chalo:52', word, {
          height: 52,
          color: COLORS.onColor,
        })
      );
    }
    button.add(
      label(this, 66, 4, "Let's go", { size: 26, color: COLORS.onColor })
    );

    // The highlight: a pale bar travelling across the face.
    const sheen = this.add.rectangle(0, 0, 38, 62, 0xffffff, 1).setAlpha(0);
    sheen.setAngle(14);
    button.addAt(sheen, 1);
    this.tweens.add({
      targets: sheen,
      x: { from: -114, to: 114, duration: 1500, ease: 'Quad.easeInOut' },
      alpha: { from: 0, to: 0.3, duration: 750, yoyo: true },
      repeat: -1,
      repeatDelay: 2200,
    });

    // Arrives first, then breathes — and in that order for a reason.
    popIn(this, button, { delay: 40, duration: 420 }).once('complete', () =>
      breathe(this, button, { amount: 0.035, duration: 1900 })
    );
    this.chaloButton = button;
  }

  /* Starts a run: a random game, and a different one each time one finishes. */
  startChalo() {
    if (chaloRunning() || this.leaving) return;
    sfx.whoosh();
    ringBurst(this, this.chaloButton.x, this.chaloButton.y, COLORS.accent);
    this.leave(() => {
      startRun((key, first) => this.openGame(key, first ? pushScreen : replaceScreen));
    });
  }

  /* Waits a beat, then goes — and only the first tap gets to. */
  leave(go) {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(150, go);
  }

  /* Opens a game, and says what leaving it means. */
  openGame(key, how = pushScreen) {
    // A run steps straight from one game into the next without passing through the menu.
    for (const other of this.game.scene.getScenes(true)) {
      const running = other.scene.key;
      if (running !== 'Home' && running !== key) this.game.scene.stop(running);
    }
    how(`game:${key}`, () => {
      // Backing out of a game ends a run.
      stopRun();
      sfx.swoosh();
      // Stopped explicitly, then Home started.
      this.game.scene.stop(key);
      this.game.scene.start('Home');
    });
    this.scene.start(key);
  }

  /** Swipe for the next ten, and dots that say how many there are.
 * @param {{x: number, y: number}[]} places the grid, so the dots can sit
 */
  buildPager(places, tileH) {
    const pages = this.pages.length;
    // In the strip the grid gave up for them.
    const dotsY = places[places.length - 1].y + tileH / 2 + DOTS.room / 2;

    this.swipe = watchSwipe(this, {
      // Ignore touches that start on another control.
      from: (pointer) => pointer.y > GRID.top - 40,
      onMove: (delta) => {
        if (pages < 2) return;
        // The board follows the finger, damped.
        this.board.x = Phaser.Math.Clamp(this.board.x + delta * 0.34, -140, 140);
      },
      onEnd: ({ travel, flick }) => {
        this.tweens.add({ targets: this.board, x: 0, duration: 180, ease: 'Quad.easeOut' });
        if (pages < 2 || travel <= SWIPE_PAGE) return;
        // Right to left is forward, like the script.
        this.turnPage(flick < 0 ? 1 : -1);
      },
    });

    if (pages < 2) return;
    this.dots = [];
    for (let index = 0; index < pages; index++) {
      // Right to left, like the tiles: the first page is the rightmost dot.
      const dot = makeButton(this, {
        x: STAGE_X + ((pages - 1) / 2 - index) * (DOTS.size + 8),
        y: dotsY,
        width: DOTS.size,
        height: DOTS.size,
        shape: 'circle',
        color: index === this.page ? COLORS.accent : COLORS.panel,
        rim: false,
        // Tappable, and that is the point of them.
        onTap: () => this.turnPage(index - this.page),
      });
      this.dots.push(dot);
    }
  }

  /* `step` pages on, wrapping, and redraws. */
  turnPage(step) {
    if (!step || this.pages.length < 2 || this.leaving) return;
    this.page = (this.page + step + this.pages.length) % this.pages.length;
    sfx.swoosh();
    this.scene.restart();
  }

  /* The music switch, where a child can reach it. */
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

  /* Fullscreen switch for browsers that support it. */
  buildFullscreenToggle() {
    if (!canFullscreen()) return;

    const button = makeButton(this, {
      x: DESIGN.width - 74,
      y: 142,
      width: 84,
      height: 68,
      color: COLORS.panel,
      rim: false,
      onTap: async () => {
        await toggleFullscreen();
        paint();
        squash(this, button);
        sfx.nudge();
      },
    });

    const icon = this.add
      .text(0, -2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: COLORS.accentCss,
      })
      .setOrigin(0.5);
    button.add(icon);

    const paint = () => {
      icon.setText(isFullscreen() ? '\u2922' : '\u26f6');
      icon.setColor(isFullscreen() ? COLORS.inkDim : COLORS.accentCss);
    };
    paint();

    this.unsubscribeFullscreen?.();
    this.unsubscribeFullscreen = onFullscreenChange(paint);
    this.events.once('shutdown', () => this.unsubscribeFullscreen?.());
    this.fullscreenButton = button;
  }

  /* Entry to the recording screen, behind a hold and a sum. */
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
    // Held so the verification run can press it without depending on where it happens to sit on screen.
    this.settingsButton = button;

    // A ring that fills while held, so it is obvious that holding is the point and the button is not simply broken.
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
        if (this.settingsOpening) return;
        this.settingsOpening = true;
        drawRing(0);
        // Keep the DOM gate above the canvas.
        this.input.enabled = false;
        const allowed = await askParentalQuestion();
        if (allowed) {
          await this.openSettings();
        } else {
          this.input.enabled = true;
          this.settingsOpening = false;
        }
      },
    });
  }

  /* Load settings and recorder assets only when needed. */
  async openSettings() {
    let openSettings;
    try {
      ({ openSettings } = await import('../ui/settings.js'));
    } catch (error) {
      console.error('Could not open settings', error);
      this.input.enabled = true;
      this.settingsOpening = false;
      return;
    }
    // Phaser keeps handling input underneath a DOM overlay.
    this.input.enabled = false;
    this.input.keyboard.enabled = false;
    // The lock is *not* released.
    const close = openSettings({
      onClose: () => {
        // Whatever closed it.
        dropScreen('settings');
        this.input.enabled = true;
        this.input.keyboard.enabled = true;
        this.settingsOpening = false;
        // Restarted rather than resumed: the music switch and the recordings both change what this screen should show.
        this.scene.restart();
      },
    });
    // Pushed after the screen exists, so the back action has something to call.
    pushScreen('settings', close);
  }

  /* Offers "add to home screen" when the browser says it is possible. */
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
