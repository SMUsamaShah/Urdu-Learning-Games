/* The background tune. */

import { masterOut } from './volume.js';

import { DEFAULT_TUNE, TUNES } from './tunes.js';
import { loadTone, renderedChannels } from './tone-setup.js';

const KEY = 'urdu:music';
const TUNE_KEY = 'urdu:tune';

/* How loud the tune sits under everything else, in decibels. */
const VOLUME_DB = -2;
/* How far it drops while a voice clip is playing, and how fast it moves. */
const DUCK_DB = -14;
const DUCK_FADE = 0.12;
const UNDUCK_FADE = 0.6;

/* Which piece of music plays, and everything about it. */
function tune() {
  return TUNES[currentTune()];
}

/* The chosen piece, falling back to the default if the stored id is unknown. */
export function currentTune() {
  try {
    const stored = localStorage.getItem(TUNE_KEY);
    return TUNES[stored] ? stored : DEFAULT_TUNE;
  } catch {
    return DEFAULT_TUNE;
  }
}

/* Changes the piece, and starts playing it. */
export async function setTune(id) {
  if (!TUNES[id] || id === currentTune()) return;
  try {
    localStorage.setItem(TUNE_KEY, id);
  } catch {
    /* private browsing; it just will not be remembered */
  }

  const wasPlaying = running;
  pause();
  await teardown();
  if (wasPlaying) startMusic();
  await loading;
}

/* Throws the band away so the next start builds a new one. */
async function teardown() {
  const built = loading;
  loading = null;
  if (!built) return;
  try {
    await built;
    voices?.transport.stop();
    voices?.transport.cancel();
    voices?.dispose();
  } catch {
    // A band that failed to build has nothing to dispose.
  }
  voices = null;
  tap?.disconnect();
  tap = null;
}

/** @type {AudioContext|null} */
let ctx = null;
/* The native node everything ends up in, so the tune can be measured. */
let tap = null;
/** @type {Promise<void>|null} */
let loading = null;
let voices = null;
let Tone = null;
let running = false;
let duckedUntil = 0;

export function musicOn() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMusicOn(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private browsing; it just will not be remembered */
  }
  if (on) startMusic();
  else stopMusic();
}

/* The node everything the tune plays passes through, or null before it loads. */
export function tuneNames() {
  return Object.entries(TUNES).map(([id, tune]) => ({ id, name: tune.name }));
}

export function musicOutput() {
  return tap;
}

/* Notes the app's AudioContext. */
export function initMusic(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;

  // Nothing should play to an audience that has walked away, and a backgrounded tab is a transport running for nobody.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (musicOn()) startMusic();
  });

  // A browser will not let anything make a noise until the page has been touched.
  game.sound?.once?.('unlocked', () => startMusic());
  const onGesture = () => {
    startMusic();
    if (running) document.removeEventListener('pointerdown', onGesture, true);
  };
  document.addEventListener('pointerdown', onGesture, true);
}

/** Builds the whole band into a destination, and returns the handles.
 * @param {*} T the Tone module
 * @param {*} destination what the mix connects to
 * @param {import('./tunes.js').Tune} piece which tune is being built
 */
async function createBand(T, destination, piece) {
  const nodes = [];
  /* Every node built here, so teardown() can reach the ones nobody returns. */
  const keep = (node) => {
    nodes.push(node);
    return node;
  };

  const master = keep(new T.Gain(0));
  // A limiter rather than trust.
  const limiter = keep(new T.Limiter(-2));
  // The top taken off, because bright is fatiguing at the volume a child holds a phone, and this plays continuously.
  const softener = keep(new T.Filter({ type: 'lowpass', frequency: 4200, rolloff: -12 }));
  master.chain(softener, limiter);
  limiter.connect(destination);

  const reverb = keep(new T.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.3 }));
  reverb.connect(master);
  // The impulse response is rendered offline and the reverb passes nothing at all until it is done.
  await reverb.ready;

  // A recorded instrument, not a synthesised one, and that is the whole point.
  const lead = keep(new T.Sampler({
    urls: { C4: 'C4.mp3', 'F#4': 'Gb4.mp3', C5: 'C5.mp3', 'F#5': 'Gb5.mp3', C6: 'C6.mp3' },
    baseUrl: `${import.meta.env.BASE_URL}audio/instruments/${piece.instrument}/`,
    release: 1.4,
    volume: -7,
  }));
  await T.loaded();
  // A short echo an eighth behind.
  const echo = keep(new T.FeedbackDelay({ delayTime: '8n', feedback: 0.22, wet: 0.18 }));
  lead.chain(echo, reverb);
  lead.connect(master);

  // Round, short, no edge — felt rather than heard, which is all a phone speaker can do with a bass line anyway.
  const bass = keep(new T.MonoSynth({
    oscillator: { type: 'triangle' },
    filter: { type: 'lowpass', Q: 1 },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.2,
      baseFrequency: 180,
      octaves: 1.6,
    },
    envelope: { attack: 0.01, decay: 0.35, sustain: 0.25, release: 0.5 },
    volume: -14,
  }));
  bass.connect(master);

  // The chord underneath: slow to arrive, and almost entirely reverb.
  const pad = keep(new T.PolySynth(T.AMSynth, {
    harmonicity: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.8, decay: 0.4, sustain: 0.7, release: 1.6 },
    modulation: { type: 'sine' },
    volume: -26,
  }));
  pad.connect(reverb);

  // A shaker, not a drum.
  const shaker = keep(new T.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    volume: -30,
  }));
  const shakerTone = keep(new T.Filter({ type: 'highpass', frequency: 5500 }));
  shaker.chain(shakerTone, master);

  // Use a lightly detuned fifth for the drone.
  let drone = null;
  if (piece.drone) {
    drone = keep(new T.PolySynth(T.AMSynth, {
      harmonicity: 1.005,
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 2.5, decay: 1, sustain: 0.85, release: 3 },
      modulation: { type: 'sine' },
      volume: -30,
    }));
    const droneTone = keep(new T.Filter({ type: 'lowpass', frequency: 900 }));
    drone.chain(droneTone, reverb);
    drone.connect(master);
  }

  return {
    master,
    reverb,
    lead,
    bass,
    pad,
    shaker,
    drone,
    /* Releases everything above. */
    dispose: () => {
      for (const node of nodes) {
        try {
          node.dispose();
        } catch {
          // Already gone, or never finished building.
        }
      }
    },
  };
}

/* Sets the tempo and feel on a transport, live or offline. */
function setFeel(transport, tune) {
  transport.bpm.value = tune.bpm;
  // A little behind the beat on the offbeats, where the tune asks for it.
  transport.swing = tune.swing;
  transport.swingSubdivision = '8n';
}

/* Builds the live band, once. */
async function build() {
  // Shared, so the reward flourishes and the tune are the same Tone pointed at the same context.
  Tone = await loadTone();
  // Reuse Phaser's context so Tone does not create a second one.
  if (Tone.getContext().rawContext !== ctx) Tone.setContext(ctx);

  tap = ctx.createGain();
  // Through the app's master.
  tap.connect(masterOut() ?? ctx.destination);

  // Read once here, so a change part-way through building cannot leave the band half one tune and half another.
  const piece = tune();
  const band = await createBand(Tone, tap, piece);
  const transport = Tone.getTransport();
  setFeel(transport, piece);
  scheduleParts(Tone, transport, band, piece);

  voices = { ...band, transport };
}

/** Renders the tune to an AudioBuffer, faster than real time and without touching the speakers.
 * @param {number} seconds
 * @param {object} [options]
 * @param {string} [options.tune] a piece to audition instead of the usual one
 * @param {string} [options.instrument] a voice to hear that piece on
 * @returns {Promise<{sampleRate:number, channels:Float32Array[]}>}
 */
export async function renderMusic(seconds, options = {}) {
  const T0 = await loadTone();
  Tone = T0;
  const piece = {
    ...(TUNES[options.tune] ?? tune()),
    ...(options.instrument ? { instrument: options.instrument } : {}),
  };
  const T = Tone;
  const live = ctx ?? undefined;
  if (live) T.setContext(live);

  const buffer = await T.Offline(async ({ transport }) => {
    const band = await createBand(T, T.getDestination(), piece);
    setFeel(transport, piece);
    // Unguarded. `safely` exists for a stalling main thread.
    scheduleParts(T, transport, band, piece, (callback) => callback);
    band.master.gain.value = T.dbToGain(VOLUME_DB);
    transport.start(0);
  }, seconds);

  if (live) T.setContext(live);
  return renderedChannels(buffer);
}

/* Wraps a scheduled callback so a missed note cannot take the app down. */
function safely(callback) {
  return (...args) => {
    try {
      callback(...args);
    } catch (error) {
      // Deliberately quiet.
    }
  };
}

/* Lays the tune out on the transport as one repeating block. */
function scheduleParts(T, transport, { lead, bass, pad, drone, shaker }, tune, guard = safely) {
  const loopBeats = tune.bars.length * tune.beats;
  const beats = (n) => `0:${n}`;
  const seconds = (beatCount) => (beatCount * 60) / tune.bpm;

  // The melody, placed by walking the note lengths.
  let at = 0;
  const melody = [];
  for (const [note, length] of tune.melody) {
    if (note) melody.push({ time: beats(at), note, hold: seconds(length * 0.92) });
    at += length;
  }
  // A tune whose note lengths do not add up to its bars drifts against the chords underneath.
  if (Math.abs(at - loopBeats) > 0.001) {
    console.warn(
      `Tune "${tune.name}" is ${at} beats of melody over ${loopBeats} beats of bars.`
    );
  }

  new T.Part(guard((time, value) => {
    // Velocity varies a little note to note.
    lead.triggerAttackRelease(value.note, value.hold, time, 0.55 + Math.random() * 0.2);
  }), melody).start(0);

  const bassNotes = [];
  const padChords = [];
  tune.bars.forEach((bar, index) => {
    const base = index * tune.beats;
    for (const [beat, note] of bar.bass) {
      bassNotes.push({ time: beats(base + beat), note });
    }
    padChords.push({ time: beats(base), notes: bar.pad });
  });

  new T.Part(
    guard((time, value) => bass.triggerAttackRelease(value.note, '4n', time, 0.8)),
    bassNotes
  ).start(0);

  const padHold = seconds(tune.padLength ?? tune.beats * 0.75);
  new T.Part(
    guard((time, value) => pad.triggerAttackRelease(value.notes, padHold, time, 0.5)),
    padChords
  ).start(0);

  // The pulse, with the downbeat fractionally louder so there is a beat rather than a hiss.
  const shakes = [];
  for (let bar = 0; bar < tune.bars.length; bar++) {
    for (const beat of tune.pulse) {
      shakes.push({ time: beats(bar * tune.beats + beat), accent: beat === 0 });
    }
  }
  new T.Part(
    guard((time, value) =>
      shaker.triggerAttackRelease('32n', time, value.accent ? 0.9 : 0.45)
    ),
    shakes
  ).start(0);

  // A drone, for the modal tune, held right through and re-struck each loop so it never decays away.
  if (drone) {
    new T.Part(
      guard((time, value) =>
        drone.triggerAttackRelease(value.notes, seconds(loopBeats), time, 0.5)
      ),
      [{ time: beats(0), notes: tune.drone }]
    ).start(0);
  }

  transport.loop = true;
  transport.loopStart = 0;
  transport.loopEnd = beats(loopBeats);
}

/* Starts the tune, or does nothing if it is already going or switched off. */
export function startMusic() {
  if (!ctx || running || !musicOn()) return;
  // Not unlocked yet.
  if (ctx.state === 'suspended') return;

  running = true;
  loading ??= build();
  loading
    .then(() => {
      // Switched off again while the library was loading.
      if (!running || !musicOn()) return;
      voices.master.gain.cancelScheduledValues(ctx.currentTime);
      voices.master.gain.linearRampToValueAtTime(
        Tone.dbToGain(VOLUME_DB),
        ctx.currentTime + 1.4
      );
      if (voices.transport.state !== 'started') voices.transport.start('+0.1');
    })
    .catch((error) => {
      // Music is the one part of this app that may simply not happen.
      running = false;
      console.warn('Background music unavailable:', error);
    });
}

/* Fades out and stops the transport, keeping the band built for next time. */
function pause() {
  if (!running) return;
  running = false;
  if (!voices || !ctx) return;
  voices.master.gain.cancelScheduledValues(ctx.currentTime);
  voices.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
  // After the fade, so the last notes are heard out rather than cut.
  setTimeout(() => {
    if (!running && voices) voices.transport.stop();
  }, 500);
}

export function stopMusic() {
  pause();
}

/** Pulls the music down while something more important is playing.
 * @param {number} seconds how long to hold it down for
 */
export function duck(seconds = 1) {
  if (!voices || !ctx || !running) return;
  const now = ctx.currentTime;
  const until = Math.max(duckedUntil, now + seconds);
  duckedUntil = until;

  const gain = voices.master.gain;
  const quiet = Tone.dbToGain(VOLUME_DB + DUCK_DB);
  const loud = Tone.dbToGain(VOLUME_DB);
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(quiet, now + DUCK_FADE);
  gain.setValueAtTime(quiet, until);
  gain.linearRampToValueAtTime(loud, until + UNDUCK_FADE);
}
