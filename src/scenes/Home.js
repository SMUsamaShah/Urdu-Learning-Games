import Phaser from 'phaser';
import { letterGlyph, uiGlyph } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
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
];

export default class Home extends Phaser.Scene {
  constructor() {
    super('Home');
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

    const tileW = 300;
    const tileH = 250;
    const gap = 36;
    const totalW = GAMES.length * tileW + (GAMES.length - 1) * gap;
    // Right-to-left, matching the script.
    const startX = DESIGN.width / 2 + totalW / 2 - tileW / 2;

    GAMES.forEach((game, index) => {
      const x = startX - index * (tileW + gap);
      const y = 430;

      const button = makeButton(this, {
        x,
        y,
        width: tileW,
        height: tileH,
        color: game.color,
        onTap: () => this.scene.start(game.scene),
      });

      const icon = letterGlyph(game.icon.letter, game.icon.form);
      if (icon) {
        button.add(
          addGlyph(
            this,
            0,
            -52,
            `letter:${game.icon.letter}:${game.icon.form}:84`,
            icon,
            { height: 84, color: COLORS.ink }
          )
        );
      }

      const nameGlyph = uiGlyph(game.ui);
      if (nameGlyph) {
        const glyph = addGlyph(this, 0, 42, `ui:${game.ui}:60`, nameGlyph, {
          height: 60,
          color: COLORS.ink,
        });
        button.add(glyph);
      }

      const roman = label(this, 0, 96, game.roman, { size: 18, color: '#dbe4ff' });
      button.add(roman);
    });

    label(
      this,
      DESIGN.width / 2,
      DESIGN.height - 34,
      'No ads · No tracking · Works offline',
      { size: 16, color: '#5f6d95' }
    );
  }
}
