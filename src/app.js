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
import BuildWord from './scenes/BuildWord.js';
import FillLetter from './scenes/FillLetter.js';
import JoinWord from './scenes/JoinWord.js';
import LetterPuzzle from './scenes/LetterPuzzle.js';
import Fishing from './scenes/Fishing.js';
import Baskets from './scenes/Baskets.js';
import Whack from './scenes/Whack.js';
import OddOne from './scenes/OddOne.js';
import InOrder from './scenes/InOrder.js';
import Paint from './scenes/Paint.js';
import ConnectPairs from './scenes/ConnectPairs.js';
import NumberLine from './scenes/NumberLine.js';
import Hidden from './scenes/Hidden.js';
import Bounce from './scenes/Bounce.js';
import Trace from './scenes/Trace.js';
import * as audio from './lib/audio.js';
import { createAppAudioContext } from './lib/audio-context.js';
import { mountFpsMeter } from './lib/fps.js';
import * as updates from './lib/updates.js';
import * as music from './lib/music.js';
import * as flourish from './lib/flourish.js';
import * as progress from './lib/progress.js';
import * as strokes from './lib/strokes.js';
import * as fullscreen from './lib/fullscreen.js';
import * as orientation from './lib/orientation.js';
import * as turn from './lib/turn.js';
import * as backHistory from './lib/history.js';
import * as chalo from './lib/chalo.js';
import * as stage from './lib/stage.js';
import * as volumeControl from './lib/volume.js';
import * as sfx from './lib/sfx.js';
import { useAudioContext } from './lib/tone-setup.js';
import { DESIGN } from './lib/theme.js';

/**
 * Every screen is a Phaser Scene, so adding a game means adding one file and
 * one entry in this list.
 *
 * `Scale.FIT` still, but against a design surface whose *width* was measured
 * from this screen before any of these scenes was imported — see src/main.js.
 * Fitting a fixed 16:9 into a 20:9 phone used to leave a band of empty page
 * down each side; a canvas cut to the screen's own shape fits it exactly and
 * the arithmetic inside a scene is no more complicated than it was, because
 * every scene reads `DESIGN` and `PLAY` rather than typing 1280 anywhere.
 *
 * The height is still fixed at 720, so a thing drawn 100 tall is the same
 * fraction of the screen on every device. Only the room to the left and right
 * of it changes.
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
    // The browser centres the canvas, not Phaser — `#game` is a flex box, see
    // index.html. `CENTER_BOTH` does it by setting margins measured off the
    // parent's *bounding rect*, and when the app turns itself sideways that
    // rect is the rotated one: an 888x400 canvas got centred inside a 400x888
    // box and came out 244 pixels down and across the screen. Handing the job
    // to CSS is one fewer place that has to be told the DOM is lying.
    autoCenter: Phaser.Scale.NO_CENTER,
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
    BuildWord,
    FillLetter,
    JoinWord,
    LetterPuzzle,
    Fishing,
    Baskets,
    Whack,
    OddOne,
    InOrder,
    Paint,
    ConnectPairs,
    NumberLine,
    Hidden,
    Bounce,
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
// Which pen paths the app believes in, and where each came from. Held at module
// scope and filled from IndexedDB at startup, so a check cannot import it
// afresh and see the same thing — see the note above about the dev server's
// cache-busting query string.
window.__strokes = strokes;
window.__fullscreen = fullscreen;
window.__orientation = orientation;
// The master gain and the effects, so a check can measure what actually reaches
// the speakers rather than trusting that it was wired up.
window.__volume = volumeControl;
window.__sfx = sfx;
window.__history = backHistory;
// The چلو run. Module-scope state again, and for the same reason: a check has
// to ask the running app which game the run is on, not a second copy of the
// module that has never been started.
window.__chalo = chalo;
// `wellDone` is the one moment every game agrees is "an activity finished",
// and it is what a چلو run listens for. A check needs to be able to end an
// activity the way a game does without playing one through by hand.
window.__stage = stage;

// Asks the phone to be held sideways. Where the ask is refused — a tab that is
// not fullscreen, or rotation switched off in system settings — `watchTurn`
// turns the app sideways itself and the phone gets held that way to read it.
// The app is landscape everywhere and on every screen, Settings included.
orientation.watchOrientation();
turn.watchTurn(game);
window.__turn = turn;

// What the phone's back button means. Started before anything can open a screen,
// because the entry it replaces is the one the app sits on at the menu — see
// src/lib/history.js.
backHistory.initHistory();
window.__progress = progress;
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
