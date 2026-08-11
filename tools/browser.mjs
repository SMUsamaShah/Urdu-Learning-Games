/**
 * Chromium launch options shared by the preview tool and the tests.
 *
 * CI images and dev machines put the browser in different places, so prefer an
 * explicit PLAYWRIGHT_CHROMIUM path, then the preinstalled browser, then let
 * Playwright find its own download.
 */

import fs from 'node:fs';

const CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM,
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

export function launchOptions() {
  const executablePath = CANDIDATES.find((p) => p && fs.existsSync(p));
  return {
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(executablePath ? { executablePath } : {}),
  };
}
