/* How long he gets today. */

const KEY = 'urdu-games:allowance:v1';

/* How often the clock ticks, and the longest gap that still counts as use. */
const TICK_MS = 1000;
const MAX_TICK = 5000;

/* The minutes offered in Settings. */
export const LIMITS = [0, 10, 15, 20, 30, 45, 60];

/* Everyone who wants telling when the clock moves or the limit changes. */
const listeners = new Set();

/** A date as the device reckons it.
 * @param {Date} [now]
 */
export function dayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

const today = () => dayKey();

/** The state, with the day rolled over if it has changed.
 * @param {{limit: number, day: string, spent: number}} state
 * @param {string} day
 */
export function rollover(state, day) {
  return state.day === day ? state : { ...state, day, spent: 0 };
}

/** How much of a tick counts as time spent.
 * @param {{gap: number, paused: boolean, visible: boolean, limit: number}} at
 * @returns {number} milliseconds to add
 */
export function accrual({ gap, paused, visible, limit }) {
  if (paused) return 0; // a grown-up is in Settings
  if (!visible) return 0; // screen off, or another app
  if (gap > MAX_TICK) return 0; // asleep, and not told about it.
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

/* Rolls the day over if it has changed, and returns the state. */
function current() {
  const rolled = rollover(state, today());
  if (rolled !== state) {
    state = rolled;
    save();
  }
  return state;
}

/* Minutes allowed each day. */
export const limitMinutes = () => current().limit;

/** @param {number} minutes one of LIMITS */
export function setLimitMinutes(minutes) {
  if (!LIMITS.includes(minutes)) return;
  state = { ...current(), limit: minutes };
  save();
  announce();
}

/* How long he has been in the app today. */
export const spentMs = () => current().spent;

/* What is left, or Infinity when there is no limit. */
export function remainingMs() {
  const { limit, spent } = current();
  return limit ? Math.max(0, limit * 60000 - spent) : Infinity;
}

/* Whether today's time is used up. */
export const isUp = () => remainingMs() === 0;

/** Gives some time back.
 * @param {number} minutes
 */
export function grant(minutes) {
  state = { ...current(), spent: Math.max(0, current().spent - minutes * 60000) };
  save();
  announce();
}

/* Ends the day now, whatever is left of it. */
export function endToday() {
  const { limit } = current();
  if (!limit) return;
  state = { ...current(), spent: limit * 60000 };
  save();
  announce();
}

/* Today's minutes forgotten. */
export function forgetToday() {
  state = { ...current(), spent: 0 };
  save();
  announce();
}

/** Whether the time has just this moment gone.
 * @param {{day: string, remaining: number}} told what was last announced
 * @param {{day: string, remaining: number}} now
 */
export function ranOutNow(told, now) {
  if (now.remaining !== 0) return false;
  return !(told.remaining === 0 && told.day === now.day);
}

/* The last thing announce() said, for the edge above. */
let told = { day: '', remaining: Infinity };

/* Tells everybody the numbers moved, and fires `ranOut` on the edge. */
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

let timer = null;
let last = 0;
/* True while a grown-up has Settings open: that is not his time. */
let paused = false;

/* Stops the clock while the grown-ups screens are open. */
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
  // Written every tick rather than every minute.
  save();
  // Which fires `ranOut` if that was the last of it.
  announce();
}

/* Told once, at the moment the last minute goes. */
const ranOut = new Set();

/** @returns {() => void} unsubscribe */
export function onRanOut(listener) {
  ranOut.add(listener);
  return () => ranOut.delete(listener);
}

/* Starts counting. */
export function watchAllowance() {
  if (typeof window === 'undefined' || timer) return;
  last = Date.now();
  timer = setInterval(tick, TICK_MS);
  // Coming back from hidden restarts the measurement rather than banking the gap.
  document.addEventListener('visibilitychange', () => {
    last = Date.now();
  });
}
