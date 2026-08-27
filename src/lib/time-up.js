/* The screen that says today is over. */

import { uiGlyph } from './content.js';
import { glyphSvg } from '../ui/glyph-svg.js';
import { askParentalQuestion } from './parental-gate.js';
import { stageElement } from './turn.js';
import { holdGameInput } from './game-input.js';
import { endToday, grant, isUp, onRanOut } from './allowance.js';
import * as sfx from './sfx.js';

/* How long a screen with no ending of its own gets after the time runs out. */
const GRACE = 90000;

/* Minutes a grown-up can hand back at the door, without opening Settings. */
const TOP_UP = 10;

/** @type {HTMLElement|null} */
let showing = null;
/* Hands pointers back to the game when this goes away. */
let release = null;
/** @type {number|null} */
let graceTimer = null;
/* Set when the clock hits zero and cleared when the screen actually appears. */
let due = false;

/* Every game's ending, so this can wait for one. */
const finished = new Set();

/* Told by stage.js when an activity finishes. */
export function noteActivityEnded() {
  for (const listener of finished) listener();
}

function line(id, className) {
  const glyph = uiGlyph(id);
  return glyph ? `<div class="${className}">${glyphSvg(glyph)}</div>` : '';
}

/* Draws it. Nothing underneath is reachable while it is up. */
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

  // No close button, no backdrop click, no Escape.
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
  // Covering the canvas is not enough on its own.
  release = holdGameInput();
  sfx.whoosh();
}

function hide() {
  showing?.remove();
  showing = null;
  release?.();
  release = null;
}

/* Arms the screen. */
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

  // Opening the app with nothing left is the same as running out.
  if (isUp()) show();
}

/** Watches the menu, which is the one screen with nothing to interrupt.
 * @param {Phaser.Scene} scene the menu, for tearing the listener down again
 */
export function watchMenu(scene) {
  if (due || isUp()) show();
  const stop = onRanOut(show);
  // Off the moment the menu goes: inside a game the wait is the whole point.
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);
}
