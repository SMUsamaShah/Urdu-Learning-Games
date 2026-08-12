/**
 * Microphone capture, shared by the desktop studio and the in-app recorder.
 *
 * Extracted so there is exactly one place that decides how the mic is opened.
 * The processing flags below are a real judgement about short syllables, not
 * boilerplate, and two copies of them would eventually drift apart.
 *
 * Knows nothing about DOM or storage: it hands back a Blob and lets the caller
 * decide whether that becomes a file on disk or a row in IndexedDB.
 *
 * ## Why the microphone is not held open
 *
 * An open microphone is not free. On a phone it moves the whole audio path into
 * the communications profile — a different sample rate, aggressive processing —
 * and anything played back while that is true stutters. Keeping the mic open
 * for the length of a recording session therefore breaks the very playback the
 * session exists to check.
 *
 * So the mic is opened for a take and released shortly after it, with a short
 * grace period so back-to-back takes do not pay to reopen it each time.
 *
 * Note for anyone wondering why the in-app recorder cannot work over a LAN
 * address: getUserMedia requires a secure context, which means localhost or
 * HTTPS. http://192.168.x.x will not prompt for the microphone at all.
 */

/**
 * What the microphone is allowed to do to the signal before we get it.
 *
 * This matters far more than it looks. `autoGainControl` with no noise
 * suppression is the classic recipe for a hissy recording: between words the
 * gain ramps up hunting for signal and amplifies the room's noise floor, then
 * ducks when a word arrives. The result breathes, and it is baked into the file
 * — no amount of care on the playback side can take it back out.
 *
 * There is no universally right answer, because it depends on the room and the
 * phone, so the choice is offered rather than assumed. `clean` is the default
 * because a fixed gain with the hiss removed is the safer bet on a phone.
 */
export const MIC_PROFILES = {
  clean: {
    label: 'Clean (recommended)',
    hint: 'Fixed gain, hiss removed. Best in a normal room.',
    constraints: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
  },
  raw: {
    label: 'Untouched',
    hint: 'Nothing processes the signal. Best in a quiet room, close to the mic.',
    constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  },
  loud: {
    label: 'Auto volume',
    hint: 'Evens out a quiet or variable voice, at the cost of hiss between words.',
    constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  },
};

export const DEFAULT_PROFILE = 'clean';

/** Containers to try, best first. Chrome gives webm/opus, Safari mp4/aac. */
const MIME_CANDIDATES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

/** Picks a container the browser can actually produce. */
export function pickMimeType() {
  for (const [mime, ext] of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return { mime, ext };
    }
  }
  // Recording still works; the browser picks its own container. webm is the
  // right guess everywhere this branch is reachable.
  return { mime: '', ext: 'webm' };
}

export function isRecordingSupported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Creates a recorder. The microphone is not opened until the first start().
 *
 * @param {{onLevel?: (peak: number) => void}} [options] onLevel fires roughly
 *   per frame with 0..1 peak amplitude, for a level meter. A meter matters more
 *   than it sounds: without one, a dead mic or a clipping take is only
 *   discovered after recording a hundred clips.
 */
/**
 * How long the mic stays open after a take, so consecutive takes are quick
 * without leaving the audio path in voice mode while the child listens back.
 */
const RELEASE_AFTER_MS = 2500;

export function createRecorder({ onLevel, audioContext = null, profile = DEFAULT_PROFILE } = {}) {
  let profileName = MIC_PROFILES[profile] ? profile : DEFAULT_PROFILE;
  /** @type {MediaStream|null} */
  let stream = null;
  /** @type {AudioContext|null} */
  let meterCtx = null;
  /** Whether this recorder created meterCtx and so must close it. */
  let ownsContext = false;
  /** @type {MediaStreamAudioSourceNode|null} */
  let meterSource = null;
  let releaseTimer = 0;
  /** @type {AnalyserNode|null} */
  let analyser = null;
  let meterFrame = 0;
  /** @type {MediaRecorder|null} */
  let recorder = null;
  let chunks = [];

  async function ensureStream() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...MIC_PROFILES[profileName].constraints },
    });

    if (onLevel) {
      // The app's own context, not a new one. A second AudioContext is a second
      // claim on the audio hardware; one per recorder session also quietly
      // accumulates, and browsers cap how many a page may hold.
      meterCtx = audioContext ?? new (window.AudioContext || window.webkitAudioContext)();
      ownsContext = !audioContext;
      const source = meterCtx.createMediaStreamSource(stream);
      analyser = meterCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      meterSource = source;
      runMeter();
    }
    return stream;
  }

  function runMeter() {
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      onLevel(peak);
      meterFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  /**
   * Hands the microphone back, leaving everything else intact so the next take
   * can just reopen it. The meter goes quiet, which is honest: there is nothing
   * being listened to.
   */
  function releaseMic() {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    try {
      meterSource?.disconnect();
    } catch {
      /* already gone */
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    meterSource = null;
    analyser = null;
    if (ownsContext) meterCtx?.close().catch(() => {});
    // A borrowed context belongs to the app and must outlive this recorder.
    if (ownsContext) meterCtx = null;
    onLevel?.(0);
  }

  return {
    isRecording: () => recorder?.state === 'recording',

    /** Whether the microphone is currently open. */
    isMicOpen: () => Boolean(stream),

    profile: () => profileName,

    /**
     * Switches microphone settings.
     *
     * The open stream is thrown away rather than reconfigured: constraints
     * applied to a live track are honoured inconsistently across browsers, and
     * a setting that silently did not take is worse than a moment's delay.
     */
    setProfile(name) {
      if (!MIC_PROFILES[name] || name === profileName) return;
      profileName = name;
      releaseMic();
    },

    /**
     * Opens the mic ahead of a take so the meter is live while you read the
     * prompt. Released again on the same timer as a real take, so leaving the
     * screen idle does not leave the audio path in voice mode.
     */
    async warmUp() {
      await ensureStream();
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(releaseMic, RELEASE_AFTER_MS);
    },

    releaseMic,

    async start() {
      clearTimeout(releaseTimer);
      releaseTimer = 0;
      await ensureStream();
      const { mime } = pickMimeType();
      chunks = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start();
    },

    /**
     * Stops and resolves with the take.
     * @returns {Promise<{blob: Blob, ext: string, mime: string}|null>}
     */
    stop() {
      if (recorder?.state !== 'recording') return Promise.resolve(null);
      return new Promise((resolve) => {
        recorder.onstop = () => {
          const mime = recorder.mimeType || pickMimeType().mime;
          const blob = new Blob(chunks, { type: mime });
          // Derive the extension from what was actually produced rather than
          // what was requested: a browser may ignore the requested container.
          const ext =
            MIME_CANDIDATES.find(([m]) => mime.startsWith(m.split(';')[0]))?.[1] ??
            pickMimeType().ext;
          resolve({ blob, ext, mime });
          // Hand the mic back shortly after the take. The grace period keeps
          // back-to-back takes quick; releasing at all is what stops playback
          // stuttering while the take is being listened to.
          clearTimeout(releaseTimer);
          releaseTimer = setTimeout(releaseMic, RELEASE_AFTER_MS);
        };
        recorder.stop();
      });
    },

    /** Releases the microphone and everything hanging off it, for good. */
    dispose() {
      releaseMic();
      meterCtx = null;
      recorder = null;
      chunks = [];
    },
  };
}
