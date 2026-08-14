/**
 * The tracing studio, which is now a shell around the shared editor.
 *
 * All the editing — the SVG board in font units, the handles, the stroke list,
 * playback — lives in src/ui/stroke-editor.js and is served here over `/lib/`.
 * The same module runs inside the app's settings screen, exactly as
 * src/lib/recorder.js runs in both the recording studio and the in-app
 * recorder. Two copies of an editor is two editors, and they drift.
 *
 * What is left here is the half that is genuinely different: this one reads and
 * writes content/strokes.json in the repo over HTTP, and the app writes to the
 * device.
 */

import { buildStrokeEditor } from '/lib/stroke-editor.js';

const holder = document.getElementById('editor');
const count = document.getElementById('count');

const [glyphs, letterFile, manifest] = await Promise.all([
  fetch('/glyphs.json').then((r) => r.json()),
  fetch('/letters.json').then((r) => r.json()),
  fetch('/api/strokes').then((r) => r.json()),
]);

const tally = () => {
  const letters = Object.values(manifest.letters ?? {});
  const done = letters.filter((letter) => letter.corrected).length;
  count.textContent = `${done} of ${letters.length} corrected`;
};

const editor = buildStrokeEditor({
  glyphs,
  letters: letterFile.letters,
  initial: manifest.letters,
  async save(letterId, strokes) {
    const response = await fetch(`/api/strokes/${encodeURIComponent(letterId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strokes }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `server said ${response.status}`);
    }
    manifest.letters[letterId] = { strokes, corrected: true };
    tally();
  },
});

holder.append(editor.el);
tally();

// A save writes a file; leaving with unsaved edits loses work that took real
// effort to draw.
window.addEventListener('beforeunload', (event) => {
  if (!editor.isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});
