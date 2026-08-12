/**
 * The background tune, played rather than downloaded.
 *
 * Every preschool app of this kind has music running the whole time, and it is
 * not decoration: it is what makes the screen feel like a place rather than a
 * form. The reference apps all do it, and it was the single most obvious thing
 * missing here.
 *
 * ## Why it is synthesised
 *
 * A two-minute loop as an audio file is a megabyte or two, and this app is one
 * a parent installs on a phone with no space, over a connection that may be
 * slow, and expects to work on a plane. Everything else here — the taps, the
 * pops, the letters themselves — is generated, so the music is too. It costs
 * about two hundred lines and nothing at all to download.
 *
 * The trade-off is honest: this will never sound like a recorded band. So it
 * does not try. It is a simple eight-bar tune on a soft triangle lead with a
 * bass and a quiet pad, in C major pentatonic, which is the scale that cannot
 * produce a sour note — which matters when the melody has to survive being
 * heard a hundred times.
 *
 * ## Scheduling
 *
 * Notes are scheduled ahead of time against the AudioContext clock, not fired
 * from a timer. `setInterval` in a browser tab drifts by tens of milliseconds
 * and stops entirely when the tab is backgrounded; the audio clock does
 * neither. So a timer wakes up four times a second and its only job is to book
 * whatever notes fall in the next quarter of a second. Between wake-ups the
 * music is already committed to hardware and nothing on the main thread —
 * including a slow frame, or a scene loading — can make it stumble.
 *
 * ## Ducking
 *
 * The whole point of this app is a parent's recorded voice saying a letter.
 * Music playing over that makes it harder to hear, and a three-year-old
 * learning a new sound needs it clean. So `duck()` pulls the music down
 * whenever a clip plays and lets it back up afterwards — see src/lib/audio.js.
 */

const KEY = 'urdu:music';

/** How loud the tune sits under everything else. */
const VOLUME = 0.13;
/** What it drops to while a voice clip is playing, and how fast it moves. */
const DUCKED = 0.22;
const DUCK_FADE = 0.12;
const UNDUCK_FADE = 0.5;

const BPM = 108;
const BEAT = 60 / BPM;

/** How far ahead notes are booked, and how often the booking runs. */
const LOOKAHEAD = 0.3;
const TICK_MS = 80;

/**
 * The tune, as semitones above middle C, with each note's length in beats.
 *
 * Written out rather than generated. A melody assembled from random notes in a
 * safe scale sounds exactly like what it is — a toy with a flat battery — and
 * the thing that makes a loop bearable on the hundredth listen is that it has a
 * shape: a phrase, an answering phrase, and a rest to breathe in. `null` is a
 * rest, and the rests are as deliberate as the notes.
 */
const MELODY = [
  // Bar 1-2: the question.
  [12, 0.5], [12, 0.5], [9, 1], [7, 1], [4, 1],
  [9, 0.5], [9, 0.5], [7, 1], [4, 1], [0, 1],
  // Bar 3-4: it rises, and lands unresolved on the D.
  [5, 0.5], [7, 0.5], [9, 1], [12, 1], [9, 1],
  [7, 1], [11, 1], [14, 1.5], [null, 0.5],
  // Bar 5-6: the answer, a step higher.
  [12, 0.5], [14, 0.5], [16, 1], [12, 1], [7, 1],
  [9, 0.5], [12, 0.5], [9, 1], [7, 1], [4, 1],
  // Bar 7-8: home, with room to breathe before it comes round again.
  [5, 1], [9, 1], [12, 1], [9, 1],
  [7, 0.5], [9, 0.5], [12, 2], [null, 1],
];

/**
 * One chord per bar, as semitones above C, under the eight bars above.
 *
 * I - vi - IV - V, which is the progression half of all nursery music is built
 * on, for the reason that it goes round for ever without ever sounding finished.
 */
const CHORDS = [
  { root: 0, notes: [0, 4, 7] },
  { root: -3, notes: [-3, 0, 4] },
  { root: 5, notes: [5, 9, 12] },
  { root: 7, notes: [7, 11, 14] },
  { root: 0, notes: [0, 4, 7] },
  { root: -3, notes: [-3, 0, 4] },
  { root: 5, notes: [5, 9, 12] },
  { root: 7, notes: [7, 11, 14] },
];

const BEATS_PER_BAR = 4;
const LOOP_BEATS = CHORDS.length * BEATS_PER_BAR;

/** Middle C. Everything above is an offset in semitones from here. */
const MIDDLE_C = 261.63;
const hz = (semitones) => MIDDLE_C * 2 ** (semitones / 12);

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let out = null;
/** @type {BiquadFilterNode|null} */
let warmth = null;
let timer = 0;
/** Beat position of the next note still to be booked. */
let cursor = 0;
/** AudioContext time that beat 0 of the loop happened at. */
let origin = 0;
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
 * Hands the tune the app's own AudioContext.
 *
 * The same one everything else uses. A second context is the bug that made
 * recorded clips break up — see src/lib/audio-context.js — and a music loop
 * running on its own would reintroduce it in the worst possible place, because
 * it never stops.
 */
export function initMusic(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;

  out = ctx.createGain();
  out.gain.value = 0;
  // A gentle roll-off on top. Raw oscillators are glassy, and glassy is
  // fatiguing at the volume a child holds a phone.
  warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 2600;
  warmth.Q.value = 0.4;
  warmth.connect(out);
  out.connect(ctx.destination);

  // Nothing should be playing to an audience that has walked away, and a
  // backgrounded tab is a scheduler booking notes nobody will hear.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (musicOn()) startMusic();
  });

  // A browser will not let anything make a noise until the page has been
  // touched, so the tune cannot start when the app does — it starts at whatever
  // the child taps first, which is usually a game tile. Both routes are wired
  // up because Phaser's own unlock event does not fire in every browser, and
  // music that silently never starts is indistinguishable from music that is
  // switched off.
  game.sound?.once?.('unlocked', () => startMusic());
  const onGesture = () => {
    startMusic();
    if (running) document.removeEventListener('pointerdown', onGesture, true);
  };
  document.addEventListener('pointerdown', onGesture, true);
}

/**
 * The node everything the tune plays passes through, or null before init.
 *
 * Exposed so the music can be checked by listening to it rather than by
 * trusting what the module says about itself. Silence here is the failure this
 * file is most likely to have — a scheduler booking notes into the past, or a
 * gain left at zero, makes no sound and throws nothing — and neither of those
 * is visible from the outside without a tap on the output. See
 * tools/verify-fun.mjs.
 */
export function musicOutput() {
  return out;
}

/** One note of the lead or the bass. */
function pluck(freq, at, duration, { type = 'triangle', gain = 0.2, glide = 0 } = {}) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * (glide ? 2 ** (-glide / 12) : 1), at);
  if (glide) osc.frequency.exponentialRampToValueAtTime(freq, at + 0.04);

  // Percussive: quick in, long out. A plucked shape reads as an instrument
  // where a flat one reads as a test tone.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(env);
  env.connect(warmth);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A bar's worth of quiet held chord, well underneath everything else. */
function pad(chord, at, duration) {
  for (const note of chord.notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    // A couple of cents apart so the three notes beat against each other
    // slightly, which is the whole difference between a chord and a buzz.
    osc.detune.value = (Math.random() - 0.5) * 9;
    osc.frequency.value = hz(note - 12);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.035, at + duration * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env);
    env.connect(warmth);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

/** A soft tick on the backbeat, so the tune has somewhere to sit. */
function tick(at) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1400, at);
  osc.frequency.exponentialRampToValueAtTime(700, at + 0.03);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.03, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(env);
  env.connect(warmth);
  osc.start(at);
  osc.stop(at + 0.07);
}

/**
 * Books every note that starts before `until`, in AudioContext time.
 *
 * Walks the melody from the top each time rather than keeping an index into it,
 * because the loop is thirty-two beats and walking it is a few dozen additions
 * — cheaper than the bookkeeping needed to resume mid-phrase after the tune has
 * been stopped and started.
 */
function book(until) {
  while (origin + cursor * BEAT < until) {
    const at = origin + cursor * BEAT;
    const beat = cursor % LOOP_BEATS;
    const bar = Math.floor(beat / BEATS_PER_BAR);
    const chord = CHORDS[bar];
    const inBar = beat % BEATS_PER_BAR;

    if (inBar === 0) {
      pad(chord, at, BEAT * BEATS_PER_BAR);
      pluck(hz(chord.root - 24), at, BEAT * 0.9, { type: 'sine', gain: 0.16 });
    }
    if (inBar === 2) {
      pluck(hz(chord.root - 24), at, BEAT * 0.8, { type: 'sine', gain: 0.12 });
    }
    if (inBar === 1 || inBar === 3) tick(at);

    // The melody, found by walking it until it reaches this beat. Notes are
    // written in beats, so a note lands on this tick only if the lengths before
    // it happen to add up to it.
    let position = 0;
    for (const [note, length] of MELODY) {
      if (position === beat && note !== null) {
        pluck(hz(note), at, BEAT * length * 0.9, { type: 'triangle', gain: 0.2 });
      }
      position += length;
    }

    cursor += 1;
  }
}

/**
 * Starts the tune, or does nothing if it is already going or switched off.
 *
 * Safe to call on every scene: the music belongs to the app, not to a screen,
 * and it must not restart when a child moves between games.
 */
export function startMusic() {
  if (!ctx || !out || running || !musicOn()) return;
  if (ctx.state === 'suspended') return; // Not unlocked yet; a later tap starts it.

  running = true;
  // Half a beat of run-up, so the first note is scheduled rather than late.
  origin = ctx.currentTime + BEAT * 0.5;
  cursor = 0;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
  out.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 1.2);

  book(ctx.currentTime + LOOKAHEAD);
  timer = setInterval(() => {
    if (!running || !ctx) return;
    book(ctx.currentTime + LOOKAHEAD);
  }, TICK_MS);
}

/** Stops the scheduler and fades out what is already booked. */
function pause() {
  if (!running || !ctx || !out) return;
  running = false;
  clearInterval(timer);
  timer = 0;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
  out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
}

export function stopMusic() {
  pause();
}

/**
 * Pulls the music down while something more important is playing.
 *
 * Called by the audio layer whenever a recorded clip starts. Overlapping ducks
 * extend rather than fight: each one pushes out the time the music is allowed
 * back up, so a run of clips played back to back stays clear throughout instead
 * of the music swelling into every gap.
 *
 * @param {number} seconds how long to hold it down for
 */
export function duck(seconds = 1) {
  if (!ctx || !out || !running) return;
  const now = ctx.currentTime;
  const until = Math.max(duckedUntil, now + seconds);
  duckedUntil = until;

  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(VOLUME * DUCKED, now + DUCK_FADE);
  out.gain.setValueAtTime(VOLUME * DUCKED, until);
  out.gain.linearRampToValueAtTime(VOLUME, until + UNDUCK_FADE);
}
