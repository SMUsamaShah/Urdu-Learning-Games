/**
 * The grown-ups screen: record the app's voice, and move recordings around.
 *
 * Recordings live on this device (see clip-store.js) and override whatever the
 * app shipped with, so a child hears their own parent. They leave the device
 * only as an explicit export.
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
import { setShowFps, showFps } from '../lib/fps.js';
import { checkForUpdate } from '../lib/updates.js';
import { polishTake } from '../lib/take-polish.js';
import { buildSoundCheck } from './audio-check.js';
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

/**
 * Opens the recorder. Returns a function that closes it.
 * @param {{onClose?: () => void}} [options]
 */
export function openRecorder({ onClose } = {}) {
  const clips = expectedClips({ letters, numbers, words });
  const bySlug = new Map(clips.map((c) => [c.slug, c]));
  /** What the tidy-up did to the last take, shown under the buttons. */
  let lastNote = '';
  const byKey = new Map(clips.map((c) => [c.key, c]));
  /** @type {Map<string, {bytes:number, recordedAt:number}>} */
  let device = new Map();
  let index = 0;
  let busy = false;

  // Remembered across visits: choosing microphone settings and having them
  // reset every time you come back would make comparing two takes impossible.
  let micProfile = localStorage.getItem('urdu:mic-profile') ?? DEFAULT_PROFILE;
  if (!MIC_PROFILES[micProfile]) micProfile = DEFAULT_PROFILE;
  // On unless explicitly turned off. Trimming is what makes a name and a word
  // recorded minutes apart play back as one phrase rather than two.
  let tidy = localStorage.getItem('urdu:tidy-takes') !== '0';

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
    <div class="rec-root" role="dialog" aria-modal="true" aria-label="Recordings">
      <div class="rec-head">
        <h2 class="rec-title">Recordings</h2>
        <span class="rec-progress"></span>
        <span class="rec-head-spacer"></span>
        <label class="rec-toggle">
          <input type="checkbox" data-act="fps" ${showFps() ? 'checked' : ''} />
          Frame rate
        </label>
        <button type="button" class="rec-btn" data-act="check">Sound check</button>
        <button type="button" class="rec-btn" data-act="update">Check for update</button>
        <button type="button" class="rec-btn" data-act="export">Export…</button>
        <button type="button" class="rec-btn" data-act="import">Import…</button>
        <button type="button" class="rec-btn" data-act="close">Done</button>
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
      const badge =
        state === 'device'
          ? '<span class="rec-badge device">yours</span>'
          : state === 'bundled'
            ? '<span class="rec-badge bundled">built in</span>'
            : '<span class="rec-badge">none</span>';
      parts.push(`
        <div class="rec-row" role="option" data-i="${i}" aria-selected="${i === index}">
          <span class="rec-row-glyph">${glyphSvg(glyphForClip(clip.glyph))}</span>
          <span class="rec-row-label">${escapeHtml(clip.roman)}
            <span class="rec-row-sub">${escapeHtml(clip.group.replace(/s$/, ''))}</span>
          </span>
          ${badge}
          <span class="rec-row-actions">
            <button type="button" class="rec-btn icon" data-play="${i}"
              ${state === 'missing' ? 'disabled' : ''}>Play</button>
            <button type="button" class="rec-btn icon" data-del="${i}"
              ${state === 'device' ? '' : 'disabled'}>Delete</button>
          </span>
        </div>`);
    }
    listEl.innerHTML = parts.join('');
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
          ${statusFor(clip) === 'missing' ? 'disabled' : ''}>Play</button>
        <button type="button" class="rec-btn" data-act="prev">←</button>
        <button type="button" class="rec-btn" data-act="next">→</button>
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
               Trim silence and even the level
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
          ? `<p class="rec-hint">Yours: ${formatBytes(mine.bytes)}${
              formatDate(mine.recordedAt) ? `, ${formatDate(mine.recordedAt)}` : ''
            }</p>`
          : ''
      }`;
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
      renderStage();
      if (!take || take.blob.size === 0) return;

      const clip = clips[index];

      // Trim the silence and bring the level up. Returns null if it could not
      // usefully do either, in which case the take is kept exactly as recorded:
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
      await play(clip.key);
      // Recording is a long sitting; step on so the next one is ready.
      if (index < clips.length - 1) select(index + 1);
    } else {
      stopAll();
      try {
        await recorder.start();
      } catch (error) {
        stageEl.querySelector('.rec-hint').textContent =
          'Microphone unavailable: ' + error.message;
        return;
      }
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
    const target = event.target.closest('[data-act], [data-play], [data-del], .rec-row');
    if (!target) return;

    if (target.dataset.play !== undefined) {
      event.stopPropagation();
      select(Number(target.dataset.play));
      return void play(clips[index].key);
    }
    if (target.dataset.del !== undefined) {
      event.stopPropagation();
      return void remove(Number(target.dataset.del));
    }

    switch (target.dataset.act) {
      case 'close':
        return close();
      case 'record':
        return void toggleRecord();
      case 'play':
        return void play(clips[index].key);
      case 'prev':
        return select(index - 1);
      case 'next':
        return select(index + 1);
      case 'export':
        return void exportAll();
      case 'import':
        return fileInput.click();
      case 'check':
        return toggleCheck();
      case 'update':
        return checkUpdate();
      default:
        if (target.classList.contains('rec-row')) select(Number(target.dataset.i));
    }
  });

  // Changing microphone settings drops the open stream, so the next take
  // reopens with them. See setProfile() for why it is not reconfigured live.
  root.addEventListener('change', (event) => {
    if (event.target.dataset?.act === 'tidy') {
      tidy = event.target.checked;
      localStorage.setItem('urdu:tidy-takes', tidy ? '1' : '0');
      return;
    }
    if (event.target.dataset?.act === 'fps') {
      setShowFps(event.target.checked);
      return;
    }
    if (event.target.dataset?.act !== 'profile') return;
    micProfile = event.target.value;
    localStorage.setItem('urdu:mic-profile', micProfile);
    recorder?.setProfile(micProfile);
    renderStage();
  });

  /** @type {HTMLElement|null} */
  let checkEl = null;
  /**
   * The deliberate version of "is this the latest build?".
   *
   * The app updates itself silently, which is right for the child using it and
   * useless for the person trying to work out whether the bug they are looking
   * at is already fixed. The badge in the corner shows the answer; this is the
   * button that asks the question.
   */
  function checkUpdate() {
    statusEl.innerHTML = '<span>Checking for an update…</span>';
    const said = {
      checked: '<span>Checked — the badge in the corner shows the result.</span>',
      offline:
        '<span class="rec-warn">Offline, so nothing could be checked. ' +
        'This is not the same as being up to date.</span>',
      failed: '<span class="rec-warn">The check failed. Try again in a moment.</span>',
      unsupported:
        '<span class="rec-warn">No service worker. Updates only apply to the ' +
        'installed app, not to a dev server.</span>',
    };
    checkForUpdate().then((outcome) => {
      statusEl.innerHTML = said[outcome] ?? said.failed;
    });
  }

  function toggleCheck() {
    if (checkEl) {
      checkEl.remove();
      checkEl = null;
      return;
    }
    checkEl = buildSoundCheck((key) => byKey.get(key)?.say ?? key);
    // Next to the status line, not inside the stage: renderStage() rewrites its
    // own innerHTML on every selection change and would throw the panel away.
    statusEl.after(checkEl);
  }

  fileInput.addEventListener('change', () => {
    importFrom(fileInput.files?.[0]);
    fileInput.value = '';
  });

  function onKey(event) {
    // Never steal keys from the arithmetic gate or a file dialog.
    if (event.target.tagName === 'INPUT') return;
    const keys = {
      ' ': () => toggleRecord(),
      p: () => play(clips[index].key),
      P: () => play(clips[index].key),
      ArrowDown: () => select(index + 1),
      ArrowUp: () => select(index - 1),
      ArrowRight: () => select(index + 1),
      ArrowLeft: () => select(index - 1),
      Escape: () => close(),
    };
    const handler = keys[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    recorder?.dispose();
    stopAll();
    // The mic has just been handed back. Anything decoded while it was open may
    // have been decoded against a different device profile, so start the game
    // again from clean buffers rather than from whatever the recorder left.
    refreshAudio();
    root.remove();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  listEl.focus();
  refresh();
  // Deliberately no warm-up here. The mic opens when a take starts and is
  // handed back shortly after, so it is never held open while the parent is
  // listening back — which is exactly when an open mic makes playback stutter.
  

  return close;
}
