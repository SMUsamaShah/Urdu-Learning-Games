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

/* Which font a set of outlines came from, recorded alongside them. */
export function fontFingerprint() {
  const bytes = fs.readFileSync(FONT_WOFF2);
  return {
    file: path.basename(FONT_WOFF2),
    sha: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12),
  };
}
