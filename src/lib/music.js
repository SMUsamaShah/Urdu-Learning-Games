/**
 * The background tune.
 *
 * Every preschool app of this kind has music running the whole time, and it is
 * not decoration: it is what makes the screen feel like a place rather than a
 * form. The reference apps all do it.
 *
 * ## Why this uses Tone.js when nothing else here uses anything
 *
 * The first version of this file was raw Web Audio — oscillators, gain
 * envelopes, a hand-rolled scheduler — in keeping with the rest of the project,
 * where the sound effects, the icons and the letters are all generated rather
 * than downloaded. It worked, and it was in tune, and it sounded like a
 * microwave.
 *
 * The gap between "correct notes" and "pleasant on the fiftieth listen" is
 * almost entirely timbre and space: how a note is struck, what happens in its
 * first ten milliseconds, whether there is a room around it. Closing that by
 * hand means tuning by ear, repeatedly. Tone.js already contains the result of
 * other people doing exactly that — its synth voices, envelopes and reverb were
 * voiced by people who could hear what they were doing — which reduces this
 * file's job to choosing instruments and writing the tune.
 *
 * The cost is a real dependency. It is loaded lazily, so it never delays the
 * app starting, and precached like everything else, so offline still works.
 *
 * ## Everything shares the app's AudioContext
 *
 * `Tone.setContext` is called with the context the app already built, before a
 * single Tone object exists. A second AudioContext is the bug that made
 * recorded clips break up (see src/lib/audio-context.js), and a music loop
 * running on its own would reintroduce it in the worst possible place, because
 * it never stops.
 *
 * ## Ducking
 *
 * The whole point of this app is a parent's recorded voice saying a letter.
 * Music over that makes it harder to hear, and a three-year-old meeting a new
 * sound needs it clean, so `duck()` pulls the tune down whenever a clip plays —
 * see src/lib/audio.js.
 */

import { DEFAULT_TUNE, TUNES } from './tunes.js';
import { loadTone, renderedChannels } from './tone-setup.js';

const KEY = 'urdu:music';
const TUNE_KEY = 'urdu:tune';

/** How loud the tune sits under everything else, in decibels. */
const VOLUME_DB = -19;
/** How far it drops while a voice clip is playing, and how fast it moves. */
const DUCK_DB = -14;
const DUCK_FADE = 0.12;
const UNDUCK_FADE = 0.6;

/**
 * Which piece of music plays, and everything about it.
 *
 * The compositions live in src/lib/tunes.js as data — melody, chords, metre,
 * feel and voice together — because they are the part a person has an opinion
 * about, and changing one should not mean reading a scheduler. Audition them
 * with `npm run music:preview -- --tune waltz`.
 *
 * Which one plays is a setting rather than a constant, chosen on the grown-ups
 * screen. Read through a function every time rather than captured once: the
 * band is rebuilt on a change, and a module-level `const TUNE` would have the
 * new band playing the old piece.
 */
function tune() {
  return TUNES[currentTune()];
}

/** The chosen piece, falling back to the default if the stored id is unknown. */
export function currentTune() {
  try {
    const stored = localStorage.getItem(TUNE_KEY);
    return TUNES[stored] ? stored : DEFAULT_TUNE;
  } catch {
    return DEFAULT_TUNE;
  }
}

/**
 * Changes the piece, and starts playing it.
 *
 * The band is instruments, not just notes — each tune has its own voice — so
 * this cannot swap a melody and leave everything else standing. It tears the
 * old band down and builds a new one, which takes a moment because the new
 * instrument's samples have to be fetched and a reverb rendered.
 *
 * Resolves when the new tune is audible, so a picker can say so.
 */
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

/**
 * Throws the band away so the next start builds a new one.
 *
 * Every node has to go, not just the ones the band hands back: a Sampler
 * holding five decoded buffers and a Reverb holding a rendered impulse are the
 * expensive ones, and leaking a set of those per tune change turns idly trying
 * all five into several megabytes that never come back. Tone will not collect
 * them — a node stays alive as long as it is connected to anything.
 */
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
/** The native node everything ends up in, so the tune can be measured. */
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

/**
 * The node everything the tune plays passes through, or null before it loads.
 *
 * Exposed so the music can be checked by listening to it rather than by
 * trusting what this module says about itself. Silence is the failure most
 * likely here — a part scheduled into the past, a reverb that never finished
 * generating, a gain left at zero — and none of those throw. See
 * tools/verify-fun.mjs.
 */
export function tuneNames() {
  return Object.entries(TUNES).map(([id, tune]) => ({ id, name: tune.name }));
}

export function musicOutput() {
  return tap;
}

/**
 * Notes the app's AudioContext. Nothing is built until the tune first starts.
 *
 * Deliberately does not pull in Tone.js. This runs during the loading screen,
 * and a couple of hundred kilobytes of audio library on that path would delay
 * the menu appearing for the sake of something nobody can hear until they have
 * tapped the screen anyway.
 */
export function initMusic(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;

  // Nothing should play to an audience that has walked away, and a
  // backgrounded tab is a transport running for nobody.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (musicOn()) startMusic();
  });

  // A browser will not let anything make a noise until the page has been
  // touched, so the tune cannot start when the app does — it starts at whatever
  // the child taps first, usually a game tile. Both routes are wired up because
  // Phaser's own unlock event does not fire in every browser, and music that
  // silently never starts is indistinguishable from music switched off.
  game.sound?.once?.('unlocked', () => startMusic());
  const onGesture = () => {
    startMusic();
    if (running) document.removeEventListener('pointerdown', onGesture, true);
  };
  document.addEventListener('pointerdown', onGesture, true);
}

/**
 * Builds the whole band into a destination, and returns the handles.
 *
 * Takes its destination rather than reaching for one, so the identical band can
 * be built live and inside an OfflineAudioContext for `renderMusic`. One
 * definition of what the tune sounds like: a preview that re-declares the
 * instruments is a preview of something else.
 *
 * They are chosen for a screen a small child looks at for half an hour:
 * everything soft-edged, nothing bright, the top end rolled off. The reverb is
 * doing more work than any of the synth settings — it is the difference between
 * notes and music — but a long tail turns a repeating loop to mush, so it is
 * short and only lightly mixed in.
 *
 * @param {*} T the Tone module
 * @param {*} destination what the mix connects to
 * @param {import('./tunes.js').Tune} piece which tune is being built
 */
async function createBand(T, destination, piece) {
  const nodes = [];
  /** Every node built here, so teardown() can reach the ones nobody returns. */
  const keep = (node) => {
    nodes.push(node);
    return node;
  };

  const master = keep(new T.Gain(0));
  // A limiter rather than trust: three instruments and a reverb tail can
  // coincide, and a clipped background tune is unpleasant in a way a quiet one
  // is not.
  const limiter = keep(new T.Limiter(-2));
  // The top taken off, because bright is fatiguing at the volume a child holds
  // a phone, and this plays continuously.
  const softener = keep(new T.Filter({ type: 'lowpass', frequency: 4200, rolloff: -12 }));
  master.chain(softener, limiter);
  limiter.connect(destination);

  const reverb = keep(new T.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.3 }));
  reverb.connect(master);
  // The impulse response is rendered offline and the reverb passes nothing at
  // all until it is done. Waiting here is why the tune starts a beat after the
  // first tap rather than not at all.
  await reverb.ready;

  // A recorded instrument, not a synthesised one, and that is the whole point.
  // This tune was synthesised twice — by hand in Web Audio, then with Tone's
  // own voices — and came out correct and unpleasant both times. A struck note
  // carries detail no envelope over an oscillator reproduces: the knock of the
  // mallet, the partials drifting out of tune as it dies, the body ringing.
  //
  // Five notes, pitched to fill the gaps. See tools/fetch-instruments.mjs.
  const lead = keep(new T.Sampler({
    urls: { C4: 'C4.mp3', 'F#4': 'Gb4.mp3', C5: 'C5.mp3', 'F#5': 'Gb5.mp3', C6: 'C6.mp3' },
    baseUrl: `${import.meta.env.BASE_URL}audio/instruments/${piece.instrument}/`,
    release: 1.4,
    volume: -7,
  }));
  await T.loaded();
  // A short echo an eighth behind. It costs nothing and it is most of what
  // makes a simple line sound arranged rather than typed in.
  const echo = keep(new T.FeedbackDelay({ delayTime: '8n', feedback: 0.22, wet: 0.18 }));
  lead.chain(echo, reverb);
  lead.connect(master);

  // Round, short, no edge — felt rather than heard, which is all a phone
  // speaker can do with a bass line anyway.
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

  // The chord underneath: slow to arrive, and almost entirely reverb. It should
  // never be identifiable as an instrument. Taking it away is the only way to
  // notice it was there.
  const pad = keep(new T.PolySynth(T.AMSynth, {
    harmonicity: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.8, decay: 0.4, sustain: 0.7, release: 1.6 },
    modulation: { type: 'sine' },
    volume: -26,
  }));
  pad.connect(reverb);

  // A shaker, not a drum. Something has to mark the beat or the tune drifts,
  // but a kick under a nursery melody sounds like a ringtone.
  const shaker = keep(new T.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    volume: -30,
  }));
  const shakerTone = keep(new T.Filter({ type: 'highpass', frequency: 5500 }));
  shaker.chain(shakerTone, master);

  // A tanpura, near enough: two notes a fifth apart, held for ever, slightly
  // out of tune with each other so the pair shimmers. Built only for the tune
  // that asks for one, because a drone underneath a chord progression fights
  // every chord that is not the tonic.
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
    /**
     * Releases everything above. Called when the tune is changed — see
     * teardown(). A Sampler's decoded buffers and a Reverb's rendered impulse
     * are the two that matter; the rest is tidiness.
     */
    dispose: () => {
      for (const node of nodes) {
        try {
          node.dispose();
        } catch {
          // Already gone, or never finished building. Either way, nothing owed.
        }
      }
    },
  };
}

/** Sets the tempo and feel on a transport, live or offline. */
function setFeel(transport, tune) {
  transport.bpm.value = tune.bpm;
  // A little behind the beat on the offbeats, where the tune asks for it. Dead
  // straight is right for the waltz and wrong for the skipping one; it was
  // uniformly straight before, which was half of why the whole thing sounded
  // mechanical.
  transport.swing = tune.swing;
  transport.swingSubdivision = '8n';
}

/** Builds the live band, once. */
async function build() {
  // Shared, so the reward flourishes and the tune are the same Tone pointed at
  // the same context. Two setContext calls would leave one of them scheduling
  // into a context nobody is rendering, silently.
  Tone = await loadTone();
  // Belt and braces: `ctx` came from Phaser and so did what loadTone was given,
  // but a mismatch here is invisible until two nodes refuse to connect, and the
  // symptom then is silence rather than an error anybody sees.
  if (Tone.getContext().rawContext !== ctx) Tone.setContext(ctx);

  tap = ctx.createGain();
  tap.connect(ctx.destination);

  // Read once here, so a change part-way through building cannot leave the
  // band half one tune and half another.
  const piece = tune();
  const band = await createBand(Tone, tap, piece);
  const transport = Tone.getTransport();
  setFeel(transport, piece);
  scheduleParts(Tone, transport, band, piece);

  voices = { ...band, transport };
}

/**
 * Renders the tune to an AudioBuffer, faster than real time and without
 * touching the speakers.
 *
 * This exists because capturing the live output does not work. A ScriptProcessor
 * runs its callback on the main thread, and the main thread here is also running
 * a WebGL game; under software rendering it drops to single-figure frame rates,
 * the callback is starved, and the capture comes back full of discontinuities
 * that sound like the speaker tearing. Those clicks are in the recording and not
 * in the music, which is a very expensive thing to be confused about — it sends
 * you rewriting a tune that was never the problem.
 *
 * An OfflineAudioContext has no main thread to be starved by. What comes out is
 * exactly what the instruments produce.
 *
 * Note that Tone.Offline swaps the global context for the duration, so the live
 * tune should be stopped around a call to this.
 *
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
    // Unguarded. `safely` exists for a stalling main thread, which an offline
    // render does not have — and swallowing errors here would let a bad tune
    // write a silent file and report success, which is exactly the sort of
    // thing the preview exists to catch.
    scheduleParts(T, transport, band, piece, (callback) => callback);
    band.master.gain.value = T.dbToGain(VOLUME_DB);
    transport.start(0);
  }, seconds);

  if (live) T.setContext(live);
  return renderedChannels(buffer);
}

/**
 * Wraps a scheduled callback so a missed note cannot take the app down.
 *
 * Tone clamps an event whose time has already passed up to `currentTime`, and
 * a Source that is already playing refuses to restart at a time that is not
 * strictly later than its last one. So when the main thread stalls — a scene
 * change, a garbage collection, a slow frame on a cheap phone — two late hits
 * clamp to the same instant and the second throws "Start time must be strictly
 * greater than previous start time" from inside the audio clock.
 *
 * It is only the shaker and the bass that can do this, because each reuses a
 * single source; every other voice makes a new one per note. And the correct
 * response to a shaker hit arriving late is to drop it, not to stop the app:
 * this used to surface as an uncaught error, which the boot handler in
 * index.html then reported as the game having failed to load, on a screen
 * where the game was visibly running fine.
 */
function safely(callback) {
  return (...args) => {
    try {
      callback(...args);
    } catch (error) {
      // Deliberately quiet. This fires when the device is already struggling,
      // and a console full of warnings is not what it needs.
    }
  };
}

/** Lays the tune out on the transport as one repeating block. */
function scheduleParts(T, transport, { lead, bass, pad, drone, shaker }, tune, guard = safely) {
  const loopBeats = tune.bars.length * tune.beats;
  const beats = (n) => `0:${n}`;
  const seconds = (beatCount) => (beatCount * 60) / tune.bpm;

  // The melody, placed by walking the note lengths. Rests take up time and
  // produce nothing, which is the only thing that needs saying about them.
  let at = 0;
  const melody = [];
  for (const [note, length] of tune.melody) {
    if (note) melody.push({ time: beats(at), note, hold: seconds(length * 0.92) });
    at += length;
  }
  // A tune whose note lengths do not add up to its bars drifts against the
  // chords underneath, a little more each loop, and sounds like a mistake long
  // before anybody works out what it is.
  if (Math.abs(at - loopBeats) > 0.001) {
    console.warn(
      `Tune "${tune.name}" is ${at} beats of melody over ${loopBeats} beats of bars.`
    );
  }

  new T.Part(guard((time, value) => {
    // Velocity varies a little note to note. Identical strikes are the single
    // most machine-like thing a sequenced part can do.
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

  // The pulse, with the downbeat fractionally louder so there is a beat rather
  // than a hiss. Which beats get one is the tune's business: eighths for the
  // even one, offbeats for the skipping one, two-and-three for the waltz.
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

  // A drone, for the modal tune, held right through and re-struck each loop so
  // it never decays away. Nothing else has one; a drone under a chord
  // progression fights every chord that is not the tonic.
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

/**
 * Starts the tune, or does nothing if it is already going or switched off.
 *
 * Safe to call from any scene: the music belongs to the app rather than to a
 * screen, and it must not restart when a child moves between games.
 */
export function startMusic() {
  if (!ctx || running || !musicOn()) return;
  // Not unlocked yet. A later tap comes back through here.
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
      // Music is the one part of this app that may simply not happen. A failed
      // dynamic import must not take the games down with it.
      running = false;
      console.warn('Background music unavailable:', error);
    });
}

/** Fades out and stops the transport, keeping the band built for next time. */
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

/**
 * Pulls the music down while something more important is playing.
 *
 * Called by the audio layer whenever a recorded clip starts. Overlapping ducks
 * extend rather than fight: each pushes out the time the music may come back
 * up, so clips played back to back stay clear throughout instead of the music
 * swelling into every gap.
 *
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
