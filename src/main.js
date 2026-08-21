/**
 * Measures the screen, then starts the app.
 *
 * ## Why the app is not simply imported at the top
 *
 * The games are laid out against a fixed design surface, and its width now
 * depends on the shape of the screen: a phone in landscape is 19.5:9 or 20:9,
 * and a 16:9 canvas fitted into one leaves a band of empty page down each side.
 * Filling the screen means telling `DESIGN` how wide it is.
 *
 * The catch is *when*. Two dozen layout constants across the scenes look like
 *
 *     const LANE = { left: RAIL_EDGE + 64, right: DESIGN.width - 110 };
 *
 * and are evaluated once, at the moment their module is imported. A static
 * `import './app.js'` at the top of this file would pull in all thirty scenes
 * before a single line here ran, and every one of those constants would be
 * frozen at 1280 whatever we set afterwards.
 *
 * So this file imports nothing but the theme, decides the size, and *then*
 * reaches for the app with a dynamic import. Everything downstream evaluates
 * against a width that is already correct, and not one of those constants had
 * to change.
 *
 * ## Landscape, whichever way the phone is held
 *
 * The viewport is measured in landscape terms — swapped when the window is
 * taller than it is wide — because the app turns itself sideways in that case
 * rather than sitting in a letterboxed strip. src/lib/turn.js does the turning;
 * this only has to agree with it about which way round the numbers go.
 */

import { setDesignSize } from './lib/theme.js';

/**
 * The screen, as the app will use it: always the long edge first.
 *
 * `visualViewport` where there is one, because on a phone the URL bar and the
 * on-screen keyboard change what is actually visible and `innerHeight` does not
 * always keep up.
 */
function landscapeViewport() {
  const view = window.visualViewport;
  const width = Math.round(view?.width ?? window.innerWidth) || 1280;
  const height = Math.round(view?.height ?? window.innerHeight) || 720;
  return width >= height ? { width, height } : { width: height, height: width };
}

setDesignSize(landscapeViewport());

await import('./app.js');
