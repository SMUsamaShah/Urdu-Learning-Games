/**
 * Local server for the recording studio.
 *
 * Recording ~120 clips needs the files to land straight in the repo. The
 * File System Access API could do it without a server but is Chrome-only, and
 * downloading 120 blobs by hand is not a workflow. So: a tiny server that
 * accepts a POST per clip and writes it into public/audio/recorded/.
 *
 * Deliberately dependency-free and bound to localhost — it writes files to
 * disk, so it must not be reachable from anywhere else.
 *
 * Usage: npm run record
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_EXTENSIONS,
  CONTENT_DIR,
  RECORDED_DIR,
  ROOT,
  expectedClips,
  resolveClip,
} from '../audio-keys.mjs';
import { readArchive } from '../../src/lib/clip-archive.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB_DIR = path.join(ROOT, 'src', 'lib');
const PORT = Number(process.env.PORT) || 5174;

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

/**
 * Modules shared with the app, served so the studio and the in-app recorder run
 * the same microphone code rather than two copies that drift apart.
 * Allow-listed by name: this serves files from src/, so a path from the URL must
 * never reach the filesystem.
 */
const SHARED_LIB = new Set([
  'recorder.js',
  'clip-list.js',
  'clip-archive.js',
  'take-polish.js',
]);

const AUDIO_MIME = {
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
};

fs.mkdirSync(RECORDED_DIR, { recursive: true });

/** Rejects anything that is not a slug we generated ourselves. */
function isSafeSlug(slug) {
  return /^[A-Za-z0-9._-]+$/.test(slug) && !slug.includes('..');
}

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
      // A spoken word is a few tens of KB; anything near this is a bug.
      if (size > 25 * 1024 * 1024) {
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

/** Deletes any existing recording for a slug, whatever extension it used. */
function removeRecording(slug) {
  let removed = 0;
  for (const ext of AUDIO_EXTENSIONS) {
    const file = path.join(RECORDED_DIR, `${slug}.${ext}`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      removed++;
    }
  }
  return removed;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  try {
    if (req.method === 'GET' && STATIC[route]) {
      const [file, type] = STATIC[route];
      return send(res, 200, fs.readFileSync(path.join(HERE, file)), type);
    }

    // Browsers request this unprompted; answering avoids a spurious 404 in the
    // console that would otherwise fail the verification run.
    if (route === '/favicon.ico') return send(res, 204, '');

    if (req.method === 'GET' && route.startsWith('/lib/')) {
      const name = route.slice('/lib/'.length);
      if (!SHARED_LIB.has(name)) return send(res, 404, 'not found');
      return send(
        res,
        200,
        fs.readFileSync(path.join(LIB_DIR, name)),
        'text/javascript; charset=utf-8'
      );
    }

    // The studio renders its prompts from the same baked outlines the game
    // uses, so what you read is exactly what the child will see.
    if (req.method === 'GET' && route === '/glyphs.json') {
      return send(
        res,
        200,
        fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json')),
        'application/json; charset=utf-8'
      );
    }

    if (req.method === 'GET' && route === '/api/clips') {
      const clips = expectedClips().map((clip) => ({
        ...clip,
        recorded: resolveClip(clip.slug)?.source === 'recorded'
          ? resolveClip(clip.slug).path
          : null,
      }));
      return sendJson(res, 200, { clips });
    }

    // Play back what is already on disk.
    if (req.method === 'GET' && route.startsWith('/audio/')) {
      const rel = route.slice('/audio/'.length);
      const file = path.join(path.dirname(RECORDED_DIR), rel);
      if (!file.startsWith(path.dirname(RECORDED_DIR)) || !fs.existsSync(file)) {
        return send(res, 404, 'not found');
      }
      const ext = path.extname(file).slice(1).toLowerCase();
      return send(res, 200, fs.readFileSync(file), AUDIO_MIME[ext] || 'application/octet-stream');
    }

    /**
     * Promotes an export from a phone into the repo.
     *
     * Recordings made in the app live on that device. This is the bridge: hand
     * the exported zip to the studio and the clips land in
     * public/audio/recorded/, ready to refine and commit as the voice everyone
     * gets. Doing it here rather than by hand means no unzipping, no renaming
     * and no chance of a file ending up in the wrong place.
     */
    if (req.method === 'POST' && route === '/api/import') {
      const body = await readBody(req);
      if (body.length === 0) return send(res, 400, 'empty body');

      const known = new Map(expectedClips().map((c) => [c.slug, c]));
      const { clips, unknown } = await readArchive(
        new Blob([body]),
        (slug) => known.get(slug)?.key ?? null
      );

      const written = [];
      for (const clip of clips) {
        const ext = clip.ext.toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) {
          unknown.push(`${clip.slug}.${clip.ext}`);
          continue;
        }
        // Drop any previous take so a re-record in a different container does
        // not leave two files that both resolve for the same clip.
        removeRecording(clip.slug);
        const name = `${clip.slug}.${ext}`;
        fs.writeFileSync(
          path.join(RECORDED_DIR, name),
          Buffer.from(await clip.blob.arrayBuffer())
        );
        written.push(name);
      }

      console.log(`imported ${written.length} clip(s) into public/audio/recorded/`);
      if (written.length) console.log('Run `npm run audio:manifest` to pick them up.');
      return sendJson(res, 200, { written, unknown });
    }

    if (route.startsWith('/api/clip/')) {
      const slug = decodeURIComponent(route.slice('/api/clip/'.length));
      if (!isSafeSlug(slug)) return send(res, 400, 'bad slug');

      const known = expectedClips().some((c) => c.slug === slug);
      if (!known) return send(res, 404, 'unknown clip');

      if (req.method === 'DELETE') {
        return sendJson(res, 200, { removed: removeRecording(slug) });
      }

      if (req.method === 'POST') {
        const ext = (url.searchParams.get('ext') || 'webm').toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) return send(res, 400, 'bad extension');

        const body = await readBody(req);
        if (body.length === 0) return send(res, 400, 'empty body');

        // Drop any previous take so a re-record in a different container does
        // not leave two files that both resolve for the same clip.
        removeRecording(slug);
        const name = `${slug}.${ext}`;
        fs.writeFileSync(path.join(RECORDED_DIR, name), body);
        console.log(`saved ${name} (${(body.length / 1024).toFixed(1)} KB)`);
        return sendJson(res, 200, { path: `audio/recorded/${name}`, bytes: body.length });
      }
    }

    send(res, 404, 'not found');
  } catch (error) {
    console.error(error);
    send(res, 500, String(error.message ?? error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const total = expectedClips().length;
  console.log(`Recording studio: http://localhost:${PORT}`);
  console.log(`${total} clips. Writing to public/audio/recorded/`);
  console.log('Run `npm run audio:manifest` when finished.');
});
