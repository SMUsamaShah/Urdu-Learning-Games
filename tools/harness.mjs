/* Opening and closing a verification run, once. */

import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const DEFAULT_APP = 'http://localhost:5173';

/* Progress, unbuffered, so a hang shows which line it hung on. */
export const step = (message) => process.stderr.write(`· ${message}\n`);

/* Records a failure without stopping: one run should report everything wrong. */
export const fail = (message) => {
  console.error('FAIL: ' + message);
  process.exitCode = 1;
};

/** Starts a run.
 * @param {object} config
 * @param {string} config.name what this verifies, for the closing line
 * @param {string} [config.url] where the app is.
 * @param {number} [config.timeoutMs=240000] watchdog.
 * @param {object} [config.context] Playwright browser-context options, spread
 * @param {string[]} [config.args] extra Chromium flags.
 * @param {boolean} [config.open=true] whether to navigate anywhere.
 * @param {boolean} [config.waitForHome=true] whether to wait for the menu.
 * @returns {Promise<object>} Handles for the verification run.
 */
export async function openApp(config) {
  const {
    name,
    url = process.env.APP_URL || process.argv[2] || DEFAULT_APP,
    timeoutMs = 240000,
    context: contextOptions = {},
    args = [],
    open = true,
    waitForHome = true,
  } = config;

  // Skipping out loud rather than throwing from a launch.
  if (!hasBrowser()) {
    console.log(`no Chromium installed, skipping ${name} verification`);
    process.exit(0);
  }

  const watchdog = setTimeout(() => {
    console.error(`FAIL: ${name} verification timed out after ${timeoutMs / 1000}s`);
    process.exit(1);
  }, timeoutMs);
  watchdog.unref();

  const options = launchOptions();
  const browser = await chromium.launch({
    ...options,
    args: [...options.args, ...args],
  });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    ...contextOptions,
  });

  /** @type {string[]} */
  const errors = [];

  /* A page whose errors are collected with everything else. */
  const newPage = async () => {
    const created = await context.newPage();
    created.on('pageerror', (e) => errors.push(String(e)));
    created.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    return created;
  };

  const page = await newPage();

  if (open) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (waitForHome) await homeIsUp(page);
  }

  /** Reports, closes and exits.
 * @param {object} [options]
 * @param {boolean} [options.ignoreErrors] Ignore collected page errors.
 */
  const finish = async ({ ignoreErrors = false } = {}) => {
    if (!ignoreErrors && errors.length) {
      for (const e of errors) console.error('  console: ' + e);
      fail(`${errors.length} console error(s)`);
    }
    await browser.close();
    clearTimeout(watchdog);
    console.log(
      process.exitCode
        ? `${name} verification FAILED`
        : `${name} verification passed`
    );
    process.exit(process.exitCode ?? 0);
  };

  return { browser, context, page, newPage, errors, finish, url };
}

/* Waits for the menu to be running. */
export function homeIsUp(page, timeout = 30000) {
  return page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout,
  });
}

/* Switches to a scene, stopping whatever is running first. */
export async function startScene(page, key) {
  await page.evaluate((k) => {
    const game = window.__game;
    game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
    game.scene.start(k);
  }, key);
  await page.waitForFunction((k) => window.__game?.scene.isActive(k), key, {
    timeout: 20000,
  });
}
