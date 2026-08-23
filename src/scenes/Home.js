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
import { queueTileArt } from '../lib/tiles.js';

/**
 * The menu.
 *
 * Games are listed right-to-left to match the reading direction of the script
 * being taught. Each tile carries its Urdu name as a baked glyph plus a small
 * roman gloss for the parent.
 *
 * ## Ten at a time, and it swipes
 *
 * There used to be nine `featured` games here and two doors: one to a panel of
 * the other fifteen, one to the three spelling games. Neither distinction meant
 * anything to a child, and several of the twenty-seven do nearly the same job
 * as each other. So there is one ordered list now — src/lib/menu.js — and this
 * screen shows ten of it at a time, swiping sideways for the rest.
 *
 * Which ten is a preference rather than a fact about the app: Settings → Games
 * switches any of them off and drags them into order, and the front page is
 * simply the first ten that survive that.
 *
 * ## A swipe must not open the tile it started on
 *
 * The one hazard, and the deleted panel named it: *"a dragged list steals the
 * drag from the tiles underneath it — a child pressing a tile and moving their
 * finger a few pixels would scroll instead of choosing."* Answered by measuring
 * the travel, in src/lib/swipe.js, which is the same mechanism the strip of
 * letters on Flashcards uses for the same reason.
 *
 * The dots under the grid are tappable as well as decorative. A child who has
 * not worked out swiping still has to be able to reach page two, or seventeen
 * games are unreachable — and unlike the panel's arrows, dots cost no room
 * inside the grid.
 */

/**
 * The grid and the title sit right of centre, because the spider sits at the
 * left of every screen including this one. Laid out against this rather than
 * against the canvas, so adding a game shrinks the tiles instead of pushing the
 * last one through the character.
 */
const STAGE = { left: 250, right: DESIGN.width - 60 };
const STAGE_X = (STAGE.left + STAGE.right) / 2;

/**
 * The چلو button, and where the grid starts beneath it.
 *
 * The grid used to start at 228. It drops to make room for the one control on
 * this screen that is meant to be tapped without reading anything, which is the
 * point of putting it above the tiles rather than among them: a child scanning
 * for something to press should meet it first.
 */
const CHALO = { y: 252, width: 340, height: 84 };
/**
 * The band the grid gets. The bottom is where the footer line starts, not the
 * canvas edge — the tiles are sized to this rather than being allowed to run
 * past it.
 */
const GRID = { top: 318, bottom: DESIGN.height - 56 };

/**
 * How far a finger must travel across the grid to turn the page.
 *
 * Well past `SLOP` in swipe.js, which is only the line between a tap and a
 * drag. This is the line between a drag and a *decision*, and it wants to be
 * generous: a page that turns under a hesitant finger is worse than one that
 * needs asking twice, because the child who lost their page cannot say so.
 */
const SWIPE_PAGE = 70;

/**
 * The row of page dots: how tall a strip it needs, and how big each one is.
 *
 * `room` is taken off the grid's height before the tiles are sized, so a second
 * page costs every tile a few pixels rather than costing the footer its line.
 * `size` is well under a fingertip on its own and that is deliberate — these
 * are readable at a glance and tappable at a push, and a row of finger-sized
 * buttons under the grid would compete with the games for attention.
 */
const DOTS = { room: 44, size: 30 };

export default class Home extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  preload() {
    queueBackdrop(this);
    // Every game's picture, not just this page's: a swipe to page two must
    // arrive drawn rather than filling in tile by tile under a finger that is
    // already reaching. About 10 KB each.
    queueTileArt(this, GAMES);
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    addScenery(this);
    // Nothing has been tapped yet. See leave().
    this.leaving = false;

    const title = uiGlyph('app-title');
    if (title) {
      addGlyph(this, STAGE_X, 118, 'ui:app-title:96', title, {
        height: 96,
        color: COLORS.accentCss,
      });
    }
    label(this, STAGE_X, 190, 'Urdu Learning Games', { size: 20 });

    // Five across and two down, sized to fill the stage rather than to a number
    // typed here, so the one number that decides the whole grid is COLUMNS —
    // and PER_PAGE, in menu.js, is the ten those two make.
    const COLUMNS = 5;
    const gap = 26;
    const rowGap = 24;
    this.pages = pagesOf(menuGames());
    this.page = Math.min(this.page ?? 0, this.pages.length - 1);
    // Measured across a full page rather than across this one, so the last page
    // with three games on it draws its tiles the same size as the first with
    // ten. Tiles that changed size when the page turned would read as a
    // different screen rather than as more of the same one.
    const rows = Math.ceil(PER_PAGE / COLUMNS);
    // The strip the dots stand in, taken off the grid before the tiles are
    // sized rather than found afterwards. Drawn at the old GRID.bottom they
    // landed on top of the footer line, which is the same mistake چلو made from
    // the other end — see below. Nothing on this screen may size itself and
    // then discover where it went.
    const dotsRoom = this.pages.length > 1 ? DOTS.room : 0;
    // Two limits, and the tighter one wins. Width alone used to decide this,
    // which was true right up until چلو pushed the grid's top down by ninety
    // pixels and the second row started printing through the footer. Sizing
    // against the band as well means the tiles give way to the text rather than
    // landing on top of it, whichever direction runs out first.
    const tileW = Math.min(
      252,
      (STAGE.right - STAGE.left - gap * (COLUMNS - 1)) / COLUMNS,
      (GRID.bottom - dotsRoom - GRID.top - rowGap * (rows - 1)) / rows / 1.04
    );
    const tileH = Math.round(tileW * 1.04);
    // Measured from the top of the grid rather than its centre, so a second row
    // grows downwards into the space above the footer instead of pushing the
    // last row through it.
    const places = gridPlaces(PER_PAGE, {
      columns: COLUMNS,
      gap,
      rowGap,
      width: tileW,
      height: tileH,
      centerX: STAGE_X,
      top: GRID.top,
    });

    // One maker for every game in the app, not for this page: the size a
    // fallback letter is drawn at is settled across the whole set it is asked
    // about, so a maker built per page would draw the same letter at two sizes
    // on two pages. See tileMaker.
    const makeTile = tileMaker(this, menuGames(), { width: tileW, height: tileH });
    this.board = this.add.container(0, 0);
    const tiles = this.pages[this.page].map((game, index) =>
      makeTile(game, places[index].x, places[index].y, () => {
        // A swipe that happened to end on a tile is not a choice. This is the
        // whole of the hazard the deleted panel refused to take on; see the
        // note at the top and src/lib/swipe.js.
        if (this.swipe?.moved()) return;
        sfx.whoosh();
        this.leave(() => this.openGame(game.scene));
      })
    );
    for (const tile of tiles) this.board.add(tile);

    this.buildPager(places, tileH);
    this.buildChalo();

    // The grid assembles itself instead of being there already. Reading order,
    // so it builds right to left the way the script does, and quickly — this is
    // a menu a child comes back to twenty times a day and a slow flourish
    // becomes an obstacle by the third visit.
    tiles.forEach((tile, index) => popIn(this, tile, { delay: 60 + index * 55 }));
    // And then they stop. They used to keep breathing for as long as the menu
    // was up, on the theory that ten still rectangles read as a form. Ten that
    // never stop moving read as a screen that will not settle, which is worse
    // on the one screen a child comes back to twenty times a day. Arrival is
    // movement enough.

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

    // No progress indicator here. One used to stand at the left with no panel
    // behind it, and with nothing earned yet that is a flowerpot and a bare
    // cane hanging in mid-air half way up the painted tree — which is what it
    // looked like. The rail belongs to game screens; the argument for having
    // one on the menu was that between games is when a child wants to see how
    // far they have got, and چلو has since made "between games" something that
    // does not pass through the menu at all.

    this.buildInstallHint();
    this.buildSettingsButton();
    this.buildMusicToggle();
    this.buildFullscreenToggle();

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
   * چلو — the button that plays the app for you.
   *
   * The one control on this screen aimed at somebody who cannot read. Wide,
   * central, above the tiles, and the only thing here that moves: a slow swell
   * and a highlight travelling across it, which is what makes a child look at
   * it first among ten pictures that are now deliberately still.
   *
   * The swell is scale on a container rather than anything redrawn, and it is
   * slow — a two-second breath rather than a bounce. A button that jumps reads
   * as urgent; this one only needs to read as ready.
   */
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

    // The highlight: a pale bar travelling across the face. It has to stay
    // *inside* the face, and a container does not clip its children — a bar the
    // width of the button slid across it would spend most of its journey as a
    // white diagonal floating over the meadow. So it is sized to fit the card
    // once tilted (a 62-tall bar at 14° stands 69 high, inside the 84 less the
    // rim), it turns back short of the rounded corners, and it fades in and out
    // at the ends rather than appearing from nowhere.
    // Solid white, and hidden by the object's own alpha rather than by the
    // fill's: the two multiply, so a fill alpha of zero is a bar that can never
    // be tweened into view however far its alpha is raised.
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

    // Arrives first, then breathes — and in that order for a reason. Both are
    // tweens on the same scale, and a tween reads the value it is starting from
    // on its first frame, not when it is created. Breathing started alongside
    // popIn read a fifth of full size as its resting scale and swung the button
    // between that and full size for ever, so it sat at about five sixths and
    // looked like a mis-sized button rather than a moving one.
    popIn(this, button, { delay: 40, duration: 420 }).once('complete', () =>
      breathe(this, button, { amount: 0.035, duration: 1900 })
    );
    this.chaloButton = button;
  }

  /**
   * Starts a run: a random game, and a different one each time one finishes.
   *
   * The first game pushes a history entry and every one after it replaces that
   * same entry, so a run is one back press deep however long it goes on. A
   * child six games in is still one press from the menu, and pressing it ends
   * the run rather than dropping them into the fifth game again.
   */
  startChalo() {
    if (chaloRunning() || this.leaving) return;
    sfx.whoosh();
    ringBurst(this, this.chaloButton.x, this.chaloButton.y, COLORS.accent);
    this.leave(() => {
      startRun((key, first) => this.openGame(key, first ? pushScreen : replaceScreen));
    });
  }

  /**
   * Waits a beat, then goes — and only the first tap gets to.
   *
   * The beat is so the tile is seen to react: leaving instantly makes the tap
   * feel like it went to the next screen rather than to the thing that was
   * pressed. But a hundred and fifty milliseconds is plenty of time for a
   * three-year-old to hit two more things, and every one of those taps used to
   * be honoured — three quick jabs at the menu started three games at once, all
   * three left running, all three in the history, and the console filling with
   * two scenes claiming the same texture.
   *
   * So the menu closes on the first tap. The latch opens again when the menu is
   * built, which is what coming back to it does.
   */
  leave(go) {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(150, go);
  }

  /**
   * Opens a game, and says what leaving it means.
   *
   * The back action rather than the ⌂ button is where the swoosh lives now, so
   * a game sounds the same however it is left — by the button in the corner or
   * by the phone's own back key, which are the same path anyway. See
   * src/lib/history.js.
   */
  openGame(key, how = pushScreen) {
    // A run steps straight from one game into the next without passing through
    // the menu, so the game being left has to be stopped from here. `this` is
    // Home, and `this.scene.start` only ever stops the scene it is called on —
    // without this the finished game keeps running underneath the new one,
    // updating and playing sounds and taking taps.
    for (const other of this.game.scene.getScenes(true)) {
      const running = other.scene.key;
      if (running !== 'Home' && running !== key) this.game.scene.stop(running);
    }
    how(`game:${key}`, () => {
      // Backing out of a game ends a run. Without this the next game to finish
      // would drag the child out of the menu and into another one.
      stopRun();
      sfx.swoosh();
      // Stopped explicitly, then Home started. `this.scene.start('Home')` would
      // not do it: that stops *the scene it is called on*, and this runs on
      // Home, so the game would keep running underneath a restarted menu —
      // updating, playing sounds and handling taps it should not. The ⌂ used to
      // be called from inside the game, where Phaser stopped it for free.
      this.game.scene.stop(key);
      this.game.scene.start('Home');
    });
    this.scene.start(key);
  }

  /**
   * Swipe for the next ten, and dots that say how many there are.
   *
   * The board slides and is rebuilt rather than animated between two live
   * grids: a page is ten baked tile textures, and holding two pages of them so
   * one can slide over the other costs twice the memory for a transition that
   * lasts 240ms. `scene.restart()` is what redraws it, which also picks up an
   * order changed in Settings without this screen having to know that happened.
   *
   * @param {{x: number, y: number}[]} places the grid, so the dots can sit
   *   under the last row rather than at a number typed here
   */
  buildPager(places, tileH) {
    const pages = this.pages.length;
    // In the strip the grid gave up for them, measured off the last row rather
    // than off the canvas so they follow the tiles when those resize.
    const dotsY = places[places.length - 1].y + tileH / 2 + DOTS.room / 2;

    this.swipe = watchSwipe(this, {
      // Not on the چلو button, the settings hatch or the corner buttons: a
      // finger that starts on a control is using the control.
      from: (pointer) => pointer.y > GRID.top - 40,
      onMove: (delta) => {
        if (pages < 2) return;
        // The board follows the finger, damped. 1:1 would let a page be dragged
        // most of the way off screen and then snap back, which reads as the app
        // fighting the hand; a third of the way is enough to say "there is
        // something over there" and short enough that the snap is not a jump.
        this.board.x = Phaser.Math.Clamp(this.board.x + delta * 0.34, -140, 140);
      },
      onEnd: ({ travel, flick }) => {
        this.tweens.add({ targets: this.board, x: 0, duration: 180, ease: 'Quad.easeOut' });
        if (pages < 2 || travel <= SWIPE_PAGE) return;
        // Right to left is forward, like the script. A finger moving left —
        // negative — is pulling the next page in from the right.
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
        // Tappable, and that is the point of them. A three-year-old who has not
        // worked out swiping must still be able to reach page two, or every
        // game past the tenth may as well not exist. See the note at the top.
        onTap: () => this.turnPage(index - this.page),
      });
      this.dots.push(dot);
    }
  }

  /** `step` pages on, wrapping, and redraws. */
  turnPage(step) {
    if (!step || this.pages.length < 2 || this.leaving) return;
    this.page = (this.page + step + this.pages.length) % this.pages.length;
    sfx.swoosh();
    this.scene.restart();
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
   * Fullscreen switch for browsers that support it.
   *
   * A site opened from a URL cannot force fullscreen on load: the browser only
   * allows this after a real tap. The installed PWA asks for fullscreen through
   * its manifest, and this button covers the website case and lets a parent get
   * back to normal browser chrome.
   */
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
        if (this.settingsOpening) return;
        this.settingsOpening = true;
        drawRing(0);
        // The DOM gate is above the canvas, but Phaser can still see input in
        // the short async gap between accepting the answer and mounting the
        // settings overlay. Hold the whole input plugin shut until the settings
        // screen exists, or until the gate is cancelled.
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

  /**
   * Loaded on demand: settings pulls in its own CSS, and the recorder behind it
   * pulls in a zip writer and the take-polishing code — none of which a child
   * playing the games ever needs.
   */
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
    // Phaser keeps handling input underneath a DOM overlay, so a tap or space
    // bar meant for settings must not also poke the game.
    this.input.enabled = false;
    this.input.keyboard.enabled = false;
    // The lock is *not* released. Settings used to let the phone turn upright,
    // because the tracing editor wants a tall window and a finger. The app is
    // landscape everywhere now, on every screen, the way a video game is — so
    // the editor gets a short wide window, and if that turns out to be awkward
    // it is a layout problem in src/ui/stroke-editor.css rather than a reason
    // to let one screen behave differently from the rest of the app.
    const close = openSettings({
      onClose: () => {
        // Whatever closed it — the ×, the arrow, or the phone's back button —
        // the entry has to go with it, or the next back would try to close a
        // screen that is not there. Dropping rather than navigating, because by
        // the time onClose runs the history has already moved.
        dropScreen('settings');
        this.input.enabled = true;
        this.input.keyboard.enabled = true;
        this.settingsOpening = false;
        // Restarted rather than resumed: the music switch and the recordings
        // both change what this screen should show.
        this.scene.restart();
      },
    });
    // Pushed after the screen exists, so the back action has something to call.
    // The gate that got us here has already unwound its own entry — it settles
    // its promise from inside that unwind for exactly this reason — so this
    // lands at the right depth rather than on top of a dying one.
    pushScreen('settings', close);
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
