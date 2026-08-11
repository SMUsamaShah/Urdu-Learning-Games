/**
 * Integrity checks over the audio clip list and manifest.
 *
 * The recording backlog is normally incomplete, so nothing here asserts that
 * clips exist. What it does assert is that the list of clips the app asks for
 * and the files on disk can never drift apart — a manifest pointing at a file
 * that is not there, or two clips fighting over one filename, would both be
 * silent failures during play.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUDIO_EXTENSIONS,
  ROOT,
  expectedClips,
  readContent,
  resolveClip,
  slugFor,
} from '../tools/audio-keys.mjs';

const clips = expectedClips();
const manifestPath = path.join(ROOT, 'content', 'audio.json');
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : null;

describe('clip list', () => {
  test('covers every letter twice, plus every word and number', () => {
    const { letters } = readContent('letters.json');
    const { words } = readContent('words.json');
    const { numbers } = readContent('numbers.json');

    const count = (prefix) => clips.filter((c) => c.key.startsWith(prefix)).length;
    assert.equal(clips.filter((c) => c.key.endsWith('/name')).length, letters.length);
    assert.equal(clips.filter((c) => c.key.endsWith('/sound')).length, letters.length);
    assert.equal(count('word/'), words.length);
    assert.equal(count('number/'), numbers.length);
    assert.equal(clips.length, letters.length * 2 + words.length + numbers.length);
  });

  test('keys are unique', () => {
    assert.equal(new Set(clips.map((c) => c.key)).size, clips.length);
  });

  test('slugs are unique and filename-safe', () => {
    // Letter ids already contain dashes (do-chashmi-he, bari-ye), so slugifying
    // a key by replacing slashes could in principle collide. It must not.
    const slugs = clips.map((c) => c.slug);
    assert.equal(new Set(slugs).size, slugs.length, 'two clips share a filename');
    for (const slug of slugs) {
      assert.match(slug, /^[A-Za-z0-9._-]+$/, `unsafe filename: ${slug}`);
    }
  });

  test('every clip carries a prompt and a glyph to display', () => {
    for (const clip of clips) {
      assert.ok(clip.say, `${clip.key} has no instruction`);
      assert.ok(clip.urdu, `${clip.key} has no Urdu text`);
      assert.ok(clip.glyph?.kind && clip.glyph?.id, `${clip.key} has no glyph`);
    }
  });

  test('every clip glyph resolves against the baked outlines', () => {
    // The studio draws these. A missing one means recording blind.
    const glyphs = readContent('glyphs.json');
    for (const clip of clips) {
      const { kind, id, form } = clip.glyph;
      const glyph =
        kind === 'letter' ? glyphs.letters[id]?.[form]
        : kind === 'name' ? glyphs.names[id]
        : kind === 'word' ? glyphs.words[id]
        : glyphs.numbers[id];
      assert.ok(glyph?.d, `no baked glyph for ${clip.key} (${kind}/${id})`);
    }
  });

  test('name and sound are never the same clip', () => {
    // The whole reason there are two per letter.
    for (const clip of clips.filter((c) => c.key.endsWith('/name'))) {
      const sound = clip.key.replace(/\/name$/, '/sound');
      assert.ok(
        clips.some((c) => c.key === sound),
        `${clip.key} has no matching sound clip`
      );
      assert.notEqual(slugFor(clip.key), slugFor(sound));
    }
  });
});

describe('manifest', () => {
  test('exists — run `npm run audio:manifest`', () => {
    assert.ok(manifest, 'content/audio.json is missing');
  });

  test('every referenced file is really on disk', () => {
    for (const [key, rel] of Object.entries(manifest.clips)) {
      const file = path.join(ROOT, 'public', rel);
      assert.ok(fs.existsSync(file), `${key} points at missing file ${rel}`);
    }
  });

  test('only references clips the app actually asks for', () => {
    const known = new Set(clips.map((c) => c.key));
    for (const key of Object.keys(manifest.clips)) {
      assert.ok(known.has(key), `manifest has stale key ${key}`);
    }
  });

  test('counts add up', () => {
    const { expected, recorded, tts, missing } = manifest.counts;
    assert.equal(expected, clips.length);
    assert.equal(recorded + tts + missing, expected);
    assert.equal(Object.keys(manifest.clips).length, recorded + tts);
    assert.equal(manifest.missing.length, missing);
  });

  test('is current with what is on disk', () => {
    // Catches a recording added without re-running the manifest builder, which
    // would leave the app silent for a clip that exists.
    for (const clip of clips) {
      const onDisk = resolveClip(clip.slug);
      const inManifest = manifest.clips[clip.key] ?? null;
      assert.equal(
        onDisk?.path ?? null,
        inManifest,
        `${clip.key} is out of sync — run \`npm run audio:manifest\``
      );
    }
  });
});

describe('recorded files', () => {
  test('every audio file present belongs to a known clip', () => {
    // A stray or misnamed file is silently ignored at runtime, which looks
    // exactly like never having recorded it.
    const slugs = new Set(clips.map((c) => c.slug));
    for (const dir of ['recorded', 'tts']) {
      const full = path.join(ROOT, 'public', 'audio', dir);
      if (!fs.existsSync(full)) continue;
      for (const file of fs.readdirSync(full)) {
        if (file.startsWith('.')) continue;
        const ext = path.extname(file).slice(1).toLowerCase();
        const slug = path.basename(file, path.extname(file));
        assert.ok(
          AUDIO_EXTENSIONS.includes(ext),
          `${dir}/${file} has an extension the app will not look for`
        );
        assert.ok(slugs.has(slug), `${dir}/${file} matches no clip`);
      }
    }
  });
});
