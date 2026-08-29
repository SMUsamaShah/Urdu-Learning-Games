import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The typeface, and the only place in the repo that names one. */
export const FONT_WOFF2 = path.join(
  ROOT,
  'node_modules/alqalam-taj-nastaliq/fonts/alqalam-taj-nastaliq.woff2'
);

/* Noto has reliable per-letter clusters for coloured joined words. */
export const WORD_FONT_WOFF2 = path.join(
  ROOT,
  'node_modules/@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-400-normal.woff2'
);

/* Which font a set of outlines came from, recorded alongside them. */
function fingerprint(file) {
  const bytes = fs.readFileSync(file);
  return {
    file: path.basename(file),
    sha: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12),
  };
}

export function fontFingerprint() {
  return fingerprint(FONT_WOFF2);
}

export function wordFontFingerprint() {
  return fingerprint(WORD_FONT_WOFF2);
}
