import Phaser from 'phaser';
import Preload from './scenes/Preload.js';
import Home from './scenes/Home.js';
import Flashcards from './scenes/Flashcards.js';
import FindLetter from './scenes/FindLetter.js';
import Balloons from './scenes/Balloons.js';
import WordPictures from './scenes/WordPictures.js';
import Numbers from './scenes/Numbers.js';
import Memory from './scenes/Memory.js';
import Sequence from './scenes/Sequence.js';
import Trace from './scenes/Trace.js';
import * as audio from './lib/audio.js';
import { createAppAudioContext } from './lib/audio-context.js';
import { COLORS, DESIGN } from './lib/theme.js';

/**
 * Every screen is a Phaser Scene, so adding a game means adding one file and
 * one entry in this list.
 *
 * Scale.FIT against a fixed design size keeps layout arithmetic simple and
 * identical on every device, which matters more here than filling every last
 * pixel: the app has to look the same on a cheap Android phone and a tablet.
 */
/**
 * Built here rather than left to Phaser, which would construct one with
 * `latencyHint: 'interactive'` — the smallest buffer the browser will give.
 * That is right for a game of short blips and wrong for one that plays recorded
 * speech over a busy WebGL scene, where a starved audio thread drops samples
 * and the voice breaks up. See src/lib/audio-context.js.
 */
const audioContext = createAppAudioContext();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#8fd4f5',
  ...(audioContext ? { audio: { context: audioContext } } : {}),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN.width,
    height: DESIGN.height,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [
    Preload,
    Home,
    Flashcards,
    FindLetter,
    Balloons,
    WordPictures,
    Numbers,
    Memory,
    Sequence,
    Trace,
  ],
});

// Exposed so the Playwright checks can drive the app without depending on pixel
// coordinates, which would break on every layout tweak. `__audio` lets a test
// assert that a clip really decoded and played, which is otherwise invisible
// from outside the page.
window.__game = game;
window.__audio = audio;
