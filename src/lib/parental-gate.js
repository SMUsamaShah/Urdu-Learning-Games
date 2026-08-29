/* Keeps the grown-up screens away from the child holding the phone. */

import './parental-gate.css';
import { goBack, pushScreen } from './history.js';
import { stageElement } from './turn.js';
import { holdGameInput } from './game-input.js';

const HOLD_MS = 900;

/** Asks the arithmetic question.
 * @param {HTMLElement} [parent] element that receives the gate
 * @returns {Promise<boolean>} whether the answer was right.
 */
export function askParentalQuestion(parent = stageElement()) {
  // Small enough to be instant for an adult, beyond a preschooler either way.
  const a = 3 + Math.floor(Math.random() * 6); // 3..8
  const b = 3 + Math.floor(Math.random() * 6);

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'gate-backdrop';
    backdrop.innerHTML = `
      <div class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-q">
        <p class="gate-title">Grown-ups only</p>
        <label id="gate-q" for="gate-answer">What is ${a} × ${b}?</label>
        <input id="gate-answer" class="gate-input" type="number"
               inputmode="numeric" autocomplete="off" />
        <div class="gate-actions">
          <button type="button" class="gate-cancel">Cancel</button>
          <button type="button" class="gate-ok">Continue</button>
        </div>
      </div>`;

    /* The answer, held until the dialog's history entry is unwound. */
    let answer = false;
    // The question covers the canvas, which does not stop Phaser hearing a tap on it: see src/lib/game-input.js.
    const release = holdGameInput();
    const settle = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      release();
      resolve(result);
    };
    pushScreen('gate', () => settle(answer));
    const close = () => goBack();
    const submit = () => {
      answer = Number(input.value) === a * b;
      goBack();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Enter') submit();
    };

    parent.appendChild(backdrop);
    const input = backdrop.querySelector('.gate-input');
    backdrop.querySelector('.gate-ok').onclick = submit;
    backdrop.querySelector('.gate-cancel').onclick = () => close();
    backdrop.onclick = (event) => event.target === backdrop && close();
    document.addEventListener('keydown', onKey);
    input.focus();
  });
}

/** Wires hold-to-open onto a Phaser game object.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} target must already be interactive.
 * @param {{onProgress?: (t: number) => void, onOpen: () => void}} handlers
 */
export function attachHoldToOpen(scene, target, { onProgress, onOpen }) {
  let start = 0;
  let event = null;

  const stop = () => {
    if (event) {
      event.remove();
      event = null;
    }
    start = 0;
    onProgress?.(0);
  };

  target.on('pointerdown', () => {
    start = scene.time.now;
    event = scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const t = Math.min(1, (scene.time.now - start) / HOLD_MS);
        onProgress?.(t);
        if (t >= 1) {
          stop();
          onOpen();
        }
      },
    });
  });

  target.on('pointerup', stop);
  target.on('pointerout', stop);
  scene.events.once('shutdown', stop);
  return stop;
}
