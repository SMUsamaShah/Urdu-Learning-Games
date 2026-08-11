/**
 * The export archive has to be a real zip, not something only this code can
 * open. The whole point of the format is that a parent can unzip it, refine a
 * clip in an audio editor, re-zip it and have it still work — so these tests
 * check against the system zip tools, not just against the reader in this repo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildArchive,
  readArchive,
  readZip,
  writeZip,
} from '../src/lib/clip-archive.js';

function have(binary) {
  try {
    execFileSync('which', [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const systemZip = have('zip') && have('unzip');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'urdu-zip-'));
}

async function toFile(blob, file) {
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  return file;
}

const bytesOf = (s) => new TextEncoder().encode(s);

describe('zip writer', () => {
  test('round-trips through its own reader', async () => {
    const entries = [
      { name: 'recorded/letter-be-name.webm', bytes: bytesOf('first clip') },
      { name: 'recorded/word-ammi.webm', bytes: bytesOf('second clip') },
      { name: 'README.txt', bytes: bytesOf('hello') },
    ];
    const back = await readZip(writeZip(entries));
    assert.equal(back.length, 3);
    for (const original of entries) {
      const found = back.find((e) => e.name === original.name);
      assert.ok(found, `${original.name} missing`);
      assert.deepEqual([...found.bytes], [...original.bytes]);
    }
  });

  test('handles an empty archive and binary content', async () => {
    assert.deepEqual(await readZip(writeZip([])), []);

    // Byte values that would be mangled by any accidental text handling.
    const binary = new Uint8Array(256).map((_, i) => i);
    const back = await readZip(writeZip([{ name: 'a.bin', bytes: binary }]));
    assert.deepEqual([...back[0].bytes], [...binary]);
  });

  test(
    'produces an archive the system unzip accepts',
    { skip: systemZip ? false : 'no zip/unzip' },
    async () => {
      const dir = tmpdir();
      const file = await toFile(
        writeZip([
          { name: 'recorded/letter-be-name.webm', bytes: bytesOf('audio bytes') },
          { name: 'urdu-clips.json', bytes: bytesOf('{"version":1}') },
        ]),
        path.join(dir, 'export.zip')
      );

      // -t verifies every CRC. A wrong checksum or offset fails here even
      // though this repo's own reader, which does not check CRCs, would pass.
      const result = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
      assert.match(result, /No errors detected/);

      execFileSync('unzip', ['-q', '-o', file, '-d', path.join(dir, 'out')]);
      assert.equal(
        fs.readFileSync(
          path.join(dir, 'out', 'recorded', 'letter-be-name.webm'),
          'utf8'
        ),
        'audio bytes'
      );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  );

  test(
    'reads a DEFLATE archive produced by the system zip',
    { skip: systemZip ? false : 'no zip/unzip' },
    async () => {
      // This is the edited-and-re-zipped case: a parent unzips an export,
      // trims a clip, and re-zips the folder with an ordinary tool, which will
      // compress. Import has to keep working.
      const dir = tmpdir();
      fs.mkdirSync(path.join(dir, 'recorded'));
      // Repetitive content so zip definitely chooses DEFLATE over STORE.
      const payload = 'urdu '.repeat(400);
      fs.writeFileSync(path.join(dir, 'recorded', 'letter-be-name.webm'), payload);
      execFileSync('zip', ['-q', '-r', '-9', 'edited.zip', 'recorded'], { cwd: dir });

      const blob = new Blob([fs.readFileSync(path.join(dir, 'edited.zip'))]);
      const entries = await readZip(blob);
      const clip = entries.find((e) => e.name === 'recorded/letter-be-name.webm');
      assert.ok(clip, 'clip not found in re-zipped archive');
      assert.equal(new TextDecoder().decode(clip.bytes), payload);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  );
});

describe('clip archive', () => {
  const keyForSlug = (slug) =>
    ({
      'letter-be-name': 'letter/be/name',
      'word-ammi': 'word/ammi',
    })[slug] ?? null;

  test('round-trips clips with their keys intact', async () => {
    const archive = await buildArchive([
      {
        key: 'letter/be/name',
        slug: 'letter-be-name',
        ext: 'webm',
        blob: new Blob([bytesOf('bay')]),
        recordedAt: 1700000000000,
      },
      {
        key: 'word/ammi',
        slug: 'word-ammi',
        ext: 'webm',
        blob: new Blob([bytesOf('ammi')]),
      },
    ]);

    const { clips, unknown } = await readArchive(archive, keyForSlug);
    assert.equal(unknown.length, 0);
    assert.deepEqual(
      clips.map((c) => c.key).sort(),
      ['letter/be/name', 'word/ammi']
    );

    const be = clips.find((c) => c.key === 'letter/be/name');
    assert.equal(await be.blob.text(), 'bay');
    assert.equal(be.recordedAt, 1700000000000);
    assert.equal(be.ext, 'webm');
  });

  test('carries a readme and metadata for whoever opens it', async () => {
    const entries = await readZip(
      await buildArchive([
        {
          key: 'letter/be/name',
          slug: 'letter-be-name',
          ext: 'webm',
          blob: new Blob([bytesOf('bay')]),
        },
      ])
    );
    const names = entries.map((e) => e.name);
    assert.ok(names.includes('README.txt'));
    assert.ok(names.includes('urdu-clips.json'));

    // The path inside the archive must match the repo layout, or promoting a
    // clip would need renaming.
    assert.ok(names.includes('recorded/letter-be-name.webm'));

    const meta = JSON.parse(
      new TextDecoder().decode(entries.find((e) => e.name === 'urdu-clips.json').bytes)
    );
    assert.equal(meta.version, 1);
    assert.equal(meta.clips[0].key, 'letter/be/name');
  });

  test('recovers clips from filenames when the metadata is gone', async () => {
    // An archive somebody assembled by hand, or one whose metadata was lost.
    const archive = writeZip([
      { name: 'recorded/letter-be-name.webm', bytes: bytesOf('bay') },
    ]);
    const { clips } = await readArchive(archive, keyForSlug);
    assert.equal(clips.length, 1);
    assert.equal(clips[0].key, 'letter/be/name');
  });

  test('reports unrecognised filenames instead of silently dropping them', async () => {
    const archive = writeZip([
      { name: 'recorded/letter-be-name.webm', bytes: bytesOf('bay') },
      { name: 'recorded/letter-typo-nam.webm', bytes: bytesOf('oops') },
    ]);
    const { clips, unknown } = await readArchive(archive, keyForSlug);
    assert.equal(clips.length, 1);
    assert.deepEqual(unknown, ['letter-typo-nam.webm']);
  });

  test('ignores anything outside recorded/', async () => {
    const archive = writeZip([
      { name: 'recorded/word-ammi.webm', bytes: bytesOf('ammi') },
      { name: 'notes.txt', bytes: bytesOf('ignore me') },
      { name: 'recorded/nested/deep.webm', bytes: bytesOf('ignore me too') },
    ]);
    const { clips, unknown } = await readArchive(archive, keyForSlug);
    assert.deepEqual(clips.map((c) => c.key), ['word/ammi']);
    assert.equal(unknown.length, 0);
  });
});
