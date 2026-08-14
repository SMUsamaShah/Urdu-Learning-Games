/**
 * Local server for the tracing studio.
 *
 * The seeder in tools/seed-strokes.mjs gets a pen path roughly right and cannot
 * get it right: thinning knows nothing about writing, so it cannot say which
 * end a stroke starts from or what order the strokes come in. Somebody who
 * writes Urdu has to say. This is where they say it.
 *
 * Patterned on tools/record-studio/, which solves the same shape of problem —
 * a browser is the only sane place to draw, and the result has to land in the
 * repo. Dependency-free and bound to localhost, because it writes files.
 *
 * Unlike the recording studio this serves nothing out of src/lib. It draws the
 * letter from the baked `d` string in glyphs.json, and an SVG path and a canvas
 * Path2D take that same string — so there is no rendering code to share and no
 * reason to expose src/ over HTTP.
 *
 * Usage: npm run trace-studio
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR } from '../audio-keys.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STROKES_FILE = path.join(CONTENT_DIR, 'strokes.json');
const PORT = Number(process.env.PORT) || 5175;

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
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
      // A letter's strokes are a few hundred numbers; anything near this is a
      // bug rather than a big letter.
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

/**
 * Writes one letter back, keeping the file in alphabet order.
 *
 * Whole-file rewrite rather than a patch: it is 38 entries, and a diff that
 * shows only the letter that changed is worth more here than saving a few
 * milliseconds. Order comes from letters.json so a save never reshuffles the
 * file and makes the diff unreadable.
 */
function saveLetter(letterId, strokes) {
  const current = readJson(STROKES_FILE);
  const { letters } = readJson(path.join(CONTENT_DIR, 'letters.json'));
  current.letters[letterId] = { strokes, ...(strokes.length ? { corrected: true } : {}) };

  const ordered = {};
  for (const letter of letters) {
    if (current.letters[letter.id]) ordered[letter.id] = current.letters[letter.id];
  }
  current.letters = ordered;
  fs.writeFileSync(STROKES_FILE, `${JSON.stringify(current, null, 2)}\n`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  try {
    if (req.method === 'GET' && STATIC[route]) {
      const [file, type] = STATIC[route];
      return send(res, 200, fs.readFileSync(path.join(HERE, file)), type);
    }

    // Browsers ask for this unprompted; answering keeps a spurious 404 out of
    // the console.
    if (route === '/favicon.ico') return send(res, 204, '');

    // The same baked outlines the game draws from, so a path corrected here
    // sits on exactly the letter the child will see.
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
