/**
 * The recording studio: record the app's voice, and move recordings around.
 *
 * Recordings live on this device (see clip-store.js) and override whatever the
 * app shipped with, so a child hears their own parent. They leave the device
 * only as an explicit export.
 *
 * ## A page, not a screen
 *
 * This builds a detached element and hands it back. It used to mount its own
 * full-screen overlay and carry the app's settings along the top of it, which
 * is how a tune picker and a frame-rate checkbox ended up sitting above a list
 * of a hundred and twenty clips. The settings screen owns the chrome now — see
 * src/ui/settings.js — and this owns recording and nothing else.
 *
 * Its own toolbar keeps only what is about recordings: export and import. They
 * are not general settings; they are what you do with the clips in the list
 * below them.
 *
 * Deliberately plain DOM over the Phaser canvas: a scrolling list of 120 rows, a
 * file picker and a download are all free here and laborious on a canvas, and
 * this screen is for the adult, not the child.
 *
 * The microphone needs a secure context. That means localhost or HTTPS — the
 * deployed site qualifies, a http://192.168.x.x dev server does not, and the
 * mic will simply never open there.
 */

import './recorder.css';
import { letters, numbers, words, glyphForClip } from '../lib/content.js';
import { expectedClips } from '../lib/clip-list.js';
import {
  DEFAULT_PROFILE,
  MIC_PROFILES,
  createRecorder,
  isRecordingSupported,
} from '../lib/recorder.js';
import { polishTake } from '../lib/take-polish.js';
import { buildArchive, readArchive } from '../lib/clip-archive.js';
import * as store from '../lib/clip-store.js';
import {
  getAudioContext,
  hasClip,
  noteDeviceClip,
  play,
  refreshAudio,
  stopAll,
} from '../lib/audio.js';

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

/** Draws a baked outline as inline SVG, the same shapes the game renders. */
function glyphSvg(glyph, color = '#2b3047') {
  if (!glyph?.d) return '';
  const [x, y, w, h] = glyph.bbox;
  const pad = Math.max(w, h) * 0.06;
  return `<svg viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"
    xmlns="http://www.w3.org/2000/svg"><path d="${glyph.d}" fill="${color}"/></svg>`;
}

const formatBytes = (n) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

const formatDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return 'unknown length';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${String(Math.round(rest)).padStart(2, '0')}`
    : `${rest.toFixed(1)}s`;
};

const selectionLength = (selection) =>
  selection ? Math.max(0, selection.end - selection.start) : 0;

function emptyAnalysis() {
  return { key: null, buffer: null, blob: null, mime: '', ext: '', selection: null, playhead: null };
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function encodeWavBuffer(buffer) {
  // Waveform edits need sample-accurate boundaries. MediaRecorder can miss a
  // little audio while its encoder spins up, which is most visible when keeping
  // the start of a clip and deleting the right-hand tail. WAV is larger, but
  // deterministic, instant, and still small enough for these one-word takes.
  const channels = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = buffer.length * blockAlign;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(bytes);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Builds the recording page.
 *
 * @returns {{el: HTMLElement, dispose: () => void}} the page, and what to call
 *   when it is taken off screen — which must happen, because this holds a
 *   microphone and a keyboard listener.
 */
export function buildRecorderPage() {
  const clips = expectedClips({ letters, numbers, words });
  const bySlug = new Map(clips.map((c) => [c.slug, c]));
  /** What the tidy-up did to the last take, shown under the buttons. */
  let lastNote = '';
  /** @type {Map<string, {bytes:number, recordedAt:number}>} */
  let device = new Map();
  let index = 0;
  let busy = false;
  let analysisRequest = 0;
  let analysisState = emptyAnalysis();

  // Remembered across visits: choosing microphone settings and having them
  // reset every time you come back would make comparing two takes impossible.
  let micProfile = localStorage.getItem('urdu:mic-profile') ?? DEFAULT_PROFILE;
  if (!MIC_PROFILES[micProfile]) micProfile = DEFAULT_PROFILE;
  // On unless explicitly turned off. Trimming is what makes a name and a word
  // recorded minutes apart play back as one phrase rather than two.
  let tidy = localStorage.getItem('urdu:tidy-takes') !== '0';
  let playback = localStorage.getItem('urdu:playback-after-take') !== '0';

  const recorder = isRecordingSupported()
    ? createRecorder({
        onLevel: (peak) => setMeter(peak),
        // The app's context, so the page never holds two.
        audioContext: getAudioContext(),
        profile: micProfile,
      })
    : null;

  // ------------------------------------------------------------- structure

  const root = el(`
    <div class="rec-root">
      <div class="rec-head">
        <span class="rec-progress"></span>
        <span class="rec-head-spacer"></span>
        <label class="rec-check">
          <input type="checkbox" data-act="playback" ${playback ? 'checked' : ''} />
          <span>Play it back</span>
        </label>
        <button type="button" class="rec-btn" data-act="export">Export…</button>
        <button type="button" class="rec-btn" data-act="import">Import…</button>
      </div>
      <div class="rec-status"></div>
      <div class="rec-body">
        <div class="rec-list" role="listbox" tabindex="0"></div>
        <div class="rec-stage"></div>
      </div>
      <input type="file" accept=".zip,application/zip" hidden />
    </div>`);

  const listEl = root.querySelector('.rec-list');
  const stageEl = root.querySelector('.rec-stage');
  const statusEl = root.querySelector('.rec-status');
  const progressEl = root.querySelector('.rec-progress');
  const fileInput = root.querySelector('input[type=file]');

  // ------------------------------------------------------------- rendering

  function setMeter(peak) {
    const fill = stageEl.querySelector('.rec-meter-fill');
    if (!fill) return;
    fill.style.width = `${Math.min(100, peak * 140)}%`;
    fill.classList.toggle('hot', peak > 0.92);
  }

  function statusFor(clip) {
    if (device.has(clip.key)) return 'device';
    if (hasClip(clip.key)) return 'bundled';
    return 'missing';
  }

  function renderList() {
    const parts = [];
    let group = null;
    for (const [i, clip] of clips.entries()) {
      if (clip.group !== group) {
        group = clip.group;
        parts.push(`<div class="rec-group">${escapeHtml(group)}</div>`);
      }
      const state = statusFor(clip);
      const recording = Boolean(recorder?.isRecording());
      const badge =
        state === 'device'
          ? '<span class="rec-badge device">yours</span>'
          : state === 'bundled'
            ? '<span class="rec-badge bundled">built in</span>'
            : '<span class="rec-badge">none</span>';
      parts.push(`
        <div class="rec-row" role="option" data-i="${i}" aria-selected="${i === index}" aria-disabled="${recording}">
          <span class="rec-row-glyph">${glyphSvg(glyphForClip(clip.glyph))}</span>
          <span class="rec-row-label">${escapeHtml(clip.roman)}
            <span class="rec-row-sub">${escapeHtml(clip.group.replace(/s$/, ''))}</span>
          </span>
          ${badge}
          <span class="rec-row-actions">
            <button type="button" class="rec-btn icon" data-play="${i}"
              ${state === 'missing' || recording ? 'disabled' : ''}>Play</button>
            <button type="button" class="rec-btn icon" data-del="${i}"
              ${state === 'device' && !recording ? '' : 'disabled'}>Delete</button>
          </span>
        </div>`);
    }
    listEl.innerHTML = parts.join('');
    listEl.classList.toggle('recording', Boolean(recorder?.isRecording()));
    listEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function renderStage() {
    const clip = clips[index];
    const recording = recorder?.isRecording();
    const mine = device.get(clip.key);

    stageEl.innerHTML = `
      <div class="rec-stage-glyph">${glyphSvg(glyphForClip(clip.glyph), '#e98a1f')}</div>
      <div class="rec-say">${escapeHtml(clip.say)}</div>
      <div class="rec-meter"><div class="rec-meter-fill"></div></div>
      <div class="rec-actions">
        <button type="button" class="rec-btn primary ${recording ? 'recording' : ''}"
          data-act="record" ${recorder ? '' : 'disabled'}>
          ${recording ? 'Stop' : mine ? 'Record again' : 'Record'}
        </button>
        <button type="button" class="rec-btn" data-act="play"
          ${statusFor(clip) === 'missing' || recording ? 'disabled' : ''}>Play</button>
        <button type="button" class="rec-btn" data-act="prev" ${recording ? 'disabled' : ''}>←</button>
        <button type="button" class="rec-btn" data-act="next" ${recording ? 'disabled' : ''}>→</button>
      </div>
      ${
        recorder
          ? `<label class="rec-mic">
               <span>Microphone</span>
               <select data-act="profile">
                 ${Object.entries(MIC_PROFILES)
                   .map(
                     ([name, p]) =>
                       `<option value="${name}" ${name === micProfile ? 'selected' : ''}>${escapeHtml(
                         p.label
                       )}</option>`
                   )
                   .join('')}
               </select>
               <em>${escapeHtml(MIC_PROFILES[micProfile].hint)}</em>
             </label>
             <label class="rec-toggle rec-tidy">
               <input type="checkbox" data-act="tidy" ${tidy ? 'checked' : ''} />
               Trim silence, reduce hiss, even the level
             </label>`
          : ''
      }
      <p class="rec-hint">
        ${
          recorder
            ? 'Space records and stops · P plays · arrows move'
            : 'This browser will not record here. The microphone needs https:// or localhost.'
        }
      </p>
      ${lastNote ? `<p class="rec-hint">${escapeHtml(lastNote)}</p>` : ''}
      ${
        mine
          ? `<div class="rec-analysis" aria-live="polite">
              <div class="rec-analysis-head">
                <strong>Your recording</strong>
                <span>${formatBytes(mine.bytes)}${
                  formatDate(mine.recordedAt) ? ` · ${formatDate(mine.recordedAt)}` : ''
                }</span>
              </div>
              <canvas class="rec-wave" width="640" height="180"></canvas>
              <div class="rec-analysis-actions">
                <button type="button" class="rec-btn icon" data-analysis="play" disabled>Play selection</button>
                <button type="button" class="rec-btn icon" data-analysis="delete" disabled>Delete selection</button>
                <button type="button" class="rec-btn icon" data-analysis="pick" disabled>Pick selection</button>
              </div>
              <p class="rec-hint rec-analysis-note">Reading audio…</p>
            </div>`
          : ''
      }`;
    void renderAnalysis(clip);
  }

  async function renderAnalysis(clip) {
    stopAnalysisPlayback();
    analysisState = emptyAnalysis();
    const request = ++analysisRequest;
    const panel = stageEl.querySelector('.rec-analysis');
    if (!panel || !device.has(clip.key)) return;
    const note = panel.querySelector('.rec-analysis-note');
    const canvas = panel.querySelector('.rec-wave');
    try {
      const record = await store.getClip(clip.key);
      if (request !== analysisRequest || !record?.blob || !canvas) return;
      const buffer = await getAudioContext().decodeAudioData(await record.blob.arrayBuffer());
      if (request !== analysisRequest) return;
      analysisState = {
        key: clip.key,
        buffer,
        blob: record.blob,
        mime: record.mime,
        ext: record.ext,
        selection: null,
        playhead: null,
      };
      drawAnalysis();
      note.textContent = `Length: ${formatDuration(buffer.duration)} · drag on the waveform to select.`;
      updateAnalysisButtons();
    } catch (error) {
      if (request === analysisRequest && note) {
        note.textContent = `Could not read waveform: ${error.message}`;
      }
    }
  }

  function drawAnalysis() {
    const canvas = stageEl.querySelector('.rec-wave');
    if (!canvas || !analysisState.buffer) return;
    drawWaveform(canvas, analysisState.buffer, {
      selection: analysisState.selection,
      playhead: analysisState.playhead,
    });
  }

  function drawWaveform(canvas, buffer, { selection = null, playhead = null } = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const channel = buffer.getChannelData(0);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff8ee';
    ctx.fillRect(0, 0, width, height);

    if (selectionLength(selection) > 0) {
      const x1 = (selection.start / buffer.duration) * width;
      const x2 = (selection.end / buffer.duration) * width;
      ctx.fillStyle = 'rgba(47, 174, 116, 0.20)';
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    }

    ctx.strokeStyle = 'rgba(43, 48, 71, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.strokeStyle = '#e98a1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      const start = Math.floor((x / width) * channel.length);
      const end = Math.max(start + 1, Math.floor(((x + 1) / width) * channel.length));
      let min = 1;
      let max = -1;
      for (let i = start; i < end; i += 1) {
        const sample = channel[i] || 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      ctx.moveTo(x, ((1 - max) * height) / 2);
      ctx.lineTo(x, ((1 - min) * height) / 2);
    }
    ctx.stroke();

    if (Number.isFinite(playhead)) {
      const x = Math.max(0, Math.min(width, (playhead / buffer.duration) * width));
      ctx.strokeStyle = '#2b3047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  function updateAnalysisButtons() {
    const panel = stageEl.querySelector('.rec-analysis');
    if (!panel) return;
    const hasSelection = selectionLength(analysisState.selection) > 0.03;
    for (const button of panel.querySelectorAll('[data-analysis]')) {
      button.disabled = !hasSelection || recorder?.isRecording() || busy;
    }
    const note = panel.querySelector('.rec-analysis-note');
    if (note && analysisState.buffer) {
      const picked = hasSelection
        ? ` · selection ${formatDuration(selectionLength(analysisState.selection))}`
        : '';
      note.textContent = `Length: ${formatDuration(analysisState.buffer.duration)}${picked} · drag on the waveform to select.`;
    }
  }

  function timeFromCanvas(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    return (x / rect.width) * analysisState.buffer.duration;
  }

  function setSelection(start, end) {
    if (!analysisState.buffer) return;
    const a = Math.max(0, Math.min(analysisState.buffer.duration, start));
    const b = Math.max(0, Math.min(analysisState.buffer.duration, end));
    analysisState.selection = { start: Math.min(a, b), end: Math.max(a, b) };
    drawAnalysis();
    updateAnalysisButtons();
  }

  function stopAnalysisPlayback() {
    if (analysisState.source) {
      try {
        analysisState.source.stop();
      } catch {
        /* already ended */
      }
    }
    if (analysisState.frame) cancelAnimationFrame(analysisState.frame);
    analysisState.source = null;
    analysisState.frame = 0;
    analysisState.playhead = null;
  }

  async function playSelection() {
    const ctx = getAudioContext();
    if (!ctx || !analysisState.buffer || selectionLength(analysisState.selection) <= 0.03) return;
    stopAll();
    stopAnalysisPlayback();
    if (ctx.state === 'suspended') await ctx.resume();
    const { start, end } = analysisState.selection;
    const source = ctx.createBufferSource();
    source.buffer = analysisState.buffer;
    source.connect(ctx.destination);
    const startedAt = ctx.currentTime;
    const duration = end - start;
    analysisState.source = source;
    source.onended = () => {
      if (analysisState.source !== source) return;
      stopAnalysisPlayback();
      drawAnalysis();
    };
    const tick = () => {
      const elapsed = ctx.currentTime - startedAt;
      analysisState.playhead = Math.min(end, start + elapsed);
      drawAnalysis();
      if (elapsed < duration) analysisState.frame = requestAnimationFrame(tick);
    };
    tick();
    source.start(0, start, duration);
  }

  function sliceBuffer(ctx, buffer, startSeconds, endSeconds) {
    const rate = buffer.sampleRate;
    const start = Math.max(0, Math.min(buffer.length, Math.round(startSeconds * rate)));
    const end = Math.max(start, Math.min(buffer.length, Math.round(endSeconds * rate)));
    const out = ctx.createBuffer(buffer.numberOfChannels, end - start, rate);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      out.copyToChannel(buffer.getChannelData(c).slice(start, end), c);
    }
    return out;
  }

  function deleteFromBuffer(ctx, buffer, selection) {
    const rate = buffer.sampleRate;
    const start = Math.max(0, Math.min(buffer.length, Math.round(selection.start * rate)));
    const end = Math.max(start, Math.min(buffer.length, Math.round(selection.end * rate)));
    const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length - (end - start), rate);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const input = buffer.getChannelData(c);
      const output = out.getChannelData(c);
      output.set(input.slice(0, start), 0);
      output.set(input.slice(end), start);
    }
    return out;
  }

  async function editSelection(mode) {
    const ctx = getAudioContext();
    if (busy || !ctx || !analysisState.buffer || selectionLength(analysisState.selection) <= 0.03) return;
    const clip = clips[index];
    const note = stageEl.querySelector('.rec-analysis-note');
    busy = true;
    stopAnalysisPlayback();
    updateAnalysisButtons();
    try {
      const edited =
        mode === 'pick'
          ? sliceBuffer(ctx, analysisState.buffer, analysisState.selection.start, analysisState.selection.end)
          : deleteFromBuffer(ctx, analysisState.buffer, analysisState.selection);
      if (edited.duration <= 0.03) {
        if (note) note.textContent = 'Selection would leave an empty recording.';
        return;
      }
      if (note) note.textContent = 'Saving edit…';
      const blob = encodeWavBuffer(edited);
      if (!blob?.size) throw new Error('browser could not encode the edited audio');
      await store.putClip({
        key: clip.key,
        slug: clip.slug,
        ext: 'wav',
        mime: blob.type,
        blob,
        profile: recorder?.profile(),
      });
      noteDeviceClip(clip.key, true);
      lastNote = mode === 'pick' ? 'Kept the selected audio.' : 'Deleted the selected audio.';
      await refresh();
    } catch (error) {
      if (note) note.textContent = `Could not save edit: ${error.message}`;
    } finally {
      busy = false;
      updateAnalysisButtons();
    }
  }

  async function renderStatus() {
    const s = await store.storageStatus();
    const bits = [];
    bits.push(
      `<span><strong>${s.count}</strong> recorded here${
        s.bytes ? `, ${formatBytes(s.bytes)}` : ''
      }</span>`
    );

    if (s.count > 0 && !s.persisted) {
      // The honest version of "stored on your device": Safari drops it after a
      // week unless installed, and any browser can evict under pressure.
      bits.push(
        `<span class="rec-warn">Not protected from being cleared${
          s.installed ? '' : ' — add the app to your home screen'
        }. Export to keep a copy.</span>`
      );
    } else if (s.persisted) {
      bits.push('<span>Storage is protected on this device.</span>');
    }

    if (s.unexported > 0 && s.count > 0) {
      bits.push(
        `<span class="rec-warn">${s.unexported} not yet exported${
          s.lastExportedAt ? ` (last export ${formatDate(s.lastExportedAt)})` : ''
        }.</span>`
      );
    }

    statusEl.innerHTML = bits.join('');
    progressEl.textContent = `${device.size} of ${clips.length}`;
  }

  async function refresh({ list = true } = {}) {
    device = new Map(
      (await store.summaries()).map((c) => [c.key, c])
    );
    if (list) renderList();
    renderStage();
    await renderStatus();
  }

  // -------------------------------------------------------------- actions

  function select(i) {
    if (recorder?.isRecording()) return;
    lastNote = '';
    index = Math.max(0, Math.min(clips.length - 1, i));
    for (const row of listEl.querySelectorAll('.rec-row')) {
      row.setAttribute('aria-selected', String(Number(row.dataset.i) === index));
    }
    listEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    renderStage();
  }

  async function toggleRecord() {
    if (!recorder || busy) return;
    if (recorder.isRecording()) {
      const take = await recorder.stop();
      renderList();
      renderStage();
      if (!take || take.blob.size === 0) return;

      const clip = clips[index];

      // Trim silence, soften room hiss and bring the level up. Returns null if it
      // could not usefully do that, in which case the take is kept exactly as recorded:
      // a slightly long clip is a small problem, a lost one is the parent's
      // voice gone.
      let blob = take.blob;
      let note = '';
      if (tidy) {
        stageEl.querySelector('.rec-hint').textContent = 'Tidying…';
        const polished = await polishTake(getAudioContext(), take.blob, take.mime);
        if (polished) {
          blob = polished.blob;
          note = `trimmed ${(polished.removedMs / 1000).toFixed(1)}s`;
          if (polished.noiseReductionDb) note += `, hiss −${polished.noiseReductionDb} dB`;
          if (polished.gain > 1.15) note += `, level +${polished.gain.toFixed(1)}×`;
        }
      }

      await store.putClip({
        key: clip.key,
        slug: clip.slug,
        ext: take.ext,
        mime: take.mime,
        blob,
        profile: recorder.profile(),
      });
      lastNote = note;
      // Tell playback the device now has this clip, and drop the decoded copy
      // of whatever it was playing before, or the old take keeps coming out.
      noteDeviceClip(clip.key, true);
      await refresh();
      // Hearing the take back is the right default — it is how you find out
      // the mic was pointing the wrong way — but it doubles the time each clip
      // takes, and somebody working through a hundred and twenty of them knows
      // by then whether the mic is working. The box is beside Export and
      // Import, because it is a decision made once at the start of a sitting.
      if (playback) await play(clip.key);
    } else {
      stopAll();
      try {
        await recorder.start();
      } catch (error) {
        stageEl.querySelector('.rec-hint').textContent =
          'Microphone unavailable: ' + error.message;
        return;
      }
      renderList();
      renderStage();
    }
  }

  async function remove(i) {
    const clip = clips[i];
    if (!device.has(clip.key)) return;
    await store.deleteClip(clip.key);
    noteDeviceClip(clip.key, false);
    await refresh();
  }

  async function exportAll() {
    if (busy) return;
    const all = await store.allClips();
    if (all.length === 0) {
      statusEl.innerHTML = '<span class="rec-warn">Nothing recorded on this device yet.</span>';
      return;
    }
    busy = true;
    try {
      const archive = await buildArchive(
        all.map((c) => ({
          key: c.key,
          slug: c.slug ?? bySlug.get(c.slug)?.slug ?? c.key.replace(/\//g, '-'),
          ext: c.ext,
          blob: c.blob,
          recordedAt: c.recordedAt,
        }))
      );
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(archive);
      const a = document.createElement('a');
      a.href = url;
      a.download = `urdu-recordings-${stamp}.zip`;
      a.click();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      await store.setLastExport();
      await renderStatus();
    } finally {
      busy = false;
    }
  }

  async function importFrom(file) {
    if (!file || busy) return;
    busy = true;
    statusEl.innerHTML = '<span>Reading archive…</span>';
    try {
      const { clips: incoming, unknown } = await readArchive(file, (slug) =>
        bySlug.get(slug)?.key ?? null
      );
      for (const clip of incoming) {
        await store.putClip({
          key: clip.key,
          slug: clip.slug,
          ext: clip.ext,
          blob: clip.blob,
          recordedAt: clip.recordedAt ?? Date.now(),
        });
        noteDeviceClip(clip.key, true);
      }
      await refresh();
      const notes = [`Imported ${incoming.length} recording${incoming.length === 1 ? '' : 's'}.`];
      if (unknown.length) {
        notes.push(
          `<span class="rec-warn">Skipped ${unknown.length} unrecognised file${
            unknown.length === 1 ? '' : 's'
          }: ${escapeHtml(unknown.slice(0, 3).join(', '))}${unknown.length > 3 ? '…' : ''}</span>`
        );
      }
      statusEl.innerHTML = notes.map((n) => `<span>${n}</span>`).join('');
    } catch (error) {
      statusEl.innerHTML = `<span class="rec-warn">Could not read that file: ${escapeHtml(
        error.message
      )}</span>`;
    } finally {
      busy = false;
    }
  }

  // --------------------------------------------------------------- events

  root.addEventListener('click', async (event) => {
    const target = event.target.closest(
      '[data-act], [data-play], [data-del], [data-analysis], .rec-row'
    );
    if (!target) return;

    if (target.dataset.analysis) {
      event.stopPropagation();
      if (target.dataset.analysis === 'play') return void playSelection();
      return void editSelection(target.dataset.analysis);
    }

    if (target.dataset.play !== undefined) {
      event.stopPropagation();
      if (recorder?.isRecording()) return;
      select(Number(target.dataset.play));
      return void play(clips[index].key);
    }
    if (target.dataset.del !== undefined) {
      event.stopPropagation();
      if (recorder?.isRecording()) return;
      return void remove(Number(target.dataset.del));
    }

    switch (target.dataset.act) {
      case 'record':
        return void toggleRecord();
      case 'play':
        if (recorder?.isRecording()) return;
        stopAnalysisPlayback();
        return void play(clips[index].key);
      case 'prev':
        return select(index - 1);
      case 'next':
        return select(index + 1);
      case 'export':
        return void exportAll();
      case 'import':
        return fileInput.click();
      default:
        if (target.classList.contains('rec-row')) select(Number(target.dataset.i));
    }
  });


  stageEl.addEventListener('pointerdown', (event) => {
    const canvas = event.target.closest('.rec-wave');
    if (!canvas || !analysisState.buffer || recorder?.isRecording() || busy) return;
    event.preventDefault();
    stopAnalysisPlayback();
    const start = timeFromCanvas(event, canvas);
    setSelection(start, start);
    canvas.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => setSelection(start, timeFromCanvas(moveEvent, canvas));
    const up = (upEvent) => {
      setSelection(start, timeFromCanvas(upEvent, canvas));
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });

  // Changing microphone settings drops the open stream, so the next take
  // reopens with them. See setProfile() for why it is not reconfigured live.
  root.addEventListener('change', (event) => {
    if (event.target.dataset?.act === 'tidy') {
      tidy = event.target.checked;
      localStorage.setItem('urdu:tidy-takes', tidy ? '1' : '0');
      return;
    }
    if (event.target.dataset?.act === 'playback') {
      playback = event.target.checked;
      localStorage.setItem('urdu:playback-after-take', playback ? '1' : '0');
      return;
    }
    if (event.target.dataset?.act !== 'profile') return;
    micProfile = event.target.value;
    localStorage.setItem('urdu:mic-profile', micProfile);
    recorder?.setProfile(micProfile);
    renderStage();
  });

  fileInput.addEventListener('change', () => {
    importFrom(fileInput.files?.[0]);
    fileInput.value = '';
  });

  function onKey(event) {
    // Never steal keys from the arithmetic gate or a file dialog.
    if (event.target.tagName === 'INPUT') return;
    const keys = {
      ' ': () => toggleRecord(),
      p: () => { if (!recorder?.isRecording()) play(clips[index].key); },
      P: () => { if (!recorder?.isRecording()) play(clips[index].key); },
      ArrowDown: () => select(index + 1),
      ArrowUp: () => select(index - 1),
      ArrowRight: () => select(index + 1),
      ArrowLeft: () => select(index - 1),
    };
    const handler = keys[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  let disposed = false;
  /**
   * Hands the microphone back and stops listening for keys.
   *
   * Must be called when this page leaves the screen — which is the whole reason
   * the page is returned with a teardown rather than just an element. A
   * microphone left open moves a phone's audio path into its communications
   * profile, and everything played afterwards stutters.
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('keydown', onKey);
    recorder?.dispose();
    stopAll();
    // The mic has just been handed back. Anything decoded while it was open may
    // have been decoded against a different device profile, so start the game
    // again from clean buffers rather than from whatever the recorder left.
    refreshAudio();
  }

  document.addEventListener('keydown', onKey);
  refresh();
  // Deliberately no warm-up here. The mic opens when a take starts and is
  // handed back shortly after, so it is never held open while the parent is
  // listening back — which is exactly when an open mic makes playback stutter.

  return { el: root, dispose };
}
