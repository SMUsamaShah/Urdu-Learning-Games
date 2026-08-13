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
import JoinForms from './scenes/JoinForms.js';
import StartsWith from './scenes/StartsWith.js';
import Doors from './scenes/Doors.js';
import TapAll from './scenes/TapAll.js';
import Caterpillar from './scenes/Caterpillar.js';
import LetterPuzzle from './scenes/LetterPuzzle.js';
import Fishing from './scenes/Fishing.js';
import Baskets from './scenes/Baskets.js';
import Trace from './scenes/Trace.js';
import * as audio from './lib/audio.js';
import { createAppAudioContext } from './lib/audio-context.js';
import { mountFpsMeter } from './lib/fps.js';
import * as updates from './lib/updates.js';
import * as music from './lib/music.js';
import * as flourish from './lib/flourish.js';
import { useAudioContext } from './lib/tone-setup.js';
import { DESIGN } from './lib/theme.js';

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
    JoinForms,
    StartsWith,
    Doors,
    TapAll,
    Caterpillar,
    LetterPuzzle,
    Fishing,
    Baskets,
    Trace,
  ],
});

// Exposed so the Playwright checks can drive the app without depending on pixel
// coordinates, which would break on every layout tweak. `__audio` lets a test
// assert that a clip really decoded and played, which is otherwise invisible
// from outside the page.
//
// `__music` is here for a subtler reason. A check that wants to listen to the
// tune cannot simply `import('/src/lib/music.js')`: the dev server serves the
// app's modules with a cache-busting query string on the URL, so an import
// without one resolves to a *second copy of the module* with its own
// module-scope state — uninitialised, silent, and not the one the app is
// playing. Anything holding state at module scope has to be reached through the
// running app rather than imported afresh.
// Whatever Phaser ended up using, which is not always what we handed it:
// createAppAudioContext() returns null where Web Audio is unavailable or
// refuses the latency hint, and Phaser then builds its own. Reading it back
// here is the only way to be sure Tone shares it — pointing Tone at a context
// Phaser is not using produces an InvalidAccessError the moment two nodes from
// different contexts are connected, and the music simply never plays.
useAudioContext(game.sound?.context ?? audioContext);

window.__game = game;
window.__music = music;
window.__flourish = flourish;
window.__updates = updates;

// Hidden unless switched on from the grown-ups screen. Mounted regardless so
// the toggle takes effect without a reload.
mountFpsMeter(game);

// Shows a spinner while the app is fetching a new version of itself. It
// updates silently — a three-year-old will not tap "a new version is
// available" — and the point of this is only that somebody can tell whether
// what they are looking at is current.
updates.mountUpdateIndicator();
window.__audio = audio;
