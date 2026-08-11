/**
 * Recording studio client.
 *
 * Keyboard-first on purpose: 120 clips through a mouse is miserable, and the
 * whole point of this tool is making a full recording session feasible in one
 * or two sittings.
 *
 *   Space  record / stop      Enter  save and advance
 *   P      play back          R      redo
 *   ← →    move between clips
 */

const $ = (id) => document.getElementById(id);

const state = {
  clips: [],
  glyphs: null,
  index: 0,
  recorder: null,
  chunks: [],
  take: null, // {blob, url, ext} of an unsaved recording
  stream: null,
  analyser: null,
  meterRaf: 0,
};

// ---------------------------------------------------------------- rendering

/** Draws a baked glyph as inline SVG, exactly as the game renders it. */
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

// ---------------------------------------------------------------- recording

/** Picks a container the browser can actually produce. */
function pickMimeType() {
  const candidates = [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'm4a'],
    ['audio/ogg;codecs=opus', 'ogg'],
  ];
  for (const [mime, ext] of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: '', ext: 'webm' };
}

async function ensureStream() {
  if (state.stream) return state.stream;
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Keep the voice as recorded. Aggressive processing on a quiet room can
      // gate the start of a short syllable, which is exactly what these clips
      // are made of.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    },
  });

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(state.stream);
  state.analyser = ctx.createAnalyser();
  state.analyser.fftSize = 1024;
  source.connect(state.analyser);
  runMeter();
  return state.stream;
}

/** Live level, so it is obvious when the mic is dead or the take is clipping. */
function runMeter() {
  const data = new Uint8Array(state.analyser.fftSize);
  const tick = () => {
    state.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    const fill = $('meter-fill');
    fill.style.width = `${Math.min(100, peak * 140)}%`;
    fill.classList.toggle('hot', peak > 0.92);
    state.meterRaf = requestAnimationFrame(tick);
  };
  tick();
}

async function startRecording() {
  await ensureStream();
  const { mime, ext } = pickMimeType();
  state.chunks = [];
  state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
  state.recorder.ext = ext;
  state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
  state.recorder.onstop = () => {
    const blob = new Blob(state.chunks, { type: state.recorder.mimeType });
    if (state.take?.url) URL.revokeObjectURL(state.take.url);
    state.take = { blob, url: URL.createObjectURL(blob), ext: state.recorder.ext };
    setStatus(`${(blob.size / 1024).toFixed(1)} KB — P to check, Enter to save`);
    renderStage();
    playTake();
  };
  state.recorder.start();
  setStatus('Recording… Space to stop', 'recording');
  $('btn-record').classList.add('recording');
  $('btn-record').firstChild.textContent = 'Stop ';
}

function stopRecording() {
  state.recorder?.state === 'recording' && state.recorder.stop();
  $('btn-record').classList.remove('recording');
  $('btn-record').firstChild.textContent = 'Record ';
}

function toggleRecording() {
  if (state.recorder?.state === 'recording') stopRecording();
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
  // Advance to the next clip that still needs recording, so a second session
  // picks up where the first left off instead of stepping through done ones.
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
  stopRecording();
  discardTake();
  state.index = index;
  setStatus('Press Space to record');
  renderList();
  renderStage();
}

// ---------------------------------------------------------------- wiring

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

// Exposed so the Playwright check can drive a full record -> save cycle
// without depending on button positions.
window.__studio = { state, toggleRecording, saveTake, go };

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
