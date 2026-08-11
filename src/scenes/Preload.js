import Phaser from 'phaser';
import { loadGlyphs } from '../lib/content.js';
import { audioStats, initAudio, loadAudioManifest } from '../lib/audio.js';
import { initSfx } from '../lib/sfx.js';
import { COLORS, DESIGN, label } from '../lib/theme.js';

/**
 * Fetches the baked glyph outlines, then hands off to the menu.
 *
 * There is exactly one asset to wait for, and on a warm cache it is instant, so
 * this scene is mostly insurance for a cold first load on a slow phone.
 */
export default class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
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
      // Both are small and independent. Audio is only a manifest at this point;
      // the clips themselves load lazily on first use.
      await Promise.all([loadGlyphs(), loadAudioManifest()]);
      initAudio(this.game);
      initSfx(this.game);

      const { recorded = 0, expected = 0 } = audioStats();
      if (recorded === 0) {
        console.info(
          'No voice recordings yet — the app runs silent. ' +
            'Record them with `npm run record`, then `npm run audio:manifest`.'
        );
      } else if (recorded < expected) {
        console.info(`Voice recordings: ${recorded}/${expected}.`);
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
