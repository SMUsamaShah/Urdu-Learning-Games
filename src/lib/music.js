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

const KEY = 'urdu:music';

/** How loud the tune sits under everything else, in decibels. */
const VOLUME_DB = -19;
/** How far it drops while a voice clip is playing, and how fast it moves. */
const DUCK_DB = -14;
const DUCK_FADE = 0.12;
const UNDUCK_FADE = 0.6;

const BPM = 104;

/**
 * The tune: eight bars, as [note, length] with lengths in beats.
 *
 * Written out rather than generated. A melody assembled from random notes in a
 * safe scale sounds exactly like what it is — a toy with a flat battery — and
 * what makes a loop bearable on the hundredth listen is that it has a shape: a
 * phrase, an answering phrase, and a rest to breathe in. `null` is a rest, and
 * the rests are as deliberate as the notes.
 *
 * C major pentatonic almost throughout, which is the scale that cannot produce
 * a sour note. The B in bar four is the one exception, and it is what leaves
 * the phrase unfinished — which is what carries the loop round again.
 */
const MELODY = [
  // Bars 1-2: the question.
  ['C5', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 1], ['E4', 1],
  ['A4', 0.5], ['A4', 0.5], ['G4', 1], ['E4', 1], ['C4', 1],
  // Bars 3-4: it climbs, and lands unresolved.
  ['F4', 0.5], ['G4', 0.5], ['A4', 1], ['C5', 1], ['A4', 1],
  ['G4', 1], ['B4', 1], ['D5', 1.5], [null, 0.5],
  // Bars 5-6: the answer, a step higher.
  ['C5', 0.5], ['D5', 0.5], ['E5', 1], ['C5', 1], ['G4', 1],
  ['A4', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 1], ['E4', 1],
  // Bars 7-8: home, with room to breathe before it comes round again.
  ['F4', 1], ['A4', 1], ['C5', 1], ['A4', 1],
  ['G4', 0.5], ['A4', 0.5], ['C5', 2], [null, 1],
];

/**
 * One chord per bar: I - vi - IV - V, twice.
 *
 * The progression half of all nursery music is built on, for the reason that it
 * goes round for ever without ever sounding finished.
 *
 * The bass plays the root on beat one and the fifth on beat three, which is the
 * oldest trick there is for making four chords sound like movement. Both sit
 * around 100-200 Hz, where a phone speaker can actually reproduce them; an
 * octave lower would be inaudible on the device this is played on.
 */
const BARS = [
  { pad: ['C3', 'E3', 'G3'], bass: ['C3', 'G2'] },
  { pad: ['A2', 'C3', 'E3'], bass: ['A2', 'E2'] },
  { pad: ['F2', 'A2', 'C3'], bass: ['F3', 'C3'] },
  { pad: ['G2', 'B2', 'D3'], bass: ['G3', 'D3'] },
  { pad: ['C3', 'E3', 'G3'], bass: ['C3', 'G2'] },
  { pad: ['A2', 'C3', 'E3'], bass: ['A2', 'E2'] },
  { pad: ['F2', 'A2', 'C3'], bass: ['F3', 'C3'] },
  { pad: ['G2', 'B2', 'D3'], bass: ['G3', 'D3'] },
];

const BEATS_PER_BAR = 4;
const LOOP_BEATS = BARS.length * BEATS_PER_BAR;

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
 * Builds the band, once.
 *
 * The instruments are chosen for a screen a small child looks at for half an
 * hour: everything soft-edged, nothing bright, the top end rolled off. The
 * reverb is doing more work than any of the synth settings — it is the
 * difference between notes and music — but a long tail turns a repeating loop
 * to mush, so it is short and only lightly mixed in.
 */
async function build() {
  Tone = await import('tone');
  // Before any Tone object exists, or it builds a second AudioContext.
  Tone.setContext(ctx);

  tap = ctx.createGain();
  tap.connect(ctx.destination);

  const master = new Tone.Gain(0);
  // A limiter rather than trust: three instruments and a reverb tail can
  // coincide, and a clipped background tune is unpleasant in a way a quiet one
  // is not.
  const limiter = new Tone.Limiter(-2);
  // The top taken off, because bright is fatiguing at the volume a child holds
  // a phone, and this plays continuously.
  const softener = new Tone.Filter({ type: 'lowpass', frequency: 4200, rolloff: -12 });
  master.chain(softener, limiter);
  limiter.connect(tap);

  const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.3 });
  reverb.connect(master);
  // The impulse response is rendered offline and the reverb passes nothing
  // until it is done. Waiting here is why the tune starts a beat after the
  // first tap rather than not at all.
  await reverb.ready;

  // A struck bell — music box, celesta, toy piano. The obvious voice for a
  // nursery tune and, unlike a sustained lead, it cannot drone.
  const lead = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.02, release: 1.4 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.4 },
    volume: -9,
  });
  // A short echo an eighth behind. It costs nothing and it is most of what
  // makes a simple line sound arranged rather than typed in.
  const echo = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.22, wet: 0.18 });
  lead.chain(echo, reverb);
  lead.connect(master);

  // Round, short, no edge — felt rather than heard, which is all a phone
  // speaker can do with a bass line anyway.
  const bass = new Tone.MonoSynth({
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
  });
  bass.connect(master);

  // The chord underneath: slow to arrive, and almost entirely reverb. It should
  // never be identifiable as an instrument. Taking it away is the only way to
  // notice it was there.
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.8, decay: 0.4, sustain: 0.7, release: 1.6 },
    modulation: { type: 'sine' },
    volume: -26,
  });
  pad.connect(reverb);

  // A shaker, not a drum. Something has to mark the beat or the tune drifts,
  // but a kick under a nursery melody sounds like a ringtone.
  const shaker = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
    volume: -30,
  });
  const shakerTone = new Tone.Filter({ type: 'highpass', frequency: 5500 });
  shaker.chain(shakerTone, master);

  const transport = Tone.getTransport();
  transport.bpm.value = BPM;
  // A little behind the beat on the offbeats. Dead-straight eighths are the
  // other half of why the first version sounded mechanical.
  transport.swing = 0.12;
  transport.swingSubdivision = '8n';

  scheduleParts(transport, { lead, bass, pad, shaker });

  voices = { master, reverb, lead, bass, pad, shaker, transport };
}

/** Lays the tune out on the transport as one repeating block. */
function scheduleParts(transport, { lead, bass, pad, shaker }) {
  const beats = (n) => `0:${n}`;
  const seconds = (beatCount) => (beatCount * 60) / BPM;

  // The melody, placed by walking the note lengths.
  let at = 0;
  const melody = [];
  for (const [note, length] of MELODY) {
    if (note) melody.push({ time: beats(at), note, hold: seconds(length * 0.92) });
    at += length;
  }

  new Tone.Part((time, value) => {
    // Velocity varies a little note to note. Identical strikes are the single
    // most machine-like thing a sequenced part can do.
    lead.triggerAttackRelease(value.note, value.hold, time, 0.55 + Math.random() * 0.2);
  }, melody).start(0);

  const bassNotes = [];
  const padChords = [];
  BARS.forEach((bar, index) => {
    const base = index * BEATS_PER_BAR;
    bassNotes.push({ time: beats(base), note: bar.bass[0] });
    bassNotes.push({ time: beats(base + 2), note: bar.bass[1] });
    padChords.push({ time: beats(base), notes: bar.pad });
  });

  new Tone.Part((time, value) => {
    bass.triggerAttackRelease(value.note, '4n', time, 0.8);
  }, bassNotes).start(0);

  new Tone.Part((time, value) => {
    pad.triggerAttackRelease(value.notes, '2n.', time, 0.5);
  }, padChords).start(0);

  // Eighth notes, with the downbeats fractionally louder so there is a pulse
  // rather than a hiss.
  const shakes = [];
  for (let eighth = 0; eighth < LOOP_BEATS * 2; eighth++) {
    shakes.push({ time: beats(eighth / 2), accent: eighth % 4 === 0 });
  }
  new Tone.Part((time, value) => {
    shaker.triggerAttackRelease('32n', time, value.accent ? 0.9 : 0.45);
  }, shakes).start(0);

  transport.loop = true;
  transport.loopStart = 0;
  transport.loopEnd = `0:${LOOP_BEATS}`;
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
