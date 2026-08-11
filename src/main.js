import Phaser from 'phaser';
import Preload from './scenes/Preload.js';
import Home from './scenes/Home.js';
import Flashcards from './scenes/Flashcards.js';
import FindLetter from './scenes/FindLetter.js';
import Balloons from './scenes/Balloons.js';
import WordPictures from './scenes/WordPictures.js';
import Numbers from './scenes/Numbers.js';
import * as audio from './lib/audio.js';
import { COLORS, DESIGN } from './lib/theme.js';

/**
 * Every screen is a Phaser Scene, so adding a game means adding one file and
 * one entry in this list.
 *
 * Scale.FIT against a fixed design size keeps layout arithmetic simple and
 * identical on every device, which matters more here than filling every last
 * pixel: the app has to look the same on a cheap Android phone and a tablet.
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bgCss,
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
  scene: [Preload, Home, Flashcards, FindLetter, Balloons, WordPictures, Numbers],
});

// Exposed so the Playwright checks can drive the app without depending on pixel
// coordinates, which would break on every layout tweak. `__audio` lets a test
// assert that a clip really decoded and played, which is otherwise invisible
// from outside the page.
window.__game = game;
window.__audio = audio;
