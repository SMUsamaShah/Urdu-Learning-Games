/**
 * The settings screen, behind the parental gate.
 *
 * ## Why it is a list of rows and not a panel of controls
 *
 * Everything an adult can change used to live in a single strip along the top
 * of the recording screen: a tune picker, a frame-rate checkbox, and buttons
 * for sound check, updates, export and import, all in a row above a list of a
 * hundred and twenty clips. Each control was individually reasonable and the
 * whole was unreadable — nothing said which of them belonged together, and the
 * recorder, by far the biggest thing here, looked like one setting among seven.
 *
 * This follows the shape the reference apps use, which is worth copying because
 * it is the shape every phone's own settings uses and so needs no learning:
 *
 *   - One scrolling list of rows, grouped under quiet headings.
 *   - A row is a **label** and one of three things on the right: a **switch**
 *     for something on or off, a **value and a chevron** for something with a
 *     choice behind it, or a **chevron** for a page.
 *   - No icons, no explanatory paragraph under each row. A settings list where
 *     every row explains itself is a list nobody reads. Where a note is
 *     genuinely needed it goes on the page, not the row.
 *   - Anything bigger than a switch gets its own page, reached and left by one
 *     obvious arrow.
 *
 * The recorder is the one page not built here: it owns a microphone, a clip
 * store and a zip writer, and is loaded on demand — see openPage().
 *
 * Plain DOM over the Phaser canvas, like the recorder: this is adult-facing and
 * wants real switches, scrolling and a file picker.
 */

import './settings.css';
import { setShowFps, showFps } from '../lib/fps.js';
import { checkForUpdate } from '../lib/updates.js';
import { currentTune, musicOn, setMusicOn, setTune, tuneNames } from '../lib/music.js';
import { stopAll } from '../lib/audio.js';
import { summaries } from '../lib/clip-store.js';
import { expectedClips } from '../lib/clip-list.js';
import { letters, numbers, words } from '../lib/content.js';
import { reset as resetProgressTotal, state as progressState } from '../lib/progress.js';

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

/** A tune's short name, without the description the chooser shows. */
const tuneName = (id) =>
  (tuneNames().find((t) => t.id === id)?.name ?? id).split('—')[0].trim();

/**
 * Opens the settings screen.
 *
 * @param {{onClose?: () => void}} [options]
 * @returns {() => void} closes it
 */
export function openSettings({ onClose } = {}) {
  const root = el(`
    <div class="set-root" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="set-head">
        <button type="button" class="set-back" data-act="back" aria-label="Back">←</button>
        <h2 class="set-title">Settings</h2>
        <button type="button" class="set-close" data-act="close" aria-label="Close">×</button>
      </div>
      <div class="set-body"></div>
    </div>`);

  const bodyEl = root.querySelector('.set-body');
  const titleEl = root.querySelector('.set-title');
  const backEl = root.querySelector('.set-back');

  /** The open page's teardown, if it has one. Only the recorder does. */
  let disposePage = null;
  /** Which page is showing, or null for the list. */
  let current = null;

  function clearBody() {
    disposePage?.();
    disposePage = null;
    bodyEl.replaceChildren();
  }

  // ------------------------------------------------------------------ rows

  /** `label ————— [switch]` */
  const switchRow = (act, label, on) => `
    <label class="set-row">
      <span class="set-row-label">${escapeHtml(label)}</span>
      <input type="checkbox" class="set-switch" data-act="${act}" ${on ? 'checked' : ''} />
    </label>`;

  /** `label ————— value ›` */
  const pageRow = (page, label, value = '') => `
    <button type="button" class="set-row" data-page="${page}">
      <span class="set-row-label">${escapeHtml(label)}</span>
      <span class="set-row-value">${escapeHtml(value)}</span>
      <span class="set-row-chevron" aria-hidden="true">›</span>
    </button>`;

  /** A row that does something rather than going somewhere. */
  const actionRow = (act, label, value = '') => `
    <button type="button" class="set-row" data-act="${act}">
      <span class="set-row-label">${escapeHtml(label)}</span>
      <span class="set-row-value" data-role="${act}-value">${escapeHtml(value)}</span>
    </button>`;

  const group = (heading, rows) =>
    `<div class="set-group">${escapeHtml(heading)}</div><div class="set-card">${rows.join('')}</div>`;

  // ------------------------------------------------------------------ list

  function showList() {
    clearBody();
    current = null;
    titleEl.textContent = 'Settings';
    backEl.setAttribute('aria-label', 'Close');

    bodyEl.append(
      el(`<div class="set-list">
        ${group('Sound', [
          switchRow('music', 'Background music', musicOn()),
          pageRow('tune', 'Tune', tuneName(currentTune())),
          pageRow('check', 'Sound check'),
        ])}
        ${group('Voice', [pageRow('recordings', 'Your recordings', '…')])}
        ${group('Progress', [
          actionRow('progress', 'Level reached', progressSummary()),
          actionRow('reset-progress', 'Start again from level 1'),
        ])}
        ${group('App', [
          actionRow('update', 'Check for update'),
          switchRow('fps', 'Show frame rate', showFps()),
        ])}
      </div>`)
    );

    // Filled in after the list is on screen: it reads IndexedDB, and waiting on
    // it would leave the whole list blank for as long as that takes.
    countRecordings();
  }

  /** How far the child has got, for the row above the reset. */
  function progressSummary() {
    const { level, step, steps } = progressState();
    return `Level ${level + 1} · ${step} of ${steps}`;
  }

  /**
   * Wipes the total.
   *
   * Confirmed first, and worded as what it does rather than as "are you sure".
   * This is the only destructive thing on the screen and the only one a parent
   * could plausibly hit by accident while looking for the tune.
   */
  function resetProgress() {
    if (!window.confirm('Start again from level 1? This clears all progress on this device.')) {
      return;
    }
    resetProgressTotal();
    const row = bodyEl.querySelector('[data-role="progress-value"]');
    if (row) row.textContent = progressSummary();
  }

  async function countRecordings() {
    const row = bodyEl.querySelector('[data-page="recordings"] .set-row-value');
    if (!row) return;
    try {
      const recorded = (await summaries()).length;
      const total = expectedClips({ letters, numbers, words }).length;
      row.textContent = recorded ? `${recorded} of ${total}` : 'None yet';
    } catch {
      row.textContent = '';
    }
  }

  // ----------------------------------------------------------------- pages

  const PAGE_TITLES = {
    tune: 'Tune',
    check: 'Sound check',
    recordings: 'Your recordings',
  };

  async function openPage(id) {
    clearBody();
    current = id;
    titleEl.textContent = PAGE_TITLES[id] ?? 'Settings';
    backEl.setAttribute('aria-label', 'Back');

    if (id === 'tune') return void bodyEl.append(tunePage());
    if (id === 'check') return void openSoundCheck();

    if (id === 'recordings') {
      // Loaded here rather than with the rest: the recorder pulls in its own
      // stylesheet, the zip archive and the take-polishing code, none of which
      // somebody who came to change the music should have to download.
      const holder = el('<div class="set-page set-loading">Loading…</div>');
      bodyEl.append(holder);
      const { buildRecorderPage } = await import('./recorder.js');
      // Closed or navigated away while it was loading.
      if (closed || current !== id) return;
      const built = buildRecorderPage();
      disposePage = built.dispose;
      holder.replaceWith(built.el);
    }
  }

  /**
   * The five pieces, as a list with a tick on the chosen one.
   *
   * A list rather than a drop-down because this is the one setting somebody is
   * likely to browse — each tune has a character worth reading before picking,
   * and a native select on a phone hides four of the five behind a tap.
   */
  function tunePage() {
    const page = el(`
      <div class="set-list">
        <div class="set-card">
          ${tuneNames()
            .map(({ id, name }) => {
              const [short, ...rest] = name.split('—');
              return `<button type="button" class="set-row" data-tune="${id}"
                aria-checked="${id === currentTune()}" role="radio">
                <span class="set-row-label">${escapeHtml(short.trim())}
                  <span class="set-row-sub">${escapeHtml(rest.join('—').trim())}</span>
                </span>
                <span class="set-row-tick" aria-hidden="true">✓</span>
              </button>`;
            })
            .join('')}
        </div>
        <p class="set-note" data-role="tune-note">
          Each tune is played on its own instrument, so a change takes a moment
          to load the first time.
        </p>
      </div>`);
    return page;
  }

  async function openSoundCheck() {
    const holder = el('<div class="set-page set-loading">Loading…</div>');
    bodyEl.append(holder);
    const { buildSoundCheck } = await import('./audio-check.js');
    if (closed || current !== 'check') return;
    const clips = expectedClips({ letters, numbers, words });
    const say = new Map(clips.map((c) => [c.key, c.say]));
    const page = el('<div class="set-page"></div>');
    page.append(buildSoundCheck((key) => say.get(key) ?? key));
    page.append(
      el(`<p class="set-note">
        Plays a few clips in a row, so you can hear whether the voice comes
        through clearly on this device.
      </p>`)
    );
    holder.replaceWith(page);
    disposePage = () => stopAll();
  }

  // --------------------------------------------------------------- actions

  /**
   * Switches the background tune.
   *
   * Each tune has its own sampled instrument, so this is a fetch, a decode and
   * a reverb render rather than a change of notes — a visible moment on a cold
   * cache, and a control that appears to do nothing for two seconds is one
   * people press twice. The whole list is held while it works.
   */
  async function chooseTune(id) {
    const note = root.querySelector('[data-role="tune-note"]');
    const rows = [...root.querySelectorAll('[data-tune]')];
    if (id === currentTune()) return;

    for (const row of rows) row.disabled = true;
    if (note) note.textContent = `Loading ${tuneName(id)}…`;
    try {
      await setTune(id);
      for (const row of rows) {
        row.setAttribute('aria-checked', String(row.dataset.tune === currentTune()));
      }
      if (note) {
        note.textContent = musicOn()
          ? `Now playing ${tuneName(id)}.`
          : `${tuneName(id)} will play once background music is switched on.`;
      }
    } catch {
      if (note) note.textContent = 'That tune could not be loaded.';
    } finally {
      for (const row of rows) row.disabled = false;
    }
  }

  function checkUpdate() {
    const value = root.querySelector('[data-role="update-value"]');
    if (!value) return;
    value.textContent = 'Checking…';
    const said = {
      checked: 'Checked',
      // Offline is this app's normal state, so this has to be distinguishable
      // from "checked, nothing new". Reporting the second when the first
      // happened is how somebody concludes they are on the latest build when
      // nobody ever asked the server.
      offline: 'Offline — could not check',
      failed: 'Check failed',
      unsupported: 'Not the installed app',
    };
    checkForUpdate().then((outcome) => {
      value.textContent = said[outcome] ?? said.failed;
    });
  }

  root.addEventListener('click', (event) => {
    const tune = event.target.closest('[data-tune]');
    if (tune) return void chooseTune(tune.dataset.tune);

    const page = event.target.closest('[data-page]');
    if (page) return void openPage(page.dataset.page);

    // Switch rows are labels wrapping a checkbox; their clicks are handled by
    // the change listener below, and reading data-act here would fire twice.
    const act = event.target.closest('button[data-act]')?.dataset.act;
    if (act === 'close') return close();
    if (act === 'back') return back();
    if (act === 'update') return checkUpdate();
    if (act === 'reset-progress') return resetProgress();
  });

  root.addEventListener('change', (event) => {
    const act = event.target.dataset?.act;
    if (act === 'fps') return setShowFps(event.target.checked);
    if (act === 'music') return setMusicOn(event.target.checked);
  });

  /**
   * One level out: a page returns to the list, the list closes the screen.
   *
   * Closing outright from inside the recorder would lose somebody's place in a
   * list of a hundred and twenty clips, which is why this is not just close().
   */
  function back() {
    if (current) showList();
    else close();
  }

  function onKey(event) {
    // Never steal typing. The recorder has no text field, but a later page
    // might, and the gate before this screen certainly does.
    if (event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    back();
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    clearBody();
    stopAll();
    root.remove();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  showList();

  return close;
}
