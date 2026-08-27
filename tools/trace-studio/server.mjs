/* Local server for the tracing studio. */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR, ROOT } from '../audio-keys.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(ROOT, 'src', 'ui');
const LIB_DIR = path.join(ROOT, 'src', 'lib');
const STROKES_FILE = path.join(CONTENT_DIR, 'strokes.json');
const PORT = Number(process.env.PORT) || 5175;

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

/* The editor, shared with the app so the studio and the tablet run the same code rather than two copies that drift apart. */
const SHARED_UI = {
  'stroke-editor.js': 'text/javascript; charset=utf-8',
  'stroke-editor.css': 'text/css; charset=utf-8',
};

/* Shared with the app from src/lib rather than src/ui. */
const SHARED_LIB = {
  'skeletonise.js': 'text/javascript; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      // A letter's strokes are a few hundred numbers; anything near this is a bug rather than a big letter.
      if (size > 2 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/* Writes one letter back, keeping the file in alphabet order. */
function writeOrdered(current) {
  const { letters } = readJson(path.join(CONTENT_DIR, 'letters.json'));
  const ordered = {};
  for (const letter of letters) {
    if (current.letters[letter.id]) ordered[letter.id] = current.letters[letter.id];
  }
  current.letters = ordered;
  fs.writeFileSync(STROKES_FILE, `${JSON.stringify(current, null, 2)}\n`);
}

function saveLetter(letterId, strokes) {
  const current = readJson(STROKES_FILE);
  current.letters[letterId] = { strokes, ...(strokes.length ? { corrected: true } : {}) };
  writeOrdered(current);
}

/** Merges a phone or tablet export into content/strokes.json.
 * @returns {{merged: string[], error?: string}}
 */
function importExport(file) {
  const glyphs = readJson(path.join(CONTENT_DIR, 'glyphs.json'));
  const current = readJson(STROKES_FILE);

  if (file?.kind !== 'urdu-traces' || !file.letters) {
    return { merged: [], error: 'that is not a traces export' };
  }
  if (!file.font?.sha) {
    return { merged: [], error: 'the export does not say which font it was drawn for' };
  }
  if (file.font.sha !== glyphs.font?.sha) {
    return {
      merged: [],
      error:
        `drawn for ${file.font.file ?? 'another font'} (${file.font.sha}), ` +
        `and the app now ships ${glyphs.font?.file} (${glyphs.font?.sha}). ` +
        'Those paths sit beside the letters in this font — re-seed and redraw them.',
    };
  }
  if (file.upem && file.upem !== glyphs.upem) {
    return { merged: [], error: `the export is in ${file.upem} units per em, not ${glyphs.upem}` };
  }

  const merged = [];
  for (const [letterId, entry] of Object.entries(file.letters)) {
    if (!glyphs.letters[letterId]?.isolated) {
      return { merged: [], error: `no glyph for "${letterId}"` };
    }
    const bad = (entry.strokes ?? []).findIndex((s) =>
      s.kind === 'dab' ? s.points?.length !== 1 : !(s.points?.length >= 2)
    );
    if (!Array.isArray(entry.strokes) || bad >= 0) {
      return { merged: [], error: `${letterId} stroke ${bad + 1} is not usable` };
    }
    current.letters[letterId] = { strokes: entry.strokes, corrected: true };
    merged.push(letterId);
  }

  // Nothing is written until every letter has passed.
  if (merged.length) writeOrdered(current);
  return { merged };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  try {
    if (req.method === 'GET' && STATIC[route]) {
      const [file, type] = STATIC[route];
      return send(res, 200, fs.readFileSync(path.join(HERE, file)), type);
    }

    // Browsers ask for this unprompted; answering keeps a spurious 404 out of the console.
    if (route === '/favicon.ico') return send(res, 204, '');

    if (req.method === 'GET' && route.startsWith('/lib/')) {
      const name = route.slice('/lib/'.length);
      const dir = SHARED_UI[name] ? UI_DIR : SHARED_LIB[name] ? LIB_DIR : null;
      const type = SHARED_UI[name] ?? SHARED_LIB[name];
      if (!dir) return send(res, 404, 'not found');
      return send(res, 200, fs.readFileSync(path.join(dir, name)), type);
    }

    // The same baked outlines the game draws from, so a path corrected here sits on exactly the letter the child will see.
    for (const [name, file] of [
      ['/glyphs.json', 'glyphs.json'],
      ['/letters.json', 'letters.json'],
      ['/api/strokes', 'strokes.json'],
    ]) {
      if (req.method === 'GET' && route === name) {
        return send(
          res,
          200,
          fs.readFileSync(path.join(CONTENT_DIR, file)),
          'application/json; charset=utf-8'
        );
      }
    }

    if (req.method === 'POST' && route.startsWith('/api/strokes/')) {
      const letterId = decodeURIComponent(route.slice('/api/strokes/'.length));
      const glyphs = readJson(path.join(CONTENT_DIR, 'glyphs.json'));
      if (!glyphs.letters[letterId]?.isolated) {
        return sendJson(res, 404, { error: `no glyph for "${letterId}"` });
      }
      const { strokes } = JSON.parse((await readBody(req)).toString('utf8'));
      if (!Array.isArray(strokes)) return sendJson(res, 400, { error: 'strokes must be an array' });
      saveLetter(letterId, strokes);
      console.log(`  saved ${letterId}: ${strokes.length} stroke(s)`);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && route === '/api/import') {
      const body = await readBody(req);
      if (body.length === 0) return sendJson(res, 400, { error: 'empty body' });
      const { merged, error } = importExport(JSON.parse(body.toString('utf8')));
      if (error) {
        console.log(`  import refused: ${error}`);
        // 409 rather than 400: the file is well-formed, it just does not belong with what is in the repo.
        return sendJson(res, 409, { error });
      }
      console.log(`  imported ${merged.length} letter(s): ${merged.join(', ')}`);
      return sendJson(res, 200, { merged });
    }

    return send(res, 404, 'not found');
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: String(error.message ?? error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const strokes = readJson(STROKES_FILE);
  const total = Object.keys(strokes.letters).length;
  const done = Object.values(strokes.letters).filter((l) => l.corrected).length;
  console.log(`Tracing studio: http://localhost:${PORT}`);
  console.log(`${total} letters seeded, ${done} corrected. Writing to content/strokes.json`);
});
