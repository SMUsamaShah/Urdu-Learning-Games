import Phaser from 'phaser';
import { letterGlyph, numberGlyph, uiGlyph } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { canInstall, onInstallAvailability, promptInstall } from '../lib/install.js';
import { askParentalQuestion, attachHoldToOpen } from '../lib/parental-gate.js';
import { COLORS, DESIGN, label, makeButton } from '../lib/theme.js';

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
];

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
        ? addGlyph(this, 0, y, `ui:tile:${game.number}:${size}`, glyph, {
            height: size,
            color: COLORS.onColor,
          })
        : null;
    }
    const glyph = letterGlyph(game.icon.letter, game.icon.form);
    return glyph
      ? addGlyph(
          this,
          0,
          y,
          `letter:${game.icon.letter}:${game.icon.form}:${size}`,
          glyph,
          { height: size, color: COLORS.onColor }
        )
      : null;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const title = uiGlyph('app-title');
    if (title) {
      addGlyph(this, DESIGN.width / 2, 118, 'ui:app-title:96', title, {
        height: 96,
        color: COLORS.accentCss,
      });
    }
    label(this, DESIGN.width / 2, 190, 'Urdu Learning Games', { size: 20 });

    // Tiles shrink to fit rather than being a fixed size: games get added, and
    // a row that silently ran off the edge of the screen would hide the newest
    // one — which is the one a child has not played yet.
    const gap = 26;
    const margin = 70;
    const tileW = Math.min(
      272,
      (DESIGN.width - margin * 2 - gap * (GAMES.length - 1)) / GAMES.length
    );
    const tileH = Math.round(tileW * 0.92);
    const iconSize = Math.round(tileW * 0.34);
    const totalW = GAMES.length * tileW + (GAMES.length - 1) * gap;
    // Right-to-left, matching the script.
    const startX = DESIGN.width / 2 + totalW / 2 - tileW / 2;

    GAMES.forEach((game, index) => {
      const button = makeButton(this, {
        x: startX - index * (tileW + gap),
        y: 430,
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
        button.add(
          addGlyph(this, 0, tileH * 0.17, `ui:${game.ui}:44`, nameGlyph, {
            height: 44,
            color: COLORS.onColor,
          })
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
