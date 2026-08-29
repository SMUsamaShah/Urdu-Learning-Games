/* Recording studio client. */

import { DEFAULT_PROFILE, MIC_PROFILES, createRecorder } from '/lib/recorder.js';
import { polishTake } from '/lib/take-polish.js';

const $ = (id) => document.getElementById(id);

const state = {
  clips: [],
  glyphs: null,
  index: 0,
  take: null, // {blob, url, ext} of an unsaved recording
};

/* Microphone handling is shared with the in-app recorder (src/lib/recorder.js). */
const recorder = createRecorder({
  onLevel: (peak) => {
    const fill = $('meter-fill');
    fill.style.width = `${Math.min(100, peak * 140)}%`;
    fill.classList.toggle('hot', peak > 0.92);
  },
});

/* Draws a baked glyph as inline SVG, exactly as the game renders it. */
function glyphSvg(glyph, height = 240) {
  if (!glyph || !glyph.d) return '';
  const [x, y, w, h] = glyph.bbox;
  const pad = 0.08 * Math.max(w, h);
  return `<svg viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"
    height="${height}" preserveAspectRatio="xMidYMid meet">
    <path d="${glyph.d}" fill="#eef2ff"/></svg>`;
}

function glyphFor(clip) {
  const g = state.glyphs;
  if (!g) return null;
  const { kind, id, form } = clip.glyph;
  if (kind === 'letter') return g.letters[id]?.[form];
  if (kind === 'name') return g.names[id];
  if (kind === 'word') return g.words[id];
  if (kind === 'number') return g.numbers[id];
  return null;
}

function renderList() {
  const list = $('clip-list');
  list.innerHTML = '';
  let group = null;

  state.clips.forEach((clip, i) => {
    if (clip.group !== group) {
      group = clip.group;
      const head = document.createElement('div');
      head.className = 'group-head';
      head.textContent = group;
      list.appendChild(head);
    }
    const row = document.createElement('div');
    row.className =
      'clip-row' + (clip.recorded ? ' done' : '') + (i === state.index ? ' current' : '');
    row.innerHTML = `<span class="dot"></span><span class="name">${clip.roman}</span>`;
    row.onclick = () => go(i);
    list.appendChild(row);
  });

  const done = state.clips.filter((c) => c.recorded).length;
  $('progress-text').textContent = `${done} of ${state.clips.length} recorded`;
  $('progress-bar').style.width = `${(done / state.clips.length) * 100}%`;

  list.querySelector('.clip-row.current')?.scrollIntoView({ block: 'nearest' });
}

function renderStage() {
  const clip = state.clips[state.index];
  $('group-label').textContent = clip.group;
  $('glyph').innerHTML = glyphSvg(glyphFor(clip));
  $('urdu-note').textContent = clip.recorded ? 'already recorded — R to redo' : '';
  $('say').textContent = clip.say;
  $('roman').textContent = clip.key;

  $('btn-play').disabled = !state.take && !clip.recorded;
  $('btn-save').disabled = !state.take;
  $('btn-redo').disabled = !state.take && !clip.recorded;
}

function setStatus(text, cls = '') {
  $('status').textContent = text;
  $('status').className = cls;
}

async function startRecording() {
  await recorder.start();
  setStatus('Recording… Space to stop', 'recording');
  $('btn-record').classList.add('recording');
  $('btn-record').firstChild.textContent = 'Stop ';
}

/* A context purely for tidying takes. */
let polishCtx = null;
function tidyContext() {
  if (!polishCtx) polishCtx = new (window.AudioContext || window.webkitAudioContext)();
  return polishCtx;
}

async function stopRecording() {
  const take = await recorder.stop();
  $('btn-record').classList.remove('recording');
  $('btn-record').firstChild.textContent = 'Record ';
  if (!take) return;

  let blob = take.blob;
  let note = '';
  if ($('tidy').checked) {
    setStatus('Tidying…');
    const polished = await polishTake(tidyContext(), take.blob, take.mime);
    if (polished) {
      blob = polished.blob;
      note = ` · trimmed ${(polished.removedMs / 1000).toFixed(1)}s`;
      if (polished.gain > 1.15) note += `, level +${polished.gain.toFixed(1)}×`;
    }
  }

  if (state.take?.url) URL.revokeObjectURL(state.take.url);
  state.take = { ...take, blob, url: URL.createObjectURL(blob) };
  setStatus(`${(blob.size / 1024).toFixed(1)} KB${note} — P to check, Enter to save`);
  renderStage();
  playTake();
}

function toggleRecording() {
  if (recorder.isRecording()) stopRecording();
  else startRecording().catch((e) => setStatus('Microphone error: ' + e.message));
}

function playTake() {
  const clip = state.clips[state.index];
  const src = state.take?.url || (clip.recorded ? '/' + clip.recorded : null);
  if (!src) return;
  new Audio(src).play().catch(() => {});
}

async function saveTake() {
  if (!state.take) return;
  const clip = state.clips[state.index];
  setStatus('Saving…');
  const res = await fetch(`/api/clip/${clip.slug}?ext=${state.take.ext}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: state.take.blob,
  });
  if (!res.ok) {
    setStatus('Save failed: ' + (await res.text()));
    return;
  }
  const { path } = await res.json();
  clip.recorded = path;
  discardTake();
  setStatus('Saved', 'saved');
  renderList();
  // Advance to the next clip that still needs recording.
  const next = state.clips.findIndex((c, i) => i > state.index && !c.recorded);
  go(next === -1 ? Math.min(state.index + 1, state.clips.length - 1) : next);
}

function discardTake() {
  if (state.take?.url) URL.revokeObjectURL(state.take.url);
  state.take = null;
}

async function redo() {
  const clip = state.clips[state.index];
  discardTake();
  if (clip.recorded) {
    await fetch(`/api/clip/${clip.slug}`, { method: 'DELETE' });
    clip.recorded = null;
    renderList();
  }
  setStatus('Cleared — Space to record');
  renderStage();
}

function go(index) {
  if (index < 0 || index >= state.clips.length) return;
  if (recorder.isRecording()) {
    // Abandon the take rather than saving it: moving on mid-record means the recording was a mistake.
    recorder.stop();
    $('btn-record').classList.remove('recording');
    $('btn-record').firstChild.textContent = 'Record ';
  }
  discardTake();
  state.index = index;
  setStatus('Press Space to record');
  renderList();
  renderStage();
}

$('btn-record').onclick = toggleRecording;
$('btn-play').onclick = playTake;
$('btn-save').onclick = saveTake;
$('btn-redo').onclick = redo;
$('btn-prev').onclick = () => go(state.index - 1);
$('btn-next').onclick = () => go(state.index + 1);

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const keys = {
    Space: toggleRecording,
    Enter: saveTake,
    KeyP: playTake,
    KeyR: redo,
    ArrowLeft: () => go(state.index - 1),
    ArrowRight: () => go(state.index + 1),
  };
  const handler = keys[e.code];
  if (handler) {
    e.preventDefault();
    handler();
  }
});

/* Pulls a zip exported from the app on a phone into the repo. */
async function importArchive(file) {
  if (!file) return;
  const status = $('import-status');
  status.textContent = 'Importing…';
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: file,
  });
  if (!res.ok) {
    status.textContent = 'Import failed: ' + (await res.text());
    return;
  }
  const { written, unknown } = await res.json();
  status.textContent =
    `Imported ${written.length}` +
    (unknown.length ? `, skipped ${unknown.length} unrecognised` : '') +
    '. Run `npm run audio:manifest`.';

  // Reflect the new files in the list without a reload.
  state.clips = (await (await fetch('/api/clips')).json()).clips;
  renderList();
  renderStage();
}

$('btn-import').onclick = () => $('import-file').click();
$('import-file').onchange = (e) => {
  importArchive(e.target.files?.[0]);
  e.target.value = '';
};

// Exposed so the Playwright check can drive a full record -> save cycle without depending on button positions.

const MIC_KEY = 'urdu:mic-profile';
const TIDY_KEY = 'urdu:tidy-takes';

function setupMicControls() {
  const select = $('mic-profile');
  let chosen = localStorage.getItem(MIC_KEY) ?? DEFAULT_PROFILE;
  if (!MIC_PROFILES[chosen]) chosen = DEFAULT_PROFILE;

  select.innerHTML = Object.entries(MIC_PROFILES)
    .map(([name, p]) => `<option value="${name}">${p.label}</option>`)
    .join('');
  select.value = chosen;
  $('mic-hint').textContent = MIC_PROFILES[chosen].hint;
  recorder.setProfile(chosen);

  select.onchange = () => {
    localStorage.setItem(MIC_KEY, select.value);
    $('mic-hint').textContent = MIC_PROFILES[select.value].hint;
    recorder.setProfile(select.value);
  };

  $('tidy').checked = localStorage.getItem(TIDY_KEY) !== '0';
  $('tidy').onchange = () =>
    localStorage.setItem(TIDY_KEY, $('tidy').checked ? '1' : '0');
}

setupMicControls();

window.__studio = { state, toggleRecording, saveTake, go, importArchive };

(async function init() {
  const [clipsRes, glyphsRes] = await Promise.all([
    fetch('/api/clips'),
    fetch('/glyphs.json'),
  ]);
  state.clips = (await clipsRes.json()).clips;
  state.glyphs = await glyphsRes.json();

  const firstTodo = state.clips.findIndex((c) => !c.recorded);
  state.index = firstTodo === -1 ? 0 : firstTodo;

  renderList();
  renderStage();
  setStatus('Press Space to record');
})();
