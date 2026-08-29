/* What the back button means. */

/* Open screens, innermost last. */
const stack = [];

/* Where the app is, for the checks and for anything that wants to know. */
export const screens = () => stack.map((entry) => entry.name);
export const depth = () => stack.length;

/* Unwinds to wherever the browser has landed. */
function onPop(event) {
  const target = Number(event.state?.depth ?? 0);
  while (stack.length > target) {
    stack.pop().onBack();
  }
}

/* Starts listening. */
export function initHistory() {
  if (typeof window === 'undefined') return;
  // The entry the app sits on at the menu.
  window.history.replaceState({ urdu: 'home', depth: 0 }, '');
  window.addEventListener('popstate', onPop);
}

/** Notes that a screen has opened.
 * @param {string} name for the checks and for reading a stack trace
 * @param {() => void} onBack closes it again.
 */
export function pushScreen(name, onBack) {
  stack.push({ name, onBack });
  window.history.pushState({ urdu: name, depth: stack.length }, '');
}

/* Swaps the open screen for another at the same depth. */
export function replaceScreen(name, onBack) {
  if (!stack.length) return pushScreen(name, onBack);
  stack[stack.length - 1] = { name, onBack };
  window.history.replaceState({ urdu: name, depth: stack.length }, '');
}

/* Removes a screen from the stack without navigating. */
export function dropScreen(name) {
  const at = stack.findLastIndex((entry) => entry.name === name);
  if (at >= 0) stack.splice(at, 1);
}

/* One step out. */
export function goBack() {
  window.history.back();
}

/* Several steps out at once. */
export function goBackTo(name) {
  const at = stack.findLastIndex((entry) => entry.name === name);
  if (at < 0) return;
  window.history.go(-(stack.length - at));
}
