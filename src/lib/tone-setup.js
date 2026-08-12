/**
 * One Tone.js, one AudioContext, loaded once and shared.
 *
 * Two things need Tone now — the background tune and the reward flourishes —
 * and each importing it independently would be two copies of a 300 KB library
 * and, far worse, two calls to `setContext`. Tone keeps its context globally;
 * whichever module called last would win, and the loser's nodes would be
 * pointed at a context that is no longer being rendered. That failure is
 * silent: the notes are scheduled, nothing throws, and no sound comes out.
 *
 * Everything shares the AudioContext the app itself built (see
 * src/lib/audio-context.js) — never one of Tone's own. A second AudioContext is
 * what made recorded speech break up, and it took three wrong diagnoses to find
 * the first time.
 */

/** @type {Promise<*>|null} */
let loading = null;
/** @type {AudioContext|null} */
let sharedContext = null;

/**
 * Notes the context to use. Called once at startup, before anything asks for
 * Tone, so the first loader has something to hand it.
 */
export function useAudioContext(ctx) {
  sharedContext = ctx ?? null;
}

/**
 * The Tone module, with its context already pointed at the app's.
 *
 * Lazy on purpose. This runs during a loading screen otherwise, and a few
 * hundred kilobytes of audio library on that path delays the menu appearing for
 * something nobody can hear until they have touched the screen anyway.
 *
 * @returns {Promise<*>} the Tone namespace
 */
export function loadTone() {
  loading ??= import('tone').then((Tone) => {
    // The second argument disposes whatever context Tone was using, and it
    // matters. Importing Tone builds its own AudioContext before any of our
    // code can get a word in — its destination and listener are created against
    // the global context at module scope — so without this the app ends up
    // running two, one of them silent and doing nothing but holding an audio
    // device open. That is the exact shape of the bug that made recorded speech
    // break up, and verify-recording counts contexts at the end of a run for
    // precisely this reason.
    if (sharedContext) Tone.setContext(sharedContext, true);
    return Tone;
  });
  return loading;
}

/** The context everything is running on, or null before startup. */
export function audioContext() {
  return sharedContext;
}
