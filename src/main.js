/* Measures the screen, then starts the app. */

import { setDesignSize } from './lib/theme.js';

/* The screen, as the app will use it: always the long edge first. */
function landscapeViewport() {
  const view = window.visualViewport;
  const width = Math.round(view?.width ?? window.innerWidth) || 1280;
  const height = Math.round(view?.height ?? window.innerHeight) || 720;
  return width >= height ? { width, height } : { width: height, height: width };
}

setDesignSize(landscapeViewport());

await import('./app.js');
