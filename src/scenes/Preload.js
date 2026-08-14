import Phaser from 'phaser';
import { loadGlyphs } from '../lib/content.js';
import { audioStats, initAudio } from '../lib/audio.js';
import { queueMascot } from '../lib/mascot.js';
import { initSfx } from '../lib/sfx.js';
import { initStrokes } from '../lib/strokes.js';
import { initMusic, startMusic } from '../lib/music.js';
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

  preload() {
    // The mascot is on every screen, so there is nothing to gain by deferring
    // it, and a character that pops in a frame late on each scene change looks
    // broken. 200 KB, precached with the rest.
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
      // Both are small and independent. Audio only fetches its manifest here;
      // the clips themselves load lazily on first use.
      await Promise.all([loadGlyphs(), initAudio(this.game)]);
      // After the outlines, not alongside them: this compares the tracing paths
      // against the font fingerprint recorded in glyphs.json, and reads the
      // corrections made on this device out of IndexedDB. The Write screen then
      // consults both synchronously when it decides whether to draw a guide.
      await initStrokes();
      initSfx(this.game);
      initMusic(this.game);
      // The context is almost certainly still locked here — nothing has been
      // tapped yet — so this is a no-op that Home repeats after the first
      // gesture. Calling it anyway covers the case where a previous visit
      // already unlocked audio and the tab was only reloaded.
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
