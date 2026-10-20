import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearTileMatte } from '../src/lib/tile-art.js';

function fixture(matte) {
  const width = 40;
  const height = 44;
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, rgba) => data.set(rgba, (y * width + x) * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      put(x, y, matte);
      // A blue frame enclosing the black/white teaching content.
      if (x >= 2 && x < width - 2 && y >= 3 && y < height - 3) {
        put(x, y, [20, 150, 240, 255]);
      }
      if (x >= 5 && x < width - 5 && y >= 6 && y < height - 6) {
        put(x, y, x < width / 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
      }
    }
  }
  return { data, width, height, put };
}

const pixel = (image, x, y) =>
  [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

describe('transparent tile silhouettes', () => {
  for (const [name, matte] of [
    ['white', [254, 253, 254, 255]],
    ['black', [2, 1, 3, 255]],
    ['transparent', [0, 0, 0, 0]],
  ]) {
    test(`removes ${name} exterior but preserves the blue rim, white card and black letter`, () => {
      const image = fixture(matte);
      const bounds = clearTileMatte(image);
      assert.equal(pixel(image, 1, 1)[3], 0);
      assert.equal(pixel(image, 38, 42)[3], 0);
      assert.deepEqual(pixel(image, 2, 10), [20, 150, 240, 255]);
      assert.deepEqual(pixel(image, 7, 10), [255, 255, 255, 255]);
      assert.deepEqual(pixel(image, 30, 10), [0, 0, 0, 255]);
      assert.deepEqual(bounds, { x: 2, y: 3, width: 36, height: 38 });
    });
  }

  test('does not punch through the centre when the frame has a gap', () => {
    const image = fixture([255, 255, 255, 255]);
    for (let y = 0; y < 20; y++) image.put(10, y, [255, 255, 255, 255]);
    clearTileMatte(image);
    assert.equal(pixel(image, 10, 0)[3], 0);
    assert.equal(pixel(image, 10, 20)[3], 255);
  });

  test('an edge-to-edge colourful illustration is unchanged', () => {
    const image = fixture([20, 150, 240, 255]);
    const before = image.data.slice();
    assert.deepEqual(clearTileMatte(image), { x: 0, y: 0, width: 40, height: 44 });
    assert.deepEqual(image.data, before);
  });

  test('preparation is idempotent', () => {
    const image = fixture([254, 253, 254, 255]);
    const first = clearTileMatte(image);
    const before = image.data.slice();
    assert.deepEqual(clearTileMatte(image), first);
    assert.deepEqual(image.data, before);
  });

  for (const background of [0, 255]) {
    test(`unblends the antialiased rim from a ${background === 0 ? 'black' : 'white'} matte`, () => {
      const image = fixture([background, background, background, 255]);
      const blue = [20, 150, 240];
      image.put(2, 10, [...blue.map((c) => Math.round((c + background) / 2)), 255]);
      clearTileMatte(image);
      const result = pixel(image, 2, 10);
      assert.ok(Math.abs(result[3] - 128) <= 1, `expected half coverage, got ${result[3]}`);
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(result[channel] - blue[channel]) <= 1, 'matte must not tint the blue edge');
      }
    });
  }
});
