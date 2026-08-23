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
import { setVolume, volume } from '../lib/volume.js';
import { goBack, goBackTo, pushScreen } from '../lib/history.js';
import * as sfx from '../lib/sfx.js';
import { summaries } from '../lib/clip-store.js';
import { expectedClips } from '../lib/clip-list.js';
import { glyphForClip, letters, numbers, words } from '../lib/content.js';
import { bandOf, historyOf, reset as resetMastery } from '../lib/mastery.js';
import { PER_PAGE, move as moveGame, orderedGames, resetMenu } from '../lib/menu.js';
import { glyphSvg } from './glyph-svg.js';
import { stageElement } from '../lib/turn.js';
import {
  disabledCount,
  enableAll,
  isEnabled,
  numberBand,
  setEnabled,
  setNumberBand,
  BANDS,
} from '../lib/enabled.js';
import { guidedLetters, strokesMatchFont } from '../lib/strokes.js';
import { reset as resetProgressTotal, state as progressState } from '../lib/progress.js';
import {
  currentIndicator,
  indicatorNames,
  setIndicator,
} from '../lib/indicators/index.js';

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

  /**
   * `label ————— [———o———]`
   *
   * The one control here that is worth dragging rather than tapping, so it gets
   * a real range input rather than a list of three loudnesses.
   */
  const sliderRow = (act, label, value) => `
    <label class="set-row set-row-slider">
      <span class="set-row-label">${escapeHtml(label)}</span>
      <input type="range" class="set-slider" data-act="${act}"
        min="0" max="100" step="1" value="${Math.round(value * 100)}"
        aria-label="${escapeHtml(label)}" />
    </label>`;

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
          sliderRow('volume', 'Volume', volume()),
          switchRow('music', 'Background music', musicOn()),
          pageRow('tune', 'Tune', tuneName(currentTune())),
          pageRow('check', 'Sound check'),
        ])}
        ${group('Voice', [pageRow('recordings', 'Your recordings', '…')])}
        ${group('Writing', [pageRow('traces', 'Letter traces', traceSummary())])}
        ${group('Content', [
          pageRow('games', 'Games', gamesSummary()),
          pageRow('numbers', 'Numbers up to', String(numberBand())),
          pageRow('pick-letter', 'Letters', switchedSummary('letter', letters.length)),
          pageRow('pick-word', 'Words', switchedSummary('word', words.length)),
          pageRow('pick-number', 'Numbers', switchedSummary('number', numbers.length)),
        ])}
        ${group('Progress', [
          pageRow('doing', "How he's doing", doingSummary()),
          pageRow('indicator', 'Shown as', indicatorName(currentIndicator())),
          actionRow('progress', 'How far', progressSummary()),
          actionRow('reset-progress', 'Start again from nothing'),
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

  /**
   * How many letters a child can be guided through, out of the alphabet.
   *
   * Synchronous, unlike the recordings count: the device's corrections were
   * loaded at startup, so this is already in memory.
   */
  function traceSummary() {
    if (!strokesMatchFont()) return 'Unavailable';
    return `${guidedLetters().length} of ${letters.length}`;
  }

  /**
   * How far the child has got, for the row above the reset.
   *
   * Worded without naming a tree, a glass or a bar: which of those is on screen
   * is the row above this one, and a summary that contradicts it is worse than
   * one that is slightly abstract.
   */
  function progressSummary() {
    const { level, step, steps } = progressState();
    const done = level === 1 ? '1 filled' : `${level} filled`;
    return `${done} · ${step} of ${steps} to the next`;
  }

  /**
   * Wipes the total.
   *
   * Confirmed first, and worded as what it does rather than as "are you sure".
   * This is the only destructive thing on the screen and the only one a parent
   * could plausibly hit by accident while looking for the tune.
   */
  function resetProgress() {
    if (!window.confirm('Start again from nothing? This clears all progress on this device.')) {
      return;
    }
    resetProgressTotal();
    const row = bodyEl.querySelector('[data-role="progress-value"]');
    if (row) row.textContent = progressSummary();
  }

  /**
   * Forget the record, without touching the running total.
   *
   * Two separate things and two separate resets on purpose. "He has watered the
   * plant this far" and "these are the letters he finds hard" are not the same
   * fact, and a second child on the same tablet usually wants the second one
   * gone and not necessarily the first.
   */
  function resetDoing() {
    if (!window.confirm('Forget what he has answered? The games go back to dealing every letter evenly.')) {
      return;
    }
    resetMastery();
    clearBody();
    bodyEl.append(doingPage());
    sfx.correct();
  }

  /** Back to the authored order, with every game switched on. */
  function resetGames() {
    if (!window.confirm('Put the games back in the order they came in, and switch them all on?')) {
      return;
    }
    resetMenu();
    clearBody();
    bodyEl.append(gamesPage());
    sfx.correct();
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
    indicator: 'Shown as',
    numbers: 'Numbers up to',
    doing: "How he's doing",
    games: 'Games',
    'pick-letter': 'Letters',
    'pick-word': 'Words',
    'pick-number': 'Numbers',
    check: 'Sound check',
    recordings: 'Your recordings',
    traces: 'Letter traces',
  };

  async function openPage(id) {
    // A page is a screen, so it gets its own history entry and the arrow out of
    // it is the phone's back button. See src/lib/history.js.
    pushScreen(`settings:${id}`, () => showList());
    clearBody();
    current = id;
    titleEl.textContent = PAGE_TITLES[id] ?? 'Settings';
    backEl.setAttribute('aria-label', 'Back');

    if (id === 'tune') return void bodyEl.append(tunePage());
    if (id === 'indicator') return void bodyEl.append(indicatorPage());
    if (id === 'numbers') return void bodyEl.append(numbersPage());
    if (id === 'doing') return void bodyEl.append(doingPage());
    if (id === 'games') return void bodyEl.append(gamesPage());
    if (id.startsWith('pick-')) return void bodyEl.append(pickPage(id.slice(5)));
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
      return;
    }

    if (id === 'traces') {
      // Same reasoning as the recorder: an SVG editor and its stylesheet are
      // not something somebody who came to change the tune should download.
      const holder = el('<div class="set-page set-loading">Loading…</div>');
      bodyEl.append(holder);
      const { buildTracesPage } = await import('./traces.js');
      if (closed || current !== id) return;
      const built = buildTracesPage();
      disposePage = built.dispose;
      holder.replaceWith(built.el);
    }
  }

  const indicatorName = (id) =>
    indicatorNames().find((i) => i.id === id)?.name ?? id;

  /**
   * What stands in the rail down the left of every game.
   *
   * A list, like the tunes, and for the same reason: it is a thing to look at
   * rather than a setting to get right, and the difference between them is the
   * whole point of offering more than one.
   */
  function indicatorPage() {
    return el(`
      <div class="set-list">
        <div class="set-card">
          ${indicatorNames()
            .map(
              ({ id, name }) => `<button type="button" class="set-row" data-indicator="${id}"
                aria-checked="${id === currentIndicator()}" role="radio">
                <span class="set-row-label">${escapeHtml(name)}</span>
                <span class="set-row-tick" aria-hidden="true">✓</span>
              </button>`
            )
            .join('')}
        </div>
        <p class="set-note">
          The strip down the left of every game. It shows the same total
          whichever one is chosen; a change takes effect on the next screen.
        </p>
      </div>`);
  }

  /**
   * `28 of 38` for the row on the list, or nothing when none is switched off.
   *
   * Silent by default on purpose: a row saying "38 of 38" on every fresh device
   * invites a parent to go and look at a page where there is nothing to do.
   */
  function switchedSummary(kind, total) {
    const off = disabledCount(kind);
    return off ? `${total - off} of ${total}` : '';
  }

  /** The rows of one picking page, shown so the child's word is what is read. */
  const PICK = {
    letter: {
      items: () => letters,
      glyph: (item) => glyphForClip({ kind: 'letter', id: item.id, form: 'isolated' }),
      sub: (item) => item.roman,
    },
    word: {
      items: () => words,
      glyph: (item) => glyphForClip({ kind: 'word', id: item.id }),
      sub: (item) => item.gloss,
    },
    number: {
      items: () => numbers,
      glyph: (item) => glyphForClip({ kind: 'number', id: item.id }),
      sub: (item) => item.roman,
    },
  };

  /**
   * Turn any one letter, word or number off.
   *
   * The whole list every time, not the active one: this is the page where you
   * put something back, so hiding what is off would make that impossible. The
   * band on the numbers page is a separate control and this page ignores it —
   * a number switched off individually stays off if the band later widens.
   *
   * Each row shows the thing itself rather than its name. A parent picking
   * letters for the week is looking for ب, and `letterGlyph` draws exactly what
   * the games draw, so there is no chance of the list and the game disagreeing.
   */
  /**
   * The four things a letter can be, in the order a person cares about them.
   *
   * Deliberately about the letters and not about him. "ٹ, missing it" is a note
   * on a letter; "he is bad at ٹ" is a report card on a three-year-old, and
   * nobody needs one of those written about them at three.
   */
  const BANDS_DOING = [
    { id: 'missing', label: 'Missing it' },
    { id: 'getting-there', label: 'Getting there' },
    { id: 'solid', label: 'Solid' },
    { id: 'new', label: 'Not met yet' },
  ];

  /** `12 solid` for the menu row, or nothing at all before he has played. */
  function doingSummary() {
    const solid = letters.filter((item) => bandOf('letter', item.id) === 'solid').length;
    const met = letters.filter((item) => bandOf('letter', item.id) !== 'new').length;
    return met ? `${solid} of ${met} solid` : 'Nothing yet';
  }

  /**
   * What the app has worked out about each letter, and what it does with it.
   *
   * The weighting is otherwise invisible: games quietly deal a struggling
   * letter about four times as often as a mastered one and nothing on any
   * screen says so. This is the page that makes it legible, and it is the page
   * that answers the only question a parent actually has, which is what to
   * practise away from the tablet.
   *
   * Letters only. Numbers and words are weighted the same way and are recorded
   * the same way, but a wall of a hundred numerals is not something anybody
   * reads, and the alphabet is what this app is for.
   */
  function doingPage() {
    const grouped = BANDS_DOING.map((band) => {
      const items = letters.filter((item) => bandOf('letter', item.id) === band.id);
      if (!items.length) return '';
      const chips = items
        .map((item) => {
          const glyph = glyphForClip({ kind: 'letter', id: item.id, form: 'isolated' });
          const history = historyOf('letter', item.id);
          // The record itself, in words, as the chip's title: five of the last
          // six. It is the one number that explains the shading, and burying it
          // in a tooltip keeps the page a picture rather than a spreadsheet.
          const right = [...history].filter((mark) => mark === '1').length;
          const detail = history.length
            ? `${item.roman}: ${right} of the last ${history.length} right`
            : `${item.roman}: not answered yet`;
          return `<span class="set-chip set-chip-${band.id}" title="${escapeHtml(detail)}">
            <span class="set-chip-glyph" aria-hidden="true">${glyph ? glyphSvg(glyph) : ''}</span>
            <span class="set-chip-name">${escapeHtml(item.roman)}</span>
          </span>`;
        })
        .join('');
      return `<div class="set-card set-card-band">
        <h3 class="set-band-title">${escapeHtml(band.label)} <span class="set-band-count">${items.length}</span></h3>
        <div class="set-chips">${chips}</div>
      </div>`;
    }).join('');

    return el(`
      <div class="set-list">
        ${grouped}
        <div class="set-card">
          ${actionRow('reset-doing', 'Forget what he has answered')}
        </div>
        <p class="set-note">
          Every game deals the letters in "missing it" about four times as often
          as the ones in "solid", so the practice goes where it is needed without
          anything being taken away — every letter still comes round. Only the
          last ten answers per letter count, so a letter he has since got the
          hang of drops back on its own.
        </p>
      </div>`);
  }

  /** `19 of 27 · 2 pages` for the menu row. */
  function gamesSummary() {
    const all = orderedGames();
    const on = all.filter((game) => isEnabled('game', game.scene)).length;
    const pages = Math.max(1, Math.ceil(on / PER_PAGE));
    return `${on} of ${all.length} · ${pages} page${pages === 1 ? '' : 's'}`;
  }

  /**
   * Which games the menu shows, in what order.
   *
   * The two halves of one question, so they are one list rather than two pages:
   * a switch decides whether a game exists at all, and where it sits in the
   * list decides which page of the menu it lands on. Splitting them would mean
   * ordering a list without being able to see what was switched off in it.
   *
   * Re-rendered wholesale after any change. The page marks depend on how many
   * *enabled* rows precede them, so flipping one switch a third of the way down
   * moves every mark below it — patching that by hand would be more code than
   * drawing the list again, and this list is twenty-seven rows.
   */
  function gamesPage() {
    const all = orderedGames();
    let onSoFar = 0;
    const rows = all
      .map((game, index) => {
        const on = isEnabled('game', game.scene);
        // The mark goes *before* the row that opens a page, and is counted off
        // the enabled rows only: a switched-off game takes up no room on the
        // menu, so it must take up none in this counting either.
        const mark =
          on && onSoFar > 0 && onSoFar % PER_PAGE === 0
            ? `<div class="set-page-mark" data-mark>Page ${onSoFar / PER_PAGE + 1}</div>`
            : '';
        if (on) onSoFar++;
        // A game carries either a letter or a numeral, the way the menu tiles
        // do — Numbers is the one with a numeral, and without this branch its
        // row is the only one in the list with a hole where its mark should be.
        const glyph = game.number
          ? glyphForClip({ kind: 'number', id: game.number })
          : game.icon
            ? glyphForClip({ kind: 'letter', id: game.icon.letter, form: game.icon.form })
            : null;
        return `${mark}<div class="set-row set-row-game${on ? '' : ' is-off'}"
            data-scene="${escapeHtml(game.scene)}" data-index="${index}">
          <span class="set-grip" data-grip aria-hidden="true" title="Drag to reorder">⠿</span>
          <span class="set-row-glyph" aria-hidden="true">${glyph ? glyphSvg(glyph) : ''}</span>
          <span class="set-row-label">${escapeHtml(game.roman)}</span>
          <input type="checkbox" class="set-switch" data-pick="game:${escapeHtml(game.scene)}"
            ${on ? 'checked' : ''} aria-label="${escapeHtml(game.roman)}" />
        </div>`;
      })
      .join('');

    const list = el(`
      <div class="set-list">
        <div class="set-card set-card-games">${rows}</div>
        <div class="set-card">
          ${actionRow('reset-games', 'Back to the order they came in')}
        </div>
        <p class="set-note">
          The menu shows ${PER_PAGE} at a time and swipes sideways for the rest,
          so the first ${PER_PAGE} here are what he sees when he opens the app.
          Drag by the handle to move one. A game switched off appears nowhere —
          not on the menu, and not in a چلو run.
        </p>
      </div>`);

    attachReorder(list.querySelector('.set-card-games'));
    return list;
  }

  /**
   * Drag a row by its handle to move it.
   *
   * Pointer events rather than HTML5 drag-and-drop, which does not fire on
   * touch at all — this page is read on a phone more often than anywhere else.
   *
   * The rows slide out of the way live so the gap under the finger is where the
   * row will land. The page marks are hidden for the duration instead: they
   * belong to positions rather than to rows, so a mark that stayed put while
   * rows moved through it would be pointing at the wrong place, and one that
   * moved with a row would be lying about which page that row is on. They are
   * drawn again, correctly, when the list re-renders on drop.
   */
  function attachReorder(card) {
    card.addEventListener('pointerdown', (event) => {
      const grip = event.target.closest('[data-grip]');
      if (!grip) return;
      const row = grip.closest('[data-scene]');
      if (!row) return;

      const rows = [...card.querySelectorAll('[data-scene]')];
      const marks = [...card.querySelectorAll('[data-mark]')];
      const from = rows.indexOf(row);
      const step = row.offsetHeight;
      const startY = event.clientY;
      let to = from;

      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      row.classList.add('is-dragging');
      for (const mark of marks) mark.style.visibility = 'hidden';

      const onMove = (move) => {
        const dy = move.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
        rows.forEach((other, index) => {
          if (other === row) return;
          // Everything between the row's old place and its new one shuffles by
          // exactly one slot, in whichever direction closes the gap.
          const shift =
            index > from && index <= to ? -step : index < from && index >= to ? step : 0;
          other.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };

      const onUp = () => {
        grip.releasePointerCapture(event.pointerId);
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerup', onUp);
        card.removeEventListener('pointercancel', onUp);
        for (const each of rows) each.style.transform = '';
        row.classList.remove('is-dragging');
        for (const mark of marks) mark.style.visibility = '';
        if (to === from) return;
        moveGame(row.dataset.scene, to);
        sfx.tap();
        clearBody();
        bodyEl.append(gamesPage());
      };

      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerup', onUp);
      card.addEventListener('pointercancel', onUp);
    });
  }

  function pickPage(kind) {
    const spec = PICK[kind];
    const rows = spec
      .items()
      .map((item) => {
        const glyph = spec.glyph(item);
        return `<label class="set-row set-row-pick">
          <span class="set-row-glyph" aria-hidden="true">${glyph ? glyphSvg(glyph) : ''}</span>
          <span class="set-row-label">${escapeHtml(spec.sub(item) ?? item.id)}</span>
          <input type="checkbox" class="set-switch" data-pick="${kind}:${item.id}"
            ${isEnabled(kind, item.id) ? 'checked' : ''}
            aria-label="${escapeHtml(spec.sub(item) ?? item.id)}" />
        </label>`;
      })
      .join('');

    return el(`
      <div class="set-list">
        <div class="set-card">${rows}</div>
        <div class="set-card">
          ${actionRow(`all-${kind}`, 'Turn them all back on')}
        </div>
        <p class="set-note">
          Anything switched off appears nowhere — not as an answer, not as a
          wrong answer, and not inside a sequence a game builds for itself. If
          fewer than three are left on, the games use all of them again rather
          than deal a round that cannot be played.
        </p>
      </div>`);
  }

  /**
   * How far the counting goes.
   *
   * `content/numbers.json` holds 0–100 plus a thousand and a lakh. All of it at
   * once is not a harder version of the same app, it is a different one: ۹۹
   * turning up in a three-year-old's matching game teaches nothing and is
   * mostly frightening. Ten is the default and is what the app did before the
   * rest of the numbers existed.
   */
  function numbersPage() {
    return el(`
      <div class="set-list">
        <div class="set-card">
          ${BANDS.map(
            (band) => `<button type="button" class="set-row" data-band="${band}"
              aria-checked="${band === numberBand()}" role="radio">
              <span class="set-row-label">${band}</span>
              <span class="set-row-tick" aria-hidden="true">✓</span>
            </button>`
          ).join('')}
        </div>
        <p class="set-note">
          Every number to a hundred has its own name in Urdu — ۴۷ is سینتالیس,
          not "four ten seven" — so this decides how many names a child is meeting
          as well as how high the counting goes. A thousand and a lakh come in
          with the hundred.
        </p>
      </div>`);
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

    const pick = event.target.closest('[data-indicator]');
    if (pick) {
      setIndicator(pick.dataset.indicator);
      for (const row of root.querySelectorAll('[data-indicator]')) {
        row.setAttribute(
          'aria-checked',
          String(row.dataset.indicator === currentIndicator())
        );
      }
      sfx.tap();
      return;
    }

    const band = event.target.closest('[data-band]');
    // (the picking switches are checkboxes; see the change listener below)
    if (band) {
      setNumberBand(Number(band.dataset.band));
      for (const row of root.querySelectorAll('[data-band]')) {
        row.setAttribute('aria-checked', String(Number(row.dataset.band) === numberBand()));
      }
      sfx.tap();
      return;
    }

    const page = event.target.closest('[data-page]');
    if (page) return void openPage(page.dataset.page);

    // Switch rows are labels wrapping a checkbox; their clicks are handled by
    // the change listener below, and reading data-act here would fire twice.
    const act = event.target.closest('button[data-act]')?.dataset.act;
    // Both go through the history rather than closing anything themselves: the
    // × shuts the whole screen from whatever depth it is at, the arrow steps
    // out one, and the phone's back button does the same as the arrow because
    // it is the same path.
    if (act === 'close') return goBackTo('settings');
    if (act === 'back') return goBack();
    if (act === 'update') return checkUpdate();
    if (act === 'reset-progress') return resetProgress();
    if (act === 'reset-doing') return resetDoing();
    if (act === 'reset-games') return resetGames();
    if (act?.startsWith('all-')) {
      enableAll(act.slice(4));
      // Redrawn rather than each box ticked by hand: the page is a list of up
      // to a hundred and three switches and rebuilding it is one line.
      clearBody();
      bodyEl.append(pickPage(act.slice(4)));
      sfx.correct();
      return;
    }
  });

  root.addEventListener('change', (event) => {
    const pick = event.target.dataset?.pick;
    if (pick) {
      const [kind, id] = pick.split(':');
      setEnabled(kind, id, event.target.checked);
      sfx.tap();
      // The games list draws page marks from how many enabled rows come before
      // each one, so one switch moves every mark below it. Cheaper to draw the
      // twenty-seven rows again than to work out which marks moved.
      if (kind === 'game') {
        clearBody();
        bodyEl.append(gamesPage());
      }
      return;
    }

    const act = event.target.dataset?.act;
    if (act === 'fps') return setShowFps(event.target.checked);
    if (act === 'music') return setMusicOn(event.target.checked);
    // `change` fires when the drag ends, so this is the moment to let somebody
    // hear what they picked. A level you can only judge by looking at a slider
    // is one you have to guess at.
    if (act === 'volume') return sfx.correct();
  });

  // Live while dragging, not only on release: the tune is playing underneath
  // and the whole point is to hear it move.
  root.addEventListener('input', (event) => {
    if (event.target.dataset?.act === 'volume') setVolume(event.target.value / 100);
  });

  /**
   * One level out: a page returns to the list, the list closes the screen.
   *
   * Closing outright from inside the recorder would lose somebody's place in a
   * list of a hundred and twenty clips, which is why this is not just close().
   */
  function back() {
    goBack();
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
  // Into the stage, not the body, so Settings turns with the app. See
  // src/lib/turn.js.
  stageElement().appendChild(root);
  showList();

  return close;
}
