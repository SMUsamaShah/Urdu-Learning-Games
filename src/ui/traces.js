import './stroke-editor.css';
import { buildStrokeEditor } from './stroke-editor.js';
import { SEED_DEFAULTS, skeletonise } from '../lib/skeletonise.js';
import { glyphSheet, letterGlyph, letters } from '../lib/content.js';
import { editableStrokes, noteDeviceStrokes, strokeSource, strokesMatchFont } from '../lib/strokes.js';
import { clearLetter, deviceStrokes, exportShape, saveLetter } from '../lib/stroke-store.js';

/**
 * The Letter traces page, inside Settings.
 *
 * The same editor the desktop studio runs, over the device's own copy of the
 * pen paths. It exists because the letters that most need fixing — ڈ ڑ ط ظ ٹ
 * ھ ہ ے م — are the ones worth fixing on the sofa with a tablet in hand, and
 * before this the only way was `npm run trace-studio` at a computer.
 *
 * ## Save, then walk into the game
 *
 * A save goes to IndexedDB *and* into the running app's copy, so closing
 * settings and opening Write shows the new path immediately. Being able to try
 * a correction is most of what makes a correction possible: a stroke order
 * reads fine as a numbered diagram and is obviously wrong the moment a finger
 * follows it.
 *
 * ## And then send me the file
 *
 * Export writes urdu-traces-<date>.json — only the letters edited here, plus
 * the font fingerprint. Small enough to send, and refusable on the other end:
 * the studio's import checks that fingerprint before it merges anything into
 * content/strokes.json, so paths drawn for the old typeface cannot become the
 * repo's.
 */

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const WHERE = {
  device: 'Edited on this device',
  bundled: 'From the app',
  none: 'Not corrected yet — the guide is off for this letter',
};

export function buildTracesPage() {
  const root = el(`
    <div class="set-page set-traces">
      <div class="set-traces-bar">
        <span class="set-traces-count"></span>
        <span class="set-traces-where"></span>
        <button type="button" class="set-btn" data-act="export">Export…</button>
      </div>
      <div class="set-traces-editor"></div>
      <p class="set-note">
        Drawn against the app's current font. Swapping the font makes every path
        wrong, so the app throws them out and goes back to colouring in.
        Export and send the file over to have these built into the app for
        everybody.
      </p>
    </div>`);

  const countEl = root.querySelector('.set-traces-count');
  const whereEl = root.querySelector('.set-traces-where');
  const holder = root.querySelector('.set-traces-editor');

  if (!strokesMatchFont()) {
    holder.append(
      el(`<p class="set-note">
        The paths that shipped were drawn for a different font, so there is
        nothing here to correct until they are re-seeded.
      </p>`)
    );
    countEl.textContent = 'Unavailable';
    return { el: root, dispose() {} };
  }

  // The same set the editor keeps: a letter with no isolated outline has
  // nothing to trace.
  const known = letters.filter((letter) => letterGlyph(letter.id));

  /** `38 of 38 guided · 2 edited here` */
  async function tally() {
    const stored = await deviceStrokes();
    const guided = known.filter((l) => strokeSource(l.id) !== 'none').length;
    const mine = Object.keys(stored.letters).length;
    countEl.textContent =
      `${guided} of ${known.length} guided` + (mine ? ` · ${mine} edited here` : '');
  }

  const showWhere = (letterId) => {
    whereEl.textContent = WHERE[strokeSource(letterId)] ?? '';
  };

  const editor = buildStrokeEditor({
    glyphs: glyphSheet(),
    letters: known,
    initial: editableStrokes(),
    // The tracer that produced every path in the app, handed in so its knobs
    // can be turned here rather than only from a command line.
    skeletonise,
    seedDefaults: SEED_DEFAULTS,
    onLetter: showWhere,
    async save(letterId, strokes) {
      await saveLetter(letterId, strokes);
      // Straight into the running app as well as onto the disk, so the Write
      // screen has it without a reload.
      noteDeviceStrokes(letterId, strokes);
      showWhere(letterId);
      tally();
    },
    async revert(letterId) {
      await clearLetter(letterId);
      noteDeviceStrokes(letterId, null);
      showWhere(letterId);
      tally();
    },
  });

  holder.append(editor.el);
  tally();

  /**
   * Writes the device's letters out as a file.
   *
   * The same Blob and `<a download>` route the recorder's export uses. There is
   * no server to send it to and there never will be — the app makes no network
   * calls at runtime — so a file the person controls is the whole handover.
   */
  async function exportAll() {
    const stored = await deviceStrokes();
    if (Object.keys(stored.letters).length === 0) {
      whereEl.textContent = 'Nothing edited on this device yet.';
      return;
    }
    const blob = new Blob([JSON.stringify(exportShape(stored), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urdu-traces-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="export"]')) void exportAll();
  });

  return {
    el: root,
    dispose() {
      editor.dispose();
    },
  };
}
