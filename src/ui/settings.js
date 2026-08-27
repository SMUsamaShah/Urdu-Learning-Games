/* The settings screen, behind the parental gate. */

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
import {
  LIMITS,
  forgetToday,
  limitMinutes,
  pauseAllowance,
  resumeAllowance,
  setLimitMinutes,
  spentMs,
} from '../lib/allowance.js';
import { glyphSvg } from './glyph-svg.js';
import { tileArtUrl } from '../lib/tiles.js';
import { stageElement } from '../lib/turn.js';
import { holdGameInput } from '../lib/game-input.js';
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
        ${group('Time', [
          pageRow('limit', 'Time each day', limitSummary()),
          // Only when there is a limit to spend. With no limit nothing is
          // counted at all, so the row would read "Nothing yet" for ever and
          // tapping it would undo nothing.
          ...(limitMinutes() ? [actionRow('forget-today', 'Today so far', spentSummary())] : []),
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

  /* How far the child has got, for the row above the reset. */
  function progressSummary() {
    const { level, step, steps } = progressState();
    const done = level === 1 ? '1 filled' : `${level} filled`;
    return `${done} · ${step} of ${steps} to the next`;
  }

  /* Wipes the total. */
  function resetProgress() {
    if (!window.confirm('Start again from nothing? This clears all progress on this device.')) {
      return;
    }
    resetProgressTotal();
    const row = bodyEl.querySelector('[data-role="progress-value"]');
    if (row) row.textContent = progressSummary();
  }

  /* Forget the record, without touching the running total. */
  function resetDoing() {
    if (!window.confirm('Forget what he has answered? The games go back to dealing every letter evenly.')) {
      return;
    }
    resetMastery();
    clearBody();
    bodyEl.append(doingPage());
    sfx.correct();
  }

  /* Back to the authored order, with every game switched on. */
  function resetGames() {
    if (!window.confirm('Put the games back in the order they came in, and switch them all on?')) {
      return;
    }
    resetMenu();
    clearBody();
    bodyEl.append(gamesPage());
    sfx.correct();
  }

  /* Puts today's used minutes back to nothing. */
  function forgetSoFar() {
    if (!limitMinutes()) return;
    if (!window.confirm("Forget the time he has used today?")) return;
    forgetToday();
    const row = bodyEl.querySelector('[data-role="forget-today-value"]');
    if (row) row.textContent = spentSummary();
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

  const PAGE_TITLES = {
    tune: 'Tune',
    indicator: 'Shown as',
    numbers: 'Numbers up to',
    doing: "How he's doing",
    games: 'Games',
    limit: 'Time each day',
    'pick-letter': 'Letters',
    'pick-word': 'Words',
    'pick-number': 'Numbers',
    check: 'Sound check',
    recordings: 'Your recordings',
    traces: 'Letter traces',
  };

  async function openPage(id) {
    // A page is a screen, so it gets its own history entry and the arrow out of it is the phone's back button.
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
    if (id === 'limit') return void bodyEl.append(limitPage());
    if (id.startsWith('pick-')) return void bodyEl.append(pickPage(id.slice(5)));
    if (id === 'check') return void openSoundCheck();

    if (id === 'recordings') {
      // Loaded here rather than with the rest.
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
      // Load the editor only when the tracing page opens.
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

  /* What stands in the rail down the left of every game. */
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

  /* `28 of 38` for the row on the list, or nothing when none is switched off. */
  function switchedSummary(kind, total) {
    const off = disabledCount(kind);
    return off ? `${total - off} of ${total}` : '';
  }

  /* The rows of one picking page, shown so the child's word is what is read. */
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

  /* Turn any one letter, word or number off. */
  /* The four things a letter can be, in the order a person cares about them. */
  const BANDS_DOING = [
    { id: 'missing', label: 'Missing it' },
    { id: 'getting-there', label: 'Getting there' },
    { id: 'solid', label: 'Solid' },
    { id: 'new', label: 'Not met yet' },
  ];

  /* `12 solid` for the menu row, or nothing at all before he has played. */
  function doingSummary() {
    const solid = letters.filter((item) => bandOf('letter', item.id) === 'solid').length;
    const met = letters.filter((item) => bandOf('letter', item.id) !== 'new').length;
    return met ? `${solid} of ${met} solid` : 'Nothing yet';
  }

  /* What the app has worked out about each letter, and what it does with it. */
  function doingPage() {
    const grouped = BANDS_DOING.map((band) => {
      const items = letters.filter((item) => bandOf('letter', item.id) === band.id);
      if (!items.length) return '';
      const chips = items
        .map((item) => {
          const glyph = glyphForClip({ kind: 'letter', id: item.id, form: 'isolated' });
          const history = historyOf('letter', item.id);
          // The record itself, in words, as the chip's title: five of the last six.
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

  const minutes = (ms) => Math.floor(ms / 60000);

  const limitSummary = () => (limitMinutes() ? `${limitMinutes()} minutes` : 'No limit');

  /* `12 of 20 min`, so the row says what is left as well as what is gone. */
  function spentSummary() {
    const used = minutes(spentMs());
    const limit = limitMinutes();
    if (!limit) return used ? `${used} min` : 'Nothing yet';
    return `${used} of ${limit} min`;
  }

  /* How long he gets in a day. */
  function limitPage() {
    return el(`
      <div class="set-list">
        <div class="set-card">
          ${LIMITS.map(
            (value) => `<button type="button" class="set-row" data-limit="${value}"
              aria-checked="${value === limitMinutes()}" role="radio">
              <span class="set-row-label">${value ? `${value} minutes` : 'No limit'}</span>
              <span class="set-row-tick" aria-hidden="true">✓</span>
            </button>`
          ).join('')}
        </div>
        <p class="set-note">
          Counted while he is actually in the app, and not while you are in
          here. When it runs out he is let to the end of whatever he is playing
          rather than cut off mid-round, and then the app says goodnight until
          tomorrow. You can hand back ten minutes from that screen without
          coming back to Settings.
        </p>
        <p class="set-note">
          Android's own App Timer cannot do this one. An installed web app draws
          through Chrome, so the phone counts the time against Chrome and a
          timer set on اردو کھیل never runs down.
        </p>
      </div>`);
  }

  /* `19 of 27 · 2 pages` for the menu row. */
  function gamesSummary() {
    const all = orderedGames();
    const on = all.filter((game) => isEnabled('game', game.scene)).length;
    const pages = Math.max(1, Math.ceil(on / PER_PAGE));
    return `${on} of ${all.length} · ${pages} page${pages === 1 ? '' : 's'}`;
  }

  /* Which games the menu shows, in what order. */
  function gamesPage() {
    const all = orderedGames();
    let onSoFar = 0;
    const rows = all
      .map((game, index) => {
        const on = isEnabled('game', game.scene);
        // The mark goes *before* the row that opens a page.
        const mark =
          on && onSoFar > 0 && onSoFar % PER_PAGE === 0
            ? `<div class="set-page-mark" data-mark>Page ${onSoFar / PER_PAGE + 1}</div>`
            : '';
        if (on) onSoFar++;
        // This is the same illustration the child recognises on the menu.
        const picture = tileArtUrl(game);
        const glyph = picture
          ? null
          : game.number
            ? glyphForClip({ kind: 'number', id: game.number })
            : game.icon
              ? glyphForClip({ kind: 'letter', id: game.icon.letter, form: game.icon.form })
              : null;
        return `${mark}<div class="set-row set-row-game${on ? '' : ' is-off'}"
            data-scene="${escapeHtml(game.scene)}" data-index="${index}">
          <span class="set-grip" data-grip aria-hidden="true" title="Drag to reorder">⠿</span>
          <span class="set-row-game-tile" aria-hidden="true"
            style="--game-color:#${game.color.toString(16).padStart(6, '0')}">${
            picture
              ? `<img src="${escapeHtml(picture)}" alt="" />`
              : glyph
                ? glyphSvg(glyph)
                : ''
          }</span>
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

  /* Drag a row by its handle to move it. */
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
          // Everything between the row's old place and its new one shuffles by exactly one slot.
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

  /* How far the counting goes. */
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

  /* The five pieces, as a list with a tick on the chosen one. */
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

  /* Switches the background tune. */
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
      // Offline is this app's normal state, so this has to be distinguishable from "checked, nothing new".
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

    const limit = event.target.closest('[data-limit]');
    if (limit) {
      setLimitMinutes(Number(limit.dataset.limit));
      clearBody();
      bodyEl.append(limitPage());
      sfx.tap();
      return;
    }

    const page = event.target.closest('[data-page]');
    if (page) return void openPage(page.dataset.page);

    // Switch rows are labels wrapping a checkbox.
    const act = event.target.closest('button[data-act]')?.dataset.act;
    // Both go through the history rather than closing anything themselves.
    if (act === 'close') return goBackTo('settings');
    if (act === 'back') return goBack();
    if (act === 'update') return checkUpdate();
    if (act === 'reset-progress') return resetProgress();
    if (act === 'reset-doing') return resetDoing();
    if (act === 'reset-games') return resetGames();
    if (act === 'forget-today') return forgetSoFar();
    if (act?.startsWith('all-')) {
      enableAll(act.slice(4));
      // Redrawn rather than each box ticked by hand.
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
      // The games list draws page marks from how many enabled rows come before each one.
      if (kind === 'game') {
        clearBody();
        bodyEl.append(gamesPage());
      }
      return;
    }

    const act = event.target.dataset?.act;
    if (act === 'fps') return setShowFps(event.target.checked);
    if (act === 'music') return setMusicOn(event.target.checked);
    // `change` fires when the drag ends, so this is the moment to let somebody hear what they picked.
    if (act === 'volume') return sfx.correct();
  });

  // Live while dragging, not only on release: the tune is playing underneath and the whole point is to hear it move.
  root.addEventListener('input', (event) => {
    if (event.target.dataset?.act === 'volume') setVolume(event.target.value / 100);
  });

  /* One level out: a page returns to the list, the list closes the screen. */
  function back() {
    goBack();
  }

  function onKey(event) {
    // Never steal typing.
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
    releaseInput();
    // His clock starts again on the way out.
    resumeAllowance();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  // Nothing in here is his time.
  pauseAllowance();
  const releaseInput = holdGameInput();
  // Into the stage, not the body, so Settings turns with the app.
  stageElement().appendChild(root);
  showList();

  return close;
}
