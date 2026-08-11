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
 * Note for anyone wondering why the in-app recorder cannot work over a LAN
 * address: getUserMedia requires a secure context, which means localhost or
 * HTTPS. http://192.168.x.x will not prompt for the microphone at all.
 */

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
export function createRecorder({ onLevel } = {}) {
  /** @type {MediaStream|null} */
  let stream = null;
  /** @type {AudioContext|null} */
  let meterCtx = null;
  /** @type {AnalyserNode|null} */
  let analyser = null;
  let meterFrame = 0;
  /** @type {MediaRecorder|null} */
  let recorder = null;
  let chunks = [];

  async function ensureStream() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Keep the voice as recorded. Aggressive processing on a quiet room can
        // gate the start of a short syllable, which is exactly what these clips
        // are made of.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    if (onLevel) {
      meterCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = meterCtx.createMediaStreamSource(stream);
      analyser = meterCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
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

  return {
    isRecording: () => recorder?.state === 'recording',

    /** Opens the mic without recording, so the meter is live while you read. */
    warmUp: ensureStream,

    async start() {
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
        };
        recorder.stop();
      });
    },

    /** Releases the microphone, which turns off the browser's recording light. */
    dispose() {
      cancelAnimationFrame(meterFrame);
      stream?.getTracks().forEach((t) => t.stop());
      meterCtx?.close().catch(() => {});
      stream = null;
      meterCtx = null;
      analyser = null;
      recorder = null;
      chunks = [];
    },
  };
}
