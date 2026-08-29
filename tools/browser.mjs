/* Chromium launch options shared by the preview tool and the tests. */

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
    // Playwright reports where it *would* have downloaded the browser.
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

/* Whether a browser is actually installed. */
export function hasBrowser() {
  return findChromium() !== null;
}
