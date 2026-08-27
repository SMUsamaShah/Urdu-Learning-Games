import Phaser from 'phaser';
import { loadGlyphs } from '../lib/content.js';
import { audioStats, initAudio } from '../lib/audio.js';
import { queueMascot } from '../lib/mascot.js';
import { initSfx } from '../lib/sfx.js';
import { initStrokes } from '../lib/strokes.js';
import { initVolume } from '../lib/volume.js';
import { initMusic, startMusic } from '../lib/music.js';
import { COLORS, DESIGN, label } from '../lib/theme.js';

/* Fetches the baked glyph outlines, then hands off to the menu. */
export default class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // The mascot is on every screen.
    queueMascot(this);
  }

  async create() {
    const cx = DESIGN.width / 2;
    const cy = DESIGN.height / 2;

    const track = this.add.graphics();
    track.fillStyle(COLORS.panel, 1);
    track.fillRoundedRect(cx - 160, cy - 8, 320, 16, 8);

    const bar = this.add.graphics();
    bar.fillStyle(COLORS.accent, 1);
    bar.fillRoundedRect(cx - 160, cy - 8, 40, 16, 8);

    this.tweens.add({
      targets: bar,
      x: 280,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    try {
      // Both are small and independent.
      await Promise.all([loadGlyphs(), initAudio(this.game)]);
      // After the outlines.
      await initStrokes();
      // Before the things that connect to it.
      initVolume(this.game);
      initSfx(this.game);
      initMusic(this.game);
      // The context is almost certainly still locked here.
      startMusic();

      const { recorded = 0, expected = 0, device = 0 } = audioStats();
      const have = recorded + device;
      if (have === 0) {
        console.info(
          'No voice recordings yet — the app runs silent. ' +
            'Record them from Settings on the home screen, or with `npm run record`.'
        );
      } else if (have < expected) {
        console.info(
          `Voice recordings: ${have}/${expected}` +
            (device ? ` (${device} recorded on this device)` : '') +
            '.'
        );
      }

      this.scene.start('Home');
    } catch (error) {
      bar.destroy();
      track.destroy();
      label(this, cx, cy - 20, 'Could not load letter data', {
        size: 26,
        color: COLORS.ink,
      });
      label(this, cx, cy + 20, String(error.message ?? error), { size: 18 });
    }
  }
}
