/**
 * Reads and writes the export archive: an ordinary .zip.
 *
 * The layout mirrors the repo on purpose:
 *
 *   recorded/letter-be-name.webm    ← exactly what public/audio/recorded/ wants
 *   urdu-clips.json                 ← what was exported, and when
 *   README.txt                      ← how to promote these into the repo
 *
 * so refining a take means unzipping, opening one file in an audio editor, and
 * copying the folder into the repo. No renaming, no tooling.
 *
 * Written by hand rather than pulling in a zip library. Entries are STORE
 * (uncompressed) because Opus and AAC are already compressed and deflating them
 * buys nothing but CPU. Reading accepts STORE *and* DEFLATE, so an archive that
 * has been unzipped, edited and re-zipped by an ordinary zip tool still imports
 * — which is the whole point of choosing a real format over a JSON blob.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// ------------------------------------------------------------------ crc32

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Zip stores timestamps as MS-DOS date and time, which has a two-second
 * resolution and an epoch of 1980. Anything older than 1980 clamps.
 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// ------------------------------------------------------------------ write

/**
 * @param {{name: string, bytes: Uint8Array}[]} entries
 * @param {Date} [now]
 * @returns {Blob} an archive any zip tool can open.
 */
export function writeZip(entries, now = new Date()) {
  const { time, date } = dosDateTime(now);
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_SIG, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filenames
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed
    local.setUint32(22, size, true); // uncompressed
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra field length

    parts.push(new Uint8Array(local.buffer), nameBytes, entry.bytes);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, CENTRAL_SIG, true);
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true); // STORE
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint16(30, 0, true); // extra
    dir.setUint16(32, 0, true); // comment
    dir.setUint16(34, 0, true); // disk number
    dir.setUint16(36, 0, true); // internal attrs
    dir.setUint32(38, 0, true); // external attrs
    dir.setUint32(42, offset, true);

    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }

  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, EOCD_SIG, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true); // comment length

  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], {
    type: 'application/zip',
  });
}

// ------------------------------------------------------------------- read

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This archive is compressed and this browser cannot decompress it. ' +
        'Re-zip it without compression, or use a newer browser.'
    );
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Blob|ArrayBuffer|Uint8Array} input
 * @returns {Promise<{name: string, bytes: Uint8Array}[]>}
 */
export async function readZip(input) {
  const buffer =
    input instanceof Blob
      ? await input.arrayBuffer()
      : input instanceof Uint8Array
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : input;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find the end-of-central-directory record by scanning back from the end. It
  // is variable length because of the trailing comment, so there is no fixed
  // offset to read.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file.');

  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pointer, true) !== CENTRAL_SIG) {
      throw new Error('Damaged zip: bad central directory.');
    }
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(
      bytes.subarray(pointer + 46, pointer + 46 + nameLength)
    );

    // The local header repeats the name and extra lengths, and they can differ
    // from the central copy, so the data offset must come from the local header.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    // Directory entries are zero-length names ending in a slash; skip them.
    if (!name.endsWith('/')) {
      let content;
      if (method === 0) content = raw;
      else if (method === 8) content = await inflateRaw(raw);
      else throw new Error(`Unsupported compression in ${name} (method ${method}).`);
      entries.push({ name, bytes: content });
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

// --------------------------------------------------------------- the archive

const ARCHIVE_VERSION = 1;
const CLIPS_DIR = 'recorded/';
const META_NAME = 'urdu-clips.json';

const README = `Urdu Learning Games — exported voice recordings
================================================

recorded/  one file per clip, named exactly as the app expects.

To use these on another device
------------------------------
Open the app, go to Grown-ups, and choose Import. Pick this zip file.

To make these the app's built-in voice for everyone
---------------------------------------------------
Refine any clip you like in an audio editor first, keeping the filename the
same. Then either:

  a) open the recording studio on a desktop (npm run record) and use Import,
     which writes the files into the repo for you; or
  b) copy the contents of recorded/ into public/audio/recorded/ by hand.

Either way, finish with:

    npm run audio:manifest
    git add public/audio/recorded content/audio.json
    git commit

Note that committing these publishes your voice to anyone who has the repo.
`;

/**
 * Builds the export archive.
 *
 * @param {{key: string, slug: string, ext: string, blob: Blob, recordedAt?: number}[]} clips
 * @returns {Promise<Blob>}
 */
export async function buildArchive(clips) {
  const encoder = new TextEncoder();
  const entries = [];
  const meta = {
    version: ARCHIVE_VERSION,
    app: 'urdu-learning-games',
    exportedAt: new Date().toISOString(),
    clips: [],
  };

  for (const clip of clips) {
    const name = `${CLIPS_DIR}${clip.slug}.${clip.ext}`;
    const bytes = new Uint8Array(await clip.blob.arrayBuffer());
    entries.push({ name, bytes });
    meta.clips.push({
      key: clip.key,
      slug: clip.slug,
      file: name,
      ext: clip.ext,
      bytes: bytes.length,
      recordedAt: clip.recordedAt ?? null,
    });
  }

  entries.push({
    name: META_NAME,
    bytes: encoder.encode(JSON.stringify(meta, null, 2)),
  });
  entries.push({ name: 'README.txt', bytes: encoder.encode(README) });

  return writeZip(entries);
}

/**
 * Reads an export archive back into clips.
 *
 * Tolerant on purpose. The metadata file is used when present, but clips are
 * recovered from the filenames under recorded/ if it is missing or damaged, so
 * an archive somebody assembled by hand still imports. Unknown slugs are
 * reported rather than dropped silently, since a typo in a hand-edited filename
 * would otherwise look like a successful import of nothing.
 *
 * @param {Blob} blob
 * @param {(slug: string) => string|null} keyForSlug maps a filename back to a
 *   clip key, using the expected list rather than parsing the name.
 * @returns {Promise<{clips: object[], unknown: string[]}>}
 */
export async function readArchive(blob, keyForSlug) {
  const entries = await readZip(blob);
  const clips = [];
  const unknown = [];

  /** @type {Map<string,object>} */
  const meta = new Map();
  const metaEntry = entries.find((e) => e.name === META_NAME);
  if (metaEntry) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(metaEntry.bytes));
      for (const clip of parsed.clips ?? []) meta.set(clip.file, clip);
    } catch {
      // Fall through to filename recovery.
    }
  }

  for (const entry of entries) {
    if (!entry.name.startsWith(CLIPS_DIR)) continue;
    const file = entry.name.slice(CLIPS_DIR.length);
    if (!file || file.includes('/')) continue;

    const dot = file.lastIndexOf('.');
    if (dot < 1) continue;
    const slug = file.slice(0, dot);
    const ext = file.slice(dot + 1).toLowerCase();

    const key = meta.get(entry.name)?.key ?? keyForSlug(slug);
    if (!key) {
      unknown.push(file);
      continue;
    }

    clips.push({
      key,
      slug,
      ext,
      bytes: entry.bytes.length,
      recordedAt: meta.get(entry.name)?.recordedAt ?? null,
      blob: new Blob([entry.bytes]),
    });
  }

  return { clips, unknown };
}
