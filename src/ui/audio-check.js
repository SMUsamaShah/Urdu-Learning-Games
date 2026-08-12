/**
 * Sound check: works out *where* bad audio is coming from.
 *
 * "Playback sounds wrong" has at least four different causes and they need
 * completely different fixes, so guessing is expensive. This narrows it down on
 * the actual device, because the fault only appears on real phone hardware: a
 * headless browser on a fast machine never starves its audio thread, and no
 * amount of testing here will reproduce a cheap phone that does.
 *
 * Each check isolates one layer, and which ones sound wrong is the answer:
 *
 *   1. **Tone** — an oscillator through the app's AudioContext. No file, no
 *      recording, no decode. If this is rough, nothing downstream matters: the
 *      output device or the context is the problem.
 *   2. **Clip through Web Audio** — the app's real playback path.
 *   3. **The same clip through an <audio> element** — a completely separate
 *      decode and output path that shares nothing with Web Audio except the
 *      speaker. If this is clean and (2) is rough, the recording is fine and
 *      the fault is ours. If both are rough, the recording itself is bad.
 *   4. **The same clip with the game stopped** — identical file, decode and
 *      output, with the only difference being that nothing is being drawn. If
 *      this is clean and (2) is rough, the audio thread is being starved by
 *      rendering, and the fix is a bigger buffer or a cheaper scene.
 *
 * Plus the numbers that make a recording bad in ways you cannot hear until it
 * is too late: sample rate, peak level, and how much of it is clipped.
 *
 * ## Reading the result
 *
 * The single most useful observation is not in this panel at all: does the
 * roughness land in the *same place* every time you play the same clip? If it
 * does, the file is bad. If it moves around, the file is fine and the audio
 * thread is missing deadlines — which is what the buffer setting below is for.
 */

import { getAudioContext, invalidate, play, stopAll } from '../lib/audio.js';
import { LATENCY_MODES, latencyMode, setLatencyMode } from '../lib/audio-context.js';
import { allKeys, getClip } from '../lib/clip-store.js';

const TONE_SECONDS = 2;

/** Reads a stored clip and measures what is actually in it. */
async function inspect(key) {
  const record = await getClip(key);
  if (!record?.blob) return { key, missing: true };

  const ctx = getAudioContext();
  const bytes = await record.blob.arrayBuffer();
  const info = { key, size: record.blob.size, type: record.blob.type || 'unknown' };

  try {
    // decodeAudioData detaches the buffer it is given, so anything that wants
    // to reuse the bytes afterwards has to hand over a copy.
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    const data = buffer.getChannelData(0);

    let peak = 0;
    let clipped = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      if (v >= 0.999) clipped++;
    }

    Object.assign(info, {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peak,
      clippedPercent: (clipped / data.length) * 100,
    });
  } catch (error) {
    info.decodeError = String(error?.message ?? error);
  }
  return info;
}

/** A plain sine through the app's context. The control for everything else. */
function playTone(onDone) {
  const ctx = getAudioContext();
  if (!ctx) return onDone?.();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  // Ramped, or the start and stop click and the click gets mistaken for the
  // fault being looked for.
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.05);
  gain.gain.setValueAtTime(0.25, t0 + TONE_SECONDS - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + TONE_SECONDS);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.onended = () => onDone?.();
  osc.start(t0);
  osc.stop(t0 + TONE_SECONDS);
}

/**
 * Plays a stored clip through an <audio> element.
 *
 * Deliberately not Web Audio: this shares no decoder, no buffer and no graph
 * with the app's playback, so comparing the two says whether a bad-sounding
 * clip is bad on disk or only bad through us.
 */
function playThroughElement(blob, onDone) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const finish = () => {
    URL.revokeObjectURL(url);
    onDone?.();
  };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);
  return audio;
}

const fmt = {
  hz: (n) => `${(n / 1000).toFixed(1)} kHz`,
  pct: (n) => `${n.toFixed(1)}%`,
  secs: (n) => `${n.toFixed(2)}s`,
  bytes: (n) => `${(n / 1024).toFixed(1)} KB`,
};

/**
 * Builds the panel. Returns an element for the caller to place.
 *
 * @param {(key: string) => string} labelFor turns a clip key into something
 *   readable, so this module needs to know nothing about what a clip is.
 */
export function buildSoundCheck(labelFor = (k) => k) {
  const root = document.createElement('div');
  root.className = 'rec-check';
  root.innerHTML = `
    <h3>Sound check</h3>
    <p class="rec-check-intro">
      Play these in order and note which ones sound wrong. That is the whole
      diagnosis — each one adds a layer, so the first bad one is the culprit.
    </p>
    <ol class="rec-check-steps">
      <li>
        <button type="button" class="rec-btn" data-check="tone">1. Play a test tone</button>
        <span>No file and no recording — just the speaker. Rough here means the
        problem is the device or the audio context, not your recordings.</span>
      </li>
      <li>
        <button type="button" class="rec-btn" data-check="webaudio">2. Play a clip the way the games do</button>
        <span>The app's real playback path.</span>
      </li>
      <li>
        <button type="button" class="rec-btn" data-check="element">3. Play the same clip a different way</button>
        <span>A separate decoder and output. Clean here but rough at step 2
        means the recording is fine and the fault is in the app.</span>
      </li>
      <li>
        <button type="button" class="rec-btn" data-check="quiet">4. Play it with the game stopped</button>
        <span>Same file, same decode, nothing being drawn. Clean here but rough
        at step 2 means the drawing is starving the sound.</span>
      </li>
    </ol>
    <label class="rec-mic">
      <span>Sound buffer</span>
      <select data-check-select="latency">
        ${Object.entries(LATENCY_MODES)
          .map(
            ([name, m]) =>
              `<option value="${name}" ${name === latencyMode() ? 'selected' : ''}>${m.label}</option>`
          )
          .join('')}
      </select>
      <em data-latency-hint>${LATENCY_MODES[latencyMode()].hint}</em>
    </label>
    <p class="rec-check-intro" data-latency-note hidden>
      Close this and reload the app for the new buffer to take effect — the size
      is fixed when the sound system starts and cannot be changed while running.
    </p>
    <div class="rec-check-facts"></div>
    <button type="button" class="rec-btn" data-check="copy">Copy the details</button>
  `;

  const factsEl = root.querySelector('.rec-check-facts');
  /** @type {string|null} */
  let clipKey = null;
  let report = '';

  async function refresh() {
    const ctx = getAudioContext();
    const keys = await allKeys();
    clipKey = keys[0] ?? null;

    const lines = [
      `Context: ${ctx ? `${fmt.hz(ctx.sampleRate)}, ${ctx.state}` : 'none'}`,
      `Buffer setting: ${LATENCY_MODES[latencyMode()].label}`,
      ctx?.baseLatency != null ? `Base latency: ${(ctx.baseLatency * 1000).toFixed(1)} ms` : null,
      ctx?.outputLatency != null
        ? `Output latency: ${(ctx.outputLatency * 1000).toFixed(1)} ms`
        : null,
      `Recordings on this device: ${keys.length}`,
      `User agent: ${navigator.userAgent}`,
    ].filter(Boolean);

    if (clipKey) {
      const info = await inspect(clipKey);
      lines.push(`Clip: ${labelFor(clipKey)} (${info.type}, ${fmt.bytes(info.size)})`);
      if (info.decodeError) {
        lines.push(`Decode FAILED: ${info.decodeError}`);
      } else {
        lines.push(
          `Decoded: ${fmt.secs(info.duration)}, ${fmt.hz(info.sampleRate)}, ` +
            `${info.channels}ch, peak ${info.peak.toFixed(2)}, ` +
            `clipped ${fmt.pct(info.clippedPercent)}`
        );
        // The two ways a recording is bad on its own terms, both of which sound
        // like "the app is broken" to anybody who has not measured it.
        if (info.peak < 0.08) lines.push('WARNING: this recording is very quiet.');
        if (info.clippedPercent > 1) {
          lines.push('WARNING: this recording is clipped — it distorts however it is played.');
        }
        if (ctx && info.sampleRate !== ctx.sampleRate) {
          lines.push(
            `NOTE: the clip is ${fmt.hz(info.sampleRate)} and the context is ` +
              `${fmt.hz(ctx.sampleRate)}, so it is being resampled on the fly.`
          );
        }
      }
    } else {
      lines.push('No recordings yet — record one first, then run steps 2 and 3.');
    }

    report = lines.join('\n');
    factsEl.textContent = report;
  }

  root.addEventListener('change', (event) => {
    if (event.target.dataset?.checkSelect !== 'latency') return;
    setLatencyMode(event.target.value);
    root.querySelector('[data-latency-hint]').textContent =
      LATENCY_MODES[event.target.value].hint;
    root.querySelector('[data-latency-note]').hidden = false;
  });

  root.addEventListener('click', async (event) => {
    const what = event.target.dataset?.check;
    if (!what) return;
    stopAll();

    if (what === 'tone') playTone();
    if (what === 'webaudio' && clipKey) {
      // From cold, so this measures a real first play rather than a buffer that
      // has been sitting decoded since before the microphone was opened.
      invalidate(clipKey);
      play(clipKey);
    }
    if (what === 'element' && clipKey) {
      const record = await getClip(clipKey);
      if (record?.blob) playThroughElement(record.blob);
    }
    if (what === 'quiet' && clipKey) {
      // Stop the render loop outright, play, then start it again. Pausing the
      // scenes is not enough: Phaser keeps drawing them, and drawing is the
      // thing under suspicion.
      const game = window.__game;
      invalidate(clipKey);
      game?.loop?.sleep?.();
      const resume = () => game?.loop?.wake?.();
      try {
        await play(clipKey);
      } finally {
        resume();
      }
    }
    if (what === 'copy') {
      try {
        await navigator.clipboard.writeText(report);
        event.target.textContent = 'Copied';
        setTimeout(() => (event.target.textContent = 'Copy the details'), 1500);
      } catch {
        // Clipboard is blocked in plenty of contexts; selecting the text is a
        // fine fallback and needs no permission.
        getSelection()?.selectAllChildren(factsEl);
      }
    }
  });

  refresh();
  root.refresh = refresh;
  return root;
}
