/**
 * The screen that says today is over.
 *
 * ## Why it waits
 *
 * The clock in allowance.js stops the moment the last minute goes. This does
 * not. Cutting a screen off mid-round is how a limit turns into a punishment
 * for the thing he was in the middle of, and a three-year-old cannot be told
 * "you were nearly finished, that's just how it works".
 *
 * So the moment it *appears* is whichever of these comes first:
 *
 *  - the activity finishes on its own, which is `wellDone` in stage.js and is
 *    the one moment every game agrees is an ending;
 *  - `GRACE` runs out, for the screens with no ending — Flashcards is a strip
 *    you browse, Trace is a letter you draw over and over — where waiting for
 *    a finish would wait for ever;
 *  - the menu, where there is nothing to interrupt.
 *
 * ## Why it is DOM and not a scene
 *
 * It has to cover whatever is underneath, including the grown-ups screens,
 * without every one of the twenty-seven games having to know about it. A
 * backdrop over the stage does that in one place. It is mounted into `#stage`
 * so it turns with the app — see turn.js.
 *
 * The Urdu on it is a baked glyph drawn as SVG, the same way Settings draws
 * letters, rather than text in whatever font the phone has. This screen is the
 * app talking to a child; it does not get to look like a browser dialog.
 */

import { uiGlyph } from './content.js';
import { glyphSvg } from '../ui/glyph-svg.js';
import { askParentalQuestion } from './parental-gate.js';
import { stageElement } from './turn.js';
import { holdGameInput } from './game-input.js';
import { endToday, grant, isUp, onRanOut } from './allowance.js';
import * as sfx from './sfx.js';

/**
 * How long a screen with no ending of its own gets after the time runs out.
 *
 * Ninety seconds. Long enough to finish tracing the letter under his finger,
 * short enough that a limit still means something — a grace period that outlasts
 * the attention span it is waiting on is just a longer limit.
 */
const GRACE = 90000;

/** Minutes a grown-up can hand back at the door, without opening Settings. */
const TOP_UP = 10;

/** @type {HTMLElement|null} */
let showing = null;
/** Hands pointers back to the game when this goes away. See game-input.js. */
let release = null;
/** @type {number|null} */
let graceTimer = null;
/** Set when the clock hits zero and cleared when the screen actually appears. */
let due = false;

/** Every game's ending, so this can wait for one. See stage.js. */
const finished = new Set();

/** Told by stage.js when an activity finishes. */
export function noteActivityEnded() {
  for (const listener of finished) listener();
}

function line(id, className) {
  const glyph = uiGlyph(id);
  return glyph ? `<div class="${className}">${glyphSvg(glyph)}</div>` : '';
}

/** Draws it. Nothing underneath is reachable while it is up. */
function show() {
  if (showing) return;
  due = false;
  clearTimeout(graceTimer);
  graceTimer = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'timeup-backdrop';
  backdrop.innerHTML = `
    <div class="timeup" role="dialog" aria-modal="true" aria-label="That's enough for today">
      <img class="timeup-mascot" src="${import.meta.env.BASE_URL ?? '/'}images/mascot/idle.webp"
           alt="" />
      ${line('time-up', 'timeup-title')}
      ${line('come-back', 'timeup-sub')}
      <p class="timeup-roman">That's enough for today. We'll play again tomorrow.</p>
      <button type="button" class="timeup-grown">Grown-ups</button>
    </div>`;

  // No close button, no backdrop click, no Escape. Every other overlay in this
  // app can be dismissed by the person looking at it; this is the one that must
  // not be, or it is a suggestion rather than a limit.
  backdrop.querySelector('.timeup-grown').onclick = async () => {
    if (!(await askParentalQuestion())) return;
    const more = window.confirm(
      `Give ${TOP_UP} more minutes?\n\nCancel leaves today finished.`
    );
    if (more) {
      grant(TOP_UP);
      hide();
    } else {
      endToday();
    }
  };

  stageElement().appendChild(backdrop);
  showing = backdrop;
  // Covering the canvas is not enough on its own: Phaser hears `pointerup` on
  // the window, so a tap on this screen is also a tap on whatever tile is
  // underneath it. See src/lib/game-input.js.
  release = holdGameInput();
  sfx.whoosh();
}

function hide() {
  showing?.remove();
  showing = null;
  release?.();
  release = null;
}

/**
 * Arms the screen. Called once at startup.
 *
 * Also checks on the way in: a phone that was closed with the time already gone
 * must not hand back a fresh session by being reopened.
 */
export function watchTimeUp() {
  if (typeof window === 'undefined') return;

  const arm = () => {
    if (showing || due) return;
    due = true;
    graceTimer = setTimeout(show, GRACE);
  };

  onRanOut(arm);
  finished.add(() => {
    if (due) show();
  });

  // Opening the app with nothing left is the same as running out, without the
  // grace: he has not started anything to be interrupted in.
  //
  // The menu asks the same question a moment later through `showIfDue()`, so
  // this is belt and braces — but the moment is the point. This runs before the
  // first scene, so a phone reopened with the time gone shows the screen
  // instead of a loading screen and then the screen.
  if (isUp()) show();
}

/**
 * Watches the menu, which is the one screen with nothing to interrupt.
 *
 * Everywhere else waits — for the round to end, or for the grace to run out.
 * Here there is nothing to wait for, so both ways of arriving at "the time has
 * gone and he is looking at the menu" show it at once:
 *
 *  - **already gone when the menu builds**, which is coming back to the menu
 *    after the screen was raised inside a game;
 *  - **going while he sits there**, which used to leave him ninety seconds of
 *    menu he could start another game from. Same screen, same moment, and
 *    handling only the first is the kind of gap nobody would find by playing.
 *
 * @param {Phaser.Scene} scene the menu, for tearing the listener down again
 */
export function watchMenu(scene) {
  if (due || isUp()) show();
  const stop = onRanOut(show);
  // Off the moment the menu goes: inside a game the wait is the whole point.
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);
}
