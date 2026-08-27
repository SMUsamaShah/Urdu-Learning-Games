/* Sound check: works out *where* bad audio is coming from. */

import { getAudioContext, invalidate, play, stopAll } from '../lib/audio.js';
import { LATENCY_MODES, latencyMode, setLatencyMode } from '../lib/audio-context.js';
import { allKeys, getClip } from '../lib/clip-store.js';

const TONE_SECONDS = 2;

/* Reads a stored clip and measures what is actually in it. */
async function inspect(key) {
  const record = await getClip(key);
  if (!record?.blob) return { key, missing: true };

  const ctx = getAudioContext();
  const bytes = await record.blob.arrayBuffer();
  const info = { key, size: record.blob.size, type: record.blob.type || 'unknown' };

  try {
    // decodeAudioData detaches the buffer it is given.
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

/* A plain sine through the app's context. */
function playTone(onDone) {
  const ctx = getAudioContext();
  if (!ctx) return onDone?.();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  // Fade the test clip to avoid mistaking edges for the fault.
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

/* Plays a stored clip through an <audio> element. */
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

/** Builds the panel.
 * @param {(key: string) => string} labelFor turns a clip key into something
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
        // The two ways a recording is bad on its own terms.
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
      // Start cold to measure first-play latency.
      invalidate(clipKey);
      play(clipKey);
    }
    if (what === 'element' && clipKey) {
      const record = await getClip(clipKey);
      if (record?.blob) playThroughElement(record.blob);
    }
    if (what === 'quiet' && clipKey) {
      // Stop the render loop outright, play, then start it again.
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
        // Clipboard is blocked in plenty of contexts; selecting the text is a fine fallback and needs no permission.
        getSelection()?.selectAllChildren(factsEl);
      }
    }
  });

  refresh();
  root.refresh = refresh;
  return root;
}
