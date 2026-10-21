import Phaser from 'phaser';
import { uiGlyph } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { addMascot } from '../lib/mascot.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../lib/fullscreen.js';

import { dropScreen, pushScreen, replaceScreen } from '../lib/history.js';
import { breathe, popIn, squash } from '../lib/liveliness.js';
import { musicOn, setMusicOn, startMusic } from '../lib/music.js';
import { prepareFlourishes } from '../lib/flourish.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, label, makeButton } from '../lib/theme.js';
import { running as chaloRunning, startRun, stopRun } from '../lib/chalo.js';
import { GAMES } from '../lib/games.js';
import { menuGames, pagesOf } from '../lib/menu.js';
import { watchSwipe } from '../lib/swipe.js';
import { watchMenu } from '../lib/time-up.js';
import { queueStudioArt, studioTileMaker } from '../lib/studio-art.js';
import { STUDIO, studioLayout, studioPlaces } from '../lib/studio-layout.js';
import { addStudioBackdrop, addStudioIcon, paintStudioIcon, studioButton, studioIconTexture } from '../lib/studio-ui.js';
import { addStudioTitle, paintStudioBrand } from '../lib/studio-brand.js';

/* The menu. Games are listed right-to-left to match the reading direction of the script being taught. */

/* How far a finger must travel across the grid to turn the page. */
const SWIPE_PAGE = 70;

export default class Home extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  preload() {
    queueStudioArt(this);
  }

  create() {
    this.layout = studioLayout(DESIGN.width, DESIGN.height);
    this.cameras.main.setBackgroundColor(STUDIO.creamNumber);
    addStudioBackdrop(this, this.layout);
    // Nothing has been tapped yet.
    this.leaving = false;

    addStudioTitle(this, this.layout.title);
    this.pages = pagesOf(menuGames());
    this.page = Math.min(this.page ?? 0, this.pages.length - 1);
    const places = studioPlaces(this.layout);
    const makeTile = studioTileMaker(this, GAMES, {
      width: this.layout.grid.tileWidth, height: this.layout.grid.tileHeight,
    });
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

    this.buildPager();
    this.buildChalo();
    // If the day has run out.
    watchMenu(this);

    // Independent transparent art: swapping the character never changes the scenery.
    const character = this.layout.character;
    this.mascot = addMascot(this, character.x, character.y, {
      height: character.height, maxWidth: character.width,
    });
    this.mascot.setName('home-character');

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
    const button = studioButton(this, {
      ...this.layout.chalo,
      color: STUDIO.orange, radius: 56, paintKey: 'chalo',
      paint: (ctx) => {
        ctx.save(); ctx.translate(-94, 0); paintStudioIcon(ctx, 'play'); ctx.restore();
        ctx.save(); ctx.translate(31, -2); paintStudioBrand(ctx, 'chalo', 166, 78, { color: '#fffdf6' }); ctx.restore();
      },
      onTap: () => this.startChalo(),
    });
    button.setName('chalo-button');

    // Arrives first, then breathes — and in that order for a reason.
    popIn(this, button, { delay: 40, duration: 420 }).once('complete', () =>
      breathe(this, button, { amount: 0.012, duration: 2100 })
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

  /* Swipe for the next six. The left column and utility controls never swipe. */
  buildPager() {
    const pages = this.pages.length;
    const grid = this.layout.grid;

    this.swipe = watchSwipe(this, {
      // Ignore touches that start on another control.
      from: (pointer) => pointer.x >= grid.left - 16 && pointer.x <= grid.right + 16 &&
        pointer.y >= grid.top - 16 && pointer.y <= grid.bottom + 20,
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
        x: grid.centerX + ((pages - 1) / 2 - index) * 35,
        y: this.layout.dotsY,
        width: 35, height: 40, backing: false, rim: false, padding: 8,
        paintKey: `studio:dot:${index === this.page}`,
        paint: (ctx) => {
          ctx.shadowColor = 'rgba(135,104,49,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
          ctx.fillStyle = index === this.page ? STUDIO.blue : '#fffcf3';
          ctx.beginPath(); ctx.arc(0, 0, index === this.page ? 11 : 9, 0, Math.PI * 2); ctx.fill();
        },
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
    const button = studioButton(this, {
      ...this.layout.music, width: 60, height: 60, radius: 30,
      onTap: () => {
        const on = !musicOn();
        setMusicOn(on);
        icon.setTexture(studioIconTexture(this, 'music', on));
        squash(this, button);
        if (on) ringBurst(this, button.x, button.y, COLORS.accent);
        else sfx.nudge();
      },
    });
    const icon = addStudioIcon(this, 'music', musicOn());
    button.add(icon);
    // Held so the verification run can press it without hunting by pixel.
    this.musicButton = button;
  }

  /* Fullscreen switch for browsers that support it. */
  buildFullscreenToggle() {
    if (!canFullscreen()) return;

    const button = studioButton(this, {
      ...this.layout.fullscreen, width: 60, height: 60, radius: 30,
      onTap: async () => {
        await toggleFullscreen();
        paint();
        squash(this, button);
        sfx.nudge();
      },
    });

    const icon = addStudioIcon(this, 'fullscreen');
    button.add(icon);

    const paint = () => {
      icon.setTexture(studioIconTexture(this, isFullscreen() ? 'restore' : 'fullscreen'));
    };
    paint();

    this.unsubscribeFullscreen?.();
    this.unsubscribeFullscreen = onFullscreenChange(paint);
    this.events.once('shutdown', () => this.unsubscribeFullscreen?.());
    this.fullscreenButton = button;
  }

  /* Entry to the recording screen, behind a hold and a sum. */
  buildSettingsButton() {
    const button = studioButton(this, {
      ...this.layout.settings, width: 60, height: 60, radius: 30,
      // Opening is driven by the hold below, not by a tap.
      onTap: () => {},
    });

    button.add(addStudioIcon(this, 'settings'));
    button.setName('settings-button');
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

    const button = studioButton(this, {
      x: this.layout.leftX + 26, y: DESIGN.height - 45,
      width: 200, height: 55, radius: 24,
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
