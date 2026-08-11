/**
 * Keeps the grown-up screens away from the child holding the phone.
 *
 * Behind this gate are buttons that delete recordings and overwrite takes, on a
 * device handed to a three-year-old who taps everything. The bar to clear is
 * therefore "cannot be reached by accident or by persistence", not "secure" —
 * there is no secret here worth protecting, and pretending otherwise would only
 * make it annoying for the parent.
 *
 * Two obstacles, both trivial for an adult:
 *
 *   1. Hold the button for a moment. Rules out a stray tap.
 *   2. Answer a small multiplication. Rules out a child who learned that holding
 *      it works, and needs reading and arithmetic a preschooler does not have.
 *
 * Built as plain DOM rather than a Phaser scene because it is adult-facing and
 * needs a real text input, which a canvas cannot give without reimplementing
 * keyboard handling.
 */

export const HOLD_MS = 900;

/**
 * Asks the arithmetic question.
 *
 * @param {HTMLElement} [parent=document.body]
 * @returns {Promise<boolean>} whether the answer was right. A wrong answer just
 *   closes: no retry loop to bang on, and no feedback to learn from.
 */
export function askParentalQuestion(parent = document.body) {
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

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };
    const submit = () => close(Number(input.value) === a * b);
    const onKey = (event) => {
      if (event.key === 'Escape') close(false);
      if (event.key === 'Enter') submit();
    };

    parent.appendChild(backdrop);
    const input = backdrop.querySelector('.gate-input');
    backdrop.querySelector('.gate-ok').onclick = submit;
    backdrop.querySelector('.gate-cancel').onclick = () => close(false);
    backdrop.onclick = (event) => event.target === backdrop && close(false);
    document.addEventListener('keydown', onKey);
    input.focus();
  });
}

/**
 * Wires hold-to-open onto a Phaser game object.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} target must already be interactive.
 * @param {{onProgress?: (t: number) => void, onOpen: () => void}} handlers
 *   onProgress receives 0..1 so the caller can draw a filling ring, which is
 *   what tells an adult to keep holding rather than tap again.
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

/**
 * Hold, then answer. Resolves true only if both are cleared.
 * @returns {Promise<boolean>}
 */
export function openParentalGate() {
  return askParentalQuestion();
}
