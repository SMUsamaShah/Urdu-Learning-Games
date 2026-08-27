/* The tracing studio, which is now a shell around the shared editor. */

import { buildStrokeEditor } from '/lib/stroke-editor.js';
import { SEED_DEFAULTS, skeletonise } from '/lib/skeletonise.js';

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
  skeletonise,
  seedDefaults: SEED_DEFAULTS,
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

/* Takes the file the tablet exported and merges it into the repo. */
const file = document.getElementById('import-file');
document.getElementById('btn-import').addEventListener('click', () => file.click());
file.addEventListener('change', async () => {
  const chosen = file.files?.[0];
  if (!chosen) return;
  count.textContent = 'Importing…';
  const response = await fetch('/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await chosen.text(),
  });
  const body = await response.json().catch(() => ({}));
  file.value = '';
  if (!response.ok) {
    count.textContent = body.error ?? `import failed (${response.status})`;
    count.dataset.bad = 'true';
    return;
  }
  count.textContent = `Imported ${body.merged.length} letter(s) — reloading…`;
  setTimeout(() => window.location.reload(), 900);
});

// A save writes a file; leaving with unsaved edits loses work that took real effort to draw.
window.addEventListener('beforeunload', (event) => {
  if (!editor.isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});
