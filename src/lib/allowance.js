/**
 * How long he gets today.
 *
 * ## Why the app counts its own minutes
 *
 * Android's App Timer cannot do it. Installed from Chrome this app is a WebAPK,
 * which gets its own icon, its own entry in the app drawer and its own row in
 * Digital Wellbeing — and renders in Chrome's process. Foreground time is
 * measured per process, so it all lands on Chrome: the timer set on اردو کھیل
 * never counts down, and setting one on Chrome instead spends the same budget
 * on every other thing the phone browses.
 *
 * So the limit lives here. It also works the same however the app was opened,
 * which the OS timer never would: from the home screen, from a tab, from a
 * bookmark on somebody else's phone.
 *
 * ## Off unless it is switched on
 *
 * `limitMinutes()` of 0 means no limit, and that is what a fresh device has.
 * Nothing about this app should start out restricting a child; it is a tool for
 * a parent who wants it.
 *
 * ## Counting real minutes, not game minutes
 *
 * Wall clock, from `Date.now()`, and only while the page is visible. Phaser's
 * clock is not the same thing — it pauses with the scene and runs at half speed
 * on a slow device, and a child would get twice the screen time on a cheap
 * phone.
 *
 * Two guards, and both are about a phone rather than about a browser:
 *
 *  - **Hidden means stopped.** Screen off, another app, a locked phone: the
 *    page goes hidden and nothing accrues.
 *  - **A tick that spans too long is not use.** If more than `MAX_TICK` passed
 *    between two ticks, the device was asleep and did not tell us — some
 *    Androids do not fire `visibilitychange` for a screen that switched off
 *    under a covered sensor. Charging a whole nap against him would be the one
 *    failure that is impossible to argue with, so a long gap counts as nothing.
 *
 * ## The day rolls over on its own
 *
 * The stored day is a local date string, checked on every read rather than on a
 * timer. A phone left running past midnight, or one that was off for a week,
 * lands on a fresh allowance the next time anybody asks — with no clock to
 * schedule and nothing to run while the app is closed.
 */

const KEY = 'urdu-games:allowance:v1';

/**
 * How often the clock ticks, and the longest gap that still counts as use.
 *
 * A second is fine: nothing here needs to be more precise than a second, and it
 * is cheap. `MAX_TICK` is deliberately several times that — a busy frame or a
 * throttled background timer can stretch a tick to a few seconds and that is
 * still somebody playing.
 */
const TICK_MS = 1000;
const MAX_TICK = 5000;

/** The minutes offered in Settings. 0 is off, and is the default. */
export const LIMITS = [0, 10, 15, 20, 30, 45, 60];

/** Everyone who wants telling when the clock moves or the limit changes. */
const listeners = new Set();

/**
 * A date as the device reckons it. Local, not UTC: bedtime is local.
 *
 * A child in Karachi playing at nine in the evening is on the 5th; UTC has
 * already turned him over to the 6th and would hand him a second allowance
 * every night at five past five.
 *
 * @param {Date} [now]
 */
export function dayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

const today = () => dayKey();

/**
 * The state, with the day rolled over if it has changed.
 *
 * Pure, and separate from `current()` below, because "a new day is a fresh
 * allowance" is the rule this file exists to keep and the only way to test it
 * otherwise would be to wait until midnight.
 *
 * @param {{limit: number, day: string, spent: number}} state
 * @param {string} day
 */
export function rollover(state, day) {
  return state.day === day ? state : { ...state, day, spent: 0 };
}

/**
 * How much of a tick counts as time spent. Pure, for the same reason.
 *
 * Every one of these returns nothing rather than something, and each is a way a
 * phone can charge a child for time he did not have:
 *
 * @param {{gap: number, paused: boolean, visible: boolean, limit: number}} at
 * @returns {number} milliseconds to add
 */
export function accrual({ gap, paused, visible, limit }) {
  if (paused) return 0; // a grown-up is in Settings
  if (!visible) return 0; // screen off, or another app
  if (gap > MAX_TICK) return 0; // asleep, and not told about it. See MAX_TICK.
  if (!limit) return 0; // no limit set, so nothing to spend
  return Math.max(0, gap);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      limit: Number.isFinite(saved.limit) ? saved.limit : 0,
      day: typeof saved.day === 'string' ? saved.day : today(),
      spent: Number.isFinite(saved.spent) && saved.spent >= 0 ? saved.spent : 0,
    };
  } catch {
    return { limit: 0, day: today(), spent: 0 };
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing; the limit holds for this session and not tomorrow */
  }
}

/**
 * Rolls the day over if it has changed, and returns the state.
 *
 * Every read goes through this. A `setTimeout` scheduled for midnight would not
 * survive the app being closed, which is most of the time.
 */
function current() {
  const rolled = rollover(state, today());
  if (rolled !== state) {
    state = rolled;
    save();
  }
  return state;
}

/** Minutes allowed each day. 0 means no limit at all. */
export const limitMinutes = () => current().limit;

/** @param {number} minutes one of LIMITS */
export function setLimitMinutes(minutes) {
  if (!LIMITS.includes(minutes)) return;
  state = { ...current(), limit: minutes };
  save();
  announce();
}

/** How long he has been in the app today. */
export const spentMs = () => current().spent;

/** What is left, or Infinity when there is no limit. */
export function remainingMs() {
  const { limit, spent } = current();
  return limit ? Math.max(0, limit * 60000 - spent) : Infinity;
}

/** Whether today's time is used up. Always false when there is no limit. */
export const isUp = () => remainingMs() === 0;

/**
 * Gives some time back.
 *
 * Takes it off what has been spent rather than adding to the limit, so it is a
 * one-off for today and tomorrow starts from the number the parent chose. The
 * alternative — raising the limit — is a setting somebody would have to
 * remember to put back.
 *
 * @param {number} minutes
 */
export function grant(minutes) {
  state = { ...current(), spent: Math.max(0, current().spent - minutes * 60000) };
  save();
  announce();
}

/** Ends the day now, whatever is left of it. */
export function endToday() {
  const { limit } = current();
  if (!limit) return;
  state = { ...current(), spent: limit * 60000 };
  save();
  announce();
}

/** Today's minutes forgotten. Offered next to the other resets in Settings. */
export function forgetToday() {
  state = { ...current(), spent: 0 };
  save();
  announce();
}

/**
 * Whether the time has just this moment gone.
 *
 * Pure, and it takes the day as well as what is left, which is the whole reason
 * it is a function rather than a boolean. Two things have to be true at once:
 *
 *  - **Running out is an edge.** Still being out of time a minute later is not
 *    running out again, or the screen would be raised over and over.
 *  - **Midnight arms it again.** An app left open across midnight rolls over to
 *    a fresh allowance, and when *that* one goes it is a new edge — even though
 *    the last thing this said was "out of time".
 *
 * @param {{day: string, remaining: number}} told what was last announced
 * @param {{day: string, remaining: number}} now
 */
export function ranOutNow(told, now) {
  if (now.remaining !== 0) return false;
  return !(told.remaining === 0 && told.day === now.day);
}

/** The last thing announce() said, for the edge above. */
let told = { day: '', remaining: Infinity };

/**
 * Tells everybody the numbers moved, and fires `ranOut` on the edge.
 *
 * The edge is detected here rather than in the clock, because the clock is not
 * the only thing that can spend the last minute. A parent lowering the limit in
 * Settings past what he has already played, or choosing "leave today finished"
 * at the door, runs the allowance out just as truly as a second going by — and
 * when this lived in `tick()` neither of them raised the screen at all. Every
 * write goes through here, so there is one place to get it right.
 */
function announce() {
  const now = { day: current().day, spent: spentMs(), remaining: remainingMs() };
  for (const listener of listeners) listener({ spent: now.spent, remaining: now.remaining });
  const fresh = ranOutNow(told, now);
  told = now;
  if (fresh) for (const listener of ranOut) listener();
}

/**
 * @param {(state: {spent: number, remaining: number}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onAllowance(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --------------------------------------------------------------- the clock

let timer = null;
let last = 0;
/** True while a grown-up has Settings open: that is not his time. */
let paused = false;

/**
 * Stops the clock while the grown-ups screens are open.
 *
 * A parent reading Settings, recording a word or fixing a stroke path can be in
 * there for ten minutes, and charging that to a three-year-old's allowance
 * would mean the limit ran out because somebody else used the app.
 */
export function pauseAllowance() {
  paused = true;
  last = Date.now();
}

export function resumeAllowance() {
  paused = false;
  last = Date.now();
}

function tick() {
  const now = Date.now();
  const gap = now - last;
  last = now;

  const add = accrual({
    gap,
    paused,
    visible: document.visibilityState === 'visible',
    limit: current().limit,
  });
  if (!add) return;

  state = { ...current(), spent: current().spent + add };
  // Written every tick rather than every minute: a phone killed by the OS mid
  // session must not hand back the minutes it already used. localStorage writes
  // are cheap and this is once a second.
  save();
  // Which fires `ranOut` if that was the last of it. See announce().
  announce();
}

/** Told once, at the moment the last minute goes. */
const ranOut = new Set();

/** @returns {() => void} unsubscribe */
export function onRanOut(listener) {
  ranOut.add(listener);
  return () => ranOut.delete(listener);
}

/** Starts counting. Called once at startup. */
export function watchAllowance() {
  if (typeof window === 'undefined' || timer) return;
  last = Date.now();
  timer = setInterval(tick, TICK_MS);
  // Coming back from hidden restarts the measurement rather than banking the
  // gap: `last` is stale by however long the phone was away.
  document.addEventListener('visibilitychange', () => {
    last = Date.now();
  });
}
