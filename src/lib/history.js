/**
 * What the back button means.
 *
 * On a phone the hardware back button is the way out of anything, and until
 * this existed it was the way out of *the app*: nothing here touched the
 * History API, so the browser had one entry and back always meant "leave the
 * page". Pressing it inside a game dropped a child out of the app entirely.
 *
 * ## One entry per open screen
 *
 * Every screen the app can be in pushes a history entry as it opens and carries
 * the action that closes it again. Back pops the top one and runs it; when
 * there is nothing left the event is left alone and the browser leaves the app,
 * which is what back at the menu should do.
 *
 * ## And the app's own back controls go through here too
 *
 * The ⌂ in the corner of every game, the games panel's close, the gate's
 * Cancel, the arrow on the settings screen — none of them navigate. They call
 * `goBack()`, the browser fires `popstate`, and the handler below does the
 * work.
 *
 * That is the whole trick. It would be easy to have each button do its own
 * closing and *also* keep the history in step, and that is two implementations
 * of one idea which drift apart the first time somebody adds a screen: the
 * button works, the hardware key does something subtly different, and the stack
 * ends up out of step with the browser's. Routing both through one place makes
 * that impossible rather than unlikely.
 */

/**
 * Open screens, innermost last. Each is `{name, onBack}`.
 *
 * Kept alongside the browser's history rather than inside it, because the state
 * that closes a screen is a function and `history.state` only holds data.
 */
const stack = [];

/** Where the app is, for the checks and for anything that wants to know. */
export const screens = () => stack.map((entry) => entry.name);
export const depth = () => stack.length;

/**
 * Unwinds to wherever the browser has landed.
 *
 * Driven by a depth recorded in `history.state` rather than by counting pops,
 * because **`history.go(-2)` fires one `popstate`, not two**. Counting would
 * leave a screen on the stack that the browser has already left behind, and the
 * next back would close the wrong thing. Reading the depth off the entry that
 * was landed on is right for a step of any size, including a jump forwards.
 *
 * A state with no depth — a foreign entry, or one from before a reload — reads
 * as zero, which closes everything and leaves the app at the menu. That is the
 * safe direction to be wrong in.
 */
function onPop(event) {
  const target = Number(event.state?.depth ?? 0);
  while (stack.length > target) {
    stack.pop().onBack();
  }
}

/** Starts listening. Called once at startup. */
export function initHistory() {
  if (typeof window === 'undefined') return;
  // The entry the app sits on at the menu. Replaced rather than pushed, so back
  // from the menu still leaves the app.
  window.history.replaceState({ urdu: 'home', depth: 0 }, '');
  window.addEventListener('popstate', onPop);
}

/**
 * Notes that a screen has opened.
 *
 * @param {string} name for the checks and for reading a stack trace
 * @param {() => void} onBack closes it again. Called by the back button; the
 *   screen's own close control should call `goBack()` rather than this.
 */
export function pushScreen(name, onBack) {
  stack.push({ name, onBack });
  window.history.pushState({ urdu: name, depth: stack.length }, '');
}

/**
 * Swaps the open screen for another at the same depth.
 *
 * For picking a game out of the games panel, which closes the panel and opens a
 * game in one gesture. Pushing would leave the panel in the history, so back
 * from the game would reopen the panel rather than going to the menu — not
 * where the child was.
 */
export function replaceScreen(name, onBack) {
  if (!stack.length) return pushScreen(name, onBack);
  stack[stack.length - 1] = { name, onBack };
  window.history.replaceState({ urdu: name, depth: stack.length }, '');
}

/**
 * Removes a screen from the stack without navigating.
 *
 * Only for a screen that has gone away on its own — a scene torn down by
 * something other than a back gesture. A close control wants `goBack()`.
 */
export function dropScreen(name) {
  const at = stack.findLastIndex((entry) => entry.name === name);
  if (at >= 0) stack.splice(at, 1);
}

/** One step out. What every close control in the app calls. */
export function goBack() {
  window.history.back();
}

/**
 * Several steps out at once, for a control that closes more than it opened —
 * the × on the settings screen, which shuts the whole thing from inside a page.
 */
export function goBackTo(name) {
  const at = stack.findLastIndex((entry) => entry.name === name);
  if (at < 0) return;
  window.history.go(-(stack.length - at));
}
