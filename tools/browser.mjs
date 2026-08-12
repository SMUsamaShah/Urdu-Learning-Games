/**
 * Chromium launch options shared by the preview tool and the tests.
 *
 * CI images and dev machines put the browser in different places, so prefer an
 * explicit PLAYWRIGHT_CHROMIUM path, then the preinstalled browser, then let
 * Playwright find its own download.
 */

import fs from 'node:fs';
import { chromium } from 'playwright';

const CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM,
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

function findChromium() {
  const explicit = CANDIDATES.find((p) => p && fs.existsSync(p));
  if (explicit) return explicit;
  try {
    // Playwright reports where it *would* have downloaded the browser, whether
    // or not it actually did, so the path has to be checked rather than trusted.
    const own = chromium.executablePath();
    return own && fs.existsSync(own) ? own : null;
  } catch {
    return null;
  }
}

export function launchOptions() {
  const executablePath = findChromium();
  return {
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(executablePath ? { executablePath } : {}),
  };
}

/**
 * Whether a browser is actually installed.
 *
 * The deploy workflow sets PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, because a Pages
 * build has no reason to carry a 150 MB browser around. Anything in `npm test`
 * that needs one has to say so and skip out loud, rather than throwing from a
 * setup hook — a failed `before()` cancels its subtests, which reads as three
 * mysteriously missing tests and a red build rather than as "no browser here".
 */
export function hasBrowser() {
  return findChromium() !== null;
}
