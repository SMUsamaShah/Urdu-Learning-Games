/* The background cut, against images built to break it. */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from '../tools/browser.mjs';
import { cutLooksWrong, openCutter } from '../tools/cutout.mjs';

const SKIP = hasBrowser()
  ? false
  : 'no Chromium installed — run `npx playwright install chromium` to run this';

/* Draws a PNG in a browser, so the test does not need an image encoder. */
async function drawPng(page, draw) {
  const dataUrl = await page.evaluate((source) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    // eslint-disable-next-line no-new-func
    new Function('ctx', source)(ctx);
    return canvas.toDataURL('image/png');
  }, draw);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/* Alpha at a point of the cut result, read back through a canvas. */
async function alphaAt(page, webp, size, x, y) {
  return page.evaluate(
    async ([src, px, py]) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(px, py, 1, 1).data[3];
    },
    ['data:image/webp;base64,' + webp.toString('base64'), x, y]
  );
}

describe('background cut', { skip: SKIP }, () => {
  let browser;
  let page;
  let cutter;

  before(async () => {
    browser = await chromium.launch(launchOptions());
    page = await browser.newPage();
    cutter = await openCutter();
  });

  after(async () => {
    await cutter?.close();
    await browser?.close();
  });

  test('white inside the subject survives, white outside it does not', async () => {
    // A football: a saturated disc with white patches inside it.
    const png = await drawPng(
      page,
      `ctx.fillStyle = '#ffffff';
       ctx.fillRect(0, 0, 256, 256);
       ctx.fillStyle = '#1a7f3c';
       ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI * 2); ctx.fill();
       ctx.fillStyle = '#ffffff';
       ctx.beginPath(); ctx.arc(128, 128, 26, 0, Math.PI * 2); ctx.fill();`
    );

    const { webp, clearedRatio } = await cutter.cut(png, 256);

    assert.equal(await alphaAt(page, webp, 256, 6, 6), 0, 'the corner should be gone');
    assert.ok(
      (await alphaAt(page, webp, 256, 128, 128)) > 250,
      'the white patch inside the disc should have survived'
    );
    assert.ok(
      (await alphaAt(page, webp, 256, 128, 60)) > 250,
      'the subject itself should have survived'
    );
    assert.ok(!cutLooksWrong(clearedRatio), `cleared ${clearedRatio}, which looks wrong`);
  });

  test('a picture with no background to remove is reported as wrong', async () => {
    const png = await drawPng(
      page,
      `ctx.fillStyle = '#1a7f3c'; ctx.fillRect(0, 0, 256, 256);`
    );
    const { clearedRatio } = await cutter.cut(png, 256);
    assert.equal(clearedRatio, 0);
    assert.ok(cutLooksWrong(clearedRatio));
  });

  test('a picture that is all background is reported as wrong', async () => {
    const png = await drawPng(
      page,
      `ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);`
    );
    const { clearedRatio } = await cutter.cut(png, 256);
    assert.ok(clearedRatio > 0.97);
    assert.ok(cutLooksWrong(clearedRatio));
  });
});
