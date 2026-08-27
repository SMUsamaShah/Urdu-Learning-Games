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
import * as allowance from './lib/allowance.js';
import { useGameInput } from './lib/game-input.js';
import { watchTimeUp } from './lib/time-up.js';
import * as backHistory from './lib/history.js';
import * as chalo from './lib/chalo.js';
import * as stage from './lib/stage.js';
import * as volumeControl from './lib/volume.js';
import * as sfx from './lib/sfx.js';
import { useAudioContext } from './lib/tone-setup.js';
import { DESIGN } from './lib/theme.js';

/* Every screen is a Phaser Scene, so adding a game means adding one file and one entry in this list. */
/* Built here rather than left to Phaser. */
const audioContext = createAppAudioContext();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#8fd4f5',
  ...(audioContext ? { audio: { context: audioContext } } : {}),
  scale: {
    mode: Phaser.Scale.FIT,
    // The browser centres the canvas, not Phaser — `#game` is a flex box, see index.html.
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

// Exposed so the Playwright checks can drive the app without depending on pixel coordinates.
useAudioContext(game.sound?.context ?? audioContext);

// Track DOM overlays that cover the canvas.
useGameInput(game);

window.__game = game;
window.__music = music;
// Which pen paths the app believes in, and where each came from.
window.__strokes = strokes;
window.__fullscreen = fullscreen;
window.__orientation = orientation;
// The master gain and the effects.
window.__volume = volumeControl;
window.__sfx = sfx;
window.__history = backHistory;
// The چلو run.
window.__chalo = chalo;
// `wellDone` is the one moment every game agrees is "an activity finished", and it is what a چلو run listens for.
window.__stage = stage;

// Asks the phone to be held sideways.
orientation.watchOrientation();
turn.watchTurn(game);
window.__turn = turn;

// How long he gets today.
allowance.watchAllowance();
watchTimeUp();
window.__allowance = allowance;

// What the phone's back button means.
backHistory.initHistory();
window.__progress = progress;
window.__flourish = flourish;
window.__updates = updates;

// Hidden unless switched on from the grown-ups screen.
mountFpsMeter(game);

// Shows a spinner while the app is fetching a new version of itself.
updates.mountUpdateIndicator();
window.__audio = audio;
