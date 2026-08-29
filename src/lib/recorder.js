/* Microphone capture, shared by the desktop studio and the in-app recorder. */

/* What the microphone is allowed to do to the signal before we get it. */
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

/* Containers to try, best first. */
const MIME_CANDIDATES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

/* Picks a container the browser can actually produce. */
function pickMimeType() {
  for (const [mime, ext] of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return { mime, ext };
    }
  }
  // Recording still works; the browser picks its own container.
  return { mime: '', ext: 'webm' };
}

export function isRecordingSupported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Creates a recorder.
 * @param {{onLevel?: (peak: number) => void}} [options] onLevel fires roughly
 */
/* How long the mic stays open after a take. */
const RELEASE_AFTER_MS = 2500;

export function createRecorder({ onLevel, audioContext = null, profile = DEFAULT_PROFILE } = {}) {
  let profileName = MIC_PROFILES[profile] ? profile : DEFAULT_PROFILE;
  /** @type {MediaStream|null} */
  let stream = null;
  /** @type {AudioContext|null} */
  let meterCtx = null;
  /* Whether this recorder created meterCtx and so must close it. */
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
      // The app's own context, not a new one.
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

  /* Hands the microphone back, leaving everything else intact so the next take can just reopen it. */
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

    /* Whether the microphone is currently open. */
    isMicOpen: () => Boolean(stream),

    profile: () => profileName,

    /* Switches microphone settings. */
    setProfile(name) {
      if (!MIC_PROFILES[name] || name === profileName) return;
      profileName = name;
      releaseMic();
    },

    /* Opens the mic ahead of a take so the meter is live while you read the prompt. */
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

    /** Stops and resolves with the take.
 * @returns {Promise<{blob: Blob, ext: string, mime: string}|null>}
 */
    stop() {
      if (recorder?.state !== 'recording') return Promise.resolve(null);
      return new Promise((resolve) => {
        recorder.onstop = () => {
          const mime = recorder.mimeType || pickMimeType().mime;
          const blob = new Blob(chunks, { type: mime });
          // Derive the extension from what was actually produced rather than what was requested.
          const ext =
            MIME_CANDIDATES.find(([m]) => mime.startsWith(m.split(';')[0]))?.[1] ??
            pickMimeType().ext;
          resolve({ blob, ext, mime });
          // Hand the mic back shortly after the take.
          clearTimeout(releaseTimer);
          releaseTimer = setTimeout(releaseMic, RELEASE_AFTER_MS);
        };
        recorder.stop();
      });
    },

    /* Releases the microphone and everything hanging off it, for good. */
    dispose() {
      releaseMic();
      meterCtx = null;
      recorder = null;
      chunks = [];
    },
  };
}
