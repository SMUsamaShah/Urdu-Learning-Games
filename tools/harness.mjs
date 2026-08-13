/**
 * Opening and closing a verification run, once.
 *
 * Nine `verify-*.mjs` scripts each began with the same twenty-five lines —
 * launch Chromium, make a page, collect page errors and console errors, go to
 * the app, wait for Home, arm a watchdog — and ended with the same twelve:
 * report the collected errors, close the browser, print passed or FAILED, exit
 * with the right code. That is not nine scripts' worth of decisions, it is one,
 * copied nine times and drifting.
 *
 * Drifting in ways that mattered. Some scripts collected console errors and
 * some only page errors, so a `console.error` was a failure in one file and
 * invisible in the next. Some cleared the watchdog before exiting and some
 * left it armed. And `verify-audio.mjs` waited for `networkidle` against a dev
 * server whose HMR socket never goes idle, so it timed out every time — a
 * verifier that cannot pass is worse than no verifier, because it stops being
 * read.
 *
 * ## What a verifier is left holding
 *
 * `openApp()` and `finish()`, and in between only the part that is actually
 * about the thing being verified. Everything shared is decided here:
 *
 *   - **Wait on the game, not the network.** `domcontentloaded`, then a poll
 *     for `window.__game` running Home. A Phaser app with a service worker and
 *     an audio context has no quiet moment for `networkidle` to find.
 *   - **Console errors count.** A message the app logs as an error is an error;
 *     letting one script ignore them is how a real fault stays quiet for weeks.
 *   - **A watchdog always.** These run in CI. A verifier that hangs holds a
 *     runner until something else kills it, with no output saying why.
 */

import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const DEFAULT_APP = 'http://localhost:5173';

/**
 * Progress, unbuffered, so a hang shows which line it hung on.
 *
 * Exported as well as returned by openApp, because half of these scripts start
 * a server before they start a browser and want to say so.
 */
export const step = (message) => process.stderr.write(`· ${message}\n`);

/** Records a failure without stopping: one run should report everything wrong. */
export const fail = (message) => {
  console.error('FAIL: ' + message);
  process.exitCode = 1;
};

/**
 * Starts a run.
 *
 * @param {object} config
 * @param {string} config.name what this verifies, for the closing line
 *   ("game", "offline"). Used as `<name> verification passed`.
 * @param {string} [config.url] where the app is. Defaults to $APP_URL, then the
 *   first command-line argument, then localhost:5173.
 * @param {number} [config.timeoutMs=240000] watchdog.
 * @param {object} [config.context] Playwright browser-context options, spread
 *   over a default 1180x820 viewport — `deviceScaleFactor` for a sharper
 *   screenshot, `acceptDownloads` for the checks that export a file.
 * @param {string[]} [config.args] extra Chromium flags.
 * @param {boolean} [config.open=true] whether to navigate anywhere. Off for the
 *   checks that start a server of their own and navigate to that.
 * @param {boolean} [config.waitForHome=true] whether to wait for the menu. Off
 *   for the pages that are not the game — the recording studio is its own app.
 * @returns {Promise<{browser, context, page, newPage: Function,
 *   errors: string[], finish: Function, url: string}>} `step` and `fail` are
 *   plain exports rather than part of this — half these scripts want them
 *   before there is a browser to speak of.
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

  // Skipping out loud rather than throwing from a launch: a Pages build sets
  // PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD and has no browser, and "no Chromium" is a
  // different thing from "the app is broken".
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

  /**
   * A page whose errors are collected with everything else.
   *
   * Always go through this rather than `context.newPage()`. A second page —
   * the recording studio, opened alongside the app — used to be created
   * directly, so anything it threw went nowhere.
   */
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

  /**
   * Reports, closes and exits. Nothing after this runs.
   *
   * @param {object} [options]
   * @param {boolean} [options.ignoreErrors] for the checks that deliberately
   *   provoke errors and have already inspected them.
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

/** Waits for the menu to be running. */
export function homeIsUp(page, timeout = 30000) {
  return page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout,
  });
}

/**
 * Switches to a scene, stopping whatever is running first.
 *
 * `scene.start` from another scene is fine, but driving from outside there may
 * be several scenes awake — the menu plus whatever was last opened — and
 * starting a third leaves the others updating underneath it. Three scripts had
 * their own copy of this, and one of them had it slightly wrong.
 */
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
